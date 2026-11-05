import { usePoll, useTask } from "../hooks";
import { api, type SaveStatus, shortPath } from "../lib/api";
import { AnimateYFade } from "../components/layout";
import { Button, Card, CardHead, Badge, Spinner } from "../components/ui";
import { useEffect, useState } from "react";

const fmtSize = (n?: number) => (n == null ? "—" : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

const stampFmt = (s: string) => {
  // "2026-11-05T07-30-00-000Z" -> "2026-11-05 07:30:00 UTC"
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  return m ? `${m[1]} ${m[2]}:${m[3]}:${m[4]} UTC` : s;
};

export function SavePage() {
  const { data, error, refresh } = usePoll<SaveStatus>(() => api.saveStatus(), 5000);
  const { runs, start, clear } = useTask();
  const [confirm, setConfirm] = useState<string | null>(null);

  // refresh the file lists as soon as any task finishes
  useEffect(() => {
    if (Object.values(runs).some((r) => r.done)) refresh();
  }, [runs, refresh]);

  /** two-step confirm: first call arms the button, second call within the window fires */
  const ask = (key: string, ms = 6000) => {
    if (confirm === key) {
      setConfirm(null);
      return true;
    }
    setConfirm(key);
    setTimeout(() => setConfirm((c) => (c === key ? null : c)), ms);
    return false;
  };

  const busy = Object.values(runs).some((r) => !r.done);

  return (
    <AnimateYFade className="w-full max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Save edit</h2>
          <p className="text-sm text-muted-foreground">
            {data
              ? `${data.users.length} save${data.users.length === 1 ? "" : "s"} · ${data.backups.length} backup${
                  data.backups.length === 1 ? "" : "s"
                } · ${shortPath(data.savRoot, 52)}`
              : "…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!data?.canEdit && (
            <Badge tone={data && (data.serverRunning || data.gameRunning) ? "warn" : "idle"}>
              {data?.serverRunning ? "server running" : data?.gameRunning ? "game running" : data?.savRoot ? "read-only" : "no active S"}
            </Badge>
          )}
          <Button variant="outline" onClick={() => refresh()}>
            Refresh
          </Button>
        </div>
      </div>

      <Card className="mb-4">
        <p className="text-[13px] leading-6 text-foreground/90">
          OpenBachelorS stores your account as small <em>delta</em> files over a built-in template that already has
          <strong> everything unlocked</strong> (all operators at max level, all skins, completed story). A fresh save
          therefore starts from that unlocked base — exactly like the original. Pick <strong>New game</strong> to wipe
          progress, or keep playing the current save.
        </p>
      </Card>

      {error && (
        <Card className="mb-4 border-destructive/40">
          <p className="text-sm text-red-300">save status failed: {error}</p>
        </Card>
      )}
      {data?.note && (
        <Card className="mb-4 border-destructive/40">
          <p className="text-sm text-red-300">{data.note}</p>
        </Card>
      )}
      {data && !data.canEdit && !data.note && (
        <Card className="mb-4 border-amber-500/30">
          <p className="text-sm text-amber-200">
            Editing is locked while the {data.serverRunning ? "S server" : "game"} is running — press Stop first so the
            save files can't race with a running request.
          </p>
        </Card>
      )}

      {data?.users.map((u) => (
        <Card key={u.dir} className="mb-3">
          <CardHead
            title={
              <span className="flex items-center gap-2">
                <span className="font-medium">{u.user}</span>
                <Badge tone={u.empty ? "idle" : "ok"} className="lowercase">
                  {u.empty ? "template (fresh)" : "has progress"}
                </Badge>
              </span>
            }
            right={
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => start(`/api/save/backup?user=${encodeURIComponent(u.dir)}`)}
                >
                  Backup now
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy || !(data && data.canEdit)}
                  onClick={() => {
                    if (ask(`reset:${u.dir}`)) start(`/api/save/reset?user=${encodeURIComponent(u.dir)}`);
                  }}
                >
                  {confirm === `reset:${u.dir}` ? "Sure? click again" : "New game"}
                  {/* destructive aria label */}
                  <span className="sr-only">delete save files</span>
                </Button>
              </div>
            }
          />
          <p className="mb-2 text-xs text-muted-foreground">
            New game clears this account's delta files (auto-backup is always created first) — the next login starts a
            fresh account on the built-in unlock-everything template.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {Object.entries(u.files).map(([name, f]) => (
              <span key={name} className="font-mono">
                {name}: {f.exists ? fmtSize(f.size) : "none"} {f.at ? `· ${f.at.slice(0, 10)}` : ""}
              </span>
            ))}
          </div>
        </Card>
      ))}

      <div className="mt-6 mb-2 flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight">Backups</h3>
      </div>
      {data?.backups.map((b) => (
        <Card key={b.dir} className="mb-3">
          <CardHead
            title={
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm">{stampFmt(b.stamp)}</span>
                <Badge tone="idle" className="lowercase">
                  {b.user}
                </Badge>
                {b.empty && <Badge tone="idle">template</Badge>}
              </span>
            }
            right={
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !(data && data.canEdit)}
                  onClick={() => {
                    if (ask(`restore:${b.dir}`)) start(`/api/save/restore?backup=${encodeURIComponent(b.dir)}`);
                  }}
                >
                  {confirm === `restore:${b.dir}` ? "Sure? click again" : "Restore"}
                </Button>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  disabled={busy}
                  title="delete backup"
                  onClick={() => {
                    if (ask(`del:${b.dir}`)) start(`/api/save/backup/delete?backup=${encodeURIComponent(b.dir)}`);
                  }}
                >
                  {confirm === `del:${b.dir}` ? "confirm ✕" : "✕"}
                </button>
              </div>
            }
          />
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {Object.entries(b.files).map(([name, f]) => (
              <span key={name} className="font-mono">
                {name}: {f.exists ? fmtSize(f.size) : "none"}
              </span>
            ))}
          </div>
        </Card>
      ))}
      {data && data.backups.length === 0 && (
        <Card className="text-sm text-muted-foreground">
          No backups yet — every destructive action writes one automatically, or use “Backup now”.
        </Card>
      )}

      {Object.values(runs).map((r) => (
        <Card key={r.id} className="mt-3">
          <CardHead
            title={`${r.id}${r.error ? " · failed" : r.done ? " · done" : " · running"}`}
            right={
              <div className="flex items-center gap-2">
                {!r.done && <Spinner className="size-3.5" />}
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => clear(r.id)}>
                  ✕
                </button>
              </div>
            }
          />
          <div className="max-h-52 overflow-auto font-mono text-xs leading-6 whitespace-pre-wrap">
            {r.lines.map((l, i) => (
              <div key={i} className="text-foreground/85">
                {l}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </AnimateYFade>
  );
}
