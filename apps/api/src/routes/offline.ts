/**
 * Offline bundle — everything the app needs to work without a connection,
 * in a few requests instead of ~1,700 (which the per-IP rate limit would
 * stretch to a quarter of an hour).
 *
 *   GET /offline/bundle?part=shows|artists|venues|festivals
 *
 * Each part returns the exact responses the pages request — produced by
 * running the normal routes in-process with the caller's cookie — keyed by the
 * URL the app fetches them from, plus the image URLs those pages show. The app
 * writes them into the service worker's cache under those URLs.
 */

import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireUser } from "../auth/middleware.js";

/** Marks in-process requests so the rate limiter lets them through (see index.ts). */
export const OFFLINE_INJECT_SECRET = randomBytes(24).toString("hex");
export const OFFLINE_INJECT_HEADER = "x-offline-bundle";

type Row = Record<string, string | null>;
const rows = async (q: ReturnType<typeof sql>) => [...(await db.execute<Row>(q))];

export async function offlineRoutes(app: FastifyInstance): Promise<void> {
  app.get("/offline/bundle", { preHandler: [requireUser] }, async (req, reply) => {
    const parsed = z.object({ part: z.enum(["shows", "artists", "venues", "festivals"]) }).safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "part must be shows, artists, venues or festivals." });

    let paths: string[] = [];
    let images: (string | null)[] = [];
    switch (parsed.data.part) {
      case "shows": {
        // Shows open by readable slug or by id (older links), so both are saved.
        const r = await rows(sql`select id, slug from concerts`);
        paths = r.flatMap((x) => [`/concerts/${x.slug}`, `/concerts/${x.id}`, `/concerts/${x.id}/photos`]);
        break;
      }
      case "artists": {
        const r = await rows(sql`select slug from artists`);
        paths = r.flatMap((x) => [`/artists/${x.slug}`, `/artists/${x.slug}/photos`, `/artists/${x.slug}/setlists`]);
        break;
      }
      case "venues":
        paths = (await rows(sql`select slug from venues`)).map((x) => `/venues/${x.slug}`);
        break;
      case "festivals":
        paths = (await rows(sql`select slug from event_series`)).map((x) => `/festivals/${x.slug}`);
        break;
    }

    // Run the real routes in-process, a few at a time, as the caller.
    const headers = { cookie: req.headers.cookie ?? "", [OFFLINE_INJECT_HEADER]: OFFLINE_INJECT_SECRET };
    const entries: { url: string; body: unknown }[] = [];
    for (let i = 0; i < paths.length; i += 8) {
      const batch = await Promise.all(paths.slice(i, i + 8).map((url) => app.inject({ method: "GET", url, headers })));
      batch.forEach((res, j) => {
        if (res.statusCode !== 200) return;
        const body = res.json() as Record<string, unknown>;
        entries.push({ url: `/api${paths[i + j]}`, body });
        // Images shown on those pages, so they can be cached too.
        const pick = (o: unknown, keys: string[]) => keys.map((k) => (o as Record<string, unknown> | undefined)?.[k] as string | null);
        images.push(...pick(body.concert, ["flyerUrl"]), ...pick(body.artist, ["imageUrl"]), ...pick(body.venue, ["imageUrl"]), ...pick(body.festival, ["flyerUrl"]));
        for (const p of (body.photos as { urls?: Record<string, string | null> }[] | undefined) ?? []) {
          images.push(p.urls?.thumb ?? null, p.urls?.medium ?? null);
        }
      });
    }

    return reply.send({ entries, images: [...new Set(images.filter((u): u is string => !!u))] });
  });
}
