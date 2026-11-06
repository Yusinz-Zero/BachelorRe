import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { fmtTime } from "../hooks";
import type { LogLine } from "../lib/api";

const sourceColors: Record<string, string> = {
  sys: "text-muted-foreground",
  server: "text-sky-300",
  game: "text-emerald-300",
  trainer: "text-amber-300",
  ui: "text-violet-300",
};

export function LogViewer({ lines, className }: { lines: LogLine[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <div
      ref={ref}
      className={cn(
        "h-full overflow-auto rounded-lg border border-border bg-black/40 p-4 font-mono text-[12.5px] leading-6 whitespace-pre-wrap",
        className
      )}
    >
      {lines.length === 0 && (
        <div className="text-muted-foreground/70">— no logs yet — run Check for Update / Play to see output —</div>
      )}
      {lines.map((l, i) => (
        <div key={`${l.seq}-${i}`} className="flex gap-3 border-b border-border/30 py-0.5">
          <span className="shrink-0 text-muted-foreground/50 tabular-nums">{fmtTime(l.at)}</span>
          <span className={cn("shrink-0 w-16 uppercase text-[10.5px] leading-6 tracking-wider", sourceColors[l.source] || "text-muted-foreground")}>
            {l.source}
          </span>
          <span className="text-foreground/90">{l.text}</span>
        </div>
      ))}
    </div>
  );
}
