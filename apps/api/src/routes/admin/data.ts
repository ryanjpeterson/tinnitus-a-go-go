/**
 * Admin data cleanup.
 *
 *   GET  /admin/data/duplicates?type=venue|artist   suggested duplicate groups
 *   GET  /admin/data/merge-preview?type&keepId&removeId
 *   POST /admin/data/merge      { type, keepId, removeIds[] }   merge into keepId
 *   POST /admin/data/dismiss    { type, ids[] }                 "not a duplicate"
 *   GET  /admin/data/merges                                     merge history
 *   POST /admin/data/merges/:id/undo                            undo the latest merge
 *   GET  /admin/data/health                                     data health checks
 *   POST /admin/data/health/fix { check, value?, to? }
 *   GET  /admin/data/similar?type&name&city                     for the Add show warning
 */

import type { FastifyInstance } from "fastify";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../../db/client.js";
import { requireAdmin } from "../../auth/middleware.js";
import { dismissPair, findDuplicates, findSimilar } from "../../lib/duplicates.js";
import { mergeRecords, previewMerge, undoMerge } from "../../lib/merge.js";
import { applyFix, runHealthChecks } from "../../lib/data-health.js";

const typeSchema = z.enum(["venue", "artist"]);

export async function adminDataRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAdmin);

  app.get("/admin/data/duplicates", async (req, reply) => {
    const parsed = z.object({ type: typeSchema }).safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "type must be venue or artist." });
    return reply.send({ groups: await findDuplicates(parsed.data.type) });
  });

  app.get("/admin/data/merge-preview", async (req, reply) => {
    const parsed = z.object({ type: typeSchema, keepId: z.string().uuid(), removeId: z.string().uuid() }).safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid query." });
    try {
      return reply.send(await previewMerge(parsed.data.type, parsed.data.keepId, parsed.data.removeId));
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post("/admin/data/merge", async (req, reply) => {
    const parsed = z.object({
      type: typeSchema,
      keepId: z.string().uuid(),
      removeIds: z.array(z.string().uuid()).min(1).max(20),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid body." });
    const { type, keepId, removeIds } = parsed.data;
    const merged: string[] = [];
    try {
      // One merge (and one history entry) per removed record.
      for (const removeId of removeIds.filter((id) => id !== keepId)) {
        merged.push(await mergeRecords(type, keepId, removeId, req.user?.id ?? null));
      }
    } catch (err) {
      req.log.error({ err }, "merge failed");
      return reply.code(409).send({ error: (err as Error).message, merged });
    }
    return reply.send({ ok: true, merged });
  });

  app.post("/admin/data/dismiss", async (req, reply) => {
    const parsed = z.object({ type: typeSchema, ids: z.array(z.string().uuid()).min(2).max(20) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid body." });
    await dismissPair(parsed.data.type, parsed.data.ids);
    return reply.send({ ok: true });
  });

  app.get("/admin/data/merges", async (_req, reply) => {
    const rows = await db
      .select({
        id: schema.mergeLog.id,
        entityType: schema.mergeLog.entityType,
        keptId: schema.mergeLog.keptId,
        keptName: schema.mergeLog.keptName,
        removedName: schema.mergeLog.removedName,
        createdAt: schema.mergeLog.createdAt,
        undoneAt: schema.mergeLog.undoneAt,
      })
      .from(schema.mergeLog)
      .orderBy(desc(schema.mergeLog.createdAt))
      .limit(50);
    // Only the newest merge that hasn't been undone can be undone.
    const undoableId = rows.find((r) => !r.undoneAt)?.id ?? null;
    return reply.send({ merges: rows.map((r) => ({ ...r, canUndo: r.id === undoableId })) });
  });

  app.post("/admin/data/merges/:id/undo", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await undoMerge(id);
    } catch (err) {
      req.log.error({ err }, "undo failed");
      return reply.code(409).send({ error: (err as Error).message });
    }
    return reply.send({ ok: true });
  });

  app.get("/admin/data/health", async (_req, reply) => reply.send({ checks: await runHealthChecks() }));

  app.post("/admin/data/health/fix", async (req, reply) => {
    const parsed = z.object({ check: z.string(), value: z.string().optional(), to: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid body." });
    try {
      const changed = await applyFix(parsed.data.check, parsed.data.value, parsed.data.to);
      return reply.send({ ok: true, changed });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get("/admin/data/similar", async (req, reply) => {
    const parsed = z.object({
      type: typeSchema,
      name: z.string().trim().min(2).max(256),
      city: z.string().max(128).optional(),
    }).safeParse(req.query);
    if (!parsed.success) return reply.send({ matches: [] });
    return reply.send({ matches: await findSimilar(parsed.data.type, parsed.data.name, parsed.data.city || null) });
  });
}
