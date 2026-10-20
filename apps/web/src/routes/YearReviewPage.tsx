/**
 * YearReviewPage — a recap of one calendar year of attended shows.
 *
 * Routes: /year → latest year with shows, /year/:year → that year.
 * Every year with attended shows is reachable from the year strip and the
 * prev/next arrows. Reuses the Stats page widgets so the two read as a set.
 */

import { useEffect, useMemo, useRef } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type YearReviewResponse } from "@/lib/api";
import { MiniVBars, RankedList, Section, StatTile, type RankedItem } from "./StatsPage";

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_LONG  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW_LABELS  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DOW_LONG    = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Index of the largest value; ties go to the earliest. */
function argMax(values: number[]): number {
  return values.reduce((best, v, i) => (v > values[best]! ? i : best), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// /year — redirect to the latest year with shows
// ─────────────────────────────────────────────────────────────────────────────

export function YearReviewIndex() {
  const q = useQuery({
    queryKey: ["concerts/year-review"],
    queryFn: () => api.listReviewYears(),
    staleTime: 5 * 60_000,
  });

  if (q.isLoading) {
    return <div className="py-16 text-center text-text-subtle font-mono text-sm animate-pulse">Rewinding the tape…</div>;
  }
  const latest = q.data?.years[0]?.year;
  if (!latest) {
    return <div className="py-16 text-center text-text-subtle font-mono text-sm">No attended shows yet — nothing to review.</div>;
  }
  return <Navigate to={`/year/${latest}`} replace />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Year strip — every year with shows, newest on the right like a timeline
// ─────────────────────────────────────────────────────────────────────────────

function YearStrip({ years, current }: { years: YearReviewResponse["years"]; current: number }) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  const ordered = useMemo(() => [...years].sort((a, b) => a.year - b.year), [years]);

  // Keep the selected year in view when the strip overflows on phones.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);

  return (
    <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]">
      {ordered.map((y) => {
        const active = y.year === current;
        return (
          <Link
            key={y.year}
            ref={active ? activeRef : undefined}
            to={`/year/${y.year}`}
            className={`shrink-0 rounded px-2.5 py-1 text-xs font-mono transition-colors border ${
              active
                ? "bg-accent-lime text-bg font-bold border-accent-lime"
                : "text-text-muted border-border hover:text-text-base hover:border-text-subtle"
            }`}
            title={plural(y.count, "show")}
          >
            {y.year}
          </Link>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Highlight card
// ─────────────────────────────────────────────────────────────────────────────

function Highlight({ label, title, sub, href }: { label: string; title: string; sub?: string; href?: string }) {
  const body = (
    <>
      <p className="text-[10px] font-mono uppercase tracking-widest text-text-subtle mb-1">{label}</p>
      <p className="text-sm font-medium truncate group-hover:text-accent-lime transition-colors">{title}</p>
      {sub && <p className="text-xs font-mono text-text-subtle truncate">{sub}</p>}
    </>
  );
  const cls = "group block rounded-lg border border-border bg-surface p-4 min-w-0";
  return href ? <Link to={href} className={`${cls} hover:border-accent-lime/50 transition-colors`}>{body}</Link> : <div className={cls}>{body}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Flyer wall — every show of the year in date order
// ─────────────────────────────────────────────────────────────────────────────

function FlyerWall({ shows }: { shows: YearReviewResponse["shows"] }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
      {shows.map((s) => {
        const name = s.headliner ?? s.series?.name ?? "Untitled show";
        return (
          <Link
            key={s.concertId}
            to={`/shows/${s.concertId}`}
            className="group relative aspect-[3/4] overflow-hidden rounded border border-border bg-surface-2 hover:border-accent-lime transition-colors"
            title={`${name} · ${fmtDate(s.date)}`}
          >
            {s.flyerUrl ? (
              <img src={s.flyerUrl} alt={name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className={`absolute inset-0 flex items-center justify-center p-2 pb-5 text-center ${s.type === "festival_day" ? "bg-yellow-950/60" : "bg-lime-950/40"}`}>
                <span className="font-display uppercase text-sm text-text-muted leading-tight line-clamp-4 break-words">{name}</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 pt-4 pb-1">
              <p className="text-[10px] font-mono text-white/90 leading-tight truncate">{fmtDate(s.date)}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function YearReviewPage() {
  const { year: yearParam } = useParams<{ year: string }>();
  const year = Number(yearParam);
  const validYear = Number.isInteger(year) && year >= 1900 && year <= 2100;

  const q = useQuery({
    queryKey: ["concerts/year-review", year],
    queryFn: () => api.getYearReview(year),
    enabled: validYear,
    staleTime: 5 * 60_000,
  });
  const d = q.data;

  const monthCounts = useMemo(() => {
    const arr = Array(12).fill(0) as number[];
    for (const s of d?.shows ?? []) arr[Number(s.date.slice(5, 7)) - 1]! += 1;
    return arr;
  }, [d]);

  const dowCounts = useMemo(() => {
    const arr = Array(7).fill(0) as number[];
    for (const s of d?.shows ?? []) arr[new Date(`${s.date}T00:00:00Z`).getUTCDay()]! += 1;
    return arr;
  }, [d]);

  if (!validYear) return <Navigate to="/year" replace />;

  if (q.isLoading) {
    return <div className="py-16 text-center text-text-subtle font-mono text-sm animate-pulse">Rewinding the tape…</div>;
  }
  if (q.isError || !d) {
    return <div className="py-16 text-center font-mono text-sm text-accent-pink">Couldn't load {year}. Try refreshing.</div>;
  }

  // Prev/next step through years that actually have shows, skipping gaps.
  const ascending = [...d.years].map((y) => y.year).sort((a, b) => a - b);
  const prevYear = [...ascending].reverse().find((y) => y < year);
  const nextYear = ascending.find((y) => y > year);
  const isCurrentYear = year === new Date().getFullYear();

  const header = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors">← Stats</Link>
        <div className="flex gap-1">
          <YearArrow to={prevYear} label="←" />
          <YearArrow to={nextYear} label="→" />
        </div>
      </div>
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-text-subtle">
          Year in review{isCurrentYear ? " · so far" : ""}
        </p>
        <h1 className="font-display uppercase text-6xl sm:text-7xl leading-none text-accent-lime">{year}</h1>
      </div>
      {d.years.length > 1 && <YearStrip years={d.years} current={year} />}
    </div>
  );

  if (d.totalShows === 0) {
    return (
      <div className="space-y-6">
        {header}
        <p className="py-10 text-center text-text-subtle font-mono text-sm">No attended shows logged for {year}.</p>
      </div>
    );
  }

  const busiestMonth = argMax(monthCounts);
  const favouriteDay = argMax(dowCounts);
  const first = d.shows[0]!;
  const last = d.shows[d.shows.length - 1]!;
  const topArtist = d.topArtists[0];

  const delta = d.prevYearShows != null ? d.totalShows - d.prevYearShows : null;
  const deltaText =
    delta == null ? "first year logged" :
    delta === 0   ? `same as ${year - 1}` :
    `${delta > 0 ? "+" : ""}${delta} vs ${year - 1}`;

  // Only repeat sightings — a year of one-offs would otherwise fill the list
  // alphabetically. One-offs still show up under "First time seeing".
  const topArtistItems: RankedItem[] = d.topArtists.filter((a) => a.count > 1).map((a) => ({
    id: a.artistId,
    name: a.name,
    sub: a.isNew ? "first time" : undefined,
    count: a.count,
    href: `/artists/${a.slug}`,
  }));
  const topVenueItems: RankedItem[] = d.topVenues.map((v) => ({
    id: v.venueId,
    name: v.name,
    sub: [v.city, v.isNew ? "first visit" : null].filter(Boolean).join(" · ") || undefined,
    count: v.count,
    href: `/venues/${v.slug}`,
  }));

  return (
    <div className="space-y-4">
      {header}

      {/* ── Headline numbers ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
        <StatTile label="Shows" value={d.totalShows} sub={deltaText} accent="lime" />
        <StatTile label="Artists seen" value={d.uniqueArtists} sub={`${d.newArtistCount} for the first time`} accent="pink" />
        <StatTile label="Venues" value={d.uniqueVenues} sub={`${d.newVenueCount} new`} accent="muted" />
        <StatTile label="Cities" value={d.uniqueCities} sub={d.festivals.length > 0 ? plural(d.festivals.length, "festival") : undefined} accent="muted" />
      </div>

      {/* ── Highlights ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Highlight
          label="Opened the year"
          title={first.headliner ?? first.series?.name ?? "Untitled show"}
          sub={`${fmtDate(first.date)}${first.venue ? ` · ${first.venue.name}` : ""}`}
          href={`/shows/${first.concertId}`}
        />
        {d.shows.length > 1 && (
          <Highlight
            label={isCurrentYear ? "Latest show" : "Closed it out"}
            title={last.headliner ?? last.series?.name ?? "Untitled show"}
            sub={`${fmtDate(last.date)}${last.venue ? ` · ${last.venue.name}` : ""}`}
            href={`/shows/${last.concertId}`}
          />
        )}
        {topArtist && topArtist.count > 1 && (
          <Highlight
            label="Most seen"
            title={topArtist.name}
            sub={`${plural(topArtist.count, "show")} this year`}
            href={`/artists/${topArtist.slug}`}
          />
        )}
        <Highlight
          label="Busiest month"
          title={MONTH_LONG[busiestMonth]!}
          sub={`${plural(monthCounts[busiestMonth]!, "show")} · mostly ${DOW_LONG[favouriteDay]}s`}
        />
      </div>

      {/* ── When ─────────────────────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Section title="Month by month">
          <MiniVBars data={monthCounts} labels={MONTH_SHORT} color="#A8FF3E" />
        </Section>
        <Section title="Day of the week">
          <MiniVBars data={dowCounts} labels={DOW_LABELS} color="#FF3D6E" />
        </Section>
      </div>

      {/* ── Who ──────────────────────────────────────────────────────────── */}
      {topArtistItems.length > 0 && (
        <Section title="Seen more than once">
          <RankedList items={topArtistItems} color="#A8FF3E" />
        </Section>
      )}

      {d.newArtists.length > 0 && (
        <Section title={`First time seeing · ${d.newArtistCount}`}>
          <div className="flex flex-wrap gap-1.5">
            {d.newArtists.map((a) => (
              <Link
                key={a.artistId}
                to={`/artists/${a.slug}`}
                className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-text-muted hover:text-accent-lime hover:border-accent-lime/50 transition-colors"
                title={`First seen ${fmtDate(a.firstSeen)}`}
              >
                {a.name}
              </Link>
            ))}
            {d.newArtistCount > d.newArtists.length && (
              <span className="px-2.5 py-1 text-xs font-mono text-text-subtle">
                +{d.newArtistCount - d.newArtists.length} more
              </span>
            )}
          </div>
        </Section>
      )}

      {/* ── Where ────────────────────────────────────────────────────────── */}
      <Section title="Where you went">
        <RankedList items={topVenueItems} color="#FF3D6E" />
      </Section>

      {d.festivals.length > 0 && (
        <Section title="Festivals">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {d.festivals.map((f) => (
              <Link
                key={f.seriesId}
                to={`/festivals/${f.slug}`}
                className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 hover:border-yellow-500/60 p-3 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate group-hover:text-yellow-400 transition-colors">{f.name}</p>
                  <p className="text-[10px] font-mono text-text-subtle">{fmtDate(f.startDate)}</p>
                </div>
                <span className="shrink-0 text-[10px] font-mono text-yellow-400">{plural(f.days, "day")}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* ── What you heard ───────────────────────────────────────────────── */}
      {d.songsHeard > 0 && (
        <Section title={`Songs heard live · ${d.songsHeard}`}>
          {d.topSongs.length > 0 ? (
            <ol className="space-y-1.5">
              {d.topSongs.map((s, i) => (
                <li key={`${s.song}-${s.artistSlug ?? i}`} className="flex items-baseline gap-3 text-sm">
                  <span className="w-5 shrink-0 text-right text-xs font-mono text-text-subtle">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {s.song}
                    {s.artistName && (
                      <span className="text-text-subtle">
                        {" · "}
                        {s.artistSlug ? (
                          <Link to={`/artists/${s.artistSlug}`} className="hover:text-accent-lime transition-colors">{s.artistName}</Link>
                        ) : s.artistName}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-mono text-accent-lime">{s.count}×</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs font-mono text-text-subtle">No song came up more than once — every set was a one-off.</p>
          )}
        </Section>
      )}

      {/* ── The receipts ─────────────────────────────────────────────────── */}
      <Section title={`Every show${d.photos + d.videos > 0 ? ` · ${plural(d.photos, "photo")}, ${plural(d.videos, "video")}` : ""}`}>
        <FlyerWall shows={d.shows} />
      </Section>

      <div className="flex justify-between pt-2 text-xs font-mono">
        {prevYear ? <Link to={`/year/${prevYear}`} className="text-text-muted hover:text-accent-lime">← {prevYear}</Link> : <span />}
        {nextYear ? <Link to={`/year/${nextYear}`} className="text-text-muted hover:text-accent-lime">{nextYear} →</Link> : <span />}
      </div>
    </div>
  );
}

function YearArrow({ to, label }: { to: number | undefined; label: string }) {
  const cls = "w-8 h-8 flex items-center justify-center rounded border text-sm font-mono transition-colors";
  if (to == null) return <span className={`${cls} border-border text-text-subtle opacity-30`}>{label}</span>;
  return (
    <Link to={`/year/${to}`} title={String(to)} className={`${cls} border-border text-text-muted hover:text-accent-lime hover:border-accent-lime`}>
      {label}
    </Link>
  );
}
