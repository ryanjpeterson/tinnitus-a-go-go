/**
 * Concert routes — the concert + attendee model. Concert records are shared;
 * attendee rows are per-user. GET endpoints are public, writes require admin.
 *
 *   concerts/read.ts    GET /concerts, /concerts/followup, /concerts/:idOrSlug
 *   concerts/write.ts   POST /concerts, PATCH and DELETE /concerts/:id
 *   concerts/flyer.ts   POST /concerts/:id/flyer(/url), DELETE /concerts/:id/flyer
 *   concerts/lineup.ts  PUT /concerts/:id/artists, PUT and DELETE /concerts/:id/setlists/:artistId
 */

import type { FastifyInstance } from "fastify";
import { concertReadRoutes } from "./concerts/read.js";
import { concertWriteRoutes } from "./concerts/write.js";
import { concertFlyerRoutes } from "./concerts/flyer.js";
import { concertLineupRoutes } from "./concerts/lineup.js";

export async function concertRoutes(app: FastifyInstance): Promise<void> {
  concertReadRoutes(app);
  concertWriteRoutes(app);
  concertFlyerRoutes(app);
  concertLineupRoutes(app);
}
