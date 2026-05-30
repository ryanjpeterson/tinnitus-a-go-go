/**
 * Festival index — card grid showing user's festivals.
 *
 * Uses the new festivals API if available (after migration),
 * otherwise falls back to the legacy series API.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type FestivalListItem, type SeriesListItem } from "@/lib/api";
import { AddFestivalModal } from "./AddFestivalModal";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function fmtDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  if (start && !end) return fmtDate(start);
  if (!start && end) return fmtDate(end);

  const [sy, sm, sd] = start!.split("-").map(Number);
  const [ey, em, ed] = end!.split("-").map(Number);
  const startDate = new Date(Date.UTC(sy!, sm! - 1, sd!));
  const endDate = new Date(Date.UTC(ey!, em! - 1, ed!));

  const startMonth = startDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const endMonth = endDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const year = startDate.toLocaleDateString("en-US", { year: "numeric", timeZone: "UTC" });

  if (sm === em && sy === ey) {
    // Same month: "Jul 10 - 20, 2025"
    return `${startMonth} ${sd} - ${ed}, ${year}`;
  }
  // Different months: "Jul 10 - Aug 5, 2025"
  return `${startMonth} ${sd} - ${endMonth} ${ed}, ${year}`;
}

const STATUS_COLORS: Record<string, string> = {
  attended: "bg-lime-950 border-lime-700 text-accent-lime",
  attending: "bg-yellow-950 border-yellow-600 text-yellow-400",
  interested: "bg-purple-950 border-purple-700 text-purple-400",
  missed: "bg-red-950 border-red-700 text-red-400",
  cancelled: "bg-gray-800 border-gray-600 text-gray-400",
  dismissed: "bg-gray-800 border-gray-600 text-gray-500",
};

// New-style festival card (when using new API)
function NewFestivalCard({ festival }: { festival: FestivalListItem }) {
  const statusColor = STATUS_COLORS[festival.attendance.status] ?? "bg-surface border-border text-text-muted";
  const dateRange = fmtDateRange(festival.startDate, festival.endDate);

  return (
    <Link
      to={`/app/festivals/${festival.slug}`}
      className="group relative rounded-lg border border-border bg-surface overflow-hidden hover:border-accent-lime transition-colors"
    >
      <div className="aspect-[4/3] relative overflow-hidden bg-surface-2">
        {festival.flyerUrl ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center blur-xl scale-110 opacity-60"
              style={{ backgroundImage: `url(${festival.flyerUrl})` }}
            />
            <img
              src={festival.flyerUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-contain"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-yellow-950">
            <span className="text-4xl font-display text-yellow-400/30 uppercase">
              {festival.name.slice(0, 2)}
            </span>
          </div>
        )}
        <div className={`absolute top-2 right-2 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${statusColor}`}>
          {festival.attendance.status}
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-display uppercase text-sm truncate group-hover:text-accent-lime transition-colors">
          {festival.name}
        </h3>
        {dateRange && (
          <p className="text-xs font-mono text-text-muted mt-0.5">{dateRange}</p>
        )}
        {festival.venue && (
          <p className="text-xs text-text-subtle mt-1 truncate">
            {festival.venue.name}
            {festival.venue.city && ` · ${festival.venue.city}`}
          </p>
        )}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs font-mono text-text-muted">
            {festival.artistCount} artist{festival.artistCount !== 1 ? "s" : ""}
          </span>
          {festival.attendance.rating && (
            <span className="text-xs font-mono text-accent-lime">
              {festival.attendance.rating}/10
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// Legacy-style festival card (when using old series API)
function LegacyFestivalCard({ series }: { series: SeriesListItem }) {
  return (
    <Link
      to={`/app/festivals/${series.slug}`}
      className="group relative rounded-lg border border-border bg-surface overflow-hidden hover:border-accent-lime transition-colors"
    >
      <div className="aspect-[4/3] relative overflow-hidden bg-surface-2">
        <div className="absolute inset-0 flex items-center justify-center bg-yellow-950">
          <span className="text-4xl font-display text-yellow-400/30 uppercase">
            {series.name.slice(0, 2)}
          </span>
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-display uppercase text-sm truncate group-hover:text-accent-lime transition-colors">
          {series.name}
        </h3>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs font-mono text-text-muted">
            {series.dayCount}d · {series.artistCount} artists
          </span>
        </div>
      </div>
    </Link>
  );
}

export function FestivalsPage() {
  const [addOpen, setAddOpen] = useState(false);

  // Try new festivals API first
  const festivalsQuery = useQuery({
    queryKey: ["festivals"],
    queryFn: () => api.listFestivals({ limit: 60 }),
    staleTime: 30_000,
    retry: false, // Don't retry if it fails (migration might not be run)
  });

  // Fall back to legacy series API if new one fails
  const seriesQuery = useQuery({
    queryKey: ["series"],
    queryFn: () => api.listSeries({ limit: 60 }),
    staleTime: 30_000,
    enabled: festivalsQuery.isError, // Only run if festivals query fails
  });

  const isLoading = festivalsQuery.isLoading || (festivalsQuery.isError && seriesQuery.isLoading);
  const useNewApi = festivalsQuery.isSuccess && !festivalsQuery.isError;

  const newFestivals = festivalsQuery.data?.festivals ?? [];
  const legacySeries = seriesQuery.data?.series ?? [];

  const total = useNewApi
    ? (festivalsQuery.data?.total ?? 0)
    : (seriesQuery.data?.total ?? 0);

  const isEmpty = useNewApi
    ? newFestivals.length === 0
    : legacySeries.length === 0;

  // Only show "Add festival" if the new API is available
  const canAddNew = useNewApi;

  return (
    <div>
      {addOpen && <AddFestivalModal onClose={() => setAddOpen(false)} />}

      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display uppercase text-3xl">Festivals</h1>
        <div className="flex items-center gap-3">
          {total > 0 && <span className="font-mono text-sm text-text-muted">{total} total</span>}
          {canAddNew && (
            <button
              onClick={() => setAddOpen(true)}
              className="text-sm font-mono px-3 py-1.5 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity"
            >
              + Add festival
            </button>
          )}
        </div>
      </div>

      {/* Migration notice when using legacy API */}
      {!useNewApi && !isLoading && (
        <div className="mb-4 p-3 rounded border border-yellow-700 bg-yellow-950/30 text-yellow-400 text-xs font-mono">
          Run the database migration to enable full festival management features.
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-text-subtle font-mono text-sm animate-pulse">Loading…</div>
      ) : isEmpty ? (
        <div className="py-16 text-center">
          <p className="text-text-subtle font-mono text-sm mb-4">No festivals logged yet.</p>
          {canAddNew && (
            <button
              onClick={() => setAddOpen(true)}
              className="text-sm font-mono px-4 py-2 rounded border border-accent-lime text-accent-lime hover:bg-accent-lime/10 transition-colors"
            >
              Add your first festival
            </button>
          )}
        </div>
      ) : useNewApi ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {newFestivals.map((f) => (
            <NewFestivalCard key={f.id} festival={f} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {legacySeries.map((s) => (
            <LegacyFestivalCard key={s.id} series={s} />
          ))}
        </div>
      )}
    </div>
  );
}
