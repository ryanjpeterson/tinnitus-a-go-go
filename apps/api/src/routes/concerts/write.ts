/**
 * POST   /concerts      create a show + your attendance
 * PATCH  /concerts/:id  update the show and your attendance
 * DELETE /concerts/:id  remove yourself from the show
 */

import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../../db/client.js";
import { requireAdmin } from "../../auth/middleware.js";
import { billingRoles } from "../../lib/lineup.js";
import { slugify } from "@tagg/shared";
import { attendanceStatuses, concertArtistRoles } from "./shared.js";

export function concertWriteRoutes(app: FastifyInstance): void {
  // ── POST /concerts ──────────────────────────────────────────────────────────
  // Admin only

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
          // Omitted everywhere: the last-listed act headlines (see lib/lineup.ts).
          role: z.enum(concertArtistRoles).optional(),
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

  app.post("/concerts", { preHandler: [requireAdmin] }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
    }

    const body = parsed.data;
    const userId = req.user!.id;

    // A festival day is a show that belongs to a festival.
    if (body.type === "festival_day" && !body.eventSeriesName?.trim()) {
      return reply.code(400).send({ error: "A festival day needs the festival's name." });
    }
    const billing = billingRoles(body.artists.map((a) => a.role));
    if ("error" in billing) return reply.code(422).send({ error: billing.error });

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

    // Create concert (type, headliner hint and slug are filled in by the database)
    const [concert] = await db
      .insert(schema.concerts)
      .values({
        date: body.date,
        dateIsApproximate: body.dateIsApproximate,
        venueId: venue?.id ?? null,
        eventSeriesId: seriesId,
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
        role: billing.roles[i],
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
      attendedConfirmedAt: status === "attended" ? new Date() : null,
      personalNotes: body.personalNotes ?? null,
      ticketPricePaid: body.ticketPricePaid ?? null,
      ticketPriceCurrency: body.ticketPriceCurrency ?? null,
    });

    const [created] = await db.select({ slug: schema.concerts.slug }).from(schema.concerts).where(eq(schema.concerts.id, concert.id));
    return reply.code(201).send({ concertId: concert.id, slug: created?.slug ?? null });
  });

  // ── PATCH /concerts/:id ─────────────────────────────────────────────────────

  const patchBody = z.object({
    // ── Attendance (per-user) fields ──────────────────────────────────────────
    status: z.enum(attendanceStatuses).optional(),
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

  app.patch("/concerts/:id", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const body = parsed.data;

    // Verify concert exists
    const concert = await db.query.concerts.findFirst({
      where: eq(schema.concerts.id, id),
    });
    if (!concert) {
      return reply.code(404).send({ error: "Concert not found." });
    }

    // Get or create attendee row for the admin user
    let existing = await db.query.concertAttendees.findFirst({
      where: and(
        eq(schema.concertAttendees.userId, userId),
        eq(schema.concertAttendees.concertId, id),
      ),
    });
    if (!existing) {
      // Create an attendee record for the admin
      const [newAttendee] = await db.insert(schema.concertAttendees).values({
        userId,
        concertId: id,
        status: "attended",
      }).returning();
      if (!newAttendee) {
        return reply.code(500).send({ error: "Failed to create attendee record." });
      }
      existing = newAttendee;
    }

    // ── Attendance updates ────────────────────────────────────────────────────
    const attendeeUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) {
      attendeeUpdates.status = body.status;
      if (body.status === "attended" && !existing!.attendedConfirmedAt) {
        attendeeUpdates.attendedConfirmedAt = new Date();
      }
    }
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
      // Type follows the festival link (the database derives it): choosing
      // "concert" detaches the show from its festival; "festival_day" needs one.
      if (body.type === "concert" && body.eventSeriesName === undefined) concertUpdates.eventSeriesId = null;
      if (body.type === "festival_day" && !body.eventSeriesName && !concert.eventSeriesId) {
        return reply.code(400).send({ error: "A festival day needs the festival's name." });
      }
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

  // ── DELETE /concerts/:id ────────────────────────────────────────────────────
  // Removes the user from the concert's attendee list. Does NOT delete the concert itself.

  app.delete("/concerts/:id", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    // Delete the concert entirely (admin action)
    const concert = await db.query.concerts.findFirst({
      where: eq(schema.concerts.id, id),
    });
    if (!concert) {
      return reply.code(404).send({ error: "Concert not found." });
    }

    // Delete all related attendee records first
    await db.delete(schema.concertAttendees).where(eq(schema.concertAttendees.concertId, id));
    // Delete all related artist links
    await db.delete(schema.concertArtists).where(eq(schema.concertArtists.concertId, id));
    // Delete the concert
    await db.delete(schema.concerts).where(eq(schema.concerts.id, id));

    return reply.code(204).send();
  });
}
