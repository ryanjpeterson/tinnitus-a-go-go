/**
 * Worker entrypoint.
 * Registers BullMQ Workers for the csv-import and media-process queues.
 */
import { Worker } from "bullmq";
import {
  QUEUE_CSV_IMPORT,
  QUEUE_MEDIA_PROCESS,
  type CsvImportJobData,
  type MediaProcessJobData,
} from "@tagg/shared";
import { redis } from "./redis.js";
import { runCsvImport } from "./jobs/csv-import.js";
import { runMediaProcess } from "./jobs/media-processing.js";

// ── CSV import ─────────────────────────────────────────────────────────────

const csvWorker = new Worker<CsvImportJobData>(
  QUEUE_CSV_IMPORT,
  async (job) => runCsvImport(job),
  { connection: redis, concurrency: 1 },
);

csvWorker.on("ready", () => console.log(`[worker] listening on queue "${QUEUE_CSV_IMPORT}"`));
csvWorker.on("active", (job) =>
  console.log(`[worker] csv-import started  job=${job.id} importId=${job.data.importId}`),
);
csvWorker.on("completed", (job, result) =>
  console.log(`[worker] csv-import done     job=${job.id} ${JSON.stringify(result)}`),
);
csvWorker.on("failed", (job, err) =>
  console.error(`[worker] csv-import failed   job=${job?.id} ${err.message}`),
);

// ── Media processing ───────────────────────────────────────────────────────

const mediaWorker = new Worker<MediaProcessJobData>(
  QUEUE_MEDIA_PROCESS,
  async (job) => runMediaProcess(job),
  {
    connection: redis,
    // One media job at a time — Sharp decodes full-res images into raw pixel buffers
    // (~72 MB for a 12 MP photo). Running two simultaneously caused OOM kills that
    // took down Redis (and with it all sessions). Serialise to keep peak memory low.
    concurrency: 1,
  },
);

mediaWorker.on("ready", () => console.log(`[worker] listening on queue "${QUEUE_MEDIA_PROCESS}"`));
mediaWorker.on("active", (job) =>
  console.log(`[worker] media-process started job=${job.id} photoId=${job.data.photoId}`),
);
mediaWorker.on("completed", (job, result) =>
  console.log(
    `[worker] media-process done   job=${job.id} variants=${Object.keys(result.variants).join(",")}`,
  ),
);
mediaWorker.on("failed", (job, err) =>
  console.error(`[worker] media-process failed  job=${job?.id} ${err.message}`),
);

// ── Graceful shutdown ──────────────────────────────────────────────────────

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[worker] ${signal} received, shutting down`);
  await Promise.all([csvWorker.close(), mediaWorker.close()]);
  await redis.quit();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
