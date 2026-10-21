/**
 * Find likely duplicate venues and artists, for the admin data cleanup page
 * and the "similar venue exists" warning when adding a show.
 *
 * A pair is suggested when, in the same city (venues), the names are:
 *   same-name         equal after ignoring case, accents, punctuation and a leading "The"
 *   same-core         equal after also dropping generic words (Theatre, Centre, Hall…)
 *   similar-spelling  within a small edit distance (typos)
 * Pairs an admin marked "not a duplicate" are skipped. Pairs are joined into groups.
 */

import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { cityKey, normalizeName, similarity, venueCore } from "./names.js";

export type EntityType = "venue" | "artist";
export type DupReason = "same-name" | "same-core" | "similar-spelling";

const REASON_RANK: Record<DupReason, number> = { "same-name": 0, "same-core": 1, "similar-spelling": 2 };
const MIN_SIMILARITY = 0.88;

export interface DupRecord {
  id: string;
  name: string;
  slug: string;
  /** City for venues, genre for artists. */
  sub: string | null;
  showCount: number;
  firstDate: string | null;
  lastDate: string | null;
}

export interface DupGroup {
  reason: DupReason;
  records: DupRecord[];
}

interface Candidate extends DupRecord {
  key: string;
  core: string;
  city: string;
}

async function loadVenues(): Promise<Candidate[]> {
  const rows = await db.execute<{
    id: string; name: string; slug: string; city: string | null;
    show_count: number; first_date: string | null; last_date: string | null;
  }>(sql`
    select v.id, v.name, v.slug, v.city,
      count(c.id)::int as show_count, min(c.date)::text as first_date, max(c.date)::text as last_date
    from venues v left join concerts c on c.venue_id = v.id
    group by v.id
  `);
  return [...rows].map((r) => ({
    id: r.id, name: r.name, slug: r.slug, sub: r.city, showCount: r.show_count,
    firstDate: r.first_date, lastDate: r.last_date,
    key: normalizeName(r.name), core: venueCore(r.name), city: cityKey(r.city),
  }));
}

async function loadArtists(): Promise<Candidate[]> {
  const rows = await db.execute<{
    id: string; name: string; slug: string; genre: string | null;
    show_count: number; first_date: string | null; last_date: string | null;
  }>(sql`
    select a.id, a.name, a.slug, a.genre,
      count(ca.concert_id)::int as show_count, min(c.date)::text as first_date, max(c.date)::text as last_date
    from artists a
    left join concert_artists ca on ca.artist_id = a.id
    left join concerts c on c.id = ca.concert_id
    group by a.id
  `);
  return [...rows].map((r) => ({
    id: r.id, name: r.name, slug: r.slug, sub: r.genre?.split(",")[0]?.trim() ?? null, showCount: r.show_count,
    firstDate: r.first_date, lastDate: r.last_date,
    key: normalizeName(r.name), core: normalizeName(r.name), city: "",
  }));
}

function pairReason(type: EntityType, a: Candidate, b: Candidate): DupReason | null {
  // Venues must be in the same city (a missing city matches anything).
  if (type === "venue" && a.city && b.city && a.city !== b.city) return null;
  if (a.key && a.key === b.key) return "same-name";
  if (type === "venue" && a.core.length >= 4 && a.core === b.core) return "same-core";
  const minLen = Math.min(a.key.length, b.key.length);
  if (minLen >= 5 && Math.abs(a.key.length - b.key.length) <= 3 && similarity(a.key, b.key) >= MIN_SIMILARITY) {
    return "similar-spelling";
  }
  return null;
}

async function dismissedPairs(type: EntityType): Promise<Set<string>> {
  const rows = await db.execute<{ id_a: string; id_b: string }>(
    sql`select id_a, id_b from duplicate_dismissals where entity_type = ${type}`,
  );
  return new Set([...rows].map((r) => `${r.id_a}|${r.id_b}`));
}

export async function findDuplicates(type: EntityType): Promise<DupGroup[]> {
  const items = type === "venue" ? await loadVenues() : await loadArtists();
  const dismissed = await dismissedPairs(type);

  // Union-find over suggested pairs.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  const best = new Map<string, DupReason>(); // root → strongest reason seen
  for (const it of items) parent.set(it.id, it.id);

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      const reason = pairReason(type, a, b);
      if (!reason) continue;
      const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      if (dismissed.has(`${x}|${y}`)) continue;
      const ra = find(a.id);
      const rb = find(b.id);
      const r = [best.get(ra), best.get(rb), reason]
        .filter((v): v is DupReason => !!v)
        .sort((p, q) => REASON_RANK[p] - REASON_RANK[q])[0]!;
      parent.set(ra, rb);
      best.set(rb, r);
    }
  }

  const groups = new Map<string, DupRecord[]>();
  for (const it of items) {
    const root = find(it.id);
    if (!best.has(root)) continue;
    const { key: _k, core: _c, city: _ci, ...record } = it;
    groups.set(root, [...(groups.get(root) ?? []), record]);
  }

  return [...groups.entries()]
    .filter(([, recs]) => recs.length > 1)
    .map(([root, recs]) => ({
      reason: best.get(root)!,
      // The record with the most shows first — usually the one to keep.
      records: recs.sort((p, q) => q.showCount - p.showCount || p.name.localeCompare(q.name)),
    }))
    .sort((p, q) =>
      REASON_RANK[p.reason] - REASON_RANK[q.reason] ||
      q.records.reduce((n, r) => n + r.showCount, 0) - p.records.reduce((n, r) => n + r.showCount, 0));
}

/**
 * Existing records a new name would duplicate (for the Add show warning).
 * Exact matches are left out: show creation already reuses those.
 */
export async function findSimilar(type: EntityType, name: string, city: string | null): Promise<DupRecord[]> {
  const items = type === "venue" ? await loadVenues() : await loadArtists();
  const probe: Candidate = {
    id: "", name, slug: "", sub: city, showCount: 0, firstDate: null, lastDate: null,
    key: normalizeName(name), core: type === "venue" ? venueCore(name) : normalizeName(name), city: cityKey(city),
  };
  return items
    .filter((it) => it.name.trim().toLowerCase() !== name.trim().toLowerCase() || (type === "venue" && it.city !== probe.city))
    .filter((it) => pairReason(type, probe, it) !== null)
    .sort((a, b) => b.showCount - a.showCount)
    .slice(0, 3)
    .map(({ key: _k, core: _c, city: _ci, ...record }) => record);
}

export async function dismissPair(type: EntityType, ids: string[]): Promise<void> {
  // Dismiss every pair among the given ids.
  const sorted = [...new Set(ids)].sort();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      await db.execute(sql`
        insert into duplicate_dismissals (entity_type, id_a, id_b)
        values (${type}, ${sorted[i]!}, ${sorted[j]!})
        on conflict do nothing
      `);
    }
  }
}
