// Bachelor:Re — declarative patch engine (M2)
// - patches = ESM modules in patches/*.js, each default-exporting one patch object OR an array of them.
// - A patch is idempotent: isApplied(componentDir, ctx) must reflect current filesystem truth,
//   apply(componentDir, ctx) must leave the tree in a state where isApplied() === true.
// - Patches may be gated by launcher settings (e.g. pc-setup only when GamePath set).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { dirs } from "./paths.js";
import { readSettings } from "./settings.js";
import { readComponent } from "./store.js";
import { componentVenv } from "./installer.js";
import { runCmd } from "./proc.js";

const PATCHES_DIR = path.join(dirs().root, "patches");
const PATCH_CACHE = new Map();

/** Build the ctx handed to every patch. */
export function makeCtx(onLine) {
  return {
    settings: readSettings(),
    env: process.env,
    root: dirs().root,
    onLine: onLine || (() => {}),
    runCmd,
    componentVenv,
  };
}

/** Load & normalize all patch definitions (skips helpers/, gathers arrays). */
export async function loadPatches(ctx) {
  if (PATCH_CACHE.size) return [...PATCH_CACHE.values()];
  const files = fs
    .readdirSync(PATCHES_DIR)
    .filter((f) => f.endsWith(".js") && !f.startsWith("_"));
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(PATCHES_DIR, f)).href);
    const defs = Array.isArray(mod.default) ? mod.default : [mod.default];
    for (const d of defs) {
      if (!d || !d.id) continue;
      PATCH_CACHE.set(d.id, d);
    }
  }
  return [...PATCH_CACHE.values()];
}

export function activeDirOf(componentId) {
  try {
    const rec = readComponent(componentId);
    return rec?.activeDir?.length ? rec.activeDir : null;
  } catch {
    return null;
  }
}

/** Evaluate every (enabled) patch against its component's active dir. */
export async function patchStatus(onLine) {
  const ctx = makeCtx(onLine);
  const patches = await loadPatches(ctx);
  return patches.map((p) => {
    const enabled = typeof p.enabled === "function" ? p.enabled(ctx) : true;
    const compDir = activeDirOf(p.component);
    let state = "no-active";
    let applied = false;
    if (compDir) {
      try {
        applied = p.isApplied(compDir, ctx);
        state = applied ? "applied" : "pending";
      } catch (e) {
        state = "error";
      }
    }
    return {
      id: p.id,
      component: p.component,
      title: p.title || p.id,
      description: p.description || "",
      optional: !!p.optional,
      enabled,
      compDir,
      state,
      applied,
      isAppliedError: state === "error" ? String(p._lastError || "isApplied threw") : undefined,
    };
  });
}

/**
 * Apply patches.
 * opts: { only, dryRun, force, onLine }
 * - dryRun: only report what would change, call nothing.
 * - only:   comma list of patch ids.
 * - force:  re-apply even if isApplied() already true.
 * Returns detail rows (one per patch).
 */
export async function applyPatches(opts = {}) {
  const onLine = opts.onLine || (() => {});
  const ctx = makeCtx(onLine);
  const patches = await loadPatches(ctx);
  const onlySet = opts.only ? new Set(String(opts.only).split(",").map((s) => s.trim())) : null;
  const report = [];

  for (const p of patches) {
    const enabled = typeof p.enabled === "function" ? p.enabled(ctx) : true;
    if (onlySet && !onlySet.has(p.id)) continue;
    if (!onlySet && !enabled) {
      report.push({ id: p.id, component: p.component, title: p.title || p.id, action: "skipped-disabled", detail: "patch disabled by settings" });
      continue;
    }

    const compDir = activeDirOf(p.component);
    if (!compDir) {
      report.push({ id: p.id, component: p.component, title: p.title || p.id, action: "skipped-no-active", detail: "component has no active install" });
      continue;
    }

    let applied = false;
    try {
      applied = p.isApplied(compDir, ctx);
    } catch (e) {
      report.push({ id: p.id, component: p.component, title: p.title || p.id, action: "error", detail: "isApplied threw: " + e.message });
      continue;
    }

    if (applied && !opts.force) {
      report.push({ id: p.id, component: p.component, title: p.title || p.id, action: "already-applied", detail: "idempotent; nothing to do" });
      continue;
    }

    if (opts.dryRun) {
      report.push({ id: p.id, component: p.component, title: p.title || p.id, action: "dry-run", detail: "would apply (or: applied) to " + compDir });
      continue;
    }

    try {
      const res = await p.apply(compDir, ctx);
      report.push({
        id: p.id,
        component: p.component,
        title: p.title || p.id,
        action: res?.changed === false ? "no-op" : "applied",
        detail: res?.detail || "ok",
        dir: path.relative(dirs().root, compDir),
      });
    } catch (e) {
      report.push({ id: p.id, component: p.component, title: p.title || p.id, action: "failed", detail: e.message });
    }
  }
  return report;
}
