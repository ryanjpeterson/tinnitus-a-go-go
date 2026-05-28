/**
 * requeue-stuck-photos.ts
 *
 * Finds all photos where variants IS NULL (worker never completed processing)
 * and re-enqueues a media-process job for each one.
 *
 * Safe to run multiple times — BullMQ deduplicates by jobId and the worker
 * will simply overwrite the variants when it finishes.
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

  console.log(`[requeue] Found ${stuck.length} stuck photo(s). Enqueueing…`);

  for (const photo of stuck) {
    await mediaProcessQueue.add(
      "process",
      { photoId: photo.id },
      {
        // Use photoId as jobId so re-runs don't stack duplicate jobs
        jobId: `requeue-${photo.id}`,
      },
    );
    console.log(`[requeue]   queued photoId=${photo.id}  key=${photo.objectKey}`);
  }

  console.log(`[requeue] Done — ${stuck.length} job(s) added to the media queue.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[requeue] Fatal:", err);
  process.exit(1);
});
