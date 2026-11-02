/**
 * Event-page parsing for POST /concerts/parse-url — pure functions, no I/O.
 *
 * Extraction strategy (in order):
 *   1. JSON-LD <script type="application/ld+json"> — structured data most major
 *      ticketing sites and venue websites emit.
 *   2. Open Graph meta tags — og:title, og:description, etc.
 */

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

/** Extract all JSON-LD blocks from HTML. */
export function extractJsonLd(html: string): unknown[] {
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

/**
 * Extract artist names from an event name string.
 * Handles formats like "Artist1, Artist2, Artist3" or "Artist1 / Artist2 / Artist3"
 * Common on Eventbrite where performers aren't in separate JSON-LD fields.
 */
function extractArtistsFromEventName(eventName: string | null): string[] {
  if (!eventName) return [];

  // Skip if it looks like a generic event name (contains common non-artist words)
  const skipPatterns = /\b(festival|tour|concert series|presents|night|party|showcase|celebration)\b/i;
  if (skipPatterns.test(eventName)) return [];

  // Try comma separation first (most common for Eventbrite)
  // "AngelMaker, Ingested, Disfiguring the Goddess, Soulthief"
  if (eventName.includes(",")) {
    const parts = eventName.split(",").map((s) => s.trim()).filter(Boolean);
    // Only use if we get 2+ parts and each part looks like an artist name (not too long)
    if (parts.length >= 2 && parts.every((p) => p.length <= 50)) {
      return parts;
    }
  }

  // Try slash separation ("Artist1 / Artist2")
  if (eventName.includes(" / ")) {
    const parts = eventName.split(" / ").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.every((p) => p.length <= 50)) {
      return parts;
    }
  }

  // Try "with" or "w/" patterns ("Headliner with Support1, Support2")
  const withMatch = eventName.match(/^(.+?)\s+(?:with|w\/)\s+(.+)$/i);
  if (withMatch) {
    const headliner = withMatch[1]!.trim();
    const supports = withMatch[2]!.split(/,|&/).map((s) => s.trim()).filter(Boolean);
    return [headliner, ...supports];
  }

  return [];
}

/** Try to extract an event from a JSON-LD block. */
export function parseJsonLd(blocks: unknown[]): Partial<ParsedEvent> | null {
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
      let performers = jsonldPerformers(block);

      // If no performers found in JSON-LD, try to extract from event name
      // (common on Eventbrite where artist names are comma-separated in the title)
      if (performers.length === 0) {
        performers = extractArtistsFromEventName(eventName);
      }

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
export function parseMetaTags(html: string): Partial<ParsedEvent> {
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
