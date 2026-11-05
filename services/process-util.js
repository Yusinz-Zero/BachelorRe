// Shared process helpers for services (Windows-friendly).
import { execFileSync } from "node:child_process";

/** Force-kill a process and its tree on Windows (taskkill /T /F), best-effort.
 *  taskkill MUST run while the parent pid is still alive — the /T switch only
 *  walks descendants that exist in the snapshot; killing the parent first
 *  orphans the children and they survive. */
export function killTree(pid) {
  if (!pid) return false;
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } catch {
    /* parent may be gone already — try the children via a fresh snapshot? best effort */
  }
  try {
    process.kill(pid); // make sure the parent itself is gone too
  } catch {
    /* ignore */
  }
  return true;
}

export function processAlive(proc) {
  return !!proc && proc.exitCode === null && !proc.killed;
}
