/**
 * Shared queue + job payload types. Imported by both the API (producer) and the worker
 * (consumer). Construction of Queue/Worker instances lives in each app since BullMQ
 * requires a live Redis connection (Node-only) — only the types/names are shared.
 */

export const QUEUE_CSV_IMPORT = "csv-import";
export const QUEUE_MEDIA_PROCESS = "media-process";
export const QUEUE_ARTIST_ENRICH = "artist-enrich";

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
