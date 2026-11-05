// Spawn long-running child processes that survive launcher exit (detached daemons).
//
// Two modes:
// - interactive=false (server S, C game bridge — daemon): pass an opened append fd as
//   stdout+stderr so the child writes straight into the log file at the OS level and keeps
//   running + writing even after this Node process exits. Verified on Windows (libuv
//   duplicates the handle into the child). The C bridge receives trainer commands through
//   a command file, so it needs no stdin either.
// - interactive=true (legacy pipe mode): spawn with a stdin/stdout/stderr pipe; stdout/stderr
//   are streamed into the log file by this process, which dies with the launcher. Currently
//   unused — the trainer moved to the command-file channel.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { dirs } from "../core/paths.js";

export function logPathFor(name, pid) {
  return path.join(dirs().logDir, `service-${name}-${pid}.log`);
}

/**
 * Launch a detached child.
 * @param {object} o
 * @param {string} o.cmd        executable path
 * @param {string[]} [o.args]
 * @param {string} [o.cwd]
 * @param {string} o.name       base name for the log file
 * @param {boolean} [o.interactive] legacy pipe mode (own log pump) — default false
 * @returns {{child: import("node:child_process").ChildProcess, pid: number, logPath: string}}
 */
export function launchDetached({ cmd, args = [], cwd, name, interactive = false }) {
  fs.mkdirSync(dirs().logDir, { recursive: true });

  if (interactive) {
    const child = spawn(cmd, args, {
      cwd,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const logPath = logPathFor(name, child.pid);
    child.stdout?.pipe(fs.createWriteStream(logPath, { flags: "a" }));
    child.stderr?.pipe(fs.createWriteStream(logPath, { flags: "a" }));
    child.stdin?.setDefaultEncoding?.("utf8");
    child.unref();
    return { child, pid: child.pid, logPath };
  }

  // daemon mode: child's stdout+stderr = an opened append fd (OS-level, duplicate survives us)
  const logPath = path.join(dirs().logDir, `service-${name}.log`);
  const fd = fs.openSync(logPath, "a");
  const child = spawn(cmd, args, {
    cwd,
    detached: true,
    stdio: ["ignore", fd, fd],
    windowsHide: true,
  });
  fs.closeSync(fd); // the child holds its own duplicate
  child.unref();
  return { child, pid: child.pid, logPath };
}
