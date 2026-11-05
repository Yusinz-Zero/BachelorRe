import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Project root (directory that contains package.json)
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv() {
  const dotenvPath = path.join(ROOT, ".env");
  const defaults = {
    BR_RE_ROOT: ".",
    BR_DOWNLOAD_DIR: "downloads",
    BR_COMPONENT_DIR: "components",
    BR_DATA_FILE: "data/state.json",
    BR_UI_PORT: "5178",
    BR_GITHUB_OWNER: "pfyy",
    BR_COMPONENTS: "OpenBachelorS,OpenBachelorC",
    BR_PYTHON: "python",
    BR_GAME_PATH: "",
    BR_GAME_EXE_FILE: "ak_exe_filepath.txt",
    BR_REGION: "EN",
    BR_CLIENT_VERSION: "37.7.41",
  };
  const env = { ...defaults };
  if (fs.existsSync(dotenvPath)) {
    const txt = fs.readFileSync(dotenvPath, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

export const ENV = loadEnv();

export function dirs() {
  return {
    root: ROOT,
    downloadDir: path.resolve(ROOT, ENV.BR_DOWNLOAD_DIR),
    componentDir: path.resolve(ROOT, ENV.BR_COMPONENT_DIR),
    dataFile: path.resolve(ROOT, ENV.BR_DATA_FILE),
    uiDir: path.resolve(ROOT, "ui"),
    logDir: path.resolve(ROOT, "logs"),
    depsCacheDir: path.resolve(ROOT, "deps-cache"),
  };
}

export function ensureDirs() {
  const d = dirs();
  for (const key of ["downloadDir", "componentDir", "logDir", "depsCacheDir"]) {
    fs.mkdirSync(d[key], { recursive: true });
  }
  fs.mkdirSync(path.dirname(d.dataFile), { recursive: true });
  return d;
}
