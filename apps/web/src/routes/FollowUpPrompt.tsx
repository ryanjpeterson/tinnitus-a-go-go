/**
 * FollowUpPrompt — daily modal asking the user to resolve past concerts
 * that are still marked "attending" or "interested".
 *
 * Shown once per calendar day (localStorage key: tagg.followup.dismissed).
 * Dismissed automatically when all concerts in the queue are resolved, or
 * when the user clicks "Done for today".
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, type ConcertListItem } from "@/lib/api";
import type { AttendanceStatus } from "@tagg/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "tagg.followup.dismissed";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const today = new Date().toISOString().slice(0, 10);

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${MONTHS[date.getUTCMonth()]} ${d}, ${y}`;
}

function concertLabel(c: ConcertListItem): string {
  const headliner = c.artists.find((a) => a.role === "headliner") ?? c.artists[c.artists.length - 1];
  return headliner?.name ?? c.headlinerHint ?? c.eventSeries?.name ?? "Unknown show";
}

// ─────────────────────────────────────────────────────────────────────────────
// Concert row — quick-action card
// ─────────────────────────────────────────────────────────────────────────────

function ConcertRow({
  concert,
  onResolve,
  onSkip,
  resolving,
}: {
  concert: ConcertListItem;
  onResolve: (id: string, status: "attended" | "missed") => void;
  onSkip: (id: string) => void;
  resolving: boolean;
}) {
  const label = concertLabel(concert);
  const wasAttending = concert.attendance.status === "attending";

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={clsx(
              "shrink-0 text-xs font-mono px-1.5 py-0.5 rounded border",
              wasAttending
                ? "bg-yellow-950 text-yellow-400 border-yellow-700"
                : "bg-purple-950 text-purple-400 border-purple-800",
            )}
          >
            {wasAttending ? "was attending" : "was interested"}
          </span>
        </div>
        <Link
          to={`/app/concerts/${concert.id}`}
          className="block mt-0.5 text-sm font-display uppercase tracking-wide text-text-base hover:text-accent-lime transition-colors truncate"
        >
          {label}
        </Link>
        <div className="text-xs text-text-subtle font-mono mt-0.5">
          {fmtDate(concert.date)}
          {concert.venue && ` · ${concert.venue.name}`}
          {concert.venue?.city && `, ${concert.venue.city}`}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onResolve(concert.id, "attended")}
          disabled={resolving}
          className="text-xs font-mono px-2.5 py-1 rounded bg-lime-950 text-accent-lime border border-lime-700 hover:bg-lime-900 transition-colors disabled:opacity-40"
        >
          ✓ Attended
        </button>
        <button
          onClick={() => onResolve(concert.id, "missed")}
          disabled={resolving}
          className="text-xs font-mono px-2.5 py-1 rounded bg-red-950 text-red-400 border border-red-800 hover:bg-red-900 transition-colors disabled:opacity-40"
        >
          Missed
        </button>
        <button
          onClick={() => onSkip(concert.id)}
          disabled={resolving}
          className="text-xs font-mono px-2 py-1 text-text-subtle hover:text-text-base transition-colors disabled:opacity-40"
          title="Skip for now — will appear again tomorrow"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main prompt
// ─────────────────────────────────────────────────────────────────────────────

export function FollowUpPrompt() {
  const qc = useQueryClient();

  // Was already dismissed today?
  const [dismissed, setDismissed] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) === today,
  );

  // IDs skipped locally this session (shown greyed, removed on close)
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  // IDs currently being patched
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const followupQuery = useQuery({
    queryKey: ["concerts/followup"],
    queryFn: () => api.listFollowup(),
    staleTime: 60_000,
    enabled: !dismissed,
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AttendanceStatus }) =>
      api.patchConcert(id, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["concerts/followup"] });
      void qc.invalidateQueries({ queryKey: ["concerts"] });
      void qc.invalidateQueries({ queryKey: ["concerts/stats"] });
    },
  });

  const dismissForToday = () => {
    localStorage.setItem(STORAGE_KEY, today);
    setDismissed(true);
  };

  // Escape to dismiss
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") dismissForToday(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResolve = async (id: string, status: "attended" | "missed") => {
    setResolvingId(id);
    try {
      await patchMutation.mutateAsync({ id, status });
    } finally {
      setResolvingId(null);
    }
  };

  const handleSkip = (id: string) => {
    setSkipped((prev) => new Set([...prev, id]));
  };

  // Derive visible concerts
  const allConcerts = followupQuery.data?.concerts ?? [];
  const visibleConcerts = allConcerts.filter((c) => !skipped.has(c.id));

  // Nothing to show — if query is done and there are no past actionable concerts, stay hidden
  if (dismissed) return null;
  if (!followupQuery.isSuccess) return null;
  if (visibleConcerts.length === 0 && allConcerts.length === 0) return null;

  // All visible items were resolved → auto-dismiss
  if (visibleConcerts.length === 0 && allConcerts.length > 0) {
    dismissForToday();
    return null;
  }

  const total = followupQuery.data!.total;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) dismissForToday(); }}
    >
      <div className="w-full max-w-xl bg-bg border border-border rounded-xl shadow-2xl mt-[10vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-display uppercase text-lg leading-tight">
              {total === 1 ? "1 show needs follow-up" : `${total} shows need follow-up`}
            </h2>
            <p className="text-xs text-text-muted font-mono mt-0.5">
              These past shows are still marked as attending or interested.
            </p>
          </div>
          <button
            onClick={dismissForToday}
            className="text-text-subtle hover:text-text-base transition-colors text-xl font-mono w-8 h-8 flex items-center justify-center shrink-0"
            title="Done for today"
          >×</button>
        </div>

        {/* Concert list */}
        <div className="px-5 py-2 max-h-[60vh] overflow-y-auto">
          {visibleConcerts.map((c) => (
            <ConcertRow
              key={c.id}
              concert={c}
              onResolve={(id, status) => void handleResolve(id, status)}
              onSkip={handleSkip}
              resolving={resolvingId === c.id}
            />
          ))}
          {skipped.size > 0 && (
            <p className="text-xs text-text-subtle font-mono py-2 italic">
              {skipped.size} skipped — {skipped.size === 1 ? "it" : "they"} will appear again tomorrow.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border">
          <p className="text-xs text-text-subtle font-mono">
            Tap a show name to open the full detail page.
          </p>
          <button
            onClick={dismissForToday}
            className="text-xs font-mono px-4 py-1.5 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity shrink-0"
          >
            Done for today
          </button>
        </div>
      </div>
    </div>
  );
}
