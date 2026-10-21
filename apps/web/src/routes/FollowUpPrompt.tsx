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
import { Sheet } from "@/components/ui/kit";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "tagg.followup.dismissed";
const today = new Date().toISOString().slice(0, 10);

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
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
  const wasAttending = concert.attendance?.status === "attending";

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={clsx(
              "shrink-0 text-xs  px-1.5 py-0.5 rounded border",
              wasAttending
                ? "bg-yellow-950 text-yellow-400 border-yellow-700"
                : "bg-purple-950 text-purple-400 border-purple-800",
            )}
          >
            {wasAttending ? "was attending" : "was interested"}
          </span>
        </div>
        <Link
          to={`/shows/${concert.id}`}
          className="block mt-0.5 text-sm font-display tracking-wide text-text-base hover:text-accent-lime transition-colors truncate"
        >
          {label}
        </Link>
        <div className="text-sm text-text-subtle mt-0.5">
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
          className="btn btn-sm btn-secondary"
        >
          ✓ Attended
        </button>
        <button
          onClick={() => onResolve(concert.id, "missed")}
          disabled={resolving}
          className="btn btn-sm btn-secondary"
        >
          Missed
        </button>
        <button
          onClick={() => onSkip(concert.id)}
          disabled={resolving}
          className="text-xs px-2 py-1 text-text-subtle hover:text-text-base transition-colors disabled:opacity-40"
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
    <Sheet title={total === 1 ? "1 show needs follow-up" : `${total} shows need follow-up`} onClose={dismissForToday} subtitle="These past shows are still marked as attending or interested." wide>

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
            <p className="text-sm text-text-subtle py-2 italic">
              {skipped.size} skipped — {skipped.size === 1 ? "it" : "they"} will appear again tomorrow.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border">
          <p className="text-sm text-text-subtle">
            Tap a show name to open the full detail page.
          </p>
          <button
            onClick={dismissForToday}
            className="shrink-0 btn btn-sm btn-primary"
          >
            Done for today
          </button>
        </div>
    </Sheet>
  );
}
