import { Queue } from "bullmq";
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

export const csvImportQueue = new Queue<CsvImportJobData>(QUEUE_CSV_IMPORT, {
  connection: redis,
  defaultJobOptions: {
    attempts: 1, // imports are not retry-safe automatically — surface failures to the UI
    removeOnComplete: { age: 60 * 60 * 24, count: 100 },
    removeOnFail: { age: 60 * 60 * 24 * 7 },
  },
});

export const mediaProcessQueue = new Queue<MediaProcessJobData>(QUEUE_MEDIA_PROCESS, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 60 * 60 * 24, count: 200 },
    removeOnFail: { age: 60 * 60 * 24 * 7 },
  },
});

export const artistEnrichQueue = new Queue<ArtistEnrichJobData>(QUEUE_ARTIST_ENRICH, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 5000 },
    removeOnComplete: { age: 60 * 60 * 24, count: 500 },
    removeOnFail: { age: 60 * 60 * 24 * 3 },
  },
});

// Automatic setlist finder — the worker schedules its own hourly scans; the API
// only adds a scan when an admin presses "Run now".
export const setlistEnrichQueue = new Queue<SetlistEnrichJobData>(QUEUE_SETLIST_ENRICH, { connection: redis });
