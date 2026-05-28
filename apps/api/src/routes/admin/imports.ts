/**
 * Admin endpoints for CSV imports.
 *
 *   POST   /admin/imports         — multipart upload; writes file to MinIO, inserts an
 *                                    imports row, enqueues a csv-import job. Returns
 *                                    `{ importId }`.
 *   GET    /admin/imports         — list imports created by the current admin user
 *   GET    /admin/imports/:id     — detailed status for one import (poll target)
 *
 * All routes admin-gated via `requireAdmin`. Upload size capped to 5 MB — the user's
 * historical CSV is ~46 KB, so this leaves headroom for future imports.
 */
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { QUEUE_CSV_IMPORT } from "@tagg/shared";
import { db, schema } from "../../db/client.js";
import { requireUser, requireAdmin } from "../../auth/middleware.js";
import { s3, bucket } from "../../lib/s3.js";
import { csvImportQueue } from "../../lib/queues.js";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function adminImportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);
  app.addHook("preHandler", requireAdmin);

  app.post("/admin/imports", async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_UPLOAD_BYTES } });
    if (!file) return reply.code(400).send({ error: "No file uploaded." });

    // Buffer the whole file — caps at 5 MB so memory pressure is fine.
    const buf = await file.toBuffer();
    if (file.file.truncated) {
      return reply.code(413).send({ error: "File exceeds 5 MB limit." });
    }

    const userId = req.user!.id;
    const importId = crypto.randomUUID();
    const objectKey = `imports/${importId}.csv`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: buf,
        ContentType: "text/csv",
      }),
    );

    await db.insert(schema.imports).values({
      id: importId,
      userId,
      objectKey,
      originalFilename: file.filename ?? null,
      status: "queued",
    });

    await csvImportQueue.add(QUEUE_CSV_IMPORT, { importId, userId, objectKey }, { jobId: importId });

    return reply.code(202).send({ importId });
  });

  app.get("/admin/imports", async (req, reply) => {
    const rows = await db.query.imports.findMany({
      where: eq(schema.imports.userId, req.user!.id),
      orderBy: [desc(schema.imports.createdAt)],
      limit: 50,
    });
    return reply.send({ imports: rows });
  });

  app.get("/admin/imports/:id", async (req, reply) => {
    const p = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "Invalid id." });

    const row = await db.query.imports.findFirst({
      where: eq(schema.imports.id, p.data.id),
    });
    if (!row) return reply.code(404).send({ error: "Not found." });
    if (row.userId !== req.user!.id) return reply.code(403).send({ error: "Forbidden." });
    return reply.send(row);
  });
}
