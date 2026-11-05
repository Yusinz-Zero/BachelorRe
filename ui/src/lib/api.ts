// Thin typed client for the Bachelor:Re ui-server API (server/ui-server.js, port 5178).
// Works in the browser (vite dev proxies /api, ui-server serves built dist same-origin)
// and inside the Tauri webview (absolute URL to the local ui-server).

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

const inTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
// Vite dev (5173) proxies /api -> 5178; ui-server static (5178) is same-origin.
// Tauri webview loads from the custom protocol, so it must call the HTTP API absolutely.
export const API_BASE = inTauri ? "http://127.0.0.1:5178" : "";

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  return (await res.json()) as T;
}

export interface ComponentRec {
  knownSha: string | null;
  activeDir: string | null;
  installs: Record<string, unknown>;
}

export interface LauncherState {
  schema?: number;
  lastCheckAt: string | null;
  components: Record<string, ComponentRec>;
}

export interface StatusResponse {
  state: LauncherState;
  settings: Record<string, unknown>;
  env?: { uiPort?: number };
}

export interface HealthSettings {
  region: string;
  clientVersion: string;
  serverPort: number;
  gamePath: string;
  rosterMode: string;
}

export interface HealthResponse {
  settings: HealthSettings;
  server: { listening: boolean; port?: number; pid?: number | null };
  game: { ready: boolean; reason?: string | null; detail?: string | null; running?: boolean; pid?: number | null };
  trainer: { attached: boolean; commands?: string[]; hint?: string };
  version: { dir: string | null; want: string; actual: string | null; mismatch: boolean | null };
  readyToPlay: boolean;
}

export interface PatchInfo {
  id: string;
  component: string;
  title: string;
  description: string;
  optional: boolean;
  enabled: boolean;
  compDir: string | null;
  state: "applied" | "pending" | "no-active" | "error";
  applied: boolean;
  isAppliedError?: string;
}

export interface LogLine {
  seq: number;
  at: string;
  source: string;
  text: string;
}

export interface SaveFileInfo {
  exists: boolean;
  size?: number;
  at?: string;
}

export interface SaveUser {
  dir: string;
  user: string;
  empty: boolean;
  files: Record<string, SaveFileInfo>;
}

export interface SaveBackup {
  dir: string;
  stamp: string;
  user: string;
  empty: boolean;
  files: Record<string, SaveFileInfo>;
}

export interface SaveStatus {
  sDir: string | null;
  savRoot: string | null;
  serverRunning: boolean;
  gameRunning: boolean;
  canEdit: boolean;
  users: SaveUser[];
  backups: SaveBackup[];
  note?: string;
}

export interface TaskStatus {
  id: string;
  lines: string[];
  done: boolean;
  error: string | null;
  result?: unknown;
}

export interface PcStatus {
  compDir: string | null;
  gamePath: string | null;
  recorded: string | null;
  akTxt: boolean;
  bak: boolean;
  victimDllPresent: boolean;
  injected: boolean;
  detail: string;
}

export interface PcDoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PcDoctor {
  ok: boolean;
  checks: PcDoctorCheck[];
  gamePath: string | null;
}

export const api = {
  status: () => request<StatusResponse>("/api/status"),
  health: () => request<HealthResponse>("/api/health"),
  logs: (n = 400) => request<{ lines: LogLine[] }>(`/api/logs?n=${n}`),
  clearLogs: () => request<{ ok: boolean }>("/api/logs/clear", { method: "POST" }),

  /** Dump the whole ring buffer to a timestamped .log file on disk. */
  logsExport: () =>
    request<{ ok?: boolean; path?: string; count?: number; error?: string }>("/api/logs/export", {
      method: "POST",
    }),
  patchStatus: () => request<PatchInfo[]>("/api/patch-status"),
  task: (id: string) => request<TaskStatus>(`/api/task/${id}`),
  pcStatus: () => request<PcStatus>("/api/pc/status"),
  pcDoctor: () => request<PcDoctor>("/api/pc/doctor"),
  browseGamePath: () =>
    request<{ path: string | null; error?: string }>("/api/pc/browse", { method: "POST" }),
  bgList: () => request<{ images: string[] }>("/api/bg/list"),
  saveStatus: () => request<SaveStatus>("/api/save/status"),

  /** Send a trainer command line to the headless C bridge ("enable zero_cost" etc.). */
  trainer: (cmd: string) =>
    request<{ ok?: boolean; sent?: string; reason?: string }>("/api/trainer", {
      method: "POST",
      body: JSON.stringify({ cmd }),
    }),

  post: (path: string, body?: unknown) =>
    request<{ task?: string; ok?: boolean; error?: string }>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  saveSettings: (patch: Record<string, unknown>) =>
    request<{ ok?: boolean; error?: string }>("/api/save-settings", {
      method: "POST",
      body: JSON.stringify(patch),
    }),

  /** Open an external URL in the system browser (host-allowlisted server-side). */
  openUrl: (url: string) =>
    request<{ ok?: boolean; error?: string }>("/api/open-url", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
};

/** Shorten a long absolute path for display. */
export function shortPath(p: string | null | undefined, tail = 44): string {
  if (!p) return "—";
  const s = String(p).replace(/\\/g, "/");
  return s.length <= tail + 3 ? s : `…${s.slice(-tail)}`;
}
