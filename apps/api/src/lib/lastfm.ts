/**
 * Last.fm API client for fetching artist data.
 *
 * API docs: https://www.last.fm/api/show/artist.getInfo
 */

import { env } from "./env.js";
import {
  cleanBio,
  getBestImageUrl,
  getGenreFromTags,
  type LastfmArtistInfo,
} from "./lastfm-core.js";

const LASTFM_API_BASE = "https://ws.audioscrobbler.com/2.0/";

export interface LastfmApiResponse {
  artist?: LastfmArtistInfo;
  error?: number;
  message?: string;
}

export interface ArtistEnrichmentData {
  bio: string | null;
  genre: string | null;
  imageUrl: string | null;
  mbid: string | null;
  listeners: number | null;
  playcount: number | null;
}

/**
 * Check if Last.fm API is configured
 */
export function isLastfmConfigured(): boolean {
  return !!env.LASTFM_API_KEY;
}

/**
 * Fetch artist info from Last.fm by name or MusicBrainz ID
 */
export async function getArtistInfo(
  artistName: string,
  mbid?: string | null,
): Promise<LastfmArtistInfo | null> {
  if (!env.LASTFM_API_KEY) {
    throw new Error("LASTFM_API_KEY is not configured");
  }

  const params = new URLSearchParams({
    method: "artist.getinfo",
    api_key: env.LASTFM_API_KEY,
    format: "json",
    autocorrect: "1", // Auto-correct artist names
  });

  // Prefer MBID if available (more accurate)
  if (mbid) {
    params.set("mbid", mbid);
  } else {
    params.set("artist", artistName);
  }

  const url = `${LASTFM_API_BASE}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "TinnitusAGoGo/1.0 (https://github.com/ryanjpeterson/tinnitus-a-go-go)",
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`Last.fm API returned ${res.status}`);
    }

    const data = (await res.json()) as LastfmApiResponse;

    if (data.error) {
      // Error 6 = Artist not found
      if (data.error === 6) return null;
      throw new Error(`Last.fm error ${data.error}: ${data.message}`);
    }

    return data.artist ?? null;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Last.fm request timed out");
    }
    throw err;
  }
}


/**
 * Fetch and parse artist enrichment data from Last.fm
 */
export async function fetchArtistEnrichment(
  artistName: string,
  mbid?: string | null,
): Promise<ArtistEnrichmentData | null> {
  const info = await getArtistInfo(artistName, mbid);
  if (!info) return null;

  return {
    bio: cleanBio(info.bio?.summary ?? info.bio?.content ?? ""),
    genre: getGenreFromTags(info.tags?.tag ?? []),
    imageUrl: getBestImageUrl(info.image ?? []),
    mbid: info.mbid || null,
    listeners: info.stats?.listeners ? parseInt(info.stats.listeners, 10) : null,
    playcount: info.stats?.playcount ? parseInt(info.stats.playcount, 10) : null,
  };
}
