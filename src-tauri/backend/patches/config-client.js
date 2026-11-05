// Client (C) config baseline for PC/EN: conf/config.json
// - host/port must point at the local server (port follows launcher settings)
// - use_su=false (PC uses frida-gadget injection, not Android root su)
// - enable_trainer=true (the launcher replaces upstream's manual
//   config_enable_trainer.cmd / interactive prompt with the headless C-bridge,
//   so the trainer switches must be on inside the config itself)
// attach_pc is a runtime flag (main --attach_pc sets it), we keep the file default false.
import fs from "node:fs";
import path from "node:path";

const FILE = "conf/config.json";

export default {
  id: "config-client",
  component: "C",
  title: "Client config (PC/EN baseline)",
  description: "Ensure conf/config.json: host/port = launcher, use_su=false, enable_trainer=true",
  isApplied(compDir, ctx) {
    const cfg = readJson(path.join(compDir, FILE));
    return (
      !!cfg &&
      cfg.host === "127.0.0.1" &&
      cfg.port === (ctx.settings.ServerPort ?? 8443) &&
      cfg.use_su === false &&
      cfg.enable_trainer === true
    );
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
    if (cfg.use_su !== false) {
      cfg.use_su = false;
      changes.push("use_su=false");
    }
    if (cfg.enable_trainer !== true) {
      cfg.enable_trainer = true;
      changes.push("enable_trainer=true");
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
