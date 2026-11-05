 // Game (C) service — launch the real OpenBachelorC PC flow against the installed
// Arknights PC client as a detached daemon. Trainer commands travel through a
// command file (services/c-bridge.py tails it); the child's stdout/stderr are
// daemon-piped straight into its log file (append fd owned by the child), so
// logging and the trainer keep working across ui-server restarts.
// pid/dir/gamePath/logFile persist in data/services.json for cross-process status/stop.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readComponent } from "../core/store.js";
import { dirs } from "../core/paths.js";
import { componentVenv } from "../core/installer.js";
import { readSettings } from "../core/settings.js";
import { append } from "./log-store.js";
import { killTree, processAlive } from "./process-util.js";
import { recordWrite, recordRead, recordClear, pidAlive } from "./service-state.js";
import { launchDetached } from "./spawner.js";
import { tailFile, stopTails } from "./log-tailer.js";
import { serverStatus } from "./server-service.js";

const KIND = "game";
let gameChild = null; // in-memory handle for the trainer stdin (same process only)

export function isGameRunning() {
  // in-memory handle first (cheap), then the persisted record so a detached
  // daemon that outlived an ui-server restart still counts as running
  if (gameChild && processAlive(gameChild)) return true;
  const rec = recordRead(KIND);
  return !!(rec && pidAlive(rec.pid));
}

/** Precondition check before launching — either {ready:true} or {ready:false, reason, detail}. */
export function preflight() {
  const settings = readSettings();
  const gamePath = (settings.GamePath || "").trim();
  if (!gamePath) return { ready: false, reason: "no-game-path", detail: "GamePath (Arknights.exe) not set in Settings" };
  const rec = readComponent("C");
  if (!rec?.activeDir) return { ready: false, reason: "no-active", detail: "C has no active install" };
  const exeTxt = path.join(rec.activeDir, "ak_exe_filepath.txt");
  if (!fs.existsSync(exeTxt)) {
    return {
      ready: false,
      reason: "pc-setup-not-applied",
      detail: "Run pc-setup first (hgdownloadsdk.dll must sit next to Arknights.exe, then apply the patch catalog)",
    };
  }
  const recorded = fs.readFileSync(exeTxt, "utf8").trim();
  if (recorded !== gamePath && !fs.existsSync(gamePath)) {
    return { ready: false, reason: "game-path-mismatch", detail: `ak_exe_filepath.txt points to "${recorded}" but settings has "${gamePath}"` };
  }
  return { ready: true, gamePath, compDir: rec.activeDir };
}

/**
 * Start the OpenBachelorC PC flow: launches the game exe, waits for the frida gadget
 * (127.0.0.1:27042), hooks the proxy -> S server, then drops into the trainer prompt.
 */
export async function startGame(opts = {}) {
  const cur = await gameStatus();
  if (cur.running) return { ok: false, reason: "already-running", pid: cur.pid };

  const pf = preflight();
  if (!pf.ready) return { ok: false, ...pf };

  const srv = await serverStatus();
  if (!srv.listening) {
    return { ok: false, reason: "server-not-running", detail: "Start the S (server) first — node cli.js server start" };
  }

  const rec = readComponent("C");
  const v = componentVenv(rec.activeDir);
  // pythonw (windowless): the venv python.exe trampoline would re-spawn the real
  // interpreter with its own VISIBLE console even though our spawn is hidden
  const py = v.pythonw && fs.existsSync(v.pythonw) ? v.pythonw : v.python;
  append(`launching C bridge (headless attach — game=${path.basename(pf.gamePath)})`, "C");

  // Headless bridge (services/c-bridge.py) instead of `openbachelorc.main --attach_pc`:
  // upstream's prompt_toolkit REPL needs a real console and crashes in this hidden,
  // pipe-backed child. The bridge reuses the upstream package for attach/dispatch and
  // tails a command file (argv[1]) — one line per trainer command, survives restarts.
  // Daemon-mode stdout: the child holds its own append FD to the log file, so its
  // prints survive the ui-server process being closed and reopened.
  const bridge = path.join(path.dirname(fileURLToPath(import.meta.url)), "c-bridge.py");
  const commandsFile = path.join(rec.activeDir, "trainer-cmds.txt");
  // truncate the command ledger: each launch starts clean (the bridge opens at
  // EOF, so stale lines from a previous run would never re-execute anyway)
  fs.writeFileSync(commandsFile, "", "utf8");
  const { child, pid, logPath } = launchDetached({
    cmd: py,
    args: [bridge, commandsFile],
    cwd: rec.activeDir,
    name: "C",
    interactive: false,
  });
  gameChild = child;
  // interactive:false — trainer commands travel via the file channel; there is no stdin pipe
  recordWrite(KIND, { pid, dir: rec.activeDir, gamePath: pf.gamePath, logFile: logPath, interactive: false });
  tailFile(logPath, "C");

  child.on("exit", (code, sig) => {
    append(`game process exited (code=${code}${sig ? ` sig=${sig}` : ""})`, "C");
    if (recordRead(KIND)?.pid === pid) recordClear(KIND);
    stopTails(logPath);
    gameChild = null;
  });
  child.on("error", (err) => {
    append(`spawn error: ${err.message}`, "C-err");
  });
  opts.onLine?.(`[C] pid=${pid} — awaiting gadget+attach (first 0.5-2 min of game boot)`);
  return { ok: true, pid };
}

/** Trainer commands reach the C-bridge through a command file (one line per
 *  command) instead of the child's stdin pipe: the game/bridge pair keeps
 *  running detached while the ui-server restarts, and a file channel keeps
 *  working for the restarted server without re-spawning the game. */
export function sendTrainerCommand(cmd) {
  const rec = recordRead(KIND);
  const alive = isGameRunning() || (rec ? pidAlive(rec.pid) : false);
  if (!alive) return { ok: false, reason: "not-running" };
  const line = String(cmd).trim();
  if (!line) return { ok: false, reason: "empty" };
  fs.appendFileSync(cmdFile(), line + "\n", "utf8");
  append(`> ${line}`, "trainer");
  return { ok: true, sent: line };
}

/** Path of the C-bridge command file (per active C install → survives everything). */
function cmdFile() {
  const rec = readComponent("C");
  return path.join(rec?.activeDir || dirs().root, "trainer-cmds.txt");
}

export async function stopGame() {
  const cur = await gameStatus();
  const rec = recordRead(KIND);
  const pid = cur.pid || rec?.pid;
  if (!pid) return { ok: true, reason: "not-running" };
  killTree(pid); // kills the whole tree (C main + game exe it spawned)
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && pidAlive(pid)) {
    await new Promise((r) => setTimeout(r, 250));
  }
  if (rec?.logFile) stopTails(rec.logFile);
  recordClear(KIND);
  gameChild = null;
  const alive = pidAlive(pid);
  append(`stop requested — still running: ${alive}`, "C");
  // The game exe itself may outlive the tree kill: Yostar EN runs an
  // anti-cheat that refuses TerminateProcess from an external, non-elevated
  // process. It stays hooked to whichever S server it connected to; the
  // honest thing is to tell the user it must be closed in-game.
  if (!alive) {
    const gamePath = (readSettings().GamePath || "").trim();
    if (gamePath) {
      const base = path.basename(gamePath).toLowerCase();
      try {
        const { execFileSync } = await import("node:child_process");
        const out = execFileSync("tasklist", ["/FI", `IMAGENAME eq ${path.basename(gamePath)}`, "/FO", "CSV", "/NH"], {
          encoding: "utf8",
          windowsHide: true,
        });
        const live = out
          .split(/\r?\n/)
          .filter((l) => l.toLowerCase().includes(`"${base}"`)).length;
        if (live > 0) {
          append(
            `note: ${live} game process(es) survived (anti-cheat blocks external termination) — the hook stays up until you close the game itself`,
            "C"
          );
        }
      } catch {
        /* best effort — tasklist missing would be surprising */
      }
    }
  }
  return { ok: !alive, pid };
}

export async function gameStatus() {
  const memAlive = gameChild ? processAlive(gameChild) : false;
  const rec = recordRead(KIND);
  const recAlive = rec ? pidAlive(rec.pid) : false;
  const running = memAlive || recAlive;
  const pf = preflight();
  return {
    running,
    pid: running ? (memAlive ? gameChild.pid : rec.pid) : null,
    ready: pf.ready,
    preflight: { ready: pf.ready, reason: pf.reason || null, detail: pf.detail || null },
  };
}
