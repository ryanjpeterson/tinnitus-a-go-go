/**
 * Shows — the concert log as ticket-style rows, grouped by month, split into
 * Upcoming (interested / attending) and Past (attended / missed / cancelled).
 *
 * All filter/sort/page state lives in the URL (?view=&page=&sort=&status=&q=) so
 * the browser back button always restores the exact view you left.
 */

import { useState } from "react";
import { AddConcertModal } from "./AddConcertModal";
import { useQuery } from "@tanstack/react-query";
import { api, type ConcertListItem } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useListParams } from "@/lib/useListParams";
import { monthLabel } from "@/lib/format";
import { billLine } from "@/lib/showTitle";
import { Button } from "@/components/ui/button";
import {
  EmptyState, EventRow, List, ListGroupLabel, Loading, PageHeader, Pager, PillTabs, SearchField, SelectField, Tabs,
} from "@/components/ui/kit";
import type { AttendanceStatus } from "@tagg/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

type StatusValue = AttendanceStatus | "all";
type SortOrder = "newest" | "oldest";
type View = "upcoming" | "past";

const VIEW_STATUSES: Record<View, AttendanceStatus[]> = {
  upcoming: ["interested", "attending"],
  past: ["attended", "missed", "cancelled"],
};

const VIEW_TABS: { value: View; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

const ALL_OPTION = { value: "all" as StatusValue, label: "All", activeClass: "border-accent-lime bg-accent-lime text-bg" };
const STATUS_OPTIONS: Record<View, { value: StatusValue; label: string; activeClass: string }[]> = {
  upcoming: [
    ALL_OPTION,
    { value: "attending",  label: "Attending",  activeClass: "border-yellow-700 bg-yellow-950 text-yellow-400" },
    { value: "interested", label: "Interested", activeClass: "border-purple-800 bg-purple-950 text-purple-400" },
  ],
  past: [
    ALL_OPTION,
    { value: "attended",  label: "Attended",  activeClass: "border-lime-700 bg-lime-950 text-accent-lime" },
    { value: "missed",    label: "Missed",    activeClass: "border-red-800 bg-red-950 text-red-400" },
    { value: "cancelled", label: "Cancelled", activeClass: "border-border bg-surface-2 text-text-base" },
  ],
};

// Same two orders, worded for each tab.
const SORT_OPTIONS: Record<View, { value: SortOrder; label: string }[]> = {
  upcoming: [
    { value: "oldest", label: "Soonest first" },
    { value: "newest", label: "Furthest out first" },
  ],
  past: [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
  ],
};

const PAGE_SIZE = 24;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const BILLING_RANK: Record<string, number> = { headliner: 0, co_headliner: 1, support: 2, opener: 3 };

/** Every billed artist in billing order. */
function lineup(c: ConcertListItem): string[] {
  return [...c.artists]
    .sort((a, b) => (BILLING_RANK[a.role] ?? 4) - (BILLING_RANK[b.role] ?? 4) || (a.setOrder ?? 99) - (b.setOrder ?? 99))
    .map((a) => a.name);
}

/**
 * Row text. Concerts: the bill as the title, venue below.
 * Festival days: the festival as the title, "Day 2 of 7 · venue" below, that day's lineup last.
 */
function rowText(c: ConcertListItem): { title: string; subtitle?: string; meta?: string } {
  const names = lineup(c);
  const venue = c.venue ? `${c.venue.name}${c.venue.city ? ` · ${c.venue.city}` : ""}` : undefined;
  if (c.type === "festival_day" && c.eventSeries) {
    const day = c.festivalDay && c.festivalDay.count > 1 ? `Day ${c.festivalDay.number} of ${c.festivalDay.count}` : null;
    return {
      title: c.eventSeries.name,
      subtitle: [day, venue].filter(Boolean).join(" · ") || undefined,
      meta: billLine(names, 4, ", ") || undefined,
    };
  }
  return {
    // Two names keep a row to one line; the full bill is on the show page.
    title: billLine(names, 2) || c.headlinerHint || c.eventSeries?.name || "Unknown",
    subtitle: venue ?? c.eventSeries?.name,
    meta: c.venue && c.eventSeries ? c.eventSeries.name : undefined,
  };
}

/** Consecutive concerts sharing a month, in list order. */
function groupByMonth(concerts: ConcertListItem[]): { label: string; items: ConcertListItem[] }[] {
  const groups: { label: string; items: ConcertListItem[] }[] = [];
  for (const c of concerts) {
    const label = monthLabel(c.date);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(c);
    else groups.push({ label, items: [c] });
  }
  return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function ConcertsPage() {
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;
  const { searchParams, page, q, inputQ, onSearch, setFilter, setPage } = useListParams();
  const [addOpen, setAddOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const statusParam = searchParams.get("status") as AttendanceStatus | null;
  // ?view= picks the tab; an old ?status= link lands on the tab that holds it.
  const viewParam = searchParams.get("view");
  const view: View =
    viewParam === "past" || viewParam === "upcoming" ? viewParam
    : statusParam && VIEW_STATUSES.past.includes(statusParam) ? "past"
    : "upcoming";
  const status: StatusValue = STATUS_OPTIONS[view].some((o) => o.value === statusParam) ? (statusParam as StatusValue) : "all";
  const statusFilter = status === "all" ? VIEW_STATUSES[view] : [status];
  // Upcoming reads soonest-first, past newest-first, unless the sort is changed.
  const sortParam = searchParams.get("sort");
  const sort: SortOrder = sortParam === "oldest" || sortParam === "newest" ? sortParam : view === "upcoming" ? "oldest" : "newest";
  const apiSort = sort === "oldest" ? "date_asc" : "date_desc";
  const setView = (v: View): void => setFilter({ view: v === "upcoming" ? undefined : v, status: undefined, sort: undefined });

  const concertsQuery = useQuery({
    queryKey: ["concerts", { status: statusFilter.join(","), q, page, sort: apiSort }],
    queryFn: () => api.listConcerts({ status: statusFilter, q: q || undefined, page, limit: PAGE_SIZE, sort: apiSort }),
    staleTime: 15_000,
  });

  const { concerts = [], total = 0, totalPages = 0 } = concertsQuery.data ?? {};

  const handleExport = async (): Promise<void> => {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await api.exportCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `concerts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      // Safari starts the download asynchronously; revoking immediately can cancel it.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setExportError("Export failed.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Shows"
        count={total}
        actions={isAdmin && (
          <>
            <Button variant="secondary" size="md" onClick={() => void handleExport()} disabled={exporting}
              className="hidden rounded-full sm:inline-flex">
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <Button size="md" onClick={() => setAddOpen(true)} className="rounded-full">
              + Add show
            </Button>
          </>
        )}
      />

      {/* Filters — Upcoming/Past tabs, then search, status and sort */}
      <div className="mb-5 space-y-3">
        <Tabs value={view} options={VIEW_TABS} onChange={setView} />
        <SearchField value={inputQ} onChange={onSearch} placeholder="Search artist, venue, or festival" />
        <div className={isAdmin ? "grid grid-cols-2 gap-3 sm:hidden" : "sm:hidden"}>
          {isAdmin && (
            <SelectField label="Status" value={status} options={STATUS_OPTIONS[view]}
              onChange={(v) => setFilter({ status: v === "all" ? undefined : v })} />
          )}
          <SelectField label="Sort" value={sort} options={SORT_OPTIONS[view]}
            onChange={(v) => setFilter({ sort: v })} />
        </div>
        <div className="hidden items-center justify-between gap-3 sm:flex">
          {isAdmin ? (
            <PillTabs value={status} options={STATUS_OPTIONS[view]}
              onChange={(v) => setFilter({ status: v === "all" ? undefined : v })} />
          ) : <span />}
          <SelectField label="Sort" value={sort} options={SORT_OPTIONS[view]} className="w-44"
            onChange={(v) => setFilter({ sort: v })} />
        </div>
        {isAdmin && (
          <button onClick={() => void handleExport()} disabled={exporting}
            className="text-sm font-semibold text-text-muted hover:text-accent-lime sm:hidden">
            {exporting ? "Exporting…" : "Export CSV ↓"}
          </button>
        )}
        {exportError && <p className="text-sm text-accent-pink">{exportError}</p>}
      </div>

      {concertsQuery.isLoading ? (
        <Loading />
      ) : concertsQuery.isError ? (
        <EmptyState tone="error" title="Couldn't load shows." body="Check your connection and try again." />
      ) : concerts.length === 0 && page > 1 && total > 0 ? (
        <EmptyState
          title={`Nothing on page ${page}`}
          // API reports totalPages: 0 for an empty page, so derive it from total
          body={`There ${total <= PAGE_SIZE ? "is only 1 page" : `are only ${Math.ceil(total / PAGE_SIZE)} pages`}.`}
          action={<Button variant="secondary" onClick={() => setPage(1)}>Back to page 1</Button>}
        />
      ) : concerts.length === 0 ? (
        q || status !== "all" ? (
          <EmptyState title="No shows match." body="Try a different search or filter." />
        ) : view === "upcoming" ? (
          <EmptyState
            title="Nothing coming up."
            body="Shows you're interested in or going to will appear here."
            action={isAdmin
              ? <Button onClick={() => setAddOpen(true)}>+ Add show</Button>
              : <Button variant="secondary" onClick={() => setView("past")}>See past shows</Button>}
          />
        ) : (
          <EmptyState title="No past shows yet." body="Import your CSV or add your first show." />
        )
      ) : (
        <>
          <List>
            {groupByMonth(concerts).map((g) => (
              <div key={g.label} className="divide-y divide-border">
                <ListGroupLabel>{g.label}</ListGroupLabel>
                {g.items.map((c) => (
                  <EventRow
                    key={c.id}
                    to={`/shows/${c.id}`}
                    date={c.date}
                    showYear={false}
                    approximate={c.dateIsApproximate}
                    {...rowText(c)}
                    imageUrl={c.flyerUrl}
                    status={c.attendance?.status}
                  />
                ))}
              </div>
            ))}
          </List>
          <Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}

      {addOpen && <AddConcertModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}
