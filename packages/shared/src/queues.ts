/**
 * Shared queue + job payload types. Imported by both the API (producer) and the worker
 * (consumer). Construction of Queue/Worker instances lives in each app since BullMQ
 * requires a live Redis connection (Node-only) — only the types/names are shared.
 */

export const QUEUE_CSV_IMPORT = "csv-import";
export const QUEUE_MEDIA_PROCESS = "media-process";
export const QUEUE_ARTIST_ENRICH = "artist-enrich";
export const QUEUE_SETLIST_ENRICH = "setlist-enrich";

export interface MediaProcessJobData {
  photoId: string;
}

export interface MediaProcessJobResult {
  photoId: string;
  variants: Record<string, string>;
  width: number | null;
  height: number | null;
  durationSec: number | null;
}

export interface CsvImportJobData {
  importId: string;
  userId: string;
  objectKey: string;
}

export interface CsvImportJobResult {
  totalRows: number;
  showsCreated: number;
  showsExisting: number;
  artistsCreated: number;
  venuesCreated: number;
  eventSeriesCreated: number;
  attendeesCreated: number;
  warningCount: number;
}

export interface ArtistEnrichJobData {
  artistId: string;
  artistName: string;
  mbid: string | null;
  overwrite: boolean;
}

export interface ArtistEnrichJobResult {
  artistId: string;
  updated: string[];
  error: string | null;
}

/**
 * Automatic setlist finder. "scan" picks the next batch of (show, artist)
 * pairs and queues a "lookup" for each.
 */
/** Calls the automatic setlist finder may make per UTC day (setlist.fm's free key allows ~1,440). */
export const SETLIST_FINDER_DAILY_BUDGET = 700;

/** Redis counter of the finder's setlist.fm calls for one UTC day (YYYY-MM-DD). */
export const setlistfmUsageKey = (day: string): string => `setlistfm:finder-calls:${day}`;

export type SetlistEnrichJobData =
  | { kind: "scan" }
  | { kind: "lookup"; concertId: string; artistId: string };

export interface SetlistEnrichJobResult {
  result: "linked" | "no_match" | "taken" | "skipped" | "scanned";
  queued?: number;
}
