/**
 * Festival routes — CRUD for festivals as first-class entities.
 *
 *   GET    /festivals                    list the calling user's festivals (paginated)
 *   GET    /festivals/:slug              festival detail with sets and attendance
 *   POST   /festivals                    create a festival + attendance
 *   PATCH  /festivals/:slug              update festival info
 *   DELETE /festivals/:slug              remove user's attendance from festival
 *   POST   /festivals/:slug/flyer        upload flyer image
 *   POST   /festivals/:slug/flyer/url    upload flyer from URL
 *   DELETE /festivals/:slug/flyer        remove flyer
 *   PUT    /festivals/:slug/sets         replace lineup (sets)
 *   PATCH  /festivals/:slug/attendance   update attendance details
 *
 * All routes require an authenticated session (requireUser preHandler).
 * Festival records are shared; attendee rows are per-user.
 */

import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, desc, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db, schema } from "../db/client.js";
import { s3, bucket } from "../lib/s3.js";
import { env } from "../lib/env.js";
import { requireUser } from "../auth/middleware.js";
import { slugify } from "@tagg/shared";

/** Direct public URL for a MinIO object */
function mediaUrl(key: string): string {
  const base = env.MINIO_PUBLIC_URL ?? `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`;
  return `${base}/${bucket}/${key}`;
}

const attendanceStatuses = [
  "interested",
  "attending",
  "attended",
  "missed",
  "cancelled",
  "dismissed",
] as const;

export async function festivalRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  // ── GET /festivals ─────────────────────────────────────────────────────────
  // List festivals the user has attendance records for

  const listQuerySchema = z.object({
    status: z.enum(attendanceStatuses).optional(),
    year: z.coerce.number().int().min(1900).max(2100).optional(),
    q: z.string().max(128).optional(),
    sort: z.enum(["date_desc", "date_asc", "name_asc"]).optional().default("date_desc"),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  });

  app.get("/festivals", async (req, reply) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query parameters.", details: parsed.error.flatten() });
    }

    const { status, year, q, sort, page, limit } = parsed.data;
    const userId = req.user!.id;
    const offset = (page - 1) * limit;

    type SQL = ReturnType<typeof eq>;
    const conditions: SQL[] = [eq(schema.festivalAttendees.userId, userId)];

    if (status) {
      conditions.push(eq(schema.festivalAttendees.status, status));
    }
    if (year) {
      conditions.push(eq(schema.eventSeries.year, year));
    }
    if (q) {
      conditions.push(ilike(schema.eventSeries.name, `%${q}%`));
    }

    const where = conditions.length === 1 ? conditions[0]! : and(...conditions);

    const orderCol =
      sort === "date_asc" ? asc(schema.eventSeries.startDate) :
      sort === "name_asc" ? asc(schema.eventSeries.name) :
      desc(schema.eventSeries.startDate);

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: schema.eventSeries.id,
          name: schema.eventSeries.name,
          slug: schema.eventSeries.slug,
          year: schema.eventSeries.year,
          startDate: schema.eventSeries.startDate,
          endDate: schema.eventSeries.endDate,
          flyerKey: schema.eventSeries.flyerKey,
          venueId: schema.venues.id,
          venueName: schema.venues.name,
          venueSlug: schema.venues.slug,
          venueCity: schema.venues.city,
          venueRegion: schema.venues.region,
          status: schema.festivalAttendees.status,
          rating: schema.festivalAttendees.rating,
        })
        .from(schema.festivalAttendees)
        .innerJoin(schema.eventSeries, eq(schema.festivalAttendees.festivalId, schema.eventSeries.id))
        .leftJoin(schema.venues, eq(schema.eventSeries.venueId, schema.venues.id))
        .where(where!)
        .orderBy(orderCol)
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.festivalAttendees)
        .innerJoin(schema.eventSeries, eq(schema.festivalAttendees.festivalId, schema.eventSeries.id))
        .where(where!),
    ]);

    const total = countRows[0]?.total ?? 0;

    // Get artist counts for each festival
    const festivalIds = rows.map((r) => r.id);
    const artistCounts = festivalIds.length > 0
      ? await db
          .select({
            festivalId: schema.festivalSets.festivalId,
            count: sql<number>`count(distinct ${schema.festivalSets.artistId})::int`,
          })
          .from(schema.festivalSets)
          .where(inArray(schema.festivalSets.festivalId, festivalIds))
          .groupBy(schema.festivalSets.festivalId)
      : [];

    const artistCountMap = new Map(artistCounts.map((r) => [r.festivalId, r.count]));

    const festivals = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      year: r.year,
      startDate: r.startDate,
      endDate: r.endDate,
      flyerUrl: r.flyerKey ? mediaUrl(r.flyerKey) : null,
      venue: r.venueId
        ? { id: r.venueId, slug: r.venueSlug!, name: r.venueName!, city: r.venueCity, region: r.venueRegion }
        : null,
      artistCount: artistCountMap.get(r.id) ?? 0,
      attendance: {
        status: r.status,
        rating: r.rating,
      },
    }));

    return reply.send({
      festivals,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    });
  });

  // ── GET /festivals/:slug ───────────────────────────────────────────────────
  // Festival detail with sets and user's attendance

  app.get("/festivals/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const userId = req.user!.id;

    const festival = await db.query.eventSeries.findFirst({
      where: eq(schema.eventSeries.slug, slug),
      with: {
        venue: true,
      },
    });

    if (!festival) {
      return reply.code(404).send({ error: "Festival not found." });
    }

    // Get user's attendance
    const attendee = await db.query.festivalAttendees.findFirst({
      where: and(
        eq(schema.festivalAttendees.festivalId, festival.id),
        eq(schema.festivalAttendees.userId, userId),
      ),
    });

    // Get sets with artist info
    const setsRows = await db
      .select({
        id: schema.festivalSets.id,
        performanceDate: schema.festivalSets.performanceDate,
        stageName: schema.festivalSets.stageName,
        setOrder: schema.festivalSets.setOrder,
        appearanceNotes: schema.festivalSets.appearanceNotes,
        artistId: schema.artists.id,
        artistName: schema.artists.name,
        artistSlug: schema.artists.slug,
        artistImageKey: schema.artists.imageKey,
      })
      .from(schema.festivalSets)
      .innerJoin(schema.artists, eq(schema.festivalSets.artistId, schema.artists.id))
      .where(eq(schema.festivalSets.festivalId, festival.id))
      .orderBy(schema.festivalSets.performanceDate, schema.festivalSets.setOrder);

    const sets = setsRows.map((s) => ({
      id: s.id,
      performanceDate: s.performanceDate,
      stageName: s.stageName,
      setOrder: s.setOrder,
      appearanceNotes: s.appearanceNotes,
      artist: {
        id: s.artistId,
        name: s.artistName,
        slug: s.artistSlug,
        imageUrl: s.artistImageKey ? mediaUrl(s.artistImageKey) : null,
      },
    }));

    // Group sets by date for easier frontend rendering
    const setsByDate = new Map<string, typeof sets>();
    for (const set of sets) {
      const dateKey = set.performanceDate ?? "unknown";
      const list = setsByDate.get(dateKey) ?? [];
      list.push(set);
      setsByDate.set(dateKey, list);
    }

    // Find concert IDs for each date (from legacy festival_day concerts)
    const concertsByDate = new Map<string, { id: string; slug: string | null }>();
    const dateKeys = Array.from(setsByDate.keys()).filter((d) => d !== "unknown");
    if (dateKeys.length > 0) {
      const concertRows = await db
        .select({
          id: schema.concerts.id,
          date: schema.concerts.date,
          venueSlug: schema.venues.slug,
          seriesSlug: schema.eventSeries.slug,
        })
        .from(schema.concerts)
        .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
        .leftJoin(schema.eventSeries, eq(schema.concerts.eventSeriesId, schema.eventSeries.id))
        .where(
          and(
            eq(schema.concerts.eventSeriesId, festival.id),
            eq(schema.concerts.type, "festival_day"),
            inArray(schema.concerts.date, dateKeys),
          ),
        );
      for (const row of concertRows) {
        // Generate a readable slug from series-date
        const slug = row.seriesSlug
          ? `${row.seriesSlug}-${row.date}`
          : row.venueSlug
          ? `${row.venueSlug}-${row.date}`
          : null;
        concertsByDate.set(row.date, { id: row.id, slug });
      }
    }

    return reply.send({
      festival: {
        id: festival.id,
        name: festival.name,
        slug: festival.slug,
        year: festival.year,
        startDate: festival.startDate,
        endDate: festival.endDate,
        flyerUrl: festival.flyerKey ? mediaUrl(festival.flyerKey) : null,
        flyerHash: festival.flyerHash,
        eventNotes: festival.eventNotes,
        sourceUrl: festival.sourceUrl,
        venue: festival.venue
          ? {
              id: festival.venue.id,
              slug: festival.venue.slug,
              name: festival.venue.name,
              city: festival.venue.city,
              region: festival.venue.region,
              country: festival.venue.country,
              lat: festival.venue.lat,
              lng: festival.venue.lng,
            }
          : null,
        createdAt: festival.createdAt,
        updatedAt: festival.updatedAt,
      },
      sets,
      setsByDate: Object.fromEntries(setsByDate),
      concertsByDate: Object.fromEntries(concertsByDate),
      attendance: attendee
        ? {
            status: attendee.status,
            personalNotes: attendee.personalNotes,
            rating: attendee.rating,
            ticketPricePaid: attendee.ticketPricePaid,
            ticketPriceCurrency: attendee.ticketPriceCurrency,
            createdAt: attendee.createdAt,
            updatedAt: attendee.updatedAt,
          }
        : null,
      stats: {
        totalArtists: new Set(sets.map((s) => s.artist.id)).size,
        totalDays: setsByDate.size,
      },
    });
  });

  // ── POST /festivals ────────────────────────────────────────────────────────
  // Create a new festival

  const createBody = z.object({
    name: z.string().min(1).max(256),
    year: z.number().int().min(1900).max(2100).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
    venueName: z.string().min(1).max(256).optional(),
    venueCity: z.string().max(128).optional(),
    venueRegion: z.string().max(64).optional(),
    eventNotes: z.string().max(4096).optional(),
    sourceUrl: z.string().url().max(2048).optional(),
    status: z.enum(attendanceStatuses).optional().default("interested"),
    personalNotes: z.string().max(4096).optional(),
    ticketPricePaid: z.number().int().min(0).optional(),
    ticketPriceCurrency: z.string().length(3).optional(),
    // Initial lineup
    artists: z
      .array(
        z.object({
          name: z.string().min(1).max(256),
          performanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          stageName: z.string().max(128).optional(),
          setOrder: z.number().int().min(0).optional(),
          appearanceNotes: z.string().max(1024).optional(),
        }),
      )
      .optional(),
  });

  app.post("/festivals", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
    }

    const body = parsed.data;
    const userId = req.user!.id;

    // Auto-extract year from startDate if not provided
    const year = body.year ?? (body.startDate ? parseInt(body.startDate.slice(0, 4), 10) : null);

    // Upsert venue if provided
    let venueId: string | null = null;
    if (body.venueName) {
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
      if (venue) venueId = venue.id;
    }

    // Create festival (event_series)
    const festivalSlug = slugify(body.name);
    const [festival] = await db
      .insert(schema.eventSeries)
      .values({
        name: body.name,
        slug: festivalSlug,
        year,
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
        venueId,
        eventNotes: body.eventNotes ?? null,
        sourceUrl: body.sourceUrl ?? null,
      })
      .onConflictDoUpdate({
        target: schema.eventSeries.slug,
        set: {
          name: body.name,
          year,
          startDate: body.startDate ?? null,
          endDate: body.endDate ?? null,
          venueId,
          eventNotes: body.eventNotes ?? null,
          sourceUrl: body.sourceUrl ?? null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: schema.eventSeries.id });

    if (!festival) {
      return reply.code(500).send({ error: "Failed to create festival." });
    }

    // Create attendance record
    await db
      .insert(schema.festivalAttendees)
      .values({
        userId,
        festivalId: festival.id,
        status: body.status,
        personalNotes: body.personalNotes ?? null,
        ticketPricePaid: body.ticketPricePaid ?? null,
        ticketPriceCurrency: body.ticketPriceCurrency ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.festivalAttendees.userId, schema.festivalAttendees.festivalId],
        set: {
          status: body.status,
          personalNotes: body.personalNotes ?? null,
          ticketPricePaid: body.ticketPricePaid ?? null,
          ticketPriceCurrency: body.ticketPriceCurrency ?? null,
          updatedAt: new Date(),
        },
      });

    // Add initial lineup if provided
    if (body.artists && body.artists.length > 0) {
      for (let i = 0; i < body.artists.length; i++) {
        const a = body.artists[i]!;
        const artistSlug = slugify(a.name);
        const [artist] = await db
          .insert(schema.artists)
          .values({ name: a.name, slug: artistSlug })
          .onConflictDoUpdate({ target: schema.artists.slug, set: { name: a.name } })
          .returning({ id: schema.artists.id });

        if (artist) {
          await db.insert(schema.festivalSets).values({
            festivalId: festival.id,
            artistId: artist.id,
            performanceDate: a.performanceDate ?? null,
            stageName: a.stageName ?? null,
            setOrder: a.setOrder ?? i,
            appearanceNotes: a.appearanceNotes ?? null,
          });
        }
      }
    }

    return reply.code(201).send({ festivalId: festival.id, slug: festivalSlug });
  });

  // ── PATCH /festivals/:slug ─────────────────────────────────────────────────
  // Update festival info

  const patchBody = z.object({
    name: z.string().min(1).max(256).optional(),
    year: z.number().int().min(1900).max(2100).nullable().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    venueName: z.string().max(256).optional(),
    venueCity: z.string().max(128).nullable().optional(),
    venueRegion: z.string().max(64).nullable().optional(),
    eventNotes: z.string().max(4096).nullable().optional(),
    sourceUrl: z.string().url().max(2048).nullable().optional(),
  }).refine((d) => Object.keys(d).length > 0, "Provide at least one field to update.");

  app.patch("/festivals/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const body = parsed.data;

    // Verify user has attendance (is allowed to edit)
    const festival = await db.query.eventSeries.findFirst({
      where: eq(schema.eventSeries.slug, slug),
    });
    if (!festival) {
      return reply.code(404).send({ error: "Festival not found." });
    }

    const attendee = await db.query.festivalAttendees.findFirst({
      where: and(
        eq(schema.festivalAttendees.festivalId, festival.id),
        eq(schema.festivalAttendees.userId, userId),
      ),
    });
    if (!attendee) {
      return reply.code(403).send({ error: "Not attending this festival." });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body.name !== undefined) {
      updates.name = body.name;
      updates.slug = slugify(body.name);
    }
    if (body.year !== undefined) updates.year = body.year;
    if (body.startDate !== undefined) updates.startDate = body.startDate;
    if (body.endDate !== undefined) updates.endDate = body.endDate;
    if (body.eventNotes !== undefined) updates.eventNotes = body.eventNotes;
    if (body.sourceUrl !== undefined) updates.sourceUrl = body.sourceUrl;

    // Venue upsert or clear
    if (body.venueName !== undefined) {
      if (!body.venueName.trim()) {
        updates.venueId = null;
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
        if (venue) updates.venueId = venue.id;
      }
    }

    const [updated] = await db
      .update(schema.eventSeries)
      .set(updates)
      .where(eq(schema.eventSeries.id, festival.id))
      .returning();

    return reply.send({
      festival: {
        id: updated?.id ?? festival.id,
        name: updated?.name ?? festival.name,
        slug: updated?.slug ?? festival.slug,
        year: updated?.year ?? festival.year,
      },
    });
  });

  // ── DELETE /festivals/:slug ────────────────────────────────────────────────
  // Remove user's attendance from festival

  app.delete("/festivals/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const userId = req.user!.id;

    const festival = await db.query.eventSeries.findFirst({
      where: eq(schema.eventSeries.slug, slug),
    });
    if (!festival) {
      return reply.code(404).send({ error: "Festival not found." });
    }

    const result = await db
      .delete(schema.festivalAttendees)
      .where(
        and(
          eq(schema.festivalAttendees.userId, userId),
          eq(schema.festivalAttendees.festivalId, festival.id),
        ),
      )
      .returning({ userId: schema.festivalAttendees.userId });

    if (result.length === 0) {
      return reply.code(404).send({ error: "Not attending this festival." });
    }

    return reply.code(204).send();
  });

  // ── PATCH /festivals/:slug/attendance ──────────────────────────────────────
  // Update user's attendance details

  const attendanceBody = z.object({
    status: z.enum(attendanceStatuses).optional(),
    rating: z.number().int().min(1).max(10).nullable().optional(),
    personalNotes: z.string().max(4096).nullable().optional(),
    ticketPricePaid: z.number().int().min(0).nullable().optional(),
    ticketPriceCurrency: z.string().length(3).nullable().optional(),
  }).refine((d) => Object.keys(d).length > 0, "Provide at least one field to update.");

  app.patch("/festivals/:slug/attendance", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const parsed = attendanceBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const body = parsed.data;

    const festival = await db.query.eventSeries.findFirst({
      where: eq(schema.eventSeries.slug, slug),
    });
    if (!festival) {
      return reply.code(404).send({ error: "Festival not found." });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) updates.status = body.status;
    if (body.rating !== undefined) updates.rating = body.rating;
    if (body.personalNotes !== undefined) updates.personalNotes = body.personalNotes;
    if (body.ticketPricePaid !== undefined) updates.ticketPricePaid = body.ticketPricePaid;
    if (body.ticketPriceCurrency !== undefined) updates.ticketPriceCurrency = body.ticketPriceCurrency;

    const result = await db
      .update(schema.festivalAttendees)
      .set(updates)
      .where(
        and(
          eq(schema.festivalAttendees.userId, userId),
          eq(schema.festivalAttendees.festivalId, festival.id),
        ),
      )
      .returning();

    if (result.length === 0) {
      return reply.code(404).send({ error: "Not attending this festival." });
    }

    return reply.send({ ok: true });
  });

  // ── PUT /festivals/:slug/sets ──────────────────────────────────────────────
  // Replace the entire lineup

  const putSetsBody = z.object({
    sets: z
      .array(
        z.object({
          artistId: z.string().uuid().optional(),
          artistName: z.string().min(1).max(256).optional(),
          performanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
          stageName: z.string().max(128).nullable().optional(),
          setOrder: z.number().int().min(0).nullable().optional(),
          appearanceNotes: z.string().max(1024).nullable().optional(),
        }).refine((d) => d.artistId || d.artistName, "Each entry needs artistId or artistName"),
      )
      .max(200),
  });

  app.put("/festivals/:slug/sets", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const parsed = putSetsBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body.", details: parsed.error.flatten() });
    }

    const userId = req.user!.id;

    const festival = await db.query.eventSeries.findFirst({
      where: eq(schema.eventSeries.slug, slug),
    });
    if (!festival) {
      return reply.code(404).send({ error: "Festival not found." });
    }

    // Verify user has attendance
    const attendee = await db.query.festivalAttendees.findFirst({
      where: and(
        eq(schema.festivalAttendees.festivalId, festival.id),
        eq(schema.festivalAttendees.userId, userId),
      ),
    });
    if (!attendee) {
      return reply.code(403).send({ error: "Not attending this festival." });
    }

    const { sets } = parsed.data;

    // Validate explicit artistIds
    const byIdArtists = sets.filter((s) => s.artistId);
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

    // Resolve all artist IDs (upsert by name)
    const resolvedIds = new Map<number, string>();
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i]!;
      if (s.artistId) {
        resolvedIds.set(i, s.artistId);
      } else if (s.artistName) {
        const artistSlug = slugify(s.artistName);
        const [artist] = await db
          .insert(schema.artists)
          .values({ name: s.artistName, slug: artistSlug })
          .onConflictDoUpdate({ target: schema.artists.slug, set: { name: s.artistName } })
          .returning({ id: schema.artists.id });
        if (artist) resolvedIds.set(i, artist.id);
      }
    }

    // Replace atomically
    await db.transaction(async (tx) => {
      await tx.delete(schema.festivalSets).where(eq(schema.festivalSets.festivalId, festival.id));
      const rows = sets
        .map((s, i) => ({ s, i }))
        .filter(({ i }) => resolvedIds.has(i))
        .map(({ s, i }) => ({
          festivalId: festival.id,
          artistId: resolvedIds.get(i)!,
          performanceDate: s.performanceDate ?? null,
          stageName: s.stageName ?? null,
          setOrder: s.setOrder ?? i,
          appearanceNotes: s.appearanceNotes ?? null,
        }));
      if (rows.length > 0) {
        await tx.insert(schema.festivalSets).values(rows);
      }
    });

    return reply.send({ ok: true, count: resolvedIds.size });
  });

  // ── POST /festivals/:slug/flyer ────────────────────────────────────────────
  // Upload flyer image

  const FLYER_ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

  app.post("/festivals/:slug/flyer", async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const festival = await db.query.eventSeries.findFirst({
      where: eq(schema.eventSeries.slug, slug),
    });
    if (!festival) return reply.code(404).send({ error: "Festival not found." });

    const file = await req.file({ limits: { fileSize: 10 * 1024 * 1024 } });
    if (!file) return reply.code(400).send({ error: "No file uploaded." });

    const mime = file.mimetype.toLowerCase();
    if (!FLYER_ALLOWED.has(mime)) {
      await file.toBuffer().catch(() => undefined);
      return reply.code(415).send({ error: "Only JPEG, PNG, or WebP allowed for flyers." });
    }

    const ext = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
    const objectKey = `festivals/${festival.id}/flyer${ext}`;

    const buffer = await file.toBuffer();
    const flyerHash = createHash("sha256").update(buffer).digest("hex");

    if (festival.flyerHash && festival.flyerHash === flyerHash) {
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
      req.log.error({ err }, "MinIO festival flyer upload failed");
      return reply.code(502).send({ error: "Storage upload failed." });
    }

    // Delete old flyer if different key
    if (festival.flyerKey && festival.flyerKey !== objectKey) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: festival.flyerKey })).catch(() => undefined);
    }

    await db
      .update(schema.eventSeries)
      .set({ flyerKey: objectKey, flyerHash, updatedAt: new Date() })
      .where(eq(schema.eventSeries.id, festival.id));

    return reply.send({ flyerUrl: mediaUrl(objectKey) });
  });

  // ── POST /festivals/:slug/flyer/url ────────────────────────────────────────
  // Upload flyer from URL

  const flyerUrlBody = z.object({
    url: z.string().url().max(2048),
  });

  app.post("/festivals/:slug/flyer/url", async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const festival = await db.query.eventSeries.findFirst({
      where: eq(schema.eventSeries.slug, slug),
    });
    if (!festival) return reply.code(404).send({ error: "Festival not found." });

    const parsed = flyerUrlBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid URL.", details: parsed.error.flatten() });
    }
    const { url } = parsed.data;

    if (!/^https?:\/\//i.test(url)) {
      return reply.code(400).send({ error: "Only HTTP/HTTPS URLs are supported." });
    }

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

      if (!FLYER_ALLOWED.has(contentType)) {
        const urlLower = url.toLowerCase();
        if (urlLower.includes(".jpg") || urlLower.includes(".jpeg")) {
          contentType = "image/jpeg";
        } else if (urlLower.includes(".png")) {
          contentType = "image/png";
        } else if (urlLower.includes(".webp")) {
          contentType = "image/webp";
        } else {
          return reply.code(415).send({ error: "URL does not point to a valid image." });
        }
      }

      const arrayBuffer = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);

      if (buffer.length > 10 * 1024 * 1024) {
        return reply.code(413).send({ error: "Image too large. Maximum size is 10MB." });
      }

      // Verify magic bytes
      const magicBytes = buffer.slice(0, 4);
      const isJpeg = magicBytes[0] === 0xff && magicBytes[1] === 0xd8;
      const isPng = magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4e && magicBytes[3] === 0x47;
      const isWebp = magicBytes[0] === 0x52 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46 && magicBytes[3] === 0x46;

      if (!isJpeg && !isPng && !isWebp) {
        return reply.code(415).send({ error: "URL does not point to a valid image file." });
      }

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
    const objectKey = `festivals/${festival.id}/flyer${ext}`;

    const flyerHash = createHash("sha256").update(buffer).digest("hex");

    if (festival.flyerHash && festival.flyerHash === flyerHash) {
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
      req.log.error({ err }, "MinIO festival flyer URL upload failed");
      return reply.code(502).send({ error: "Storage upload failed." });
    }

    if (festival.flyerKey && festival.flyerKey !== objectKey) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: festival.flyerKey })).catch(() => undefined);
    }

    await db
      .update(schema.eventSeries)
      .set({ flyerKey: objectKey, flyerHash, updatedAt: new Date() })
      .where(eq(schema.eventSeries.id, festival.id));

    return reply.send({ flyerUrl: mediaUrl(objectKey) });
  });

  // ── DELETE /festivals/:slug/flyer ──────────────────────────────────────────

  app.delete("/festivals/:slug/flyer", async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const festival = await db.query.eventSeries.findFirst({
      where: eq(schema.eventSeries.slug, slug),
    });
    if (!festival || !festival.flyerKey) return reply.code(404).send({ error: "No flyer to remove." });

    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: festival.flyerKey })).catch(() => undefined);
    await db
      .update(schema.eventSeries)
      .set({ flyerKey: null, flyerHash: null, updatedAt: new Date() })
      .where(eq(schema.eventSeries.id, festival.id));

    return reply.code(204).send();
  });
}
