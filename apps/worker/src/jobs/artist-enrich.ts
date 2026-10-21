/**
 * Artist enrichment job.
 *
 *   Last.fm   bio, genre and MusicBrainz id
 *   Photo     Deezer, then Wikimedia Commons via the MusicBrainz id (Last.fm only
 *             returns placeholder images now)
 *
 * Everything found is stored: text in the artists row, the photo downloaded into
 * MinIO, so pages never load these services directly. `enriched_at` is set on
 * every run so the hourly scheduler moves on to other artists.
 */
import type { Job } from "bullmq";
import type { ArtistEnrichJobData, ArtistEnrichJobResult } from "@tagg/shared";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { db, schema } from "../db.js";
import { s3, bucket } from "../s3.js";
import { env } from "../env.js";
// Pure helper shared with the API (same relative-import arrangement as the schema).
import { findArtistPhoto } from "../../../api/src/lib/artist-photo.js";

const LASTFM_API_BASE = "https://ws.audioscrobbler.com/2.0/";

interface LastfmArtistImage {
  "#text": string;
  size: string;
}

interface LastfmArtistInfo {
  name: string;
  mbid?: string;
  image: LastfmArtistImage[];
  bio: { summary: string; content: string };
  tags: { tag: Array<{ name: string }> };
}

async function fetchLastfmArtist(
  artistName: string,
  mbid: string | null,
): Promise<LastfmArtistInfo | null> {
  if (!env.LASTFM_API_KEY) return null;

  const params = new URLSearchParams({
    method: "artist.getinfo",
    api_key: env.LASTFM_API_KEY,
    format: "json",
    autocorrect: "1",
  });

  if (mbid) {
    params.set("mbid", mbid);
  } else {
    params.set("artist", artistName);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${LASTFM_API_BASE}?${params.toString()}`, {
      signal: controller.signal,
      headers: { "User-Agent": "TinnitusAGoGo/1.0" },
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    const data = (await res.json()) as { error?: number; artist?: LastfmArtistInfo };
    if (data.error) return null;

    return data.artist ?? null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function getBestImageUrl(images: LastfmArtistImage[]): string | null {
  const sizeOrder = ["mega", "extralarge", "large", "medium", "small"];
  for (const size of sizeOrder) {
    const img = images.find((i) => i.size === size && i["#text"]);
    if (img && img["#text"] && !img["#text"].includes("2a96cbd8b46e442fc41c2b86b821562f")) {
      return img["#text"];
    }
  }
  return null;
}

function cleanBio(html: string): string | null {
  if (!html) return null;
  let text = html
    .replace(/<a href="https:\/\/www\.last\.fm\/.*?>Read more on Last\.fm<\/a>\.?/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length < 20 ? null : text;
}

function getGenre(tags: Array<{ name: string }>): string | null {
  if (!tags || tags.length === 0) return null;
  return tags.slice(0, 3).map((t) => t.name).join(", ") || null;
}

/** Download an image and store it as the artist's photo; returns the object key. */
async function storeArtistImage(artistId: string, url: string, previousKey: string | null): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TinnitusBot/1.0)" },
    });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > 15 * 1024 * 1024) return null;

    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
    const isWebp = buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    if (!isJpeg && !isPng && !isWebp) return null;

    const ext = isPng ? ".png" : isWebp ? ".webp" : ".jpg";
    const contentType = isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg";
    const objectKey = `artists/${artistId}/image${ext}`;
    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: objectKey, Body: buffer, ContentType: contentType, ContentLength: buffer.length,
    }));
    if (previousKey && previousKey !== objectKey) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: previousKey })).catch(() => {});
    }
    return objectKey;
  } catch {
    return null;
  }
}

export async function runArtistEnrich(
  job: Job<ArtistEnrichJobData>,
): Promise<ArtistEnrichJobResult> {
  const { artistId, artistName, mbid, overwrite } = job.data;

  // Fetch current artist state
  const artist = await db.query.artists.findFirst({
    where: eq(schema.artists.id, artistId),
  });

  if (!artist) {
    return { artistId, updated: [], error: "Artist not found" };
  }

  // Fetch from Last.fm (may be missing — the photo lookup still runs)
  const info = await fetchLastfmArtist(artistName, mbid);

  const updates: Record<string, unknown> = { enrichedAt: new Date() };
  const updated: string[] = [];

  if (info) {
    const bio = cleanBio(info.bio?.summary ?? info.bio?.content ?? "");
    if (bio && (overwrite || !artist.bio)) {
      updates.bio = bio;
      updated.push("bio");
    }
    const genre = getGenre(info.tags?.tag ?? []);
    if (genre && (overwrite || !artist.genre)) {
      updates.genre = genre;
      updated.push("genre");
    }
    if (info.mbid && (overwrite || !artist.mbid)) {
      // mbid is unique — another artist row may already hold it (a duplicate to merge).
      const holder = await db.query.artists.findFirst({ where: eq(schema.artists.mbid, info.mbid) });
      if (!holder || holder.id === artistId) {
        updates.mbid = info.mbid;
        updated.push("mbid");
      }
    }
  }

  // Photo: Last.fm first if it ever returns a real one, then Deezer / Wikimedia.
  if (overwrite || !artist.imageKey) {
    const candidates: { url: string; source: string | null }[] = [];
    const lastfmUrl = info ? getBestImageUrl(info.image ?? []) : null;
    if (lastfmUrl) candidates.push({ url: lastfmUrl, source: null });
    const found = await findArtistPhoto(artistName, (updates.mbid as string | undefined) ?? artist.mbid ?? mbid);
    if (found) candidates.push(found);

    for (const c of candidates) {
      const stored = await storeArtistImage(artistId, c.url, artist.imageKey);
      if (stored) {
        updates.imageKey = stored;
        updates.imageSource = c.source;
        updated.push("image");
        break;
      }
    }
  }

  // Apply updates
  if (Object.keys(updates).length > 0) {
    await db.update(schema.artists).set(updates).where(eq(schema.artists.id, artistId));
  }

  return { artistId, updated, error: null };
}
