// Shared reactive BG on/off state.
//
// The sidebar toggle and the Backdrop both read/write this one source of truth
// so a click takes effect IMMEDIATELY (the backdrop no longer waits for the
// 8s /api/status poll) and the two can never drift apart or lose their value on
// a remount. The persisted server value is hydrated in through pollBy status.

type Listener = (v: boolean) => void;

let enabled = true; // BG starts ON; the server's stored value hydrates in soon after
const listeners = new Set<Listener>();

export function getBgEnabled(): boolean {
  return enabled;
}

/** Optimistic local switch — notifies every subscriber synchronously (instant UI). */
export function setBgEnabled(v: boolean): void {
  const next = !!v;
  if (enabled === next) return;
  enabled = next;
  for (const l of [...listeners]) l(next);
}

/** Hydrate from the server's persisted status (no-op while unchanged). */
export function hydrateBgEnabled(v: boolean): void {
  setBgEnabled(v);
}

export function subscribeBgEnabled(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
