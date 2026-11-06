import { useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { cn } from "../lib/utils";

// Custom window controls for the Tauri shell (decorations: false), RevivalSide-style.
// Hidden in the plain browser — there the OS/tab-provided frame handles the window.

export function WindowControls({ className }: { className?: string }) {
  const [win, setWin] = useState<{
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    const tauri = typeof window !== "undefined" && window.__TAURI_INTERNALS__;
    if (!tauri) return;
    import("@tauri-apps/api/window")
      .then((m) => {
        if (!mounted) return;
        const w = m.getCurrentWindow();
        setWin({
          minimize: () => w.minimize(),
          toggleMaximize: () => w.toggleMaximize(),
          close: () => w.close(),
        });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  if (!win) return null;

  const btn =
    "flex size-9 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <div className={cn("flex items-center gap-1", className)} data-tauri-drag-region="false">
      <button className={btn} onClick={() => win.minimize()} aria-label="Minimize">
        <Minus className="size-4" />
      </button>
      <button className={btn} onClick={() => win.toggleMaximize()} aria-label="Maximize">
        <Square className="size-3.5" />
      </button>
      <button className={cn(btn, "hover:bg-red-500 hover:text-white")} onClick={() => win.close()} aria-label="Close">
        <X className="size-4" />
      </button>
    </div>
  );
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={cn("inline-flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground", className)}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      aria-label="Copy"
    >
      {copied ? "✓" : <Copy className="size-3.5" />}
    </button>
  );
}
