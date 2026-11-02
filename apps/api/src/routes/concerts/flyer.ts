/**
 * POST   /concerts/:id/flyer      upload or replace the flyer
 * POST   /concerts/:id/flyer/url  fetch the flyer from a URL
 * DELETE /concerts/:id/flyer      remove it
 */

import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db, schema } from "../../db/client.js";
import { s3, bucket, mediaUrl } from "../../lib/s3.js";
import { requireAdmin } from "../../auth/middleware.js";

export function concertFlyerRoutes(app: FastifyInstance): void {
  // ── POST /concerts/:id/flyer ────────────────────────────────────────────────

  const FLYER_ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

  app.post("/concerts/:id/flyer", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const concert = await db.query.concerts.findFirst({
      where: eq(schema.concerts.id, id),
    });
    if (!concert) return reply.code(404).send({ error: "Concert not found." });

    const file = await req.file({ limits: { fileSize: 10 * 1024 * 1024 } });
    if (!file) return reply.code(400).send({ error: "No file uploaded." });

    const mime = file.mimetype.toLowerCase();
    if (!FLYER_ALLOWED.has(mime)) {
      await file.toBuffer().catch(() => undefined);
      return reply.code(415).send({ error: "Only JPEG, PNG, or WebP allowed for flyers." });
    }

    const ext = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
    const objectKey = `concerts/${id}/flyer${ext}`;

    const buffer = await file.toBuffer();
    const flyerHash = createHash("sha256").update(buffer).digest("hex");

    // Duplicate detection: reject if this is the same file as the current flyer
    if (concert.flyerHash && concert.flyerHash === flyerHash) {
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
      req.log.error({ err }, "MinIO flyer upload failed");
      return reply.code(502).send({ error: "Storage upload failed." });
    }

    // Delete old flyer from MinIO if it exists and has a different key
    if (concert.flyerKey && concert.flyerKey !== objectKey) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: concert.flyerKey })).catch(() => undefined);
    }

    await db
      .update(schema.concerts)
      .set({ flyerKey: objectKey, flyerHash })
      .where(eq(schema.concerts.id, id));

    return reply.send({ flyerUrl: mediaUrl(objectKey) });
  });

  // ── POST /concerts/:id/flyer/url ─────────────────────────────────────────────
  // Upload a flyer by fetching it from a URL

  const flyerUrlBody = z.object({
    url: z.string().url().max(2048),
  });

  app.post("/concerts/:id/flyer/url", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const concert = await db.query.concerts.findFirst({
      where: eq(schema.concerts.id, id),
    });
    if (!concert) return reply.code(404).send({ error: "Concert not found." });

    const parsed = flyerUrlBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid URL.", details: parsed.error.flatten() });
    }
    const { url } = parsed.data;

    // Only allow http/https
    if (!/^https?:\/\//i.test(url)) {
      return reply.code(400).send({ error: "Only HTTP/HTTPS URLs are supported." });
    }

    // Fetch the image with timeout
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

      // Validate content type
      if (!FLYER_ALLOWED.has(contentType)) {
        // Try to infer from URL extension as fallback
        const urlLower = url.toLowerCase();
        if (urlLower.includes(".jpg") || urlLower.includes(".jpeg")) {
          contentType = "image/jpeg";
        } else if (urlLower.includes(".png")) {
          contentType = "image/png";
        } else if (urlLower.includes(".webp")) {
          contentType = "image/webp";
        } else {
          return reply.code(415).send({
            error: "URL does not point to a valid image. Only JPEG, PNG, or WebP are allowed."
          });
        }
      }

      const arrayBuffer = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);

      // Check file size (10MB limit)
      if (buffer.length > 10 * 1024 * 1024) {
        return reply.code(413).send({ error: "Image too large. Maximum size is 10MB." });
      }

      // Sanity check: verify it looks like an image (check magic bytes)
      const magicBytes = buffer.slice(0, 4);
      const isJpeg = magicBytes[0] === 0xff && magicBytes[1] === 0xd8;
      const isPng = magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4e && magicBytes[3] === 0x47;
      const isWebp = magicBytes[0] === 0x52 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46 && magicBytes[3] === 0x46;

      if (!isJpeg && !isPng && !isWebp) {
        return reply.code(415).send({
          error: "URL does not point to a valid image file."
        });
      }

      // Update content type based on magic bytes if needed
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
    const objectKey = `concerts/${id}/flyer${ext}`;

    const flyerHash = createHash("sha256").update(buffer).digest("hex");

    // Duplicate detection
    if (concert.flyerHash && concert.flyerHash === flyerHash) {
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
      req.log.error({ err }, "MinIO flyer URL upload failed");
      return reply.code(502).send({ error: "Storage upload failed." });
    }

    // Delete old flyer if different key
    if (concert.flyerKey && concert.flyerKey !== objectKey) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: concert.flyerKey })).catch(() => undefined);
    }

    await db
      .update(schema.concerts)
      .set({ flyerKey: objectKey, flyerHash })
      .where(eq(schema.concerts.id, id));

    return reply.send({ flyerUrl: mediaUrl(objectKey) });
  });

  // ── DELETE /concerts/:id/flyer ──────────────────────────────────────────────

  app.delete("/concerts/:id/flyer", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const concert = await db.query.concerts.findFirst({
      where: eq(schema.concerts.id, id),
    });
    if (!concert || !concert.flyerKey) return reply.code(404).send({ error: "No flyer to remove." });

    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: concert.flyerKey })).catch(() => undefined);
    await db.update(schema.concerts).set({ flyerKey: null, flyerHash: null }).where(eq(schema.concerts.id, id));

    return reply.code(204).send();
  });
}
