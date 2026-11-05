import fs from "node:fs";
import path from "node:path";
import { ENV, dirs } from "./paths.js";

const VALID_IDS = new Set(["S", "C"]);

export function defaultState() {
  return {
    schema: 1,
    lastCheckAt: null,
    components: {
      S: { knownSha: null, activeDir: null, installs: {} },
      C: { knownSha: null, activeDir: null, installs: {} },
    },
  };
}

export function readState() {
  const { dataFile } = dirs();
  if (!fs.existsSync(dataFile)) return defaultState();
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    const state = defaultState();
    // shallow merge
    if (raw && raw.components) {
      for (const id of VALID_IDS) {
        const c = raw.components[id];
        if (c) {
          state.components[id].knownSha = c.knownSha ?? null;
          state.components[id].activeDir = c.activeDir ?? null;
          state.components[id].installs = c.installs ?? {};
        }
      }
    }
    state.lastCheckAt = raw.lastCheckAt ?? null;
    return state;
  } catch (err) {
    console.warn(`[store] state read failed: ${err.message}`);
    return defaultState();
  }
}

export function writeState(state) {
  const { dataFile } = dirs();
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(state, null, 2), "utf8");
  return state;
}

export function readComponent(id) {
  if (!VALID_IDS.has(id)) throw new Error(`unknown component id: ${id}`);
  return readState().components[id];
}

export function patchComponent(id, patch) {
  const state = readState();
  Object.assign(state.components[id], patch);
  writeState(state);
  return state.components[id];
}
