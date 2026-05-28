/**
 * CSV export — reproduces the user's original `Concerts - Shows.csv` format.
 *
 *   GET /users/me/export.csv
 *
 * Columns: type,eventName,date,artist,venue,city,lat,lng,cost,notes
 *
 * One row per (concert × artist), sorted by date ASC then by setOrder ASC within
 * a concert, so a Foo Fighters show with opener Always shows as two rows together.
 * The date is re-formatted as "Weekday,  Month DD, YYYY" to match the source.
 *
 * Requires auth. Streams directly to the response — no temp file on disk.
 */

import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { requireUser } from "../auth/middleware.js";

// ─────────────────────────────────────────────────────────────────────────────
// Date formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "2008-03-22" → "Saturday,  March 22, 2008"
 * The double-space after the comma is intentional — matches the source file.
 */
function formatExportDate(isoDate: string): string {
  // Parse as UTC noon to avoid day-boundary DST shifts.
  const d = new Date(`${isoDate}T12:00:00Z`);
  const weekday = WEEKDAYS[d.getUTCDay()]!;
  const month = MONTHS[d.getUTCMonth()]!;
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  return `${weekday},  ${month} ${day}, ${year}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV cell escaping (RFC 4180)
// ─────────────────────────────────────────────────────────────────────────────

function csvCell(value: string | null | undefined): string {
  const v = value ?? "";
  // Wrap in quotes if the value contains a comma, quote, or newline.
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function csvRow(cells: (string | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

// ─────────────────────────────────────────────────────────────────────────────
// Route plugin
// ─────────────────────────────────────────────────────────────────────────────

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.get("/users/me/export.csv", async (req, reply) => {
    const userId = req.user!.id;

    // Step 1: fetch all concert IDs for this user, sorted by date ASC.
    const attendeeRows = await db
      .select({
        concertId: schema.concertAttendees.concertId,
        status: schema.concertAttendees.status,
        personalNotes: schema.concertAttendees.personalNotes,
        ticketPricePaid: schema.concertAttendees.ticketPricePaid,
        ticketPriceCurrency: schema.concertAttendees.ticketPriceCurrency,
        concertDate: schema.concerts.date,
        concertType: schema.concerts.type,
        venueName: schema.venues.name,
        venueCity: schema.venues.city,
        venueRegion: schema.venues.region,
        venueLat: schema.venues.lat,
        venueLng: schema.venues.lng,
        seriesName: schema.eventSeries.name,
      })
      .from(schema.concertAttendees)
      .innerJoin(schema.concerts, eq(schema.concertAttendees.concertId, schema.concerts.id))
      .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
      .leftJoin(schema.eventSeries, eq(schema.concerts.eventSeriesId, schema.eventSeries.id))
      .where(eq(schema.concertAttendees.userId, userId))
      .orderBy(asc(schema.concerts.date));

    if (attendeeRows.length === 0) {
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", 'attachment; filename="concerts.csv"');
      return reply.send("type,eventName,date,artist,venue,city,lat,lng,cost,notes\n");
    }

    // Step 2: fetch all artists for these concerts.
    const concertIds = [...new Set(attendeeRows.map((r) => r.concertId))];
    const artistRows = await db
      .select({
        concertId: schema.concertArtists.concertId,
        artistName: schema.artists.name,
        role: schema.concertArtists.role,
        setOrder: schema.concertArtists.setOrder,
        appearanceNotes: schema.concertArtists.appearanceNotes,
      })
      .from(schema.concertArtists)
      .innerJoin(schema.artists, eq(schema.concertArtists.artistId, schema.artists.id))
      .where(inArray(schema.concertArtists.concertId, concertIds))
      .orderBy(asc(schema.concertArtists.setOrder));

    // Group artists by concert
    const artistsByConcert = new Map<string, typeof artistRows>();
    for (const a of artistRows) {
      const list = artistsByConcert.get(a.concertId) ?? [];
      list.push(a);
      artistsByConcert.set(a.concertId, list);
    }

    // Step 3: build CSV lines.
    const lines: string[] = ["type,eventName,date,artist,venue,city,lat,lng,cost,notes"];

    for (const concert of attendeeRows) {
      const dateFormatted = formatExportDate(concert.concertDate);
      const csvType = concert.concertType === "festival_day" ? "Festival" : "Concert";
      const eventName = concert.seriesName ?? "null";
      const city =
        concert.venueCity && concert.venueRegion
          ? `${concert.venueCity}, ${concert.venueRegion}`
          : concert.venueCity ?? concert.venueRegion ?? "";

      const artists = artistsByConcert.get(concert.concertId) ?? [];

      if (artists.length === 0) {
        // No artists recorded — emit one row with empty artist column.
        lines.push(
          csvRow([
            csvType,
            eventName,
            dateFormatted,
            "",
            concert.venueName ?? "",
            city,
            concert.venueLat != null ? String(concert.venueLat) : "",
            concert.venueLng != null ? String(concert.venueLng) : "",
            concert.ticketPricePaid != null
              ? (concert.ticketPricePaid / 100).toFixed(2)
              : "",
            "",
          ]),
        );
      } else {
        for (const artist of artists) {
          lines.push(
            csvRow([
              csvType,
              eventName,
              dateFormatted,
              artist.artistName,
              concert.venueName ?? "",
              city,
              concert.venueLat != null ? String(concert.venueLat) : "",
              concert.venueLng != null ? String(concert.venueLng) : "",
              // Use ticket price only on the first artist row to avoid duplication.
              artist === artists[0] && concert.ticketPricePaid != null
                ? (concert.ticketPricePaid / 100).toFixed(2)
                : "",
              artist.appearanceNotes ?? "",
            ]),
          );
        }
      }
    }

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="concerts-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return reply.send(lines.join("\n") + "\n");
  });
}
