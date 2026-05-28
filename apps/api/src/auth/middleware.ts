import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../lib/env.js";
import { SESSION_COOKIE_OPTS, validateSession, type UserPublic } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    user: UserPublic | null;
    sessionToken: string | null;
  }
}

export async function attachUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  req.user = null;
  req.sessionToken = null;

  const token = req.cookies[env.SESSION_COOKIE_NAME];
  if (!token) return;

  const result = await validateSession(token);
  if (!result) {
    // Stale/invalid cookie — clear it.
    reply.clearCookie(env.SESSION_COOKIE_NAME, SESSION_COOKIE_OPTS);
    return;
  }

  req.user = result.user;
  req.sessionToken = token;

  if (result.renewed) {
    reply.setCookie(env.SESSION_COOKIE_NAME, token, {
      ...SESSION_COOKIE_OPTS,
      expires: result.session.expiresAt,
    });
  }
}

export async function requireUser(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!req.user) {
    reply.code(401).send({ error: "Authentication required." });
  }
}

export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!req.user || !req.user.isAdmin) {
    reply.code(403).send({ error: "Forbidden." });
  }
}
