import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Run a command, streaming raw stdout lines (stripped) to the optional log callback.
 * Returns { code, stdout, stderr }.
 */
export function runCmd(cmd, args, options = {}, onLine) {
  return new Promise((resolve) => {
    const opts = {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      shell: options.shell ?? false,
      // never let a child allocate its own console window (git/npm/pip are
      // console subsystem executables — without this they pop an empty cmd
      // window when the ui-server runs console-less inside the Tauri shell)
      windowsHide: true,
    };
    const child = spawn(cmd, args, opts);
    const acc = { stdout: "", stderr: "" };

    const pump = (stream, target, onErr) => {
      let buf = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        acc[target] += chunk;
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).replace(/\r$/, "");
          buf = buf.slice(idx + 1);
          if (onLine && line.trim()) onLine(line);
        }
      });
      stream.on("error", onErr);
    };
    if (child.stdout) pump(child.stdout, "stdout", () => {});
    if (child.stderr) pump(child.stderr, "stderr", () => {});
    child.on("close", (code) => resolve({ code, stdout: acc.stdout, stderr: acc.stderr }));
    child.on("error", (err) => resolve({ code: -1, error: err.message, stdout: acc.stdout, stderr: acc.stderr }));
  });
}

/** Stream-download a URL to a file with progress lines. */
export async function downloadToFile(url, dest, onProgress) {
  const check = await fetch(url, { redirect: "follow", headers: { "User-Agent": "BachelorRe/0.1" } });
  if (!check.ok) throw new Error(`download failed: HTTP ${check.status} ${check.statusText}`);
  const total = Number(check.headers.get("content-length")) || 0;
  const reader = check.body.getReader();
  const ws = fs.createWriteStream(dest);
  let received = 0;
  let lastPct = -1;
  const dec = new TextDecoder();
  let chunkTail = Buffer.alloc(0);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (total && onProgress) {
      const pct = Math.floor((received / total) * 100);
      if (pct >= lastPct + 5) {
        lastPct = pct;
        onProgress(`download ${pct}% (${fmt(received)}/${fmt(total)})`);
      }
    }
    // emit data for onProgress text too (rare), keep it cheap:
    ws.write(Buffer.from(value));
    void dec;
    void chunkTail;
  }
  await new Promise((res, rej) => ws.end((e) => (e ? rej(e) : res())));
  if (onProgress) onProgress(`download 100% (${fmt(received)})`);
  return { bytes: received, total };
}

function fmt(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${u[i]}`;
}

/** Find single top-level dir inside an extracted zip staging dir. */
export function topLevelDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length !== 1 || entries.length !== dirs.length) return null;
  return path.join(dir, dirs[0].name);
}

/** Extract a zip (tar.exe first, PowerShell Expand-Archive as fallback). */
export async function extractZip(zipPath, destDir, onLine) {
  fs.mkdirSync(destDir, { recursive: true });
  const tarExe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  if (fs.existsSync(tarExe)) {
    const res = await runCmd(tarExe, ["-xf", zipPath, "-C", destDir], {}, onLine);
    if (res.code === 0) return { tool: "tar" };
  }
  const res = await runCmd(
    "powershell.exe",
    ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`],
    {},
    onLine
  );
  if (res.code !== 0) throw new Error(`extract failed: ${res.stderr || res.error}`);
  return { tool: "powershell" };
}
