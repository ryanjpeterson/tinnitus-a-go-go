/**
 * URL paste parser — POST /concerts/parse-url
 *
 * Given a URL (Ticketmaster, Eventbrite, AXS, venue website, etc.), fetches the
 * page and extracts date, venue name, venue city, artist names and event title
 * (see lib/event-page.ts). Returns a structured pre-fill payload for the Add
 * show modal.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth/middleware.js";
import { safeFetchText, UnsafeUrlError } from "../lib/safe-fetch.js";
import { extractJsonLd, parseJsonLd, parseMetaTags, type ParsedEvent } from "../lib/event-page.js";

// ─── Route plugin ──────────────────────────────────────────────────────────────

export async function parseUrlRoutes(app: FastifyInstance): Promise<void> {
  // Admin-only: only the Add show modal uses this, and it makes the server
  // fetch arbitrary URLs.
  app.addHook("preHandler", requireAdmin);

  const bodySchema = z.object({
    url: z.string().url().max(2048),
  });

  app.post("/concerts/parse-url", async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid URL.", details: parsed.error.flatten() });
    }
    const { url } = parsed.data;

    // Basic allow-list: only http/https
    if (!/^https?:\/\//i.test(url)) {
      return reply.code(400).send({ error: "Only HTTP/HTTPS URLs are supported." });
    }

    // Fetch the target page with a browser-like UA. safeFetchText refuses
    // internal addresses (incl. after redirects) and the 10 s timeout covers
    // the body download, not just the headers.
    let html: string;
    try {
      const res = await safeFetchText(url, {
        timeoutMs: 10_000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; TinnitusBot/1.0; +https://tinnitus)",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });
      if (!res.ok) {
        return reply
          .code(422)
          .send({ error: `Page returned HTTP ${res.status}. Can't parse it.` });
      }
      html = res.text;
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        return reply.code(400).send({ error: err.message });
      }
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(422).send({ error: `Could not fetch the URL: ${msg}` });
    }

    // 1 — JSON-LD
    const blocks = extractJsonLd(html);
    const jsonLdResult = blocks.length > 0 ? parseJsonLd(blocks) : null;

    if (jsonLdResult && (jsonLdResult.date || jsonLdResult.venueName || jsonLdResult.artists?.length)) {
      return reply.send({
        eventName:  jsonLdResult.eventName  ?? null,
        date:       jsonLdResult.date       ?? null,
        venueName:  jsonLdResult.venueName  ?? null,
        venueCity:  jsonLdResult.venueCity  ?? null,
        artists:    jsonLdResult.artists    ?? [],
        confidence: jsonLdResult.confidence ?? "medium",
        sourceUrl:  url,
      } satisfies ParsedEvent);
    }

    // 2 — Open Graph meta: whatever it has
    const metaResult = parseMetaTags(html);
    return reply.send({
      eventName:  metaResult.eventName  ?? null,
      date:       metaResult.date       ?? null,
      venueName:  metaResult.venueName  ?? null,
      venueCity:  metaResult.venueCity  ?? null,
      artists:    metaResult.artists    ?? [],
      confidence: metaResult.confidence ?? "low",
      sourceUrl:  url,
    } satisfies ParsedEvent);
  });
}
