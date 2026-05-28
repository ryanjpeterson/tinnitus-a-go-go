import type { FastifyInstance } from "fastify";
import { and, eq, isNull, gt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { env } from "../lib/env.js";
import {
  hashPassword,
  isPasswordPwned,
  validatePasswordShape,
  verifyPassword,
} from "../auth/password.js";
import {
  SESSION_COOKIE_OPTS,
  createSession,
  invalidateSession,
} from "../auth/session.js";
import { hashToken } from "../auth/tokens.js";
import { createVerificationToken, sendVerificationEmail } from "../auth/email.js";
import { requireUser } from "../auth/middleware.js";

const signupBody = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, underscore, and hyphen only."),
  email: z.string().email().max(254),
  password: z.string(),
  inviteCode: z.string().min(16).max(128),
  displayName: z.string().max(64).optional(),
});

const loginBody = z.object({
  identifier: z.string().min(1).max(254), // username or email
  password: z.string().min(1).max(256),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ----- Signup (invite-required) -----
  app.post(
    "/auth/signup",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "10 minutes" },
      },
    },
    async (req, reply) => {
      const parsed = signupBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
      }
      const { username, email, password, inviteCode, displayName } = parsed.data;

      const pwError = validatePasswordShape(password);
      if (pwError) return reply.code(400).send({ error: pwError });

      if (await isPasswordPwned(password)) {
        return reply.code(400).send({
          error: "That password appears in known breach databases. Pick a different one.",
        });
      }

      const inviteHash = hashToken(inviteCode);
      const invite = await db.query.invites.findFirst({
        where: eq(schema.invites.codeHash, inviteHash),
      });
      if (!invite || invite.usedAt) {
        await logAuthEvent(req, "signup.fail", null, { reason: "bad_invite" });
        return reply.code(400).send({ error: "Invite is invalid or already used." });
      }
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        return reply.code(400).send({ error: "Invite has expired." });
      }

      const passwordHash = await hashPassword(password);

      try {
        const { user, rawVerificationToken } = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(schema.users)
            .values({
              username,
              email: email.toLowerCase(),
              passwordHash,
              displayName: displayName ?? null,
              invitedByUserId: invite.createdByUserId ?? null,
              invitesRemaining: env.INVITES_PER_USER,
            })
            .returning();
          if (!created) throw new Error("Failed to create user.");

          await tx
            .update(schema.invites)
            .set({ usedAt: new Date(), usedByUserId: created.id })
            .where(eq(schema.invites.id, invite.id));

          const { rawToken } = await createVerificationToken(created.id, created.email, tx);

          return { user: created, rawVerificationToken: rawToken };
        });

        const { token, expiresAt } = await createSession(user.id, {
          userAgent: req.headers["user-agent"],
          ipAddress: req.ip,
        });
        reply.setCookie(env.SESSION_COOKIE_NAME, token, { ...SESSION_COOKIE_OPTS, expires: expiresAt });

        await logAuthEvent(req, "signup", user.id);

        // Fire-and-log: never block the signup response on SMTP.
        void sendVerificationEmail(
          { email: user.email, displayName: user.displayName, username: user.username },
          rawVerificationToken,
        ).catch((err) => {
          req.log.error({ err }, "verification email failed to send");
        });

        return reply.code(201).send({
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            isAdmin: user.isAdmin,
          },
        });
      } catch (err: any) {
        // Likely a unique-violation on username/email. Don't leak which.
        if (err?.code === "23505") {
          return reply.code(409).send({ error: "Username or email already in use." });
        }
        req.log.error({ err }, "signup failed");
        return reply.code(500).send({ error: "Could not create account." });
      }
    },
  );

  // ----- Login -----
  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "10 minutes" },
      },
    },
    async (req, reply) => {
      const parsed = loginBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input." });
      }
      const { identifier, password } = parsed.data;

      const isEmail = identifier.includes("@");
      const user = isEmail
        ? await db.query.users.findFirst({ where: eq(schema.users.email, identifier.toLowerCase()) })
        : await db.query.users.findFirst({ where: eq(schema.users.username, identifier) });

      // Always run hash verify even on missing user, to avoid timing leaks.
      const dummyHash =
        "$argon2id$v=19$m=19456,t=2,p=1$dHV2ZW1wb3J0YW50bmlzdGVy$JvvgRfBxlQHe+kMVu4cphFTFwVE0HRBuLSU0R7y3wbY";
      const ok = user
        ? await verifyPassword(user.passwordHash, password)
        : (await verifyPassword(dummyHash, password), false);

      if (!user || !ok) {
        await logAuthEvent(req, "login.fail", user?.id ?? null, { identifier });
        return reply.code(401).send({ error: "Invalid credentials." });
      }

      const { token, expiresAt } = await createSession(user.id, {
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });
      reply.setCookie(env.SESSION_COOKIE_NAME, token, { ...SESSION_COOKIE_OPTS, expires: expiresAt });

      await logAuthEvent(req, "login.success", user.id);

      return reply.send({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          isAdmin: user.isAdmin,
        },
      });
    },
  );

  // ----- Logout -----
  app.post("/auth/logout", async (req, reply) => {
    if (req.sessionToken) {
      await invalidateSession(req.sessionToken);
    }
    reply.clearCookie(env.SESSION_COOKIE_NAME, SESSION_COOKIE_OPTS);
    return reply.send({ ok: true });
  });

  // ----- Current user -----
  app.get("/auth/me", { preHandler: requireUser }, async (req) => {
    return { user: req.user };
  });

  // ----- Verify email -----
  // Single-use; deletes the token row on success so a click can't be replayed.
  app.post(
    "/auth/verify-email",
    {
      config: { rateLimit: { max: 20, timeWindow: "10 minutes" } },
    },
    async (req, reply) => {
      const parsed = z.object({ token: z.string().min(16).max(256) }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid token." });

      const tokenHash = hashToken(parsed.data.token);
      const row = await db.query.emailVerificationTokens.findFirst({
        where: and(
          eq(schema.emailVerificationTokens.tokenHash, tokenHash),
          gt(schema.emailVerificationTokens.expiresAt, new Date()),
        ),
      });
      if (!row) return reply.code(400).send({ error: "Token invalid or expired." });

      await db.transaction(async (tx) => {
        await tx
          .update(schema.users)
          .set({ emailVerifiedAt: new Date() })
          .where(eq(schema.users.id, row.userId));
        await tx
          .delete(schema.emailVerificationTokens)
          .where(eq(schema.emailVerificationTokens.tokenHash, tokenHash));
      });

      await logAuthEvent(req, "email.verified", row.userId);
      return reply.send({ ok: true });
    },
  );
}

async function logAuthEvent(
  req: { ip: string; headers: { "user-agent"?: string } },
  kind: string,
  userId: string | null,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(schema.authEvents).values({
      kind,
      userId,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
      meta: meta ?? null,
    });
  } catch {
    /* swallow — auth event log failure should not break auth */
  }
}
