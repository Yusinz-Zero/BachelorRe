import { useEffect, useRef, useState } from "react";
import { API_BASE, api, type StatusResponse } from "../lib/api";
import { usePoll } from "../hooks";
import { getBgEnabled, hydrateBgEnabled, subscribeBgEnabled } from "../lib/bg-store";

// Rotating art background (RevivalSide-style): every image in the data "bg"
// folder crossfades on a timer. The list comes from the ui-server so the user
// can drop extra images in without rebuilding. Falls back to a dim gradient
// when no images exist (first run).
//
// Open-time black screen: the window can appear BEFORE the ui-server is up
// (the shell spawns it right after launch). The last known list is cached in
// localStorage so art renders instantly on reopen, and the server fetch keeps
// retrying until it succeeds instead of giving up on the first error.
const INTERVAL = 12000; // ms per image
const FADE = 1800; // ms crossfade
const RETRY = 2500; // ms between /api/bg/list retries while the server is not up yet
const CACHE_KEY = "br:bgList";

function cachedList(): string[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function Backdrop() {
  const { data } = usePoll<StatusResponse>(() => api.status(), 8000);
  // BG on/off is shared with the sidebar toggle through a tiny reactive store —
  // pressing the eye button flips this INSTANTLY instead of waiting for the next
  // status poll (the old 8s delay when toggling the background off/on).
  const [enabled, setEnabled] = useState(getBgEnabled);
  useEffect(() => subscribeBgEnabled(setEnabled), []);
  // Keep the store in sync with what is actually persisted on the server.
  useEffect(() => {
    const v = data?.settings?.BgEnabled;
    if (v !== undefined) hydrateBgEnabled(Boolean(v));
  }, [data]);
  const bgEnabled = enabled;

  const [list, setList] = useState<string[] | null>(cachedList);
  // images render only after /api/bg/list ACTUALLY succeeded from the network —
  // mounting them from the cached list while the ui-server is still booting makes
  // every <img> fail permanently (naturalWidth 0, no automatic retry), which was
  // the "black background at open" bug
  const [confirmed, setConfirmed] = useState(false);
  const [idx, setIdx] = useState(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    if (!bgEnabled) {
      // BG off from settings → plain backdrop (gradient only — never a flat black screen)
      setList([]);
      setConfirmed(true);
      return;
    }
    const load = async () => {
      if (!aliveRef.current) return;
      try {
        const r = await api.bgList();
        if (!aliveRef.current) return;
        const images = Array.isArray(r?.images) ? r.images : [];
        setList(images);
        setConfirmed(true);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(images));
        } catch {
          /* storage disabled — retry still works */
        }
      } catch {
        // ui-server still booting (or briefly down) — keep showing cached art and retry
        setTimeout(() => {
          if (aliveRef.current) load();
        }, RETRY);
      }
    };
    load();
    return () => {
      aliveRef.current = false;
    };
  }, [bgEnabled]);

  const images = bgEnabled && confirmed && list ? list : [];
  const count = images.length;

  useEffect(() => {
    if (count < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % count), INTERVAL);
    return () => clearInterval(t);
  }, [count]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background" aria-hidden="true">
      {/* gentle base gradient so the very first launch (no cache, art not decoded yet)
          reads as an intentional dim scene instead of a flat black screen */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-300/[0.07] via-transparent to-indigo-400/[0.06]" />
      {bgEnabled && confirmed && images.length > 0 &&
        images.map((raw, i) => {
          const src = raw.startsWith("/bg/") ? API_BASE + raw : raw;
          return (
            <img
              key={src}
              src={src}
              alt=""
              draggable={false}
              loading="eager"
              className="absolute inset-0 h-full w-full scale-[1.04] object-cover transition-opacity duration-[1800ms] saturate-[0.9]"
              style={{ opacity: i === idx % images.length ? 1 : 0, filter: "blur(3px)" }}
            />
          );
        })}
      {/* readability scrim — keeps cards legible over any art */}
      <div className="absolute inset-0 bg-gradient-to-r from-background/78 via-background/45 to-background/12" />
    </div>
  );
}