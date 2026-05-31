/**
 * Scheduled job that finds artists missing data and queues them for enrichment.
 * Runs every hour, processes up to 50 artists per run.
 */
import { Queue } from "bullmq";
import { sql } from "drizzle-orm";
import { QUEUE_ARTIST_ENRICH, type ArtistEnrichJobData } from "@tagg/shared";
import { db, schema } from "../db.js";
import { redis } from "../redis.js";
import { env } from "../env.js";

const BATCH_SIZE = 50; // Artists to enrich per hour

const enrichQueue = new Queue<ArtistEnrichJobData>(QUEUE_ARTIST_ENRICH, {
  connection: redis,
});

export async function runArtistEnrichScheduler(): Promise<{ queued: number }> {
  // Skip if Last.fm not configured
  if (!env.LASTFM_API_KEY) {
    console.log("[scheduler] artist-enrich skipped: LASTFM_API_KEY not configured");
    return { queued: 0 };
  }

  // Find artists missing bio OR image (prioritize those missing both)
  const artists = await db
    .select({
      id: schema.artists.id,
      name: schema.artists.name,
      mbid: schema.artists.mbid,
      missingCount: sql<number>`
        (CASE WHEN ${schema.artists.bio} IS NULL THEN 1 ELSE 0 END) +
        (CASE WHEN ${schema.artists.imageKey} IS NULL THEN 1 ELSE 0 END)
      `.as("missing_count"),
    })
    .from(schema.artists)
    .where(
      sql`${schema.artists.bio} IS NULL OR ${schema.artists.imageKey} IS NULL`
    )
    .orderBy(sql`missing_count DESC`, schema.artists.createdAt)
    .limit(BATCH_SIZE);

  if (artists.length === 0) {
    console.log("[scheduler] artist-enrich: all artists enriched");
    return { queued: 0 };
  }

  // Queue enrichment jobs
  const jobs = artists.map((a) => ({
    name: QUEUE_ARTIST_ENRICH,
    data: {
      artistId: a.id,
      artistName: a.name,
      mbid: a.mbid,
      overwrite: false,
    },
    opts: {
      jobId: `enrich-${a.id}`,
      // Don't add duplicate jobs for same artist
      attempts: 2,
    },
  }));

  await enrichQueue.addBulk(jobs);

  console.log(`[scheduler] artist-enrich: queued ${jobs.length} artists`);
  return { queued: jobs.length };
}
