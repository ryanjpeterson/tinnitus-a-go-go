/**
 * YearReviewPage — a recap of one calendar year of attended shows.
 *
 * Routes: /year → latest year with shows, /year/:year → that year.
 * Every year with attended shows is reachable from the year strip and the
 * prev/next arrows. Reuses the Stats page widgets so the two read as a set.
 */

import { useMemo } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type YearReviewResponse } from "@/lib/api";
import {
  BackButton, Chevron, EmptyState, LinkCard, Loading, RankedList, Section, SelectField, StatGrid, StatTile, type RankedItem,
} from "@/components/ui/kit";
import { MiniVBars } from "./StatsPage";
import { dayLabel, showTitle } from "@/lib/showTitle";

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

  if (q.isLoading) return <Loading label="Rewinding the tape…" />;
  const latest = q.data?.years[0]?.year;
  if (!latest) return <EmptyState title="Nothing to review yet." body="Attended shows show up here, one page per year." />;
  return <Navigate to={`/year/${latest}`} replace />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Year picker — a select on phones (no sideways scrolling), wrapped pills on desktop
// ─────────────────────────────────────────────────────────────────────────────

function YearPicker({ years, current }: { years: YearReviewResponse["years"]; current: number }) {
  const navigate = useNavigate();
  const ordered = useMemo(() => [...years].sort((a, b) => b.year - a.year), [years]);
  const options = ordered.map((y) => ({ value: String(y.year), label: `${y.year} · ${y.count} show${y.count === 1 ? "" : "s"}` }));
  // A year with no shows (typed into the URL) still needs an option to display.
  if (!ordered.some((y) => y.year === current)) options.unshift({ value: String(current), label: String(current) });

  return (
    <>
      <SelectField label="Year" className="sm:hidden" value={String(current)} options={options}
        onChange={(v) => navigate(`/year/${v}`)} />
      <div className="hidden flex-wrap gap-2 sm:flex">
        {[...ordered].reverse().map((y) => {
          const active = y.year === current;
          return (
            <Link key={y.year} to={`/year/${y.year}`} title={`${y.count} show${y.count === 1 ? "" : "s"}`}
              className={`h-9 rounded-full border px-3.5 text-sm font-semibold leading-9 transition-colors ${
                active ? "border-accent-lime bg-accent-lime text-bg" : "border-border text-text-muted hover:border-text-subtle hover:text-text-base"
              }`}>
              {y.year}
            </Link>
          );
        })}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Flyer wall — every show of the year in date order
// ─────────────────────────────────────────────────────────────────────────────

type WallTile = {
  key: string;
  to: string;
  name: string;
  date: string;
  flyerUrl: string | null;
  festival: boolean;
  /** Festival tiles: how many of its days were attended this year. */
  days: number;
};

/** One tile per concert, but a festival's days fold into a single festival tile. */
function wallTiles(shows: YearReviewResponse["shows"]): WallTile[] {
  const tiles: WallTile[] = [];
  const festivalTiles = new Map<string, WallTile>();
  for (const s of shows) {
    if (s.type === "festival_day" && s.series) {
      const existing = festivalTiles.get(s.series.slug);
      if (existing) {
        existing.days += 1;
        existing.flyerUrl ??= s.flyerUrl;
        continue;
      }
      const tile: WallTile = {
        key: s.series.slug, to: `/festivals/${s.series.slug}`, name: s.series.name,
        date: s.date, flyerUrl: s.flyerUrl, festival: true, days: 1,
      };
      festivalTiles.set(s.series.slug, tile);
      tiles.push(tile);
    } else {
      tiles.push({
        key: s.concertId, to: `/shows/${s.concertId}`, name: showTitle(s.info, s.headliner ?? s.series?.name),
        date: s.date, flyerUrl: s.flyerUrl, festival: false, days: 1,
      });
    }
  }
  return tiles;
}

function FlyerWall({ shows }: { shows: YearReviewResponse["shows"] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {wallTiles(shows).map((t) => (
        <Link
          key={t.key}
          to={t.to}
          className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-surface-2 transition-colors hover:border-accent-lime"
          title={`${t.name} · ${fmtDate(t.date)}`}
        >
          {t.flyerUrl ? (
            <img src={t.flyerUrl} alt={t.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className={`absolute inset-0 flex items-center justify-center p-2 pb-6 text-center ${t.festival ? "bg-yellow-950/60" : "bg-lime-950/40"}`}>
              <span className="line-clamp-4 break-words font-display text-sm leading-tight text-text-muted">{t.name}</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-5">
            <p className="truncate text-[11px] font-semibold leading-tight text-white/90">
              {fmtDate(t.date)}
              {t.festival && <span className="text-yellow-300"> · {t.days > 1 ? `${t.days} days` : "festival"}</span>}
            </p>
          </div>
        </Link>
      ))}
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

  if (q.isLoading) return <Loading label="Rewinding the tape…" />;
  if (q.isError || !d) return <EmptyState tone="error" title={`Couldn't load ${year}.`} body="Try refreshing." />;

  // Prev/next step through years that actually have shows, skipping gaps.
  const ascending = [...d.years].map((y) => y.year).sort((a, b) => a - b);
  const prevYear = [...ascending].reverse().find((y) => y < year);
  const nextYear = ascending.find((y) => y > year);
  const isCurrentYear = year === new Date().getFullYear();

  const header = (
    <header className="space-y-4">
      <BackButton to="/" label="Stats" />
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Year in review{isCurrentYear ? " · so far" : ""}</p>
          <h1 className="font-display text-7xl leading-[0.9] text-accent-lime sm:text-8xl">{year}</h1>
        </div>
        <div className="flex gap-2 pb-1">
          <YearArrow to={prevYear} dir="left" />
          <YearArrow to={nextYear} dir="right" />
        </div>
      </div>
      {d.years.length > 1 && <YearPicker years={d.years} current={year} />}
    </header>
  );

  if (d.totalShows === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState title={`No attended shows in ${year}.`} body="Pick another year above." />
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
    <div className="space-y-6">
      {header}

      {/* ── Headline numbers ─────────────────────────────────────────────── */}
      <StatGrid>
        <StatTile label="Shows" value={d.totalShows} sub={deltaText} accent="lime" />
        <StatTile label="Artists seen" value={d.uniqueArtists} sub={`${d.newArtistCount} for the first time`} accent="pink" />
        <StatTile label="Venues" value={d.uniqueVenues} sub={`${d.newVenueCount} new`} accent="muted" />
        <StatTile label="Cities" value={d.uniqueCities} sub={d.festivals.length > 0 ? plural(d.festivals.length, "festival") : undefined} accent="muted" />
      </StatGrid>

      {/* ── Highlights ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <LinkCard
          eyebrow="Opened the year"
          title={showTitle(first.info, first.headliner ?? first.series?.name)}
          sub={[fmtDate(first.date), dayLabel(first.info), first.venue?.name].filter(Boolean).join(" · ")}
          to={`/shows/${first.concertId}`}
        />
        {d.shows.length > 1 && (
          <LinkCard
            eyebrow={isCurrentYear ? "Latest show" : "Closed it out"}
            title={showTitle(last.info, last.headliner ?? last.series?.name)}
            sub={[fmtDate(last.date), dayLabel(last.info), last.venue?.name].filter(Boolean).join(" · ")}
            to={`/shows/${last.concertId}`}
          />
        )}
        {topArtist && topArtist.count > 1 && (
          <LinkCard
            eyebrow="Most seen"
            title={topArtist.name}
            sub={`${plural(topArtist.count, "show")} this year`}
            to={`/artists/${topArtist.slug}`}
          />
        )}
        <LinkCard
          eyebrow="Busiest month"
          title={MONTH_LONG[busiestMonth]!}
          sub={`${plural(monthCounts[busiestMonth]!, "show")} · mostly ${DOW_LONG[favouriteDay]}s`}
        />
      </div>

      {/* ── When ─────────────────────────────────────────────────────────── */}
      <div className="grid gap-6 sm:grid-cols-2 sm:gap-4">
        <Section title="Month by month">
          <MiniVBars data={monthCounts} labels={MONTH_SHORT} color="#A8FF3E" />
        </Section>
        <Section title="Day of the week">
          <MiniVBars data={dowCounts} labels={DOW_LABELS} color="#FF3D6E" />
        </Section>
      </div>

      {/* ── Who ──────────────────────────────────────────────────────────── */}
      {topArtistItems.length > 0 && (
        <Section title="Seen more than once" flush>
          <RankedList items={topArtistItems} />
        </Section>
      )}

      {d.newArtists.length > 0 && (
        <Section title="First time seeing" count={d.newArtistCount}>
          <div className="flex flex-wrap gap-1.5">
            {d.newArtists.map((a) => (
              <Link
                key={a.artistId}
                to={`/artists/${a.slug}`}
                className="rounded-full border border-border bg-surface-2 px-3.5 py-2 text-sm font-medium text-text-muted transition-colors hover:border-accent-lime/50 hover:text-accent-lime"
                title={`First seen ${fmtDate(a.firstSeen)}`}
              >
                {a.name}
              </Link>
            ))}
            {d.newArtistCount > d.newArtists.length && (
              <span className="px-3 py-2 text-sm text-text-subtle">
                +{d.newArtistCount - d.newArtists.length} more
              </span>
            )}
          </div>
        </Section>
      )}

      {/* ── Where ────────────────────────────────────────────────────────── */}
      <Section title="Where you went" flush>
        <RankedList items={topVenueItems} />
      </Section>

      {d.festivals.length > 0 && (
        <Section title="Festivals">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {d.festivals.map((f) => (
              <Link
                key={f.seriesId}
                to={`/festivals/${f.slug}`}
                className="group flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-3.5 transition-colors hover:border-yellow-500/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold transition-colors group-hover:text-yellow-400">{f.name}</p>
                  <p className="text-sm text-text-subtle">{fmtDate(f.startDate)}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-yellow-400">{plural(f.days, "day")}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* ── What you heard ───────────────────────────────────────────────── */}
      {d.songsHeard > 0 && (
        <Section title="Songs heard live" count={d.songsHeard}>
          {d.topSongs.length > 0 ? (
            <ol className="space-y-1.5">
              {d.topSongs.map((s, i) => (
                <li key={`${s.song}-${s.artistSlug ?? i}`} className="flex items-baseline gap-3 text-[15px]">
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
      <Section title="Every show" count={d.totalShows}
        action={d.photos + d.videos > 0 ? <span className="text-sm text-text-subtle">{plural(d.photos, "photo")} · {plural(d.videos, "video")}</span> : undefined}>
        <FlyerWall shows={d.shows} />
      </Section>

      <div className="grid grid-cols-2 gap-3">
        {prevYear ? <LinkCard to={`/year/${prevYear}`} eyebrow="Previous" title={String(prevYear)} /> : <span />}
        {nextYear ? <LinkCard to={`/year/${nextYear}`} eyebrow="Next" title={String(nextYear)} /> : <span />}
      </div>
    </div>
  );
}

function YearArrow({ to, dir }: { to: number | undefined; dir: "left" | "right" }) {
  const cls = "flex h-11 w-11 items-center justify-center rounded-full border transition-colors";
  if (to == null) return <span className={`${cls} border-border text-text-subtle opacity-30`}><Chevron dir={dir} /></span>;
  return (
    <Link to={`/year/${to}`} aria-label={String(to)} title={String(to)}
      className={`${cls} border-border text-text-muted hover:border-accent-lime hover:text-accent-lime`}>
      <Chevron dir={dir} />
    </Link>
  );
}
