import type { FastifyInstance } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { env } from "../lib/env.js";
import { requireUser } from "../auth/middleware.js";
import { generateToken, hashToken } from "../auth/tokens.js";

const createInviteBody = z.object({
  note: z.string().max(140).optional(),
});

export async function inviteRoutes(app: FastifyInstance): Promise<void> {
  // List my outstanding invites (returns metadata only — never the raw code, which only existed
  // at creation time in the response and the URL we sent to the recipient).
  app.get("/invites", { preHandler: requireUser }, async (req) => {
    const rows = await db
      .select({
        id: schema.invites.id,
        note: schema.invites.note,
        expiresAt: schema.invites.expiresAt,
        usedAt: schema.invites.usedAt,
        usedByUserId: schema.invites.usedByUserId,
        createdAt: schema.invites.createdAt,
      })
      .from(schema.invites)
      .where(eq(schema.invites.createdByUserId, req.user!.id))
      .orderBy(schema.invites.createdAt);
    return { invites: rows, remaining: req.user!.invitesRemaining };
  });

  // Issue a new invite. Consumes one of my invite quota.
  app.post(
    "/invites",
    {
      preHandler: requireUser,
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
    },
    async (req, reply) => {
      const parsed = createInviteBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid input." });

      const me = await db.query.users.findFirst({ where: eq(schema.users.id, req.user!.id) });
      if (!me) return reply.code(401).send({ error: "Not authenticated." });
      if (me.invitesRemaining <= 0 && !me.isAdmin) {
        return reply.code(403).send({ error: "No invites remaining." });
      }

      const code = generateToken(32);
      const codeHash = hashToken(code);
      const expiresAt = new Date(Date.now() + env.INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

      const invite = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(schema.invites)
          .values({
            codeHash,
            createdByUserId: me.id,
            note: parsed.data.note ?? null,
            expiresAt,
          })
          .returning({
            id: schema.invites.id,
            note: schema.invites.note,
            expiresAt: schema.invites.expiresAt,
            createdAt: schema.invites.createdAt,
          });
        if (!me.isAdmin) {
          await tx
            .update(schema.users)
            .set({ invitesRemaining: me.invitesRemaining - 1 })
            .where(eq(schema.users.id, me.id));
        }
        return created;
      });

      const url = `${env.APP_URL}/signup?invite=${code}`;
      return reply.code(201).send({ invite, url });
    },
  );

  // Revoke (delete) an unused invite I created.
  app.delete("/invites/:id", { preHandler: requireUser }, async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "Bad id." });

    const invite = await db.query.invites.findFirst({
      where: and(
        eq(schema.invites.id, params.data.id),
        eq(schema.invites.createdByUserId, req.user!.id),
      ),
    });
    if (!invite) return reply.code(404).send({ error: "Invite not found." });
    if (invite.usedAt) {
      return reply.code(409).send({ error: "Invite already used; cannot revoke." });
    }

    await db.transaction(async (tx) => {
      await tx.delete(schema.invites).where(eq(schema.invites.id, invite.id));
      if (!req.user!.isAdmin) {
        await tx
          .update(schema.users)
          .set({ invitesRemaining: req.user!.invitesRemaining + 1 })
          .where(eq(schema.users.id, req.user!.id));
      }
    });
    return reply.send({ ok: true });
  });

  // Lightweight pre-flight check used by the signup page to confirm the invite is real
  // BEFORE the user fills in their email/password. Returns nothing identifying.
  app.get("/invites/check", async (req, reply) => {
    const q = z.object({ code: z.string().min(16).max(128) }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ valid: false });
    const invite = await db.query.invites.findFirst({
      where: and(eq(schema.invites.codeHash, hashToken(q.data.code)), isNull(schema.invites.usedAt)),
    });
    const valid = !!invite && (!invite.expiresAt || invite.expiresAt > new Date());
    return reply.send({ valid });
  });
}
