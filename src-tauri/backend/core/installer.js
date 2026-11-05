import fs from "node:fs";
import path from "node:path";
import { getComponent, allComponents } from "./manifest.js";
import { readComponent } from "./store.js";
import { dirs, ENV } from "./paths.js";
import { runCmd } from "./proc.js";

function pythonExe() {
  return ENV.BR_PYTHON || "python";
}

export function componentVenv(componentDir) {
  const bin = process.platform === "win32" ? "Scripts" : "bin";
  return {
    dir: path.join(componentDir, ".venv"),
    python: path.join(componentDir, ".venv", bin, process.platform === "win32" ? "python.exe" : "python"),
    // windowless python — on Windows, uv-style venvs ship a tiny python.exe trampoline
    // that re-spawns the REAL interpreter WITHOUT the parent's (hidden) console, so a
    // fresh visible console pops up. pythonw.exe is GUI-subsystem: no console anywhere
    // in the chain, and fd-redirected stdout/stderr still work (verified).
    pythonw: process.platform === "win32" ? path.join(componentDir, ".venv", bin, "pythonw.exe") : undefined,
  };
}

/** Create .venv for an installed component dir. Idempotent. */
export async function ensureVenv(componentDir, onLine) {
  const v = componentVenv(componentDir);
  if (fs.existsSync(v.python)) {
    onLine?.(`venv already present: ${path.relative(dirs().root, v.dir)}`);
    return v;
  }
  onLine?.(`creating venv with ${pythonExe()} …`);
  const res = await runCmd(pythonExe(), ["-m", "venv", v.dir], {}, (m) => onLine?.(`  ${m}`));
  if (res.code !== 0) throw new Error(`venv create failed: ${res.stdout}\n${res.stderr}`);
  onLine?.(`venv ready: ${path.relative(dirs().root, v.dir)}`);
  return v;
}

/** Install dependencies into an installed component (S/C are poetry-core projects). */
export async function installDeps(component, onLine, { editable = true } = {}) {
  const rec = readComponent(component.id);
  if (!rec.activeDir || !fs.existsSync(rec.activeDir)) {
    throw new Error(`[${component.id}] no active install to install deps into (run update first)`);
  }
  const v = await ensureVenv(rec.activeDir, onLine);
  const py = v.python;

  onLine?.(`[${component.id}] upgrading pip…`);
  await runCmd(py, ["-m", "pip", "install", "--upgrade", "pip"], { cwd: rec.activeDir }, (m) => onLine?.(`  ${m}`));

  // poetry-core is the build backend for both S and C
  onLine?.(`[${component.id}] installing build backend (poetry-core)…`);
  const bk = await runCmd(py, ["-m", "pip", "install", "poetry-core"], { cwd: rec.activeDir }, (m) => onLine?.(`  ${m}`));
  if (bk.code !== 0) throw new Error(`[${component.id}] poetry-core install failed`);

  onLine?.(`[${component.id}] installing project deps (editable, from pyproject)…`);
  const args = ["-m", "pip", "install", ...(editable ? ["-e"] : []), "."];
  const dr = await runCmd(py, args, { cwd: rec.activeDir }, (m) => onLine?.(`  ${m}`));
  if (dr.code !== 0) throw new Error(`[${component.id}] deps install failed\n${dr.stdout}\n${dr.stderr}`);
  onLine?.(`[${component.id}] deps installed OK`);
  return { venv: v.dir, py };
}

export async function installAllDeps(onLine) {
  const report = [];
  for (const comp of allComponents()) {
    try {
      const r = await installDeps(comp, onLine);
      report.push({ id: comp.id, ok: true, venv: r.venv });
    } catch (err) {
      report.push({ id: comp.id, ok: false, error: err.message });
    }
  }
  return report;
}

/** Doctor: report python + missing runtimes (Decision B: install only what's missing). */
export async function doctor(onLine) {
  const out = {};
  const pyRes = await runCmd(pythonExe(), ["--version"], {});
  out.python = pyRes.code === 0 ? pyRes.stdout.trim() : `missing/error: ${pyRes.error || pyRes.stderr}`;
  const checkNode = await runCmd("node", ["--version"], {});
  out.node = checkNode.code === 0 ? checkNode.stdout.trim() : "missing";
  const checkGit = await runCmd("git", ["--version"], {});
  out.git = checkGit.code === 0 ? checkGit.stdout.trim() : "missing";
  const checkTar = await runCmd("tar", ["--version"], {});
  out.zipTool = checkTar.code === 0 ? "tar (system)" : "none";
  return out;
}
