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
 *   GET  /admin/data/setlist-finder                             automatic setlist finder progress
 *   POST /admin/data/setlist-finder/run                         queue a scan now
 *   GET  /admin/data/festival-suggestions                       shows that look like a festival
 *   POST /admin/data/festival-suggestions/dismiss { key }       hide one
 */

import type { FastifyInstance } from "fastify";
import { desc, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../../db/client.js";
import { requireAdmin } from "../../auth/middleware.js";
import { dismissPair, findDuplicates, findSimilar } from "../../lib/duplicates.js";
import { mergeRecords, previewMerge, undoMerge } from "../../lib/merge.js";
import { applyFix, runHealthChecks } from "../../lib/data-health.js";
import { dismissFestivalSuggestion, findFestivalSuggestions } from "../../lib/festival-suggestions.js";
import { setlistEnrichQueue } from "../../lib/queues.js";
import { env } from "../../lib/env.js";
import { redis } from "../../lib/redis.js";
import { SETLIST_FINDER_DAILY_BUDGET, setlistfmUsageKey } from "@tagg/shared";

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

  app.get("/admin/data/festival-suggestions", async (_req, reply) => {
    return reply.send({ suggestions: await findFestivalSuggestions() });
  });

  app.post("/admin/data/festival-suggestions/dismiss", async (req, reply) => {
    const parsed = z.object({ key: z.tuple([z.string().uuid(), z.string().uuid()]) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "key must be two show ids." });
    await dismissFestivalSuggestion(parsed.data.key);
    return reply.send({ ok: true });
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

  app.get("/admin/data/setlist-finder", async (_req, reply) => {
    const [row] = [...(await db.execute<{ found: number; no_match: number; to_check: number; with_setlist: number; total: number }>(sql`
      with pairs as (
        select c.id as concert_id, ca.artist_id
        from concerts c join concert_artists ca on ca.concert_id = c.id
        where c.date < current_date
          and exists (select 1 from concert_attendees x where x.concert_id = c.id and x.status = 'attended')
      )
      select
        (select count(*)::int from setlist_lookups where last_result = 'linked') as found,
        (select count(*)::int from pairs p
           join setlist_lookups l on l.concert_id = p.concert_id and l.artist_id = p.artist_id
           where l.last_result in ('no_match', 'taken')
             and not exists (select 1 from setlists s where s.concert_id = p.concert_id and s.artist_id = p.artist_id)) as no_match,
        (select count(*)::int from pairs p
           where not exists (select 1 from setlists s where s.concert_id = p.concert_id and s.artist_id = p.artist_id)
             and not exists (select 1 from setlist_lookups l where l.concert_id = p.concert_id and l.artist_id = p.artist_id)) as to_check,
        (select count(*)::int from pairs p
           where exists (select 1 from setlists s where s.concert_id = p.concert_id and s.artist_id = p.artist_id)) as with_setlist,
        (select count(*)::int from pairs) as total
    `))];
    const callsToday = Number((await redis.get(setlistfmUsageKey(new Date().toISOString().slice(0, 10)))) ?? 0);
    return reply.send({
      available: !!env.SETLISTFM_API_KEY,
      callsToday,
      dailyBudget: SETLIST_FINDER_DAILY_BUDGET,
      foundAutomatically: row?.found ?? 0,
      notOnSetlistfm: row?.no_match ?? 0,
      stillToCheck: row?.to_check ?? 0,
      withSetlist: row?.with_setlist ?? 0,
      total: row?.total ?? 0,
    });
  });

  app.post("/admin/data/setlist-finder/run", async (_req, reply) => {
    await setlistEnrichQueue.add("scan", { kind: "scan" }, { jobId: `setlist-scan-${Date.now()}`, removeOnComplete: true, removeOnFail: true });
    return reply.send({ ok: true });
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
