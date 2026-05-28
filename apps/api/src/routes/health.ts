import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ ok: true, name: "tinnitus-a-go-go-api" }));

  app.get("/health/deep", async (req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { ok: true, db: "up" };
    } catch (err) {
      req.log.error({ err }, "deep health check failed");
      return reply.code(503).send({ ok: false, db: "down" });
    }
  });
}
