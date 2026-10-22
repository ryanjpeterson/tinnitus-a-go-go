/**
 * Push notifications — the installed app on a phone can get:
 *   • "Tonight: …" on the day of a show you're attending
 *   • "How was …?" the morning after, to mark it attended
 * (sent by the worker; see apps/worker/src/jobs/push-reminders.ts)
 *
 *   GET  /push/key           VAPID public key for subscribing
 *   POST /push/subscribe     save this device's subscription
 *   POST /push/unsubscribe   forget it
 *   POST /push/test          send a test notification to your devices
 */

import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { requireUser } from "../auth/middleware.js";
import { env } from "../lib/env.js";
import { pushContact, sendPush, vapidKeys } from "../lib/push-core.js";

const subscribeBody = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
});

export async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.get("/push/key", async (_req, reply) => {
    const { publicKey } = await vapidKeys(db);
    return reply.send({ publicKey });
  });

  app.post("/push/subscribe", { preHandler: [requireUser] }, async (req, reply) => {
    const parsed = subscribeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid subscription." });
    const { endpoint, keys } = parsed.data;
    await db
      .insert(schema.pushSubscriptions)
      .values({ userId: req.user!.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: req.headers["user-agent"] ?? null })
      .onConflictDoUpdate({
        target: schema.pushSubscriptions.endpoint,
        set: { userId: req.user!.id, p256dh: keys.p256dh, auth: keys.auth },
      });
    return reply.send({ ok: true });
  });

  app.post("/push/unsubscribe", { preHandler: [requireUser] }, async (req, reply) => {
    const endpoint = z.object({ endpoint: z.string().max(2048) }).safeParse(req.body);
    if (!endpoint.success) return reply.code(400).send({ error: "endpoint required." });
    await db.delete(schema.pushSubscriptions).where(and(
      eq(schema.pushSubscriptions.userId, req.user!.id),
      eq(schema.pushSubscriptions.endpoint, endpoint.data.endpoint),
    ));
    return reply.send({ ok: true });
  });

  app.post("/push/test", { preHandler: [requireUser] }, async (req, reply) => {
    const subs = await db
      .select({ id: schema.pushSubscriptions.id, endpoint: schema.pushSubscriptions.endpoint, p256dh: schema.pushSubscriptions.p256dh, auth: schema.pushSubscriptions.auth })
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, req.user!.id));
    if (subs.length === 0) return reply.code(409).send({ error: "No devices are set up for notifications yet." });
    const delivered = await sendPush(db, subs, {
      title: "Tinnitus A Go Go",
      body: "Notifications are on. See you at the next show. 🤘",
      url: "/",
      tag: "test",
    }, pushContact(env.SMTP_FROM));
    return reply.send({ ok: true, delivered });
  });
}
