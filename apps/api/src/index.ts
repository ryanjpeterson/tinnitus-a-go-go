import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { env } from "./lib/env.js";
import { attachUser } from "./auth/middleware.js";
import { authRoutes } from "./routes/auth.js";
import { inviteRoutes } from "./routes/invites.js";
import { healthRoutes } from "./routes/health.js";
import { adminImportRoutes } from "./routes/admin/imports.js";
import { adminDataRoutes } from "./routes/admin/data.js";
import { offlineRoutes, OFFLINE_INJECT_HEADER, OFFLINE_INJECT_SECRET } from "./routes/offline.js";
import { concertRoutes } from "./routes/concerts.js";
import { exportRoutes } from "./routes/export.js";
import { photoRoutes } from "./routes/photos.js";
import { artistRoutes } from "./routes/artists.js";
import { venueRoutes } from "./routes/venues.js";
import { festivalRoutes } from "./routes/festivals.js";
import { setlistfmRoutes } from "./routes/setlistfm.js";
import { parseUrlRoutes } from "./routes/parseurl.js";
import { publicRoutes } from "./routes/public.js";
import { copyRoutes } from "./routes/copy.js";
import { statsRoutes } from "./routes/stats.js";
import { searchRoutes } from "./routes/search.js";
import { calendarRoutes } from "./routes/calendar.js";
import { pushRoutes } from "./routes/push.js";
import { startPushReminders } from "./lib/push-reminders.js";

const app = Fastify({
  logger:
    env.NODE_ENV === "development"
      ? {
          level: "info",
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss" },
          },
        }
      : { level: "info" },
  trustProxy: env.NODE_ENV === "production", // VPS will sit behind a reverse proxy
  bodyLimit: 1024 * 1024, // 1 MB; uploads go to /media via streaming, not JSON
});

async function start(): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  await app.register(cookie);

  await app.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500 MB ceiling — per-route limits apply below this
      files: 1,
    },
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    // The offline bundle runs routes in-process; those carry a per-process secret
    // and shouldn't count against the caller (the bundle request itself does).
    allowList: (req) => req.headers[OFFLINE_INJECT_HEADER] === OFFLINE_INJECT_SECRET,
  });

  // Before the routes: an error handler applies to routes registered after it.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    // Rules the database enforces (migration 0015) become clear 4xx answers.
    const conflict = dbRuleMessage(err);
    if (conflict) return reply.code(conflict.status).send({ error: conflict.message });
    req.log.error({ err }, "request failed");
    const status = err.statusCode ?? 500;
    reply.code(status).send({
      error: status >= 500 ? "Internal server error." : err.message,
    });
  });

  // Auth context on every request.
  app.addHook("preHandler", attachUser);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(inviteRoutes);
  await app.register(adminImportRoutes);
  await app.register(adminDataRoutes);
  await app.register(offlineRoutes);
  await app.register(concertRoutes);
  await app.register(exportRoutes);
  await app.register(photoRoutes);
  await app.register(artistRoutes);
  await app.register(venueRoutes);
  await app.register(festivalRoutes);
  await app.register(setlistfmRoutes);
  await app.register(parseUrlRoutes);
  await app.register(publicRoutes);
  await app.register(copyRoutes);
  await app.register(statsRoutes);
  await app.register(searchRoutes);
  await app.register(calendarRoutes);
  await app.register(pushRoutes);

  // 404 handler
  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: "Not found." });
  });

  await app.listen({ port: env.PORT, host: env.HOST });
  startPushReminders(app.log);
  app.log.info(`Tinnitus A Go Go API listening on http://${env.HOST}:${env.PORT}`);
}

/** Postgres errors from the show rules, as user-facing messages. */
function dbRuleMessage(err: unknown): { status: number; message: string } | null {
  const e = err as { code?: string; constraint_name?: string; message?: string; cause?: unknown };
  const pg = e.code ? e : (e.cause as typeof e | undefined);
  if (!pg?.code) return null;
  if (pg.constraint_name === "concerts_festival_date_uq") {
    return { status: 409, message: "That festival already has a show on that date." };
  }
  if (pg.constraint_name === "concert_artists_one_headliner_uq") {
    return { status: 422, message: "A lineup can have only one headliner — use co-headliners for equal billing." };
  }
  if (pg.code === "23514" && /headliner/.test(pg.message ?? "")) {
    return { status: 422, message: "A lineup cannot mix a headliner and co-headliners." };
  }
  return null;
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
