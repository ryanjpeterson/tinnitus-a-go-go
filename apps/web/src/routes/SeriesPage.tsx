/**
 * Festival / series detail — all of the user's days at this event series.
 */

import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export function SeriesPage() {
  const { slug } = useParams<{ slug: string }>();

  const q = useQuery({
    queryKey: ["series", slug],
    queryFn: () => api.getSeries(slug!),
    enabled: !!slug,
  });

  if (q.isLoading) {
    return <div className="py-16 text-center text-text-subtle font-mono text-sm animate-pulse">Loading…</div>;
  }
  if (q.isError || !q.data) {
    return (
      <div className="py-16 text-center font-mono text-sm text-accent-pink">
        Festival not found. <Link to="/app/festivals" className="underline text-text-muted">Back to festivals</Link>
      </div>
    );
  }

  const { series, concerts, stats } = q.data;

  return (
    <div className="max-w-2xl">
      <Link to="/app/festivals" className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors">
        ← Festivals
      </Link>

      <div className="mt-4 mb-6">
        <h1 className="font-display uppercase text-3xl mb-1">{series.name}</h1>
        {series.year && <p className="text-sm text-text-muted font-mono">{series.year}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <div className="font-mono text-2xl text-text-base">{stats.daysAttended}</div>
          <div className="text-xs text-text-muted mt-1">Days attended</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <div className="font-mono text-2xl text-text-base">{stats.uniqueArtists}</div>
          <div className="text-xs text-text-muted mt-1">Artists seen</div>
        </div>
      </div>

      <div className="space-y-3">
        {concerts.map((c) => (
          <Link
            key={c.id}
            to={`/app/concerts/${c.id}`}
            className="block rounded-lg border border-border bg-surface p-4 hover:border-accent-lime transition-colors"
          >
            <div className="flex items-baseline justify-between mb-2">
              <time className="font-mono text-sm text-text-muted">{fmtDate(c.date)}</time>
              {c.venue && (
                <span className="text-xs text-text-subtle">
                  {c.venue.name}{c.venue.city ? ` · ${c.venue.city}` : ""}
                </span>
              )}
            </div>
            {c.artists.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {c.artists.map((a) => (
                  <span
                    key={a.slug}
                    className="text-xs px-2 py-0.5 rounded border border-border bg-surface-2 text-text-muted font-mono"
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
