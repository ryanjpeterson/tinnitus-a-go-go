/**
 * setlist.fm song cache.
 *
 * A linked setlist used to be just a setlist.fm id; every view had to call
 * setlist.fm again to show songs. Songs are now copied into setlist_songs when
 * a setlist is linked, and older links are filled in lazily the first time a
 * page reads them. Setlists for past shows rarely change, so the copy is kept
 * until the link is changed.
 */

import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { env } from "./env.js";

const API_BASE = "https://api.setlist.fm/rest/1.0";
// Lazy fills per request — keeps a page with many unfetched links from stalling.
const MAX_LAZY_FILLS = 4;

interface SfmSong {
  name: string;
  tape?: boolean;
  info?: string;
  cover?: { name: string };
}
interface SfmSetlist {
  id: string;
  sets?: { set?: { name?: string; encore?: number; song?: SfmSong[] }[] };
}

/** The shape the show page renders (same as a live setlist.fm result's `sets`). */
export interface CachedSet {
  name: string | null;
  encore: number | null;
  songs: string[];
}

/** Accepts a bare id or any setlist.fm URL ending in "<id>.html". */
export function parseSetlistId(idOrUrl: string): string | null {
  const trimmed = idOrUrl.trim();
  if (trimmed.includes("setlist.fm")) {
    return /([a-z0-9]+)\.html(?:[?#].*)?$/i.exec(trimmed)?.[1] ?? null;
  }
  return /^[a-z0-9]+$/i.test(trimmed) ? trimmed : null;
}

async function fetchSetlist(id: string): Promise<SfmSetlist | null> {
  const res = await fetch(`${API_BASE}/setlist/${id}`, {
    headers: { Accept: "application/json", "x-api-key": env.SETLISTFM_API_KEY! },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`setlist.fm HTTP ${res.status}`);
  return (await res.json()) as SfmSetlist;
}

function setLabel(set: { name?: string; encore?: number }): string | null {
  if (set.encore) return set.encore > 1 ? `Encore ${set.encore}` : "Encore";
  return set.name?.trim() || null;
}

/**
 * Fetch one setlist from setlist.fm and replace its cached songs.
 * Returns false when there is no API key or setlist.fm has no such setlist.
 */
export async function cacheSetlist(setlistRowId: string, setlistfmId: string | null): Promise<boolean> {
  if (!env.SETLISTFM_API_KEY || !setlistfmId) return false;
  const id = parseSetlistId(setlistfmId);
  if (!id) return false;

  const data = await fetchSetlist(id);
  const rows: (typeof schema.setlistSongs.$inferInsert)[] = [];
  let position = 1;
  for (const set of data?.sets?.set ?? []) {
    const label = setLabel(set);
    for (const song of set.song ?? []) {
      if (song.tape) continue; // intro/outro tapes aren't part of the set
      rows.push({
        setlistId: setlistRowId,
        position: position++,
        songName: song.name,
        isCover: !!song.cover,
        coverArtist: song.cover?.name ?? null,
        notes: song.info ?? null,
        setName: label,
      });
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(schema.setlistSongs).where(eq(schema.setlistSongs.setlistId, setlistRowId));
    if (rows.length > 0) await tx.insert(schema.setlistSongs).values(rows);
    // Stamp even when setlist.fm had nothing, so it isn't re-requested on every view.
    await tx.update(schema.setlists).set({ fetchedAt: new Date() }).where(eq(schema.setlists.id, setlistRowId));
  });
  return data !== null;
}

/** Fill the cache for linked setlists that have never been fetched (a few per call). */
export async function ensureCached(
  rows: { id: string; setlistfmId: string | null; fetchedAt: Date | null }[],
  log?: { warn: (obj: object, msg: string) => void },
): Promise<void> {
  if (!env.SETLISTFM_API_KEY) return;
  const missing = rows.filter((r) => r.setlistfmId && !r.fetchedAt).slice(0, MAX_LAZY_FILLS);
  for (const r of missing) {
    try {
      await cacheSetlist(r.id, r.setlistfmId);
    } catch (err) {
      // Leave fetchedAt empty so the next view tries again.
      log?.warn({ err, setlistId: r.id }, "setlist.fm cache fill failed");
    }
  }
}

/** Cached songs grouped back into sets, keyed by setlist row id. */
export async function loadCachedSets(setlistIds: string[]): Promise<Map<string, CachedSet[]>> {
  const out = new Map<string, CachedSet[]>();
  if (setlistIds.length === 0) return out;
  const songs = await db
    .select({
      setlistId: schema.setlistSongs.setlistId,
      songName: schema.setlistSongs.songName,
      setName: schema.setlistSongs.setName,
    })
    .from(schema.setlistSongs)
    .where(inArray(schema.setlistSongs.setlistId, setlistIds))
    .orderBy(asc(schema.setlistSongs.setlistId), asc(schema.setlistSongs.position));

  for (const s of songs) {
    const sets = out.get(s.setlistId) ?? [];
    const last = sets[sets.length - 1];
    if (last && last.name === s.setName) {
      last.songs.push(s.songName);
    } else {
      const encore = s.setName?.startsWith("Encore") ? Number(s.setName.split(" ")[1] ?? 1) || 1 : null;
      sets.push({ name: s.setName, encore, songs: [s.songName] });
    }
    out.set(s.setlistId, sets);
  }
  return out;
}
