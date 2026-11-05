// Stage the JS backend for the NSIS bundle.
// Bundle resources (tauri.conf map form) are resolved from the build-script CWD
// = src-tauri (verified by probe in build.rs), so we stage to <repo>\src-tauri\backend
// and map each subtree to its final name at the install ROOT:
//   "backend/server" -> "server", etc. (directory walk preserves structure)
// core/paths.js resolves ROOT from the script location, so the INSTALLED app is
// fully self-contained: components/, logs/, deps-cache/ etc. are created inside
// the install folder on first run.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // scripts/
const root = path.resolve(here, "..");
const out = path.join(root, "src-tauri", "backend");

// wipe the previous staging so removed files never linger in the bundle
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// server + services + core + patches = code the ui-server needs at runtime
for (const dir of ["server", "services", "core", "patches"]) {
  fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });
}
// bg = the user-editable art folder (installed copy gets its own)
fs.cpSync(path.join(root, "bg"), path.join(out, "bg"), { recursive: true });

let count = 0;
const walk = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.isDirectory()) walk(path.join(dir, f.name));
    else count++;
  }
};
walk(out);

console.log(`staged backend -> ${out} (${count} files)`);
