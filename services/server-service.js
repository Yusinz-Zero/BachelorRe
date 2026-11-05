// Server (S) service — boot/stop/status OpenBachelorS (uvicorn) via its own venv.
// Runs detached (survive launcher exit), logs to logs/service-S.log, and persists its
// pid/port/log in data/services.json so start/status/stop work across CLI processes
// and the ui-server. Ground truth for "running" = the configured port actually listening.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { readComponent } from "../core/store.js";
import { componentVenv } from "../core/installer.js";
import { readSettings } from "../core/settings.js";
import { append } from "./log-store.js";
import { killTree } from "./process-util.js";
import { recordWrite, recordRead, recordClear, pidAlive } from "./service-state.js";
import { launchDetached } from "./spawner.js";
import { tailFile, stopTails } from "./log-tailer.js";

const KIND = "server";

function portOf() {
  return readSettings().ServerPort ?? 8443;
}

function checkPort(port, timeoutMs = 700) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port }, () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
    sock.setTimeout(timeoutMs, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

function readRecent(file, n = 8192) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size === 0) return "";
    const fd = fs.openSync(file, "r");
    const len = Math.min(n, st.size);
    const buf = Buffer.alloc(len);
    try {
      fs.readSync(fd, buf, 0, len, st.size - len);
    } finally {
      fs.closeSync(fd);
    }
    return buf.toString("utf8");
  } catch {
    return "";
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isServerRunning() {
  const rec = recordRead(KIND);
  return rec ? pidAlive(rec.pid) : false;
}

export function serverPid() {
  return recordRead(KIND)?.pid ?? null;
}

export function serverDir() {
  return readComponent("S")?.activeDir || null;
}

/**
 * Start the S server. Options: { waitUntilListening } (default true), onLine.
 */
export async function startServer(opts = {}) {
  const port = portOf();
  const st = await serverStatus();
  if (st.listening) {
    return { ok: false, reason: "already-running", pid: st.pid, port, dir: st.dir };
  }

  const rec = readComponent("S");
  if (!rec?.activeDir) return { ok: false, reason: "no-active", detail: "S has no active install (run npm run update first)" };

  const v = componentVenv(rec.activeDir);
  // pythonw (windowless) so the venv trampoline chain cannot pop a console
  // window; uvicorn keeps logging through the redirected stdout/stderr fds
  const py = v.pythonw && fs.existsSync(v.pythonw) ? v.pythonw : v.python;
  append(`starting uvicorn on 127.0.0.1:${port} — ${path.basename(rec.activeDir)}`, "S");

  const { pid, logPath } = launchDetached({
    cmd: py,
    args: ["-m", "uvicorn", "openbachelors.app:app", "--host", "127.0.0.1", "--port", String(port)],
    cwd: rec.activeDir,
    name: "S",
    interactive: false,
  });
  recordWrite(KIND, { pid, port, dir: rec.activeDir, logFile: logPath });
  tailFile(logPath, "S"); // start streaming into the ring (this process only)
  opts.onLine?.(`[S] pid=${pid} awaiting listen on :${port}`);

  if (opts.waitUntilListening === false) return { ok: true, pid, port, dir: rec.activeDir };

  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    if (!pidAlive(pid)) {
      recordClear(KIND);
      stopTails(logPath);
      append(`server exited early (pid ${pid})`, "S");
      return { ok: false, reason: "died-early", pid, port };
    }
    // fail fast on a python/uvicorn startup error visible in the log
    const tail = readRecent(logPath);
    if (/application startup failed|traceback|^error|fatal/i.test(tail)) {
      const m = (tail.match(/application startup failed|error[^\r\n]*/i) || [""])[0].trim().slice(0, 200);
      recordClear(KIND);
      stopTails(logPath);
      append(`startup error: ${m}`, "S");
      return { ok: false, reason: "startup-error", detail: m, pid, port };
    }
    if (await checkPort(port, 500)) {
      opts.onLine?.(`[S] server listening on :${port} (pid ${pid})`);
      return { ok: true, pid, port, dir: rec.activeDir };
    }
    await sleep(500);
  }
  if (pidAlive(pid)) killTree(pid);
  recordClear(KIND);
  stopTails(logPath);
  append(`start timed out (pid ${pid})`, "S");
  return { ok: false, reason: "timeout", pid, port };
}

export async function stopServer() {
  const port = portOf();
  const st = await serverStatus();
  const rec = recordRead(KIND);
  const pid = st.pid || rec?.pid;
  const was = st.listening ? "listening" : "down";
  if (pid && pidAlive(pid)) killTree(pid);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && (await checkPort(port, 400))) {
    await sleep(250);
  }
  const after = await checkPort(port, 400);
  if (rec?.logFile) stopTails(rec.logFile);
  recordClear(KIND);
  const is = after ? "listening" : "down";
  append(`stop requested (was ${was}) — now ${is}`, "S");
  return { ok: !after, was, now: is, pid: pid || null };
}

export async function serverStatus() {
  const port = portOf();
  const rec = recordRead(KIND);
  const listening = await checkPort(port, 600);
  const recAlive = rec ? pidAlive(rec.pid) : false;
  return {
    running: listening,
    pid: recAlive ? rec.pid : null,
    port,
    listening,
    dir: rec?.dir || serverDir(),
  };
}
