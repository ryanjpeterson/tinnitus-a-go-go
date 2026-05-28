/**
 * Public routes — no authentication required.
 *
 *   GET  /public/concerts         full concert list (all users' data, no personal notes)
 *   GET  /public/concerts/:id     single concert detail (public-safe fields)
 *
 * These are intentionally open so unauthenticated visitors can browse the log.
 */

import type { FastifyInstance } from "fastify";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { env } from "../lib/env.js";
import { bucket } from "../lib/s3.js";

function mediaUrl(key: string): string {
  const base = env.MINIO_PUBLIC_URL ?? `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`;
  return `${base}/${bucket}/${key}`;
}

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /public/concerts ────────────────────────────────────────────────────
  // Returns all concerts with artists, venue, and the primary attendee's data.

  app.get("/public/concerts", async (_req, reply) => {
    // Fetch all concerts newest-first
    const concertRows = await db
      .select({
        concertId: schema.concerts.id,
        date:      schema.concerts.date,
        type:      schema.concerts.type,
        dateIsApproximate: schema.concerts.dateIsApproximate,
        headlinerHint: schema.concerts.headlinerHint,
        flyerKey:  schema.concerts.flyerKey,
        venueId:   schema.venues.id,
        venueName: schema.venues.name,
        venueSlug: schema.venues.slug,
        venueCity: schema.venues.city,
        venueRegion: schema.venues.region,
      })
      .from(schema.concerts)
      .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
      .orderBy(desc(schema.concerts.date))
      .limit(2000);

    if (concertRows.length === 0) return reply.send({ concerts: [], total: 0 });

    const concertIds = concertRows.map((r) => r.concertId);

    // Fetch artists + first attendee per concert in two queries (no N+1)
    const [artistRows, attendeeRows] = await Promise.all([
      db
        .select({
          concertId: schema.concertArtists.concertId,
          artistId:  schema.artists.id,
          artistName: schema.artists.name,
          artistSlug: schema.artists.slug,
          role:      schema.concertArtists.role,
          setOrder:  schema.concertArtists.setOrder,
          appearanceNotes: schema.concertArtists.appearanceNotes,
        })
        .from(schema.concertArtists)
        .innerJoin(schema.artists, eq(schema.concertArtists.artistId, schema.artists.id))
        .where(inArray(schema.concertArtists.concertId, concertIds))
        .orderBy(schema.concertArtists.setOrder),

      // Get all attendee rows, we'll use the most recent one per concert
      db
        .select({
          concertId: schema.concertAttendees.concertId,
          status:    schema.concertAttendees.status,
          rating:    schema.concertAttendees.rating,
          personalNotes: schema.concertAttendees.personalNotes,
          ticketPricePaid: schema.concertAttendees.ticketPricePaid,
          ticketPriceCurrency: schema.concertAttendees.ticketPriceCurrency,
          createdAt: schema.concertAttendees.createdAt,
        })
        .from(schema.concertAttendees)
        .where(inArray(schema.concertAttendees.concertId, concertIds))
        .orderBy(schema.concertAttendees.createdAt),
    ]);

    // Group artists by concert
    const artistsByConcert = new Map<string, typeof artistRows>();
    for (const row of artistRows) {
      const list = artistsByConcert.get(row.concertId) ?? [];
      list.push(row);
      artistsByConcert.set(row.concertId, list);
    }

    // First attendee per concert (already ordered by createdAt asc)
    const attendeeByConcert = new Map<string, typeof attendeeRows[0]>();
    for (const row of attendeeRows) {
      if (!attendeeByConcert.has(row.concertId)) {
        attendeeByConcert.set(row.concertId, row);
      }
    }

    const concerts = concertRows.map((r) => {
      const artists = (artistsByConcert.get(r.concertId) ?? []).map((a) => ({
        id:   a.artistId,
        name: a.artistName,
        slug: a.artistSlug,
        role: a.role,
        setOrder: a.setOrder,
        appearanceNotes: a.appearanceNotes,
      }));

      const attendee = attendeeByConcert.get(r.concertId) ?? null;

      return {
        id:   r.concertId,
        date: r.date,
        type: r.type,
        dateIsApproximate: r.dateIsApproximate,
        headlinerHint: r.headlinerHint,
        flyerUrl: r.flyerKey ? mediaUrl(r.flyerKey) : null,
        venue: r.venueId
          ? { id: r.venueId, slug: r.venueSlug!, name: r.venueName!, city: r.venueCity, region: r.venueRegion }
          : null,
        artists,
        attendance: attendee
          ? {
              status:   attendee.status,
              rating:   attendee.rating,
              personalNotes: attendee.personalNotes,
              ticketPricePaid: attendee.ticketPricePaid,
              ticketPriceCurrency: attendee.ticketPriceCurrency,
            }
          : null,
      };
    });

    return reply.send({ concerts, total: concerts.length });
  });

  // ── GET /public/concerts/:id ────────────────────────────────────────────────

  app.get("/public/concerts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const concert = await db.query.concerts.findFirst({
      where: eq(schema.concerts.id, id),
      with: {
        venue: true,
        eventSeries: true,
        concertArtists: {
          with: { artist: true },
          orderBy: [schema.concertArtists.setOrder],
        },
        concertAttendees: {
          orderBy: [schema.concertAttendees.createdAt],
        },
      },
    });

    if (!concert) return reply.code(404).send({ error: "Concert not found." });

    const attendee = concert.concertAttendees[0] ?? null;

    return reply.send({
      concert: {
        id:   concert.id,
        date: concert.date,
        type: concert.type,
        dateIsApproximate: concert.dateIsApproximate,
        headlinerHint: concert.headlinerHint,
        flyerUrl: concert.flyerKey ? mediaUrl(concert.flyerKey) : null,
        eventNotes: concert.eventNotes,
        sourceUrl: concert.sourceUrl,
        venue: concert.venue
          ? { id: concert.venue.id, slug: concert.venue.slug, name: concert.venue.name, city: concert.venue.city, region: concert.venue.region, lat: concert.venue.lat, lng: concert.venue.lng }
          : null,
        eventSeries: concert.eventSeries
          ? { id: concert.eventSeries.id, slug: concert.eventSeries.slug, name: concert.eventSeries.name, year: concert.eventSeries.year }
          : null,
        artists: concert.concertArtists.map((ca) => ({
          id:   ca.artist.id,
          name: ca.artist.name,
          slug: ca.artist.slug,
          role: ca.role,
          setOrder: ca.setOrder,
          appearanceNotes: ca.appearanceNotes,
        })),
        attendance: attendee
          ? {
              status:   attendee.status,
              rating:   attendee.rating,
              personalNotes: attendee.personalNotes,
              ticketPricePaid: attendee.ticketPricePaid,
              ticketPriceCurrency: attendee.ticketPriceCurrency,
            }
          : null,
        createdAt: concert.createdAt,
        updatedAt: concert.updatedAt,
      },
    });
  });
}
