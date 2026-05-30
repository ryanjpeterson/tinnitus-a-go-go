/**
 * Public landing page — visible to all visitors, authenticated or not.
 *
 * Shows the full concert log. No login required. Ears not included.
 */

import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Wordmark } from "@/components/Wordmark";
import { api, type PublicConcertItem } from "@/lib/api";
import { useCopy } from "@/lib/useCopyValue";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 40;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtYear(iso: string): string {
  return iso.slice(0, 4);
}

const STATUS_STYLES: Record<string, { dot: string; text: string; label: string }> = {
  attended:   { dot: "bg-accent-lime",   text: "text-accent-lime",  label: "Attended"   },
  attending:  { dot: "bg-yellow-400",    text: "text-yellow-400",   label: "Attending"  },
  interested: { dot: "bg-purple-400",    text: "text-purple-400",   label: "Interested" },
  missed:     { dot: "bg-red-400",       text: "text-red-400",      label: "Missed"     },
  cancelled:  { dot: "bg-text-subtle",   text: "text-text-subtle",  label: "Cancelled"  },
  dismissed:  { dot: "bg-text-subtle",   text: "text-text-subtle",  label: "Dismissed"  },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { dot: "bg-text-subtle", text: "text-text-subtle", label: status };
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      <span className={`text-xs font-mono ${s.text}`}>{s.label}</span>
    </span>
  );
}

/** Primary display name(s) for a concert — single headliner, or co-headliners joined with " & ". */
function getHeadliner(c: PublicConcertItem): string {
  const headliner = c.artists.find((a) => a.role === "headliner");
  if (headliner) return headliner.name;
  const coHeads = c.artists.filter((a) => a.role === "co_headliner");
  if (coHeads.length > 0) return coHeads.map((a) => a.name).join(" & ");
  return c.artists.at(-1)?.name ?? c.headlinerHint ?? "Unknown";
}

/** Flat artist string for text search (all artists). */
function getArtistLine(c: PublicConcertItem): string {
  if (c.artists.length === 0) return c.headlinerHint ?? "";
  return c.artists.map((a) => a.name).join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function LandingPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // CMS-driven copy — falls back to hardcoded defaults if not yet loaded
  const copy = useCopy({
    "landing.tagline":          "Your ears gave up. We kept notes.",
    "landing.description":      "Every concert survived, every opener ignored, every ticket stub currently disintegrating in a jacket pocket — all of it, catalogued here. Self-hosted. Invite-only. No ads, no algorithm, and absolutely no warranty against further hearing loss. Just",
    "landing.description_suffix": "shows and a faint ringing that your doctor says is totally fine.",
    "landing.stat_attended":    "attended",
    "landing.stat_other":       "pending / other",
    "landing.stat_artists":     "artists subjected to",
    "landing.stat_years":       "years of questionable decisions",
    "landing.loading":          "Scanning the damage…",
    "landing.error":            "Couldn't load the log. The ringing continues regardless.",
    "landing.empty":            "Nothing matches. Apparently even your concert history has taste.",
    "landing.footer":           "invite-only · ask someone who already has tinnitus",
  });

  const concertsQuery = useQuery({
    queryKey: ["public/concerts"],
    queryFn: () => api.listPublicConcerts(),
    staleTime: 60_000,
  });

  const [yearFilter,   setYearFilter]   = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search,       setSearch]       = useState("");
  const [page,         setPage]         = useState(1);

  const concerts = concertsQuery.data?.concerts ?? [];

  // Derived stats
  const stats = useMemo(() => {
    const total    = concerts.length;
    const attended = concerts.filter((c) => c.attendance?.status === "attended").length;
    const years    = [...new Set(concerts.map((c) => c.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
    const artists  = new Set(concerts.flatMap((c) => c.artists.map((a) => a.id))).size;
    return { total, attended, years, artists };
  }, [concerts]);

  // Group years by decade (newest decade first)
  const decadeGroups = useMemo((): Array<{ decade: string; years: string[] }> => {
    const map = new Map<string, string[]>();
    for (const y of stats.years) {
      const decade = `${y.slice(0, 3)}0s`;
      const list = map.get(decade) ?? [];
      list.push(y);
      map.set(decade, list);
    }
    // Sort decades newest first
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([decade, years]) => ({ decade, years }));
  }, [stats.years]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = concerts;
    if (yearFilter !== "all")   list = list.filter((c) => c.date.startsWith(yearFilter));
    if (statusFilter !== "all") list = list.filter((c) => c.attendance?.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        getArtistLine(c).toLowerCase().includes(q) ||
        c.venue?.name.toLowerCase().includes(q) ||
        c.venue?.city?.toLowerCase().includes(q) ||
        c.headlinerHint?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [concerts, yearFilter, statusFilter, search]);

  // Reset page to 1 when filters change
  const applyYearFilter = (y: string) => { setYearFilter(y); setPage(1); };
  const applyStatusFilter = (s: string) => { setStatusFilter(s); setPage(1); };
  const applySearch = (v: string) => { setSearch(v); setPage(1); };

  // Paginated slice
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-bg text-text-base">

      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 border-b border-border bg-bg/95 backdrop-blur">
        <Link to="/" className="flex items-center">
          <Wordmark size="sm" svg />
        </Link>
        <div className="flex items-center gap-3">
          {!authLoading && (
            user ? (
              <Link to="/app" className="text-sm font-mono text-accent-lime hover:underline">
                → my log
              </Link>
            ) : (
              <Link
                to="/login"
                className="text-sm font-mono px-4 py-1.5 rounded border border-border text-text-muted hover:text-text-base hover:border-accent-lime transition-colors"
              >
                Sign in
              </Link>
            )
          )}
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="px-5 pt-14 pb-10 sm:px-8 max-w-5xl mx-auto">
        <Wordmark size="xl" svg className="mb-6" />

        <p className="text-xl sm:text-2xl font-display uppercase text-text-base leading-snug max-w-2xl mb-4">
          {copy["landing.tagline"]}
        </p>
        <p className="text-sm sm:text-base text-text-muted max-w-2xl leading-relaxed">
          {copy["landing.description"]}{" "}
          <span className="text-accent-lime font-mono font-bold">{stats.total}</span>{" "}
          {copy["landing.description_suffix"]}
        </p>

        {/* Stats strip */}
        {stats.total > 0 && (
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono">
            <span className="text-text-subtle">
              <span className="text-text-base">{stats.attended}</span> {copy["landing.stat_attended"]}
            </span>
            <span className="text-text-subtle">
              <span className="text-text-base">{stats.total - stats.attended}</span> {copy["landing.stat_other"]}
            </span>
            <span className="text-text-subtle">
              <span className="text-text-base">{stats.artists}</span> {copy["landing.stat_artists"]}
            </span>
            <span className="text-text-subtle">
              <span className="text-text-base">{stats.years.length}</span> {copy["landing.stat_years"]}
            </span>
          </div>
        )}
      </section>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto mb-4 space-y-2">
        {/* Year filter — grouped by decade */}
        <div className="space-y-1.5">
          {/* "All years" always first */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-subtle uppercase tracking-widest w-10 shrink-0 select-none">
              All
            </span>
            <FilterPill value="all" current={yearFilter} onSelect={applyYearFilter} label="All years" />
          </div>
          {decadeGroups.map(({ decade, years }) => (
            <div key={decade} className="flex items-start gap-2">
              <span className="text-[10px] font-mono text-text-subtle uppercase tracking-widest w-10 shrink-0 pt-1 select-none">
                {decade}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {years.map((y) => (
                  <FilterPill key={y} value={y} current={yearFilter} onSelect={applyYearFilter} label={y} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Status + search row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            <FilterPill value="all"        current={statusFilter} onSelect={applyStatusFilter} label="Show All"   />
            <FilterPill value="attended"   current={statusFilter} onSelect={applyStatusFilter} label="Attended"   accent="lime"   />
            <FilterPill value="attending"  current={statusFilter} onSelect={applyStatusFilter} label="Attending"  accent="yellow" />
            <FilterPill value="interested" current={statusFilter} onSelect={applyStatusFilter} label="Interested" accent="purple" />
            <FilterPill value="missed"     current={statusFilter} onSelect={applyStatusFilter} label="Missed"     accent="red"    />
            <FilterPill value="cancelled"  current={statusFilter} onSelect={applyStatusFilter} label="Cancelled"  />
          </div>

          <input
            type="search"
            placeholder="Search artists, venues, cities…"
            value={search}
            onChange={(e) => applySearch(e.target.value)}
            className="ml-auto w-full sm:w-60 rounded border border-border bg-surface px-3 py-1.5 text-xs text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime transition-colors"
          />
        </div>
      </section>

      {/* ── Concert list ─────────────────────────────────────────────────── */}
      <section className="px-5 sm:px-8 max-w-5xl mx-auto pb-16">
        {concertsQuery.isLoading && (
          <div className="text-text-subtle font-mono text-sm animate-pulse py-8">
            {copy["landing.loading"]}
          </div>
        )}
        {concertsQuery.isError && (
          <div className="text-accent-pink font-mono text-sm py-8">
            {copy["landing.error"]}
          </div>
        )}

        {concertsQuery.isSuccess && filtered.length === 0 && (
          <div className="text-text-subtle font-mono text-sm py-8">
            {copy["landing.empty"]}
          </div>
        )}

        {concertsQuery.isSuccess && filtered.length > 0 && (
          <>
            {/* Count + page info */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-mono text-text-subtle">
                {filtered.length === concerts.length
                  ? `${concerts.length} shows total`
                  : `${filtered.length} of ${concerts.length} shows`}
                {totalPages > 1 && ` · page ${page} of ${totalPages}`}
              </p>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              {/* Table header — desktop */}
              <div className="hidden sm:grid grid-cols-[100px_1fr_minmax(140px,220px)_110px] gap-0 bg-surface border-b border-border px-4 py-2 text-[10px] font-mono text-text-subtle uppercase tracking-widest">
                <span>Date</span>
                <span>Show</span>
                <span>Venue</span>
                <span>Status</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-border">
                {paginated.map((c) => (
                  <ConcertRow key={c.id} concert={c} onClick={() => navigate(`/shows/${c.id}`)} />
                ))}
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded border border-border text-xs font-mono text-text-muted hover:text-text-base hover:border-accent-lime disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ← Prev
                </button>

                {/* Page number pills — show up to 7 around current page */}
                {buildPageRange(page, totalPages).map((p, i) =>
                  p === null ? (
                    <span key={`ellipsis-${i}`} className="text-text-subtle font-mono text-xs px-1">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`px-3 py-1.5 rounded border text-xs font-mono transition-colors ${
                        p === page
                          ? "bg-accent-lime text-bg font-bold border-accent-lime"
                          : "border-border text-text-muted hover:text-text-base hover:border-accent-lime"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded border border-border text-xs font-mono text-text-muted hover:text-text-base hover:border-accent-lime disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <p className="mt-12 text-xs text-text-subtle font-mono text-center">
          {copy["landing.footer"]} ·{" "}
          <Link to="/login" className="hover:text-accent-lime transition-colors">sign in</Link>
        </p>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a page range with nulls for ellipsis gaps. */
function buildPageRange(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | null)[] = [];
  const addPage = (p: number) => { if (!pages.includes(p)) pages.push(p); };
  addPage(1);
  if (current > 3) pages.push(null);
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) addPage(p);
  if (current < total - 2) pages.push(null);
  addPage(total);
  return pages;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function FilterPill({
  value, current, onSelect, label,
  accent,
}: {
  value: string;
  current: string;
  onSelect: (v: string) => void;
  label: string;
  accent?: "lime" | "pink" | "yellow" | "purple" | "red";
}) {
  const active = value === current;
  const accentActive =
    accent === "lime"   ? "bg-accent-lime text-bg border-accent-lime"   :
    accent === "pink"   ? "bg-accent-pink text-bg border-accent-pink"   :
    accent === "yellow" ? "bg-yellow-400 text-bg border-yellow-400"     :
    accent === "purple" ? "bg-purple-500 text-bg border-purple-500"     :
    accent === "red"    ? "bg-red-500 text-bg border-red-500"           :
    "bg-accent-lime text-bg border-accent-lime";

  return (
    <button
      onClick={() => onSelect(value)}
      className={`px-3 py-1 rounded text-xs font-mono transition-colors whitespace-nowrap ${
        active
          ? accentActive
          : "border border-border text-text-muted hover:text-text-base hover:border-accent-lime"
      }`}
    >
      {label}
    </button>
  );
}

function ConcertRow({ concert: c, onClick }: { concert: PublicConcertItem; onClick: () => void }) {
  const headliner = getHeadliner(c);
  // Support acts only — co-headliners are already rendered as the primary headline
  const supports  = c.artists.filter((a) => a.role !== "headliner" && a.role !== "co_headliner");
  const status    = c.attendance?.status ?? null;
  const cost      = c.attendance?.ticketPricePaid;
  const currency  = c.attendance?.ticketPriceCurrency ?? "CAD";

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 hover:bg-surface transition-colors group"
    >
      {/* Mobile layout */}
      <div className="sm:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-text-base font-medium truncate group-hover:text-accent-lime transition-colors">
              {headliner}
            </div>
            {supports.length > 0 && (
              <div className="text-text-subtle text-xs truncate mt-0.5">
                {supports.map((a) => a.name).join(" · ")}
              </div>
            )}
            <div className="text-text-subtle text-xs mt-1 font-mono">
              {fmtDate(c.date)}
              {c.venue && <> · {c.venue.name}{c.venue.city ? `, ${c.venue.city}` : ""}</>}
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
            {status && <StatusBadge status={status} />}
          </div>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden sm:grid grid-cols-[100px_1fr_minmax(140px,220px)_110px] gap-0 items-center">
        {/* Date */}
        <div className="font-mono text-text-subtle pr-3">
          <div className="text-xs">{fmtYear(c.date)}</div>
          <div className="text-[10px] opacity-70">{fmtDate(c.date).replace(/,?\s*\d{4}$/, "")}</div>
        </div>

        {/* Show */}
        <div className="min-w-0 pr-4">
          <div className="text-text-base text-sm font-medium truncate group-hover:text-accent-lime transition-colors">
            {headliner}
          </div>
          {supports.length > 0 && (
            <div className="text-text-subtle text-xs truncate">
              {supports.map((a) => a.name).join(" · ")}
            </div>
          )}
          {cost != null && (
            <div className="text-[10px] font-mono text-text-subtle opacity-70 mt-0.5">
              ${(cost / 100).toFixed(2)} {currency}
            </div>
          )}
        </div>

        {/* Venue */}
        <div className="min-w-0 pr-4">
          {c.venue && (
            <>
              <div className="text-text-muted text-xs truncate">{c.venue.name}</div>
              {c.venue.city && (
                <div className="text-text-subtle text-xs truncate">
                  {c.venue.city}{c.venue.region ? `, ${c.venue.region}` : ""}
                </div>
              )}
            </>
          )}
        </div>

        {/* Status */}
        <div>
          {status && <StatusBadge status={status} />}
        </div>

      </div>
    </button>
  );
}
