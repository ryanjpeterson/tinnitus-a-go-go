/**
 * URL-backed list state shared by the index pages (Shows, Artists, Venues,
 * Festivals): page, search query, and arbitrary filters all live in the query
 * string so the back button restores the exact view.
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

function mergeParams(current: URLSearchParams, updates: Record<string, string | undefined>): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined || v === "") next.delete(k);
    else next.set(k, v);
  }
  return next;
}

export function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const q = searchParams.get("q") ?? "";

  // Local input state keeps the field responsive while the debounce runs.
  const [inputQ, setInputQ] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync the field when the URL changes externally (e.g. browser back).
  useEffect(() => setInputQ(q), [q]);

  // A pending search write must not fire after leaving the page — it would
  // navigate back to the list.
  useEffect(() => () => {
    if (timer.current != null) clearTimeout(timer.current);
  }, []);

  /** Change filters; always resets to page 1 and replaces history. */
  const setFilter = (updates: Record<string, string | undefined>): void => {
    setSearchParams((cur) => mergeParams(cur, { ...updates, page: undefined }), { replace: true });
  };

  /** Change page; pushes history so back steps through pages. */
  const setPage = (p: number): void => {
    setSearchParams((cur) => mergeParams(cur, { page: p === 1 ? undefined : String(p) }));
    window.scrollTo({ top: 0 });
  };

  const onSearch = (val: string): void => {
    setInputQ(val);
    if (timer.current != null) clearTimeout(timer.current);
    // Functional update merges into the params as they are when the timer
    // fires, so a filter change made while typing isn't overwritten.
    timer.current = setTimeout(() => {
      setSearchParams((cur) => mergeParams(cur, { q: val.trim() || undefined, page: undefined }), { replace: true });
    }, 300);
  };

  return { searchParams, page, q, inputQ, onSearch, setFilter, setPage };
}
