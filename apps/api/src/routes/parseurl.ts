/**
 * URL paste parser — POST /concerts/parse-url
 *
 * Given a URL (Ticketmaster, Eventbrite, AXS, venue website, etc.), fetches the
 * page and attempts to extract: date, venue name, venue city, artist names, and
 * event title. Returns a structured pre-fill payload for the Add show modal.
 *
 * Extraction strategy (in order):
 *   1. JSON-LD <script type="application/ld+json"> — structured data most major
 *      ticketing sites and venue websites emit.
 *   2. Open Graph meta tags — og:title, og:description, etc.
 *   3. Claude API extraction — if ANTHROPIC_API_KEY is set, pass the page HTML
 *      (truncated) to claude-haiku-4-5 to extract the fields. Falls back
 *      gracefully if the key is absent.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../lib/env.js";
import { requireUser } from "../auth/middleware.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedEvent {
  eventName:  string | null;
  date:       string | null;  // YYYY-MM-DD
  venueName:  string | null;
  venueCity:  string | null;
  artists:    string[];
  sourceUrl:  string;
  confidence: "high" | "medium" | "low";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalise a raw date string to YYYY-MM-DD if possible. */
function normaliseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Already ISO: 2025-11-15 or 2025-11-15T20:00:00
  const iso = /(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (iso) return iso[1]!;
  // MM/DD/YYYY
  const mdy = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return null;
}

/** Strip HTML tags and collapse whitespace. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Extract all JSON-LD blocks from HTML. */
function extractJsonLd(html: string): unknown[] {
  const results: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try { results.push(JSON.parse(m[1]!)); } catch { /* skip malformed */ }
  }
  return results;
}

/** Pull a string out of nested JSON-LD @graph or top-level. */
function jsonldString(obj: unknown, ...keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  // Check @graph first
  if (Array.isArray(o["@graph"])) {
    for (const node of o["@graph"] as unknown[]) {
      const v = jsonldString(node, ...keys);
      if (v) return v;
    }
  }
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object") {
      const nested = (v as Record<string, unknown>)["name"];
      if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
  }
  return null;
}

/** Parse performer names out of a JSON-LD MusicEvent. */
function jsonldPerformers(obj: unknown): string[] {
  if (!obj || typeof obj !== "object") return [];
  const o = obj as Record<string, unknown>;
  const performers: string[] = [];

  const addPerformer = (p: unknown): void => {
    if (!p || typeof p !== "object") return;
    const name = (p as Record<string, unknown>)["name"];
    if (typeof name === "string" && name.trim()) performers.push(name.trim());
  };

  const raw = o["performer"] ?? o["performers"];
  if (Array.isArray(raw)) raw.forEach(addPerformer);
  else if (raw) addPerformer(raw);

  // Also check @graph
  if (Array.isArray(o["@graph"])) {
    for (const node of o["@graph"] as unknown[]) {
      performers.push(...jsonldPerformers(node));
    }
  }
  return [...new Set(performers)];
}

/** Try to extract an event from a JSON-LD block. */
function parseJsonLd(blocks: unknown[]): Partial<ParsedEvent> | null {
  for (const block of blocks) {
    const b = block as Record<string, unknown>;
    const type = b["@type"] ?? (Array.isArray(b["@graph"])
      ? (b["@graph"] as Array<Record<string, unknown>>).find((n) => n["@type"])?.[
          "@type"
        ]
      : null);
    const typeStr = Array.isArray(type) ? type.join(",") : String(type ?? "");

    if (
      typeStr.includes("MusicEvent") ||
      typeStr.includes("Event") ||
      typeStr.includes("Concert")
    ) {
      const eventName  = jsonldString(block, "name");
      const rawDate    = jsonldString(block, "startDate", "startTime");
      const performers = jsonldPerformers(block);

      const locRaw = (b["location"] ?? (b["@graph"] as unknown[])
        ?.find((n: unknown) => (n as Record<string,unknown>)["location"])
      ) as Record<string, unknown> | null;
      const venueName = locRaw ? jsonldString(locRaw, "name") : null;
      const addrRaw = locRaw?.["address"] as Record<string, unknown> | null;
      const venueCity = addrRaw
        ? jsonldString(addrRaw, "addressLocality", "city")
        : null;

      return {
        eventName:  eventName,
        date:       normaliseDate(rawDate),
        venueName:  venueName,
        venueCity:  venueCity,
        artists:    performers,
        confidence: (performers.length > 0 || venueName) ? "high" : "medium",
      };
    }
  }
  return null;
}

/** Extract Open Graph / meta fallback. */
function parseMetaTags(html: string): Partial<ParsedEvent> {
  const get = (prop: string): string | null => {
    const m = new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ).exec(html) ??
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
      "i",
    ).exec(html);
    return m ? m[1]!.trim() : null;
  };

  const title       = get("og:title") ?? get("twitter:title");
  const description = get("og:description") ?? get("twitter:description");
  const dateRaw     = get("event:start_time") ?? get("og:event:start_time");

  return {
    eventName: title,
    date:      normaliseDate(dateRaw),
    artists:   [],
    confidence: "low",
    // Try to pull venue from description if present
    venueName: description?.match(/at (.+?)(?:,|\.|$)/i)?.[1]?.trim() ?? null,
    venueCity: null,
  };
}

/** Claude-powered extraction fallback. */
async function extractWithClaude(
  html: string,
  url: string,
  apiKey: string,
): Promise<Partial<ParsedEvent>> {
  const client = new Anthropic({ apiKey });
  const text = stripHtml(html).slice(0, 6000); // keep tokens reasonable

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Extract concert/event details from this web page text. Return ONLY valid JSON with these fields (use null for any you can't find):
{
  "eventName": string or null,
  "date": "YYYY-MM-DD" or null,
  "venueName": string or null,
  "venueCity": string or null,
  "artists": string[] (performer names, headliner first)
}

URL: ${url}
Page text:
${text}`,
      },
    ],
  });

  const raw = response.content[0];
  if (raw?.type !== "text") return { artists: [], confidence: "low" };

  const jsonMatch = /\{[\s\S]*\}/.exec(raw.text);
  if (!jsonMatch) return { artists: [], confidence: "low" };

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      eventName?: string | null;
      date?: string | null;
      venueName?: string | null;
      venueCity?: string | null;
      artists?: string[];
    };
    return {
      eventName:  parsed.eventName  ?? null,
      date:       normaliseDate(parsed.date),
      venueName:  parsed.venueName  ?? null,
      venueCity:  parsed.venueCity  ?? null,
      artists:    Array.isArray(parsed.artists) ? parsed.artists : [],
      confidence: "medium",
    };
  } catch {
    return { artists: [], confidence: "low" };
  }
}

// ─── Route plugin ──────────────────────────────────────────────────────────────

export async function parseUrlRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

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

    // Fetch the target page with a browser-like UA and a 10 s timeout
    let html: string;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; TinnitusBot/1.0; +https://tinnitus)",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });
      clearTimeout(timer);
      if (!res.ok) {
        return reply
          .code(422)
          .send({ error: `Page returned HTTP ${res.status}. Can't parse it.` });
      }
      html = await res.text();
    } catch (err) {
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

    // 2 — Open Graph meta
    const metaResult = parseMetaTags(html);

    // 3 — Claude fallback (if key is set and meta gave us very little)
    if (
      env.ANTHROPIC_API_KEY &&
      !metaResult.date &&
      (!metaResult.artists || metaResult.artists.length === 0)
    ) {
      try {
        const claudeResult = await extractWithClaude(html, url, env.ANTHROPIC_API_KEY);
        if (claudeResult.date || claudeResult.artists?.length || claudeResult.venueName) {
          return reply.send({
            eventName:  claudeResult.eventName  ?? metaResult.eventName  ?? null,
            date:       claudeResult.date       ?? metaResult.date       ?? null,
            venueName:  claudeResult.venueName  ?? metaResult.venueName  ?? null,
            venueCity:  claudeResult.venueCity  ?? metaResult.venueCity  ?? null,
            artists:    claudeResult.artists    ?? [],
            confidence: claudeResult.confidence ?? "low",
            sourceUrl:  url,
          } satisfies ParsedEvent);
        }
      } catch (err) {
        req.log.warn({ err }, "Claude URL extraction failed, falling back to meta");
      }
    }

    // Return whatever we have from meta
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
