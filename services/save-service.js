// Save edit (M6): manage the OpenBachelorS player saves of the active S install.
// How saves work upstream: S stores each account as small delta overlays on top
// of a built-in template that ALREADY has everything unlocked (data/tmpl.json
// enriched from res/excel at startup — all operators maxed, skins, story, etc.),
// so a brand-new save IS the unlock-everything account. "Fresh start" therefore
// means clearing the delta files (they are simply re-created empty on next
// login) — no template file is shipped or rewritten.
// Every destructive action first writes an automatic backup into
// <S>/multi_sav_backups/<stamp>__<user> so lost progress can be restored.
// Mutations are refused while the S server or the game is running: S re-reads
// and re-saves the delta files on every request, so concurrent writes would race
// and could be overwritten.
import fs from "node:fs";
import path from "node:path";
import { readComponent } from "../core/store.js";
import { serverStatus } from "./server-service.js";
import { gameStatus } from "./game-service.js";

const SAVE_FILES = ["delta.json", "pending_delta.json", "extra.json"];
const REPLAY_DIR = "replay";
const NAME_RE = /^[\w%!'~*()\-.$]+$/; // encodeURIComponent("...") output is safe on NTFS

function activeSDir() {
  try {
    return readComponent("S")?.activeDir || null;
  } catch {
    return null;
  }
}

function decodeUser(name) {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function fileStat(fp) {
  try {
    const st = fs.statSync(fp);
    return { exists: true, size: st.size, at: st.mtime.toISOString() };
  } catch {
    return { exists: false };
  }
}

function snapshot(root, name) {
  const dir = path.join(root, name);
  const files = {};
  for (const f of SAVE_FILES) files[f] = fileStat(path.join(dir, f));
  let empty = true;
  const stat = files["delta.json"];
  if (stat?.exists) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, "delta.json"), "utf8"));
      empty =
        (!d?.modified || Object.keys(d.modified).length === 0) &&
        (!d?.deleted || Object.keys(d.deleted).length === 0);
    } catch {
      empty = false; // unparseable delta: treat as real progress, never as fresh
    }
  }
  return { dir: name, user: decodeUser(name), files, empty };
}

function listChildren(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return [];
  }
}

function listBackups() {
  const sDir = activeSDir();
  const bRoot = sDir ? path.join(sDir, "multi_sav_backups") : null;
  if (!bRoot) return [];
  return listChildren(bRoot)
    .map((e) => e.name)
    .filter((n) => n.includes("__"))
    .sort()
    .reverse()
    .map((n) => {
      const i = n.indexOf("__");
      const stamp = n.slice(0, i);
      const userDir = n.slice(i + 2);
      return { ...snapshot(bRoot, n), stamp, user: decodeUser(userDir) };
    });
}

async function canEditState() {
  const sDir = activeSDir();
  const root = sDir ? path.join(sDir, "multi_sav") : null;
  const [srv, game] = [await serverStatus(), await gameStatus()];
  const serverRunning = !!srv.listening;
  const gameRunning = !!game.running;
  return {
    sDir,
    root,
    backupsRoot: sDir ? path.join(sDir, "multi_sav_backups") : null,
    serverRunning,
    gameRunning,
    canEdit: !!root && !serverRunning && !gameRunning,
  };
}

/** GET /api/save/status payload. */
export async function saveStatus() {
  const st = await canEditState();
  const users = st.root
    ? listChildren(st.root)
        .map((e) => e.name)
        .filter((n) => n !== REPLAY_DIR)
        .map((n) => snapshot(st.root, n))
    : [];
  return {
    sDir: st.sDir,
    savRoot: st.root,
    serverRunning: st.serverRunning,
    gameRunning: st.gameRunning,
    canEdit: st.canEdit,
    users,
    backups: listBackups(),
    note: st.sDir ? undefined : "S component has no active install",
  };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Copy a folder tree (files + subdirs) recursively. */
function copyTree(src, dst, log = () => {}) {
  fs.mkdirSync(dst, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyTree(s, d, log);
    else {
      fs.copyFileSync(s, d);
      log(`copied ${path.basename(dst)}/${ent.name}`);
    }
  }
}

async function guard(log = () => {}) {
  const st = await canEditState();
  if (!st.root) {
    log("save edit refused: no active S install");
    return { ok: false, reason: "no-active-S" };
  }
  if (st.serverRunning) {
    log("save edit refused: the S server is running — press Stop Server first (writes would race with its per-request saves)");
    return { ok: false, reason: "server-running" };
  }
  if (st.gameRunning) {
    log("save edit refused: the game is running — close it first");
    return { ok: false, reason: "game-running" };
  }
  return { ok: true, sDir: st.sDir, root: st.root, backupsRoot: st.backupsRoot };
}

function validateChild(root, name) {
  if (!name || !NAME_RE.test(name)) return null;
  const dir = path.resolve(root, name);
  if (dir !== path.resolve(root) && !dir.startsWith(path.resolve(root) + path.sep)) return null;
  return dir;
}

/** Backup one user's save (or every user when userDir is undefined). */
export async function backupSave(userDir, log = () => {}) {
  const st = await guard(log);
  if (!st.ok) return { ok: false, reason: st.reason };
  const users = listChildren(st.root)
    .map((e) => e.name)
    .filter((n) => n !== REPLAY_DIR);
  const targets = userDir ? users.filter((n) => n === userDir) : users;
  if (userDir && targets.length === 0) {
    log(`save backup refused: unknown user "${userDir}"`);
    return { ok: false, reason: "unknown-user" };
  }
  const made = [];
  fs.mkdirSync(st.backupsRoot, { recursive: true });
  for (const u of targets) {
    const name = `${stamp()}__${u}`;
    copyTree(path.join(st.root, u), path.join(st.backupsRoot, name), log);
    log(`backup ok: ${name}`);
    made.push(name);
  }
  return { ok: true, backup: made.join(", ") };
}

/** Fresh start: auto-backup then clear the delta files; next login = fresh
 *  account on the unlock-everything built-in template. */
export async function resetSave(userDir, log = () => {}) {
  const st = await guard(log);
  if (!st.ok) return { ok: false, reason: st.reason };
  const dir = validateChild(st.root, userDir);
  if (!dir || !fs.existsSync(dir)) {
    log(`save reset refused: unknown user "${userDir || ""}"`);
    return { ok: false, reason: "unknown-user" };
  }
  log(`fresh start for ${decodeUser(userDir)} — backing up current save first`);
  const bk = await backupSave(userDir, log);
  if (!bk.ok) return bk;
  for (const f of SAVE_FILES) {
    const fp = path.join(dir, f);
    if (fs.existsSync(fp)) {
      fs.rmSync(fp, { force: true });
      log(`removed ${f}`);
    }
  }
  log("save cleared — next login starts a new account on the built-in unlock-everything template");
  return { ok: true, backup: bk.backup };
}

/** Restore a backup folder (auto-backs up the current state first). */
export async function restoreSave(backupName, log = () => {}) {
  const st = await guard(log);
  if (!st.ok) return { ok: false, reason: st.reason };
  const src = validateChild(st.backupsRoot, backupName);
  if (!src || !fs.existsSync(src)) {
    log(`restore refused: unknown backup "${backupName || ""}"`);
    return { ok: false, reason: "unknown-backup" };
  }
  const i = backupName.indexOf("__");
  const userDir = backupName.slice(i + 2);
  const dst = path.join(st.root, userDir);
  log(`restoring ${backupName} for ${decodeUser(userDir)} — backing up current save first`);
  const cur = validateChild(st.root, userDir);
  if (cur && fs.existsSync(cur)) {
    const bk = await backupSave(userDir, log);
    if (!bk.ok) return bk;
  }
  fs.mkdirSync(dst, { recursive: true });
  for (const f of SAVE_FILES) fs.rmSync(path.join(dst, f), { force: true });
  copyTree(src, dst, log);
  log("restore ok — start the game to play this save");
  return { ok: true, backup: backupName };
}

/** Delete an old backup folder. */
export async function deleteBackup(backupName, log = () => {}) {
  const sDir = activeSDir();
  const bRoot = sDir ? path.join(sDir, "multi_sav_backups") : null;
  const dir = bRoot ? validateChild(bRoot, backupName) : null;
  if (!dir || !fs.existsSync(dir)) {
    log(`delete refused: unknown backup "${backupName || ""}"`);
    return { ok: false, reason: "unknown-backup" };
  }
  fs.rmSync(dir, { recursive: true, force: true });
  log(`backup deleted: ${backupName}`);
  return { ok: true };
}
