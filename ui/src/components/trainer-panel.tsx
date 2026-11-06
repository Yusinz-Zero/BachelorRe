import { useEffect, useState } from "react";
import { CheckCircle2, Send, Terminal } from "lucide-react";
import { api, type HealthResponse, type LogLine } from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "./ui";
import { LogViewer } from "./log-viewer";

// Same word list OpenBachelorC exposes through its "> " prompt (mirrored server-side
// in services/trainer-service.js); /api/health carries it, this fallback covers an
// older ui-server build.
const FALLBACK_COMMANDS = [
  "zero_cost",
  "zero_deploy_cnt",
  "deploy_everywhere",
  "zero_cooldown",
  "unlimited_token",
  "no_sp",
  "withdraw_everything",
  "heal_everyone",
  "unlimited_ammo",
  "eat_enemy",
  "global_range",
  "anti_air",
  "true_aoe",
  "no_ban_card",
  "cloner_assist",
  "allow_dup_char",
  "auto_skill",
];

const REASONS: Record<string, string> = {
  "not-running": "Trainer not attached yet — press Start Game first",
  empty: "Command is empty",
};

type ToggleState = "enable" | "disable";

/** Trainer console: click-to-toggle switches + raw command input, all wired to the
 *  headless C bridge through the launcher API (POST /api/trainer). Works while the
 *  game hook is attached; commands land even across ui-server restarts (file channel). */
export function TrainerPanel({ health }: { health: HealthResponse | null }) {
  const attached = !!health?.trainer?.attached;
  const commands = health?.trainer?.commands?.filter(Boolean)?.length ? health.trainer.commands : FALLBACK_COMMANDS;

  const [sent, setSent] = useState<Record<string, ToggleState>>({});
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState<LogLine[] | null>(null);

  // reset optimistic toggle state as soon as the hook is gone
  useEffect(() => {
    if (!attached) {
      setSent({});
      setFeed(null);
    }
  }, [attached]);

  // live feedback from the bridge ([trainer] echoes + [C] responses) while attached
  useEffect(() => {
    if (!attached) return;
    let alive = true;
    const fetchFeed = async () => {
      try {
        const r = await api.logs(220);
        if (!alive) return;
        const lines = (r.lines || []).filter((l) => l.source === "trainer" || l.source === "C");
        setFeed(lines.slice(-12));
      } catch {
        /* ui-server restarting — next tick */
      }
    };
    fetchFeed();
    const t = setInterval(fetchFeed, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [attached]);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.trainer(text.trim());
      if (r.ok === false) setError(REASONS[r.reason ?? ""] ?? r.reason ?? "Command rejected");
      return r.ok !== false;
    } catch {
      setError("ui-server unreachable — try again in a moment");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (cmd: string) => {
    const next: ToggleState = sent[cmd] === "enable" ? "disable" : "enable";
    if (await send(`${next} ${cmd}`)) setSent((m) => ({ ...m, [cmd]: next }));
  };

  const setAll = async (state: ToggleState) => {
    if (await send(`${state} all`)) setSent(Object.fromEntries(commands.map((c) => [c, state])));
  };

  const sendRaw = async () => {
    if (await send(raw)) setRaw("");
  };

  return (
    <div className="rounded-xl border border-border/70 bg-card/55 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        <Terminal className="size-3.5" />
        Trainer console
        {attached ? (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold normal-case tracking-normal text-emerald-300">
            <CheckCircle2 className="size-3" /> attached — commands accepted
          </span>
        ) : (
          <span className="ml-auto text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
            waiting for game attach — press Start Game first
          </span>
        )}
      </div>

      {/* quick toggles — one per upstream trainer switch, click flips enable/disable */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {commands.map((cmd) => {
          const on = sent[cmd] === "enable";
          return (
            <button
              key={cmd}
              onClick={() => toggle(cmd)}
              disabled={!attached || busy}
              title={on ? `Click to disable ${cmd}` : `Click to enable ${cmd}`}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left font-mono text-[11px] transition-colors",
                on
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                  : "border-border/70 bg-black/20 text-muted-foreground hover:border-border hover:text-foreground/90",
                (!attached || busy) && "cursor-not-allowed opacity-50"
              )}
            >
              <span className={cn("size-1.5 shrink-0 rounded-full", on ? "bg-emerald-400" : "bg-muted-foreground/40")} />
              <span className="min-w-0 truncate">{cmd}</span>
            </button>
          );
        })}
      </div>

      {/* all-on/all-off + raw line into the bridge */}
      <div className="mt-2 flex items-center gap-1.5">
        <Button variant="ghost" className="h-7 px-2.5 text-[11px]" onClick={() => setAll("enable")} disabled={!attached || busy}>
          All on
        </Button>
        <Button variant="ghost" className="h-7 px-2.5 text-[11px]" onClick={() => setAll("disable")} disabled={!attached || busy}>
          All off
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendRaw();
            }}
            placeholder='raw command — enable zero_cost · !runcode · ?callback'
            disabled={!attached}
            spellCheck={false}
            className="h-7 min-w-0 flex-1 rounded-lg border border-border/70 bg-black/25 px-2.5 font-mono text-[11px] text-foreground/90 placeholder:text-muted-foreground/50 disabled:opacity-50"
          />
          <Button variant="ghost" className="inline-flex h-7 shrink-0 items-center gap-1 px-2.5 text-[11px]" onClick={sendRaw} disabled={!attached || busy || !raw.trim()}>
            <Send className="size-3" /> Send
          </Button>
        </div>
      </div>

      {error && <p className="mt-1.5 text-[11px] text-red-300">{error}</p>}

      {attached && feed && feed.length > 0 && (
        <div className="mt-2 h-28">
          <LogViewer lines={feed} className="text-[11px] leading-5" />
        </div>
      )}
    </div>
  );
}
