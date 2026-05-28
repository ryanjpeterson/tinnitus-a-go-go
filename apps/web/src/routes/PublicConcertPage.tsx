/**
 * Public concert detail — visible to all visitors (no auth required).
 * Shows full concert info: artists, venue, attendance data, notes.
 */

import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Wordmark } from "@/components/Wordmark";
import { VenueMap } from "@/components/VenueMap";
import { api } from "@/lib/api";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const STATUS_CHIP: Record<string, { label: string; color: string }> = {
  attended:  { label: "Attended",  color: "text-accent-lime" },
  attending: { label: "Attending", color: "text-yellow-400"  },
  interested:{ label: "Interested",color: "text-purple-400"  },
  missed:    { label: "Missed",    color: "text-red-400"     },
  cancelled: { label: "Cancelled", color: "text-text-subtle" },
  dismissed: { label: "Dismissed", color: "text-text-subtle" },
};
const DEFAULT_STATUS_CHIP = { label: "Unknown", color: "text-text-muted" };

const ROLE_LABEL: Record<string, string> = {
  headliner:    "Headliner",
  co_headliner: "Co-headliner",
  support:      "",
  opener:       "",
  festival_set: "",
};

export function PublicConcertPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ["public/concerts", id],
    queryFn: () => api.getPublicConcert(id!),
    enabled: !!id,
    staleTime: 60_000,
  });

  const c = q.data?.concert;

  return (
    <div className="min-h-screen bg-bg text-text-base">
      {/* Nav */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 border-b border-border bg-bg/95 backdrop-blur">
        <Link to="/">
          <Wordmark size="sm" svg />
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link to={`/app/concerts/${id}`} className="text-xs font-mono text-accent-lime hover:underline">
                → edit in my log
              </Link>
              <Link to="/app" className="text-xs font-mono text-text-muted hover:text-text-base">
                my log
              </Link>
            </>
          ) : (
            <Link
              to="/login"
              state={{ from: `/shows/${id}` }}
              className="text-sm font-mono px-4 py-1.5 rounded border border-border text-text-muted hover:text-text-base hover:border-accent-lime transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8 sm:px-8">
        {q.isLoading && (
          <div className="text-text-subtle font-mono text-sm animate-pulse py-16">Loading…</div>
        )}
        {q.isError && (
          <div className="text-accent-pink font-mono text-sm py-16">Concert not found.</div>
        )}

        {c && (
          <>
            {/* Back */}
            <Link to="/" className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors mb-6 block">
              ← All shows
            </Link>

            {/* Two-column layout when flyer exists: poster left, content right */}
            <div className={c.flyerUrl ? "grid gap-8 lg:grid-cols-[280px_1fr]" : ""}>

              {/* ── Left column: flyer ── */}
              {c.flyerUrl && (
                <div className="lg:sticky lg:top-6 self-start">
                  <img
                    src={c.flyerUrl}
                    alt="Concert flyer"
                    className="w-full max-w-sm mx-auto lg:mx-0 rounded-lg border border-border"
                  />
                </div>
              )}

              {/* ── Right column (or full width): all content ── */}
              <div className="min-w-0 space-y-5">

                {/* Date */}
                <p className="font-mono text-xs text-text-subtle">{fmtDate(c.date)}</p>

                {/* Lineup */}
                <div>
                  {c.artists.length > 0 ? (
                    c.artists.map((a) => {
                      const isHeadliner = a.role === "headliner" || a.role === "co_headliner";
                      return (
                        <div key={a.id} className="flex items-baseline gap-2 mb-1">
                          <span className={isHeadliner ? "text-2xl sm:text-4xl font-display uppercase leading-tight" : "text-lg text-text-muted"}>
                            {a.name}
                          </span>
                          {ROLE_LABEL[a.role] && (
                            <span className="text-xs font-mono text-text-subtle">{ROLE_LABEL[a.role]}</span>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <h1 className="text-3xl font-display uppercase">{c.headlinerHint ?? "Unknown Show"}</h1>
                  )}
                </div>

                {/* Event series */}
                {c.eventSeries && (
                  <p className="text-text-muted text-sm font-mono">
                    {c.eventSeries.name}{c.eventSeries.year ? ` ${c.eventSeries.year}` : ""}
                  </p>
                )}

                {/* Venue */}
                {c.venue && (
                  <div>
                    <p className="text-text-base font-medium">
                      <Link to={`/app/venues/${c.venue.slug}`} className="hover:text-accent-lime transition-colors">
                        {c.venue.name}
                      </Link>
                    </p>
                    {(c.venue.city || c.venue.region) && (
                      <p className="text-text-muted text-sm">
                        {[c.venue.city, c.venue.region].filter(Boolean).join(", ")}
                      </p>
                    )}
                    {c.venue.lat != null && c.venue.lng != null && (
                      <div className="mt-3">
                        <VenueMap lat={c.venue.lat} lng={c.venue.lng} venueName={c.venue.name} compact />
                      </div>
                    )}
                  </div>
                )}

                {/* Attendance */}
                {c.attendance && (
                  <div className="rounded-lg border border-border bg-surface p-5">
                    <div className="text-xs font-mono text-text-subtle uppercase tracking-wider mb-3">Log entry</div>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div>
                        <div className="text-text-subtle text-xs mb-1">Status</div>
                        <span className={`font-mono ${(STATUS_CHIP[c.attendance.status] ?? DEFAULT_STATUS_CHIP).color}`}>
                          {(STATUS_CHIP[c.attendance.status] ?? DEFAULT_STATUS_CHIP).label}
                        </span>
                      </div>
                      {c.attendance.ticketPricePaid != null && (
                        <div>
                          <div className="text-text-subtle text-xs mb-1">Ticket</div>
                          <span className="font-mono text-text-base">
                            ${(c.attendance.ticketPricePaid / 100).toFixed(2)}{" "}
                            <span className="text-text-subtle">{c.attendance.ticketPriceCurrency ?? "CAD"}</span>
                          </span>
                        </div>
                      )}
                    </div>
                    {c.attendance.personalNotes && (
                      <p className="mt-3 text-sm text-text-muted italic leading-relaxed border-t border-border pt-3">
                        {c.attendance.personalNotes}
                      </p>
                    )}
                  </div>
                )}

                {/* Event notes */}
                {c.eventNotes && (
                  <div className="rounded-lg border border-border bg-surface p-5">
                    <div className="text-xs font-mono text-text-subtle uppercase tracking-wider mb-2">Notes</div>
                    <p className="text-sm text-text-muted leading-relaxed">{c.eventNotes}</p>
                  </div>
                )}

                {/* Source link */}
                {c.sourceUrl && (
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors block"
                  >
                    → Event source ↗
                  </a>
                )}

              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
