#!/usr/bin/env node
// Bachelor:Re CLI — status / check / update / deps / doctor / patch
import { checkAll } from "./core/updater.js";
import { updateAll } from "./core/updater.js";
import { installAllDeps, doctor } from "./core/installer.js";
import { readState } from "./core/store.js";
import { patchStatus, applyPatches } from "./core/patcher.js";
import { startServer, stopServer, serverStatus } from "./services/server-service.js";
import { startGame, stopGame, gameStatus } from "./services/game-service.js";
import { trainerStatus, send as sendTrainer } from "./services/trainer-service.js";
import { readiness } from "./services/health.js";
import { pcStatus, pcSetup, pcUnset, pcAttachForeground, pcDoctor } from "./services/pc-service.js";
import { ENV, dirs, ensureDirs } from "./core/paths.js";

const argv = process.argv.slice(2);
const cmd = argv[0] || "help";
const rest = argv.slice(1);

function optsOf(list) {
  const o = { flags: [] };
  for (const a of list) {
    if (a.startsWith("--only=")) o.only = a.slice("--only=".length);
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--force") o.force = true;
    else o.flags.push(a);
  }
  return o;
}

const log = (m) => console.log(m);

async function main() {
  ensureDirs();
  switch (cmd) {
    case "status": {
      const st = readState();
      console.log("Bachelor:Re — component status");
      console.log(`last check: ${st.lastCheckAt || "never"}`);
      for (const id of ["S", "C"]) {
        const c = st.components[id];
        const cnt = Object.keys(c.installs || {}).length;
        console.log(
          `  ${id}: knownSha=${c.knownSha ? c.knownSha.slice(0, 7) : "-"} activeDir=${c.activeDir ? c.activeDir.replace(dirs().root + "\\", "") : "-"} (${cnt} installed version${cnt === 1 ? "" : "s"})`
        );
      }
      break;
    }
    case "check": {
      const res = await checkAll(log);
      for (const r of res) {
        if (r.error) console.log(`  ${r.id}: ERROR ${r.error}`);
        else
          console.log(
            `  ${r.id} ${r.name}: local=${r.knownSha ? r.knownSha.slice(0, 7) : "-"} upstream=${r.remoteSha.slice(0, 7)} (${r.remoteDate}${r.remoteMessage ? " — " + r.remoteMessage : ""}) ${r.updateAvailable ? "🔶 UPDATE AVAILABLE" : "✅ up-to-date"}${r.installed ? " [installed]" : ""}`
          );
      }
      break;
    }
    case "update": {
      console.log("Checking for updates (manual)…");
      const report = await updateAll(log);
      for (const r of report) {
        if (r.error) console.log(`  ${r.id}: ✖ ${r.error}`);
        else if (r.installed) console.log(`  ${r.id}: ✔ installed ${r.sha7} -> ${r.dir}`);
        else console.log(`  ${r.id}: ${r.reason || "ok"} (${r.activeDir || "no active"})`);
      }
      break;
    }
    case "deps": {
      const report = await installAllDeps(log);
      for (const r of report) {
        console.log(`  ${r.id}: ${r.ok ? "✔ deps OK @ " + r.venv : "✖ " + r.error}`);
      }
      break;
    }
    case "doctor": {
      console.log("Bachelor:Re doctor:");
      const deps = await doctor(log);
      for (const [k, v] of Object.entries(deps)) console.log(`  ${k}: ${v}`);
      break;
    }
    case "patch": {
      const o = optsOf(rest);
      const apply = o.flags.includes("apply");
      if (!apply) {
        console.log("Bachelor:Re — patch catalog status");
        const rows = await patchStatus(log);
        for (const r of rows) {
          const mark = !r.enabled
            ? "[off]"
            : r.state === "applied"
              ? "[ ok ]"
              : r.state === "no-active"
                ? "[none]"
                : r.state === "error"
                  ? "[err!]"
                  : "[todo]";
          console.log(`  ${mark} ${r.id.padEnd(14)} ${r.component}  ${r.title}`);
          if (r.description) console.log(`           ${r.description}`);
        }
        console.log("\nusage: node cli.js patch apply [--only=<id>] [--dry-run] [--force]");
        break;
      }
      console.log(`Applying patches${o.dryRun ? " (DRY-RUN)" : ""}${o.only ? " [only=" + o.only + "]" : ""}${o.force ? " [force]" : ""}...`);
      const report = await applyPatches({ only: o.only, dryRun: o.dryRun, force: o.force, onLine: log });
      for (const r of report) {
        const icon =
          r.action === "applied"
            ? "ok applied"
            : r.action === "already-applied"
              ? "ok already "
              : r.action === "skipped-disabled"
                ? "-- off     "
                : r.action === "skipped-no-active"
                  ? "-- no-act  "
                  : r.action === "dry-run"
                    ? ".. dry-run "
                    : r.action === "failed" || r.action === "error"
                      ? "!! failed "
                      : ".. no-op   ";
        console.log(`  ${icon} ${r.id.padEnd(14)} ${r.component}  ${r.detail || ""}`);
      }
      break;
    }
    case "server": {
      const sub = rest[0] || "status";
      if (sub === "start") {
        const r = await startServer(log);
        console.log(`server start: ${r.ok ? `OK pid=${r.pid} listening :${r.port}` : `FAIL ${r.reason}${r.detail ? " - " + r.detail : ""}`}`);
        process.exit(0); // let the server keep running detached; avoid CLI hang
      } else if (sub === "stop") {
        const r = await stopServer();
        console.log(`server stop: ${r.ok ? "stopped" : "still up"} (was ${r.was} -> now ${r.now})`);
        process.exit(0);
      } else {
        const s = await serverStatus();
        const rel = s.dir ? s.dir.replace(dirs().root + "\\", "") : "-";
        console.log(`server: running=${s.running} pid=${s.pid ?? "-"} port=${s.port} listening=${s.listening} dir=${rel}`);
      }
      break;
    }
    case "game": {
      const sub = rest[0] || "status";
      if (sub === "start") {
        const r = await startGame(log);
        console.log(`game start: ${r.ok ? `OK pid=${r.pid}` : `FAIL ${r.reason}${r.detail ? " - " + r.detail : ""}`}`);
        process.exit(0); // keep C attached in background; avoid CLI hang
      } else if (sub === "stop") {
        const r = await stopGame();
        console.log(`game stop: ${r.ok ? "stopped" : "still running"} (pid ${r.pid ?? "-"})`);
        process.exit(0);
      } else {
        const g = await gameStatus();
        const pf = g.preflight;
        console.log(`game: running=${g.running} pid=${g.pid ?? "-"} ready=${g.ready}${pf.reason ? ` (${pf.reason}${pf.detail ? " - " + pf.detail : ""})` : ""}`);
      }
      break;
    }
    case "trainer": {
      const sub = rest[0] || "status";
      if (sub === "status") {
        const t = trainerStatus();
        console.log(`trainer: attached=${t.attached}`);
        console.log(`commands (${t.commands.length}): ${t.commands.join(", ")}`);
      } else if (sub === "send") {
        const cmd = rest.slice(1).join(" ");
        const r = sendTrainer(cmd);
        console.log(r.ok ? `sent: ${r.sent}` : `not sent: ${r.reason}`);
      } else {
        console.log("usage: node cli.js trainer <status|send ...>");
      }
      break;
    }
    case "pc": {
      const sub = rest[0] || "status";
      if (sub === "status") {
        const s = pcStatus();
        console.log("PC client (EN PC):");
        console.log(`  component : ${s.compDir ? s.compDir.replace(dirs().root + "\\", "") : "(no active C)"}`);
        console.log(`  game path : ${s.gamePath || "(GamePath not set)"}`);
        console.log(`  .bak      : ${s.bak ? "yes" : "—"}`);
        console.log(`  ak txt    : ${s.akTxt ? "yes" : "—"}`);
        console.log(`  injected  : ${s.injected ? "YES" : "no"}`);
        console.log(`  detail    : ${s.detail}`);
      } else if (sub === "setup") {
        const r = await pcSetup(log);
        console.log(r.ok ? `pc setup: OK — ${r.detail}` : `pc setup: FAIL ${r.reason} - ${r.detail}`);
        process.exit(0);
      } else if (sub === "unset") {
        const r = pcUnset(log);
        console.log(r.ok ? `pc unset: ${r.changed ? "cleaned" : "nothing to do"} — ${r.detail}` : `pc unset: FAIL ${r.reason} - ${r.detail}`);
      } else if (sub === "doctor") {
        const d = await pcDoctor();
        console.log("PC doctor — checks whether the PC tooling matches the active OpenBachelor C:");
        for (const ch of d.checks) console.log(`  [${ch.ok ? "ok " : "!! "}] ${ch.name}: ${ch.detail}`);
        console.log(d.ok ? "pc doctor: PASS — everything matches the current C" : "pc doctor: FAIL — fix the items marked !! (usually in services/game-service.js or pc-service.js)");
      } else if (sub === "attach") {
        const r = await pcAttachForeground(() => console.log("pc attach: launching main --attach_pc (console/foreground)…"));
        console.log(r.ok ? `pc attach: exited with code ${r.exited}` : `pc attach: FAIL ${r.reason || r.error}`);
      } else {
        console.log("usage: node cli.js pc <status|setup|unset|doctor|attach>");
      }
      break;
    }
    case "health": {
      const h = await readiness();
      const s = h.server;
      console.log("Bachelor:Re — stack readiness");
      console.log(`  server  : ${s.listening ? `up :${s.port} (pid ${s.pid})` : s.running ? "process up, port not listening" : "down"}  [${s.dir ? s.dir.replace(dirs().root + "\\", "") : "no active S"}]`);
      console.log(`  game    : ${h.game.ready ? "ready to attach" : `not ready (${h.game.reason})`}`);
      console.log(`  trainer : ${h.trainer.attached ? "attached" : "not attached"}`);
      console.log(`  version : server=${h.version.actual ?? "-"} want=${h.version.want} ${h.version.mismatch ? "(MISMATCH -> run apply)" : "OK"}`);
      console.log(`  play    : ${h.readyToPlay ? "READY" : "not ready"}`);
      break;
    }
    default:
      console.log(`usage: node cli.js <status|check|update|deps|doctor|patch [apply]|pc <status|setup|unset|attach>|server [start|stop]|game [start|stop]|trainer [status|send ...]|health>`);
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
