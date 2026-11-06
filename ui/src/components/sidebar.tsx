import { NavLink } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Play, Boxes, Puzzle, DatabaseBackup, ScrollText, Settings, Heart, Eye, EyeOff } from "lucide-react";
import { api } from "../lib/api";
import { getBgEnabled, setBgEnabled, subscribeBgEnabled } from "../lib/bg-store";
import { cn } from "../lib/utils";

export interface NavItem {
  name: string;
  icon: LucideIcon;
  href: string;
  side?: "top" | "bottom";
}

export const DEFAULT_NAV: NavItem[] = [
  { name: "Play", icon: Play, href: "/", side: "top" },
  { name: "Components", icon: Boxes, href: "/components", side: "top" },
  { name: "Patches", icon: Puzzle, href: "/patches", side: "top" },
  { name: "Save", icon: DatabaseBackup, href: "/save", side: "top" },
  { name: "Logs", icon: ScrollText, href: "/logs", side: "top" },
  { name: "Settings", icon: Settings, href: "/settings", side: "bottom" },
  { name: "Credits", icon: Heart, href: "/credits", side: "bottom" },
];

/** Logo tile: plain primary "B" box (per user request — no image asset). */
export function Logo({ size = 9 }: { size?: number }) {
  const box = size === 9 ? "size-9" : `size-${size}`;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-black",
          box
        )}
      >
        <span className="text-lg leading-none">B</span>
      </div>
      <span className="text-[8px] uppercase tracking-[0.2em] text-muted-foreground/70">Launcher</span>
    </div>
  );
}

export function Sidebar({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: (href: string) => void;
}) {
  const top = items.filter((i) => i.side !== "bottom");
  const bottom = items.filter((i) => i.side === "bottom");

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      "group flex w-full items-center justify-center rounded-lg p-2.5 transition-all duration-200",
      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
    );

  const renderNav = (list: NavItem[]) =>
    list.map((item) => {
      const Icon = item.icon;
      return (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/"}
          className={linkCls}
          title={item.name}
          onClick={() => onNavigate?.(item.href)}
        >
          <Icon className="size-5" />
        </NavLink>
      );
    });

  /** Quick BG on/off toggle — sits directly above the Settings nav button. Icon button (Eye/EyeOff). */
  function BgToggle() {
    // State lives in the shared bg-store (also used by Backdrop), so opening/
    // closing the eye is instant and never drifts or resets on a remount.
    const [on, setOn] = useState(getBgEnabled);
    useEffect(() => subscribeBgEnabled(setOn), []);
    const toggle = useCallback(async (v: boolean) => {
      const prev = getBgEnabled();
      setBgEnabled(v); // flip the backdrop immediately via the shared store
      try {
        await api.saveSettings({ BgEnabled: v });
      } catch {
        setBgEnabled(prev); // server refused → roll the eye + backdrop back
      }
    }, []);
    const Icon = on ? Eye : EyeOff;
    return (
      <button
        className="group flex w-full items-center justify-center rounded-lg p-2.5 transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        title={on ? "Hide background image" : "Show background image"}
        aria-label={on ? "Hide background image" : "Show background image"}
        onClick={() => toggle(!on)}
      >
        <Icon className="size-5" />
      </button>
    );
  }

  return (
    <nav className="sticky top-0 z-50 flex h-screen w-fit shrink-0 flex-col items-center gap-4 border-r border-border/60 bg-sidebar px-2.5 py-4 backdrop-blur-xl">
      <NavLink to="/" onClick={() => onNavigate?.("/")} className="mb-1">
        <Logo />
      </NavLink>

      <div className="flex flex-col gap-2">{renderNav(top)}</div>

      <div className="mt-auto flex flex-col gap-2">
        <BgToggle />
        {renderNav(bottom)}
      </div>
    </nav>
  );
}
