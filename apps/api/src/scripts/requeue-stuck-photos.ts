/**
 * requeue-stuck-photos.ts
 *
 * Finds all photos where variants IS NULL (worker never completed processing),
 * clears any existing failed/waiting BullMQ jobs for those photos, then adds
 * fresh jobs so the worker processes them with current code.
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
import { isNull } from "drizzle-orm";

async function main() {
  console.log("[requeue] Scanning for photos with unprocessed variants…");

  const stuck = await db
    .select({ id: photos.id, objectKey: photos.objectKey })
    .from(photos)
    .where(isNull(photos.variants));

  if (stuck.length === 0) {
    console.log("[requeue] Nothing to do — all photos have variants.");
    process.exit(0);
  }

  console.log(`[requeue] Found ${stuck.length} stuck photo(s).`);

  // Remove any existing jobs for these photos (failed/waiting) so BullMQ
  // doesn't deduplicate the fresh adds we're about to make.
  console.log("[requeue] Clearing stale BullMQ jobs…");
  const [waiting, failed, delayed] = await Promise.all([
    mediaProcessQueue.getWaiting(),
    mediaProcessQueue.getFailed(),
    mediaProcessQueue.getDelayed(),
  ]);

  const stuckIds = new Set(stuck.map((p) => p.id));
  const staleJobs = [...waiting, ...failed, ...delayed].filter((j) => {
    const data = j.data as { photoId?: string };
    return data.photoId && stuckIds.has(data.photoId);
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
