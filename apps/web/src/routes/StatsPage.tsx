/**
 * StatsPage — personal concert log analytics.
 *
 * All charts are custom CSS/SVG — no external chart library.
 * Design follows brand guidelines: dark bg, accent-lime / accent-pink, font-mono numbers.
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type DeepStatsResponse } from "@/lib/api";
import { showSubtitle, showTitle } from "@/lib/showTitle";
import {
  Chevron, EmptyState, EventRow, LinkCard, List, Loading, PageHeader, RankedList, Section, StatGrid, StatTile, type RankedItem,
} from "@/components/ui/kit";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW_LABELS  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function yearsAgo(iso: string): string {
  const y = new Date().getFullYear() - parseInt(iso.slice(0, 4), 10);
  return y === 1 ? "1 year ago" : `${y} years ago`;
}

/** Best display name for a show record that may or may not have a headlinerHint. */
function showName(headlinerHint: string | null | undefined, seriesName?: string | null): string {
  if (headlinerHint) return headlinerHint;
  if (seriesName) return seriesName;
  return "Untitled show";
}


// ─────────────────────────────────────────────────────────────────────────────
// Year bar chart — years as rows, split lime=attended / surface-2=rest
// ─────────────────────────────────────────────────────────────────────────────

function YearBars({ byYear }: { byYear: DeepStatsResponse["byYear"] }) {
  const maxCount = Math.max(...byYear.map((r) => r.count), 1);
  return (
    <div className="space-y-1.5">
      {byYear.map((r) => {
        const totalPct   = (r.count / maxCount) * 100;
        const attendPct  = r.count > 0 ? (r.attended / r.count) * 100 : 0;
        return (
          <div key={r.year} className="flex items-center gap-3">
            <Link
              to={`/year/${r.year}`}
              title={`${r.year} in review`}
              className="text-xs font-mono text-text-muted hover:text-accent-lime hover:underline w-10 shrink-0 text-right"
            >
              {r.year}
            </Link>
            <div className="flex-1 h-3 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${totalPct}%`, background: "#A8FF3E", position: "relative" }}
              >
                <div
                  className="absolute inset-y-0 right-0 rounded-r-full bg-surface-2"
                  style={{ width: `${100 - attendPct}%`, opacity: 0.55 }}
                />
              </div>
            </div>
            <span className="text-xs font-mono text-text-subtle shrink-0 w-14 text-right">
              <span className="text-text-base">{r.attended}</span>
              <span className="opacity-50">/{r.count}</span>
            </span>
          </div>
        );
      })}
      <p className="text-[10px] font-mono text-text-subtle mt-2 pl-14">attended / logged</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Heatmap — compact year rows × month columns
// ─────────────────────────────────────────────────────────────────────────────

function Heatmap({ heatmap, byYear }: {
  heatmap: DeepStatsResponse["heatmap"];
  byYear: DeepStatsResponse["byYear"];
}) {
  const years = byYear.map((r) => r.year).sort();

  const lookup = new Map<string, number>();
  let maxCount = 0;
  for (const cell of heatmap) {
    const key = `${cell.year}-${cell.month}`;
    lookup.set(key, cell.count);
    if (cell.count > maxCount) maxCount = cell.count;
  }

  function cellOpacity(year: string, month: number): number {
    const count = lookup.get(`${year}-${month}`) ?? 0;
    return count === 0 ? 0 : 0.12 + (count / maxCount) * 0.88;
  }

  function cellCount(year: string, month: number): number {
    return lookup.get(`${year}-${month}`) ?? 0;
  }

  return (
    <div>
      <div>
        {/* Month header */}
        <div className="grid gap-0.5 mb-0.5" style={{ gridTemplateColumns: "34px repeat(12, minmax(0, 1fr))" }}>
          <div />
          {MONTH_SHORT.map((m) => (
            <div key={m} className="text-[9px] font-mono text-text-subtle text-center">{m.slice(0, 1)}<span className="hidden sm:inline">{m.slice(1)}</span></div>
          ))}
        </div>
        {/* Year rows — compact cells */}
        {years.map((year) => (
          <div key={year} className="grid gap-0.5 mb-0.5" style={{ gridTemplateColumns: "34px repeat(12, minmax(0, 1fr))" }}>
            <div className="text-[9px] font-mono text-text-muted text-right pr-1.5 flex items-center justify-end">{year}</div>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const count = cellCount(year, m);
              const opacity = cellOpacity(year, m);
              return (
                <div
                  key={m}
                  title={count > 0 ? `${MONTH_SHORT[m - 1]} ${year}: ${count} show${count !== 1 ? "s" : ""}` : undefined}
                  className="rounded-sm"
                  style={{
                    height: "14px",
                    backgroundColor: count === 0
                      ? "rgba(48,48,52,0.5)"
                      : `rgba(168, 255, 62, ${opacity})`,
                  }}
                />
              );
            })}
          </div>
        ))}
        <p className="text-[9px] font-mono text-text-subtle mt-1.5">brighter = more shows</p>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Day of week + month mini bars — tall version
// ─────────────────────────────────────────────────────────────────────────────

export function MiniVBars({ data, labels, color = "#A8FF3E" }: {
  data: number[]; labels: string[]; color?: string;
}) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1 h-36">
      {data.map((val, i) => {
        const pct = (val / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${labels[i]}: ${val}`}>
            <div className="w-full flex items-end" style={{ height: "112px" }}>
              <div
                className="w-full rounded-sm"
                style={{ height: `${pct}%`, minHeight: val > 0 ? "2px" : "0", backgroundColor: color, opacity: val === 0 ? 0.15 : 1 }}
              />
            </div>
            <span className="text-[9px] font-mono text-text-subtle leading-none">{labels[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// On This Day card
// ─────────────────────────────────────────────────────────────────────────────

function OnThisDay({ shows }: { shows: DeepStatsResponse["onThisDay"] }) {
  if (shows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="h-section px-0.5 text-accent-pink">♪ On this day</h2>
      <List className="border-accent-pink/40">
        {shows.map((s) => (
          <EventRow
            key={s.concertId}
            to={`/shows/${s.concertId}`}
            date={s.date}
            title={showTitle(s.info, showName(s.headlinerHint, s.seriesName))}
            subtitle={[yearsAgo(s.date), s.venueName].filter(Boolean).join(" · ")}
            meta={showSubtitle(s.info)}
          />
        ))}
      </List>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestones timeline
// ─────────────────────────────────────────────────────────────────────────────

function Milestones({ milestones }: { milestones: DeepStatsResponse["milestones"] }) {
  if (milestones.length === 0) return <p className="p-4 text-sm text-text-subtle">No attended shows yet.</p>;

  const ordinal = (n: number) => {
    if (n === 1) return "1st";
    if (n === 5) return "5th";
    if (n === 10) return "10th";
    if (n === 25) return "25th";
    if (n === 50) return "50th";
    if (n === 100) return "100th";
    if (n === 200) return "200th";
    if (n === 500) return "500th";
    return `${n}th`;
  };

  return (
    <div className="relative">
      {/* Timeline spine behind the badges */}
      <div className="absolute bottom-8 left-[37px] top-8 w-px bg-border" />
      <div className="divide-y divide-border">
        {milestones.map((m) => {
          const sub = showSubtitle(m.info);
          return (
            <Link key={m.n} to={`/shows/${m.concertId}`}
              className="group relative flex min-h-[76px] items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2/70">
              <span className="z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent-lime/60 bg-surface-2 text-xs font-bold text-accent-lime">
                {ordinal(m.n)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-text-base group-hover:text-accent-lime">
                  {showTitle(m.info, showName(m.headlinerHint, m.seriesName))}
                </p>
                {sub && <p className="truncate text-sm text-text-muted">{sub}</p>}
                <p className="text-xs text-text-subtle">{fmtDate(m.date)}</p>
              </div>
              <Chevron className="text-text-subtle group-hover:text-accent-lime" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function StatsPage() {
  // Use the browser's local date for "On This Day" so the server filters by the
  // correct calendar day regardless of where it's hosted.
  const localDate = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local tz

  const q = useQuery({
    queryKey: ["concerts/deep-stats", localDate],
    queryFn:  () => api.getDeepStats(localDate),
    staleTime: 5 * 60_000,
  });

  const d = q.data;

  const monthCounts = useMemo(() => {
    if (!d) return Array(12).fill(0) as number[];
    const arr = Array(12).fill(0) as number[];
    for (const r of d.byMonth) arr[r.month - 1] = r.count;
    return arr;
  }, [d]);

  const dowCounts = useMemo(() => {
    if (!d) return Array(7).fill(0) as number[];
    const arr = Array(7).fill(0) as number[];
    for (const r of d.byDayOfWeek) arr[r.dow] = r.count;
    return arr;
  }, [d]);

  if (q.isLoading) {
    return (
      <Loading label="Crunching the numbers…" />
    );
  }

  if (q.isError || !d) {
    return (
      <EmptyState tone="error" title="Couldn't load stats." body="Try refreshing." />
    );
  }

  const topArtistItems: RankedItem[] = d.topArtists.map((a) => ({
    id: a.artistId,
    name: a.name,
    sub: a.firstSeen && a.lastSeen
      ? `${a.firstSeen.slice(0,4)}${a.firstSeen.slice(0,4) !== a.lastSeen.slice(0,4) ? `–${a.lastSeen.slice(0,4)}` : ""}`
      : undefined,
    count: a.count,
    href: `/artists/${a.slug}`,
  }));

  const topVenueItems: RankedItem[] = d.topVenues.map((v) => ({
    id: v.venueId,
    name: v.name,
    sub: v.city ?? undefined,
    count: v.count,
    href: `/venues/${v.slug}`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Tinnitus A Go Go" title="The damage" />

      {/* On This Day — shown prominently when applicable */}
      {d.onThisDay.length > 0 && <OnThisDay shows={d.onThisDay} />}

      {/* ── Overview tiles ──────────────────────────────────────────────── */}
      <StatGrid>
        <StatTile label="Shows attended" value={d.totalShows} accent="lime" />
        <StatTile label="Artists seen" value={d.totalArtists} />
        <StatTile label="Venues" value={d.totalVenues} />
        <StatTile label="Years active" value={d.yearsActive} />
      </StatGrid>

      {/* ── Year in review entry point ───────────────────────────────────── */}
      {d.byYear.length > 0 && (
        <LinkCard
          to={`/year/${d.byYear[0]!.year}`}
          accent
          eyebrow="Year in review"
          title={`Your ${d.byYear[0]!.year}, and every year before it`}
          sub="Top artists, new discoveries, every flyer"
        />
      )}

      {/* First / latest show */}
      {(d.firstShow || d.latestShow) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {d.firstShow && (
            <LinkCard to={`/shows/${d.firstShow.concertId}`} eyebrow="First show"
              title={showTitle(d.firstShow.info, showName(d.firstShow.headlinerHint))}
              sub={[fmtDate(d.firstShow.date), showSubtitle(d.firstShow.info)].filter(Boolean).join(" · ")} />
          )}
          {d.latestShow && (
            <LinkCard to={`/shows/${d.latestShow.concertId}`} eyebrow="Most recent"
              title={showTitle(d.latestShow.info, showName(d.latestShow.headlinerHint))}
              sub={[fmtDate(d.latestShow.date), showSubtitle(d.latestShow.info)].filter(Boolean).join(" · ")} />
          )}
        </div>
      )}

      {/* ── Activity by year (full width) ───────────────────────────────── */}
      <Section title="Activity by year">
        <YearBars byYear={d.byYear} />
        <p className="mt-2 pl-14 text-xs text-text-subtle">Tap a year for its review</p>
      </Section>

      {/* ── Heatmap ─────────────────────────────────────────────────────── */}
      <Section title="Show density — by year & month">
        <Heatmap heatmap={d.heatmap} byYear={d.byYear} />
      </Section>

      {/* ── When do you go? ─────────────────────────────────────────────── */}
      <div className="grid gap-6 sm:grid-cols-2 sm:gap-4">
        <Section title="Day of the week">
          <MiniVBars data={dowCounts} labels={DOW_LABELS} color="#A8FF3E" />
        </Section>
        <Section title="Month of the year">
          <MiniVBars data={monthCounts} labels={MONTH_SHORT} color="#FF3D6E" />
        </Section>
      </div>

      {/* ── Top artists ─────────────────────────────────────────────────── */}
      <Section title="Most seen artists" flush>
        <RankedList items={topArtistItems} />
      </Section>

      {/* ── Top venues ──────────────────────────────────────────────────── */}
      <Section title="Most visited venues" flush>
        <RankedList items={topVenueItems} />
      </Section>

      {/* ── Ticket prices ───────────────────────────────────────────────── */}
      {d.avgTicketCents != null && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="card p-4 sm:p-5">
            <p className="eyebrow mb-1">Average ticket</p>
            <p className="text-2xl font-mono font-bold text-accent-lime">
              ${(d.avgTicketCents / 100).toFixed(2)}
            </p>
          </div>
          {d.mostExpensiveShow && (
            <div className="card p-4 sm:p-5">
              <p className="eyebrow mb-1">Most expensive</p>
              <p className="text-2xl font-mono font-bold text-accent-pink">
                ${(d.mostExpensiveShow.amountCents / 100).toFixed(2)}{" "}
                <span className="text-xs font-normal text-text-subtle">{d.mostExpensiveShow.currency}</span>
              </p>
              <Link
                to={`/shows/${d.mostExpensiveShow.concertId}`}
                className="text-xs font-mono text-text-muted hover:text-accent-lime transition-colors"
              >
                {showName(d.mostExpensiveShow.headlinerHint)} · {fmtDate(d.mostExpensiveShow.date)} ↗
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Milestones ──────────────────────────────────────────────────── */}
      <Section title="Milestones" flush>
        <Milestones milestones={d.milestones} />
      </Section>

    </div>
  );
}
