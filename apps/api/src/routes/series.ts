/**
 * Event series (festival) routes.
 *
 *   GET  /series          paginated list of series the user has shows in
 *   GET  /series/:slug    detail + that user's concerts in this series
 */

import type { FastifyInstance } from "fastify";
import { desc, eq, inArray, sql, and } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { requireUser } from "../auth/middleware.js";

export async function seriesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  const listQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  });

  app.get("/series", async (req, reply) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query.", details: parsed.error.flatten() });
    }
    const { page, limit } = parsed.data;
    const userId = req.user!.id;
    const offset = (page - 1) * limit;

    const userConcertIds = db
      .select({ id: schema.concertAttendees.concertId })
      .from(schema.concertAttendees)
      .where(eq(schema.concertAttendees.userId, userId));

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: schema.eventSeries.id,
          name: schema.eventSeries.name,
          slug: schema.eventSeries.slug,
          year: schema.eventSeries.year,
          dayCount: sql<number>`count(distinct ${schema.concerts.id})::int`,
          artistCount: sql<number>`count(distinct ${schema.concertArtists.artistId})::int`,
        })
        .from(schema.eventSeries)
        .innerJoin(schema.concerts, eq(schema.concerts.eventSeriesId, schema.eventSeries.id))
        .leftJoin(schema.concertArtists, eq(schema.concertArtists.concertId, schema.concerts.id))
        .where(inArray(schema.concerts.id, userConcertIds))
        .groupBy(schema.eventSeries.id)
        .orderBy(desc(schema.eventSeries.year))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(distinct ${schema.eventSeries.id})::int` })
        .from(schema.eventSeries)
        .innerJoin(schema.concerts, eq(schema.concerts.eventSeriesId, schema.eventSeries.id))
        .where(inArray(schema.concerts.id, userConcertIds)),
    ]);

    const total = countRows[0]?.total ?? 0;
    return reply.send({
      series: rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    });
  });

  app.get("/series/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const userId = req.user!.id;

    const series = await db.query.eventSeries.findFirst({
      where: eq(schema.eventSeries.slug, slug),
    });
    if (!series) return reply.code(404).send({ error: "Series not found." });

    // Days the user attended in this series, each with their artist lineup
    const concertRows = await db
      .select({
        concertId: schema.concerts.id,
        date: schema.concerts.date,
        venueName: schema.venues.name,
        venueCity: schema.venues.city,
        status: schema.concertAttendees.status,
      })
      .from(schema.concerts)
      .innerJoin(
        schema.concertAttendees,
        and(
          eq(schema.concertAttendees.concertId, schema.concerts.id),
          eq(schema.concertAttendees.userId, userId),
        ),
      )
      .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
      .where(eq(schema.concerts.eventSeriesId, series.id))
      .orderBy(desc(schema.concerts.date));

    // Fetch artists for all these concerts in one query
    const concertIds = concertRows.map((r) => r.concertId);
    const artistRows =
      concertIds.length > 0
        ? await db
            .select({
              concertId: schema.concertArtists.concertId,
              artistName: schema.artists.name,
              artistSlug: schema.artists.slug,
              setOrder: schema.concertArtists.setOrder,
            })
            .from(schema.concertArtists)
            .innerJoin(schema.artists, eq(schema.concertArtists.artistId, schema.artists.id))
            .where(inArray(schema.concertArtists.concertId, concertIds))
            .orderBy(schema.concertArtists.setOrder)
        : [];

    const artistsByConcert = new Map<string, typeof artistRows>();
    for (const a of artistRows) {
      const list = artistsByConcert.get(a.concertId) ?? [];
      list.push(a);
      artistsByConcert.set(a.concertId, list);
    }

    const concerts = concertRows.map((r) => ({
      id: r.concertId,
      date: r.date,
      venue: r.venueName ? { name: r.venueName, city: r.venueCity } : null,
      attendance: { status: r.status },
      artists: (artistsByConcert.get(r.concertId) ?? []).map((a) => ({
        name: a.artistName,
        slug: a.artistSlug,
      })),
    }));

    const allArtistSlugs = new Set(artistRows.map((a) => a.artistSlug));

    return reply.send({
      series: {
        id: series.id,
        name: series.name,
        slug: series.slug,
        year: series.year,
      },
      concerts,
      stats: {
        daysAttended: concerts.length,
        uniqueArtists: allArtistSlugs.size,
      },
    });
  });
}
