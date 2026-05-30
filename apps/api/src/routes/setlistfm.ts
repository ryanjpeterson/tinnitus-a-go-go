/**
 * Setlist.fm proxy routes.
 *
 *   GET /setlistfm/search?artist=...&date=YYYY-MM-DD
 *     Returns simplified setlist results for the given artist + date.
 *     Requires SETLISTFM_API_KEY env var.  When the key is absent the endpoint
 *     responds 200 with { results: [], total: 0, available: false, error: null }
 *     so the frontend can degrade gracefully without showing an error.
 *
 *   Error codes (returned in the `error` field, HTTP 200 always):
 *     "auth_error"     — API key rejected (401/403)
 *     "rate_limited"   — Too many requests (429)
 *     "upstream_error" — setlist.fm returned a 5xx or unexpected status
 *     "network_error"  — fetch timed out or DNS/TCP failure
 *     "parse_error"    — response body was not valid JSON
 *
 * All routes require an authenticated session.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/middleware.js";
import { env } from "../lib/env.js";

type SetlistfmError =
  | "auth_error"
  | "rate_limited"
  | "upstream_error"
  | "network_error"
  | "parse_error";

// setlist.fm uses dd-MM-yyyy; we use YYYY-MM-DD everywhere else
function toSetlistDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function fromSetlistDate(sfm: string): string {
  const [d, m, y] = sfm.split("-");
  return `${y}-${m}-${d}`;
}

interface SetlistFmArtist {
  name: string;
  mbid?: string;
}

interface SetlistFmCity {
  name: string;
  state?: string;
  country?: { code: string; name: string };
}

interface SetlistFmVenue {
  name: string;
  city?: SetlistFmCity;
}

interface SetlistFmSong {
  name: string;
  tape?: boolean;
}

interface SetlistFmSet {
  name?: string;
  encore?: number;
  song?: SetlistFmSong[];
}

interface SetlistFmSetlist {
  id: string;
  eventDate: string;
  artist: SetlistFmArtist;
  venue?: SetlistFmVenue;
  sets?: { set?: SetlistFmSet[] };
}

interface SetlistFmResponse {
  setlist?: SetlistFmSetlist[];
  total?: number;
  page?: number;
}

function ok(
  results: ReturnType<typeof mapSetlists>,
  total: number,
): { results: typeof results; total: number; available: true; error: null } {
  return { results, total, available: true, error: null };
}

function err(
  code: SetlistfmError,
): { results: []; total: 0; available: true; error: SetlistfmError } {
  return { results: [], total: 0, available: true, error: code };
}

function mapSetlists(setlists: SetlistFmSetlist[]) {
  return setlists.map((s) => {
    const sets = (s.sets?.set ?? []).map((set) => ({
      name: set.name ?? null,
      encore: set.encore ?? null,
      songs: (set.song ?? []).filter((song) => !song.tape).map((song) => song.name),
    }));
    return {
      id: s.id,
      artist: s.artist.name,
      artistMbid: s.artist.mbid ?? null,
      venue: s.venue?.name ?? "",
      city: s.venue?.city
        ? [s.venue.city.name, s.venue.city.state].filter(Boolean).join(", ")
        : "",
      country: s.venue?.city?.country?.code ?? "",
      date: fromSetlistDate(s.eventDate),
      sets,
    };
  });
}

export async function setlistfmRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  const searchQuerySchema = z.object({
    artist: z.string().min(1).max(256),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  });

  app.get("/setlistfm/search", async (req, reply) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query.", details: parsed.error.flatten() });
    }

    // No key configured — feature unavailable but not an error
    if (!env.SETLISTFM_API_KEY) {
      return reply.send({ results: [], total: 0, available: false, error: null });
    }

    const { artist, date } = parsed.data;

    const url = new URL("https://api.setlist.fm/rest/1.0/search/setlists");
    url.searchParams.set("artistName", artist);
    url.searchParams.set("date", toSetlistDate(date));
    url.searchParams.set("p", "1");

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "x-api-key": env.SETLISTFM_API_KEY,
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch (fetchErr) {
      // Network failure, DNS error, or 8 s timeout
      const isTimeout =
        fetchErr instanceof Error &&
        (fetchErr.name === "TimeoutError" || fetchErr.name === "AbortError");
      app.log.warn({ fetchErr, isTimeout }, "setlist.fm fetch failed");
      return reply.send(err("network_error"));
    }

    // Status-specific error codes
    if (res.status === 401 || res.status === 403) {
      app.log.warn({ status: res.status }, "setlist.fm auth failure — check SETLISTFM_API_KEY");
      return reply.send(err("auth_error"));
    }
    if (res.status === 429) {
      app.log.warn("setlist.fm rate limit hit");
      return reply.send(err("rate_limited"));
    }
    if (res.status === 404) {
      // No setlists found — valid empty result, not an error
      return reply.send(ok([], 0));
    }
    if (!res.ok) {
      app.log.warn({ status: res.status }, "setlist.fm upstream error");
      return reply.send(err("upstream_error"));
    }

    // Parse JSON
    let data: SetlistFmResponse;
    try {
      data = (await res.json()) as SetlistFmResponse;
    } catch (parseErr) {
      app.log.warn({ parseErr }, "setlist.fm response parse error");
      return reply.send(err("parse_error"));
    }

    const results = mapSetlists(data.setlist ?? []);
    return reply.send(ok(results, data.total ?? results.length));
  });

  // ── GET /setlistfm/setlist/:id ──────────────────────────────────────────────
  // Fetch a specific setlist by its setlist.fm ID.
  // Also accepts full URLs like https://www.setlist.fm/setlist/x/3b5e8864.html

  const setlistIdParamSchema = z.object({
    id: z.string().min(1).max(512),
  });

  app.get("/setlistfm/setlist/:id", async (req, reply) => {
    const parsed = setlistIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid parameter.", details: parsed.error.flatten() });
    }

    if (!env.SETLISTFM_API_KEY) {
      return reply.send({ result: null, available: false, error: null });
    }

    let setlistId = parsed.data.id;

    // Parse ID from full URL if provided
    // URL format: https://www.setlist.fm/setlist/artist-name/year/venue-city-country-XXXXX.html
    // The ID is the alphanumeric string before .html
    if (setlistId.includes("setlist.fm")) {
      const match = setlistId.match(/([a-z0-9]+)\.html$/i);
      if (match) {
        setlistId = match[1]!;
      } else {
        return reply.code(400).send({ error: "Could not parse setlist ID from URL." });
      }
    }

    const url = `https://api.setlist.fm/rest/1.0/setlist/${setlistId}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "x-api-key": env.SETLISTFM_API_KEY,
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch (fetchErr) {
      const isTimeout =
        fetchErr instanceof Error &&
        (fetchErr.name === "TimeoutError" || fetchErr.name === "AbortError");
      app.log.warn({ fetchErr, isTimeout }, "setlist.fm fetch by ID failed");
      return reply.send({ result: null, available: true, error: "network_error" as SetlistfmError });
    }

    if (res.status === 401 || res.status === 403) {
      app.log.warn({ status: res.status }, "setlist.fm auth failure");
      return reply.send({ result: null, available: true, error: "auth_error" as SetlistfmError });
    }
    if (res.status === 429) {
      app.log.warn("setlist.fm rate limit hit");
      return reply.send({ result: null, available: true, error: "rate_limited" as SetlistfmError });
    }
    if (res.status === 404) {
      return reply.send({ result: null, available: true, error: null });
    }
    if (!res.ok) {
      app.log.warn({ status: res.status }, "setlist.fm upstream error");
      return reply.send({ result: null, available: true, error: "upstream_error" as SetlistfmError });
    }

    let data: SetlistFmSetlist;
    try {
      data = (await res.json()) as SetlistFmSetlist;
    } catch (parseErr) {
      app.log.warn({ parseErr }, "setlist.fm response parse error");
      return reply.send({ result: null, available: true, error: "parse_error" as SetlistfmError });
    }

    const results = mapSetlists([data]);
    return reply.send({ result: results[0] ?? null, available: true, error: null });
  });

  // ── GET /setlistfm/artist/:mbidOrName ───────────────────────────────────────
  // Search setlist.fm for an artist's recent setlists by MBID or name.

  const artistParamSchema = z.object({
    mbidOrName: z.string().min(1).max(256),
  });

  const artistQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
  });

  app.get("/setlistfm/artist/:mbidOrName", async (req, reply) => {
    const paramParsed = artistParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      return reply.code(400).send({ error: "Invalid parameter.", details: paramParsed.error.flatten() });
    }
    const queryParsed = artistQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return reply.code(400).send({ error: "Invalid query.", details: queryParsed.error.flatten() });
    }

    // No key configured — feature unavailable
    if (!env.SETLISTFM_API_KEY) {
      return reply.send({ results: [], total: 0, available: false, error: null });
    }

    const { mbidOrName } = paramParsed.data;
    const { page } = queryParsed.data;

    // Check if it looks like a UUID (MBID) or a name
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mbidOrName);

    const url = new URL("https://api.setlist.fm/rest/1.0/search/setlists");
    if (isUuid) {
      url.searchParams.set("artistMbid", mbidOrName);
    } else {
      url.searchParams.set("artistName", mbidOrName);
    }
    url.searchParams.set("p", String(page));

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "x-api-key": env.SETLISTFM_API_KEY,
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch (fetchErr) {
      const isTimeout =
        fetchErr instanceof Error &&
        (fetchErr.name === "TimeoutError" || fetchErr.name === "AbortError");
      app.log.warn({ fetchErr, isTimeout }, "setlist.fm artist search failed");
      return reply.send(err("network_error"));
    }

    if (res.status === 401 || res.status === 403) {
      app.log.warn({ status: res.status }, "setlist.fm auth failure");
      return reply.send(err("auth_error"));
    }
    if (res.status === 429) {
      app.log.warn("setlist.fm rate limit hit");
      return reply.send(err("rate_limited"));
    }
    if (res.status === 404) {
      return reply.send(ok([], 0));
    }
    if (!res.ok) {
      app.log.warn({ status: res.status }, "setlist.fm upstream error");
      return reply.send(err("upstream_error"));
    }

    let data: SetlistFmResponse;
    try {
      data = (await res.json()) as SetlistFmResponse;
    } catch (parseErr) {
      app.log.warn({ parseErr }, "setlist.fm response parse error");
      return reply.send(err("parse_error"));
    }

    const results = mapSetlists(data.setlist ?? []);
    return reply.send(ok(results, data.total ?? results.length));
  });
}
