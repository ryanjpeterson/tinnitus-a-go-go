/**
 * Venue index — card grid of all venues in the user's log.
 *
 * All filter/page state lives in the URL (?page=&q=) so the browser back
 * button always restores the exact view you left.
 */

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EntityCard } from "@/components/EntityCard";

const PAGE_SIZE = 30;

/** Build a new URLSearchParams from the current one, merging in changes. */
function mergeParams(
  current: URLSearchParams,
  updates: Record<string, string | undefined>,
): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined || v === "") next.delete(k);
    else next.set(k, v);
  }
  return next;
}

export function VenuesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive state from URL params
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const urlQ = searchParams.get("q") ?? "";

  // Local input state — keeps the search field responsive while debounce runs
  const [inputQ, setInputQ] = useState(urlQ);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync input field when URL changes externally (e.g. browser back)
  useEffect(() => {
    setInputQ(urlQ);
  }, [urlQ]);

  /** Set page only — pushes a new history entry so back works. */
  const setPage = (p: number): void => {
    setSearchParams(mergeParams(searchParams, { page: p === 1 ? undefined : String(p) }), { replace: false });
  };

  const handleSearch = (val: string): void => {
    setInputQ(val);
    if (searchTimer.current != null) clearTimeout(searchTimer.current);
    // Write to URL after 300 ms; use replace so typing doesn't spam history
    searchTimer.current = setTimeout(() => {
      setSearchParams(
        mergeParams(searchParams, { q: val.trim() || undefined, page: undefined }),
        { replace: true },
      );
    }, 300);
  };

  const venuesQuery = useQuery({
    queryKey: ["venues", { q: urlQ, page }],
    queryFn: () => api.listVenues({ q: urlQ || undefined, page, limit: PAGE_SIZE }),
    staleTime: 30_000,
  });

  const { venues = [], total = 0, totalPages = 0 } = venuesQuery.data ?? {};

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display uppercase text-3xl">Venues</h1>
        {total > 0 && <span className="font-mono text-sm text-text-muted">{total} total</span>}
      </div>

      <input
        type="search"
        placeholder="Search venues…"
        value={inputQ}
        onChange={(e) => handleSearch(e.target.value)}
        className="w-full max-w-sm rounded border border-border bg-surface px-3 py-2 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime mb-5"
      />

      {venuesQuery.isLoading ? (
        <div className="py-16 text-center text-text-subtle font-mono text-sm animate-pulse">Loading…</div>
      ) : venues.length === 0 ? (
        <div className="py-16 text-center text-text-subtle font-mono text-sm">
          {urlQ ? "No venues match your search." : "Import your CSV to populate venues."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {venues.map((v) => (
              <EntityCard
                key={v.id}
                href={`/venues/${v.slug}`}
                name={v.name}
                imageUrl={v.imageUrl}
                sub1={[v.city, v.region].filter(Boolean).join(", ") || null}
                sub2={`${v.showCount} ${v.showCount === 1 ? "show" : "shows"}`}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between text-xs font-mono text-text-muted">
              <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
              <div className="flex gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="px-3 py-1.5 rounded border border-border disabled:opacity-30 hover:border-accent-lime transition-colors"
                >
                  ← Prev
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="px-3 py-1.5 rounded border border-border disabled:opacity-30 hover:border-accent-lime transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
