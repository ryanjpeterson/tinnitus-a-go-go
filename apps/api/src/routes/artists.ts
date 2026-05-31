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
import { desc, eq, inArray, sql, ilike, and, ne, asc, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db, schema } from "../db/client.js";
import { s3, bucket } from "../lib/s3.js";
import { env } from "../lib/env.js";
import { slugify } from "@tagg/shared";
import { requireUser, requireAdmin } from "../auth/middleware.js";

/** Return a browser-accessible URL for a MinIO object key. */
function mediaUrl(key: string): string {
  const base = env.MINIO_PUBLIC_URL ?? `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`;
  return `${base}/${bucket}/${key}`;
}

export async function artistRoutes(app: FastifyInstance): Promise<void> {
  // NOTE: Per-route auth now. GET endpoints are public, write endpoints require admin.

  // ── GET /artists ────────────────────────────────────────────────────────────
  // Public endpoint: lists all artists with show counts

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
    const offset = (page - 1) * limit;

    // Show all artists (no user filtering)
    const conditions = q
      ? ilike(schema.artists.name, `%${q}%`)
      : undefined;

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
        .leftJoin(schema.concertArtists, eq(schema.concertArtists.artistId, schema.artists.id))
        .where(conditions)
        .groupBy(schema.artists.id)
        .orderBy(desc(sql`count(distinct ${schema.concertArtists.concertId})`))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(distinct ${schema.artists.id})::int` })
        .from(schema.artists)
        .leftJoin(schema.concertArtists, eq(schema.concertArtists.artistId, schema.artists.id))
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
  // Public endpoint: artist detail + all concerts featuring this artist

  app.get("/artists/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const artist = await db.query.artists.findFirst({
      where: eq(schema.artists.slug, slug),
    });
    if (!artist) return reply.code(404).send({ error: "Artist not found." });

    // All concerts featuring this artist, newest first
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
        role: schema.concertArtists.role,
        appearanceNotes: schema.concertArtists.appearanceNotes,
      })
      .from(schema.concertArtists)
      .innerJoin(schema.concerts, eq(schema.concertArtists.concertId, schema.concerts.id))
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
        firstSeen: concerts.at(-1)?.date ?? null,
        lastSeen: concerts.at(0)?.date ?? null,
      },
    });
  });

  // ── PATCH /artists/:slug ────────────────────────────────────────────────────
  // Admin only

  const patchBody = z.object({
    name:  z.string().min(1).max(255).optional(),
    genre: z.string().max(100).nullable().optional(),
    bio:   z.string().max(2000).nullable().optional(),
    mbid:  z.string().uuid().nullable().optional(),
  });

  app.patch("/artists/:slug", { preHandler: [requireAdmin] }, async (req, reply) => {
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
  // Admin only

  app.post("/artists/:slug/image", { preHandler: [requireAdmin] }, async (req, reply) => {
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

  // ── GET /artists/:slug/setlists ─────────────────────────────────────────────
  // Returns all setlists for this artist. Public endpoint.

  app.get("/artists/:slug/setlists", async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const artist = await db.query.artists.findFirst({
      where: eq(schema.artists.slug, slug),
      columns: { id: true, name: true, slug: true, mbid: true },
    });
    if (!artist) return reply.code(404).send({ error: "Artist not found." });

    // Get all setlists for this artist
    const setlistRows = await db
      .select({
        setlistId: schema.setlists.id,
        setlistfmId: schema.setlists.setlistfmId,
        concertId: schema.concerts.id,
        concertDate: schema.concerts.date,
        venueName: schema.venues.name,
        venueCity: schema.venues.city,
      })
      .from(schema.setlists)
      .innerJoin(schema.concerts, eq(schema.setlists.concertId, schema.concerts.id))
      .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
      .where(eq(schema.setlists.artistId, artist.id))
      .orderBy(desc(schema.concerts.date));

    if (setlistRows.length === 0) {
      return reply.send({ artist, setlists: [], total: 0 });
    }

    // Get songs for each setlist
    const setlistIds = setlistRows.map((r) => r.setlistId);
    const songRows = await db
      .select({
        setlistId: schema.setlistSongs.setlistId,
        position: schema.setlistSongs.position,
        songName: schema.setlistSongs.songName,
        isCover: schema.setlistSongs.isCover,
      })
      .from(schema.setlistSongs)
      .where(inArray(schema.setlistSongs.setlistId, setlistIds))
      .orderBy(schema.setlistSongs.position);

    // Group songs by setlist
    const songsBySetlist = new Map<string, typeof songRows>();
    for (const row of songRows) {
      const list = songsBySetlist.get(row.setlistId) ?? [];
      list.push(row);
      songsBySetlist.set(row.setlistId, list);
    }

    const setlists = setlistRows.map((r) => ({
      id: r.setlistId,
      setlistfmId: r.setlistfmId,
      concertId: r.concertId,
      concertDate: r.concertDate,
      venue: r.venueName ? { name: r.venueName, city: r.venueCity } : null,
      songs: (songsBySetlist.get(r.setlistId) ?? []).map((s) => ({
        position: s.position,
        name: s.songName,
        isCover: s.isCover,
      })),
    }));

    return reply.send({ artist, setlists, total: setlists.length });
  });

  // ── GET /artists/:slug/photos ───────────────────────────────────────────────
  // Returns all photos tagged with this artist. Public endpoint.

  app.get("/artists/:slug/photos", async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const artist = await db.query.artists.findFirst({
      where: eq(schema.artists.slug, slug),
      columns: { id: true, name: true, slug: true },
    });
    if (!artist) return reply.code(404).send({ error: "Artist not found." });

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
      .where(eq(schema.photoArtists.artistId, artist.id))
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
