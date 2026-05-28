/**
 * Venue index — card grid of all venues in the user's log.
 */

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EntityCard } from "@/components/EntityCard";

export function VenuesPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (val: string): void => {
    setQ(val);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setDebouncedQ(val); setPage(1); }, 300);
  };

  const venuesQuery = useQuery({
    queryKey: ["venues", { q: debouncedQ, page }],
    queryFn: () => api.listVenues({ q: debouncedQ || undefined, page, limit: 30 }),
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
        value={q}
        onChange={(e) => handleSearch(e.target.value)}
        className="w-full max-w-sm rounded border border-border bg-surface px-3 py-2 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime mb-5"
      />

      {venuesQuery.isLoading ? (
        <div className="py-16 text-center text-text-subtle font-mono text-sm animate-pulse">Loading…</div>
      ) : venues.length === 0 ? (
        <div className="py-16 text-center text-text-subtle font-mono text-sm">
          {debouncedQ ? "No venues match your search." : "Import your CSV to populate venues."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {venues.map((v) => (
              <EntityCard
                key={v.id}
                href={`/app/venues/${v.slug}`}
                name={v.name}
                imageUrl={v.imageUrl}
                sub1={[v.city, v.region].filter(Boolean).join(", ") || null}
                sub2={`${v.showCount} ${v.showCount === 1 ? "show" : "shows"}`}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between text-xs font-mono text-text-muted">
              <span>{total} venues</span>
              <div className="flex gap-1">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 rounded border border-border disabled:opacity-30 hover:border-accent-lime transition-colors">
                  ← Prev
                </button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded border border-border disabled:opacity-30 hover:border-accent-lime transition-colors">
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
