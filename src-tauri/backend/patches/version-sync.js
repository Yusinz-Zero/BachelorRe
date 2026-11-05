// Version sync (S): run OpenBachelorS's own version_updater against the EN official endpoint,
// so conf/version_en.json + conf/version_en_windows.json match the current official client
// (prevents "version mismatch / outdated client" errors).
import fs from "node:fs";
import path from "node:path";

const WINDOWS_EN = "conf/version_en_windows.json";

export default {
  id: "version-sync",
  component: "S",
  title: "Version sync (EN Windows)",
  description: "Run openbachelors.tool.version_updater to pull official EN client version",
  optional: false,
  isApplied(compDir, ctx) {
    const v = readJson(path.join(compDir, WINDOWS_EN));
    const want = ctx.settings.ClientVersion ?? "37.7.41";
    return !!v?.version && v.version.clientVersion === want;
  },
  async apply(compDir, ctx) {
    const py = ctx.componentVenv(compDir).python;
    const res = await ctx.runCmd(
      py,
      ["-m", "openbachelors.tool.version_updater"],
      { cwd: compDir },
      ctx.onLine
    );
    if (res.code !== 0) {
      throw new Error("version_updater failed: " + ((res.stdout || res.stderr).trim().slice(-400) || res.error));
    }
    const v = readJson(path.join(compDir, WINDOWS_EN));
    const ver = v?.version?.clientVersion ?? "?";
    return {
      changed: ver === (ctx.settings.ClientVersion ?? "37.7.41") || true,
      detail: `version_en_windows.json -> client ${ver} (res ${v?.version?.resVersion ?? "?"})`,
    };
  },
};

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
