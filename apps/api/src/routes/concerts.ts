/**
 * Concert routes — CRUD over the concert + attendee model.
 *
 *   GET  /concerts                list the calling user's concerts (paginated, filterable)
 *   GET  /concerts/stats          aggregate counts by status for the calling user
 *   GET  /concerts/:id            single concert detail (with artists, venue, series)
 *   POST /concerts                create a concert + attendee record in one shot
 *   PATCH /concerts/:id           update the calling user's attendance row
 *   DELETE /concerts/:id          remove the calling user from this concert's attendee list
 *   POST /concerts/:id/flyer      upload or replace the flyer image for a concert
 *   POST /concerts/:id/flyer/url  upload a flyer by fetching it from a URL
 *   DELETE /concerts/:id/flyer    remove the flyer image for a concert
 *
 * All routes require an authenticated session (requireUser preHandler).
 * Concert records are shared; attendee rows are per-user.
 */

import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, desc, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db, schema } from "../db/client.js";
import { s3, bucket } from "../lib/s3.js";
import { env } from "../lib/env.js";
import { requireUser } from "../auth/middleware.js";
import { slugify } from "@tagg/shared";

/** Direct public URL for a MinIO object (bucket is set to anonymous download). */
function mediaUrl(key: string): string {
  const base = env.MINIO_PUBLIC_URL ?? `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`;
  return `${base}/${bucket}/${key}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

const attendanceStatuses = [
  "interested",
  "attending",
  "attended",
  "missed",
  "cancelled",
  "dismissed",
] as const;

const concertArtistRoles = [
  "headliner",
  "co_headliner",
  "support",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Route plugin
// ─────────────────────────────────────────────────────────────────────────────

export async function concertRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  // ── GET /concerts ───────────────────────────────────────────────────────────

  const listQuerySchema = z.object({
    status: z.enum(attendanceStatuses).optional(),
    year: z.coerce.number().int().min(1900).max(2100).optional(),
    q: z.string().max(128).optional(),
    sort: z.enum(["date_desc", "date_asc"]).optional().default("date_desc"),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(1000).optional().default(20),
  });

  app.get("/concerts", async (req, reply) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query parameters.", details: parsed.error.flatten() });
    }

    const { status, year, q, sort, page, limit } = parsed.data;
    const userId = req.user!.id;
    const offset = (page - 1) * limit;

    // Build WHERE clause conditions
    type SQL = ReturnType<typeof eq>;
    const conditions: SQL[] = [eq(schema.concertAttendees.userId, userId)];

    if (status) {
      conditions.push(eq(schema.concertAttendees.status, status));
    }
    if (year) {
      conditions.push(sql`extract(year from ${schema.concerts.date})::int = ${year}` as unknown as SQL);
    }

    const where = conditions.length === 1 ? conditions[0]! : and(...conditions);

    // Build base join
    const baseJoin = db
      .select({
        concertId: schema.concerts.id,
        date: schema.concerts.date,
        type: schema.concerts.type,
        dateIsApproximate: schema.concerts.dateIsApproximate,
        headlinerHint: schema.concerts.headlinerHint,
        flyerKey: schema.concerts.flyerKey,
        venueId: schema.venues.id,
        venueName: schema.venues.name,
        venueSlug: schema.venues.slug,
        venueCity: schema.venues.city,
        venueRegion: schema.venues.region,
        seriesId: schema.eventSeries.id,
        seriesName: schema.eventSeries.name,
        seriesSlug: schema.eventSeries.slug,
        seriesYear: schema.eventSeries.year,
        status: schema.concertAttendees.status,
        rating: schema.concertAttendees.rating,
        personalNotes: schema.concertAttendees.personalNotes,
        ticketPricePaid: schema.concertAttendees.ticketPricePaid,
        ticketPriceCurrency: schema.concertAttendees.ticketPriceCurrency,
        rsvpAt: schema.concertAttendees.rsvpAt,
        attendedConfirmedAt: schema.concertAttendees.attendedConfirmedAt,
      })
      .from(schema.concertAttendees)
      .innerJoin(schema.concerts, eq(schema.concertAttendees.concertId, schema.concerts.id))
      .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
      .leftJoin(schema.eventSeries, eq(schema.concerts.eventSeriesId, schema.eventSeries.id));

    // Apply text search — headliner hint, venue name, event series name
    let filteredJoin = baseJoin.where(where!);

    if (q) {
      const like = `%${q}%`;
      const searchConditions = and(
        where!,
        or(
          ilike(schema.concerts.headlinerHint, like),
          ilike(schema.venues.name, like),
          ilike(schema.eventSeries.name, like),
        ),
      );
      filteredJoin = baseJoin.where(searchConditions!);
    }

    // Count total
    const countQuery = db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.concertAttendees)
      .innerJoin(schema.concerts, eq(schema.concertAttendees.concertId, schema.concerts.id))
      .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
      .leftJoin(schema.eventSeries, eq(schema.concerts.eventSeriesId, schema.eventSeries.id))
      .where(q
        ? and(
            where!,
            or(
              ilike(schema.concerts.headlinerHint, `%${q}%`),
              ilike(schema.venues.name, `%${q}%`),
              ilike(schema.eventSeries.name, `%${q}%`),
            ),
          )
        : where!);

    const orderCol = sort === "date_asc" ? asc(schema.concerts.date) : desc(schema.concerts.date);

    const [concertRows, countRows] = await Promise.all([
      filteredJoin
        .orderBy(orderCol)
        .limit(limit)
        .offset(offset),
      countQuery,
    ]);
    const total = countRows[0]?.total ?? 0;

    if (concertRows.length === 0) {
      return reply.send({ concerts: [], total: total ?? 0, page, totalPages: 0, limit });
    }

    // Fetch artists for these concerts (single query, not N+1)
    const concertIds = concertRows.map((r) => r.concertId);
    const artistRows = await db
      .select({
        concertId: schema.concertArtists.concertId,
        artistId: schema.artists.id,
        artistName: schema.artists.name,
        artistSlug: schema.artists.slug,
        role: schema.concertArtists.role,
        setOrder: schema.concertArtists.setOrder,
        appearanceNotes: schema.concertArtists.appearanceNotes,
      })
      .from(schema.concertArtists)
      .innerJoin(schema.artists, eq(schema.concertArtists.artistId, schema.artists.id))
      .where(inArray(schema.concertArtists.concertId, concertIds))
      .orderBy(schema.concertArtists.setOrder);

    // Group artists by concertId
    const artistsByConcert = new Map<string, typeof artistRows>();
    for (const row of artistRows) {
      const list = artistsByConcert.get(row.concertId) ?? [];
      list.push(row);
      artistsByConcert.set(row.concertId, list);
    }

    const concerts = concertRows.map((r) => {
      const artists = (artistsByConcert.get(r.concertId) ?? []).map((a) => ({
        id: a.artistId,
        name: a.artistName,
        slug: a.artistSlug,
        role: a.role,
        setOrder: a.setOrder,
        appearanceNotes: a.appearanceNotes,
      }));

      return {
        id: r.concertId,
        date: r.date,
        type: r.type,
        dateIsApproximate: r.dateIsApproximate,
        headlinerHint: r.headlinerHint,
        flyerUrl: r.flyerKey ? mediaUrl(r.flyerKey) : null,
        venue: r.venueId
          ? { id: r.venueId, slug: r.venueSlug!, name: r.venueName!, city: r.venueCity, region: r.venueRegion }
          : null,
        eventSeries: r.seriesId
          ? { id: r.seriesId, slug: r.seriesSlug!, name: r.seriesName!, year: r.seriesYear }
          : null,
        attendance: {
          status: r.status,
          rating: r.rating,
          personalNotes: r.personalNotes,
          ticketPricePaid: r.ticketPricePaid,
          ticketPriceCurrency: r.ticketPriceCurrency,
          rsvpAt: r.rsvpAt,
          attendedConfirmedAt: r.attendedConfirmedAt,
        },
        artists,
      };
    });

    return reply.send({
      concerts,
      total: total ?? 0,
      page,
      totalPages: Math.ceil((total ?? 0) / limit),
      limit,
    });
  });

  // ── GET /concerts/stats ─────────────────────────────────────────────────────

  app.get("/concerts/stats", async (req, reply) => {
    const userId = req.user!.id;

    const rows = await db
      .select({
        status: schema.concertAttendees.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.concertAttendees)
      .where(eq(schema.concertAttendees.userId, userId))
      .groupBy(schema.concertAttendees.status);

    const stats: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      stats[r.status] = r.count;
      total += r.count;
    }

    return reply.send({ stats, total });
  });

  // ── GET /concerts/followup ──────────────────────────────────────────────────
  // Returns past concerts (date < today) with actionable status (attending/interested).
  // Used by the daily follow-up prompt.

  app.get("/concerts/followup", async (req, reply) => {
    const userId = req.user!.id;

    type SQL = ReturnType<typeof eq>;
    const conditions: SQL[] = [
      eq(schema.concertAttendees.userId, userId),
      inArray(schema.concertAttendees.status, ["attending", "interested"]) as unknown as SQL,
      sql`${schema.concerts.date} < CURRENT_DATE` as unknown as SQL,
    ];
    const where = and(...conditions);

    const rows = await db
      .select({
        concertId: schema.concerts.id,
        date: schema.concerts.date,
        type: schema.concerts.type,
        dateIsApproximate: schema.concerts.dateIsApproximate,
        headlinerHint: schema.concerts.headlinerHint,
        flyerKey: schema.concerts.flyerKey,
        venueId: schema.venues.id,
        venueName: schema.venues.name,
        venueSlug: schema.venues.slug,
        venueCity: schema.venues.city,
        venueRegion: schema.venues.region,
        seriesId: schema.eventSeries.id,
        seriesName: schema.eventSeries.name,
        seriesSlug: schema.eventSeries.slug,
        seriesYear: schema.eventSeries.year,
        status: schema.concertAttendees.status,
        rating: schema.concertAttendees.rating,
        personalNotes: schema.concertAttendees.personalNotes,
        ticketPricePaid: schema.concertAttendees.ticketPricePaid,
        ticketPriceCurrency: schema.concertAttendees.ticketPriceCurrency,
        rsvpAt: schema.concertAttendees.rsvpAt,
        attendedConfirmedAt: schema.concertAttendees.attendedConfirmedAt,
      })
      .from(schema.concertAttendees)
      .innerJoin(schema.concerts, eq(schema.concertAttendees.concertId, schema.concerts.id))
      .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
      .leftJoin(schema.eventSeries, eq(schema.concerts.eventSeriesId, schema.eventSeries.id))
      .where(where!)
      .orderBy(desc(schema.concerts.date))
      .limit(50);

    if (rows.length === 0) return reply.send({ concerts: [], total: 0 });

    const concertIds = rows.map((r) => r.concertId);
    const artistRows = await db
      .select({
        concertId: schema.concertArtists.concertId,
        artistId: schema.artists.id,
        artistName: schema.artists.name,
        artistSlug: schema.artists.slug,
        role: schema.concertArtists.role,
        setOrder: schema.concertArtists.setOrder,
        appearanceNotes: schema.concertArtists.appearanceNotes,
      })
      .from(schema.concertArtists)
      .innerJoin(schema.artists, eq(schema.concertArtists.artistId, schema.artists.id))
      .where(inArray(schema.concertArtists.concertId, concertIds))
      .orderBy(schema.concertArtists.setOrder);

    const artistsByConcert = new Map<string, typeof artistRows>();
    for (const row of artistRows) {
      const list = artistsByConcert.get(row.concertId) ?? [];
      list.push(row);
      artistsByConcert.set(row.concertId, list);
    }

    const concerts = rows.map((r) => ({
      id: r.concertId,
      date: r.date,
      type: r.type,
      dateIsApproximate: r.dateIsApproximate,
      headlinerHint: r.headlinerHint,
      flyerUrl: r.flyerKey ? mediaUrl(r.flyerKey) : null,
      venue: r.venueId
        ? { id: r.venueId, slug: r.venueSlug!, name: r.venueName!, city: r.venueCity, region: r.venueRegion }
        : null,
      eventSeries: r.seriesId
        ? { id: r.seriesId, slug: r.seriesSlug!, name: r.seriesName!, year: r.seriesYear }
        : null,
      attendance: {
        status: r.status,
        rating: r.rating,
        personalNotes: r.personalNotes,
        ticketPricePaid: r.ticketPricePaid,
        ticketPriceCurrency: r.ticketPriceCurrency,
        rsvpAt: r.rsvpAt,
        attendedConfirmedAt: r.attendedConfirmedAt,
      },
      artists: (artistsByConcert.get(r.concertId) ?? []).map((a) => ({
        id: a.artistId,
        name: a.artistName,
        slug: a.artistSlug,
        role: a.role,
        setOrder: a.setOrder,
        appearanceNotes: a.appearanceNotes,
      })),
    }));

    return reply.send({ concerts, total: concerts.length });
  });

  // ── GET /concerts/:idOrSlug ─────────────────────────────────────────────────
  // Supports both UUID and slug patterns like "osheaga-2025-2025-07-12"

  app.get("/concerts/:idOrSlug", async (req, reply) => {
    const { idOrSlug } = req.params as { idOrSlug: string };
    const userId = req.user!.id;

    // Check if it's a UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

    let concert;
    if (isUuid) {
      concert = await db.query.concerts.findFirst({
        where: eq(schema.concerts.id, idOrSlug),
        with: {
          venue: true,
          eventSeries: true,
          concertArtists: {
            with: { artist: true },
            orderBy: [schema.concertArtists.setOrder],
          },
          concertAttendees: {
            where: eq(schema.concertAttendees.userId, userId),
          },
        },
      });
    } else {
      // Try to parse as slug: "series-slug-YYYY-MM-DD" or "venue-slug-YYYY-MM-DD"
      const dateMatch = idOrSlug.match(/^(.+)-(\d{4}-\d{2}-\d{2})$/);
      if (dateMatch) {
        const [, slugPart, date] = dateMatch;
        // Try series slug first, then venue slug
        const rows = await db
          .select({ concert: schema.concerts })
          .from(schema.concerts)
          .leftJoin(schema.eventSeries, eq(schema.concerts.eventSeriesId, schema.eventSeries.id))
          .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
          .where(
            and(
              eq(schema.concerts.date, date!),
              sql`(${schema.eventSeries.slug} = ${slugPart} OR ${schema.venues.slug} = ${slugPart})`,
            ),
          )
          .limit(1);

        if (rows[0]) {
          concert = await db.query.concerts.findFirst({
            where: eq(schema.concerts.id, rows[0].concert.id),
            with: {
              venue: true,
              eventSeries: true,
              concertArtists: {
                with: { artist: true },
                orderBy: [schema.concertArtists.setOrder],
              },
              concertAttendees: {
                where: eq(schema.concertAttendees.userId, userId),
              },
            },
          });
        }
      }
    }

    if (!concert) {
      return reply.code(404).send({ error: "Concert not found." });
    }

    const attendee = concert.concertAttendees[0] ?? null;

    return reply.send({
      concert: {
        id: concert.id,
        date: concert.date,
        type: concert.type,
        dateIsApproximate: concert.dateIsApproximate,
        headlinerHint: concert.headlinerHint,
        flyerUrl: concert.flyerKey ? mediaUrl(concert.flyerKey) : null,
        flyerHash: concert.flyerHash ?? null,
        eventNotes: concert.eventNotes,
        sourceUrl: concert.sourceUrl,
        venue: concert.venue
          ? {
              id: concert.venue.id,
              slug: concert.venue.slug,
              name: concert.venue.name,
              city: concert.venue.city,
              region: concert.venue.region,
              lat: concert.venue.lat,
              lng: concert.venue.lng,
            }
          : null,
        eventSeries: concert.eventSeries
          ? { id: concert.eventSeries.id, slug: concert.eventSeries.slug, name: concert.eventSeries.name, year: concert.eventSeries.year }
          : null,
        artists: concert.concertArtists.map((ca) => ({
          id: ca.artist.id,
          name: ca.artist.name,
          slug: ca.artist.slug,
          role: ca.role,
          setOrder: ca.setOrder,
          appearanceNotes: ca.appearanceNotes,
        })),
        attendance: attendee
          ? {
              status: attendee.status,
              rating: attendee.rating,
              personalNotes: attendee.personalNotes,
              ticketPricePaid: attendee.ticketPricePaid,
              ticketPriceCurrency: attendee.ticketPriceCurrency,
              rsvpAt: attendee.rsvpAt,
              attendedConfirmedAt: attendee.attendedConfirmedAt,
            }
          : null,
        createdAt: concert.createdAt,
        updatedAt: concert.updatedAt,
      },
    });
  });

  // ── POST /concerts ──────────────────────────────────────────────────────────

  const createBody = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
    dateIsApproximate: z.boolean().optional().default(false),
    type: z.enum(["concert", "festival_day"]).optional().default("concert"),
    venueName: z.string().min(1).max(256),
    venueCity: z.string().max(128).optional(),
    venueRegion: z.string().max(64).optional(),
    eventSeriesName: z.string().max(256).optional(),
    eventSeriesYear: z.number().int().min(1900).max(2100).optional(),
    artists: z
      .array(
        z.object({
          name: z.string().min(1).max(256),
          role: z.enum(concertArtistRoles).optional().default("headliner"),
          setOrder: z.number().int().min(0).optional(),
          appearanceNotes: z.string().max(1024).optional(),
        }),
      )
      .min(1, "At least one artist required."),
    status: z.enum(attendanceStatuses).optional().default("attending"),
    personalNotes: z.string().max(4096).optional(),
    ticketPricePaid: z.number().int().min(0).optional(),
    ticketPriceCurrency: z.string().length(3).optional(),
    eventNotes: z.string().max(4096).optional(),
    sourceUrl: z.string().url().optional(),
  });

  app.post("/concerts", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
    }

    const body = parsed.data;
    const userId = req.user!.id;

    // Upsert venue
    const venueSlug = slugify(`${body.venueName} ${body.venueCity ?? ""}`);
    const [venue] = await db
      .insert(schema.venues)
      .values({
        name: body.venueName,
        slug: venueSlug,
        city: body.venueCity ?? null,
        region: body.venueRegion ?? null,
      })
      .onConflictDoUpdate({
        target: schema.venues.slug,
        set: { name: body.venueName, city: body.venueCity ?? null, region: body.venueRegion ?? null },
      })
      .returning({ id: schema.venues.id });

    // Upsert event series (if festival)
    let seriesId: string | null = null;
    if (body.eventSeriesName) {
      const seriesSlug = slugify(body.eventSeriesName);
      const [series] = await db
        .insert(schema.eventSeries)
        .values({
          name: body.eventSeriesName,
          slug: seriesSlug,
          year: body.eventSeriesYear ?? null,
        })
        .onConflictDoUpdate({
          target: schema.eventSeries.slug,
          set: { name: body.eventSeriesName, year: body.eventSeriesYear ?? null },
        })
        .returning({ id: schema.eventSeries.id });
      if (series) seriesId = series.id;
    }

    // Upsert artists
    const artistIds: string[] = [];
    for (const a of body.artists) {
      const aSlug = slugify(a.name);
      const [artist] = await db
        .insert(schema.artists)
        .values({ name: a.name, slug: aSlug })
        .onConflictDoUpdate({ target: schema.artists.slug, set: { name: a.name } })
        .returning({ id: schema.artists.id });
      if (artist) artistIds.push(artist.id);
    }

    const headliner = body.artists.at(-1)?.name ?? body.artists[0]?.name ?? null;

    // Create concert
    const [concert] = await db
      .insert(schema.concerts)
      .values({
        date: body.date,
        dateIsApproximate: body.dateIsApproximate,
        type: body.type,
        venueId: venue?.id ?? null,
        eventSeriesId: seriesId,
        headlinerHint: headliner,
        eventNotes: body.eventNotes ?? null,
        sourceUrl: body.sourceUrl ?? null,
        createdByUserId: userId,
      })
      .returning({ id: schema.concerts.id });

    if (!concert) {
      return reply.code(500).send({ error: "Failed to create concert." });
    }

    // Insert concert_artists
    for (let i = 0; i < body.artists.length; i++) {
      const a = body.artists[i];
      const artistId = artistIds[i];
      if (!a || !artistId) continue;
      await db.insert(schema.concertArtists).values({
        concertId: concert.id,
        artistId,
        role: a.role,
        setOrder: a.setOrder ?? i,
        appearanceNotes: a.appearanceNotes ?? null,
      });
    }

    // Insert attendee
    const status = body.status;
    await db.insert(schema.concertAttendees).values({
      userId,
      concertId: concert.id,
      status,
      rsvpAt: status !== "attended" ? new Date() : null,
      attendedConfirmedAt: status === "attended" ? new Date() : null,
      personalNotes: body.personalNotes ?? null,
      ticketPricePaid: body.ticketPricePaid ?? null,
      ticketPriceCurrency: body.ticketPriceCurrency ?? null,
    });

    return reply.code(201).send({ concertId: concert.id });
  });

  // ── PATCH /concerts/:id ─────────────────────────────────────────────────────

  const patchBody = z.object({
    // ── Attendance (per-user) fields ──────────────────────────────────────────
    status: z.enum(attendanceStatuses).optional(),
    rating: z.number().int().min(1).max(10).nullable().optional(),
    personalNotes: z.string().max(4096).nullable().optional(),
    ticketPricePaid: z.number().int().min(0).nullable().optional(),
    ticketPriceCurrency: z.string().length(3).nullable().optional(),
    // ── Concert (shared) fields ───────────────────────────────────────────────
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
    dateIsApproximate: z.boolean().optional(),
    type: z.enum(["concert", "festival_day"]).optional(),
    // Pass venueName to upsert-and-link a venue; empty string clears the venue.
    venueName: z.string().max(256).optional(),
    venueCity: z.string().max(128).nullable().optional(),
    venueRegion: z.string().max(64).nullable().optional(),
    // Pass eventSeriesName to upsert-and-link a series; null clears it.
    eventSeriesName: z.string().max(256).nullable().optional(),
    eventSeriesYear: z.number().int().min(1900).max(2100).nullable().optional(),
    eventNotes: z.string().max(4096).nullable().optional(),
    sourceUrl: z.string().url("Must be a valid URL").max(500).nullable().optional(),
  }).refine((d) => Object.keys(d).length > 0, "Provide at least one field to update.");

  app.patch("/concerts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const body = parsed.data;

    // Verify the attendee row exists (gates both attendance + concert-level edits)
    const existing = await db.query.concertAttendees.findFirst({
      where: and(
        eq(schema.concertAttendees.userId, userId),
        eq(schema.concertAttendees.concertId, id),
      ),
    });
    if (!existing) {
      return reply.code(404).send({ error: "Concert not in your list." });
    }

    // ── Attendance updates ────────────────────────────────────────────────────
    const attendeeUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) {
      attendeeUpdates.status = body.status;
      if (body.status === "attended" && !existing.attendedConfirmedAt) {
        attendeeUpdates.attendedConfirmedAt = new Date();
      }
    }
    if (body.rating !== undefined) attendeeUpdates.rating = body.rating;
    if (body.personalNotes !== undefined) attendeeUpdates.personalNotes = body.personalNotes;
    if (body.ticketPricePaid !== undefined) attendeeUpdates.ticketPricePaid = body.ticketPricePaid;
    if (body.ticketPriceCurrency !== undefined) attendeeUpdates.ticketPriceCurrency = body.ticketPriceCurrency;

    const hasAttendeeUpdate = Object.keys(attendeeUpdates).length > 1; // >1 because updatedAt is always set
    if (hasAttendeeUpdate) {
      await db
        .update(schema.concertAttendees)
        .set(attendeeUpdates)
        .where(
          and(
            eq(schema.concertAttendees.userId, userId),
            eq(schema.concertAttendees.concertId, id),
          ),
        );
    }

    // ── Concert-level updates (shared fields) ─────────────────────────────────
    const hasConcertFields =
      body.date !== undefined ||
      body.dateIsApproximate !== undefined ||
      body.type !== undefined ||
      body.venueName !== undefined ||
      body.eventSeriesName !== undefined ||
      body.eventNotes !== undefined ||
      body.sourceUrl !== undefined;

    if (hasConcertFields) {
      const concertUpdates: Record<string, unknown> = { updatedAt: new Date() };

      if (body.date !== undefined) concertUpdates.date = body.date;
      if (body.dateIsApproximate !== undefined) concertUpdates.dateIsApproximate = body.dateIsApproximate;
      if (body.type !== undefined) concertUpdates.type = body.type;
      if (body.eventNotes !== undefined) concertUpdates.eventNotes = body.eventNotes;
      if (body.sourceUrl !== undefined) concertUpdates.sourceUrl = body.sourceUrl;

      // Venue upsert or clear
      if (body.venueName !== undefined) {
        if (!body.venueName.trim()) {
          concertUpdates.venueId = null;
        } else {
          const venueSlug = slugify(`${body.venueName} ${body.venueCity ?? ""}`);
          const [venue] = await db
            .insert(schema.venues)
            .values({
              name: body.venueName,
              slug: venueSlug,
              city: body.venueCity ?? null,
              region: body.venueRegion ?? null,
            })
            .onConflictDoUpdate({
              target: schema.venues.slug,
              set: { name: body.venueName, city: body.venueCity ?? null, region: body.venueRegion ?? null },
            })
            .returning({ id: schema.venues.id });
          if (venue) concertUpdates.venueId = venue.id;
        }
      }

      // Event series upsert or clear
      if (body.eventSeriesName !== undefined) {
        if (!body.eventSeriesName) {
          concertUpdates.eventSeriesId = null;
        } else {
          const seriesSlug = slugify(body.eventSeriesName);
          const [series] = await db
            .insert(schema.eventSeries)
            .values({
              name: body.eventSeriesName,
              slug: seriesSlug,
              year: body.eventSeriesYear ?? null,
            })
            .onConflictDoUpdate({
              target: schema.eventSeries.slug,
              set: { name: body.eventSeriesName, year: body.eventSeriesYear ?? null },
            })
            .returning({ id: schema.eventSeries.id });
          if (series) concertUpdates.eventSeriesId = series.id;
        }
      }

      await db
        .update(schema.concerts)
        .set(concertUpdates)
        .where(eq(schema.concerts.id, id));
    }

    return reply.send({ ok: true });
  });

  // ── PATCH /concerts/batch ──────────────────────────────────────────────────
  // Applies up to 200 attendance updates in a single transaction.
  // Only rows the calling user owns are touched; unknown IDs are silently skipped.

  const batchPatchBody = z.object({
    updates: z
      .array(
        z.object({
          id: z.string().uuid(),
          // ── Attendance (per-user) ─────────────────────────────────────────
          status: z.enum(attendanceStatuses).optional(),
          rating: z.number().int().min(1).max(10).nullable().optional(),
          personalNotes: z.string().max(4096).nullable().optional(),
          ticketPricePaid: z.number().int().min(0).nullable().optional(),
          ticketPriceCurrency: z.string().length(3).nullable().optional(),
          // ── Concert-level (shared) ────────────────────────────────────────
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
          type: z.enum(["concert", "festival_day"]).optional(),
          venueName: z.string().max(256).optional(),
          venueCity: z.string().max(128).nullable().optional(),
        }),
      )
      .min(1)
      .max(200),
  });

  app.patch("/concerts/batch", async (req, reply) => {
    const parsed = batchPatchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const { updates } = parsed.data;
    const ids = updates.map((u) => u.id);

    // Fetch all matching attendee rows for this user in one query
    const existing = await db
      .select({ concertId: schema.concertAttendees.concertId, attendedConfirmedAt: schema.concertAttendees.attendedConfirmedAt })
      .from(schema.concertAttendees)
      .where(and(eq(schema.concertAttendees.userId, userId), inArray(schema.concertAttendees.concertId, ids)));

    const existingSet = new Map(existing.map((r) => [r.concertId, r]));

    // Apply all updates in a single transaction
    await db.transaction(async (tx) => {
      for (const u of updates) {
        const row = existingSet.get(u.id);
        if (!row) continue; // silently skip concerts not in this user's list

        // ── Attendance updates ──────────────────────────────────────────────
        const attendancePatch: Record<string, unknown> = { updatedAt: new Date() };
        if (u.status !== undefined) {
          attendancePatch.status = u.status;
          if (u.status === "attended" && !row.attendedConfirmedAt) {
            attendancePatch.attendedConfirmedAt = new Date();
          }
        }
        if (u.rating !== undefined) attendancePatch.rating = u.rating;
        if (u.personalNotes !== undefined) attendancePatch.personalNotes = u.personalNotes;
        if (u.ticketPricePaid !== undefined) attendancePatch.ticketPricePaid = u.ticketPricePaid;
        if (u.ticketPriceCurrency !== undefined) attendancePatch.ticketPriceCurrency = u.ticketPriceCurrency;

        const hasAttendanceUpdate = Object.keys(attendancePatch).length > 1;
        if (hasAttendanceUpdate) {
          await tx
            .update(schema.concertAttendees)
            .set(attendancePatch)
            .where(and(eq(schema.concertAttendees.userId, userId), eq(schema.concertAttendees.concertId, u.id)));
        }

        // ── Concert-level updates ───────────────────────────────────────────
        const hasConcertUpdate = u.date !== undefined || u.type !== undefined || u.venueName !== undefined;
        if (hasConcertUpdate) {
          const concertPatch: Record<string, unknown> = { updatedAt: new Date() };
          if (u.date !== undefined) concertPatch.date = u.date;
          if (u.type !== undefined) concertPatch.type = u.type;

          if (u.venueName !== undefined) {
            if (!u.venueName.trim()) {
              concertPatch.venueId = null;
            } else {
              const venueSlug = slugify(`${u.venueName} ${u.venueCity ?? ""}`);
              const [venue] = await tx
                .insert(schema.venues)
                .values({
                  name: u.venueName,
                  slug: venueSlug,
                  city: u.venueCity ?? null,
                })
                .onConflictDoUpdate({
                  target: schema.venues.slug,
                  set: { name: u.venueName, city: u.venueCity ?? null },
                })
                .returning({ id: schema.venues.id });
              if (venue) concertPatch.venueId = venue.id;
            }
          }

          await tx
            .update(schema.concerts)
            .set(concertPatch)
            .where(eq(schema.concerts.id, u.id));
        }
      }
    });

    return reply.send({ ok: true, updated: updates.filter((u) => existingSet.has(u.id)).length });
  });

  // ── DELETE /concerts/:id ────────────────────────────────────────────────────
  // Removes the user from the concert's attendee list. Does NOT delete the concert itself.

  app.delete("/concerts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.user!.id;

    const result = await db
      .delete(schema.concertAttendees)
      .where(
        and(
          eq(schema.concertAttendees.userId, userId),
          eq(schema.concertAttendees.concertId, id),
        ),
      )
      .returning({ userId: schema.concertAttendees.userId });

    if (result.length === 0) {
      return reply.code(404).send({ error: "Concert not in your list." });
    }

    return reply.code(204).send();
  });

  // ── POST /concerts/:id/flyer ────────────────────────────────────────────────

  const FLYER_ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

  app.post("/concerts/:id/flyer", async (req, reply) => {
    const { id } = req.params as { id: string };

    const concert = await db.query.concerts.findFirst({
      where: eq(schema.concerts.id, id),
    });
    if (!concert) return reply.code(404).send({ error: "Concert not found." });

    const file = await req.file({ limits: { fileSize: 10 * 1024 * 1024 } });
    if (!file) return reply.code(400).send({ error: "No file uploaded." });

    const mime = file.mimetype.toLowerCase();
    if (!FLYER_ALLOWED.has(mime)) {
      await file.toBuffer().catch(() => undefined);
      return reply.code(415).send({ error: "Only JPEG, PNG, or WebP allowed for flyers." });
    }

    const ext = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
    const objectKey = `concerts/${id}/flyer${ext}`;

    const buffer = await file.toBuffer();
    const flyerHash = createHash("sha256").update(buffer).digest("hex");

    // Duplicate detection: reject if this is the same file as the current flyer
    if (concert.flyerHash && concert.flyerHash === flyerHash) {
      return reply.code(409).send({ error: "This image is already the current flyer." });
    }

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: mime,
          ContentLength: buffer.length,
        }),
      );
    } catch (err) {
      req.log.error({ err }, "MinIO flyer upload failed");
      return reply.code(502).send({ error: "Storage upload failed." });
    }

    // Delete old flyer from MinIO if it exists and has a different key
    if (concert.flyerKey && concert.flyerKey !== objectKey) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: concert.flyerKey })).catch(() => undefined);
    }

    await db
      .update(schema.concerts)
      .set({ flyerKey: objectKey, flyerHash })
      .where(eq(schema.concerts.id, id));

    return reply.send({ flyerUrl: mediaUrl(objectKey) });
  });

  // ── POST /concerts/:id/flyer/url ─────────────────────────────────────────────
  // Upload a flyer by fetching it from a URL

  const flyerUrlBody = z.object({
    url: z.string().url().max(2048),
  });

  app.post("/concerts/:id/flyer/url", async (req, reply) => {
    const { id } = req.params as { id: string };

    const concert = await db.query.concerts.findFirst({
      where: eq(schema.concerts.id, id),
    });
    if (!concert) return reply.code(404).send({ error: "Concert not found." });

    const parsed = flyerUrlBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid URL.", details: parsed.error.flatten() });
    }
    const { url } = parsed.data;

    // Only allow http/https
    if (!/^https?:\/\//i.test(url)) {
      return reply.code(400).send({ error: "Only HTTP/HTTPS URLs are supported." });
    }

    // Fetch the image with timeout
    let buffer: Buffer;
    let contentType: string;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; TinnitusBot/1.0)",
          "Accept": "image/jpeg,image/png,image/webp,image/*",
        },
      });
      clearTimeout(timer);

      if (!res.ok) {
        return reply.code(422).send({ error: `Failed to fetch image: HTTP ${res.status}` });
      }

      contentType = res.headers.get("content-type")?.toLowerCase().split(";")[0]?.trim() ?? "";

      // Validate content type
      if (!FLYER_ALLOWED.has(contentType)) {
        // Try to infer from URL extension as fallback
        const urlLower = url.toLowerCase();
        if (urlLower.includes(".jpg") || urlLower.includes(".jpeg")) {
          contentType = "image/jpeg";
        } else if (urlLower.includes(".png")) {
          contentType = "image/png";
        } else if (urlLower.includes(".webp")) {
          contentType = "image/webp";
        } else {
          return reply.code(415).send({
            error: "URL does not point to a valid image. Only JPEG, PNG, or WebP are allowed."
          });
        }
      }

      const arrayBuffer = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);

      // Check file size (10MB limit)
      if (buffer.length > 10 * 1024 * 1024) {
        return reply.code(413).send({ error: "Image too large. Maximum size is 10MB." });
      }

      // Sanity check: verify it looks like an image (check magic bytes)
      const magicBytes = buffer.slice(0, 4);
      const isJpeg = magicBytes[0] === 0xff && magicBytes[1] === 0xd8;
      const isPng = magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4e && magicBytes[3] === 0x47;
      const isWebp = magicBytes[0] === 0x52 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46 && magicBytes[3] === 0x46;

      if (!isJpeg && !isPng && !isWebp) {
        return reply.code(415).send({
          error: "URL does not point to a valid image file."
        });
      }

      // Update content type based on magic bytes if needed
      if (isJpeg) contentType = "image/jpeg";
      else if (isPng) contentType = "image/png";
      else if (isWebp) contentType = "image/webp";

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("abort")) {
        return reply.code(422).send({ error: "Request timed out while fetching image." });
      }
      return reply.code(422).send({ error: `Could not fetch the image: ${msg}` });
    }

    const ext = contentType === "image/png" ? ".png" : contentType === "image/webp" ? ".webp" : ".jpg";
    const objectKey = `concerts/${id}/flyer${ext}`;

    const flyerHash = createHash("sha256").update(buffer).digest("hex");

    // Duplicate detection
    if (concert.flyerHash && concert.flyerHash === flyerHash) {
      return reply.code(409).send({ error: "This image is already the current flyer." });
    }

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: contentType,
          ContentLength: buffer.length,
        }),
      );
    } catch (err) {
      req.log.error({ err }, "MinIO flyer URL upload failed");
      return reply.code(502).send({ error: "Storage upload failed." });
    }

    // Delete old flyer if different key
    if (concert.flyerKey && concert.flyerKey !== objectKey) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: concert.flyerKey })).catch(() => undefined);
    }

    await db
      .update(schema.concerts)
      .set({ flyerKey: objectKey, flyerHash })
      .where(eq(schema.concerts.id, id));

    return reply.send({ flyerUrl: mediaUrl(objectKey) });
  });

  // ── DELETE /concerts/:id/flyer ──────────────────────────────────────────────

  app.delete("/concerts/:id/flyer", async (req, reply) => {
    const { id } = req.params as { id: string };

    const concert = await db.query.concerts.findFirst({
      where: eq(schema.concerts.id, id),
    });
    if (!concert || !concert.flyerKey) return reply.code(404).send({ error: "No flyer to remove." });

    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: concert.flyerKey })).catch(() => undefined);
    await db.update(schema.concerts).set({ flyerKey: null, flyerHash: null }).where(eq(schema.concerts.id, id));

    return reply.code(204).send();
  });

  // ── PUT /concerts/:id/artists ───────────────────────────────────────────────
  // Atomically replaces the entire lineup for a concert.
  // Any attendee of the concert may edit the shared lineup.

  const putArtistsBody = z.object({
    artists: z
      .array(
        z.object({
          // Provide EITHER artistId (existing) OR artistName (server will upsert).
          artistId: z.string().uuid().optional(),
          artistName: z.string().min(1).max(256).optional(),
          role: z.enum(concertArtistRoles),
          setOrder: z.number().int().min(0).nullable().optional(),
          appearanceNotes: z.string().max(500).nullable().optional(),
        }).refine((d) => d.artistId || d.artistName, "Each entry needs artistId or artistName"),
      )
      .max(50),
  });

  app.put("/concerts/:id/artists", async (req, reply) => {
    const { id: concertId } = req.params as { id: string };
    const parsed = putArtistsBody.safeParse(req.body);
    if (!parsed.success) {
      app.log.warn({ body: req.body, errors: parsed.error.flatten() }, "PUT /concerts/:id/artists validation failed");
      return reply.code(400).send({ error: "Invalid body.", details: parsed.error.flatten() });
    }

    const userId = req.user!.id;

    // Verify user is an attendee (has access to this concert)
    const attendee = await db.query.concertAttendees.findFirst({
      where: and(
        eq(schema.concertAttendees.concertId, concertId),
        eq(schema.concertAttendees.userId, userId),
      ),
    });
    if (!attendee) return reply.code(404).send({ error: "Concert not found." });

    const { artists } = parsed.data;

    // Enforce top-billing exclusivity: headliner and co_headliner cannot coexist
    const hasHeadliner   = artists.some((a) => a.role === "headliner");
    const hasCoHeadliner = artists.some((a) => a.role === "co_headliner");
    if (hasHeadliner && hasCoHeadliner) {
      return reply.code(422).send({
        error: "A lineup cannot mix 'headliner' and 'co_headliner' roles. " +
               "Use one headliner for single top billing, or multiple co-headliners for equal billing.",
      });
    }

    // Validate explicit artistIds exist before doing any writes
    const byIdArtists = artists.filter((a) => a.artistId);
    if (byIdArtists.length > 0) {
      const ids = byIdArtists.map((a) => a.artistId!);
      const found = await db
        .select({ id: schema.artists.id })
        .from(schema.artists)
        .where(inArray(schema.artists.id, ids));
      if (found.length !== ids.length) {
        return reply.code(404).send({ error: "One or more artist IDs not found." });
      }
    }

    // Upsert by-name artists and build index → resolved artistId map
    const resolvedIds = new Map<number, string>();
    for (let i = 0; i < artists.length; i++) {
      const a = artists[i]!;
      if (a.artistId) {
        resolvedIds.set(i, a.artistId);
      } else if (a.artistName) {
        const aSlug = slugify(a.artistName);
        const [artist] = await db
          .insert(schema.artists)
          .values({ name: a.artistName, slug: aSlug })
          .onConflictDoUpdate({ target: schema.artists.slug, set: { name: a.artistName } })
          .returning({ id: schema.artists.id });
        if (artist) resolvedIds.set(i, artist.id);
      }
    }

    // Replace atomically: delete existing rows then insert new set
    await db.transaction(async (tx) => {
      await tx.delete(schema.concertArtists).where(eq(schema.concertArtists.concertId, concertId));
      const rows = artists
        .map((a, i) => ({ a, i }))
        .filter(({ i }) => resolvedIds.has(i))
        .map(({ a, i }) => ({
          concertId,
          artistId: resolvedIds.get(i)!,
          role: a.role,
          setOrder: a.setOrder ?? i,
          appearanceNotes: a.appearanceNotes ?? null,
        }));
      if (rows.length > 0) {
        await tx.insert(schema.concertArtists).values(rows);
      }
    });

    // Keep headlinerHint in sync for fast list queries.
    // For a single headliner: store their name.
    // For co-headliners: join all names with " & ".
    // For support-only lineups: null.
    const headlinerIndices   = artists.map((a, i) => a.role === "headliner"    ? i : -1).filter((i) => i !== -1);
    const coHeadlinerIndices = artists.map((a, i) => a.role === "co_headliner" ? i : -1).filter((i) => i !== -1);

    const topBillingIndices = headlinerIndices.length > 0 ? headlinerIndices : coHeadlinerIndices;

    if (topBillingIndices.length > 0) {
      const topIds = topBillingIndices
        .map((i) => resolvedIds.get(i))
        .filter((id): id is string => id != null);

      if (topIds.length > 0) {
        const artistRows = await db
          .select({ id: schema.artists.id, name: schema.artists.name })
          .from(schema.artists)
          .where(inArray(schema.artists.id, topIds));

        // Preserve original order from the lineup
        const nameMap = new Map(artistRows.map((r) => [r.id, r.name]));
        const hint = topIds.map((id) => nameMap.get(id)).filter(Boolean).join(" & ");

        if (hint) {
          await db
            .update(schema.concerts)
            .set({ headlinerHint: hint })
            .where(eq(schema.concerts.id, concertId));
        }
      }
    } else {
      await db.update(schema.concerts).set({ headlinerHint: null }).where(eq(schema.concerts.id, concertId));
    }

    return reply.send({ ok: true });
  });
}
