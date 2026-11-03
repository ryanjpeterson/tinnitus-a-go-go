/**
 * Notification settings. The worker does the sending (reminders and the
 * weekly recap on its own schedule); these routes keep your choices and send
 * a test.
 *
 *   GET   /notifications        your settings, plus which channels the worker has set up
 *   PATCH /notifications        change settings (any subset)
 *   POST  /notifications/test   send a reminder or recap now: { what: "reminder" | "recap" }
 */
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { QueueEvents } from "bullmq";
import { NOTIFY_CHANNELS_KEY, type NotifyChannels, type NotifyJobResult } from "@tagg/shared";
import { db, schema } from "../db/client.js";
import { requireUser } from "../auth/middleware.js";
import { notifyQueue } from "../lib/queues.js";
import { redis } from "../lib/redis.js";

const prefsBody = z
  .object({
    remindDays: z.array(z.number().int().min(1).max(30)).max(6),
    remindNtfy: z.boolean(),
    remindEmail: z.boolean(),
    remindInterested: z.boolean(),
    recapNtfy: z.boolean(),
    recapEmail: z.boolean(),
    recapWeekday: z.number().int().min(0).max(6),
    hour: z.number().int().min(0).max(23),
    emailTo: z.string().email().max(254).nullable(),
  })
  .partial()
  .strict();

// Waits for a test job's result; created on first use (it holds its own Redis connection).
let events: QueueEvents | null = null;

async function channels(): Promise<NotifyChannels | null> {
  try {
    const raw = await redis.get(NOTIFY_CHANNELS_KEY);
    return raw ? (JSON.parse(raw) as NotifyChannels) : null;
  } catch {
    return null;
  }
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/notifications", { preHandler: requireUser }, async (req) => {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, req.user!.id) });
    return {
      prefs: { ...schema.DEFAULT_NOTIFY_PREFS, ...user?.notifyPrefs },
      accountEmail: user?.email ?? null,
      // null: the worker hasn't started since notifications were added.
      channels: await channels(),
    };
  });

  app.patch("/notifications", { preHandler: requireUser }, async (req, reply) => {
    const parsed = prefsBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid settings.", details: parsed.error.flatten() });
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, req.user!.id) });
    const next = { ...user?.notifyPrefs, ...parsed.data };
    if (next.remindDays) next.remindDays = [...new Set(next.remindDays)].sort((a, b) => b - a);
    if (next.emailTo === "") next.emailTo = null;
    await db.update(schema.users).set({ notifyPrefs: next, updatedAt: new Date() }).where(eq(schema.users.id, req.user!.id));
    return { prefs: { ...schema.DEFAULT_NOTIFY_PREFS, ...next } };
  });

  app.post(
    "/notifications/test",
    { preHandler: requireUser, config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const parsed = z.object({ what: z.enum(["reminder", "recap"]) }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Pick reminder or recap." });
      const job = await notifyQueue.add("test", { kind: "test", userId: req.user!.id, what: parsed.data.what });
      events ??= new QueueEvents(notifyQueue.name, { connection: redis.duplicate() });
      try {
        const result = (await job.waitUntilFinished(events, 30_000)) as NotifyJobResult;
        return { result };
      } catch (err) {
        return reply.code(502).send({ error: err instanceof Error ? err.message : "The worker didn't answer." });
      }
    },
  );
}
