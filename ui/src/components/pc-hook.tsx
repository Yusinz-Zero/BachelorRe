import { useCallback, useState } from "react";
import { AlertTriangle, Wrench, Undo2, Stethoscope, CheckCircle2, XCircle } from "lucide-react";
import { api, type PcStatus, type PcDoctor } from "../lib/api";
import { usePoll } from "../hooks";
import { Button, Card, CardHead, Badge, KV, Spinner } from "./ui";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** PC Hook card (frida-gadget inject status + Setup / Unset / Doctor tools).
 *  Lives on the Settings page — self-contained so the Play page stays clean. */
export function PcHookCard({ className }: { className?: string }) {
  const { data: pc } = usePoll<PcStatus>(() => api.pcStatus(), 6000);

  const [pcBusy, setPcBusy] = useState<null | "setup" | "unset">(null);
  const [pcLines, setPcLines] = useState<string[]>([]);
  const [doctor, setDoctor] = useState<PcDoctor | null>(null);
  const [docLoading, setDocLoading] = useState(false);

  const runPcTask = useCallback(async (endpoint: string, kind: "setup" | "unset") => {
    setPcBusy(kind);
    setPcLines([]);
    setDoctor(null);
    const log = (s: string) => setPcLines((prev) => [...prev, s]);
    log(`→ ${endpoint}…`);
    const res = await api.post(endpoint);
    if (res.error) {
      log(`✖ ${res.error}`);
      setPcBusy(null);
      return;
    }
    if (!res.task) {
      setPcBusy(null);
      return;
    }
    for (;;) {
      const t = await api.task(res.task);
      for (const ln of t.lines) log(ln);
      if (t.done) {
        if (t.error) log(`✖ ${t.error}`);
        setPcBusy(null);
        return;
      }
      await sleep(700);
    }
  }, []);

  const runDoctor = useCallback(async () => {
    setDocLoading(true);
    try {
      setDoctor(await api.pcDoctor());
    } catch {
      // ignore — visible error comes from the poll status
    } finally {
      setDocLoading(false);
    }
    setPcLines([]);
  }, []);

  return (
    <Card className={className}>
      <CardHead
        title="PC Hook (frida-gadget inject)"
        right={<Badge tone={pc?.injected ? "ok" : "warn"}>{pc?.injected ? "injected" : pc?.gamePath ? "pending" : "no setup"}</Badge>}
      />
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <div>
          <KV label="gamePath" value={pc?.gamePath || "—"} ok={!!pc?.gamePath} />
          <KV label="inject .bak" value={pc?.bak ? "yes" : "—"} ok={pc?.bak} />
        </div>
        <div>
          <KV label="ak txt" value={pc?.akTxt ? "yes" : "—"} ok={pc?.akTxt} />
          <KV label="status" value={pc?.detail || "—"} />
        </div>
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        Set the GamePath (Arknights.exe) above and press Save so the Setup button works (injects before launching the game)
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => runPcTask("/api/pc/setup", "setup")} disabled={!!pcBusy || !pc?.gamePath} loading={pcBusy === "setup"}>
          <Wrench className="size-3.5" /> Setup
        </Button>
        <Button size="sm" variant="secondary" onClick={() => runPcTask("/api/pc/unset", "unset")} disabled={!!pcBusy || pcBusy === "setup"} loading={pcBusy === "unset"}>
          <Undo2 className="size-3.5" /> Unset
        </Button>
        <Button size="sm" variant="outline" onClick={runDoctor} disabled={!!pcBusy} loading={docLoading}>
          <Stethoscope className="size-3.5" /> Doctor
        </Button>
        {pcBusy && <Spinner className="size-4" />}
      </div>

      {pcLines.length > 0 && (
        <div className="mt-3 max-h-32 overflow-auto rounded-md border border-border bg-black/40 p-2 font-mono text-[11px] leading-5 whitespace-pre-wrap">
          {pcLines.map((l, i) => (
            <div key={i} className="text-foreground/85">{l}</div>
          ))}
        </div>
      )}

      {doctor && (
        <div className="mt-3 rounded-md border border-border bg-black/30 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
            {doctor.ok ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-300" />
            ) : (
              <XCircle className="size-4 shrink-0 text-red-300" />
            )}
            <span className={doctor.ok ? "text-emerald-300" : "text-red-300"}>
              pc doctor {doctor.ok ? "PASS" : "FAIL"}
            </span>
            {doctor.gamePath && <span className="ml-auto font-normal text-muted-foreground">{(doctor.gamePath.split(/[\\/]/).slice(-2).join("/"))}</span>}
          </div>
          {doctor.checks.map((c) => (
            <div key={c.name} className="flex items-baseline justify-between gap-3 border-t border-border/40 py-1 text-[12px]">
              <span className="shrink-0 text-muted-foreground">{c.name}</span>
              <span className={c.ok ? "text-emerald-300" : "text-red-300"}>
                {c.ok ? "ok" : (c.detail || "fail")}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
