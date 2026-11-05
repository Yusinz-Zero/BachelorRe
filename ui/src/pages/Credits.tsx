import { useState } from "react";
import { ExternalLink, Gamepad2, Server, Laptop, Heart } from "lucide-react";
import { api } from "../lib/api";
import { AnimateYFade } from "../components/layout";
import { Card, Button } from "../components/ui";

const ALLOWED_HOSTS = ["github.com", "arknights.global"];

/** Lazily imported single-shot window.open (blocked inside the Tauri shell). */
function useOpenLink() {
  const [error, setError] = useState<string | null>(null);
  const open = async (url: string, fallback?: string) => {
    setError(null);
    try {
      let opened = false;
      try {
        const r = await api.openUrl(url);
        opened = !!r.ok && !r.error;
        if (!opened && r.error) setError(r.error);
      } catch {
        // ui-server unreachable or endpoint missing — report and use fallback
      }
      if (!opened && fallback) {
        // Browser (non-Tauri) dev fallback: a normal new tab is fine here.
        window.open(fallback, "_blank", "noopener");
      }
    } finally {
      // no-op — the system browser owns the URL from here on
    }
  };
  return { open, error };
}

export function CreditsPage() {
  const { open, error } = useOpenLink();

  const entries = [
    {
      icon: Laptop,
      role: "Launcher",
      name: "Bachelor:Re",
      who: "Yusinz-Zero",
      desc: "This desktop launcher — UI, service orchestration, PC hook tooling and packaging. Built as a friendly front-end for the OpenBachelor stack.",
      link: "https://github.com/Yusinz-Zero",
      ok: "https://github.com/Yusinz-Zero",
      linkLabel: "GitHub · Yusinz-Zero",
    },
    {
      icon: Gamepad2,
      role: "Client / Launcher component",
      name: "OpenBachelor (C)",
      who: "pfyy",
      desc: "The PC client-side project this launcher boots and attaches to — Arknights PC playability, trainer bridge and version handling.",
      link: "https://github.com/pfyy",
      ok: "https://github.com/pfyy",
      linkLabel: "GitHub · pfyy",
    },
    {
      icon: Server,
      role: "Server component",
      name: "OpenBachelor S (openbachelors)",
      who: "pfyy",
      desc: "The uvicorn game server the launcher downloads, updates and starts before launching the game.",
      link: "https://github.com/pfyy",
      ok: "https://github.com/pfyy",
      linkLabel: "GitHub · pfyy",
    },
  ];

  return (
    <AnimateYFade className="w-full max-w-2xl">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Heart className="size-6 text-primary" /> Credits
        </h2>
        <p className="text-sm text-muted-foreground">Who built what · external links open in your browser</p>
      </div>

      <div className="space-y-3">
        {entries.map((e) => {
          const Icon = e.icon;
          return (
            <Card key={e.role} className="flex items-start gap-4">
              <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h3 className="text-sm font-bold">{e.name}</h3>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{e.role}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{e.desc}</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground/90">by {e.who}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => open(e.link, e.ok)}
                    className="ml-auto"
                    title={e.linkLabel}
                  >
                    <ExternalLink className="size-3.5" /> {e.linkLabel}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}

        <Card>
          <h3 className="text-sm font-bold">Legal note</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Bachelor:Re is a community launcher that only orchestrates third-party open-source components.
            Links above point to their respective public repositories. Not affiliated with or endorsed by any
            official game publisher. Arknights and its trademarks belong to their respective owners.
          </p>
        </Card>

        {error && <p className="text-xs text-red-300">could not open link: {error}</p>}

        <p className="text-[11px] text-muted-foreground/70">
          Allowed link hosts: {ALLOWED_HOSTS.join(", ")} — everything else is rejected by the ui-server before
          the browser is touched.
        </p>
      </div>
    </AnimateYFade>
  );
}
