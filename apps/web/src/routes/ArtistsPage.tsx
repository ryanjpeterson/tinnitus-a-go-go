/**
 * Artist index — card grid of all artists in the user's log.
 */

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EntityCard } from "@/components/EntityCard";

export function ArtistsPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (val: string): void => {
    setQ(val);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setDebouncedQ(val); setPage(1); }, 300);
  };

  const artistsQuery = useQuery({
    queryKey: ["artists", { q: debouncedQ, page }],
    queryFn: () => api.listArtists({ q: debouncedQ || undefined, page, limit: 40 }),
    staleTime: 30_000,
  });

  const { artists = [], total = 0, totalPages = 0 } = artistsQuery.data ?? {};

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display uppercase text-3xl">Artists</h1>
        {total > 0 && <span className="font-mono text-sm text-text-muted">{total} total</span>}
      </div>

      <input
        type="search"
        placeholder="Search artists…"
        value={q}
        onChange={(e) => handleSearch(e.target.value)}
        className="w-full max-w-sm rounded border border-border bg-surface px-3 py-2 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime mb-5"
      />

      {artistsQuery.isLoading ? (
        <div className="py-16 text-center text-text-subtle font-mono text-sm animate-pulse">Loading…</div>
      ) : artists.length === 0 ? (
        <div className="py-16 text-center text-text-subtle font-mono text-sm">
          {debouncedQ ? "No artists match your search." : "Import your CSV to populate artists."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {artists.map((a) => (
              <EntityCard
                key={a.id}
                href={`/app/artists/${a.slug}`}
                name={a.name}
                imageUrl={a.imageKey}
                sub1={a.genre}
                sub2={`${a.showCount} ${a.showCount === 1 ? "show" : "shows"}`}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between text-xs font-mono text-text-muted">
              <span>{total} artists</span>
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
