/**
 * SearchSheet — one search across shows, artists, festivals, venues and the
 * songs in your setlists. Filters a downloaded index on the device, so it's
 * instant and works offline. Open with the magnifier in the app bar or "/".
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type SearchIndex } from "@/lib/api";
import { Chevron, DateBlock, Sheet } from "@/components/ui/kit";

const RECENT_KEY = "tagg.recentSearches";
const PER_GROUP = 6;

/** Lowercase, accents stripped — "Mötley" matches "motley". */
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** 0 = name starts with the query, 1 = a word starts with it, 2 = contains it; -1 = no match. Every word must match. */
function score(haystack: string, words: string[]): number {
  const h = norm(haystack);
  if (!words.every((w) => h.includes(w))) return -1;
  const q = words.join(" ");
  if (h.startsWith(q)) return 0;
  if (words.every((w) => h.startsWith(w) || h.includes(` ${w}`) || h.includes(`/${w}`))) return 1;
  return 2;
}

function rank<T>(items: T[], text: (t: T) => string, words: string[]): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(text(item), words) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.i - b.i) // keep the index's order (busiest / newest first) within a tier
    .map((x) => x.item);
}

function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]; } catch { return []; }
}
function saveRecent(q: string): void {
  try {
    const next = [q, ...readRecent().filter((r) => r !== q)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* storage unavailable */ }
}

export function SearchSheet({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const indexQ = useQuery({ queryKey: ["search-index"], queryFn: api.getSearchIndex, staleTime: 5 * 60_000 });
  const words = useMemo(() => norm(q).trim().split(/\s+/).filter(Boolean), [q]);

  const results = useMemo(() => {
    const idx: SearchIndex | undefined = indexQ.data;
    if (!idx || words.length === 0) return null;
    const allSongs = idx.songs.map(([song, artist, i]) => ({ song, artist, slug: idx.shows[i]!.slug, date: idx.shows[i]!.date }));
    const songHits = rank(allSongs, (s) => `${s.song} ${s.artist ?? ""}`, words);
    // One row per song title, with how many times you heard it.
    const songs = new Map<string, { song: string; artist: string | null; slug: string; date: string; count: number }>();
    for (const s of songHits) {
      const key = `${norm(s.song)}|${s.artist ?? ""}`;
      const cur = songs.get(key);
      if (cur) cur.count++;
      else songs.set(key, { ...s, count: 1 });
    }
    return {
      shows: rank(idx.shows, (s) => [s.festival, s.lineup, s.venue, s.city, s.date].filter(Boolean).join(" "), words),
      artists: rank(idx.artists, (a) => a.name, words),
      festivals: rank(idx.festivals, (f) => [f.name, f.year].filter(Boolean).join(" "), words),
      venues: rank(idx.venues, (v) => [v.name, v.city].filter(Boolean).join(" "), words),
      songs: [...songs.values()],
    };
  }, [indexQ.data, words]);

  const done = () => { if (q.trim()) saveRecent(q.trim()); onClose(); };
  const recent = readRecent();
  const empty = results && Object.values(results).every((r) => r.length === 0);

  return (
    <Sheet title="Search" onClose={onClose} wide>
      <div className="sticky top-0 z-10 border-b border-border bg-bg/95 p-4 backdrop-blur">
        <div className="relative">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-subtle" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
            placeholder="Shows, artists, festivals, venues, songs"
            className="field h-12 w-full pl-11 text-base"
          />
        </div>
      </div>

      <div className="space-y-5 p-4">
        {indexQ.isLoading && <p className="meta">Loading…</p>}
        {indexQ.isError && !indexQ.data && <p className="meta">Search needs a connection the first time — after that it works offline.</p>}

        {!results && recent.length > 0 && (
          <Group title="Recent">
            <div className="flex flex-wrap gap-2 p-3">
              {recent.map((r) => (
                <button key={r} onClick={() => setQ(r)} className="chip">{r}</button>
              ))}
            </div>
          </Group>
        )}

        {empty && <p className="py-8 text-center text-sm text-text-subtle">Nothing matches “{q}”.</p>}

        {results && results.shows.length > 0 && (
          <Group title="Shows" count={results.shows.length}>
            {results.shows.slice(0, PER_GROUP).map((s) => (
              <Row key={s.slug} to={`/shows/${s.slug}`} onGo={done}
                lead={<DateBlock date={s.date} showYear />}
                title={s.festival ?? s.lineup ?? "Show"}
                sub={[s.festival ? s.lineup : null, s.venue].filter(Boolean).join(" · ")} />
            ))}
          </Group>
        )}
        {results && results.artists.length > 0 && (
          <Group title="Artists" count={results.artists.length}>
            {results.artists.slice(0, PER_GROUP).map((a) => (
              <Row key={a.slug} to={`/artists/${a.slug}`} onGo={done}
                lead={<Avatar url={a.imageUrl} name={a.name} round />}
                title={a.name} sub={`${a.shows} show${a.shows === 1 ? "" : "s"}`} />
            ))}
          </Group>
        )}
        {results && results.festivals.length > 0 && (
          <Group title="Festivals" count={results.festivals.length}>
            {results.festivals.slice(0, PER_GROUP).map((f) => (
              <Row key={f.slug} to={`/festivals/${f.slug}`} onGo={done}
                lead={<Avatar name={f.name} />} title={f.name} sub={f.year ? String(f.year) : undefined} />
            ))}
          </Group>
        )}
        {results && results.venues.length > 0 && (
          <Group title="Venues" count={results.venues.length}>
            {results.venues.slice(0, PER_GROUP).map((v) => (
              <Row key={v.slug} to={`/venues/${v.slug}`} onGo={done}
                lead={<Avatar name={v.name} />} title={v.name}
                sub={[v.city, `${v.shows} show${v.shows === 1 ? "" : "s"}`].filter(Boolean).join(" · ")} />
            ))}
          </Group>
        )}
        {results && results.songs.length > 0 && (
          <Group title="Songs heard live" count={results.songs.length}>
            {results.songs.slice(0, PER_GROUP).map((s) => (
              <Row key={`${s.song}|${s.artist}`} to={`/shows/${s.slug}`} onGo={done}
                lead={<Avatar name="♪" />} title={s.song}
                sub={[s.artist, s.count > 1 ? `heard ${s.count}×` : `heard ${s.date.slice(0, 4)}`].filter(Boolean).join(" · ")} />
            ))}
          </Group>
        )}
      </div>
    </Sheet>
  );
}

function Group({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section>
      <p className="eyebrow mb-2 px-0.5">
        {title}{count != null && count > PER_GROUP && <span className="ml-1.5 text-text-subtle">{PER_GROUP} of {count}</span>}
      </p>
      <div className="card divide-y divide-border overflow-hidden">{children}</div>
    </section>
  );
}

function Row({ to, lead, title, sub, onGo }: { to: string; lead: React.ReactNode; title: string; sub?: string; onGo: () => void }) {
  return (
    <Link to={to} onClick={onGo} className="group flex min-h-[64px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/70 active:bg-surface-2">
      {lead}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold group-hover:text-accent-lime">{title}</p>
        {sub && <p className="truncate text-sm text-text-muted">{sub}</p>}
      </div>
      <Chevron className="text-text-subtle" />
    </Link>
  );
}

function Avatar({ url, name, round = false }: { url?: string | null; name: string; round?: boolean }) {
  return (
    <div className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden bg-surface-2 font-display text-base text-text-muted ${round ? "rounded-full" : "rounded-lg"}`}>
      {url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
    </div>
  );
}
