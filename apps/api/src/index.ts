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
import { concertRoutes } from "./routes/concerts.js";
import { exportRoutes } from "./routes/export.js";
import { photoRoutes } from "./routes/photos.js";
import { artistRoutes } from "./routes/artists.js";
import { venueRoutes } from "./routes/venues.js";
import { seriesRoutes } from "./routes/series.js";
import { setlistfmRoutes } from "./routes/setlistfm.js";
import { parseUrlRoutes } from "./routes/parseurl.js";
import { publicRoutes } from "./routes/public.js";
import { copyRoutes } from "./routes/copy.js";
import { statsRoutes } from "./routes/stats.js";

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
  });

  // Auth context on every request.
  app.addHook("preHandler", attachUser);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(inviteRoutes);
  await app.register(adminImportRoutes);
  await app.register(concertRoutes);
  await app.register(exportRoutes);
  await app.register(photoRoutes);
  await app.register(artistRoutes);
  await app.register(venueRoutes);
  await app.register(seriesRoutes);
  await app.register(setlistfmRoutes);
  await app.register(parseUrlRoutes);
  await app.register(publicRoutes);
  await app.register(copyRoutes);
  await app.register(statsRoutes);

  // 404 handler
  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: "Not found." });
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    req.log.error({ err }, "request failed");
    const status = err.statusCode ?? 500;
    reply.code(status).send({
      error: status >= 500 ? "Internal server error." : err.message,
    });
  });

  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`Tinnitus A Go Go API listening on http://${env.HOST}:${env.PORT}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
