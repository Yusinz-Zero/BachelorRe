// Bachelor:Re UI server (M1): serves the static UI + a small JSON API.
// Tauri (M4) will wrap this same service.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { dirs, ensureDirs, ENV } from "../core/paths.js";
import { readState } from "../core/store.js";
import { checkAll, updateAll } from "../core/updater.js";
import { installAllDeps, doctor } from "../core/installer.js";
import { patchStatus, applyPatches } from "../core/patcher.js";
import { startServer, stopServer, serverStatus } from "../services/server-service.js";
import { startGame, stopGame, gameStatus, sendTrainerCommand } from "../services/game-service.js";
import { trainerStatus } from "../services/trainer-service.js";
import { readiness } from "../services/health.js";
import { tail as logTail, clear as logClear, append as logAppend } from "../services/log-store.js";
import { ensureTailers, wipeServiceLogs } from "../services/log-tailer.js";
import { pcStatus, pcSetup, pcUnset, pcDoctor, browseGamePath } from "../services/pc-service.js";
import { saveStatus, backupSave, resetSave, restoreSave, deleteBackup } from "../services/save-service.js";

const ROOT = dirs().root;
// Serve the built M4 React UI (ui/dist) when present, else the pre-M4 legacy stub.
const distRoot = path.join(dirs().uiDir, "dist");
const legacyRoot = path.join(dirs().uiDir, "legacy");
const UI = fs.existsSync(path.join(distRoot, "index.html")) ? distRoot : legacyRoot;
const PORT = Number(process.env.BR_UI_PORT || ENV.BR_UI_PORT || 5178);

// Rotating background art: data root "bg" folder (user-editable, no rebuild needed).
const bgDir = path.join(ROOT, "bg");
fs.mkdirSync(bgDir, { recursive: true });
const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|svg)$/i;
function bgImages() {
  try {
    return fs
      .readdirSync(bgDir)
      .filter((f) => IMAGE_RE.test(f))
      // "Logo*" is the sidebar logo asset in this folder, not background art.
      .filter((f) => !/^logo/i.test(f))
      .sort()
      .map((f) => `/bg/${f}`);
  } catch {
    return [];
  }
}

// --- simple long-task registry (UI polls for emitted lines) ---
const tasks = new Map();
let taskSeq = 0;

/** Clear the ring AND the on-disk service logs it re-ingests (a ui-server restart
 *  reads those files back from pos 0 — without the disk wipe "cleared" lines return). */
function clearRing() {
  logClear();
  wipeServiceLogs();
  logAppend("operation log cleared", "sys");
  return { ok: true };
}

function runTask(name, fn) {
  const id = `t${++taskSeq}`;
  const task = { id, name, lines: [], done: false, error: null };
  tasks.set(id, task);
  (async () => {
    try {
      const result = await fn((m) => task.lines.push(m));
      task.result = result;
    } catch (err) {
      task.error = err.message || String(err);
      task.lines.push(`✖ ${task.error}`);
    } finally {
      task.done = true;
    }
  })();
  return id;
}

// --- tiny static file server (path traversal safe) ---
// /bg/* is served from the DATA bg folder (user-editable, survives rebuilds).
function serveStatic(res, pathname) {
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
  };

  if (pathname.startsWith("/bg/")) {
    const file = path.resolve(bgDir, pathname.slice(4));
    if (!file.startsWith(bgDir + path.sep) || !IMAGE_RE.test(file)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end("not found");
      // no-store: users may replace art files under the SAME name — a cached copy
      // would keep showing the old image forever
      res.writeHead(200, {
        "content-type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(data);
    });
    return;
  }

  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(UI, rel);
  if (!file.startsWith(UI + path.sep) && file !== UI) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("404 not found");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    // index.html must never be cached — a stale copy keeps loading the OLD bundle
    // (cached too) after a rebuild, and the window then shows an outdated UI with
    // no cache-busting escape. Hashed /assets files are content-addressed by vite,
    // so they can safely cache forever.
    const cacheControl =
      rel === "index.html" ? "no-store" : rel.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-store";
    res.writeHead(200, { "content-type": mime[ext] || "application/octet-stream", "cache-control": cacheControl });
    res.end(data);
  });
}

function json(res, obj, code = 200) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  // Permissive CORS so the Tauri webview (custom protocol origin) and the Vite dev
  // server (5173) can both call the local ui-server API.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = u.pathname;

  if (req.method === "GET" && p.startsWith("/api/")) {
    if (p === "/api/status") return json(res, { state: readState(), settings: readSettings(), env: { uiPort: PORT } });
    if (p === "/api/doctor") return json(res, await doctor(() => {}));
    if (p === "/api/patch-status") return json(res, await patchStatus(() => {}));
    if (p === "/api/logs") return json(res, { lines: logTail(Number(u.searchParams.get("n")) || 300) });
    if (p === "/api/logs/clear") return json(res, clearRing());
    if (p === "/api/health") return json(res, await readiness());
    if (p === "/api/pc/status") return json(res, pcStatus());
    if (p === "/api/pc/doctor") return json(res, await pcDoctor());
    if (p === "/api/bg/list") return json(res, { images: bgImages() });
    if (p === "/api/save/status") return json(res, await saveStatus());
    if (p.startsWith("/api/task/")) {
      const task = tasks.get(p.slice("/api/task/".length));
      if (!task) return json(res, { error: "no such task" }, 404);
      return json(res, { id: task.id, lines: task.lines.splice(0), done: task.done, error: task.error, result: task.result ?? null });
    }
    return json(res, { error: "unknown api" }, 404);
  }

  if (req.method === "POST" && p.startsWith("/api/")) {
    if (p === "/api/logs/clear") return json(res, clearRing());
    if (p === "/api/check") {
      const id = runTask("check", async (log) => {
        const results = await checkAll(log);
        for (const r of results) {
          if (r.error) log(`${r.id}: ERROR ${r.error}`);
          else
            log(
              `${r.id} ${r.name}: local=${cut(r.knownSha)} upstream=${cut(r.remoteSha)} (${r.remoteDate}${r.remoteMessage ? " — " + r.remoteMessage : ""}) ${r.updateAvailable ? "🔶 UPDATE AVAILABLE" : "✅ up-to-date"}${r.installed ? " [installed]" : ""}`
            );
        }
        return results;
      });
      return json(res, { task: id });
    }
    if (p === "/api/update") {
      const id = runTask("update", (log) => updateAll(log));
      return json(res, { task: id });
    }
    if (p === "/api/deps") {
      const id = runTask("deps", (log) => installAllDeps(log));
      return json(res, { task: id });
    }
    if (p === "/api/patch") {
      let body = "";
      for await (const chunk of req) body += chunk;
      let opts = {};
      try {
        opts = body ? JSON.parse(body) : {};
      } catch {
        /* ignore bad body */
      }
      const id = runTask("patch", (log) => applyPatches({ only: opts.only, dryRun: opts.dryRun, force: opts.force, onLine: log }));
      return json(res, { task: id });
    }
    if (p === "/api/server/start") {
      const id = runTask("server-start", async (log) => {
        const r = await startServer({ onLine: log });
        log(r.ok ? `[S] OK pid=${r.pid} listening :${r.port}` : `[S] FAIL ${r.reason}${r.detail ? " - " + r.detail : ""}`);
        return r;
      });
      return json(res, { task: id });
    }
    if (p === "/api/server/stop") {
      const id = runTask("server-stop", async (log) => {
        const r = await stopServer();
        log(`[S] ${r.ok ? "stopped" : "still up"} (${r.was} -> ${r.now})`);
        return r;
      });
      return json(res, { task: id });
    }
    if (p === "/api/game/start") {
      const id = runTask("game-start", async (log) => {
        const r = await startGame({ onLine: log });
        log(r.ok ? `[C] OK pid=${r.pid}` : `[C] FAIL ${r.reason}${r.detail ? " - " + r.detail : ""}`);
        return r;
      });
      return json(res, { task: id });
    }
    if (p === "/api/game/stop") {
      const id = runTask("game-stop", async (log) => {
        const r = await stopGame();
        log(`[C] stopped: ${r.ok}`);
        return r;
      });
      return json(res, { task: id });
    }
    if (p === "/api/pc/setup") {
      const id = runTask("pc-setup", async (log) => {
        const r = await pcSetup(log);
        log(r.ok ? `pc setup: OK — ${r.detail}` : `pc setup: FAIL ${r.reason} — ${r.detail}`);
        return r;
      });
      return json(res, { task: id });
    }
    if (p === "/api/pc/unset") {
      const id = runTask("pc-unset", async (log) => {
        const r = pcUnset(log);
        log(r.ok ? `pc unset: ${r.changed ? "cleaned" : "nothing to do"} — ${r.detail}` : `pc unset: FAIL ${r.reason} — ${r.detail}`);
        return r;
      });
      return json(res, { task: id });
    }
    if (p === "/api/pc/browse") {
      // blocks until the user closes the dialog (or browse times out)
      return json(res, { path: await browseGamePath() });
    }
    if (p === "/api/logs/export") {
      // Dump the whole ring buffer (max 4000 lines) to a timestamped .log file
      // under the data-root logs/ folder and hand the path back to the UI.
      const lines = logTail(4000);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const expDir = path.join(ROOT, "logs");
      try {
        fs.mkdirSync(expDir, { recursive: true });
      } catch {
        /* exists */
      }
      const file = path.join(expDir, `bachelor-re-${stamp}.log`);
      const text = lines.map((l) => `[${l.at}] [${l.source}] ${l.text}`).join("\r\n") + "\r\n";
      try {
        fs.writeFileSync(file, text, "utf8");
        return json(res, { ok: true, path: file, count: lines.length });
      } catch (err) {
        return json(res, { ok: false, error: err.message || String(err) }, 500);
      }
    }
    if (p === "/api/open-url") {
      // Open an external link in the OS default browser (never inside this app
      // window — the user asked for back-button friendly navigation).
      // Host allowlist makes sure this endpoint cannot launch arbitrary URLs.
      const ALLOWED_HOSTS = new Set(["github.com", "www.github.com", "arknights.global"]);
      let body = "";
      for await (const chunk of req) body += chunk;
      let url = "";
      try {
        url = String(JSON.parse(body).url || "").trim();
      } catch {
        url = body.trim();
      }
      let safe = false;
      try {
        const parsed = new URL(url);
        safe =
          (parsed.protocol === "https:" || parsed.protocol === "http:") &&
          ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
      } catch {
        safe = false;
      }
      if (!safe) return json(res, { ok: false, error: "url not allowed" }, 400);
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      return json(res, { ok: true });
    }
    if (p === "/api/trainer") {
      let body = "";
      for await (const chunk of req) body += chunk;
      let cmd = "";
      try {
        cmd = (JSON.parse(body).cmd || "").trim();
      } catch {
        cmd = (body || "").trim();
      }
      return json(res, sendTrainerCommand(cmd));
    }
    if (p === "/api/save-settings") {
      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const patch = JSON.parse(body);
        saveSettings(patch);
        return json(res, { ok: true });
      } catch (err) {
        return json(res, { error: err.message }, 400);
      }
    }
    // --- Save edit (M6): query params (GET-style) so useTask() can fire them ---
    if (p.startsWith("/api/save/")) {
      const q = u.searchParams;
      if (p === "/api/save/reset") {
        const user = q.get("user") || undefined;
        const id = runTask("save-reset", async (log) => {
          log(`fresh start requested${user ? ` for ${user}` : ""}`);
          const r = await resetSave(user, log);
          log(r.ok ? `✔ done — auto backup: ${r.backup}` : `✖ ${r.reason}`);
          return r;
        });
        return json(res, { task: id });
      }
      if (p === "/api/save/backup") {
        const user = q.get("user") || undefined;
        const id = runTask("save-backup", async (log) => {
          log(`backup requested${user ? ` for ${user}` : " (all users)"}`);
          const r = await backupSave(user, log);
          log(r.ok ? `✔ backup folder: ${r.backup}` : `✖ ${r.reason}`);
          return r;
        });
        return json(res, { task: id });
      }
      if (p === "/api/save/restore") {
        const backup = q.get("backup") || "";
        const id = runTask("save-restore", async (log) => {
          log(`restore requested: ${backup}`);
          const r = await restoreSave(backup, log);
          log(r.ok ? "✔ restored" : `✖ ${r.reason}`);
          return r;
        });
        return json(res, { task: id });
      }
      if (p === "/api/save/backup/delete") {
        const backup = q.get("backup") || "";
        const id = runTask("save-backup-delete", async (log) => deleteBackup(backup, log));
        return json(res, { task: id });
      }
    }
    return json(res, { error: "unknown api" }, 404);
  }

  if (req.method === "GET") return serveStatic(res, p);
  return json(res, { error: "method not allowed" }, 405);
});

function readSettings() {
  const f = path.join(ROOT, "launcher-settings.json");
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return {};
  }
}

function cut(sha) {
  return sha ? String(sha).slice(0, 7) : "-";
}

function saveSettings(patch) {
  const f = path.join(ROOT, "launcher-settings.json");
  const cur = readSettings();
  const next = { ...cur, ...patch };
  fs.writeFileSync(f, JSON.stringify(next, null, 2), "utf8");
  return next;
}

ensureDirs();
server.listen(PORT, () => {
  console.log(`Bachelor:Re UI server -> http://127.0.0.1:${PORT}`);
  ensureTailers(); // pick up logs from services started in another process
  setInterval(ensureTailers, 3000);
});
