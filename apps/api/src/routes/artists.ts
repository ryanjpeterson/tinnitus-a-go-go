/**
 * Artist routes.
 *
 *   GET   /artists                list, filtered to artists the user has shows for
 *   GET   /artists/:slug          detail + that user's concerts featuring this artist
 *   PATCH /artists/:slug          update artist info (name, genre, bio, mbid)
 *   POST  /artists/:slug/image    upload / replace artist image
 *   POST  /artists/:slug/image/url  import artist image from URL
 *   DELETE /artists/:slug/image   remove artist image
 *   POST  /artists/:slug/enrich   fetch artist data from Last.fm
 *   GET   /artists/:slug/photos   all photos tagged with this artist (across all concerts)
 *   GET   /artists/:slug/setlists all setlists for this artist
 */

import type { FastifyInstance } from "fastify";
import { desc, eq, inArray, sql, ilike, and, ne, asc, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db, schema } from "../db/client.js";
import { s3, bucket } from "../lib/s3.js";
import { env } from "../lib/env.js";
import { slugify } from "@tagg/shared";
import { requireUser, requireAdmin } from "../auth/middleware.js";
import { isLastfmConfigured, fetchArtistEnrichment } from "../lib/lastfm.js";
import { artistEnrichQueue } from "../lib/queues.js";
import { QUEUE_ARTIST_ENRICH } from "@tagg/shared";

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

  // ── POST /artists/:slug/image/url ──────────────────────────────────────────
  // Import artist image from URL (admin only)

  const imageUrlBody = z.object({
    url: z.string().url().max(2048),
  });

  const IMAGE_ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

  app.post("/artists/:slug/image/url", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const artist = await db.query.artists.findFirst({
      where: eq(schema.artists.slug, slug),
    });
    if (!artist) return reply.code(404).send({ error: "Artist not found." });

    const parsed = imageUrlBody.safeParse(req.body);
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

      if (!IMAGE_ALLOWED.has(contentType)) {
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
    const objectKey = `artists/${artist.id}/image${ext}`;

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
      req.log.error({ err }, "MinIO artist image URL upload failed");
      return reply.code(502).send({ error: "Storage upload failed." });
    }

    // Delete old image if different key
    if (artist.imageKey && artist.imageKey !== objectKey) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: artist.imageKey })).catch(() => undefined);
    }

    await db
      .update(schema.artists)
      .set({ imageKey: objectKey })
      .where(eq(schema.artists.id, artist.id));

    return reply.send({ imageUrl: mediaUrl(objectKey) });
  });

  // ── DELETE /artists/:slug/image ────────────────────────────────────────────
  // Remove artist image (admin only)

  app.delete("/artists/:slug/image", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const artist = await db.query.artists.findFirst({
      where: eq(schema.artists.slug, slug),
    });
    if (!artist || !artist.imageKey) return reply.code(404).send({ error: "No image to remove." });

    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: artist.imageKey })).catch(() => undefined);
    await db
      .update(schema.artists)
      .set({ imageKey: null })
      .where(eq(schema.artists.id, artist.id));

    return reply.code(204).send();
  });

  // ── POST /artists/:slug/enrich ─────────────────────────────────────────────
  // Fetch artist data from Last.fm (admin only)

  const enrichBody = z.object({
    // Which fields to update (all by default)
    updateBio: z.boolean().optional().default(true),
    updateGenre: z.boolean().optional().default(true),
    updateImage: z.boolean().optional().default(true),
    updateMbid: z.boolean().optional().default(true),
    // Force update even if field already has a value
    overwrite: z.boolean().optional().default(false),
  });

  app.post("/artists/:slug/enrich", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };

    if (!isLastfmConfigured()) {
      return reply.code(503).send({ error: "Last.fm API key is not configured." });
    }

    const artist = await db.query.artists.findFirst({
      where: eq(schema.artists.slug, slug),
    });
    if (!artist) return reply.code(404).send({ error: "Artist not found." });

    const parsed = enrichBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body.", details: parsed.error.flatten() });
    }
    const opts = parsed.data;

    // Fetch from Last.fm
    let enrichment;
    try {
      enrichment = await fetchArtistEnrichment(artist.name, artist.mbid);
    } catch (err) {
      req.log.error({ err, artist: artist.name }, "Last.fm enrichment failed");
      return reply.code(502).send({
        error: err instanceof Error ? err.message : "Failed to fetch from Last.fm",
      });
    }

    if (!enrichment) {
      return reply.code(404).send({ error: "Artist not found on Last.fm." });
    }

    // Build updates object
    const updates: Record<string, unknown> = {};
    const fetched: Record<string, unknown> = {};

    if (opts.updateBio && enrichment.bio && (opts.overwrite || !artist.bio)) {
      updates.bio = enrichment.bio;
      fetched.bio = enrichment.bio;
    }

    if (opts.updateGenre && enrichment.genre && (opts.overwrite || !artist.genre)) {
      updates.genre = enrichment.genre;
      fetched.genre = enrichment.genre;
    }

    if (opts.updateMbid && enrichment.mbid && (opts.overwrite || !artist.mbid)) {
      updates.mbid = enrichment.mbid;
      fetched.mbid = enrichment.mbid;
    }

    // Handle image separately - download and store in MinIO
    let newImageUrl: string | null = null;
    if (opts.updateImage && enrichment.imageUrl && (opts.overwrite || !artist.imageKey)) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15_000);
        const res = await fetch(enrichment.imageUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; TinnitusBot/1.0)" },
        });
        clearTimeout(timer);

        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Determine content type from magic bytes
          const magicBytes = buffer.slice(0, 4);
          const isJpeg = magicBytes[0] === 0xff && magicBytes[1] === 0xd8;
          const isPng = magicBytes[0] === 0x89 && magicBytes[1] === 0x50;
          const isWebp = magicBytes[0] === 0x52 && magicBytes[1] === 0x49;

          if (isJpeg || isPng || isWebp) {
            const ext = isPng ? ".png" : isWebp ? ".webp" : ".jpg";
            const contentType = isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg";
            const objectKey = `artists/${artist.id}/image${ext}`;

            await s3.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: objectKey,
                Body: buffer,
                ContentType: contentType,
                ContentLength: buffer.length,
              }),
            );

            // Delete old image if different
            if (artist.imageKey && artist.imageKey !== objectKey) {
              await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: artist.imageKey })).catch(() => undefined);
            }

            updates.imageKey = objectKey;
            newImageUrl = mediaUrl(objectKey);
            fetched.imageUrl = newImageUrl;
          }
        }
      } catch (err) {
        req.log.warn({ err, artist: artist.name }, "Failed to download Last.fm image");
        // Continue without image - not a fatal error
      }
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await db
        .update(schema.artists)
        .set(updates)
        .where(eq(schema.artists.id, artist.id));
    }

    return reply.send({
      ok: true,
      updated: Object.keys(updates),
      fetched: {
        ...fetched,
        listeners: enrichment.listeners,
        playcount: enrichment.playcount,
      },
    });
  });

  // ── POST /artists/:slug/enrich/queue ───────────────────────────────────────
  // Queue artist enrichment for background processing (admin only)

  app.post("/artists/:slug/enrich/queue", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };

    if (!isLastfmConfigured()) {
      return reply.code(503).send({ error: "Last.fm API key is not configured." });
    }

    const artist = await db.query.artists.findFirst({
      where: eq(schema.artists.slug, slug),
    });
    if (!artist) return reply.code(404).send({ error: "Artist not found." });

    await artistEnrichQueue.add(
      QUEUE_ARTIST_ENRICH,
      {
        artistId: artist.id,
        artistName: artist.name,
        mbid: artist.mbid,
        overwrite: false,
      },
      { jobId: `enrich-${artist.id}` },
    );

    return reply.send({ ok: true, queued: true });
  });

  // ── POST /artists/enrich/bulk ──────────────────────────────────────────────
  // Queue enrichment for all artists missing data (admin only)

  const bulkEnrichBody = z.object({
    // Only enrich artists missing specific fields
    missingBio: z.boolean().optional().default(true),
    missingImage: z.boolean().optional().default(true),
    missingGenre: z.boolean().optional().default(false),
    // Limit number of artists to queue (safety)
    limit: z.number().int().min(1).max(500).optional().default(100),
  });

  app.post("/artists/enrich/bulk", { preHandler: [requireAdmin] }, async (req, reply) => {
    if (!isLastfmConfigured()) {
      return reply.code(503).send({ error: "Last.fm API key is not configured." });
    }

    const parsed = bulkEnrichBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body.", details: parsed.error.flatten() });
    }
    const { missingBio, missingImage, missingGenre, limit } = parsed.data;

    // Build conditions for artists that need enrichment
    const conditions: ReturnType<typeof eq>[] = [];
    if (missingBio) conditions.push(sql`${schema.artists.bio} IS NULL`);
    if (missingImage) conditions.push(sql`${schema.artists.imageKey} IS NULL`);
    if (missingGenre) conditions.push(sql`${schema.artists.genre} IS NULL`);

    if (conditions.length === 0) {
      return reply.code(400).send({ error: "At least one filter must be enabled." });
    }

    // Find artists needing enrichment (using OR for any missing field)
    const artists = await db
      .select({ id: schema.artists.id, name: schema.artists.name, mbid: schema.artists.mbid })
      .from(schema.artists)
      .where(sql`(${sql.join(conditions, sql` OR `)})`)
      .limit(limit);

    // Queue jobs
    const jobs = artists.map((a) => ({
      name: QUEUE_ARTIST_ENRICH,
      data: {
        artistId: a.id,
        artistName: a.name,
        mbid: a.mbid,
        overwrite: false,
      },
      opts: { jobId: `enrich-${a.id}` },
    }));

    if (jobs.length > 0) {
      await artistEnrichQueue.addBulk(jobs);
    }

    return reply.send({
      ok: true,
      queued: jobs.length,
      total: artists.length,
    });
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
