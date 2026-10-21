/**
 * Export of the signed-in user's log in three formats, all built from one model:
 *
 *   GET /users/me/export.csv   the original `Concerts - Shows.csv` format (re-importable)
 *   GET /users/me/export.json  every show with venue, status, notes, lineup and setlists
 *   GET /users/me/export.md    a readable log grouped by year, with setlists
 *
 * CSV details:
 * Columns: type,eventName,date,artist,venue,city,lat,lng,cost,notes,setlist
 *
 * `setlist` is that artist's setlist for that show as a JSON string —
 * {"setlistfm":"<id>","sets":[{"name":"Set 1:","songs":["…"]},{"name":"Encore","songs":[…]}]}
 * — or empty. The importer reads columns by name, so the extra column is ignored
 * when a file is imported again.
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
import { ensureCached, loadCachedSets } from "../lib/setlist-cache.js";

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
// Export model — one entry per show the user has logged, oldest first
// ─────────────────────────────────────────────────────────────────────────────

interface ExportArtist {
  name: string;
  role: string;
  notes: string | null;
  setlist: { setlistfm: string | null; sets: { name: string | null; songs: string[] }[] } | null;
}

interface ExportShow {
  concertId: string;
  date: string;
  type: "concert" | "festival_day";
  status: string;
  rating: number | null;
  notes: string | null;
  ticket: { price: number; currency: string | null } | null;
  eventName: string | null;
  venue: { name: string; city: string | null; region: string | null; lat: number | null; lng: number | null } | null;
  artists: ExportArtist[];
}

async function loadExport(userId: string, log: { warn: (obj: object, msg: string) => void }): Promise<ExportShow[]> {
  const attendeeRows = await db
    .select({
      concertId: schema.concertAttendees.concertId,
      status: schema.concertAttendees.status,
      rating: schema.concertAttendees.rating,
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
  if (attendeeRows.length === 0) return [];

  const concertIds = [...new Set(attendeeRows.map((r) => r.concertId))];
  const artistRows = await db
    .select({
      concertId: schema.concertArtists.concertId,
      artistId: schema.concertArtists.artistId,
      artistName: schema.artists.name,
      role: schema.concertArtists.role,
      appearanceNotes: schema.concertArtists.appearanceNotes,
    })
    .from(schema.concertArtists)
    .innerJoin(schema.artists, eq(schema.concertArtists.artistId, schema.artists.id))
    .where(inArray(schema.concertArtists.concertId, concertIds))
    .orderBy(asc(schema.concertArtists.setOrder));

  // Cached setlists, keyed by concert + artist.
  const setlistRows = await db
    .select({
      id: schema.setlists.id,
      concertId: schema.setlists.concertId,
      artistId: schema.setlists.artistId,
      setlistfmId: schema.setlists.setlistfmId,
      fetchedAt: schema.setlists.fetchedAt,
    })
    .from(schema.setlists)
    .where(inArray(schema.setlists.concertId, concertIds));
  await ensureCached(setlistRows, log);
  const cachedSets = await loadCachedSets(setlistRows.map((r) => r.id));
  const setlistFor = new Map<string, ExportArtist["setlist"]>();
  for (const r of setlistRows) {
    const sets = cachedSets.get(r.id) ?? [];
    if (r.artistId && sets.length > 0) {
      setlistFor.set(`${r.concertId}|${r.artistId}`, { setlistfm: r.setlistfmId, sets: sets.map((st) => ({ name: st.name, songs: st.songs })) });
    }
  }

  const artistsByConcert = new Map<string, ExportArtist[]>();
  for (const a of artistRows) {
    const list = artistsByConcert.get(a.concertId) ?? [];
    list.push({
      name: a.artistName,
      role: a.role,
      notes: a.appearanceNotes,
      setlist: setlistFor.get(`${a.concertId}|${a.artistId}`) ?? null,
    });
    artistsByConcert.set(a.concertId, list);
  }

  return attendeeRows.map((r) => ({
    concertId: r.concertId,
    date: r.concertDate,
    type: r.concertType,
    status: r.status,
    rating: r.rating,
    notes: r.personalNotes,
    ticket: r.ticketPricePaid != null ? { price: r.ticketPricePaid / 100, currency: r.ticketPriceCurrency } : null,
    eventName: r.seriesName,
    venue: r.venueName
      ? { name: r.venueName, city: r.venueCity, region: r.venueRegion, lat: r.venueLat, lng: r.venueLng }
      : null,
    artists: artistsByConcert.get(r.concertId) ?? [],
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Serializers
// ─────────────────────────────────────────────────────────────────────────────

const CSV_HEADER = "type,eventName,date,artist,venue,city,lat,lng,cost,notes,setlist";

function toCsv(shows: ExportShow[]): string {
  const lines = [CSV_HEADER];
  for (const show of shows) {
    const city = show.venue?.city && show.venue.region
      ? `${show.venue.city}, ${show.venue.region}`
      : show.venue?.city ?? show.venue?.region ?? "";
    const base = (artist: ExportArtist | null, first: boolean) => [
      show.type === "festival_day" ? "Festival" : "Concert",
      show.eventName ?? "null",
      formatExportDate(show.date),
      artist?.name ?? "",
      show.venue?.name ?? "",
      city,
      show.venue?.lat != null ? String(show.venue.lat) : "",
      show.venue?.lng != null ? String(show.venue.lng) : "",
      // Ticket price only on the first artist row to avoid duplication.
      first && show.ticket ? show.ticket.price.toFixed(2) : "",
      artist?.notes ?? "",
      artist?.setlist ? JSON.stringify(artist.setlist) : "",
    ];
    if (show.artists.length === 0) lines.push(csvRow(base(null, true)));
    show.artists.forEach((a, i) => lines.push(csvRow(base(a, i === 0))));
  }
  return lines.join("\n") + "\n";
}

function toJson(shows: ExportShow[]): string {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), showCount: shows.length, shows: shows.map(({ concertId: _id, ...s }) => s) },
    null,
    2,
  );
}

/** Escape characters Markdown would treat as formatting. */
function md(text: string): string {
  return text.replace(/([\\`*_[\]<>#|])/g, "\\$1");
}

function toMarkdown(shows: ExportShow[]): string {
  const out: string[] = [
    "# Tinnitus A Go Go — concert log",
    "",
    `Exported ${new Date().toISOString().slice(0, 10)} · ${shows.length} show${shows.length === 1 ? "" : "s"}`,
  ];
  // Newest year first, shows within a year in date order.
  const byYear = new Map<string, ExportShow[]>();
  for (const s of shows) byYear.set(s.date.slice(0, 4), [...(byYear.get(s.date.slice(0, 4)) ?? []), s]);
  for (const year of [...byYear.keys()].sort().reverse()) {
    out.push("", `## ${year}`, "");
    for (const s of byYear.get(year)!) {
      const day = new Date(`${s.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      const bill = s.artists.map((a) => a.name).join(" / ");
      const title = s.type === "festival_day" && s.eventName ? `${s.eventName}${bill ? ` (${bill})` : ""}` : bill || s.eventName || "Untitled show";
      const where = s.venue ? [s.venue.name, s.venue.city].filter(Boolean).join(", ") : "";
      const status = s.status === "attended" ? "" : ` *(${s.status})*`;
      out.push(`- **${day}** — ${md(title)}${where ? ` · ${md(where)}` : ""}${status}`);
      if (s.notes) out.push(`  - Notes: ${md(s.notes.replace(/\s+/g, " "))}`);
      for (const a of s.artists) {
        if (!a.setlist) continue;
        const songs = a.setlist.sets
          .map((set) => (set.name ? `${md(set.name.replace(/:$/, ""))}: ` : "") + set.songs.map(md).join(" · "))
          .join(" — ");
        out.push(`  - Setlist, ${md(a.name)}: ${songs}`);
      }
    }
  }
  return out.join("\n") + "\n";
}

// ─────────────────────────────────────────────────────────────────────────────
// Route plugin
// ─────────────────────────────────────────────────────────────────────────────

const FORMATS = {
  csv: { type: "text/csv; charset=utf-8", build: toCsv },
  json: { type: "application/json; charset=utf-8", build: toJson },
  md: { type: "text/markdown; charset=utf-8", build: toMarkdown },
} as const;

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  for (const [ext, fmt] of Object.entries(FORMATS)) {
    app.get(`/users/me/export.${ext}`, async (req, reply) => {
      const shows = await loadExport(req.user!.id, req.log);
      reply.header("Content-Type", fmt.type);
      reply.header(
        "Content-Disposition",
        `attachment; filename="concerts-${new Date().toISOString().slice(0, 10)}.${ext}"`,
      );
      return reply.send(fmt.build(shows));
    });
  }
}
