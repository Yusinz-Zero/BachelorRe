// PC setup (C): inject frida-gadget into the installed Arknights PC client + write ak_exe_filepath.txt.
// Mirrors OpenBachelorC's setup_pc.py but non-interactive (GamePath comes from launcher settings,
// no Tk dialog). Gated: only enabled when settings.GamePath is set.
// Reversible via `pc unset` (services/pc-service.js) / unset_pc.cmd — restores the .bak + removes
// ak_exe_filepath.txt so this patch's status returns to "pending".
import fs from "node:fs";
import path from "node:path";

const AK_TXT = "ak_exe_filepath.txt";

export default {
  id: "pc-setup",
  component: "C",
  title: "PC setup (inject frida gadget)",
  description: "LIEF-inject florida gadget into <GamePath>\\hgdownloadsdk.dll + write ak_exe_filepath.txt",
  optional: false,
  enabled(ctx) {
    return !!(ctx.settings.GamePath && ctx.settings.GamePath.trim());
  },
  isApplied(compDir, ctx) {
    const game = ctx.settings?.GamePath?.trim();
    if (!game) return false;
    const gameDir = path.dirname(game);
    return (
      fs.existsSync(path.join(compDir, AK_TXT)) &&
      fs.existsSync(path.join(gameDir, "hgdownloadsdk.dll.bak"))
    );
  },
  async apply(compDir, ctx) {
    const py = ctx.componentVenv(compDir).python;
    // cwd = launcher root so the helper path resolves; helper is run with C's venv python (has lief)
    const res = await ctx.runCmd(
      py,
      [
        path.join("patches", "helpers", "pc_setup_noninteractive.py"),
        "--component",
        compDir,
        "--game",
        ctx.settings.GamePath.trim(),
      ],
      { cwd: ctx.root },
      ctx.onLine
    );
    if (res.code !== 0) {
      throw new Error("pc-setup failed: " + ((res.stdout || res.stderr).trim().slice(-400) || res.error));
    }
    return {
      changed: true,
      detail: ctx.onLine ? "gadget injected + ak_exe_filepath.txt written" : "gadget injected + ak_exe_filepath.txt written",
    };
  },
};
