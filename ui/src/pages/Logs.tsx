import { usePoll } from "../hooks";
import { api, shortPath, type LogLine } from "../lib/api";
import { AnimateYFade } from "../components/layout";
import { Button } from "../components/ui";
import { LogViewer } from "../components/log-viewer";
import { useEffect, useState } from "react";
import { Download, Save } from "lucide-react";

export function LogsPage() {
  // fast poll while this page is visible
  const { data, refresh, error } = usePoll<{ lines: LogLine[] }>(() => api.logs(600), 1500);

  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<{ path: string; count: number } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const exportLogs = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const r = await api.logsExport();
      if (r.ok && r.path) setExported({ path: r.path, count: r.count ?? 0 });
      else setExportError(r.error || "export failed");
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const lines = data?.lines || [];

  return (
    <AnimateYFade className="flex min-h-[78vh] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Operation log</h2>
          <p className="text-sm text-muted-foreground">4000-line ring buffer · auto-refresh 1.5s{error ? ` · error: ${error}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportLogs} loading={exporting} title="Save the full buffer to a .log file">
            <Download className="size-4" /> Export
          </Button>
          <Button variant="ghost" onClick={async () => { await api.clearLogs(); refresh(); }}>
            Clear
          </Button>
        </div>
      </div>

      {exported && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
          <Save className="size-4 shrink-0 text-emerald-300" />
          <span>Exported {exported.count} lines →</span>
          <span className="truncate font-mono text-emerald-100/90" title={exported.path}>{shortPath(exported.path, 70)}</span>
        </div>
      )}
      {exportError && (
        <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-red-300">
          export failed: {exportError}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <LogViewer lines={lines} />
      </div>
    </AnimateYFade>
  );
}
