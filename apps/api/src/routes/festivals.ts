/**
 * Festival routes — CRUD for festivals as first-class entities.
 *
 *   GET    /festivals                    list the calling user's festivals (paginated)
 *   GET    /festivals/:slug              festival detail: its days, lineup and attendance
 *   POST   /festivals                    create a festival and its days
 *   PATCH  /festivals/:slug              update festival info
 *   DELETE /festivals/:slug              ungroup: the festival goes, its shows stay (and keep its flyer)
 *   POST   /festivals/:slug/shows        add existing shows to the festival
 *   DELETE /festivals/:slug/shows/:id    take a show out (an emptied festival is removed)
 *   POST   /festivals/:slug/flyer        upload flyer image
 *   POST   /festivals/:slug/flyer/url    upload flyer from URL
 *   DELETE /festivals/:slug/flyer        remove flyer
 *   PUT    /festivals/:slug/sets         replace the lineup across its days
 *   PATCH  /festivals/:slug/attendance   set attendance on every day at once
 *
 * A festival is a container of shows (concerts.type = 'festival_day'), grouped
 * by date into days; the shows hold the lineup and attendance (see
 * lib/festival-days.ts). A festival whose last show leaves is removed by the
 * database (migration 0018).
 */

import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, desc, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { db, schema } from "../db/client.js";
import { s3, bucket } from "../lib/s3.js";
import { env } from "../lib/env.js";
import { requireAdmin } from "../auth/middleware.js";
import { dateRange, ensureFestivalDay, festivalAttendance, festivalDayNumber, festivalLength, loadFestivalDays, loggedDates } from "../lib/festival-days.js";
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
] as const;

export async function festivalRoutes(app: FastifyInstance): Promise<void> {
  // NOTE: Per-route auth now. GET endpoints are public, write endpoints require admin.

  // ── GET /festivals ─────────────────────────────────────────────────────────
  // Public endpoint: list all festivals

  const listQuerySchema = z.object({
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

    const { year, q, sort, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    // Show all festivals (no user filtering)
    type SQL = ReturnType<typeof eq>;
    const conditions: SQL[] = [];

    if (year) {
      conditions.push(eq(schema.eventSeries.year, year));
    }
    if (q) {
      conditions.push(ilike(schema.eventSeries.name, `%${q}%`));
    }

    const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0]! : and(...conditions);

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
        })
        .from(schema.eventSeries)
        .leftJoin(schema.venues, eq(schema.eventSeries.venueId, schema.venues.id))
        .where(where)
        .orderBy(orderCol)
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.eventSeries)
        .where(where),
    ]);

    const total = countRows[0]?.total ?? 0;

    // Artist counts and the caller's attendance, from each festival's days
    const days = await loadFestivalDays(rows.map((r) => r.id), req.user?.id ?? null);

    const festivals = rows.map((r) => {
      const own = days.filter((d) => d.festivalId === r.id);
      return {
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
        artistCount: new Set(own.flatMap((d) => d.artists.map((a) => a.id))).size,
        dayCount: festivalLength(r, loggedDates(own)),
        attendance: festivalAttendance(own, festivalLength(r, loggedDates(own))),
      };
    });

    return reply.send({
      festivals,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    });
  });

  // ── GET /festivals/:slug ───────────────────────────────────────────────────
  // Public endpoint: festival detail with sets

  app.get("/festivals/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const festival = await db.query.eventSeries.findFirst({
      where: eq(schema.eventSeries.slug, slug),
      with: {
        venue: true,
      },
    });

    if (!festival) {
      return reply.code(404).send({ error: "Festival not found." });
    }

    // Lineup and attendance come from the festival's day shows.
    const days = await loadFestivalDays([festival.id], req.user?.id ?? null);

    const sets = days.flatMap((d) =>
      d.artists.map((a) => ({
        id: `${d.id}:${a.id}`,
        concertId: d.id,
        performanceDate: d.date,
        stageName: a.stageName,
        setOrder: a.setOrder,
        appearanceNotes: a.appearanceNotes,
        artist: { id: a.id, name: a.name, slug: a.slug, imageUrl: a.imageKey ? mediaUrl(a.imageKey) : null },
      })),
    );

    // Days in date order, each with its shows (a date can hold several
    // separately logged sets) — including shows with no artists yet. Days are
    // numbered by the festival's dates: the 20th of a festival that starts on
    // the 16th is Day 5, even if it's the only day logged.
    const dates = [...new Set(days.map((d) => d.date))];
    const setsByDate: Record<string, typeof sets> = {};
    const concertsByDate: Record<string, { id: string; slug: string; status: string | null; number: number }> = {};
    const dayList = dates.map((date, i) => {
      const shows = days.filter((d) => d.date === date);
      const number = festivalDayNumber(festival, date, i + 1);
      setsByDate[date] = sets.filter((s) => s.performanceDate === date);
      // The date's first show, for links that need one.
      concertsByDate[date] = { id: shows[0]!.id, slug: shows[0]!.slug, status: shows[0]!.status, number };
      return {
        date,
        number,
        shows: shows.map((sh) => ({
          id: sh.id,
          slug: sh.slug,
          status: sh.status,
          artists: sh.artists.map((a) => a.name),
        })),
      };
    });
    const length = festivalLength(festival, dates.length);

    // The same festival in other years (same brand), newest first.
    const otherYears = festival.brand
      ? await db
          .select({
            name: schema.eventSeries.name,
            slug: schema.eventSeries.slug,
            year: schema.eventSeries.year,
            startDate: schema.eventSeries.startDate,
            flyerKey: schema.eventSeries.flyerKey,
          })
          .from(schema.eventSeries)
          .where(and(
            sql`lower(${schema.eventSeries.brand}) = lower(${festival.brand})`,
            sql`${schema.eventSeries.id} <> ${festival.id}`,
          ))
          .orderBy(sql`${schema.eventSeries.startDate} desc nulls last`)
      : [];

    return reply.send({
      festival: {
        id: festival.id,
        name: festival.name,
        slug: festival.slug,
        year: festival.year,
        brand: festival.brand,
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
      setsByDate,
      concertsByDate,
      days: dayList,
      attendance: festivalAttendance(days, length),
      otherYears: otherYears.map(({ flyerKey, ...o }) => ({ ...o, flyerUrl: flyerKey ? mediaUrl(flyerKey) : null })),
      stats: {
        totalArtists: new Set(sets.map((s) => s.artist.id)).size,
        totalDays: length,
        loggedDays: dates.length,
        shows: days.length,
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
    // Group these existing shows into the festival instead of creating days.
    concertIds: z.array(z.string().uuid()).min(1).max(300).optional(),
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

  app.post("/festivals", { preHandler: [requireAdmin] }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
    }

    const body = parsed.data;
    const userId = req.user!.id;

    // Grouping existing shows: the festival takes its dates and venue from them
    // (unless given), and an existing festival of the same name is joined, not
    // overwritten.
    if (body.concertIds) {
      const shows = await db
        .select({ id: schema.concerts.id, date: schema.concerts.date, venueId: schema.concerts.venueId })
        .from(schema.concerts)
        .where(inArray(schema.concerts.id, body.concertIds))
        .orderBy(asc(schema.concerts.date));
      if (shows.length === 0) return reply.code(404).send({ error: "None of those shows exist." });
      const slugFor = slugify(body.name);
      let festival = await db.query.eventSeries.findFirst({ where: eq(schema.eventSeries.slug, slugFor) });
      if (!festival) {
        const startDate = body.startDate ?? shows[0]!.date;
        const [created] = await db
          .insert(schema.eventSeries)
          .values({
            name: body.name,
            slug: slugFor,
            year: body.year ?? Number(startDate.slice(0, 4)),
            startDate,
            endDate: body.endDate ?? shows[shows.length - 1]!.date,
            venueId: shows.find((x) => x.venueId)?.venueId ?? null,
            eventNotes: body.eventNotes ?? null,
            sourceUrl: body.sourceUrl ?? null,
          })
          .returning();
        festival = created!;
      }
      await db
        .update(schema.concerts)
        .set({ eventSeriesId: festival.id, updatedAt: new Date() })
        .where(inArray(schema.concerts.id, shows.map((x) => x.id)));
      return reply.code(201).send({ festivalId: festival.id, slug: festival.slug, added: shows.length });
    }

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

    // Days: one per date the lineup names (undated artists play the first
    // day); with no lineup yet, one per date of the festival, so attendance
    // has somewhere to live and artists can be added later.
    const artists = body.artists ?? [];
    const firstDay = body.startDate ?? artists.find((a) => a.performanceDate)?.performanceDate;
    if (artists.length > 0 && !firstDay && artists.some((a) => !a.performanceDate)) {
      return reply.code(400).send({ error: "Give the festival a start date, or a date for every artist." });
    }
    const byDate = new Map<string, typeof artists>();
    for (const a of artists) {
      const date = a.performanceDate ?? firstDay!;
      byDate.set(date, [...(byDate.get(date) ?? []), a]);
    }
    if (byDate.size === 0 && body.startDate) {
      for (const date of dateRange(body.startDate, body.endDate)) byDate.set(date, []);
    }

    await db.transaction(async (tx) => {
      let first = true;
      for (const date of [...byDate.keys()].sort()) {
        const day = await ensureFestivalDay(tx, { id: festival.id, venueId }, date, userId);
        const dayArtists = byDate.get(date)!;
        for (const [i, a] of dayArtists.entries()) {
          const [artist] = await tx
            .insert(schema.artists)
            .values({ name: a.name, slug: slugify(a.name) })
            .onConflictDoUpdate({ target: schema.artists.slug, set: { name: a.name } })
            .returning({ id: schema.artists.id });
          if (!artist) continue;
          await tx
            .insert(schema.concertArtists)
            .values({
              concertId: day.id,
              artistId: artist.id,
              role: i === 0 ? "headliner" : "support",
              setOrder: i,
              stageName: a.stageName ?? null,
              appearanceNotes: a.appearanceNotes ?? null,
            })
            .onConflictDoNothing();
        }
        // Attendance on every day; notes and ticket price once, on the first.
        await tx
          .insert(schema.concertAttendees)
          .values({
            userId,
            concertId: day.id,
            status: body.status,
            personalNotes: first ? body.personalNotes ?? null : null,
            ticketPricePaid: first ? body.ticketPricePaid ?? null : null,
            ticketPriceCurrency: first ? body.ticketPriceCurrency ?? null : null,
          })
          .onConflictDoNothing();
        first = false;
      }
    });

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
    // The festival across years; empty resets it to the name without its year.
    brand: z.string().max(256).nullable().optional(),
  }).refine((d) => Object.keys(d).length > 0, "Provide at least one field to update.");

  app.patch("/festivals/:slug", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
    }

    const body = parsed.data;

    // Verify festival exists
    const festival = await db.query.eventSeries.findFirst({
      where: eq(schema.eventSeries.slug, slug),
    });
    if (!festival) {
      return reply.code(404).send({ error: "Festival not found." });
    }

    // The festival's dates must cover its days.
    const startDate = body.startDate !== undefined ? body.startDate : festival.startDate;
    const endDate = body.endDate !== undefined ? body.endDate : festival.endDate;
    if (body.startDate !== undefined || body.endDate !== undefined) {
      const [range] = await db
        .select({ first: sql<string | null>`min(${schema.concerts.date})::text`, last: sql<string | null>`max(${schema.concerts.date})::text` })
        .from(schema.concerts)
        .where(eq(schema.concerts.eventSeriesId, festival.id));
      if (range?.first && ((startDate && startDate > range.first) || ((endDate ?? startDate) && (endDate ?? startDate)! < range.last!))) {
        return reply.code(400).send({
          error: `This festival has days from ${range.first} to ${range.last}; its dates must include them.`,
        });
      }
      if (startDate && endDate && endDate < startDate) {
        return reply.code(400).send({ error: "End date must be on or after the start date." });
      }
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
    if (body.brand !== undefined) updates.brand = body.brand?.trim() || null;

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

    const [updated] = await db.transaction(async (tx) => {
      // Days at the festival's old venue move with it.
      if (updates.venueId !== undefined && updates.venueId !== festival.venueId && updates.venueId !== null) {
        await tx
          .update(schema.concerts)
          .set({ venueId: updates.venueId as string, updatedAt: new Date() })
          .where(and(
            eq(schema.concerts.eventSeriesId, festival.id),
            festival.venueId ? eq(schema.concerts.venueId, festival.venueId) : sql`${schema.concerts.venueId} is null`,
          ));
      }
      return tx
        .update(schema.eventSeries)
        .set(updates)
        .where(eq(schema.eventSeries.id, festival.id))
        .returning();
    });

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
  // Ungroup: the festival goes; its shows stay — with their attendance, photos
  // and setlists — as ordinary shows. Shows without a flyer of their own get a
  // copy of the festival's, so no poster is lost.

  app.delete("/festivals/:slug", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const festival = await db.query.eventSeries.findFirst({
      where: eq(schema.eventSeries.slug, slug),
    });
    if (!festival) {
      return reply.code(404).send({ error: "Festival not found." });
    }

    const shows = await db
      .select({ id: schema.concerts.id, flyerKey: schema.concerts.flyerKey })
      .from(schema.concerts)
      .where(eq(schema.concerts.eventSeriesId, festival.id));

    if (festival.flyerKey) {
      const ext = festival.flyerKey.match(/\.[a-z0-9]+$/i)?.[0] ?? ".jpg";
      for (const show of shows.filter((x) => !x.flyerKey)) {
        const key = `concerts/${show.id}/flyer${ext}`;
        try {
          await s3.send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${festival.flyerKey}`, Key: key }));
          await db.update(schema.concerts).set({ flyerKey: key, flyerHash: festival.flyerHash }).where(eq(schema.concerts.id, show.id));
        } catch (err) {
          req.log.warn({ err, show: show.id }, "couldn't copy the festival flyer to a show");
        }
      }
    }

    // Detaching the last show removes the festival (migration 0018), queueing
    // its flyer file for deletion; a festival with no shows is removed here.
    await db
      .update(schema.concerts)
      .set({ eventSeriesId: null, updatedAt: new Date() })
      .where(eq(schema.concerts.eventSeriesId, festival.id));
    const stillThere = await db.query.eventSeries.findFirst({ where: eq(schema.eventSeries.id, festival.id) });
    if (stillThere) {
      await db.delete(schema.eventSeries).where(eq(schema.eventSeries.id, festival.id));
      if (festival.flyerKey) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: festival.flyerKey })).catch(() => undefined);
    }

    return reply.send({ ok: true, shows: shows.length });
  });

  // ── POST /festivals/:slug/shows · DELETE /festivals/:slug/shows/:id ─────────
  // Couple and decouple: add existing shows to the festival (they take its
  // name, flyer, and venue if they have none), or take one out (it goes back
  // to its own name; a festival left with no shows is removed).

  app.post("/festivals/:slug/shows", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const parsed = z.object({ concertIds: z.array(z.string().uuid()).min(1).max(300) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "concertIds required." });
    const festival = await db.query.eventSeries.findFirst({ where: eq(schema.eventSeries.slug, slug) });
    if (!festival) return reply.code(404).send({ error: "Festival not found." });

    const updated = await db
      .update(schema.concerts)
      .set({ eventSeriesId: festival.id, updatedAt: new Date() })
      .where(inArray(schema.concerts.id, parsed.data.concertIds))
      .returning({ id: schema.concerts.id });
    return reply.send({ ok: true, added: updated.length });
  });

  app.delete("/festivals/:slug/shows/:concertId", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug, concertId } = req.params as { slug: string; concertId: string };
    const festival = await db.query.eventSeries.findFirst({ where: eq(schema.eventSeries.slug, slug) });
    if (!festival) return reply.code(404).send({ error: "Festival not found." });

    const [row] = await db
      .update(schema.concerts)
      .set({ eventSeriesId: null, updatedAt: new Date() })
      .where(and(eq(schema.concerts.id, concertId), eq(schema.concerts.eventSeriesId, festival.id)))
      .returning({ slug: schema.concerts.slug });
    if (!row) return reply.code(404).send({ error: "That show isn't part of this festival." });

    const festivalRemoved = !(await db.query.eventSeries.findFirst({ where: eq(schema.eventSeries.id, festival.id) }));
    return reply.send({ ok: true, showSlug: row.slug, festivalRemoved });
  });

  // ── PATCH /festivals/:slug/attendance ──────────────────────────────────────
  // Set the caller's attendance on every day of the festival at once.

  const attendanceBody = z.object({ status: z.enum(attendanceStatuses) });

  app.patch("/festivals/:slug/attendance", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const parsed = attendanceBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
    }

    const festival = await db.query.eventSeries.findFirst({ where: eq(schema.eventSeries.slug, slug) });
    if (!festival) return reply.code(404).send({ error: "Festival not found." });

    const days = await db
      .select({ id: schema.concerts.id })
      .from(schema.concerts)
      .where(and(eq(schema.concerts.eventSeriesId, festival.id), eq(schema.concerts.type, "festival_day")));
    if (days.length === 0) return reply.code(409).send({ error: "This festival has no days yet — add its lineup first." });

    const { status } = parsed.data;
    await db
      .insert(schema.concertAttendees)
      .values(days.map((d) => ({ userId: req.user!.id, concertId: d.id, status })))
      .onConflictDoUpdate({
        target: [schema.concertAttendees.userId, schema.concertAttendees.concertId],
        set: { status, updatedAt: new Date() },
      });

    return reply.send({ ok: true, days: days.length });
  });

  // ── PUT /festivals/:slug/sets ──────────────────────────────────────────────
  // Replace the lineup. Each entry's date says which day it plays, and its
  // concertId (when a date has several shows) which show. Otherwise an artist
  // stays on the show it was already on that date, or joins the date's first
  // show; a date with no show yet gets one. A show left with no artists is
  // removed unless it holds photos or setlists.

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
          // The show this set belongs to, when a date has several.
          concertId: z.string().uuid().nullable().optional(),
        }).refine((d) => d.artistId || d.artistName, "Each entry needs artistId or artistName"),
      )
      .max(300),
  });

  app.put("/festivals/:slug/sets", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const parsed = putSetsBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body.", details: parsed.error.flatten() });
    }

    const festival = await db.query.eventSeries.findFirst({
      where: eq(schema.eventSeries.slug, slug),
    });
    if (!festival) {
      return reply.code(404).send({ error: "Festival not found." });
    }

    const { sets } = parsed.data;
    const userId = req.user!.id;
    const existingDays = await loadFestivalDays([festival.id], userId);

    // Undated entries play the first day.
    const firstDay = festival.startDate ?? existingDays[0]?.date ?? null;
    if (!firstDay && sets.some((s) => !s.performanceDate)) {
      return reply.code(400).send({ error: "Give each artist a date, or set the festival's start date." });
    }

    // Validate explicit artistIds
    const byIdArtists = sets.filter((s) => s.artistId);
    if (byIdArtists.length > 0) {
      const ids = [...new Set(byIdArtists.map((a) => a.artistId!))];
      const found = await db
        .select({ id: schema.artists.id })
        .from(schema.artists)
        .where(inArray(schema.artists.id, ids));
      if (found.length !== ids.length) {
        return reply.code(404).send({ error: "One or more artist IDs not found." });
      }
    }

    // Resolve all artist IDs (upsert by name)
    const resolved: { s: (typeof sets)[number]; artistId: string; date: string }[] = [];
    for (const s of sets) {
      let artistId = s.artistId;
      if (!artistId && s.artistName) {
        const [artist] = await db
          .insert(schema.artists)
          .values({ name: s.artistName, slug: slugify(s.artistName) })
          .onConflictDoUpdate({ target: schema.artists.slug, set: { name: s.artistName } })
          .returning({ id: schema.artists.id });
        artistId = artist?.id;
      }
      if (artistId) resolved.push({ s, artistId, date: s.performanceDate ?? firstDay! });
    }

    const byDate = new Map<string, typeof resolved>();
    for (const r of resolved) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);

    // Which show each set goes on.
    const byShow = new Map<string, typeof resolved>();
    const newDates = new Map<string, typeof resolved>();
    for (const r of resolved) {
      const onDate = existingDays.filter((d) => d.date === r.date);
      const target =
        onDate.find((d) => d.id === r.s.concertId) ??
        onDate.find((d) => d.artists.some((a) => a.id === r.artistId)) ??
        onDate[0];
      const group = target ? byShow : newDates;
      const key = target ? target.id : r.date;
      const list = group.get(key) ?? [];
      // An artist plays a show once.
      if (!list.some((x) => x.artistId === r.artistId)) list.push(r);
      group.set(key, list);
    }

    // A new show starts with the caller's attendance for the festival as a whole.
    const carried = festivalAttendance(existingDays)?.status;

    /** Roles for a show: kept where the artist was already on it; first act headlines otherwise. */
    const rolesFor = (showId: string | null, entries: typeof resolved) => {
      const roles = new Map((existingDays.find((d) => d.id === showId)?.artists ?? []).map((a) => [a.id, a.role]));
      const kept = entries.map(({ artistId }) => roles.get(artistId));
      if (!kept.some((r) => r === "headliner" || r === "co_headliner")) kept[0] = "headliner";
      const hasCo = kept.includes("co_headliner");
      let headlined = false;
      return kept.map((r) => {
        if (r !== "headliner") return r === "co_headliner" ? r : "support";
        if (hasCo || headlined) return "support";
        headlined = true;
        return r;
      });
    };

    await db.transaction(async (tx) => {
      const write = async (showId: string, entries: typeof resolved) => {
        await tx.delete(schema.concertArtists).where(eq(schema.concertArtists.concertId, showId));
        const roles = rolesFor(showId, entries);
        await tx.insert(schema.concertArtists).values(
          entries.map(({ s, artistId }, i) => ({
            concertId: showId,
            artistId,
            role: roles[i] as typeof schema.concertArtists.$inferInsert.role,
            setOrder: i,
            stageName: s.stageName ?? null,
            appearanceNotes: s.appearanceNotes ?? null,
          })),
        );
      };
      for (const [showId, entries] of byShow) await write(showId, entries);
      for (const [date, entries] of newDates) {
        const day = await ensureFestivalDay(tx, festival, date, userId);
        await write(day.id, entries);
        if (day.created && carried) {
          await tx.insert(schema.concertAttendees).values({ userId, concertId: day.id, status: carried }).onConflictDoNothing();
        }
      }

      // Shows left with no artists.
      for (const d of existingDays.filter((d) => !byShow.has(d.id))) {
        await tx.delete(schema.concertArtists).where(eq(schema.concertArtists.concertId, d.id));
        await tx.execute(sql`
          delete from concerts c where c.id = ${d.id}
            and not exists (select 1 from photos p where p.concert_id = c.id)
            and not exists (select 1 from setlists s where s.concert_id = c.id)`);
      }
    });

    return reply.send({ ok: true, count: resolved.length, days: byDate.size });
  });

  // ── POST /festivals/:slug/flyer ────────────────────────────────────────────
  // Upload flyer image

  const FLYER_ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

  app.post("/festivals/:slug/flyer", { preHandler: [requireAdmin] }, async (req, reply) => {
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

  app.post("/festivals/:slug/flyer/url", { preHandler: [requireAdmin] }, async (req, reply) => {
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

  app.delete("/festivals/:slug/flyer", { preHandler: [requireAdmin] }, async (req, reply) => {
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
