/**
 * Spotlight — one search across shows, artists, festivals, venues and the
 * songs in your setlists, on jimbo.ui's CommandPalette (⌘K / Ctrl+K, "/",
 * or the magnifier in the app bar). It filters a downloaded index on the
 * device, so it's instant and works offline once loaded.
 *
 * Filters: year:2019, status:attended, city:Toronto (as chips). A filter on
 * its own lists everything that matches it ("year:2019" → that year's shows).
 * The query lives in the URL (?find=), so a refresh or a link reopens it.
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttendanceStatus } from "@tagg/shared";
import { api, type SearchIndex } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  CommandPalette, type Command, type Facet, type SearchProvider, type SpotlightItem, type SpotlightQuery, type Suggestion,
} from "@/components/ui/overlays";
import { STATUS, StatusBadge } from "@/components/ui/kit";

const INDEX_KEY = ["search-index"];
const STATUSES = Object.keys(STATUS) as AttendanceStatus[];

/** Lowercase, accents stripped — "Mötley" matches "motley". */
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const wordsOf = (text: string) => norm(text).trim().split(/\s+/).filter(Boolean);

/** 0 = starts with the query, 1 = a word starts with it, 2 = contains it; -1 = no match. Every word must match. */
function score(haystack: string, words: string[]): number {
  if (words.length === 0) return 0;
  const h = norm(haystack);
  if (!words.every((w) => h.includes(w))) return -1;
  if (h.startsWith(words.join(" "))) return 0;
  if (words.every((w) => h.startsWith(w) || h.includes(` ${w}`) || h.includes(`/${w}`))) return 1;
  return 2;
}

/** Best match first; within a tier, the index's own order (busiest / newest first). */
function rank<T>(items: T[], text: (t: T) => string, words: string[]): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(text(item), words) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.item);
}

type Filters = { year?: string; status?: string; city?: string };
const KNOWN = new Set(["year", "status", "city"]);

function readFilters(q: SpotlightQuery): Filters | null {
  const f: Filters = {};
  for (const { key, value } of q.filters) {
    if (!KNOWN.has(key)) return null;
    f[key as keyof Filters] = norm(value);
  }
  return f;
}

/** Does a filter (only those this provider knows) allow nothing? Then the provider stays out. */
const usesOnly = (f: Filters, allowed: (keyof Filters)[]) => Object.keys(f).every((k) => allowed.includes(k as keyof Filters));

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const showTitle = (s: SearchIndex["shows"][number]) => s.festival ?? s.lineup ?? "Show";
const prettyDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

type Show = SearchIndex["shows"][number];
const showMatches = (s: Show, f: Filters) =>
  (!f.year || s.date.startsWith(f.year)) &&
  (!f.status || s.status === f.status) &&
  (!f.city || norm(s.city ?? "").includes(f.city));

export function Spotlight({ open, onClose, query, onQueryChange, onAddShow }: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  onAddShow?: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;

  // Fetched when the palette first opens; providers wait on it, so the first search just shows "loading".
  const indexQ = useQuery({ queryKey: INDEX_KEY, queryFn: api.getSearchIndex, staleTime: 5 * 60_000, enabled: open });
  const index = () => qc.ensureQueryData({ queryKey: INDEX_KEY, queryFn: api.getSearchIndex });

  const years = useMemo(() => {
    const ys = new Set((indexQ.data?.shows ?? []).map((s) => s.date.slice(0, 4)));
    return [...ys].sort().reverse();
  }, [indexQ.data]);
  const cities = useMemo(() => {
    const n = new Map<string, number>();
    for (const v of indexQ.data?.venues ?? []) if (v.city) n.set(v.city, (n.get(v.city) ?? 0) + v.shows);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [indexQ.data]);

  const facets: Facet[] = [
    { key: "year", label: "Year", values: years, hint: "2019" },
    { key: "status", label: "Status", values: STATUSES },
    { key: "city", label: "City", values: cities.slice(0, 20), hint: "Toronto" },
  ];

  const thisYear = String(new Date().getFullYear());
  const suggestions: Suggestion[] = [
    { id: "this-year", title: `Shows in ${thisYear}`, subtitle: "Everything this year", query: `year:${thisYear} ` },
    { id: "upcoming", title: "Going", subtitle: "Shows you've got tickets for", query: "status:attending " },
    { id: "missed", title: "Missed", subtitle: "The ones that got away", query: "status:missed " },
    ...(cities[0] ? [{ id: "home-city", title: `Shows in ${cities[0]}`, subtitle: "Your busiest city", query: `city:"${cities[0]}" ` }] : []),
  ];

  const providers: SearchProvider<SpotlightItem>[] = [
    {
      id: "shows",
      label: "Shows",
      limit: 6,
      async search(q) {
        const f = readFilters(q);
        if (!f || (!q.text.trim() && q.filters.length === 0)) return [];
        const idx = await index();
        const shows = idx.shows.filter((s) => showMatches(s, f));
        return rank(shows, (s) => [s.festival, s.lineup, s.venue, s.city, s.date].filter(Boolean).join(" "), wordsOf(q.text))
          .slice(0, 50)
          .map((s) => ({
            id: s.slug,
            title: showTitle(s),
            subtitle: [s.festival ? s.lineup : null, s.venue, s.city].filter(Boolean).join(" · "),
            meta: s.date.slice(0, 4),
            image: s.flyerUrl,
            data: s,
          }));
      },
      pick: (item) => navigate(`/shows/${item.id}`),
      more: (q) => {
        const p = new URLSearchParams();
        if (q.text.trim()) p.set("q", q.text.trim());
        const status = q.filters.find((x) => x.key === "status")?.value;
        if (status) p.set("status", status);
        navigate(`/shows?${p}`);
      },
      preview: (item) => <ShowPreview show={item.data as Show} />,
    },
    {
      id: "artists",
      label: "Artists",
      async search(q) {
        const f = readFilters(q);
        if (!f || !q.text.trim() || !usesOnly(f, [])) return [];
        const idx = await index();
        return rank(idx.artists, (a) => a.name, wordsOf(q.text)).slice(0, 30).map((a) => ({
          id: a.slug, title: a.name, subtitle: plural(a.shows, "show"), image: a.imageUrl, round: true, data: a,
        }));
      },
      pick: (item) => navigate(`/artists/${item.id}`),
      more: (q) => navigate(`/artists?q=${encodeURIComponent(q.text.trim())}`),
      preview: (item) => {
        const a = item.data as SearchIndex["artists"][number];
        return <Preview image={a.imageUrl} round title={a.name} lines={[`Seen at ${plural(a.shows, "show")}`]} />;
      },
    },
    {
      id: "festivals",
      label: "Festivals",
      async search(q) {
        const f = readFilters(q);
        if (!f || !usesOnly(f, ["year"]) || (!q.text.trim() && !f.year)) return [];
        const idx = await index();
        const fests = idx.festivals.filter((x) => !f.year || String(x.year ?? x.startDate?.slice(0, 4)) === f.year);
        return rank(fests, (x) => [x.name, x.year].filter(Boolean).join(" "), wordsOf(q.text)).slice(0, 30).map((x) => ({
          id: x.slug, title: x.name, meta: x.year ? String(x.year) : undefined, image: x.flyerUrl, data: x,
        }));
      },
      pick: (item) => navigate(`/festivals/${item.id}`),
      preview: (item) => {
        const x = item.data as SearchIndex["festivals"][number];
        return <Preview image={x.flyerUrl} title={x.name} lines={[x.startDate ? prettyDate(x.startDate) : x.year ? String(x.year) : ""]} />;
      },
    },
    {
      id: "venues",
      label: "Venues",
      async search(q) {
        const f = readFilters(q);
        if (!f || !usesOnly(f, ["city"]) || (!q.text.trim() && !f.city)) return [];
        const idx = await index();
        const venues = idx.venues.filter((v) => !f.city || norm(v.city ?? "").includes(f.city));
        return rank(venues, (v) => [v.name, v.city].filter(Boolean).join(" "), wordsOf(q.text)).slice(0, 30).map((v) => ({
          id: v.slug, title: v.name, subtitle: v.city ?? undefined, meta: String(v.shows), image: null, data: v,
        }));
      },
      pick: (item) => navigate(`/venues/${item.id}`),
      more: (q) => navigate(`/venues?q=${encodeURIComponent(q.text.trim())}`),
    },
    {
      id: "songs",
      label: "Songs heard live",
      async search(q) {
        const f = readFilters(q);
        if (!f || !q.text.trim() || !usesOnly(f, ["year", "city"])) return [];
        const idx = await index();
        const all = idx.songs
          .map(([song, artist, i]) => ({ song, artist, show: idx.shows[i]! }))
          .filter((s) => showMatches(s.show, f));
        // One row per song, with how many times you heard it; it opens the latest show.
        const rows = new Map<string, { song: string; artist: string | null; slug: string; date: string; count: number }>();
        for (const s of rank(all, (s) => `${s.song} ${s.artist ?? ""}`, wordsOf(q.text))) {
          const key = `${norm(s.song)}|${s.artist ?? ""}`;
          const cur = rows.get(key);
          if (cur) cur.count++;
          else rows.set(key, { song: s.song, artist: s.artist, slug: s.show.slug, date: s.show.date, count: 1 });
        }
        return [...rows.values()].slice(0, 30).map((s) => ({
          id: `${s.slug}|${s.song}|${s.artist ?? ""}`,
          title: s.song,
          subtitle: [s.artist, s.count > 1 ? `heard ${s.count}×` : `heard ${s.date.slice(0, 4)}`].filter(Boolean).join(" · "),
          image: null,
          data: s,
        }));
      },
      pick: (item) => navigate(`/shows/${(item.data as { slug: string }).slug}`),
    },
  ];

  const go = (to: string) => () => navigate(to);
  const commands: Command[] = [
    { id: "home", group: "Go to", label: "Home", keywords: ["stats"], run: go("/") },
    { id: "shows", group: "Go to", label: "Shows", keywords: ["concerts"], run: go("/shows") },
    { id: "upcoming", group: "Go to", label: "Upcoming shows", keywords: ["going", "tickets"], run: go("/shows?view=upcoming") },
    { id: "artists", group: "Go to", label: "Artists", keywords: ["bands"], run: go("/artists") },
    { id: "festivals", group: "Go to", label: "Festivals", run: go("/festivals") },
    { id: "venues", group: "Go to", label: "Venues", run: go("/venues") },
    { id: "map", group: "Go to", label: "Map", keywords: ["venues"], run: go("/map") },
    { id: "tickets", group: "Go to", label: "Ticket stubs", keywords: ["tickets"], run: go("/tickets") },
    { id: "year", group: "Go to", label: "Year in review", keywords: ["wrapped", "recap"], run: go("/year") },
    ...(isAdmin
      ? [
          ...(onAddShow ? [{ id: "add", group: "Actions", label: "Add a show", hint: "N", keywords: ["new", "concert"], run: onAddShow }] : []),
          { id: "notifications", group: "Actions", label: "Notifications", keywords: ["reminders", "email", "ntfy"], run: go("/notifications") },
          { id: "imports", group: "Actions", label: "Imports", keywords: ["upload", "csv"], run: go("/admin/imports") },
          { id: "data", group: "Actions", label: "Data cleanup", keywords: ["duplicates", "merge"], run: go("/admin/data") },
          { id: "jimbo", group: "Actions", label: "jimbo-ui config", keywords: ["theme", "look", "colours", "brand"], run: go("/jimbo-ui") },
          { id: "account", group: "Actions", label: "Account", run: go("/account") },
        ]
      : []),
  ];

  return (
    <CommandPalette
      open={open}
      onClose={onClose}
      query={query}
      onQueryChange={onQueryChange}
      providers={providers}
      facets={facets}
      suggestions={suggestions}
      commands={commands}
      placeholder="Shows, artists, festivals, venues, songs"
    />
  );
}

function ShowPreview({ show }: { show: Show }) {
  const status = show.status as AttendanceStatus | null;
  return (
    <Preview
      image={show.flyerUrl}
      title={showTitle(show)}
      lines={[prettyDate(show.date), show.festival ? show.lineup ?? "" : "", [show.venue, show.city].filter(Boolean).join(", ")]}
    >
      {status && STATUS[status] && <StatusBadge status={status} className="mt-1" />}
    </Preview>
  );
}

/**
 * The palette's preview pane has no padding of its own, so it's here. On
 * narrower screens (tablets, a phone on its side) the image is a small
 * thumbnail beside the text; from lg up it's the full flyer above it.
 */
function Preview({ image, round, title, lines, children }: {
  image?: string | null; round?: boolean; title: string; lines: string[]; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 p-4 lg:block lg:space-y-4">
      {image && (
        <img src={image} alt="" loading="lazy"
          className={round
            ? "aspect-square w-16 shrink-0 rounded-full object-cover lg:mx-auto lg:w-40"
            : "aspect-4/5 w-16 shrink-0 rounded-lg object-cover lg:w-full"} />
      )}
      <div className="min-w-0 space-y-1">
        <p className="font-display text-lg leading-tight">{title}</p>
        {lines.filter(Boolean).map((l) => <p key={l} className="text-sm text-text-muted">{l}</p>)}
        {children}
      </div>
    </div>
  );
}
