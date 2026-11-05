import fs from "node:fs";
import path from "node:path";
import { getComponent, allComponents } from "./manifest.js";
import { readComponent, patchComponent, writeState, readState } from "./store.js";
import { dirs, ensureDirs } from "./paths.js";
import { runCmd, downloadToFile, topLevelDir, extractZip } from "./proc.js";
import { applyPatches } from "./patcher.js";

const GH_API = "https://api.github.com";
const UA = { "User-Agent": "BachelorRe/0.1", Accept: "application/vnd.github+json" };

export function shortSha(sha) {
  return (sha || "").slice(0, 7);
}

/** Latest master commit SHA for a component (source of truth for "new version"). */
export async function remoteHead(component, onLine) {
  const url = `${GH_API}/repos/${component.github.owner}/${component.github.repo}/commits/${component.branch}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`GitHub commit lookup failed: HTTP ${res.status}`);
  const j = await res.json();
  return {
    sha: j.sha,
    date: (j.commit?.committer?.date || "").slice(0, 10),
    message: (j.commit?.message || "").split("\n")[0],
  };
}

/** Remote status vs local known sha. */
export async function checkComponent(component, onLine) {
  const head = await remoteHead(component, onLine);
  const local = readComponent(component.id);
  const installed = local.installs[shortSha(head.sha)] ? true : false;
  return {
    id: component.id,
    name: component.name,
    role: component.role,
    remoteSha: head.sha,
    remoteDate: head.date,
    remoteMessage: head.message,
    knownSha: local.knownSha,
    updateAvailable: local.knownSha !== head.sha,
    installed,
    activeDir: local.activeDir,
  };
}

export async function checkAll(onLine) {
  ensureDirs();
  const results = [];
  for (const comp of allComponents()) {
    try {
      results.push(await checkComponent(comp, onLine));
    } catch (err) {
      results.push({ id: comp.id, name: comp.name, error: err.message });
    }
  }
  writeState({ ...readState(), lastCheckAt: new Date().toISOString() });
  return results;
}

/**
 * Install a component version into components/<id>/<shortSha>/ (never overwrites).
 * Returns the new local record { sha, dir, date }.
 */
export async function installComponent(component, { onLine, skipIfPresent = true } = {}) {
  ensureDirs();
  const d = dirs();
  const head = await remoteHead(component, onLine);
  const sha7 = shortSha(head.sha);

  onLine?.(`[${component.id}] upstream ${component.name} @ ${sha7} (${head.date})`);

  const existing = readComponent(component.id).installs[sha7];
  if (existing?.dir && fs.existsSync(existing.dir)) {
    if (skipIfPresent) {
      onLine?.(`[${component.id}] already installed at ${existing.dir} — nothing to do`);
      return present(existing);
    }
  }

  const zipPath = path.join(d.downloadDir, `${component.id}-${sha7}.zip`);
  onLine?.(`[${component.id}] downloading zipball (this can be large)…`);
  await downloadToFile(
    `https://github.com/${component.github.owner}/${component.github.repo}/archive/refs/heads/${component.branch}.zip`,
    zipPath,
    (m) => onLine?.(`[${component.id}] ${m}`)
  );

  const destDir = path.resolve(d.componentDir, component.id, sha7);
  fs.mkdirSync(destDir, { recursive: true });

  // extract into a staging dir first, then identify the single repo root folder
  const stage = path.join(d.downloadDir, `.stage-${component.id}-${sha7}`);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  onLine?.(`[${component.id}] extracting…`);
  const ext = await extractZip(zipPath, stage, (m) => onLine?.(`[${component.id}] ${m}`));

  const repoRoot = topLevelDir(stage);
  if (!repoRoot) {
    throw new Error(`[${component.id}] unexpected zip layout in ${stage}`);
  }
  // move repo root contents up into destDir
  for (const entry of fs.readdirSync(repoRoot)) {
    fs.renameSync(path.join(repoRoot, entry), path.join(destDir, entry));
  }
  fs.rmSync(stage, { recursive: true, force: true });

  // verify markers
  const missing = (component.marker || []).filter((mk) => !fs.existsSync(path.join(destDir, ...mk.split("/"))));
  if (missing.length) {
    onLine?.(`[${component.id}] WARN missing marker files: ${missing.join(", ")}`);
  } else {
    onLine?.(`[${component.id}] markers OK (${component.marker.length} files)`);
  }

  const record = { sha: head.sha, dir: destDir, date: head.date, extractedWith: ext.tool, installedAt: new Date().toISOString() };
  patchComponent(component.id, {
    knownSha: head.sha,
    installs: { ...readComponent(component.id).installs, [sha7]: record },
    activeDir: destDir, // tentative until validate (M2); keeps "latest wins" for now
  });
  onLine?.(`[${component.id}] installed -> ${destDir} (${path.relative(dirs().root, destDir)})`);
  return present(record);
}

function present(record) {
  return { sha: record.sha, dir: record.dir, date: record.date, installedAt: record.installedAt };
}

/** Install all components that have an update. Returns report. Auto-applies the patch catalog (M2). */
export async function updateAll(onLine, opts = {}) {
  ensureDirs();
  const report = [];
  for (const comp of allComponents()) {
    try {
      const st = await checkComponent(comp, onLine);
      if (st.updateAvailable) {
        const rec = await installComponent(comp, { onLine });
        const entry = { id: comp.id, installed: true, sha7: shortSha(rec.sha), dir: rec.dir };
        if (opts.patch !== false) {
          onLine?.(`[${comp.id}] applying patch catalog…`);
          const patchRows = await applyPatches({ onLine });
          entry.patches = patchRows.map((r) => `${r.id}:${r.action}`);
        }
        report.push(entry);
      } else {
        report.push({ id: comp.id, installed: false, reason: "up-to-date", activeDir: st.activeDir });
      }
    } catch (err) {
      report.push({ id: comp.id, installed: false, error: err.message });
    }
  }
  return report;
}
