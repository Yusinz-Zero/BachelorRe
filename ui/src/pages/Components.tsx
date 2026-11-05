import { usePoll, useTask, fmtTime } from "../hooks";
import { api, type StatusResponse, type ComponentRec } from "../lib/api";
import { AnimateYFade } from "../components/layout";
import { Button, Card, CardHead, Badge, KV, Spinner } from "../components/ui";

const meta: Record<string, { name: string }> = {
  S: { name: "Server" },
  C: { name: "Client / Launcher" },
};

function ComponentCard({ id, rec, desc }: { id: string; rec?: ComponentRec; desc: string }) {
  const nInstalls = rec ? Object.keys(rec.installs || {}).length : 0;
  return (
    <Card>
      <CardHead
        title={`${id} · ${meta[id].name}`}
        right={<Badge tone={nInstalls ? "ok" : "idle"}>{nInstalls ? "installed" : "not installed"}</Badge>}
      />
      <p className="mb-3 text-xs text-muted-foreground">{desc}</p>
      <KV label="active version" value={rec?.activeDir ? rec.activeDir.split(/[\\/]/).slice(-2).join("/") : "—"} />
      <KV label="known sha" value={rec?.knownSha ? rec.knownSha.slice(0, 7) : "—"} />
      <KV label="versions kept" value={String(nInstalls)} />
    </Card>
  );
}

export function ComponentsPage() {
  const { data, error, refresh } = usePoll<StatusResponse>(() => api.status(), 5000);
  const { runs, start, clear } = useTask();

  const runList = Object.values(runs);

  return (
    <AnimateYFade className="w-full max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Components</h2>
          <p className="text-sm text-muted-foreground">
            Version folders from the OpenBachelor GitHub master branch · manual update only
            {data?.state.lastCheckAt ? ` · last check ${fmtTime(data.state.lastCheckAt)}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refresh()}>Refresh</Button>
          <Button variant="secondary" onClick={() => start("/api/check")}>Check for Update</Button>
          <Button onClick={() => start("/api/update")}>Update all</Button>
          <Button variant="ghost" onClick={() => start("/api/deps")}>Install deps</Button>
        </div>
      </div>

      {error && (
        <Card className="mb-4 border-destructive/40">
          <p className="text-sm text-red-300">status refresh failed: {error}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ComponentCard id="S" rec={data?.state.components?.S} desc={`openbachelors · uvicorn :${String(data?.settings?.ServerPort ?? 8443)}`} />
        <ComponentCard id="C" rec={data?.state.components?.C} desc="openbachelorc · --attach_pc (Arknights PC)" />
      </div>

      {runList.length > 0 && (
        <div className="mt-5 space-y-3">
          {runList.map((r) => (
            <Card key={r.id} className={r.error ? "border-destructive/40" : r.done ? "border-emerald-500/30" : "border-primary/25"}>
              <CardHead
                title={`${r.id}${r.error ? " · failed" : r.done ? " · done" : " · running"}`}
                right={
                  <div className="flex items-center gap-2">
                    {!r.done && <Spinner className="size-3.5" />}
                    <Badge tone={r.error ? "bad" : r.done ? "ok" : "gold"}>{r.error ? "error" : r.done ? "done" : "active"}</Badge>
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
        </div>
      )}

      {!data && !error && (
        <Card className="mt-6 flex items-center justify-center p-8">
          <Spinner />
        </Card>
      )}
    </AnimateYFade>
  );
}
