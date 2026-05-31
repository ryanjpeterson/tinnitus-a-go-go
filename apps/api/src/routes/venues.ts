/**
 * Venue routes.
 *
 *   GET    /venues                   paginated list of venues the user has shows at
 *   GET    /venues/:slug             detail + that user's concerts at this venue (also matches alias slugs)
 *   PATCH  /venues/:slug             update venue info (name, city, region, country, lat, lng, capacity)
 *   POST   /venues/:slug/photo       upload a cover photo for a venue
 *   POST   /venues/:slug/photo/url   upload a cover photo from URL
 *   DELETE /venues/:slug/photo       remove the cover photo
 *   POST   /venues/:slug/aliases     add an alias name for this venue
 *   DELETE /venues/:slug/aliases/:aliasId  remove an alias
 */

import type { FastifyInstance } from "fastify";
import { desc, eq, inArray, sql, ilike, and, ne } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { db, schema } from "../db/client.js";
import { s3, bucket } from "../lib/s3.js";
import { env } from "../lib/env.js";
import { slugify } from "@tagg/shared";
import { requireUser, requireAdmin } from "../auth/middleware.js";

/** Return a browser-accessible URL for a MinIO object key (no presign needed — bucket is public). */
function mediaUrl(key: string): string {
  const base = env.MINIO_PUBLIC_URL ?? `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`;
  return `${base}/${bucket}/${key}`;
}

export async function venueRoutes(app: FastifyInstance): Promise<void> {
  // NOTE: Per-route auth now. GET endpoints are public, write endpoints require admin.

  const listQuery = z.object({
    q: z.string().max(128).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  });

  // ── GET /venues ────────────────────────────────────────────────────────────
  // Public endpoint: lists all venues with show counts

  app.get("/venues", async (req, reply) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query.", details: parsed.error.flatten() });
    }
    const { q, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    // Show all venues (no user filtering)
    const conditions = q ? ilike(schema.venues.name, `%${q}%`) : undefined;

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: schema.venues.id,
          name: schema.venues.name,
          slug: schema.venues.slug,
          city: schema.venues.city,
          region: schema.venues.region,
          imageKey: schema.venues.imageKey,
          showCount: sql<number>`count(distinct ${schema.concerts.id})::int`,
        })
        .from(schema.venues)
        .leftJoin(schema.concerts, eq(schema.concerts.venueId, schema.venues.id))
        .where(conditions)
        .groupBy(schema.venues.id)
        .orderBy(desc(sql`count(distinct ${schema.concerts.id})`))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(distinct ${schema.venues.id})::int` })
        .from(schema.venues)
        .leftJoin(schema.concerts, eq(schema.concerts.venueId, schema.venues.id))
        .where(conditions),
    ]);

    const total = countRows[0]?.total ?? 0;
    return reply.send({
      venues: rows.map((v) => ({
        ...v,
        imageUrl: v.imageKey ? mediaUrl(v.imageKey) : null,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    });
  });

  // ── GET /venues/map ────────────────────────────────────────────────────────
  // Public endpoint: returns all venues with lat/lng coordinates for map display

  app.get("/venues/map", async (_req, reply) => {
    const rows = await db
      .select({
        id: schema.venues.id,
        name: schema.venues.name,
        slug: schema.venues.slug,
        city: schema.venues.city,
        region: schema.venues.region,
        lat: schema.venues.lat,
        lng: schema.venues.lng,
        showCount: sql<number>`count(distinct ${schema.concerts.id})::int`,
      })
      .from(schema.venues)
      .leftJoin(schema.concerts, eq(schema.concerts.venueId, schema.venues.id))
      .where(and(
        sql`${schema.venues.lat} IS NOT NULL`,
        sql`${schema.venues.lng} IS NOT NULL`,
      ))
      .groupBy(schema.venues.id)
      .orderBy(desc(sql`count(distinct ${schema.concerts.id})`));

    return reply.send({
      venues: rows.map((v) => ({
        id: v.id,
        name: v.name,
        slug: v.slug,
        city: v.city,
        region: v.region,
        lat: v.lat!,
        lng: v.lng!,
        showCount: v.showCount,
      })),
      total: rows.length,
    });
  });

  // ── GET /venues/:slug ──────────────────────────────────────────────────────
  // Public endpoint: venue detail + all concerts at this venue

  app.get("/venues/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };

    // Try direct slug first, then alias slug
    let venue = await db.query.venues.findFirst({
      where: eq(schema.venues.slug, slug),
    });

    if (!venue) {
      // Check if it's an alias slug — redirect to canonical
      const alias = await db.query.venueAliases.findFirst({
        where: eq(schema.venueAliases.slug, slug),
        with: { canonicalVenue: true },
      });
      if (alias?.canonicalVenue) {
        // Fastify 5: redirect(url) — status code set separately
        void reply.code(302).redirect(`/venues/${alias.canonicalVenue.slug}`);
        return reply;
      }
      return reply.code(404).send({ error: "Venue not found." });
    }

    // All concerts at this venue (no user filtering)
    const concertRows = await db
      .select({
        concertId: schema.concerts.id,
        date: schema.concerts.date,
        type: schema.concerts.type,
        headlinerHint: schema.concerts.headlinerHint,
        seriesName: schema.eventSeries.name,
      })
      .from(schema.concerts)
      .leftJoin(schema.eventSeries, eq(schema.concerts.eventSeriesId, schema.eventSeries.id))
      .where(eq(schema.concerts.venueId, venue.id))
      .orderBy(desc(schema.concerts.date));

    // Fetch headliner names for all these concerts in a single query
    const concertIds = concertRows.map((r) => r.concertId);
    const headlinerRows = concertIds.length > 0
      ? await db
          .select({
            concertId: schema.concertArtists.concertId,
            name: schema.artists.name,
            slug: schema.artists.slug,
          })
          .from(schema.concertArtists)
          .innerJoin(schema.artists, eq(schema.concertArtists.artistId, schema.artists.id))
          .where(
            and(
              inArray(schema.concertArtists.concertId, concertIds),
              eq(schema.concertArtists.role, "headliner"),
            ),
          )
      : [];

    const headlinerByConcert = new Map(headlinerRows.map((r) => [r.concertId, r]));

    // Count unique artists across all concerts at this venue
    const uniqueArtistsResult = concertIds.length > 0
      ? await db
          .select({ count: sql<number>`count(distinct ${schema.concertArtists.artistId})::int` })
          .from(schema.concertArtists)
          .where(inArray(schema.concertArtists.concertId, concertIds))
      : [{ count: 0 }];
    const uniqueArtists = uniqueArtistsResult[0]?.count ?? 0;

    const concerts = concertRows.map((r) => {
      const headliner = headlinerByConcert.get(r.concertId);
      return {
        id: r.concertId,
        date: r.date,
        type: r.type,
        headlinerHint: r.headlinerHint,
        // Prefer real headliner artist name; fall back to headliner_hint
        headlinerName: headliner?.name ?? r.headlinerHint ?? null,
        headlinerSlug: headliner?.slug ?? null,
        eventSeries: r.seriesName ? { name: r.seriesName } : null,
      };
    });

    // Load aliases for this venue
    const aliases = await db.query.venueAliases.findMany({
      where: eq(schema.venueAliases.canonicalVenueId, venue.id),
      orderBy: (t, { asc }) => [asc(t.activeFrom), asc(t.name)],
    });

    return reply.send({
      venue: {
        id: venue.id,
        name: venue.name,
        slug: venue.slug,
        city: venue.city,
        region: venue.region,
        country: venue.country,
        lat: venue.lat,
        lng: venue.lng,
        capacity: venue.capacity,
        imageUrl: venue.imageKey ? mediaUrl(venue.imageKey) : null,
        aliases: aliases.map((a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          activeFrom: a.activeFrom,
          activeUntil: a.activeUntil,
          notes: a.notes,
        })),
      },
      concerts,
      stats: {
        total: concerts.length,
        uniqueArtists,
        firstVisit: concerts.at(-1)?.date ?? null,
        lastVisit: concerts[0]?.date ?? null,
      },
    });
  });

  // ── PATCH /venues/:slug ────────────────────────────────────────────────────
  // Admin only

  const venuePatchBody = z.object({
    name:     z.string().min(1).max(255).optional(),
    city:     z.string().max(100).nullable().optional(),
    region:   z.string().max(100).nullable().optional(),
    country:  z.string().max(100).nullable().optional(),
    lat:      z.number().min(-90).max(90).nullable().optional(),
    lng:      z.number().min(-180).max(180).nullable().optional(),
    capacity: z.number().int().positive().nullable().optional(),
  });

  app.patch("/venues/:slug", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const venue = await db.query.venues.findFirst({
      where: eq(schema.venues.slug, slug),
    });
    if (!venue) return reply.code(404).send({ error: "Venue not found." });

    const parsed = venuePatchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body.", details: parsed.error.flatten() });
    }
    const updates = parsed.data;

    // Regenerate slug if name changes
    let newSlug = venue.slug;
    if (updates.name && updates.name !== venue.name) {
      const base = slugify(`${updates.name} ${updates.city ?? venue.city ?? ""}`);
      const conflict = await db.query.venues.findFirst({
        where: and(eq(schema.venues.slug, base), ne(schema.venues.id, venue.id)),
      });
      newSlug = conflict ? `${base}-${venue.id.slice(0, 8)}` : base;
    }

    await db
      .update(schema.venues)
      .set({
        ...(updates.name     !== undefined && { name:     updates.name }),
        ...(updates.city     !== undefined && { city:     updates.city }),
        ...(updates.region   !== undefined && { region:   updates.region }),
        ...(updates.country  !== undefined && { country:  updates.country }),
        ...(updates.lat      !== undefined && { lat:      updates.lat }),
        ...(updates.lng      !== undefined && { lng:      updates.lng }),
        ...(updates.capacity !== undefined && { capacity: updates.capacity }),
        slug: newSlug,
      })
      .where(eq(schema.venues.id, venue.id));

    return reply.send({ ok: true, slug: newSlug });
  });

  // ── POST /venues/:slug/aliases ─────────────────────────────────────────────

  const aliasBody = z.object({
    name:        z.string().min(1).max(255),
    activeFrom:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    activeUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notes:       z.string().max(500).nullable().optional(),
  });

  app.post("/venues/:slug/aliases", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const venue = await db.query.venues.findFirst({
      where: eq(schema.venues.slug, slug),
    });
    if (!venue) return reply.code(404).send({ error: "Venue not found." });

    const parsed = aliasBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body.", details: parsed.error.flatten() });
    }
    const { name, activeFrom, activeUntil, notes } = parsed.data;

    // Generate a unique slug for the alias
    const base = slugify(name);
    const existing = await db.query.venueAliases.findFirst({
      where: eq(schema.venueAliases.slug, base),
    });
    const aliasSlug = existing ? `${base}-alias-${Date.now().toString(36)}` : base;

    const [created] = await db
      .insert(schema.venueAliases)
      .values({
        canonicalVenueId: venue.id,
        name,
        slug: aliasSlug,
        activeFrom:  activeFrom  ?? null,
        activeUntil: activeUntil ?? null,
        notes:       notes       ?? null,
      })
      .returning();

    return reply.code(201).send({ ok: true, alias: created });
  });

  // ── DELETE /venues/:slug/aliases/:aliasId ──────────────────────────────────

  app.delete("/venues/:slug/aliases/:aliasId", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug, aliasId } = req.params as { slug: string; aliasId: string };

    const venue = await db.query.venues.findFirst({
      where: eq(schema.venues.slug, slug),
    });
    if (!venue) return reply.code(404).send({ error: "Venue not found." });

    await db
      .delete(schema.venueAliases)
      .where(and(
        eq(schema.venueAliases.id, aliasId),
        eq(schema.venueAliases.canonicalVenueId, venue.id),
      ));

    return reply.send({ ok: true });
  });

  // ── POST /venues/:slug/photo ───────────────────────────────────────────────

  app.post("/venues/:slug/photo", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const venue = await db.query.venues.findFirst({
      where: eq(schema.venues.slug, slug),
    });
    if (!venue) return reply.code(404).send({ error: "Venue not found." });

    const file = await req.file({ limits: { fileSize: 10 * 1024 * 1024 } });
    if (!file) return reply.code(400).send({ error: "No file uploaded." });

    const mime = file.mimetype.toLowerCase();
    const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
    if (!allowed.has(mime)) {
      await file.toBuffer().catch(() => undefined);
      return reply.code(415).send({ error: "Only JPEG, PNG, or WebP allowed for venue photos." });
    }

    const ext = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
    const objectKey = `venues/${venue.id}/cover${ext}`;

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
      req.log.error({ err }, "MinIO venue photo upload failed");
      return reply.code(502).send({ error: "Storage upload failed." });
    }

    await db
      .update(schema.venues)
      .set({ imageKey: objectKey })
      .where(eq(schema.venues.id, venue.id));

    return reply.send({ imageUrl: mediaUrl(objectKey) });
  });

  // ── POST /venues/:slug/photo/url ──────────────────────────────────────────
  // Upload cover photo from URL

  const photoUrlBody = z.object({
    url: z.string().url().max(2048),
  });

  const PHOTO_ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

  app.post("/venues/:slug/photo/url", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const venue = await db.query.venues.findFirst({
      where: eq(schema.venues.slug, slug),
    });
    if (!venue) return reply.code(404).send({ error: "Venue not found." });

    const parsed = photoUrlBody.safeParse(req.body);
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

      if (!PHOTO_ALLOWED.has(contentType)) {
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
    const objectKey = `venues/${venue.id}/cover${ext}`;

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
      req.log.error({ err }, "MinIO venue photo URL upload failed");
      return reply.code(502).send({ error: "Storage upload failed." });
    }

    // Delete old photo if different key
    if (venue.imageKey && venue.imageKey !== objectKey) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: venue.imageKey })).catch(() => undefined);
    }

    await db
      .update(schema.venues)
      .set({ imageKey: objectKey })
      .where(eq(schema.venues.id, venue.id));

    return reply.send({ imageUrl: mediaUrl(objectKey) });
  });

  // ── DELETE /venues/:slug/photo ────────────────────────────────────────────

  app.delete("/venues/:slug/photo", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const venue = await db.query.venues.findFirst({
      where: eq(schema.venues.slug, slug),
    });
    if (!venue || !venue.imageKey) return reply.code(404).send({ error: "No photo to remove." });

    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: venue.imageKey })).catch(() => undefined);
    await db
      .update(schema.venues)
      .set({ imageKey: null })
      .where(eq(schema.venues.id, venue.id));

    return reply.code(204).send();
  });
}
