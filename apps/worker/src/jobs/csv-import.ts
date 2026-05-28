/**
 * CSV import job — the worker side.
 *
 * Pipeline:
 *   1. Mark imports row as `running`
 *   2. Stream the uploaded CSV from MinIO
 *   3. Parse via `@tagg/shared/csv`
 *   4. Upsert venues / artists / event_series (idempotent on slug)
 *   5. For each grouped show:
 *        - find-or-create the concert row
 *        - insert concert_artists rows (ON CONFLICT DO NOTHING)
 *        - insert the attendee row for the importing user with status derived from date
 *   6. Update imports row progress periodically, then summarize on completion
 *
 * The handler is safe to re-run against the same CSV — concerts are de-duped on
 * (date, venueId), and the join tables have composite PKs that absorb duplicates.
 */
import type { Job } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { slugify, type CsvImportJobData, type CsvImportJobResult } from "@tagg/shared";
import { parseShowsCsv, type ParsedShow } from "@tagg/shared/csv";
import { db, schema } from "../db.js";
import { s3, bucket } from "../s3.js";

const PROGRESS_INTERVAL = 25;
const ERRORS_SAMPLE_CAP = 20;

async function streamToString(body: unknown): Promise<string> {
  if (body == null) throw new Error("S3 GetObject returned empty body");
  // Node ReadableStream
  if (typeof (body as { transformToString?: unknown }).transformToString === "function") {
    return (body as { transformToString: () => Promise<string> }).transformToString();
  }
  // Fallback: assume async iterable
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function statusForDate(date: string): "attended" | "attending" {
  // `date` is YYYY-MM-DD. Lexicographic compare against today's ISO date works fine.
  const today = new Date().toISOString().slice(0, 10);
  return date <= today ? "attended" : "attending";
}

async function downloadCsv(objectKey: string): Promise<string> {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  return streamToString(out.Body);
}

async function markRunning(importId: string): Promise<void> {
  await db
    .update(schema.imports)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(schema.imports.id, importId));
}

async function markFailed(importId: string, message: string): Promise<void> {
  await db
    .update(schema.imports)
    .set({
      status: "failed",
      finishedAt: new Date(),
      errorsSample: sql`coalesce(${schema.imports.errorsSample}, '[]'::jsonb) || ${JSON.stringify([
        { row: 0, message },
      ])}::jsonb`,
      errorCount: sql`${schema.imports.errorCount} + 1`,
    })
    .where(eq(schema.imports.id, importId));
}

interface UpsertResults {
  showsCreated: number;
  showsExisting: number;
  artistsCreated: number;
  venuesCreated: number;
  eventSeriesCreated: number;
  attendeesCreated: number;
}

async function applyParsedShows(
  shows: ParsedShow[],
  userId: string,
  onProgress: (processed: number) => Promise<void>,
): Promise<UpsertResults> {
  const counts: UpsertResults = {
    showsCreated: 0,
    showsExisting: 0,
    artistsCreated: 0,
    venuesCreated: 0,
    eventSeriesCreated: 0,
    attendeesCreated: 0,
  };

  // Local caches to avoid hitting the DB once per row.
  const venueIdBySlug = new Map<string, string>();
  const artistIdBySlug = new Map<string, string>();
  const eventSeriesIdBySlug = new Map<string, string>();

  // First pass — collect unique entities so we can batch-upsert them up front.
  const uniqueVenues = new Map<string, ParsedShow["venue"]>();
  const uniqueArtists = new Map<string, string>(); // slug → name
  const uniqueSeries = new Map<string, ParsedShow["eventSeries"]>();

  for (const show of shows) {
    const vSlug = slugify(`${show.venue.name} ${show.venue.city ?? ""}`);
    uniqueVenues.set(vSlug, show.venue);

    for (const a of show.artists) {
      uniqueArtists.set(slugify(a.name), a.name);
    }

    if (show.eventSeries) {
      uniqueSeries.set(slugify(show.eventSeries.name), show.eventSeries);
    }
  }

  // Upsert venues
  for (const [slug, venue] of uniqueVenues) {
    const [row] = await db
      .insert(schema.venues)
      .values({
        name: venue.name,
        slug,
        city: venue.city,
        region: venue.region,
      })
      .onConflictDoUpdate({
        target: schema.venues.slug,
        set: { name: venue.name, city: venue.city, region: venue.region },
      })
      .returning({ id: schema.venues.id, isNew: sql<boolean>`(xmax = 0)` });
    if (!row) continue;
    venueIdBySlug.set(slug, row.id);
    if (row.isNew) counts.venuesCreated++;
  }

  // Upsert artists
  for (const [slug, name] of uniqueArtists) {
    const [row] = await db
      .insert(schema.artists)
      .values({ name, slug })
      .onConflictDoUpdate({
        target: schema.artists.slug,
        set: { name },
      })
      .returning({ id: schema.artists.id, isNew: sql<boolean>`(xmax = 0)` });
    if (!row) continue;
    artistIdBySlug.set(slug, row.id);
    if (row.isNew) counts.artistsCreated++;
  }

  // Upsert event series
  for (const [slug, series] of uniqueSeries) {
    if (!series) continue;
    const [row] = await db
      .insert(schema.eventSeries)
      .values({ name: series.name, slug, year: series.year })
      .onConflictDoUpdate({
        target: schema.eventSeries.slug,
        set: { name: series.name, year: series.year },
      })
      .returning({ id: schema.eventSeries.id, isNew: sql<boolean>`(xmax = 0)` });
    if (!row) continue;
    eventSeriesIdBySlug.set(slug, row.id);
    if (row.isNew) counts.eventSeriesCreated++;
  }

  // Concert + concert_artists + concert_attendees, one row at a time.
  // 170 shows is small enough that batching wouldn't add much, and per-show progress
  // updates are useful for the UI.
  for (let i = 0; i < shows.length; i++) {
    const show = shows[i];
    if (!show) continue;

    const venueId = venueIdBySlug.get(slugify(`${show.venue.name} ${show.venue.city ?? ""}`));
    const seriesId = show.eventSeries
      ? eventSeriesIdBySlug.get(slugify(show.eventSeries.name)) ?? null
      : null;

    // Find-or-create on (date, venueId). Lookup first so we know whether to count it new.
    const existing = await db.query.concerts.findFirst({
      where: and(eq(schema.concerts.date, show.date), eq(schema.concerts.venueId, venueId ?? "")),
    });

    let concertId: string;
    if (existing) {
      concertId = existing.id;
      counts.showsExisting++;
    } else {
      const [created] = await db
        .insert(schema.concerts)
        .values({
          date: show.date,
          venueId: venueId ?? null,
          eventSeriesId: seriesId,
          type: show.type,
          createdByUserId: userId,
        })
        .returning({ id: schema.concerts.id });
      if (!created) continue;
      concertId = created.id;
      counts.showsCreated++;
    }

    for (const a of show.artists) {
      const artistId = artistIdBySlug.get(slugify(a.name));
      if (!artistId) continue;
      await db
        .insert(schema.concertArtists)
        .values({
          concertId,
          artistId,
          role: "headliner", // refined later in UI
          appearanceNotes: a.appearanceNotes,
        })
        .onConflictDoNothing({ target: [schema.concertArtists.concertId, schema.concertArtists.artistId] });
    }

    const [att] = await db
      .insert(schema.concertAttendees)
      .values({
        userId,
        concertId,
        status: statusForDate(show.date),
        attendedConfirmedAt: statusForDate(show.date) === "attended" ? new Date() : null,
      })
      .onConflictDoNothing({ target: [schema.concertAttendees.userId, schema.concertAttendees.concertId] })
      .returning({ userId: schema.concertAttendees.userId });
    if (att) counts.attendeesCreated++;

    if ((i + 1) % PROGRESS_INTERVAL === 0) {
      await onProgress(i + 1);
    }
  }

  await onProgress(shows.length);
  return counts;
}

export async function runCsvImport(job: Job<CsvImportJobData>): Promise<CsvImportJobResult> {
  const { importId, userId, objectKey } = job.data;

  await markRunning(importId);

  try {
    const text = await downloadCsv(objectKey);
    const { shows, totalRows: rawCsvRowCount, warnings } = parseShowsCsv(text);

    // `totalRows` here is "rows of work to do", which after grouping = shows.length, not the
    // raw CSV line count. Otherwise the progress bar caps at (groupedCount / rawCount) which
    // looks stuck below 100%. The raw CSV count is preserved in `summary.csvRowCount`.
    await db
      .update(schema.imports)
      .set({
        totalRows: shows.length,
        errorCount: warnings.length,
        errorsSample: warnings.slice(0, ERRORS_SAMPLE_CAP),
      })
      .where(eq(schema.imports.id, importId));

    void rawCsvRowCount; // surfaced via summary below

    const counts = await applyParsedShows(shows, userId, async (processed) => {
      await db
        .update(schema.imports)
        .set({ processedRows: processed })
        .where(eq(schema.imports.id, importId));
      await job.updateProgress({ processed, total: shows.length });
    });

    const summary: Record<string, number> = {
      ...counts,
      warnings: warnings.length,
      csvRowCount: rawCsvRowCount,
    };

    await db
      .update(schema.imports)
      .set({
        status: "completed",
        finishedAt: new Date(),
        processedRows: shows.length,
        summary,
      })
      .where(eq(schema.imports.id, importId));

    return { totalRows: rawCsvRowCount, warningCount: warnings.length, ...counts };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(importId, message);
    throw err;
  }
}
