// Settings I/O — root launcher-settings.json (read/write atomic-ish)
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./paths.js";

const SETTINGS_FILE = path.join(ROOT, "launcher-settings.json");

export function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, "")); // tolerate a UTF-8 BOM (hand-edited file)
  } catch {
    return {};
  }
}

export function saveSettings(patch) {
  const cur = readSettings();
  const next = { ...cur, ...patch };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function settingsFile() {
  return SETTINGS_FILE;
}
