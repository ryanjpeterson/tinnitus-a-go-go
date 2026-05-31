/**
 * Artist enrichment job — fetches bio, genre, and image from Last.fm.
 */
import type { Job } from "bullmq";
import type { ArtistEnrichJobData, ArtistEnrichJobResult } from "@tagg/shared";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { db, schema } from "../db.js";
import { s3, bucket } from "../s3.js";
import { env } from "../env.js";

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

  // Fetch from Last.fm
  const info = await fetchLastfmArtist(artistName, mbid);
  if (!info) {
    return { artistId, updated: [], error: "Not found on Last.fm" };
  }

  const updates: Record<string, unknown> = {};
  const updated: string[] = [];

  // Bio
  const bio = cleanBio(info.bio?.summary ?? info.bio?.content ?? "");
  if (bio && (overwrite || !artist.bio)) {
    updates.bio = bio;
    updated.push("bio");
  }

  // Genre
  const genre = getGenre(info.tags?.tag ?? []);
  if (genre && (overwrite || !artist.genre)) {
    updates.genre = genre;
    updated.push("genre");
  }

  // MBID
  if (info.mbid && (overwrite || !artist.mbid)) {
    updates.mbid = info.mbid;
    updated.push("mbid");
  }

  // Image — Last.fm mostly returns placeholders now; keeping code for when we add Spotify fallback
  const imageUrl = getBestImageUrl(info.image ?? []);
  if (imageUrl && (overwrite || !artist.imageKey)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(imageUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TinnitusBot/1.0)" },
      });
      clearTimeout(timer);

      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const magicBytes = buffer.slice(0, 4);
        const isJpeg = magicBytes[0] === 0xff && magicBytes[1] === 0xd8;
        const isPng = magicBytes[0] === 0x89 && magicBytes[1] === 0x50;
        const isWebp = magicBytes[0] === 0x52 && magicBytes[1] === 0x49;

        if (isJpeg || isPng || isWebp) {
          const ext = isPng ? ".png" : isWebp ? ".webp" : ".jpg";
          const contentType = isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg";
          const objectKey = `artists/${artistId}/image${ext}`;

          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: objectKey,
              Body: buffer,
              ContentType: contentType,
              ContentLength: buffer.length,
            }),
          );

          if (artist.imageKey && artist.imageKey !== objectKey) {
            await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: artist.imageKey })).catch(() => {});
          }

          updates.imageKey = objectKey;
          updated.push("image");
        }
      }
    } catch {
      // Image download failed, continue without it
    }
  }

  // Apply updates
  if (Object.keys(updates).length > 0) {
    await db.update(schema.artists).set(updates).where(eq(schema.artists.id, artistId));
  }

  return { artistId, updated, error: null };
}
