import { useCallback, useEffect, useRef, useState } from "react";
import { api, type TaskStatus } from "./lib/api";

/** Poll an async source every `interval` ms; manual refresh() too. */
export function usePoll<T>(fn: () => Promise<T>, interval = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, interval);
    return () => clearInterval(t);
  }, [refresh, interval]);

  return { data, error, refresh };
}

export interface RunningTask {
  id: string;
  lines: string[];
  done: boolean;
  error: string | null;
}

/** Trigger a long-running task endpoint and poll its lines until done. */
export function useTask() {
  const [runs, setRuns] = useState<Record<string, RunningTask>>({});

  const start = useCallback((endpoint: string) => {
    const id = Math.random().toString(36).slice(2);
    setRuns((r) => ({ ...r, [id]: { id, lines: [], done: false, error: null } }));
    api.post(endpoint).then(async (res: { task?: string; error?: string }) => {
      if (res.error) {
        setRuns((r) => ({ ...r, [id]: { id, lines: [], done: true, error: res.error! } }));
        return;
      }
      const taskId = res.task;
      if (!taskId) return;
      const poll = setInterval(async () => {
        try {
          const t: TaskStatus = await api.task(taskId);
          setRuns((r) => {
            const prev = r[id] || { id, lines: [], done: false, error: null };
            const lines = [...prev.lines, ...t.lines];
            return {
              ...r,
              [id]: { id, lines, done: t.done, error: t.error || null },
            };
          });
          if (t.done) clearInterval(poll);
        } catch (e) {
          setRuns((r) => ({
            ...r,
            [id]: { id, lines: r[id]?.lines || [], done: true, error: e instanceof Error ? e.message : String(e) },
          }));
          clearInterval(poll);
        }
      }, 800);
    });
    return id;
  }, []);

  const clear = useCallback((id: string) => {
    setRuns((r) => {
      const { [id]: _removed, ...rest } = r;
      return rest;
    });
  }, []);

  return { runs, start, clear };
}

/** Simple local time formatter for log lines. */
export function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { hour12: false });
  } catch {
    return "";
  }
}
