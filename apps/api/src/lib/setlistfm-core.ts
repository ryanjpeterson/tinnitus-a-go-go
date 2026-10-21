/**
 * setlist.fm API calls and parsing shared by the API and the worker.
 * Pure module (no env/db imports): callers pass the API key and do their own writes.
 */

import { cityKey, normalizeName } from "./names.js";

const API_BASE = "https://api.setlist.fm/rest/1.0";

export interface SfmSong {
  name: string;
  tape?: boolean;
  info?: string;
  cover?: { name: string };
}
export interface SfmSetlist {
  id: string;
  eventDate?: string;
  artist: { name: string };
  venue?: { name?: string; city?: { name?: string } };
  sets?: { set?: { name?: string; encore?: number; song?: SfmSong[] }[] };
}

/** One cached song row, minus the setlist row id the caller fills in. */
export interface SongRow {
  position: number;
  songName: string;
  isCover: boolean;
  coverArtist: string | null;
  notes: string | null;
  setName: string | null;
}

/** Thrown for 429 so callers can back off instead of recording a miss. */
export class SetlistfmRateLimit extends Error {}

/** Accepts a bare id or any setlist.fm URL ending in "<id>.html". */
export function parseSetlistId(idOrUrl: string): string | null {
  const trimmed = idOrUrl.trim();
  if (trimmed.includes("setlist.fm")) {
    return /([a-z0-9]+)\.html(?:[?#].*)?$/i.exec(trimmed)?.[1] ?? null;
  }
  return /^[a-z0-9]+$/i.test(trimmed) ? trimmed : null;
}

async function call<T>(path: string, apiKey: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json", "x-api-key": apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null; // setlist.fm's "nothing found"
  if (res.status === 429) throw new SetlistfmRateLimit("setlist.fm rate limit");
  if (!res.ok) throw new Error(`setlist.fm HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function fetchSetlistById(id: string, apiKey: string): Promise<SfmSetlist | null> {
  return call<SfmSetlist>(`/setlist/${id}`, apiKey);
}

/** Setlists for an artist on one date (setlist.fm wants dd-MM-yyyy). */
export async function searchSetlists(artistName: string, isoDate: string, apiKey: string): Promise<SfmSetlist[]> {
  const [y, m, d] = isoDate.split("-");
  const params = new URLSearchParams({ artistName, date: `${d}-${m}-${y}` });
  const body = await call<{ setlist?: SfmSetlist[] }>(`/search/setlists?${params}`, apiKey);
  return body?.setlist ?? [];
}

function setLabel(set: { name?: string; encore?: number }): string | null {
  if (set.encore) return set.encore > 1 ? `Encore ${set.encore}` : "Encore";
  return set.name?.trim() || null;
}

/** Songs in order, with their set/encore label; intro/outro tapes skipped. */
export function songRows(setlist: SfmSetlist | null): SongRow[] {
  const rows: SongRow[] = [];
  let position = 1;
  for (const set of setlist?.sets?.set ?? []) {
    const label = setLabel(set);
    for (const song of set.song ?? []) {
      if (song.tape) continue;
      rows.push({
        position: position++,
        songName: song.name,
        isCover: !!song.cover,
        coverArtist: song.cover?.name ?? null,
        notes: song.info ?? null,
        setName: label,
      });
    }
  }
  return rows;
}

/**
 * The search result that is this artist's set at this show: same artist name
 * (ignoring case/punctuation/"The"), with songs, at a venue in the same city —
 * or the only candidate when the show's city is unknown.
 */
export function pickMatch(results: SfmSetlist[], artistName: string, city: string | null): SfmSetlist | null {
  const sameArtist = results.filter(
    (r) => normalizeName(r.artist.name) === normalizeName(artistName) && songRows(r).length > 0,
  );
  const want = cityKey(city);
  if (want) return sameArtist.find((r) => cityKey(r.venue?.city?.name) === want) ?? null;
  return sameArtist.length === 1 ? sameArtist[0]! : null;
}
