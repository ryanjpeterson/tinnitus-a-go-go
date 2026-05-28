/**
 * Direct-to-DB CSV import — bypasses MinIO and BullMQ.
 * Useful for the initial data load without the full Docker stack running.
 *
 * Usage:
 *   pnpm --filter @tagg/api import-csv -- --username <user> [--file <path>]
 *
 * The file defaults to `Concerts - Shows.csv` in the monorepo root (two directories
 * up from `apps/api`). Pass `--file /abs/or/relative/path.csv` to override.
 *
 * The script is idempotent: re-running against the same CSV will create no duplicate
 * concerts, artists, or venues (same upsert logic the worker uses).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { parseShowsCsv } from "@tagg/shared/csv";
import { slugify } from "@tagg/shared";
import { db, schema } from "../db/client.js";

// ─────────────────────────────────────────────────────────────────────────────
// CLI arg parsing (no external dep needed for this simple interface)
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { username: string; file: string } {
  const args = argv.slice(2);
  let username: string | undefined;
  let file: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--username" && args[i + 1]) {
      username = args[++i];
    } else if (args[i] === "--file" && args[i + 1]) {
      file = args[++i];
    }
  }

  if (!username) {
    console.error("Error: --username <username> is required.");
    console.error("  pnpm --filter @tagg/api import-csv -- --username yourname");
    process.exit(1);
  }

  const defaultFile = resolve(new URL("../../../../../Concerts - Shows.csv", import.meta.url).pathname);

  return { username, file: file ? resolve(file) : defaultFile };
}

// ─────────────────────────────────────────────────────────────────────────────
// Upsert helpers (mirrors worker/src/jobs/csv-import.ts logic, using api db)
// ─────────────────────────────────────────────────────────────────────────────

function statusForDate(date: string): "attended" | "attending" {
  const today = new Date().toISOString().slice(0, 10);
  return date <= today ? "attended" : "attending";
}

type ParsedShow = Awaited<ReturnType<typeof parseShowsCsv>>["shows"][number];

async function applyShows(
  shows: ParsedShow[],
  userId: string,
): Promise<{
  showsCreated: number;
  showsExisting: number;
  artistsCreated: number;
  venuesCreated: number;
  seriesCreated: number;
  attendeesCreated: number;
}> {
  const counts = {
    showsCreated: 0,
    showsExisting: 0,
    artistsCreated: 0,
    venuesCreated: 0,
    seriesCreated: 0,
    attendeesCreated: 0,
  };

  const venueIdBySlug = new Map<string, string>();
  const artistIdBySlug = new Map<string, string>();
  const seriesIdBySlug = new Map<string, string>();

  // Collect unique entities
  const uniqueVenues = new Map<string, ParsedShow["venue"]>();
  const uniqueArtists = new Map<string, string>(); // slug → name
  const uniqueSeries = new Map<string, NonNullable<ParsedShow["eventSeries"]>>();

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
      .values({ name: venue.name, slug, city: venue.city, region: venue.region })
      .onConflictDoUpdate({
        target: schema.venues.slug,
        set: { name: venue.name, city: venue.city, region: venue.region },
      })
      .returning({ id: schema.venues.id, xmax: sql<string>`xmax::text` });
    if (!row) continue;
    venueIdBySlug.set(slug, row.id);
    if (row.xmax === "0") counts.venuesCreated++;
  }

  // Upsert artists
  for (const [slug, name] of uniqueArtists) {
    const [row] = await db
      .insert(schema.artists)
      .values({ name, slug })
      .onConflictDoUpdate({ target: schema.artists.slug, set: { name } })
      .returning({ id: schema.artists.id, xmax: sql<string>`xmax::text` });
    if (!row) continue;
    artistIdBySlug.set(slug, row.id);
    if (row.xmax === "0") counts.artistsCreated++;
  }

  // Upsert event series
  for (const [slug, series] of uniqueSeries) {
    const [row] = await db
      .insert(schema.eventSeries)
      .values({ name: series.name, slug, year: series.year })
      .onConflictDoUpdate({
        target: schema.eventSeries.slug,
        set: { name: series.name, year: series.year },
      })
      .returning({ id: schema.eventSeries.id, xmax: sql<string>`xmax::text` });
    if (!row) continue;
    seriesIdBySlug.set(slug, row.id);
    if (row.xmax === "0") counts.seriesCreated++;
  }

  // Concerts + junction tables
  for (let i = 0; i < shows.length; i++) {
    const show = shows[i];
    if (!show) continue;

    if ((i + 1) % 25 === 0 || i === shows.length - 1) {
      process.stdout.write(`\r  Processing show ${i + 1}/${shows.length}…`);
    }

    const venueId = venueIdBySlug.get(slugify(`${show.venue.name} ${show.venue.city ?? ""}`));
    const seriesId = show.eventSeries
      ? (seriesIdBySlug.get(slugify(show.eventSeries.name)) ?? null)
      : null;

    // Find or create concert on (date, venueId)
    const existing = venueId
      ? await db.query.concerts.findFirst({
          where: and(
            eq(schema.concerts.date, show.date),
            eq(schema.concerts.venueId, venueId),
          ),
        })
      : null;

    let concertId: string;
    if (existing) {
      concertId = existing.id;
      counts.showsExisting++;
    } else {
      const headliner = show.artists.at(-1)?.name ?? null;
      const [created] = await db
        .insert(schema.concerts)
        .values({
          date: show.date,
          venueId: venueId ?? null,
          eventSeriesId: seriesId,
          type: show.type,
          headlinerHint: headliner,
          createdByUserId: userId,
        })
        .returning({ id: schema.concerts.id });
      if (!created) continue;
      concertId = created.id;
      counts.showsCreated++;
    }

    // concert_artists — role: headliner for last artist in concerts, support for the rest
    for (let j = 0; j < show.artists.length; j++) {
      const a = show.artists[j];
      if (!a) continue;
      const artistId = artistIdBySlug.get(slugify(a.name));
      if (!artistId) continue;
      const isLast = j === show.artists.length - 1;
      const role = isLast ? "headliner" : "support";

      await db
        .insert(schema.concertArtists)
        .values({
          concertId,
          artistId,
          role,
          setOrder: j,
          appearanceNotes: a.appearanceNotes,
        })
        .onConflictDoNothing({
          target: [schema.concertArtists.concertId, schema.concertArtists.artistId],
        });
    }

    // concert_attendees
    const status = statusForDate(show.date);
    const [att] = await db
      .insert(schema.concertAttendees)
      .values({
        userId,
        concertId,
        status,
        attendedConfirmedAt: status === "attended" ? new Date() : null,
      })
      .onConflictDoNothing({
        target: [schema.concertAttendees.userId, schema.concertAttendees.concertId],
      })
      .returning({ userId: schema.concertAttendees.userId });
    if (att) counts.attendeesCreated++;
  }

  process.stdout.write("\n");
  return counts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { username, file } = parseArgs(process.argv);

  console.log(`\nTinnitus A Go Go — CSV importer`);
  console.log(`  User    : ${username}`);
  console.log(`  File    : ${file}\n`);

  // Look up user
  const user = await db.query.users.findFirst({
    where: eq(schema.users.username, username),
  });
  if (!user) {
    console.error(`Error: no user with username "${username}" found in the database.`);
    console.error("  Run the bootstrap-invite script first, then sign up.");
    process.exit(1);
  }

  // Read + parse CSV
  const text = readFileSync(file, "utf8");
  const { shows, totalRows, warnings } = parseShowsCsv(text);

  console.log(`  CSV rows: ${totalRows}  →  grouped into ${shows.length} shows`);
  if (warnings.length > 0) {
    console.log(`  Warnings: ${warnings.length}`);
    warnings.slice(0, 5).forEach((w) => console.log(`    row ${w.row}: ${w.message}`));
    if (warnings.length > 5) console.log(`    … and ${warnings.length - 5} more`);
  }
  console.log();

  const counts = await applyShows(shows, user.id);

  console.log(`\n✔ Import complete`);
  console.log(`  Shows    : ${counts.showsCreated} created, ${counts.showsExisting} already existed`);
  console.log(`  Venues   : ${counts.venuesCreated} created`);
  console.log(`  Artists  : ${counts.artistsCreated} created`);
  console.log(`  Series   : ${counts.seriesCreated} created`);
  console.log(`  Attendees: ${counts.attendeesCreated} added for @${username}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
