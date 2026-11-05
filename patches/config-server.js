// Server (S) config baseline: conf/config.json — keep host/port aligned with launcher settings.
// (S has no use_su/no_spawn keys — those belong to C's config.)
import fs from "node:fs";
import path from "node:path";

const FILE = "conf/config.json";

export default {
  id: "config-server",
  component: "S",
  title: "Server config (host/port)",
  description: "Ensure conf/config.json listens on 127.0.0.1:<ServerPort>",
  isApplied(compDir, ctx) {
    const cfg = readJson(path.join(compDir, FILE));
    return !!cfg && cfg.host === "127.0.0.1" && cfg.port === (ctx.settings.ServerPort ?? 8443);
  },
  apply(compDir, ctx) {
    const p = path.join(compDir, FILE);
    const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
    const want = ctx.settings.ServerPort ?? 8443;
    const changes = [];
    if (cfg.host !== "127.0.0.1") {
      cfg.host = "127.0.0.1";
      changes.push("host=127.0.0.1");
    }
    if (cfg.port !== want) {
      cfg.port = want;
      changes.push(`port=${want}`);
    }
    fs.writeFileSync(p, JSON.stringify(cfg, null, 4) + "\n", "utf8");
    return { changed: changes.length > 0, detail: changes.length ? changes.join(", ") : "already aligned" };
  },
};

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
