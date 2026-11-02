/**
 * PUT    /concerts/:id/artists             replace the lineup
 * PUT    /concerts/:id/setlists/:artistId  link a setlist.fm setlist
 * DELETE /concerts/:id/setlists/:artistId  unlink it
 */

import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../../db/client.js";
import { requireAdmin } from "../../auth/middleware.js";
import { billingRoles } from "../../lib/lineup.js";
import { slugify } from "@tagg/shared";
import { cacheSetlist, parseSetlistId } from "../../lib/setlist-cache.js";
import { concertArtistRoles } from "./shared.js";

export function concertLineupRoutes(app: FastifyInstance): void {
  // ── PUT /concerts/:id/artists ───────────────────────────────────────────────
  // Atomically replaces the entire lineup for a concert. Admin only.

  const putArtistsBody = z.object({
    artists: z
      .array(
        z.object({
          // Provide EITHER artistId (existing) OR artistName (server will upsert).
          artistId: z.string().uuid().optional(),
          artistName: z.string().min(1).max(256).optional(),
          role: z.enum(concertArtistRoles),
          setOrder: z.number().int().min(0).nullable().optional(),
          appearanceNotes: z.string().max(500).nullable().optional(),
        }).refine((d) => d.artistId || d.artistName, "Each entry needs artistId or artistName"),
      )
      .max(50),
  });

  app.put("/concerts/:id/artists", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { id: concertId } = req.params as { id: string };
    const parsed = putArtistsBody.safeParse(req.body);
    if (!parsed.success) {
      app.log.warn({ body: req.body, errors: parsed.error.flatten() }, "PUT /concerts/:id/artists validation failed");
      return reply.code(400).send({ error: "Invalid body.", details: parsed.error.flatten() });
    }

    // Verify concert exists
    const concert = await db.query.concerts.findFirst({
      where: eq(schema.concerts.id, concertId),
    });
    if (!concert) return reply.code(404).send({ error: "Concert not found." });

    const { artists } = parsed.data;

    // Top billing: one headliner, or several co-headliners — never both.
    const billing = billingRoles(artists.map((a) => a.role));
    if ("error" in billing) return reply.code(422).send({ error: billing.error });

    // Validate explicit artistIds exist before doing any writes
    const byIdArtists = artists.filter((a) => a.artistId);
    if (byIdArtists.length > 0) {
      const ids = byIdArtists.map((a) => a.artistId!);
      const found = await db
        .select({ id: schema.artists.id })
        .from(schema.artists)
        .where(inArray(schema.artists.id, ids));
      if (found.length !== ids.length) {
        return reply.code(404).send({ error: "One or more artist IDs not found." });
      }
    }

    // Upsert by-name artists and build index → resolved artistId map
    const resolvedIds = new Map<number, string>();
    for (let i = 0; i < artists.length; i++) {
      const a = artists[i]!;
      if (a.artistId) {
        resolvedIds.set(i, a.artistId);
      } else if (a.artistName) {
        const aSlug = slugify(a.artistName);
        const [artist] = await db
          .insert(schema.artists)
          .values({ name: a.artistName, slug: aSlug })
          .onConflictDoUpdate({ target: schema.artists.slug, set: { name: a.artistName } })
          .returning({ id: schema.artists.id });
        if (artist) resolvedIds.set(i, artist.id);
      }
    }

    // Replace atomically: delete existing rows then insert new set
    await db.transaction(async (tx) => {
      await tx.delete(schema.concertArtists).where(eq(schema.concertArtists.concertId, concertId));
      const rows = artists
        .map((a, i) => ({ a, i }))
        .filter(({ i }) => resolvedIds.has(i))
        .map(({ a, i }) => ({
          concertId,
          artistId: resolvedIds.get(i)!,
          role: a.role,
          setOrder: a.setOrder ?? i,
          appearanceNotes: a.appearanceNotes ?? null,
        }));
      if (rows.length > 0) {
        await tx.insert(schema.concertArtists).values(rows);
      }
    });

    // headlinerHint and the slug follow the lineup in the database.
    return reply.send({ ok: true });
  });

  // ── PUT /concerts/:id/setlists/:artistId ───────────────────────────────────
  // Save a setlist.fm link for an artist on this concert.

  const putSetlistBody = z.object({
    setlistfmId: z.string().min(1).max(512), // Can be full URL or just ID
  });

  app.put("/concerts/:id/setlists/:artistId", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { id: concertId, artistId } = req.params as { id: string; artistId: string };

    const parsed = putSetlistBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body.", details: parsed.error.flatten() });
    }

    // Verify concert exists
    const concert = await db.query.concerts.findFirst({
      where: eq(schema.concerts.id, concertId),
    });
    if (!concert) return reply.code(404).send({ error: "Concert not found." });

    // Verify artist exists
    const artist = await db.query.artists.findFirst({
      where: eq(schema.artists.id, artistId),
      columns: { id: true },
    });
    if (!artist) return reply.code(404).send({ error: "Artist not found." });

    // Store the bare setlist.fm id so the same setlist pasted as a URL and as
    // an id is recognised as one link (setlistfm_id is unique).
    const setlistfmId = parseSetlistId(parsed.data.setlistfmId);
    if (!setlistfmId) return reply.code(400).send({ error: "Not a setlist.fm link or id." });

    // Upsert the setlist
    const [setlist] = await db
      .insert(schema.setlists)
      .values({
        concertId,
        artistId,
        setlistfmId,
      })
      .onConflictDoUpdate({
        target: schema.setlists.setlistfmId,
        set: { concertId, artistId },
      })
      .returning({ id: schema.setlists.id });

    // Copy the songs now so the show page never has to ask setlist.fm again.
    if (setlist) {
      await cacheSetlist(setlist.id, setlistfmId).catch((err) => {
        req.log.warn({ err }, "setlist.fm cache on link failed — will retry on next view");
      });
    }

    return reply.send({ ok: true, setlistId: setlist?.id ?? null });
  });

  // ── DELETE /concerts/:id/setlists/:artistId ────────────────────────────────
  // Remove a setlist link for an artist on this concert.

  app.delete("/concerts/:id/setlists/:artistId", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { id: concertId, artistId } = req.params as { id: string; artistId: string };

    // Verify concert exists
    const concert = await db.query.concerts.findFirst({
      where: eq(schema.concerts.id, concertId),
    });
    if (!concert) return reply.code(404).send({ error: "Concert not found." });

    await db
      .delete(schema.setlists)
      .where(
        and(
          eq(schema.setlists.concertId, concertId),
          eq(schema.setlists.artistId, artistId),
        ),
      );

    return reply.code(204).send();
  });
}
