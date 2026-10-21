/**
 * Find a photo for an artist from free, keyless sources:
 *
 *   1. Deezer artist search — broad coverage, including small local acts.
 *      Only an exact name match (ignoring case, punctuation, a leading "The")
 *      with a real picture counts; with several, the one with the most fans.
 *   2. Wikidata via the artist's MusicBrainz id — the "image" (P18) on Wikimedia
 *      Commons. Used when Deezer has nothing.
 *
 * Returns a URL to download; callers store the image themselves, so the app
 * never hot-links these sources. Pure module (no env/db) so the worker can use it.
 */

import { normalizeName } from "./names.js";

const UA = "TinnitusAGoGo/1.0 (personal concert log)";

export interface ArtistPhoto {
  url: string;
  /** Human-facing page the photo came from, kept for credit. */
  source: string;
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

interface DeezerArtist { id: number; name: string; link: string; picture_xl?: string; picture_big?: string; nb_fan?: number }

async function fromDeezer(name: string): Promise<ArtistPhoto | null> {
  const body = await getJson<{ data?: DeezerArtist[] }>(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=10`,
  );
  const want = normalizeName(name);
  const best = (body?.data ?? [])
    .filter((a) => normalizeName(a.name) === want)
    // An empty picture hash ("/images/artist//…") is Deezer's placeholder.
    .filter((a) => (a.picture_xl ?? "").length > 0 && !(a.picture_xl ?? "").includes("/artist//"))
    .sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0))[0];
  return best?.picture_xl ? { url: best.picture_xl, source: best.link } : null;
}

async function fromWikidata(mbid: string): Promise<ArtistPhoto | null> {
  const mb = await getJson<{ relations?: { type: string; url?: { resource: string } }[] }>(
    `https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`,
  );
  const qid = mb?.relations?.find((r) => r.type === "wikidata")?.url?.resource.split("/").pop();
  if (!qid) return null;
  const wd = await getJson<{ entities?: Record<string, { claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] } }> }>(
    `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
  );
  const file = wd?.entities?.[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!file) return null;
  const encoded = encodeURIComponent(file.replace(/ /g, "_"));
  return {
    url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=1000`,
    source: `https://commons.wikimedia.org/wiki/File:${encoded}`,
  };
}

export async function findArtistPhoto(name: string, mbid: string | null): Promise<ArtistPhoto | null> {
  try {
    const deezer = await fromDeezer(name);
    if (deezer) return deezer;
  } catch { /* fall through to Wikidata */ }
  if (!mbid) return null;
  try {
    return await fromWikidata(mbid);
  } catch {
    return null;
  }
}
