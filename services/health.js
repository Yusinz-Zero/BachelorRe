// Health — one-call stack readiness + version-mismatch auto-fix (M3).
import fs from "node:fs";
import path from "node:path";
import { readSettings } from "../core/settings.js";
import { readComponent } from "../core/store.js";
import { applyPatches } from "../core/patcher.js";
import { serverStatus, isServerRunning, serverDir } from "./server-service.js";
import { gameStatus } from "./game-service.js";
import { trainerStatus } from "./trainer-service.js";

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/** Compare S's EN windows version file against the expected client version from settings. */
export function versionMismatch() {
  const settings = readSettings();
  const want = settings.ClientVersion ?? "37.7.41";
  const rec = readComponent("S");
  const dir = rec?.activeDir;
  if (!dir) return { dir: null, want, actual: null, mismatch: null, reason: "no-active" };
  const v = readJson(path.join(dir, "conf/version_en_windows.json"));
  const actual = v?.version?.clientVersion ?? null;
  return { dir, want, actual, mismatch: actual !== null && actual !== want };
}

/** Re-run the version-sync patch if the S version file is stale vs settings. */
export async function autoFixVersion(onLine) {
  const m = versionMismatch();
  if (!m.mismatch) return { needed: false, mismatch: m, rows: [] };
  const rows = await applyPatches({ only: "version-sync", onLine });
  return { needed: true, mismatch: m, rows };
}

/** Aggregate health for the Play tab / CLI. */
export async function readiness() {
  const settings = readSettings();
  const srv = await serverStatus();
  const game = await gameStatus();
  const tr = trainerStatus();
  const vm = versionMismatch();
  return {
    settings: {
      region: settings.Region ?? "EN",
      clientVersion: settings.ClientVersion ?? "37.7.41",
      serverPort: settings.ServerPort ?? 8443,
      gamePath: settings.GamePath || "",
      rosterMode: settings.RosterMode ?? "none",
    },
    server: srv,
    game: { ready: game.ready, reason: game.preflight.reason, detail: game.preflight.detail, running: game.running, pid: game.pid },
    trainer: { attached: tr.attached, commands: tr.commands, hint: tr.hint },
    version: vm,
    readyToPlay: srv.listening && game.preflight.ready && !vm.mismatch,
  };
}
