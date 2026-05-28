/**
 * Photo routes.
 *
 *   POST   /concerts/:id/photos       upload a photo or video for a concert
 *   GET    /concerts/:id/photos       list photos for a concert (with public URLs)
 *   PUT    /photos/:id/order          reorder photos for a concert
 *   DELETE /photos/:id                remove a photo (uploader or admin only)
 *   PUT    /photos/:id/artists        set artist tags on a photo (replaces all existing)
 *   GET    /photos/:id/artists        list artists tagged in a photo
 *
 * Upload pipeline:
 *   1. Validate MIME type and size.
 *   2. Stream to MinIO at `photos/originals/{photoId}.{ext}`.
 *   3. Insert `photos` row.
 *   4. Enqueue a `media-process` job.
 *   5. Return the photoId immediately.
 *
 * The worker generates WebP variants and updates `photos.variants`. Until processed,
 * GET /concerts/:id/photos returns the original URL. The bucket is set to anonymous
 * download so no presigning is required — direct public URLs are used throughout.
 */

import { randomUUID, createHash } from "node:crypto";
import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { s3, bucket } from "../lib/s3.js";
import { env } from "../lib/env.js";
import { requireUser } from "../auth/middleware.js";
import { mediaProcessQueue } from "../lib/queues.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 30 * 1024 * 1024;   // 30 MB — generous for iPhone RAW/HEIC
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;  // 500 MB — covers long-ish concert clips

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);

const ALLOWED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/mpeg",
  "video/x-m4v",
  "video/webm",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/mpeg": ".mpeg",
  "video/x-m4v": ".m4v",
  "video/webm": ".webm",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a browser-accessible URL for a MinIO object.
 *
 * The bucket is set to anonymous download so no presigning is needed. We just
 * construct the public URL directly using MINIO_PUBLIC_URL (the externally-
 * reachable address) instead of the internal Docker hostname.
 */
function mediaUrl(key: string): string {
  const base = env.MINIO_PUBLIC_URL ?? `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`;
  return `${base}/${bucket}/${key}`;
}

/** Resolve a variant map or fall back to the original key. */
function resolveUrls(
  objectKey: string,
  variants: Record<string, string> | null,
): {
  original: string;
  thumb: string | null;
  medium: string | null;
  large: string | null;
  video: string | null;
} {
  const original = mediaUrl(objectKey);
  if (!variants) return { original, thumb: null, medium: null, large: null, video: null };

  return {
    original,
    thumb:  variants["thumb"]  ? mediaUrl(variants["thumb"])  : null,
    medium: variants["medium"] ? mediaUrl(variants["medium"]) : null,
    large:  variants["large"]  ? mediaUrl(variants["large"])  : null,
    video:  variants["video"]  ? mediaUrl(variants["video"])  : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

export async function photoRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  // ── POST /concerts/:id/photos ───────────────────────────────────────────────

  app.post("/concerts/:id/photos", async (req, reply) => {
    const { id: concertId } = req.params as { id: string };
    const userId = req.user!.id;

    // Verify the user has an attendee record for this concert
    const attendee = await db.query.concertAttendees.findFirst({
      where: and(
        eq(schema.concertAttendees.userId, userId),
        eq(schema.concertAttendees.concertId, concertId),
      ),
    });
    if (!attendee) {
      return reply.code(403).send({ error: "You're not on the attendee list for this concert." });
    }

    // Use video limit as the upper bound; we'll enforce the per-type limit after buffering.
    const file = await req.file({ limits: { fileSize: MAX_VIDEO_BYTES } });
    if (!file) {
      return reply.code(400).send({ error: "No file uploaded." });
    }

    const mime = file.mimetype.toLowerCase();
    const isImage = ALLOWED_IMAGE_MIMES.has(mime);
    const isVideo = ALLOWED_VIDEO_MIMES.has(mime);

    if (!isImage && !isVideo) {
      // Drain the stream to avoid Fastify connection leak
      await file.toBuffer().catch(() => undefined);
      return reply
        .code(415)
        .send({ error: `Unsupported file type: ${mime}. Allowed: JPEG, PNG, WebP, HEIC, MP4, MOV, WebM.` });
    }

    const photoId = randomUUID();
    const originalExt = MIME_TO_EXT[mime] ?? extname(file.filename).toLowerCase() ?? ".bin";
    const objectKey = `photos/originals/${photoId}${originalExt}`;

    // Buffer the upload so we can hash it and check for duplicates
    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (err) {
      req.log.error({ err }, "Failed to read upload buffer");
      return reply.code(400).send({ error: "Upload read failed." });
    }

    // Enforce per-type size limits now that we know the actual mime
    if (isImage && buffer.length > MAX_IMAGE_BYTES) {
      return reply.code(413).send({ error: `Image too large. Max ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` });
    }
    if (isVideo && buffer.length > MAX_VIDEO_BYTES) {
      return reply.code(413).send({ error: `Video too large. Max ${MAX_VIDEO_BYTES / 1024 / 1024} MB.` });
    }

    // Duplicate detection: reject if the same file has already been uploaded to this concert
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    const duplicate = await db.query.photos.findFirst({
      where: and(
        eq(schema.photos.concertId, concertId),
        eq(schema.photos.contentHash, contentHash),
      ),
      columns: { id: true },
    });
    if (duplicate) {
      return reply.code(409).send({
        error: "This photo has already been uploaded to this concert.",
        duplicatePhotoId: duplicate.id,
      });
    }

    // Stream to MinIO
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: mime,
          ContentLength: buffer.length,
          Metadata: {
            concertId,
            uploadedBy: userId,
            originalName: encodeURIComponent(file.filename),
          },
        }),
      );
    } catch (err) {
      req.log.error({ err }, "MinIO upload failed");
      return reply.code(502).send({ error: "Storage upload failed. Try again." });
    }

    // Insert DB row
    const [photo] = await db
      .insert(schema.photos)
      .values({
        id: photoId,
        concertId,
        uploadedByUserId: userId,
        kind: isVideo ? "video" : "photo",
        objectKey,
        contentHash,
      })
      .returning({ id: schema.photos.id });

    if (!photo) {
      return reply.code(500).send({ error: "Failed to record photo." });
    }

    // Enqueue processing job (fail gracefully — raw file is already stored)
    try {
      await mediaProcessQueue.add("process", { photoId });
    } catch (err) {
      req.log.warn({ err }, "Failed to enqueue media-process job; photo will stay unprocessed.");
    }

    return reply.code(201).send({ photoId, objectKey });
  });

  // ── GET /concerts/:id/photos ────────────────────────────────────────────────

  app.get("/concerts/:id/photos", async (req, reply) => {
    const { id: concertId } = req.params as { id: string };

    // Any authenticated user can see photos for any concert.
    // Order: explicit set_order first (nulls last), then by createdAt for unordered ones.
    const photos = await db
      .select()
      .from(schema.photos)
      .where(eq(schema.photos.concertId, concertId))
      .orderBy(
        sql`${schema.photos.setOrder} ASC NULLS LAST`,
        asc(schema.photos.createdAt),
      );

    const results = photos.map((p) => {
      const urls = resolveUrls(p.objectKey, p.variants as Record<string, string> | null);
      return {
        id: p.id,
        kind: p.kind,
        width: p.width,
        height: p.height,
        durationSec: p.durationSec,
        takenAt: p.takenAt,
        processing: p.variants === null,
        setOrder: p.setOrder,
        contentHash: p.contentHash,
        urls,
        createdAt: p.createdAt,
      };
    });

    return reply.send({ photos: results });
  });

  // ── PUT /concerts/:id/photos/order ──────────────────────────────────────────
  // Reorders photos by assigning set_order = array index for each ID.
  // Only photos that belong to this concert are updated (safe against spoofing).

  app.put("/concerts/:id/photos/order", async (req, reply) => {
    const { id: concertId } = req.params as { id: string };
    const parsed = z
      .object({ order: z.array(z.string().uuid()).min(1).max(200) })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body.", details: parsed.error.flatten() });
    }

    const userId = req.user!.id;

    // Attendee check
    const attendee = await db.query.concertAttendees.findFirst({
      where: and(
        eq(schema.concertAttendees.concertId, concertId),
        eq(schema.concertAttendees.userId, userId),
      ),
    });
    if (!attendee) return reply.code(404).send({ error: "Concert not found." });

    const { order } = parsed.data;

    // Verify all IDs belong to this concert (single query)
    const owned = await db
      .select({ id: schema.photos.id })
      .from(schema.photos)
      .where(and(eq(schema.photos.concertId, concertId), inArray(schema.photos.id, order)));
    const ownedSet = new Set(owned.map((r) => r.id));

    await db.transaction(async (tx) => {
      for (let i = 0; i < order.length; i++) {
        if (!ownedSet.has(order[i]!)) continue; // skip IDs not owned by this concert
        await tx
          .update(schema.photos)
          .set({ setOrder: i })
          .where(eq(schema.photos.id, order[i]!));
      }
    });

    return reply.send({ ok: true });
  });

  // ── DELETE /photos/:id ──────────────────────────────────────────────────────

  app.delete("/photos/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.user!.id;
    const isAdmin = req.user!.isAdmin;

    const photo = await db.query.photos.findFirst({
      where: eq(schema.photos.id, id),
    });
    if (!photo) return reply.code(404).send({ error: "Photo not found." });

    if (!isAdmin && photo.uploadedByUserId !== userId) {
      return reply.code(403).send({ error: "You can only delete your own photos." });
    }

    // Delete from MinIO (original + variants)
    const keysToDelete = [photo.objectKey];
    const variants = photo.variants as Record<string, string> | null;
    if (variants) keysToDelete.push(...Object.values(variants));

    await Promise.allSettled(
      keysToDelete.map((key) =>
        s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
      ),
    );

    await db.delete(schema.photos).where(eq(schema.photos.id, id));

    return reply.code(204).send();
  });

  // ── PUT /photos/:id/artists ─────────────────────────────────────────────────
  // Replace the artist-tag set for a photo. Pass an empty array to remove all tags.
  // Caller must be an attendee of the concert the photo belongs to (or admin).

  app.put("/photos/:id/artists", async (req, reply) => {
    const { id: photoId } = req.params as { id: string };
    const userId = req.user!.id;
    const isAdmin = req.user!.isAdmin;

    const parsed = z
      .object({ artistIds: z.array(z.string().uuid()).max(50) })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body.", details: parsed.error.flatten() });
    }
    const { artistIds } = parsed.data;

    // Load the photo so we know which concert it belongs to
    const photo = await db.query.photos.findFirst({
      where: eq(schema.photos.id, photoId),
      columns: { id: true, concertId: true },
    });
    if (!photo) return reply.code(404).send({ error: "Photo not found." });

    // Only attendees (or admins) of the concert may tag photos
    if (!isAdmin) {
      const attendee = await db.query.concertAttendees.findFirst({
        where: and(
          eq(schema.concertAttendees.concertId, photo.concertId),
          eq(schema.concertAttendees.userId, userId),
        ),
        columns: { userId: true },
      });
      if (!attendee) {
        return reply.code(403).send({ error: "You must be an attendee of this concert to tag photos." });
      }
    }

    // If any artistIds provided, verify they exist (so we don't silently insert garbage)
    if (artistIds.length > 0) {
      const found = await db
        .select({ id: schema.artists.id })
        .from(schema.artists)
        .where(inArray(schema.artists.id, artistIds));
      if (found.length !== artistIds.length) {
        return reply.code(400).send({ error: "One or more artist IDs are invalid." });
      }
    }

    // Replace all existing tags in a transaction
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.photoArtists)
        .where(eq(schema.photoArtists.photoId, photoId));

      if (artistIds.length > 0) {
        await tx.insert(schema.photoArtists).values(
          artistIds.map((artistId) => ({ photoId, artistId })),
        );
      }
    });

    return reply.send({ ok: true, photoId, artistIds });
  });

  // ── GET /photos/:id/artists ─────────────────────────────────────────────────
  // Returns the artists currently tagged in a photo.

  app.get("/photos/:id/artists", async (req, reply) => {
    const { id: photoId } = req.params as { id: string };

    const photo = await db.query.photos.findFirst({
      where: eq(schema.photos.id, photoId),
      columns: { id: true },
    });
    if (!photo) return reply.code(404).send({ error: "Photo not found." });

    const rows = await db
      .select({
        id:       schema.artists.id,
        name:     schema.artists.name,
        slug:     schema.artists.slug,
        imageKey: schema.artists.imageKey,
      })
      .from(schema.photoArtists)
      .innerJoin(schema.artists, eq(schema.photoArtists.artistId, schema.artists.id))
      .where(eq(schema.photoArtists.photoId, photoId));

    return reply.send({
      artists: rows.map((a) => ({
        ...a,
        imageUrl: a.imageKey ? mediaUrl(a.imageKey) : null,
      })),
    });
  });
}
