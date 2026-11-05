// Tail service log files into the shared ring buffer (Logs tab) — poll appended bytes.
// Tolerates the file not existing yet (daemon creates it after spawn) and truncation.
import fs from "node:fs";
import { makeLinePump } from "./log-store.js";
import { recordRead } from "./service-state.js";

const trackers = new Map(); // file -> { timer, pos }

/** Start tailing `file` into the log ring under `source`. Idempotent per file. */
export function tailFile(file, source) {
  if (!file || trackers.has(file)) return trackers.get(file);
  const pump = makeLinePump(source);
  const st = { pump, pos: 0 };
  const timer = setInterval(() => {
    try {
      const fst = fs.statSync(file);
      if (!fst.isFile()) return;
      if (st.pos > fst.size) st.pos = 0; // truncated/rotated
      if (fst.size === st.pos) return;
      const len = fst.size - st.pos;
      const fd = fs.openSync(file, "r");
      const buf = Buffer.alloc(len);
      try {
        fs.readSync(fd, buf, 0, len, st.pos);
      } finally {
        fs.closeSync(fd);
      }
      st.pos = fst.size;
      pump(buf.toString("utf8"));
    } catch {
      /* file may vanish mid-service / not exist yet; ignore */
    }
  }, 700);
  timer.unref?.();
  trackers.set(file, { timer, ...st });
  return timer;
}

export function stopTails(file) {
  const t = trackers.get(file);
  if (t) {
    clearInterval(t.timer);
    trackers.delete(file);
  }
}

export function stopAllTails() {
  for (const t of trackers.values()) clearInterval(t.timer);
  trackers.clear();
}

/** Keep the active service log files streamed into the ring (call from the long-lived ui-server). */
export function ensureTailers() {
  for (const kind of ["server", "game"]) {
    const rec = recordRead(kind);
    if (!rec?.logFile || trackers.has(rec.logFile)) continue;
    tailFile(rec.logFile, kind === "server" ? "S" : "C");
  }
}

/** Erase the on-disk service logs the tailers ingest. Clearing only the ring is not
 *  enough: when the ui-server restarts it re-reads those files from pos 0 and the
 *  "cleared" lines come straight back. Truncation is safe while a service keeps
 *  running — the child holds its own O_APPEND fd and continues writing at the
 *  (new) end of file. */
export function wipeServiceLogs() {
  const files = new Set(trackers.keys());
  for (const kind of ["server", "game"]) {
    const rec = recordRead(kind);
    if (rec?.logFile) files.add(String(rec.logFile));
  }
  for (const file of files) {
    try {
      fs.truncateSync(file, 0);
    } catch {
      /* file missing or momentarily locked — best effort */
    }
  }
  for (const st of trackers.values()) st.pos = 0;
}
