import type { FastifyInstance } from "fastify";
import { count, eq, sql } from "drizzle-orm";
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
import { requireUser } from "../auth/middleware.js";

const setupBody = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, underscore, and hyphen only."),
  email: z.string().email().max(254),
  password: z.string(),
  displayName: z.string().max(64).optional(),
});

const loginBody = z.object({
  identifier: z.string().min(1).max(254), // username or email
  password: z.string().min(1).max(256),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ----- First-run setup -----
  // There is one account, the admin. Until it exists the web app shows the setup
  // page; once it does, setup is closed for good (reset a lost password with
  // `pnpm set-password`).
  app.get("/auth/setup", async () => ({ needed: (await countUsers()) === 0 }));

  app.post(
    "/auth/setup",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "10 minutes" },
      },
    },
    async (req, reply) => {
      const parsed = setupBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
      }
      const { username, email, password, displayName } = parsed.data;

      const pwError = validatePasswordShape(password);
      if (pwError) return reply.code(400).send({ error: pwError });

      if (await isPasswordPwned(password)) {
        return reply.code(400).send({
          error: "That password appears in known breach databases. Pick a different one.",
        });
      }

      const passwordHash = await hashPassword(password);

      // The lock makes "no account yet" and the insert one step, so two setup
      // requests can't both create an admin.
      const user = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('tagg:setup'))`);
        const [row] = await tx.select({ n: count() }).from(schema.users);
        if ((row?.n ?? 0) > 0) return null;
        const [created] = await tx
          .insert(schema.users)
          .values({
            username,
            email: email.toLowerCase(),
            passwordHash,
            displayName: displayName ?? null,
            isAdmin: true,
          })
          .returning();
        return created ?? null;
      });
      if (!user) return reply.code(409).send({ error: "This instance is already set up. Sign in instead." });

      const { token, expiresAt } = await createSession(user.id, {
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });
      reply.setCookie(env.SESSION_COOKIE_NAME, token, { ...SESSION_COOKIE_OPTS, expires: expiresAt });

      await logAuthEvent(req, "setup", user.id);

      return reply.code(201).send({
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

  // ----- Change password -----
  app.patch(
    "/auth/password",
    { preHandler: requireUser },
    async (req, reply) => {
      const parsed = z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(1),
      }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid body." });

      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, req.user!.id),
      });
      if (!user) return reply.code(404).send({ error: "User not found." });

      const valid = await verifyPassword(user.passwordHash, parsed.data.currentPassword);
      if (!valid) return reply.code(401).send({ error: "Current password is incorrect." });

      const pwError = validatePasswordShape(parsed.data.newPassword);
      if (pwError) return reply.code(400).send({ error: pwError });

      if (await isPasswordPwned(parsed.data.newPassword)) {
        return reply.code(400).send({
          error: "That password appears in known breach databases. Pick a different one.",
        });
      }

      const newHash = await hashPassword(parsed.data.newPassword);
      await db
        .update(schema.users)
        .set({ passwordHash: newHash })
        .where(eq(schema.users.id, req.user!.id));

      await logAuthEvent(req, "password.changed", req.user!.id);
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

async function countUsers(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(schema.users);
  return row?.n ?? 0;
}
