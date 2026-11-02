/**
 * GET /concerts            the list (paginated, filterable)
 * GET /concerts/followup   past shows still marked attending/interested
 * GET /concerts/:idOrSlug  one show
 */

import type { FastifyInstance } from "fastify";
import { and, desc, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../../db/client.js";
import { mediaUrl } from "../../lib/s3.js";
import { requireUser } from "../../auth/middleware.js";
import { festivalLength } from "../../lib/festival-days.js";
import { ensureCached, loadCachedSets, type CachedSet } from "../../lib/setlist-cache.js";
import { BILLING_ORDER_SQL, loadShowInfo } from "../../lib/show-info.js";
import { attendanceStatuses } from "./shared.js";

export function concertReadRoutes(app: FastifyInstance): void {
  // ── GET /concerts ───────────────────────────────────────────────────────────

  const listQuerySchema = z.object({
    // One status or a comma-separated list ("interested,attending").
    status: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []))
      .pipe(z.array(z.enum(attendanceStatuses))),
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
    const offset = (page - 1) * limit;

    // Build WHERE clause conditions
    type SQL = ReturnType<typeof eq>;
    const conditions: SQL[] = [];

    if (year) {
      conditions.push(sql`extract(year from ${schema.concerts.date})::int = ${year}` as unknown as SQL);
    }

    // When filtering by status, we need to join with concert_attendees
    if (status.length > 0) {
      conditions.push(inArray(schema.concertAttendees.status, status) as unknown as SQL);
    }

    const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0]! : and(...conditions);

    // Build base query - join with attendees when filtering by status
    const baseQuery = status.length > 0
      ? db
          .select({
            concertId: schema.concerts.id,
            date: schema.concerts.date,
            type: schema.concerts.type,
            dateIsApproximate: schema.concerts.dateIsApproximate,
            headlinerHint: schema.concerts.headlinerHint,
            slug: schema.concerts.slug,
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
          })
          .from(schema.concerts)
          .innerJoin(schema.concertAttendees, eq(schema.concertAttendees.concertId, schema.concerts.id))
          .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
          .leftJoin(schema.eventSeries, eq(schema.concerts.eventSeriesId, schema.eventSeries.id))
      : db
          .select({
            concertId: schema.concerts.id,
            date: schema.concerts.date,
            type: schema.concerts.type,
            dateIsApproximate: schema.concerts.dateIsApproximate,
            headlinerHint: schema.concerts.headlinerHint,
            slug: schema.concerts.slug,
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
          })
          .from(schema.concerts)
          .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
          .leftJoin(schema.eventSeries, eq(schema.concerts.eventSeriesId, schema.eventSeries.id));

    // Apply text search — headliner hint, venue name, event series name
    let filteredQuery = where ? baseQuery.where(where) : baseQuery;

    if (q) {
      const like = `%${q}%`;
      const searchConditions = where
        ? and(
            where,
            or(
              ilike(schema.concerts.headlinerHint, like),
              ilike(schema.venues.name, like),
              ilike(schema.eventSeries.name, like),
            ),
          )
        : or(
            ilike(schema.concerts.headlinerHint, like),
            ilike(schema.venues.name, like),
            ilike(schema.eventSeries.name, like),
          );
      filteredQuery = baseQuery.where(searchConditions!);
    }

    // Count total - must match the same join structure as the base query
    const countBaseQuery = status.length > 0
      ? db
          .select({ total: sql<number>`count(*)::int` })
          .from(schema.concerts)
          .innerJoin(schema.concertAttendees, eq(schema.concertAttendees.concertId, schema.concerts.id))
          .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
          .leftJoin(schema.eventSeries, eq(schema.concerts.eventSeriesId, schema.eventSeries.id))
      : db
          .select({ total: sql<number>`count(*)::int` })
          .from(schema.concerts)
          .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
          .leftJoin(schema.eventSeries, eq(schema.concerts.eventSeriesId, schema.eventSeries.id));

    const countQuery = countBaseQuery.where(q
      ? where
        ? and(
            where,
            or(
              ilike(schema.concerts.headlinerHint, `%${q}%`),
              ilike(schema.venues.name, `%${q}%`),
              ilike(schema.eventSeries.name, `%${q}%`),
            ),
          )
        : or(
            ilike(schema.concerts.headlinerHint, `%${q}%`),
            ilike(schema.venues.name, `%${q}%`),
            ilike(schema.eventSeries.name, `%${q}%`),
          )
      : where);

    const orderCol = sort === "date_asc" ? asc(schema.concerts.date) : desc(schema.concerts.date);

    const [concertRows, countRows] = await Promise.all([
      filteredQuery
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

    // Fetch attendance data for each concert
    const attendanceRows = await db
      .select({
        concertId: schema.concertAttendees.concertId,
        status: schema.concertAttendees.status,
      })
      .from(schema.concertAttendees)
      .where(inArray(schema.concertAttendees.concertId, concertIds));

    const attendanceByConcert = new Map<string, { status: string }>();
    for (const row of attendanceRows) {
      attendanceByConcert.set(row.concertId, { status: row.status });
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

      const attendance = attendanceByConcert.get(r.concertId);
      return {
        id: r.concertId,
        date: r.date,
        type: r.type,
        dateIsApproximate: r.dateIsApproximate,
        headlinerHint: r.headlinerHint,
        slug: r.slug,
        flyerUrl: r.flyerKey ? mediaUrl(r.flyerKey) : null,
        venue: r.venueId
          ? { id: r.venueId, slug: r.venueSlug!, name: r.venueName!, city: r.venueCity, region: r.venueRegion }
          : null,
        eventSeries: r.seriesId
          ? { id: r.seriesId, slug: r.seriesSlug!, name: r.seriesName!, year: r.seriesYear }
          : null,
        artists,
        attendance: attendance ?? null,
      };
    });

    // Fetch festival flyers for any festival_day concerts without their own flyer
    const festivalDayIdsWithoutFlyer = concertRows
      .filter((r) => r.type === "festival_day" && !r.flyerKey && r.seriesId)
      .map((r) => r.seriesId!);

    let festivalFlyerMap = new Map<string, string>();
    if (festivalDayIdsWithoutFlyer.length > 0) {
      const festivalRows = await db
        .select({ id: schema.eventSeries.id, flyerKey: schema.eventSeries.flyerKey })
        .from(schema.eventSeries)
        .where(inArray(schema.eventSeries.id, festivalDayIdsWithoutFlyer));
      for (const row of festivalRows) {
        if (row.flyerKey) festivalFlyerMap.set(row.id, row.flyerKey);
      }
    }

    // Apply inherited flyers
    const concertsWithInheritedFlyers = concerts.map((c, i) => {
      const r = concertRows[i]!;
      if (!c.flyerUrl && r.type === "festival_day" && r.seriesId) {
        const inheritedKey = festivalFlyerMap.get(r.seriesId);
        if (inheritedKey) {
          return { ...c, flyerUrl: mediaUrl(inheritedKey), flyerInherited: true };
        }
      }
      return { ...c, flyerInherited: false };
    });

    // Festival days are labelled "Day N of M" in lists.
    const dayInfo = await loadShowInfo(
      concertRows.filter((r) => r.type === "festival_day").map((r) => r.concertId),
    );
    const concertsWithDays = concertsWithInheritedFlyers.map((c) => {
      const info = dayInfo.get(c.id);
      return {
        ...c,
        festivalDay: info?.dayNumber != null ? { number: info.dayNumber, count: info.dayCount ?? info.dayNumber } : null,
      };
    });

    return reply.send({
      concerts: concertsWithDays,
      total: total ?? 0,
      page,
      totalPages: Math.ceil((total ?? 0) / limit),
      limit,
    });
  });

  // ── GET /concerts/followup ──────────────────────────────────────────────────
  // Returns past concerts (date < today) with actionable status (attending/interested).
  // Used by the daily follow-up prompt. User-specific — requires auth.

  app.get("/concerts/followup", { preHandler: [requireUser] }, async (req, reply) => {
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
        slug: schema.concerts.slug,
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
        personalNotes: schema.concertAttendees.personalNotes,
        ticketPricePaid: schema.concertAttendees.ticketPricePaid,
        ticketPriceCurrency: schema.concertAttendees.ticketPriceCurrency,
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

    const baseConcerts = rows.map((r) => ({
      id: r.concertId,
      date: r.date,
      type: r.type,
      dateIsApproximate: r.dateIsApproximate,
      headlinerHint: r.headlinerHint,
      slug: r.slug,
      flyerUrl: r.flyerKey ? mediaUrl(r.flyerKey) : null,
      venue: r.venueId
        ? { id: r.venueId, slug: r.venueSlug!, name: r.venueName!, city: r.venueCity, region: r.venueRegion }
        : null,
      eventSeries: r.seriesId
        ? { id: r.seriesId, slug: r.seriesSlug!, name: r.seriesName!, year: r.seriesYear }
        : null,
      attendance: {
        status: r.status,
        personalNotes: r.personalNotes,
        ticketPricePaid: r.ticketPricePaid,
        ticketPriceCurrency: r.ticketPriceCurrency,
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

    // Fetch festival flyers for festival_day concerts without their own flyer
    const festivalDayIdsWithoutFlyer = rows
      .filter((r) => r.type === "festival_day" && !r.flyerKey && r.seriesId)
      .map((r) => r.seriesId!);

    let festivalFlyerMap = new Map<string, string>();
    if (festivalDayIdsWithoutFlyer.length > 0) {
      const festivalRows = await db
        .select({ id: schema.eventSeries.id, flyerKey: schema.eventSeries.flyerKey })
        .from(schema.eventSeries)
        .where(inArray(schema.eventSeries.id, festivalDayIdsWithoutFlyer));
      for (const row of festivalRows) {
        if (row.flyerKey) festivalFlyerMap.set(row.id, row.flyerKey);
      }
    }

    const concerts = baseConcerts.map((c, i) => {
      const r = rows[i]!;
      if (!c.flyerUrl && r.type === "festival_day" && r.seriesId) {
        const inheritedKey = festivalFlyerMap.get(r.seriesId);
        if (inheritedKey) {
          return { ...c, flyerUrl: mediaUrl(inheritedKey), flyerInherited: true };
        }
      }
      return { ...c, flyerInherited: false };
    });

    return reply.send({ concerts, total: concerts.length });
  });

  // ── GET /concerts/:idOrSlug ─────────────────────────────────────────────────
  // Supports both UUID and slug patterns like "osheaga-2025-2025-07-12"
  // Public endpoint — no auth required

  app.get("/concerts/:idOrSlug", async (req, reply) => {
    const { idOrSlug } = req.params as { idOrSlug: string };

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
        },
      });
    } else {
      concert = await db.query.concerts.findFirst({
        where: eq(schema.concerts.slug, idOrSlug),
        with: {
          venue: true,
          eventSeries: true,
          concertArtists: {
            with: { artist: true },
            orderBy: [schema.concertArtists.setOrder],
          },
        },
      });
      // Older links: "series-slug-YYYY-MM-DD" or "venue-slug-YYYY-MM-DD"
      const dateMatch = concert ? null : idOrSlug.match(/^(.+)-(\d{4}-\d{2}-\d{2})$/);
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
            },
          });
        }
      }
    }

    if (!concert) {
      return reply.code(404).send({ error: "Concert not found." });
    }

    // Flyer inheritance: festival_day concerts can inherit the festival's flyer
    let flyerUrl: string | null = concert.flyerKey ? mediaUrl(concert.flyerKey) : null;
    let flyerInherited = false;
    if (!concert.flyerKey && concert.type === "festival_day" && concert.eventSeries?.flyerKey) {
      flyerUrl = mediaUrl(concert.eventSeries.flyerKey);
      flyerInherited = true;
    }

    // Fetch saved setlists for this concert
    const setlistRows = await db
      .select({
        id: schema.setlists.id,
        artistId: schema.setlists.artistId,
        setlistfmId: schema.setlists.setlistfmId,
        fetchedAt: schema.setlists.fetchedAt,
      })
      .from(schema.setlists)
      .where(eq(schema.setlists.concertId, concert.id));

    // Songs come from the local cache; links that were never fetched are filled now.
    await ensureCached(setlistRows, req.log);
    const cachedSets = await loadCachedSets(setlistRows.map((r) => r.id));

    const setlistsByArtist: Record<string, { id: string; setlistfmId: string | null; sets: CachedSet[] }> = {};
    for (const row of setlistRows) {
      if (row.artistId) {
        setlistsByArtist[row.artistId] = { id: row.id, setlistfmId: row.setlistfmId, sets: cachedSets.get(row.id) ?? [] };
      }
    }

    // For a festival day: every show of that festival (a date can have several
    // sets), so the page can switch between them.
    const festivalDays = concert.type === "festival_day" && concert.eventSeriesId
      ? (await db.execute<{ concert_id: string; slug: string; date: string; day_number: number | null; lineup: string[] | null }>(sql`
          select c.id as concert_id, c.slug, c.date::text as date,
            coalesce((c.date - es.start_date) + 1, dense_rank() over (order by c.date)::int) as day_number,
            (select array_agg(a.name order by ${BILLING_ORDER_SQL})
               from concert_artists ca join artists a on a.id = ca.artist_id
              where ca.concert_id = c.id) as lineup
          from concerts c join event_series es on es.id = c.event_series_id
          where c.event_series_id = ${concert.eventSeriesId}
          order by c.date, c.created_at, c.id
        `)).map((r) => ({ number: r.day_number ?? 1, date: r.date, concertId: r.concert_id, slug: r.slug, lineup: r.lineup ?? [] }))
      : [];

    // Whether the show was attended/missed/etc., for everyone (the page hides
    // media and setlists until it's attended). Prefers the signed-in user's row.
    const anyAttendee = await db.query.concertAttendees.findFirst({
      where: eq(schema.concertAttendees.concertId, concert.id),
      columns: { status: true },
    });

    // The signed-in user's own attendance (same row PATCH /concerts/:id writes).
    // Omitted for anonymous visitors so personal notes and ticket prices stay private.
    const attendanceRow = req.user
      ? await db.query.concertAttendees.findFirst({
          where: and(
            eq(schema.concertAttendees.userId, req.user.id),
            eq(schema.concertAttendees.concertId, concert.id),
          ),
        })
      : undefined;
    const attendance = attendanceRow
      ? {
          status: attendanceRow.status,
          personalNotes: attendanceRow.personalNotes,
          ticketPricePaid: attendanceRow.ticketPricePaid,
          ticketPriceCurrency: attendanceRow.ticketPriceCurrency,
          attendedConfirmedAt: attendanceRow.attendedConfirmedAt,
        }
      : undefined;

    return reply.send({
      concert: {
        id: concert.id,
        date: concert.date,
        type: concert.type,
        dateIsApproximate: concert.dateIsApproximate,
        headlinerHint: concert.headlinerHint,
        slug: concert.slug,
        flyerUrl,
        flyerHash: concert.flyerHash ?? null,
        flyerInherited,
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
        attendance,
        status: attendance?.status ?? anyAttendee?.status ?? null,
        createdAt: concert.createdAt,
        updatedAt: concert.updatedAt,
      },
      setlists: setlistsByArtist,
      festivalDays,
      // How many days the festival runs (from its dates), for "Day 5 of 5".
      festivalLength: concert.eventSeries
        ? festivalLength(concert.eventSeries, new Set(festivalDays.map((d) => d.date)).size)
        : null,
    });
  });
}
