// Persistent service registry — data/services.json so start/status/stop work across CLI processes
// and the ui-server (the in-memory child ref also lives, for same-process streaming).
import fs from "node:fs";
import path from "node:path";
import { dirs } from "../core/paths.js";

const FILE = path.join(dirs().root, "data", "services.json");

export function readAll() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

export function recordWrite(kind, obj) {
  const all = readAll();
  all[kind] = { ...obj, at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2), "utf8");
  return all[kind];
}

export function recordRead(kind) {
  return readAll()[kind] || null;
}

export function recordClear(kind) {
  const all = readAll();
  if (all[kind]) delete all[kind];
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2), "utf8");
  return all;
}

/** Cross-process "is this pid alive?" — works on Windows via process.kill(pid,0). */
export function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM"; // exists but we may not own it
  }
}
