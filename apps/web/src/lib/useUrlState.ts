/**
 * View state in the URL: a tab, sub-tab, filter, search or page kept as a
 * search parameter on the current route (guide: The URL holds the view), so a
 * refresh, a shared link or Back lands on the same view. Replaces the entry
 * rather than adding one, so tapping tabs doesn't fill the history; leaves the
 * other parameters alone, and drops its own when it's back to the default.
 *
 * jimbo-ui reference: copy as is.
 */

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/** One parameter as state: `[value, set]`. `allowed` limits it to known values (anything else reads as the default). */
export function useUrlState<T extends string = string>(key: string, fallback: NoInfer<T>, allowed?: readonly T[]): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = raw !== null && (!allowed || allowed.includes(raw as T)) ? (raw as T) : fallback;
  const set = useCallback((v: T) => setUrlParams(setParams, { [key]: v === fallback ? null : v }), [key, fallback, setParams]);
  return [value, set];
}

/** A number parameter (a page), as state. */
export function useUrlNumber(key: string, fallback: number): [number, (v: number) => void] {
  const [raw, set] = useUrlState(key, String(fallback));
  const n = Number(raw);
  return [Number.isFinite(n) ? n : fallback, useCallback((v: number) => set(String(v)), [set])];
}

/** Set several parameters at once (null removes one) — for a change that resets another, like a category and its sub-tab. */
export function setUrlParams(setParams: ReturnType<typeof useSearchParams>[1], patch: Record<string, string | null>) {
  setParams((p) => {
    const next = new URLSearchParams(p);
    for (const [k, v] of Object.entries(patch)) if (v === null || v === "") next.delete(k); else next.set(k, v);
    return next;
  }, { replace: true });
}
