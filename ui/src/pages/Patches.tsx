import { usePoll, useTask } from "../hooks";
import { api, type PatchInfo } from "../lib/api";
import { AnimateYFade } from "../components/layout";
import { Button, Card, CardHead, Badge, KV, Spinner, inputCls } from "../components/ui";
import { useState } from "react";

const stateTone = (s: PatchInfo["state"], enabled: boolean) =>
  !enabled ? "idle" : s === "applied" ? "ok" : s === "error" ? "bad" : "warn";

const stateLabel = (p: PatchInfo) =>
  !p.enabled ? "off" : p.state === "applied" ? "applied" : p.state === "error" ? "error" : p.state === "no-active" ? "no active" : "pending";

export function PatchesPage() {
  const { data, error, refresh } = usePoll<PatchInfo[]>(() => api.patchStatus(), 5000);
  const { runs, start, clear } = useTask();
  const [filter, setFilter] = useState("");

  const patches = (data || []).filter(
    (p) => !filter || p.id.includes(filter) || p.component.includes(filter) || p.title.includes(filter)
  );
  const applied = (data || []).filter((p) => p.enabled && p.state === "applied").length;

  return (
    <AnimateYFade className="w-full max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Patch catalog</h2>
          <p className="text-sm text-muted-foreground">
            {data ? `${applied}/${data.filter((p) => p.enabled).length} applied` : "…"} · idempotent · text-config only (region/config/version/pc-setup)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input className={inputCls + " w-48"} placeholder="filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <Button variant="outline" onClick={() => refresh()}>Refresh</Button>
          <Button onClick={() => start("/api/patch")}>Apply all</Button>
        </div>
      </div>

      {error && (
        <Card className="mb-4 border-destructive/40">
          <p className="text-sm text-red-300">patch status failed: {error}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {patches.map((p) => (
          <Card key={p.id}>
            <CardHead
              title={
                <span className="flex items-center gap-2">
                  <span className="font-mono">{p.id}</span>
                  <Badge tone="idle" className="lowercase">{p.component}</Badge>
                </span>
              }
              right={<Badge tone={stateTone(p.state, p.enabled)}>{stateLabel(p)}</Badge>}
            />
            <p className="mb-2 text-[13px] text-foreground/90">{p.title}</p>
            {p.description && <p className="mb-3 text-xs text-muted-foreground">{p.description}</p>}
            {p.isAppliedError && <p className="text-xs text-red-300">isApplied threw: {p.isAppliedError}</p>}
            <KV label="state" value={p.state === "no-active" ? "component has no active install" : p.applied ? "isApplied()=true" : "pending — not applied yet"} />
          </Card>
        ))}
      </div>

      {patches.length === 0 && !error && (
        <Card className="flex items-center justify-center p-8">
          <Spinner />
        </Card>
      )}

      {Object.values(runs).map((r) => (
        <Card key={r.id} className="mt-3">
          <CardHead
            title={`${r.id}${r.error ? " · failed" : r.done ? " · done" : " · running"}`}
            right={
              <div className="flex items-center gap-2">
                {!r.done && <Spinner className="size-3.5" />}
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => clear(r.id)}>✕</button>
              </div>
            }
          />
          <div className="max-h-52 overflow-auto font-mono text-xs leading-6 whitespace-pre-wrap">
            {r.lines.map((l, i) => (
              <div key={i} className="text-foreground/85">{l}</div>
            ))}
          </div>
        </Card>
      ))}
    </AnimateYFade>
  );
}
