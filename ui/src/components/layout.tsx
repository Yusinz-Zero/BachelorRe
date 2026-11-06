import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar, DEFAULT_NAV } from "./sidebar";
import { WindowControls } from "./window-controls";
import { Backdrop } from "./backdrop";

export function AnimateYFade({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Layout() {
  const location = useLocation();
  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background">
      {/* rotating art backdrop + scrim (see components/backdrop.tsx) */}
      <Backdrop />

      <WindowControls className="absolute right-3 top-3 z-[60]" />

      <Sidebar items={DEFAULT_NAV} />

      {/* content column: docked LEFT, empty top strip acts as the window drag region */}
      <div className="relative z-10 flex h-screen min-w-0 flex-1 flex-col">
        <div data-tauri-drag-region="true" className="h-11 shrink-0" />
        <main className="flex-1 overflow-y-auto" key={location.pathname}>
          <div className="flex min-h-full flex-col px-8 pb-8 pt-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
