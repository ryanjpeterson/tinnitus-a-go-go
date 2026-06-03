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
// Stat tile
// ─────────────────────────────────────────────────────────────────────────────

function StatTile({
  label, value, sub, accent = "lime",
}: {
  label: string; value: string | number; sub?: string; accent?: "lime" | "pink" | "muted";
}) {
  const col = accent === "lime" ? "text-accent-lime" : accent === "pink" ? "text-accent-pink" : "text-text-base";
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="text-[10px] font-mono uppercase tracking-widest text-text-subtle mb-1">{label}</p>
      <p className={`text-3xl font-mono font-bold ${col}`}>{value}</p>
      {sub && <p className="text-xs text-text-subtle mt-1">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, children, className = "" }: {
  title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-surface p-5 ${className}`}>
      <h2 className="text-[10px] font-mono uppercase tracking-widest text-text-subtle mb-4">{title}</h2>
      {children}
    </div>
  );
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
            <span className="text-xs font-mono text-text-muted w-10 shrink-0 text-right">{r.year}</span>
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
    <div className="overflow-x-auto">
      <div className="min-w-[460px]">
        {/* Month header */}
        <div className="grid gap-0.5 mb-0.5" style={{ gridTemplateColumns: "36px repeat(12, 1fr)" }}>
          <div />
          {MONTH_SHORT.map((m) => (
            <div key={m} className="text-[9px] font-mono text-text-subtle text-center">{m}</div>
          ))}
        </div>
        {/* Year rows — compact cells */}
        {years.map((year) => (
          <div key={year} className="grid gap-0.5 mb-0.5" style={{ gridTemplateColumns: "36px repeat(12, 1fr)" }}>
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
        <p className="text-[9px] font-mono text-text-subtle mt-1.5">darker = more shows · hover for count</p>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Day of week + month mini bars — tall version
// ─────────────────────────────────────────────────────────────────────────────

function MiniVBars({ data, labels, color = "#A8FF3E" }: {
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
// Ranked list — replaces horizontal bars for top artists + venues
// ─────────────────────────────────────────────────────────────────────────────

type RankedItem = {
  id: string;
  name: string;
  sub?: string;
  count: number;
  href: string;
};

function RankedList({ items, color = "#A8FF3E" }: { items: RankedItem[]; color?: string }) {
  if (items.length === 0) return <p className="text-xs text-text-subtle font-mono">No data yet.</p>;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {items.map((item, i) => {
        const rank = i + 1;
        const isTop = rank <= 3;
        const rankColor = rank === 1 ? "#A8FF3E" : rank === 2 ? "#7ec8e3" : rank === 3 ? "#FF3D6E" : undefined;
        return (
          <Link
            key={item.id}
            to={item.href}
            className="group flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 hover:border-accent-lime/50 p-3 transition-colors min-w-0"
          >
            {/* Rank badge */}
            <span
              className="shrink-0 text-sm font-mono font-bold leading-none mt-0.5 w-6 text-right"
              style={{ color: isTop ? rankColor : "#525250" }}
            >
              {rank}
            </span>
            {/* Name + count */}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-text-base group-hover:text-accent-lime transition-colors truncate leading-tight">
                {item.name}
              </p>
              {item.sub && (
                <p className="text-[10px] font-mono text-text-subtle truncate leading-tight mt-0.5">{item.sub}</p>
              )}
              <p className="text-[10px] font-mono mt-1" style={{ color }}>
                {item.count} show{item.count !== 1 ? "s" : ""}
              </p>
            </div>
          </Link>
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
    <div className="rounded-lg border border-accent-pink/40 bg-surface p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-accent-pink text-base">♪</span>
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-accent-pink">On This Day</h2>
      </div>
      <div className="space-y-3">
        {shows.map((s) => (
          <div key={s.concertId} className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              <span className="text-[10px] font-mono text-text-subtle bg-surface-2 rounded px-1.5 py-0.5 whitespace-nowrap">
                {yearsAgo(s.date)}
              </span>
            </div>
            <div className="min-w-0">
              <Link
                to={`/shows/${s.concertId}`}
                className="text-sm font-medium text-text-base hover:text-accent-lime transition-colors truncate block"
              >
                {showName(s.headlinerHint, s.seriesName)}
              </Link>
              <p className="text-xs text-text-subtle font-mono">
                {fmtDate(s.date)}
                {s.venueName && ` · ${s.venueName}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestones timeline
// ─────────────────────────────────────────────────────────────────────────────

function Milestones({ milestones }: { milestones: DeepStatsResponse["milestones"] }) {
  if (milestones.length === 0) return <p className="text-xs text-text-subtle font-mono">No attended shows yet.</p>;

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
      <div className="absolute left-[15px] top-3 bottom-3 w-px bg-border" />
      <div className="space-y-4">
        {milestones.map((m) => (
          <div key={m.n} className="flex items-start gap-3 relative">
            <div className="w-8 h-8 rounded-full bg-surface-2 border border-accent-lime/50 flex items-center justify-center shrink-0 z-10">
              <span className="text-[9px] font-mono text-accent-lime font-bold leading-none text-center">
                {ordinal(m.n)}
              </span>
            </div>
            <div className="min-w-0 pt-0.5">
              <Link
                to={`/shows/${m.concertId}`}
                className="text-sm font-medium text-text-base hover:text-accent-lime transition-colors block truncate"
              >
                {showName(m.headlinerHint, m.seriesName)}
              </Link>
              <p className="text-[10px] font-mono text-text-subtle">{fmtDate(m.date)}</p>
            </div>
          </div>
        ))}
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
      <div className="py-16 text-center text-text-subtle font-mono text-sm animate-pulse">
        Crunching the numbers…
      </div>
    );
  }

  if (q.isError || !d) {
    return (
      <div className="py-16 text-center font-mono text-sm text-accent-pink">
        Couldn't load stats. Try refreshing.
      </div>
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
    <div className="space-y-4">
      {/* On This Day — shown prominently when applicable */}
      {d.onThisDay.length > 0 && <OnThisDay shows={d.onThisDay} />}

      {/* ── Overview tiles ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Shows attended" value={d.totalShows}   sub="shows"              accent="lime" />
        <StatTile label="Artists seen"   value={d.totalArtists} sub="unique"             accent="muted" />
        <StatTile label="Venues visited" value={d.totalVenues}  sub="unique"             accent="muted" />
        <StatTile label="Years active"   value={d.yearsActive}  sub="span"               accent="muted" />
      </div>

      {/* First / latest show */}
      {(d.firstShow || d.latestShow) && (
        <div className="grid sm:grid-cols-2 gap-3">
          {d.firstShow && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-text-subtle mb-1">First show</p>
              <Link to={`/shows/${d.firstShow.concertId}`} className="text-sm font-medium hover:text-accent-lime transition-colors block truncate">
                {showName(d.firstShow.headlinerHint)}
              </Link>
              <p className="text-xs font-mono text-text-subtle">{fmtDate(d.firstShow.date)}</p>
            </div>
          )}
          {d.latestShow && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-text-subtle mb-1">Most recent</p>
              <Link to={`/shows/${d.latestShow.concertId}`} className="text-sm font-medium hover:text-accent-lime transition-colors block truncate">
                {showName(d.latestShow.headlinerHint)}
              </Link>
              <p className="text-xs font-mono text-text-subtle">{fmtDate(d.latestShow.date)}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Activity by year (full width) ───────────────────────────────── */}
      <Section title="Activity by year">
        <YearBars byYear={d.byYear} />
      </Section>

      {/* ── Heatmap ─────────────────────────────────────────────────────── */}
      <Section title="Show density — by year & month">
        <Heatmap heatmap={d.heatmap} byYear={d.byYear} />
      </Section>

      {/* ── When do you go? ─────────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Section title="Day of the week">
          <MiniVBars data={dowCounts} labels={DOW_LABELS} color="#A8FF3E" />
        </Section>
        <Section title="Month of the year">
          <MiniVBars data={monthCounts} labels={MONTH_SHORT} color="#FF3D6E" />
        </Section>
      </div>

      {/* ── Top artists ─────────────────────────────────────────────────── */}
      <Section title="Most seen artists">
        <RankedList items={topArtistItems} color="#A8FF3E" />
      </Section>

      {/* ── Top venues ──────────────────────────────────────────────────── */}
      <Section title="Most visited venues">
        <RankedList items={topVenueItems} color="#FF3D6E" />
      </Section>

      {/* ── Ticket prices ───────────────────────────────────────────────── */}
      {d.avgTicketCents != null && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface p-5">
            <p className="text-[10px] font-mono text-text-subtle uppercase tracking-widest mb-1">Average ticket</p>
            <p className="text-2xl font-mono font-bold text-accent-lime">
              ${(d.avgTicketCents / 100).toFixed(2)}
            </p>
          </div>
          {d.mostExpensiveShow && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <p className="text-[10px] font-mono text-text-subtle uppercase tracking-widest mb-1">Most expensive</p>
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
      <Section title="Milestones">
        <Milestones milestones={d.milestones} />
      </Section>

    </div>
  );
}
