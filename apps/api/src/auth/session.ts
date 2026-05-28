import { eq, lt } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { env } from "../lib/env.js";
import { generateToken, hashToken } from "./tokens.js";

export interface SessionContext {
  sessionId: string; // hashed id stored in DB
  userId: string;
  expiresAt: Date;
}

export interface UserPublic {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  emailVerifiedAt: Date | null;
  invitesRemaining: number;
}

const SESSION_TTL_MS = () => env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const SESSION_RENEW_THRESHOLD_MS = () => SESSION_TTL_MS() / 2; // renew if more than halfway expired

export async function createSession(
  userId: string,
  meta: { userAgent?: string; ipAddress?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken(32);
  const id = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS());
  await db.insert(schema.sessions).values({
    id,
    userId,
    expiresAt,
    userAgent: meta.userAgent ?? null,
    ipAddress: meta.ipAddress ?? null,
  });
  return { token, expiresAt };
}

export async function validateSession(token: string): Promise<
  | { session: SessionContext; user: UserPublic; renewed: boolean }
  | null
> {
  const id = hashToken(token);
  const row = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, id),
    with: { user: false as any }, // we'll fetch user explicitly to control shape
  });
  if (!row) return null;

  const now = new Date();
  if (row.expiresAt <= now) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
    return null;
  }

  const userRow = await db.query.users.findFirst({
    where: eq(schema.users.id, row.userId),
  });
  if (!userRow) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
    return null;
  }

  let renewed = false;
  const remaining = row.expiresAt.getTime() - now.getTime();
  if (remaining < SESSION_RENEW_THRESHOLD_MS()) {
    const newExpiresAt = new Date(now.getTime() + SESSION_TTL_MS());
    await db
      .update(schema.sessions)
      .set({ expiresAt: newExpiresAt, lastUsedAt: now })
      .where(eq(schema.sessions.id, id));
    row.expiresAt = newExpiresAt;
    renewed = true;
  } else {
    await db.update(schema.sessions).set({ lastUsedAt: now }).where(eq(schema.sessions.id, id));
  }

  return {
    session: { sessionId: id, userId: row.userId, expiresAt: row.expiresAt },
    user: {
      id: userRow.id,
      username: userRow.username,
      email: userRow.email,
      displayName: userRow.displayName,
      isAdmin: userRow.isAdmin,
      emailVerifiedAt: userRow.emailVerifiedAt,
      invitesRemaining: userRow.invitesRemaining,
    },
    renewed,
  };
}

export async function invalidateSession(token: string): Promise<void> {
  const id = hashToken(token);
  await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
}

export async function invalidateAllSessionsForUser(userId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db
    .delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, new Date()))
    .returning({ id: schema.sessions.id });
  return result.length;
}

export const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/",
  maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
};
