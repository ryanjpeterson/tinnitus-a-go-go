/**
 * requeue-stuck-photos.ts
 *
 * Finds all photos where variants IS NULL or incomplete (missing medium/large),
 * resets those variants to NULL, clears any stale BullMQ jobs, then adds fresh
 * jobs so the worker reprocesses them with current code.
 *
 * Safe to run multiple times — the obliterate-then-add pattern means old
 * failed jobs never block new ones.
 *
 * Usage (from project root):
 *   docker compose exec api pnpm requeue-stuck
 */

import { db } from "../db/client.js";
import { photos } from "../db/schema.js";
import { mediaProcessQueue } from "../lib/queues.js";
import { isNull, or, sql } from "drizzle-orm";

async function main() {
  console.log("[requeue] Scanning for photos with missing or incomplete variants…");

  // Also catch photos that were processed but only got thumb (width detection bug
  // caused medium/large to be skipped when meta.width returned undefined → 0).
  const stuck = await db
    .select({ id: photos.id, objectKey: photos.objectKey })
    .from(photos)
    .where(
      or(
        isNull(photos.variants),
        // variants exists but is missing the 'medium' key (thumb-only result)
        sql`${photos.variants} IS NOT NULL AND NOT (${photos.variants} ? 'medium')`,
      ),
    );

  if (stuck.length === 0) {
    console.log("[requeue] Nothing to do — all photos have variants.");
    process.exit(0);
  }

  console.log(`[requeue] Found ${stuck.length} photo(s) to reprocess.`);

  // Reset incomplete variants to NULL so the UI shows the processing spinner
  // while the worker regenerates them.
  const stuckIds = stuck.map((p) => p.id);
  await db
    .update(photos)
    .set({ variants: null })
    .where(sql`${photos.id} = ANY(${stuckIds})`);
  console.log(`[requeue] Reset variants to NULL for ${stuck.length} photo(s).`);

  // Remove any existing jobs for these photos (failed/waiting) so BullMQ
  // doesn't deduplicate the fresh adds we're about to make.
  console.log("[requeue] Clearing stale BullMQ jobs…");
  const [waiting, failed, delayed] = await Promise.all([
    mediaProcessQueue.getWaiting(),
    mediaProcessQueue.getFailed(),
    mediaProcessQueue.getDelayed(),
  ]);

  const stuckIdSet = new Set(stuckIds);
  const staleJobs = [...waiting, ...failed, ...delayed].filter((j) => {
    const data = j.data as { photoId?: string };
    return data.photoId && stuckIdSet.has(data.photoId);
  });

  if (staleJobs.length > 0) {
    await Promise.all(staleJobs.map((j) => j.remove()));
    console.log(`[requeue] Removed ${staleJobs.length} stale job(s).`);
  }

  // Add fresh jobs — no fixed jobId so BullMQ never deduplicates.
  console.log("[requeue] Enqueueing fresh jobs…");
  for (const photo of stuck) {
    await mediaProcessQueue.add("process", { photoId: photo.id });
    console.log(`[requeue]   queued photoId=${photo.id}  key=${photo.objectKey}`);
  }

  console.log(`[requeue] Done — ${stuck.length} job(s) added to the media queue.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[requeue] Fatal:", err);
  process.exit(1);
});
