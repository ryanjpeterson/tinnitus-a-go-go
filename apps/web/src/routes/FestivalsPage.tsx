/**
 * Festival / series index — card grid matching Artists and Venues pages.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EntityCard } from "@/components/EntityCard";

export function FestivalsPage() {
  const seriesQuery = useQuery({
    queryKey: ["series"],
    queryFn: () => api.listSeries({ limit: 60 }),
    staleTime: 30_000,
  });

  const { series = [], total = 0 } = seriesQuery.data ?? {};

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display uppercase text-3xl">Festivals</h1>
        {total > 0 && <span className="font-mono text-sm text-text-muted">{total} total</span>}
      </div>

      {seriesQuery.isLoading ? (
        <div className="py-16 text-center text-text-subtle font-mono text-sm animate-pulse">Loading…</div>
      ) : series.length === 0 ? (
        <div className="py-16 text-center text-text-subtle font-mono text-sm">
          No festivals logged yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {series.map((s) => (
            <EntityCard
              key={s.id}
              href={`/app/festivals/${s.slug}`}
              name={s.name}
              sub2={`${s.dayCount}d · ${s.artistCount} artists`}
              placeholderBg="bg-yellow-950"
              placeholderColor="text-yellow-400"
            />
          ))}
        </div>
      )}
    </div>
  );
}
