/**
 * Brand theme — the four colours the whole UI is derived from, plus an
 * optional uploaded logo and favicon. Stored in site_copy (section "theme").
 *
 *   GET    /public/theme              colours + logo/favicon URLs (no auth; every page needs it)
 *   PUT    /admin/theme               set the colours { accent, highlight, background, logo }
 *   DELETE /admin/theme               back to the default colours
 *   POST   /admin/theme/:asset        upload a logo or favicon (asset = logo | favicon)
 *   DELETE /admin/theme/:asset        remove it (back to the built-in one)
 */

import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { db, schema } from "../db/client.js";
import { requireAdmin } from "../auth/middleware.js";
import { s3, bucket } from "../lib/s3.js";
import { env } from "../lib/env.js";

const COLOR_KEYS = { accent: "theme.accent", highlight: "theme.highlight", background: "theme.background" } as const;
/** Colours the theme used to have — cleared on save and reset. */
const RETIRED_KEYS = ["theme.logo"];
const ASSET_KEYS = { logo: "theme.logo_file", favicon: "theme.favicon_file" } as const;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colours are #RRGGBB");

const ASSET_TYPES: Record<string, string> = {
  "image/svg+xml": ".svg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/jpeg": ".jpg",
};

const mediaUrl = (key: string) =>
  `${env.MINIO_PUBLIC_URL ?? `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`}/${bucket}/${key}`;

async function setValue(key: string, value: string, description: string): Promise<void> {
  await db
    .insert(schema.siteCopy)
    .values({ key, value, description, section: "theme" })
    .onConflictDoUpdate({ target: schema.siteCopy.key, set: { value, updatedAt: new Date() } });
}

async function readTheme() {
  const rows = await db.select().from(schema.siteCopy).where(sql`${schema.siteCopy.section} = 'theme'`);
  const get = (k: string) => rows.find((r) => r.key === k)?.value || null;
  return {
    colors: {
      accent: get(COLOR_KEYS.accent),
      highlight: get(COLOR_KEYS.highlight),
      background: get(COLOR_KEYS.background),
    },
    logoKey: get(ASSET_KEYS.logo),
    faviconKey: get(ASSET_KEYS.favicon),
  };
}

/**
 * An uploaded SVG is served from the app's own origin, so it must not carry
 * script: refuse anything with script elements, event handlers, javascript:
 * URLs or embedded foreign objects.
 */
function unsafeSvg(text: string): boolean {
  return /<script|on[a-z]+\s*=|javascript:|<foreignObject|<iframe|<embed|<object/i.test(text);
}

export async function themeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/public/theme", async (_req, reply) => {
    const t = await readTheme();
    // Unset colours are null — the app falls back to its defaults.
    return reply.send({
      theme: t.colors,
      logoUrl: t.logoKey ? mediaUrl(t.logoKey) : null,
      faviconUrl: t.faviconKey ? mediaUrl(t.faviconKey) : null,
    });
  });

  app.put("/admin/theme", { preHandler: [requireAdmin] }, async (req, reply) => {
    const parsed = z.object({ accent: hex, highlight: hex, background: hex }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "accent, highlight and background must be #RRGGBB colours." });
    const labels = { accent: "Accent colour", highlight: "Highlight colour", background: "Background colour" };
    for (const k of Object.keys(COLOR_KEYS) as (keyof typeof COLOR_KEYS)[]) {
      await setValue(COLOR_KEYS[k], parsed.data[k].toUpperCase(), labels[k]);
    }
    await db.delete(schema.siteCopy).where(inArray(schema.siteCopy.key, RETIRED_KEYS));
    return reply.send({ theme: parsed.data });
  });

  app.delete("/admin/theme", { preHandler: [requireAdmin] }, async (_req, reply) => {
    await db.delete(schema.siteCopy).where(inArray(schema.siteCopy.key, [...Object.values(COLOR_KEYS), ...RETIRED_KEYS]));
    return reply.send({ ok: true });
  });

  app.post("/admin/theme/:asset", { preHandler: [requireAdmin] }, async (req, reply) => {
    const asset = (req.params as { asset: string }).asset;
    if (asset !== "logo" && asset !== "favicon") return reply.code(404).send({ error: "Upload a logo or a favicon." });
    const file = await req.file({ limits: { fileSize: 1024 * 1024 } });
    if (!file) return reply.code(400).send({ error: "No file uploaded." });
    const ext = ASSET_TYPES[file.mimetype.toLowerCase()];
    const buffer = await file.toBuffer().catch(() => null);
    if (!buffer || file.file.truncated) return reply.code(413).send({ error: "Keep it under 1 MB." });
    if (!ext) return reply.code(415).send({ error: "Use SVG, PNG, WebP or JPEG." });
    if (ext === ".svg" && unsafeSvg(buffer.toString("utf8"))) {
      return reply.code(422).send({ error: "That SVG contains scripts or embedded content — export a plain SVG." });
    }

    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 12);
    const key = `brand/${asset}-${hash}${ext}`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: file.mimetype, ContentLength: buffer.length }));
    const previous = (await readTheme())[asset === "logo" ? "logoKey" : "faviconKey"];
    await setValue(ASSET_KEYS[asset], key, asset === "logo" ? "Uploaded logo (storage key)" : "Uploaded favicon (storage key)");
    if (previous && previous !== key) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: previous })).catch(() => undefined);
    return reply.send({ url: mediaUrl(key) });
  });

  app.delete("/admin/theme/:asset", { preHandler: [requireAdmin] }, async (req, reply) => {
    const asset = (req.params as { asset: string }).asset;
    if (asset !== "logo" && asset !== "favicon") return reply.code(404).send({ error: "Not found." });
    const previous = (await readTheme())[asset === "logo" ? "logoKey" : "faviconKey"];
    await db.delete(schema.siteCopy).where(inArray(schema.siteCopy.key, [ASSET_KEYS[asset]]));
    if (previous) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: previous })).catch(() => undefined);
    return reply.send({ ok: true });
  });
}
