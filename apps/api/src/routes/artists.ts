/**
 * Artist routes.
 *
 *   GET   /artists                list, filtered to artists the user has shows for
 *   GET   /artists/:slug          detail + that user's concerts featuring this artist
 *   PATCH /artists/:slug          update artist info (name, genre, bio, mbid)
 *   POST  /artists/:slug/image    upload / replace artist image
 *   GET   /artists/:slug/photos   all photos tagged with this artist (across all concerts)
 */

import type { FastifyInstance } from "fastify";
import { desc, eq, inArray, sql, ilike, and, ne, asc } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db, schema } from "../db/client.js";
import { s3, bucket } from "../lib/s3.js";
import { env } from "../lib/env.js";
import { slugify } from "@tagg/shared";
import { requireUser } from "../auth/middleware.js";

/** Return a browser-accessible URL for a MinIO object key. */
function mediaUrl(key: string): string {
  const base = env.MINIO_PUBLIC_URL ?? `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`;
  return `${base}/${bucket}/${key}`;
}

export async function artistRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  // ── GET /artists ────────────────────────────────────────────────────────────

  const listQuery = z.object({
    q: z.string().max(128).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  });

  app.get("/artists", async (req, reply) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query.", details: parsed.error.flatten() });
    }
    const { q, page, limit } = parsed.data;
    const userId = req.user!.id;
    const offset = (page - 1) * limit;

    // Subquery: concert IDs this user has an attendance record for
    const userConcertIds = db
      .select({ id: schema.concertAttendees.concertId })
      .from(schema.concertAttendees)
      .where(eq(schema.concertAttendees.userId, userId));

    const conditions = q
      ? and(
          inArray(schema.concertArtists.concertId, userConcertIds),
          ilike(schema.artists.name, `%${q}%`),
        )
      : inArray(schema.concertArtists.concertId, userConcertIds);

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: schema.artists.id,
          name: schema.artists.name,
          slug: schema.artists.slug,
          genre: schema.artists.genre,
          imageKey: schema.artists.imageKey,
          showCount: sql<number>`count(distinct ${schema.concertArtists.concertId})::int`,
        })
        .from(schema.artists)
        .innerJoin(schema.concertArtists, eq(schema.concertArtists.artistId, schema.artists.id))
        .where(conditions!)
        .groupBy(schema.artists.id)
        .orderBy(desc(sql`count(distinct ${schema.concertArtists.concertId})`))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(distinct ${schema.artists.id})::int` })
        .from(schema.artists)
        .innerJoin(schema.concertArtists, eq(schema.concertArtists.artistId, schema.artists.id))
        .where(conditions!),
    ]);

    const total = countRows[0]?.total ?? 0;
    return reply.send({
      artists: rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    });
  });

  // ── GET /artists/:slug ──────────────────────────────────────────────────────

  app.get("/artists/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const userId = req.user!.id;

    const artist = await db.query.artists.findFirst({
      where: eq(schema.artists.slug, slug),
    });
    if (!artist) return reply.code(404).send({ error: "Artist not found." });

    // Concerts this user has that feature this artist, newest first
    const concertRows = await db
      .select({
        concertId: schema.concerts.id,
        date: schema.concerts.date,
        type: schema.concerts.type,
        venueName: schema.venues.name,
        venueCity: schema.venues.city,
        venueRegion: schema.venues.region,
        seriesName: schema.eventSeries.name,
        seriesSlug: schema.eventSeries.slug,
        status: schema.concertAttendees.status,
        rating: schema.concertAttendees.rating,
        role: schema.concertArtists.role,
        appearanceNotes: schema.concertArtists.appearanceNotes,
      })
      .from(schema.concertArtists)
      .innerJoin(schema.concerts, eq(schema.concertArtists.concertId, schema.concerts.id))
      .innerJoin(
        schema.concertAttendees,
        and(
          eq(schema.concertAttendees.concertId, schema.concerts.id),
          eq(schema.concertAttendees.userId, userId),
        ),
      )
      .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
      .leftJoin(schema.eventSeries, eq(schema.concerts.eventSeriesId, schema.eventSeries.id))
      .where(eq(schema.concertArtists.artistId, artist.id))
      .orderBy(desc(schema.concerts.date));

    const concerts = concertRows.map((r) => ({
      id: r.concertId,
      date: r.date,
      type: r.type,
      role: r.role,
      appearanceNotes: r.appearanceNotes,
      venue: r.venueName
        ? { name: r.venueName, city: r.venueCity, region: r.venueRegion }
        : null,
      eventSeries: r.seriesName ? { name: r.seriesName, slug: r.seriesSlug } : null,
      attendance: { status: r.status, rating: r.rating },
    }));

    return reply.send({
      artist: {
        id: artist.id,
        name: artist.name,
        slug: artist.slug,
        mbid: artist.mbid,
        genre: artist.genre,
        bio: artist.bio,
        imageKey: artist.imageKey,
        imageUrl: artist.imageKey ? mediaUrl(artist.imageKey) : null,
      },
      concerts,
      stats: {
        total: concerts.length,
        attended: concerts.filter((c) => c.attendance.status === "attended").length,
        upcoming: concerts.filter((c) => c.attendance.status === "attending").length,
        firstSeen: concerts.at(-1)?.date ?? null,
        lastSeen: concerts.find((c) => c.attendance.status === "attended")?.date ?? null,
      },
    });
  });

  // ── PATCH /artists/:slug ────────────────────────────────────────────────────

  const patchBody = z.object({
    name:  z.string().min(1).max(255).optional(),
    genre: z.string().max(100).nullable().optional(),
    bio:   z.string().max(2000).nullable().optional(),
    mbid:  z.string().uuid().nullable().optional(),
  });

  app.patch("/artists/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const artist = await db.query.artists.findFirst({
      where: eq(schema.artists.slug, slug),
    });
    if (!artist) return reply.code(404).send({ error: "Artist not found." });

    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body.", details: parsed.error.flatten() });
    }
    const updates = parsed.data;

    // If name changes, regenerate slug (ensure uniqueness)
    let newSlug = artist.slug;
    if (updates.name && updates.name !== artist.name) {
      const base = slugify(updates.name);
      const conflict = await db.query.artists.findFirst({
        where: and(eq(schema.artists.slug, base), ne(schema.artists.id, artist.id)),
      });
      newSlug = conflict ? `${base}-${artist.id.slice(0, 8)}` : base;
    }

    await db
      .update(schema.artists)
      .set({
        ...(updates.name  !== undefined && { name:  updates.name }),
        ...(updates.genre !== undefined && { genre: updates.genre }),
        ...(updates.bio   !== undefined && { bio:   updates.bio }),
        ...(updates.mbid  !== undefined && { mbid:  updates.mbid }),
        slug: newSlug,
      })
      .where(eq(schema.artists.id, artist.id));

    return reply.send({ ok: true, slug: newSlug });
  });

  // ── POST /artists/:slug/image ───────────────────────────────────────────────

  app.post("/artists/:slug/image", async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const artist = await db.query.artists.findFirst({
      where: eq(schema.artists.slug, slug),
    });
    if (!artist) return reply.code(404).send({ error: "Artist not found." });

    const file = await req.file({ limits: { fileSize: 10 * 1024 * 1024 } });
    if (!file) return reply.code(400).send({ error: "No file uploaded." });

    const mime = file.mimetype.toLowerCase();
    const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
    if (!allowed.has(mime)) {
      await file.toBuffer().catch(() => undefined);
      return reply.code(415).send({ error: "Only JPEG, PNG, or WebP allowed." });
    }

    const ext = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
    const objectKey = `artists/${artist.id}/image${ext}`;

    try {
      const buffer = await file.toBuffer();
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
      req.log.error({ err }, "MinIO artist image upload failed");
      return reply.code(502).send({ error: "Storage upload failed." });
    }

    await db
      .update(schema.artists)
      .set({ imageKey: objectKey })
      .where(eq(schema.artists.id, artist.id));

    return reply.send({ imageUrl: mediaUrl(objectKey) });
  });

  // ── GET /artists/:slug/photos ───────────────────────────────────────────────
  // Returns all photos tagged with this artist that belong to concerts the
  // current user attended. Includes concert + venue context for grouping.

  app.get("/artists/:slug/photos", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const userId = req.user!.id;

    const artist = await db.query.artists.findFirst({
      where: eq(schema.artists.slug, slug),
      columns: { id: true, name: true, slug: true },
    });
    if (!artist) return reply.code(404).send({ error: "Artist not found." });

    // Subquery: concert IDs the current user has an attendee record for
    const userConcertIds = db
      .select({ id: schema.concertAttendees.concertId })
      .from(schema.concertAttendees)
      .where(eq(schema.concertAttendees.userId, userId));

    const rows = await db
      .select({
        photoId:       schema.photos.id,
        objectKey:     schema.photos.objectKey,
        variants:      schema.photos.variants,
        kind:          schema.photos.kind,
        width:         schema.photos.width,
        height:        schema.photos.height,
        takenAt:       schema.photos.takenAt,
        concertId:     schema.concerts.id,
        concertDate:   schema.concerts.date,
        venueName:     schema.venues.name,
        venueCity:     schema.venues.city,
        venueRegion:   schema.venues.region,
      })
      .from(schema.photoArtists)
      .innerJoin(schema.photos,   eq(schema.photoArtists.photoId, schema.photos.id))
      .innerJoin(schema.concerts, eq(schema.photos.concertId, schema.concerts.id))
      .leftJoin(schema.venues,    eq(schema.concerts.venueId, schema.venues.id))
      .where(
        and(
          eq(schema.photoArtists.artistId, artist.id),
          inArray(schema.photos.concertId, userConcertIds),
        ),
      )
      .orderBy(desc(schema.concerts.date), asc(schema.photos.setOrder), asc(schema.photos.createdAt));

    const photos = rows.map((r) => {
      const variants = r.variants as Record<string, string> | null;
      const base = env.MINIO_PUBLIC_URL ?? `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`;
      const mk = (k: string) => `${base}/${bucket}/${k}`;
      return {
        id:        r.photoId,
        kind:      r.kind,
        width:     r.width,
        height:    r.height,
        takenAt:   r.takenAt,
        urls: {
          original: mk(r.objectKey),
          thumb:    variants?.["thumb"]  ? mk(variants["thumb"])  : null,
          medium:   variants?.["medium"] ? mk(variants["medium"]) : null,
          large:    variants?.["large"]  ? mk(variants["large"])  : null,
        },
        concert: {
          id:     r.concertId,
          date:   r.concertDate,
          venue:  r.venueName ? { name: r.venueName, city: r.venueCity, region: r.venueRegion } : null,
        },
      };
    });

    return reply.send({ artist, photos, total: photos.length });
  });
}
