/**
 * Touch gestures for the installed app: pull to refresh and horizontal swipes.
 * Mouse and pen are ignored, and anything inside an open sheet or an element
 * marked `data-no-swipe` (carousels, maps) is left alone.
 *
 * Part of jimbo-ui (foundation — don't edit here; change jimbo-ui and update).
 */

import { useEffect, useRef, useState } from "react";

const blocked = (target: EventTarget | null): boolean =>
  target instanceof Element && !!target.closest("[role=dialog], [data-no-swipe], .gm-style, input, textarea, select");

/**
 * Pull down from the top of the page to refresh. Returns how far the page is
 * pulled (0–1, for the indicator) and whether a refresh is running.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>, threshold = 80): { pull: number; refreshing: boolean } {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const distance = useRef(0);

  useEffect(() => {
    const down = (e: TouchEvent) => {
      if (refreshing || window.scrollY > 0 || e.touches.length !== 1 || blocked(e.target)) return;
      start.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
      distance.current = 0;
    };
    const move = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0]!.clientY - start.current.y;
      const dx = e.touches[0]!.clientX - start.current.x;
      if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0) { start.current = null; setPull(0); return; }
      // Resistance: the indicator moves slower than the finger.
      distance.current = dy * 0.5;
      setPull(Math.min(distance.current / threshold, 1.25));
    };
    const up = () => {
      if (!start.current) return;
      start.current = null;
      if (distance.current >= threshold) {
        setRefreshing(true);
        setPull(1);
        void onRefresh().finally(() => { setRefreshing(false); setPull(0); });
      } else {
        setPull(0);
      }
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
    };
  }, [onRefresh, refreshing, threshold]);

  return { pull, refreshing };
}

/** Horizontal swipe on the page: left = next, right = previous. */
export function useSwipe(handlers: { onLeft?: () => void; onRight?: () => void }, minDistance = 70): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    let start: { x: number; y: number; t: number } | null = null;
    const down = (e: TouchEvent) => {
      // Not from the screen edge — that's the system back gesture on iOS.
      const x = e.touches[0]!.clientX;
      if (e.touches.length !== 1 || blocked(e.target) || x < 24 || x > window.innerWidth - 24) { start = null; return; }
      start = { x, y: e.touches[0]!.clientY, t: Date.now() };
    };
    const up = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0]!;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const quick = Date.now() - start.t < 600;
      start = null;
      if (!quick || Math.abs(dx) < minDistance || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      if (dx < 0) ref.current.onLeft?.();
      else ref.current.onRight?.();
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchend", up);
    };
  }, [minDistance]);
}
