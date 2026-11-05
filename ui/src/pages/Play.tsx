import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Play as PlayIcon,
  Square,
  RefreshCcw,
  ChevronDown,
  Menu,
  Settings as SettingsIcon,
  AlertTriangle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, type HealthResponse, type LogLine } from "../lib/api";
import { usePoll, fmtTime } from "../hooks";
import { AnimateYFade } from "../components/layout";
import { LogViewer } from "../components/log-viewer";
import { TrainerPanel } from "../components/trainer-panel";
import { Button, Spinner } from "../components/ui";
import { cn } from "../lib/utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FlowState =
  | { phase: "idle" }
  | { phase: "booting"; lines: string[] }
  | { phase: "running" }
  | { phase: "stopping"; lines: string[] }
  | { phase: "error"; lines: string[] };

export function PlayPage() {
  const { data: health, refresh: refreshHealth } = usePoll<HealthResponse>(() => api.health(), 3000);

  const [flow, setFlow] = useState<FlowState>({ phase: "idle" });
  const runId = useRef(0);

  const logAppend = useCallback((kind: "booting" | "stopping" | "error") => (s: string) => {
    setFlow((f) => {
      if (f.phase !== kind) return f;
      return { phase: kind, lines: [...f.lines, `[${fmtTime(new Date().toISOString())}] ${s}`] };
    });
  }, []);

  const startTask = useCallback(
    async (endpoint: string, kind: "booting" | "stopping" | "error", label: string): Promise<boolean> => {
      const log = logAppend(kind);
      log(`→ ${label}…`);
      const res = await api.post(endpoint);
      if (res.error) {
        log(`✖ ${res.error}`);
        return false;
      }
      if (!res.task) return true;
      for (;;) {
        const t = await api.task(res.task);
        for (const ln of t.lines) log(ln);
        if (t.done) {
          if (t.error) {
            log(`✖ ${t.error}`);
            return false;
          }
          // surfaced failures: the task completed but reported ok:false
          const r = t.result as { ok?: boolean; reason?: string; detail?: string } | null | undefined;
          if (r && r.ok === false) {
            log(`✖ ${r.detail || r.reason || "failed"}`);
            return false;
          }
          return true;
        }
        await sleep(700);
      }
    },
    [logAppend]
  );

  const play = useCallback(async () => {
    const id = ++runId.current;
    setFlow({ phase: "booting", lines: [] });
    const okServer = await startTask("/api/server/start", "booting", "Boot S server (uvicorn)");
    if (id !== runId.current) return;
    if (!okServer) {
      setFlow((f) => ({ phase: "error", lines: f.phase === "booting" ? f.lines : [] }));
      return;
    }
    const okGame = await startTask("/api/game/start", "booting", "Launch game + attach C (--attach_pc)");
    if (id !== runId.current) return;
    setFlow(okGame ? { phase: "running" } : { phase: "error", lines: [] });
    refreshHealth();
  }, [startTask, refreshHealth]);

  const stop = useCallback(async () => {
    const id = ++runId.current;
    setFlow({ phase: "stopping", lines: [] });
    const okGame = await startTask("/api/game/stop", "stopping", "Close game (attach)");
    if (id !== runId.current) return;
    const okServer = await startTask("/api/server/stop", "stopping", "Stop S server");
    if (id !== runId.current) return;
    setFlow({ phase: "idle" });
    refreshHealth();
  }, [startTask, refreshHealth]);

  // Relaunch the game only — the S server keeps running (Stop closes BOTH).
  const restartGame = useCallback(async () => {
    const id = ++runId.current;
    setFlow({ phase: "stopping", lines: [] });
    await startTask("/api/game/stop", "stopping", "Close game only — server stays up");
    if (id !== runId.current) return;
    setFlow({ phase: "booting", lines: [] });
    const okGame = await startTask("/api/game/start", "booting", "Launch game again (server untouched)");
    if (id !== runId.current) return;
    setFlow(okGame ? { phase: "running" } : { phase: "error", lines: [] });
    refreshHealth();
  }, [startTask, refreshHealth]);

  // --- LOGS collapsible (fetches/polls only while open) ---
  const [logsOpen, setLogsOpen] = useState(false);
  // --- TRAINER console collapsible (commands to the headless C bridge) ---
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [logs, setLogs] = useState<LogLine[] | null>(null);
  useEffect(() => {
    if (!logsOpen) return;
    let alive = true;
    const fetchLogs = async () => {
      try {
        const r = await api.logs(200);
        if (alive) setLogs(r.lines);
      } catch {
        /* ui-server still booting / down */
      }
    };
    fetchLogs();
    const t = window.setInterval(fetchLogs, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [logsOpen]);

  // --- status menu (the round "3 lines" button next to Start Game) ---
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const busy = flow.phase === "booting" || flow.phase === "stopping";
  const h = health;
  // "running" = something is actually up: server process, game process or a
  // attached trainer. game.ready is only *setup completeness* — pressing
  // Setup in PC Hook flips it true and must NOT turn the button into "Stop".
  const running =
    !!(h?.server?.listening || h?.game?.running || h?.trainer?.attached) || flow.phase === "running";
  // Start's own gate: game preflight OK + version matches — booting the S
  // server is Start Game's own job, so server.listening is not required here.
  const canStart = !!(h?.game?.ready && !h?.version?.mismatch);
  const ready = h?.readyToPlay ?? false;
  const stopMode = running && !busy;
  // Hover tooltip explaining why Start Game is currently disabled.
  const startBlockedReason = !h
    ? "Connecting to ui-server — can't check what is missing yet"
    : canStart
      ? null
      : h?.version?.mismatch
        ? "Client version mismatch — run Check for Update in Components"
        : h.game?.detail || "Setup not finished — check the status banner";
  const activeLines = "lines" in flow ? (flow as { lines: string[] }).lines : [];

  // banner copy
  const bannerTitle =
    flow.phase === "booting"
      ? "Booting — S server then game (PC attach)…"
      : flow.phase === "stopping"
        ? "Stopping…"
        : flow.phase === "error"
          ? "Boot failed — see log above"
          : !h
            ? "Connecting to ui-server…"
            : running
              ? ready
                ? "Ready to play"
                : "Running"
              : canStart
                ? "Ready to start"
                : "Not ready yet";
  const bannerDetail =
    flow.phase === "error"
      ? activeLines[activeLines.length - 1] ?? ""
      : !h
        ? "checking readiness…"
        : canStart || running
          ? h?.version?.mismatch && h?.version?.actual
            ? `client ${h.version.actual} differs from want ${h.version.want} — run Check for Update in Components`
            : "Start Game boots the S server, then launches the game (PC attach). Stop closes both."
          : h?.game?.detail || "Set GamePath (Arknights.exe) in Settings, then press Setup";

  return (
    <AnimateYFade className="flex w-full flex-1 flex-col">
      {/* Title — left-docked, compact; drop shadow glow is not clipped thanks to layout pt-6 */}
      <section className="shrink-0">
        <motion.h1
          initial={{ opacity: 0, y: 8, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-5xl font-black tracking-tight text-primary drop-shadow-[0_0_22px_rgba(254,220,40,0.4)]"
        >
          Bachelor<em className="not-italic">:Re</em>
        </motion.h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          OpenBachelor component launcher · Region EN · PC
        </p>
      </section>

      {/* free middle space — keeps the rotating background art visible */}
      <div className="min-h-6 flex-1" />

      {/* bottom row: status banner + LOGS (left) · Start Game + status menu (right) */}
      <section className="shrink-0">
        {(flow.phase === "booting" || flow.phase === "stopping" || flow.phase === "error") && (
          <div
            className={cn(
              "mb-2.5 max-h-40 overflow-auto rounded-xl border px-4 py-2.5 font-mono text-[11px] leading-5 whitespace-pre-wrap",
              flow.phase === "error"
                ? "border-destructive/40 bg-black/50 text-red-300"
                : "border-border/70 bg-black/45 text-foreground/85"
            )}
          >
            <div className="mb-1 flex items-center gap-2 text-[10.5px] uppercase tracking-[0.16em] opacity-80">
              {flow.phase === "error" ? (
                <AlertTriangle className="size-3.5" />
              ) : (
                <RefreshCcw className="size-3.5 animate-spin" />
              )}
              {flow.phase === "booting" ? "boot output" : flow.phase === "stopping" ? "stop output" : "boot failed"}
            </div>
            {activeLines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}

        <div className="flex items-end justify-between gap-5">
          {/* left column — banner + LOGS, RevivalSide-width (not stretched full width) */}
          <div className="w-full max-w-[560px] min-w-0">
            <div className="rounded-xl border border-border/70 bg-card/55 px-4 py-3 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm font-semibold",
                    flow.phase === "error" && "text-red-300"
                  )}
                >
                  {bannerTitle}
                </span>
                {!h && <Spinner className="size-3.5 shrink-0" />}
                {/* Server is a small status icon now — the big text card is gone */}
                <span
                  title={h?.server?.listening ? `Server up · port :${h.server.port}` : "Server down"}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-black/25 px-2.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      h?.server?.listening ? "bg-emerald-400 animate-pulse" : h ? "bg-red-400" : "bg-muted-foreground/40"
                    )}
                  />
                  Server
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{bannerDetail}</p>
            </div>

            <button
              onClick={() => setLogsOpen((o) => !o)}
              className="mt-2.5 flex w-full items-center justify-between rounded-xl border border-border/70 bg-card/55 px-4 py-2.5 text-xs font-bold tracking-[0.2em] text-foreground/80 backdrop-blur-md transition-colors hover:bg-card/75"
            >
              LOGS
              <ChevronDown className={cn("size-4 transition-transform", logsOpen && "rotate-180")} />
            </button>
            {logsOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="mt-2"
              >
                <div className="h-56">
                  <LogViewer lines={logs ?? []} />
                </div>
              </motion.div>
            )}

            <button
              onClick={() => setTrainerOpen((o) => !o)}
              className={cn(
                "mt-2.5 flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-xs font-bold tracking-[0.2em] backdrop-blur-md transition-colors",
                health?.trainer?.attached
                  ? "border-emerald-400/40 bg-card/55 text-emerald-300 hover:bg-card/75"
                  : "border-border/70 bg-card/55 text-foreground/80 hover:bg-card/75"
              )}
            >
              TRAINER
              <ChevronDown className={cn("size-4 transition-transform", trainerOpen && "rotate-180")} />
            </button>
            {trainerOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="mt-2"
              >
                <TrainerPanel health={health} />
              </motion.div>
            )}
          </div>

          {/* right column: Start/Stop toggle + round status menu (raised off the bottom edge) */}
          <div className="mb-3 flex shrink-0 items-center gap-3.5">
            <span title={busy || stopMode || canStart ? undefined : startBlockedReason || undefined} className="inline-flex">
              <Button
                variant={stopMode ? "destructive" : "primary"}
                pill
                onClick={stopMode ? stop : play}
                disabled={!busy && !stopMode && !canStart}
                loading={busy}
                className="h-20 px-14 text-xl font-bold"
              >
                {stopMode || flow.phase === "stopping" ? <Square className="size-7" /> : <PlayIcon className="size-7" />}
                {busy ? (flow.phase === "booting" ? "Booting…" : "Stopping…") : stopMode ? "Stop" : "Start Game"}
              </Button>
            </span>

            <div className="relative">
              {menuOpen && (
                <button
                  aria-hidden
                  tabIndex={-1}
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
              )}
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full right-0 z-50 mb-2.5 w-80 rounded-xl border border-border/70 bg-popover/90 p-4 shadow-2xl backdrop-blur-xl"
                >
                  <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Status
                  </div>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <span className="shrink-0 font-semibold text-foreground/90">Version</span>
                      <span
                        title={h ? `client ${h?.version?.actual ?? "?"} (want ${h?.version?.want ?? "?"})` : ""}
                        className={cn(
                          "min-w-0 truncate text-right",
                          h?.version?.mismatch ? "text-red-300" : "text-emerald-300"
                        )}
                      >
                        {h ? `${h?.version?.actual ?? "?"} / want ${h?.version?.want ?? "?"}` : "—"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="shrink-0 font-semibold text-foreground/90">Game (C)</span>
                      <span
                        title={h?.game?.detail ?? ""}
                        className={cn(
                          "min-w-0 truncate text-right",
                          h?.game?.running || h?.game?.ready ? "text-emerald-300" : "text-red-300"
                        )}
                      >
                        {h
                          ? h.game?.running
                            ? `running (pid ${h.game?.pid ?? "?"})`
                            : h.game?.ready
                              ? "ready to attach"
                              : h.game?.detail || "blocked"
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="shrink-0 font-semibold text-foreground/90">Trainer</span>
                      <span
                        className={cn(
                          "min-w-0 truncate text-right",
                          h?.trainer?.attached ? "text-emerald-300" : "text-muted-foreground"
                        )}
                      >
                        {h ? (h.trainer?.attached ? "attached · headless trainer" : "attaches after launch") : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="my-3 border-t border-border/60" />
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      restartGame();
                    }}
                    disabled={busy || !h?.server?.listening}
                    title={!h?.server?.listening ? "Server is not running — use Start Game first" : "Close the game and launch it again without going through server boot or the full Stop"}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold text-foreground/90 transition-colors hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    Relaunch game (server stays up)
                    <RefreshCcw className="size-4" />
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/settings");
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold text-foreground/90 transition-colors hover:bg-accent"
                  >
                    Game Settings
                    <SettingsIcon className="size-4" />
                  </button>
                </motion.div>
              )}
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Status menu"
                title="Version / Game / Trainer"
                className="flex size-20 items-center justify-center rounded-full border border-border/70 bg-card/70 text-foreground/90 backdrop-blur-md transition-colors hover:bg-card"
              >
                <Menu className="size-8" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </AnimateYFade>
  );
}
