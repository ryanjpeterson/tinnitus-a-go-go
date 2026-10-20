/**
 * Shows — the concert log as ticket-style rows, grouped by month.
 *
 * All filter/sort/page state lives in the URL (?page=&sort=&status=&q=) so
 * the browser back button always restores the exact view you left.
 */

import { useState } from "react";
import { AddConcertModal } from "./AddConcertModal";
import { useQuery } from "@tanstack/react-query";
import { api, type ConcertListItem } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useListParams } from "@/lib/useListParams";
import { monthLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  EmptyState, EventRow, List, ListGroupLabel, Loading, PageHeader, Pager, PillTabs, SearchField, SelectField,
} from "@/components/ui/kit";
import type { AttendanceStatus } from "@tagg/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

type StatusValue = AttendanceStatus | "all";
type SortOrder = "newest" | "oldest";

const STATUS_OPTIONS: { value: StatusValue; label: string; activeClass: string }[] = [
  { value: "all",        label: "All",        activeClass: "border-accent-lime bg-accent-lime text-bg" },
  { value: "attended",   label: "Attended",   activeClass: "border-lime-700 bg-lime-950 text-accent-lime" },
  { value: "attending",  label: "Attending",  activeClass: "border-yellow-700 bg-yellow-950 text-yellow-400" },
  { value: "interested", label: "Interested", activeClass: "border-purple-800 bg-purple-950 text-purple-400" },
  { value: "missed",     label: "Missed",     activeClass: "border-red-800 bg-red-950 text-red-400" },
];

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

const PAGE_SIZE = 24;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
  return "with " + shown.join(", ") + (extra > 0 ? ` +${extra}` : "");
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

  const sort: SortOrder = searchParams.get("sort") === "oldest" ? "oldest" : "newest";
  const statusParam = searchParams.get("status");
  const status: StatusValue = STATUS_OPTIONS.some((o) => o.value === statusParam) ? (statusParam as StatusValue) : "all";
  const statusFilter = status === "all" ? undefined : status;
  const apiSort = sort === "oldest" ? "date_asc" : "date_desc";

  const concertsQuery = useQuery({
    queryKey: ["concerts", { status: statusFilter, q, page, sort: apiSort }],
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

      {/* Filters — stacked full-width controls on phones, pills on desktop */}
      <div className="mb-5 space-y-3">
        <SearchField value={inputQ} onChange={onSearch} placeholder="Search artist, venue, or festival" />
        <div className={isAdmin ? "grid grid-cols-2 gap-3 sm:hidden" : "sm:hidden"}>
          {isAdmin && (
            <SelectField label="Status" value={status} options={STATUS_OPTIONS}
              onChange={(v) => setFilter({ status: v === "all" ? undefined : v })} />
          )}
          <SelectField label="Sort" value={sort} options={SORT_OPTIONS}
            onChange={(v) => setFilter({ sort: v === "newest" ? undefined : v })} />
        </div>
        <div className="hidden items-center justify-between gap-3 sm:flex">
          {isAdmin ? (
            <PillTabs value={status} options={STATUS_OPTIONS}
              onChange={(v) => setFilter({ status: v === "all" ? undefined : v })} />
          ) : <span />}
          <SelectField label="Sort" value={sort} options={SORT_OPTIONS} className="w-44"
            onChange={(v) => setFilter({ sort: v === "newest" ? undefined : v })} />
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
        <EmptyState
          title={statusFilter || q ? "No shows match." : "No shows yet."}
          body={statusFilter || q ? "Try a different search or filter." : "Import your CSV or add your first show."}
        />
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
                    title={concertHeadliner(c)}
                    subtitle={c.venue ? `${c.venue.name}${c.venue.city ? ` · ${c.venue.city}` : ""}` : c.eventSeries?.name}
                    meta={[c.venue && c.eventSeries ? c.eventSeries.name : null, supportingActs(c) || null].filter(Boolean).join(" · ") || undefined}
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
