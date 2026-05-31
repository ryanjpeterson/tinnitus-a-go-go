/**
 * Concert list — card grid view of the user's log.
 *
 * All filter/sort/page state lives in the URL (?page=&sort=&status=&q=) so
 * the browser back button always restores the exact view you left.
 */

import { useState, useRef, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AddConcertModal } from "./AddConcertModal";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, type ConcertListItem } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { AttendanceStatus } from "@tagg/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TABS: { label: string; value: AttendanceStatus | undefined; activeClass: string }[] = [
  { label: "All",       value: undefined,    activeClass: "bg-accent-lime text-bg font-bold"      },
  { label: "Attended",  value: "attended",   activeClass: "bg-lime-950 text-accent-lime font-bold" },
  { label: "Attending", value: "attending",  activeClass: "bg-yellow-950 text-yellow-400 font-bold"},
  { label: "Interested",value: "interested", activeClass: "bg-purple-950 text-purple-400 font-bold"},
  { label: "Missed",    value: "missed",     activeClass: "bg-red-950 text-red-400 font-bold"        },
];

const STATUS_CHIP: Record<AttendanceStatus, { label: string; classes: string; dot: string; border: string }> = {
  attended:  { label: "Attended",  classes: "bg-lime-950 text-accent-lime border-lime-700",    dot: "bg-accent-lime",  border: "border-lime-700"   },
  attending: { label: "Attending", classes: "bg-yellow-950 text-yellow-400 border-yellow-700", dot: "bg-yellow-400",   border: "border-yellow-600" },
  interested:{ label: "Interested",classes: "bg-purple-950 text-purple-400 border-purple-800", dot: "bg-purple-400",   border: "border-purple-700" },
  missed:    { label: "Missed",    classes: "bg-red-950 text-red-400 border-red-800",          dot: "bg-red-400",      border: "border-red-700"    },
  cancelled: { label: "Cancelled", classes: "bg-surface-2 text-text-subtle border-border",     dot: "bg-text-subtle",  border: "border-border"     },
  dismissed: { label: "Dismissed", classes: "bg-surface-2 text-text-subtle border-border",     dot: "bg-text-subtle",  border: "border-border"     },
};

type SortOrder = "newest" | "oldest";

const PAGE_SIZE = 24;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function concertHeadliner(c: ConcertListItem): string {
  const top = c.artists.filter((a) => a.role === "headliner" || a.role === "co_headliner");
  if (top.length > 0) return top.map((a) => a.name).join(" & ");
  return c.headlinerHint ?? c.artists[0]?.name ?? c.eventSeries?.name ?? "Unknown";
}

const SUPPORT_ROLES = new Set(["support", "opener", "festival_set"]); // legacy values kept for existing data display

function supportingActs(c: ConcertListItem): string {
  const all = c.artists.filter((a) => SUPPORT_ROLES.has(a.role));
  if (all.length === 0) return "";
  const shown = all.slice(0, 3).map((a) => a.name);
  const extra = all.length - shown.length;
  return shown.join(", ") + (extra > 0 ? ` +${extra}` : "");
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Flyer placeholder
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER_BG: Partial<Record<AttendanceStatus, string>> = {
  attended:  "bg-lime-950",
  attending: "bg-yellow-950",
  interested:"bg-purple-950",
  missed:    "bg-red-950",
};

function FlyerPlaceholder({ title, status }: { title: string; status?: AttendanceStatus }) {
  const initials = title.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const bg = status ? (PLACEHOLDER_BG[status] ?? "bg-surface-2") : "bg-surface-2";
  return (
    <div
      className={clsx(
        "w-full h-full flex flex-col items-center justify-center select-none",
        bg,
      )}
    >
      <div className="font-display uppercase text-2xl text-text-subtle tracking-widest opacity-40">
        {initials}
      </div>
      <div className="mt-1 opacity-20">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-text-subtle">
          <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 2v4M16 2v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="8" cy="15" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="15" r="1.5" fill="currentColor"/>
          <circle cx="16" cy="15" r="1.5" fill="currentColor"/>
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Concert card
// ─────────────────────────────────────────────────────────────────────────────

function ConcertCard({
  concert,
  onStatusChange,
}: {
  concert: ConcertListItem;
  onStatusChange?: (id: string, status: AttendanceStatus) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const chip = concert.attendance ? STATUS_CHIP[concert.attendance.status] : null;
  const headliner = concertHeadliner(concert);
  const supports = supportingActs(concert);

  const borderClass = chip ? chip.border : "border-border";

  return (
    <div className={clsx(
      "group relative flex flex-col rounded-lg border bg-surface overflow-hidden hover:border-accent-lime transition-colors",
      borderClass
    )}>
      {/* Flyer / header image */}
      <Link to={`/concerts/${concert.id}`} className="block">
        <div className="aspect-[3/2] overflow-hidden bg-surface-2 relative">
          {concert.flyerUrl ? (
            <>
              {/* Blurred background */}
              <img
                src={concert.flyerUrl}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover blur-lg scale-110 opacity-80"
              />
              {/* Sharp foreground image */}
              <img
                src={concert.flyerUrl}
                alt={headliner}
                className="relative w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </>
          ) : (
            <FlyerPlaceholder title={headliner} status={concert.attendance?.status} />
          )}
          {concert.type === "festival_day" && (
            <span className="absolute top-2 left-2 text-xs font-mono bg-black/70 text-yellow-300 px-2 py-0.5 rounded">
              festival
            </span>
          )}
          {chip && (
            <span className={clsx("absolute top-2 right-2 text-xs font-mono px-2 py-0.5 rounded border", chip.classes)}>
              {chip.label}
            </span>
          )}
        </div>
      </Link>

      {/* Card body */}
      <div className="flex-1 flex flex-col p-3 gap-1">
        <Link
          to={`/concerts/${concert.id}`}
          className="font-display uppercase tracking-wide text-sm text-text-base hover:text-accent-lime transition-colors line-clamp-1"
        >
          {headliner}
        </Link>

        {supports && (
          <p className="text-xs text-text-subtle truncate">{supports}</p>
        )}

        <div className="text-xs text-text-muted font-mono mt-0.5">
          {fmtDate(concert.date)}
        </div>

        {concert.eventSeries && (
          <div className="text-xs text-yellow-600 font-mono truncate" title={concert.eventSeries.name}>
            {concert.eventSeries.name}
          </div>
        )}

        {concert.venue && (
          <div className="text-xs text-text-subtle truncate">
            {concert.venue.name}{concert.venue.city ? ` · ${concert.venue.city}` : ""}
          </div>
        )}

        {concert.attendance?.personalNotes && (
          <p className="text-xs text-text-subtle italic line-clamp-1 mt-0.5">
            {concert.attendance.personalNotes}
          </p>
        )}

        {/* Footer row - only show status when attendance data exists */}
        {chip && onStatusChange && (
          <div className="flex items-center justify-between mt-auto pt-2">
            <div className="ml-auto relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className={clsx("text-xs px-2 py-0.5 rounded border font-mono transition-opacity", chip.classes)}
              >
                {chip.label}
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 bottom-7 z-20 bg-surface border border-border rounded shadow-xl py-1 w-36"
                  onBlur={() => setMenuOpen(false)}
                >
                  {(["attended","attending","interested","missed","cancelled","dismissed"] as AttendanceStatus[]).map(
                    (s) => (
                      <button
                        key={s}
                        className="w-full text-left px-3 py-1.5 text-xs text-text-muted hover:text-text-base hover:bg-surface-2 font-mono flex items-center gap-2"
                        onClick={() => { onStatusChange(concert.id, s); setMenuOpen(false); }}
                      >
                        <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", STATUS_CHIP[s].dot)} />
                        {STATUS_CHIP[s].label}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function ConcertsPage() {
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);

  // ── Derive state from URL params ──────────────────────────────────────────
  const page         = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const sort         = (searchParams.get("sort") ?? "newest") as SortOrder;
  const statusParam  = searchParams.get("status") as AttendanceStatus | null;
  const statusFilter = STATUS_TABS.some((t) => t.value === statusParam) ? (statusParam ?? undefined) : undefined;
  const urlQ         = searchParams.get("q") ?? "";

  // Local input state — keeps the search field responsive while debounce runs
  const [inputQ, setInputQ] = useState(urlQ);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync input field when URL changes externally (e.g. browser back)
  useEffect(() => {
    setInputQ(urlQ);
  }, [urlQ]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Set params, always resetting to page 1. Replaces history (filter changes aren't navigation). */
  const setFilter = (updates: Record<string, string | undefined>): void => {
    setSearchParams(mergeParams(searchParams, { ...updates, page: undefined }), { replace: true });
  };

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

  const apiSort = sort === "oldest" ? "date_asc" : "date_desc";

  // ── Queries ───────────────────────────────────────────────────────────────

  const concertsQuery = useQuery({
    queryKey: ["concerts", { status: statusFilter, q: urlQ, page, sort: apiSort }],
    queryFn: () => api.listConcerts({ status: statusFilter, q: urlQ || undefined, page, limit: PAGE_SIZE, sort: apiSort }),
    staleTime: 15_000,
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AttendanceStatus }) => api.patchConcert(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["concerts"] });
    },
  });

  const { concerts = [], total = 0, totalPages = 0 } = concertsQuery.data ?? {};

  const handleExport = async (): Promise<void> => {
    const blob = await api.exportCsv();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `concerts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-5 space-y-2">
        {/* Row 1: search + actions */}
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Search artist, venue, or festival…"
            value={inputQ}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 rounded border border-border bg-surface px-3 py-1.5 text-xs text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
          />
          {isAdmin && (
            <button
              onClick={() => setAddOpen(true)}
              className="text-xs font-mono px-3 py-1.5 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity shrink-0"
            >
              + Add show
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => void handleExport()}
              className="hidden sm:block text-xs font-mono text-text-muted hover:text-accent-lime transition-colors border border-border rounded px-3 py-1.5 shrink-0"
            >
              Export ↓
            </button>
          )}
        </div>

        {/* Row 2: status filter (admin only) + sort */}
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <div className="flex gap-1 rounded border border-border p-0.5 bg-surface">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.label}
                  onClick={() => setFilter({ status: tab.value })}
                  className={clsx(
                    "min-w-[72px] px-3 py-1.5 rounded text-xs font-mono transition-colors text-center",
                    statusFilter === tab.value
                      ? tab.activeClass
                      : "text-text-muted hover:text-text-base",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => setFilter({ sort: "newest" })}
              className={clsx(
                "min-w-[56px] px-3 py-1.5 rounded text-xs font-mono transition-colors text-center border",
                sort === "newest" ? "bg-accent-lime text-bg font-bold border-accent-lime" : "text-text-muted hover:text-text-base border-border",
              )}
            >
              Newest
            </button>
            <button
              onClick={() => setFilter({ sort: "oldest" })}
              className={clsx(
                "min-w-[56px] px-3 py-1.5 rounded text-xs font-mono transition-colors text-center border",
                sort === "oldest" ? "bg-accent-lime text-bg font-bold border-accent-lime" : "text-text-muted hover:text-text-base border-border",
              )}
            >
              Oldest
            </button>
          </div>
        </div>
      </div>

      {/* Concert grid */}
      {concertsQuery.isLoading ? (
        <div className="py-16 text-center text-text-subtle font-mono text-sm animate-pulse">Loading…</div>
      ) : concertsQuery.isError ? (
        <div className="py-16 text-center text-accent-pink font-mono text-sm">Failed to load concerts.</div>
      ) : concerts.length === 0 ? (
        <div className="py-16 text-center text-text-subtle font-mono text-sm">
          {statusFilter || urlQ ? "No concerts match your filter." : "No concerts yet. Import your CSV or add your first show."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {concerts.map((c) => (
              <ConcertCard
                key={c.id}
                concert={c}
                onStatusChange={isAdmin ? (id, status) => patchMutation.mutate({ id, status }) : undefined}
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

      {addOpen && <AddConcertModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}
