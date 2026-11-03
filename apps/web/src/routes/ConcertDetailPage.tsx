/**
 * Concert detail — full view of one show with flyer, lineup, attendance editor, and photo gallery.
 */

import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MapView } from "@/components/MapView";
import { FestivalPicker } from "@/components/FestivalPicker";
import { useAuth } from "@/lib/auth-context";
import { EmptyState, EventRow, Hero, List, Loading, ShareButton, StatusBadge } from "@/components/ui/kit";
import { billLine } from "@/lib/showTitle";
import { useSwipe } from "@/lib/gestures";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { ROLE_ORDER } from "./concert/roles";
import { FlyerControls } from "./concert/FlyerControls";
import { PhotoGallery } from "./concert/PhotoGallery";
import { ConcertMetaEditor } from "./concert/ConcertMetaEditor";
import { AttendanceEditor } from "./concert/AttendanceEditor";
import { LineupEditor } from "./concert/LineupEditor";
import { SetlistSection } from "./concert/SetlistSection";

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function ConcertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;

  const concertQuery = useQuery({
    queryKey: ["concerts", id],
    queryFn: () => api.getConcert(id!),
    enabled: !!id,
  });

  // Opened by id or an older link: show the readable slug in the address bar,
  // reusing what's loaded so there's no second fetch.
  const qc = useQueryClient();
  const loadedSlug = concertQuery.data?.concert.slug;
  useEffect(() => {
    if (!loadedSlug || !id || id === loadedSlug) return;
    qc.setQueryData(["concerts", loadedSlug], concertQuery.data);
    navigate(`/shows/${loadedSlug}${window.location.hash}`, { replace: true });
  }, [loadedSlug, id, qc, navigate, concertQuery.data]);

  // Festival days: swipe left/right for the next/previous day.
  const days = concertQuery.data?.festivalDays ?? [];
  const dayIdx = days.findIndex((d) => d.concertId === concertQuery.data?.concert.id);
  const goDay = (d: (typeof days)[number] | undefined) => { if (d) navigate(`/shows/${d.slug ?? d.concertId}`, { replace: true }); };
  useSwipe({
    onLeft: dayIdx >= 0 ? () => goDay(days[dayIdx + 1]) : undefined,
    onRight: dayIdx >= 0 ? () => goDay(days[dayIdx - 1]) : undefined,
  });

  // Coupling: put this show in a festival, or take it out.
  const [festivalPickerOpen, setFestivalPickerOpen] = useState(false);
  const leaveFestival = async (festival: { slug: string; name: string }, concertId: string) => {
    if (!window.confirm(`Take this show out of ${festival.name}? It goes back to being its own show.`)) return;
    try {
      const res = await api.removeShowFromFestival(festival.slug, concertId);
      await Promise.all([qc.invalidateQueries({ queryKey: ["concerts"] }), qc.invalidateQueries({ queryKey: ["festivals"] })]);
      if (res.festivalRemoved) window.alert(`That was the last show in ${festival.name}, so the festival has been removed.`);
      navigate(`/shows/${res.showSlug}`, { replace: true });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't take the show out of the festival.");
    }
  };

  if (concertQuery.isLoading) return <Loading />;
  if (concertQuery.isError || !concertQuery.data) {
    return (
      <EmptyState tone="error" title="Show not found."
        action={<Link to="/shows"><Button variant="secondary">Back to Shows</Button></Link>} />
    );
  }

  const { concert, setlists: savedSetlists, festivalDays = [], festivalLength } = concertQuery.data;

  // Sort artists: headliner first, then by role order, then by setOrder
  const sortedArtists = [...concert.artists].sort((a, b) => {
    const roleDiff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
    if (roleDiff !== 0) return roleDiff;
    return (a.setOrder ?? 99) - (b.setOrder ?? 99);
  });

  const isFestivalDay = concert.type === "festival_day" && !!concert.eventSeries;
  const attended = concert.status === "attended";
  const thisDay = festivalDays.find((d) => d.concertId === concert.id);
  const multiDay = festivalDays.length > 1;

  // Title: a festival day is named for its festival; a concert for its whole
  // bill in billing order ("Foo Fighters / Against Me!").
  const title =
    (isFestivalDay ? concert.eventSeries!.name : null) ??
    (billLine(sortedArtists.map((a) => a.name)) || null) ??
    concert.headlinerHint ??
    concert.eventSeries?.name ??
    "Unknown show";

  return (
    <div>
      <Hero
        back={{ to: "/shows", label: "Shows" }}
        imageUrl={concert.flyerUrl}
        eyebrow={
          isFestivalDay
            ? (thisDay && (festivalLength ?? festivalDays.length) > 1 ? `Festival · Day ${thisDay.number} of ${festivalLength ?? festivalDays.length}` : "Festival")
            : (concert.eventSeries ? concert.eventSeries.name : "Concert")
        }
        title={title}
        accent={isFestivalDay ? "yellow" : "accent"}
        badge={(concert.attendance?.status ?? concert.status) && (
          <StatusBadge status={(concert.attendance?.status ?? concert.status)!} className="h-9 px-4 text-sm" />
        )}
        actions={
          <>
            {concert.eventSeries && (
              <Link to={`/festivals/${concert.eventSeries.slug}`}>
                <Button variant="secondary">{isFestivalDay ? "Festival lineup" : "Tour page"}</Button>
              </Link>
            )}
            {concert.sourceUrl && (
              <a href={concert.sourceUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost">Event page ↗</Button>
              </a>
            )}
            {isAdmin && <FlyerControls key={concert.id} concert={concert} />}
            {isAdmin && (isFestivalDay
              ? <Button variant="ghost" onClick={() => void leaveFestival(concert.eventSeries!, concert.id)}>Remove from festival</Button>
              : <Button variant="ghost" onClick={() => setFestivalPickerOpen(true)}>Add to festival</Button>)}
            <ShareButton card={() => ({
              imageUrl: concert.flyerUrl,
              eyebrow: [
                concert.status === "attended" || concert.attendance?.status === "attended" ? "I was there" : "See you there",
                new Date(`${concert.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }),
              ].join(" · "),
              title,
              lines: [
                isFestivalDay && thisDay && (festivalLength ?? 0) > 1 ? `Day ${thisDay.number} of ${festivalLength}` : null,
                isFestivalDay ? sortedArtists.map((a) => a.name).slice(0, 6).join(" · ") : null,
                [concert.venue?.name, concert.venue?.city].filter(Boolean).join(", ") || null,
              ].filter((l): l is string => !!l),
              fileName: concert.slug,
            })} />
          </>
        }
      >
        <p className="font-semibold text-text-base">
          <time dateTime={concert.date}>{fmtDate(concert.date)}</time>
          {concert.dateIsApproximate && <span className="ml-2 text-sm font-normal text-text-subtle">(approximate)</span>}
        </p>
        {concert.venue && (
          <p>
            <Link to={`/venues/${concert.venue.slug}`} className="hover:text-accent">{concert.venue.name}</Link>
            {concert.venue.city && <span className="text-text-subtle"> · {concert.venue.city}</span>}
          </p>
        )}
      </Hero>

      {/* One column: the flyer lives in the banner above */}
      <div>
        <div className="min-w-0 space-y-6">
          {/* Concert info (admin only) */}
          {isAdmin && <ConcertMetaEditor key={concert.id} concert={concert} />}

          {/* Lineup */}
          <LineupEditor concert={concert} isAdmin={isAdmin} />

          {/* Festival days — jump between days, or out to the whole festival */}
          {isFestivalDay && multiDay && (
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3 px-0.5">
                <h2 className="h-section">Festival days</h2>
                <Link to={`/festivals/${concert.eventSeries!.slug}`} className="text-sm font-semibold text-text-muted hover:text-accent">
                  Full lineup ›
                </Link>
              </div>
              <List>
                {festivalDays.map((d) => {
                  // A day with several sets names each by its headliner.
                  const shared = festivalDays.filter((x) => x.date === d.date).length > 1;
                  const label = `Day ${d.number}${shared && d.lineup[0] ? ` · ${d.lineup[0]}` : ""}`;
                  return (
                  <div key={d.concertId} className={d.concertId === concert.id ? "bg-accent-950/30" : undefined}>
                    <EventRow
                      to={`/shows/${d.slug ?? d.concertId}`}
                      date={d.date}
                      showYear={false}
                      title={d.concertId === concert.id ? `${label} · you're here` : label}
                      subtitle={billLine(d.lineup, 4, ", ") || "No lineup yet"}
                    />
                  </div>
                  );
                })}
              </List>
            </section>
          )}

          {festivalPickerOpen && (
            <FestivalPicker
              concertIds={[concert.id]}
              suggestedName={`${concert.venue?.name ?? "Festival"} ${concert.date.slice(0, 4)}`}
              onClose={() => setFestivalPickerOpen(false)}
            />
          )}

          {/* Attendance (admin only) */}
          {isAdmin && <AttendanceEditor key={concert.id} concertId={concert.id} attendance={concert.attendance} />}

          {/* Venue map */}
          {concert.venue?.lat != null && concert.venue.lng != null && (
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3 px-0.5">
                <h2 className="h-section">Location</h2>
                <Link to={`/venues/${concert.venue.slug}`} className="truncate text-sm font-semibold text-text-muted hover:text-accent">
                  {concert.venue.name} ›
                </Link>
              </div>
              <MapView pins={[{ id: concert.venue.id, lat: concert.venue.lat, lng: concert.venue.lng, label: concert.venue.name }]} selected={concert.venue.id} />
            </section>
          )}

          {/* Setlists and media only make sense for a show you were at. */}
          {attended ? (
            <>
              {/* Setlists: cached songs for everyone; linking tools for admins */}
              <SetlistSection key={concert.id} concert={concert} savedSetlists={savedSetlists} isAdmin={isAdmin} />

              {/* Photo gallery */}
              <div className="card p-4 sm:p-5">
                <PhotoGallery
                  concertId={concert.id}
                  concertDate={concert.date}
                  concertArtists={concert.artists}
                  label={title}
                  isAdmin={isAdmin}
                />
              </div>
            </>
          ) : isAdmin ? (
            <p className="card p-4 text-sm text-text-muted sm:p-5">
              Setlists and media open up once this show is marked <span className="font-semibold text-accent">Attended</span>.
            </p>
          ) : null}

          {/* Delete show (admin only) */}
          {isAdmin && (
            <div className="pt-4 border-t border-border">
              <button
                disabled={deleting}
                onClick={async () => {
                  if (!window.confirm("Delete this show permanently? This can't be undone.")) return;
                  setDeleting(true);
                  try {
                    await api.deleteConcert(concert.id);
                    navigate("/shows");
                  } catch {
                    setDeleting(false);
                  }
                }}
                className="text-sm font-semibold text-text-subtle hover:text-highlight transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete show"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
