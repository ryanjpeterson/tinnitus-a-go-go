/**
 * Site copy routes — editable website text content.
 *
 *   GET  /public/copy          all key→value pairs, no auth (used by frontend hook)
 *   GET  /admin/copy           all items with metadata (admin only)
 *   PATCH /admin/copy/:key     update a single value (admin only)
 */

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { requireAdmin, requireUser } from "../auth/middleware.js";

export async function copyRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /public/copy ──────────────────────────────────────────────────────
  // No auth — React Query caches this; it's the source of truth for all page text.

  app.get("/public/copy", async (_req, reply) => {
    const rows = await db.select().from(schema.siteCopy);
    const copy: Record<string, string> = {};
    for (const row of rows) copy[row.key] = row.value;
    return reply.send({ copy });
  });

  // ── GET /admin/copy ───────────────────────────────────────────────────────
  // Returns full metadata for the CMS editor UI.

  app.get(
    "/admin/copy",
    { preHandler: [requireUser, requireAdmin] },
    async (_req, reply) => {
      const items = await db
        .select()
        .from(schema.siteCopy)
        .orderBy(schema.siteCopy.section, schema.siteCopy.key);
      return reply.send({ items });
    },
  );

  // ── PATCH /admin/copy/:key ────────────────────────────────────────────────
  // Update a single copy value.  Only existing keys can be updated (no new keys via HTTP).

  app.patch(
    "/admin/copy/:key",
    { preHandler: [requireUser, requireAdmin] },
    async (req, reply) => {
      const { key } = req.params as { key: string };

      const body = z.object({ value: z.string().max(8192) }).safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: "value is required (max 8192 chars)." });
      }

      const existing = await db
        .select({ key: schema.siteCopy.key })
        .from(schema.siteCopy)
        .where(eq(schema.siteCopy.key, key))
        .limit(1);

      if (existing.length === 0) {
        return reply.code(404).send({ error: "Copy key not found." });
      }

      const [updated] = await db
        .update(schema.siteCopy)
        .set({ value: body.data.value, updatedAt: new Date() })
        .where(eq(schema.siteCopy.key, key))
        .returning();

      return reply.send({ item: updated });
    },
  );
}
