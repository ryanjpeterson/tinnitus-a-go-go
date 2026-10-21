/**
 * Worker entrypoint.
 * Registers BullMQ Workers for the csv-import, media-process, and artist-enrich queues.
 */
import { Worker } from "bullmq";
import {
  QUEUE_CSV_IMPORT,
  QUEUE_MEDIA_PROCESS,
  QUEUE_ARTIST_ENRICH,
  QUEUE_SETLIST_ENRICH,
  type CsvImportJobData,
  type MediaProcessJobData,
  type ArtistEnrichJobData,
  type SetlistEnrichJobData,
} from "@tagg/shared";
import { redis } from "./redis.js";
import { runCsvImport } from "./jobs/csv-import.js";
import { runMediaProcess } from "./jobs/media-processing.js";
import { runArtistEnrich } from "./jobs/artist-enrich.js";
import { runArtistEnrichScheduler } from "./jobs/artist-enrich-scheduler.js";
import { bindSetlistWorker, runSetlistEnrich, setlistQueue } from "./jobs/setlist-enrich.js";

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

// ── Artist enrichment ─────────────────────────────────────────────────────

const enrichWorker = new Worker<ArtistEnrichJobData>(
  QUEUE_ARTIST_ENRICH,
  async (job) => runArtistEnrich(job),
  {
    connection: redis,
    // Rate limit to avoid hitting Last.fm API limits (30 req/min)
    // Process one at a time with a small delay between jobs
    concurrency: 1,
    limiter: {
      max: 20,
      duration: 60_000, // 20 jobs per minute to stay well under limit
    },
  },
);

enrichWorker.on("ready", () => console.log(`[worker] listening on queue "${QUEUE_ARTIST_ENRICH}"`));
enrichWorker.on("active", (job) =>
  console.log(`[worker] artist-enrich started job=${job.id} artist=${job.data.artistName}`),
);
enrichWorker.on("completed", (job, result) =>
  console.log(`[worker] artist-enrich done   job=${job.id} updated=${result.updated.join(",") || "none"}`),
);
enrichWorker.on("failed", (job, err) =>
  console.error(`[worker] artist-enrich failed  job=${job?.id} ${err.message}`),
);

// ── Automatic setlist finder ───────────────────────────────────────────────

const setlistWorker = new Worker<SetlistEnrichJobData>(
  QUEUE_SETLIST_ENRICH,
  async (job) => runSetlistEnrich(job),
  {
    connection: redis,
    concurrency: 1,
    // setlist.fm documents ~2 requests/second but throttled us at 0.7 s spacing
    // in practice; 1.2 s keeps clear of it (a 429 still pauses the queue).
    limiter: { max: 1, duration: 1200 },
  },
);

bindSetlistWorker(setlistWorker);
setlistWorker.on("ready", () => console.log(`[worker] listening on queue "${QUEUE_SETLIST_ENRICH}"`));
setlistWorker.on("completed", (job, result) => {
  if (result.result === "scanned") console.log(`[worker] setlist scan queued ${result.queued} lookup(s)`);
  else if (result.result === "linked") console.log(`[worker] setlist linked concert=${job.data.kind === "lookup" ? job.data.concertId : ""}`);
});
setlistWorker.on("failed", (job, err) =>
  console.error(`[worker] setlist-enrich failed job=${job?.id} ${err.message}`),
);

// Hourly scan, first one shortly after startup.
const queueSetlistScan = (): void => {
  void setlistQueue
    .add("scan", { kind: "scan" }, { jobId: `setlist-scan-${Date.now()}`, removeOnComplete: true, removeOnFail: true })
    .catch((err) => console.error("[scheduler] setlist scan error:", err));
};
setTimeout(queueSetlistScan, 30_000);
const setlistScanInterval = setInterval(queueSetlistScan, 60 * 60 * 1000);

// ── Scheduled artist enrichment ───────────────────────────────────────────
// Runs every hour, queues up to 50 artists missing bio/image

const ENRICH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let enrichSchedulerInterval: ReturnType<typeof setInterval> | null = null;

const startEnrichScheduler = (): void => {
  // Run immediately on startup, then every hour
  console.log("[scheduler] artist-enrich scheduler starting (runs hourly)");

  // Initial run after 10 seconds (let other services start)
  setTimeout(() => {
    void runArtistEnrichScheduler().catch((err) => {
      console.error("[scheduler] artist-enrich error:", err);
    });
  }, 10_000);

  // Then run every hour
  enrichSchedulerInterval = setInterval(() => {
    void runArtistEnrichScheduler().catch((err) => {
      console.error("[scheduler] artist-enrich error:", err);
    });
  }, ENRICH_INTERVAL_MS);
};

startEnrichScheduler();

// ── Graceful shutdown ──────────────────────────────────────────────────────

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[worker] ${signal} received, shutting down`);
  if (enrichSchedulerInterval) clearInterval(enrichSchedulerInterval);
  clearInterval(setlistScanInterval);
  await Promise.all([csvWorker.close(), mediaWorker.close(), enrichWorker.close(), setlistWorker.close()]);
  await redis.quit();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
