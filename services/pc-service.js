// PC client tooling (EN PC) — inject / restore the frida-gadget into the installed Arknights PC
// client. Replaces the upstream OpenBachelorC setup_pc.cmd / unset_pc.cmd / main_attach_pc.cmd
// which all assume pipx+poetry on PATH; here everything runs on the active C component's own
// venv python (or pure Node), so they work inside the launcher without extra tooling.
//
// - setup : non-interactive equivalent of OpenBachelorC setup_pc.py (GamePath from launcher
//           settings, no Tk dialog) -> backs up hgdownloadsdk.dll, writes florida-<ver>.dll,
//           LIEF-injects the import, writes ak_exe_filepath.txt.
// - unset : reverse of setup in pure Node -> restore hgdownloadsdk.dll from .bak, remove
//           ak_exe_filepath.txt. Mirrors OpenBachelorC unset_pc.py (leaves the .dll as upstream does).
// - attach: foreground `main --attach_pc` with the console inherited (mirrors main_attach_pc.cmd).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { readComponent } from "../core/store.js";
import { componentVenv } from "../core/installer.js";
import { readSettings } from "../core/settings.js";
import { dirs } from "../core/paths.js";
import { runCmd } from "../core/proc.js";

const AK_TXT = "ak_exe_filepath.txt";
const VICTIM_DLL = "hgdownloadsdk.dll";

/**
 * Pull the constant filenames from the ACTIVE component's own upstream pc_const.py so we
 * follow upstream if they ever rename these (single source of truth = the active C version).
 */
function readPcConst(compDir) {
  const out = { victim: VICTIM_DLL, akTxt: AK_TXT, found: false };
  try {
    const txt = fs.readFileSync(path.join(compDir, "src", "launcher", "openbachelorc", "pc_const.py"), "utf8");
    const m = txt.match(/VICTIM_DLL_FILENAME\s*=\s*["']([^"']+)["']/);
    const a = txt.match(/AK_EXE_FILEPATH_TXT_FILEPATH\s*=\s*["']([^"']+)["']/);
    if (m) out.victim = m[1];
    if (a) out.akTxt = a[1];
    out.found = !!(m && a);
  } catch {
    /* fall back to defaults */
  }
  return out;
}

/** Native file-open dialog (WinForms via PowerShell -STA) to pick Arknights.exe.
 *  Runs on the ui-server so it works in the plain browser and the Tauri webview. */
export async function browseGamePath() {
  const script = [
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "Add-Type -AssemblyName System.Windows.Forms | Out-Null",
    "$d = New-Object System.Windows.Forms.OpenFileDialog",
    '$d.Title = "Select Arknights.exe"',
    '$d.Filter = "Executable (*.exe)|*.exe"',
    "$d.CheckFileExists = $true",
    "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.FileName) }",
  ].join("; ");
  return new Promise((resolve) => {
    const p = spawn(
      "powershell.exe",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true }
    );
    let out = "";
    // long timeout: the dialog may stay open as long as the user wants
    const timer = setTimeout(() => {
      try { p.kill(); } catch { /* already exited */ }
      resolve(null);
    }, 180000);
    p.stdout?.on("data", (d) => (out += d.toString("utf8")));
    p.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    p.on("close", () => {
      clearTimeout(timer);
      const f = out.trim().replace(/^"|"$/g, "");
      resolve(f && f.toLowerCase().endsWith(".exe") ? f : null);
    });
  });
}

/** Resolve the current PC setup context (C active install + settings.GamePath). */
export function pcContext() {
  const settings = readSettings();
  const gamePath = (settings.GamePath || "").trim() || null;
  const rec = readComponent("C");
  const compDir = rec?.activeDir || null;
  const names = compDir ? readPcConst(compDir) : { victim: VICTIM_DLL, akTxt: AK_TXT, found: false };
  const gameDir = gamePath ? path.dirname(gamePath) : null;
  return {
    gamePath,
    compDir,
    gameDir,
    names,
    akTxt: compDir ? path.join(compDir, names.akTxt) : null,
    victimDll: gameDir ? path.join(gameDir, names.victim) : null,
    bak: gameDir ? path.join(gameDir, names.victim + ".bak") : null,
  };
}

/** Report whether the PC gadget is injected and where things point. */
export function pcStatus() {
  const c = pcContext();
  const akTxt = c.akTxt ? fs.existsSync(c.akTxt) : false;
  const bak = c.bak ? fs.existsSync(c.bak) : false;
  const victim = c.victimDll ? fs.existsSync(c.victimDll) : false;
  const recorded = akTxt ? fs.readFileSync(c.akTxt, "utf8").trim() : null;
  return {
    compDir: c.compDir,
    gamePath: c.gamePath,
    recorded,
    akTxt,
    bak,
    victimDllPresent: victim,
    injected: akTxt && bak && victim,
    detail: !c.compDir
      ? "C has no active install (run npm run update first)"
      : !c.gamePath
        ? "GamePath (Arknights.exe) not set in Settings"
        : akTxt && bak
          ? `injected — ready to attach (points to ${recorded})`
          : bak
            ? "A .bak exists but ak_exe_filepath.txt is missing — run pc setup again"
            : "not injected yet — run pc setup",
  };
}

/** Inject the frida-gadget (requires GamePath set + hgdownloadsdk.dll next to Arknights.exe). */
export async function pcSetup(onLine) {
  const c = pcContext();
  if (!c.gamePath) return { ok: false, reason: "no-game-path", detail: "GamePath (Arknights.exe) not set in Settings" };
  if (!c.compDir) return { ok: false, reason: "no-active", detail: "C has no active install" };
  if (!fs.existsSync(c.victimDll)) {
    return { ok: false, reason: "victim-missing", detail: `hgdownloadsdk.dll not found next to "${c.gamePath}" — check the game install` };
  }
  const py = componentVenv(c.compDir).python;
  const res = await runCmd(
    py,
    ["patches/helpers/pc_setup_noninteractive.py", "--component", c.compDir, "--game", c.gamePath],
    { cwd: dirs().root },
    onLine
  );
  if (res.code !== 0 && !/wrote -> .*ak_exe_filepath\.txt/.test(res.stdout || "")) {
    return { ok: false, reason: "failed", detail: ((res.stdout || res.stderr || res.error) || "?").toString().trim().slice(-400) };
  }
  return { ok: true, detail: "gadget injected + ak_exe_filepath.txt written" };
}

/** Reverse of setup in pure Node (no LIEF needed — plain restore). Follower to upstream
 *  unset_pc.py but uses the ACTIVE component's pc_const.py names (not hardcoded). */
export function pcUnset(onLine) {
  const c = pcContext();
  const notes = [];
  let changed = 0;
  const victimName = c.names?.victim || VICTIM_DLL;
  const akName = c.names?.akTxt || AK_TXT;
  if (c.bak && fs.existsSync(c.bak)) {
    if (!fs.existsSync(c.victimDll)) {
      return { ok: false, reason: "victim-missing", detail: `.bak exists but ${victimName} is missing — refusing to overwrite` };
    }
    fs.copyFileSync(c.bak, c.victimDll);
    changed++;
    notes.push(`restored ${victimName} <- ${path.basename(c.bak)}`);
  } else {
    notes.push("no .bak — nothing to restore");
  }
  if (c.akTxt && fs.existsSync(c.akTxt)) {
    fs.unlinkSync(c.akTxt);
    changed++;
    notes.push(`removed ${akName}`);
  } else {
    notes.push(`no ${akName} — nothing to remove`);
  }
  onLine?.(notes.join("\n"));
  return { ok: true, changed: changed > 0, detail: notes.join("; ") };
}

/**
 * Self-check that our PC tooling still matches the ACTIVE OpenBachelor C version
 * (pc_const names, frida-gadget xz, venv python, and the `main --attach_pc` CLI surface).
 * Run after an update to confirm our wrappers are still in sync.
 */
export async function pcDoctor() {
  const c = pcContext();
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  add("active C install", !!c.compDir, c.compDir ? c.compDir.replace(dirs().root + "\\", "") : "no active C (run npm run update first)");

  if (!c.compDir) {
    return { ok: false, checks };
  }

  const pcc = readPcConst(c.compDir);
  add("pc_const.py readable", pcc.found, pcc.found ? `${pcc.akTxt} / ${pcc.victim}` : "pc_const.py not found (using defaults)");

  const gadgetDir = path.join(c.compDir, "frida-gadget");
  const xzs = fs.existsSync(gadgetDir) ? fs.readdirSync(gadgetDir).filter((f) => f.endsWith(".dll.xz")) : [];
  add("frida-gadget xz (injector)", xzs.length > 0, xzs.length ? xzs.join(", ") : "no xz found — pc setup cannot run");

  const py = componentVenv(c.compDir).python;
  add("C venv python present", fs.existsSync(py), py.replace(dirs().root + "\\", ""));

  // CLI surface we rely on. We do NOT run `main --help`: upstream main()'s finally block touches
  // an unbound emulator_id when argparse exits early, so --help always exits 1 — an upstream
  // quirk that never triggers in real use (--attach_pc skips that finally). Instead:
  // 1) package imports + loads conf from cwd; 2) main.py source still declares --attach_pc.
  let importOk = false;
  let importInfo = "";
  try {
    const res = await runCmd(py, ["-c", "import openbachelorc.main; print('import-ok')"], { cwd: c.compDir });
    importInfo = (res.stdout || res.stderr || "").toString().trim();
    importOk = res.code === 0 && /import-ok/.test(importInfo);
  } catch (e) {
    importInfo = e.message;
  }
  add("openbachelorc.main imports (entry+deps)", importOk, importOk ? "import + conf load OK" : (importInfo.slice(0, 160) || "import failed"));

  const mainSrc = path.join(c.compDir, "src", "launcher", "openbachelorc", "main.py");
  let detachFlag = false;
  try {
    detachFlag = /--attach_pc/.test(fs.readFileSync(mainSrc, "utf8"));
  } catch {
    /* false */
  }
  add("main.py declares --attach_pc", detachFlag, detachFlag ? "main.py still has --attach_pc (game-server sync relies on it)" : "gone — game-service/pc-service must be updated");

  add("inject state", true, c.gamePath
    ? (c.bak && fs.existsSync(c.bak) && c.akTxt && fs.existsSync(c.akTxt) ? "injected + ready to attach" : "not injected / incomplete")
    : "GamePath not set (no compatibility impact)");

  return { ok: checks.every((x) => x.ok), checks, gamePath: c.gamePath };
}

/**
 * Foreground attach: run `python -m openbachelorc.main --attach_pc` with the console inherited
 * (reads ak_exe_filepath.txt it needs — mirrors upstream main_attach_pc.cmd). Resolves when the
 * process exits. Best used for a manual dev console; the launcher path is `node cli.js game start`.
 */
export async function pcAttachForeground(onStart) {
  const c = pcContext();
  if (!c.compDir) return { ok: false, reason: "no-active", detail: "C has no active install" };
  if (!fs.existsSync(path.join(c.compDir, AK_TXT))) {
    return { ok: false, reason: "no-setup", detail: "pc setup not done yet — run pc setup (or setup_pc.cmd) first" };
  }
  const py = componentVenv(c.compDir).python;
  const child = spawn(py, ["-m", "openbachelorc.main", "--attach_pc"], {
    cwd: c.compDir,
    stdio: "inherit",
    windowsHide: false,
  });
  onStart?.();
  return new Promise((resolve) => {
    child.on("exit", (code) => resolve({ ok: true, exited: code }));
    child.on("error", (err) => resolve({ ok: false, error: err.message }));
  });
}
