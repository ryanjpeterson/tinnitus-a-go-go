/**
 * Brand theme — the colours the whole UI is derived from (accent and
 * background; highlight and support optional), type, backdrop and look
 * settings, plus an optional uploaded logo and favicon. Admin routes use requireAdmin. Stored in site_copy (section "theme";
 * the theme itself as one JSON value, theme.json).
 *
 *   GET    /public/theme              colours + logo/favicon URLs (no auth; every page needs it)
 *   PUT    /admin/theme               set the theme (requireAdmin): the whole theme object, stored as sent
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
import { s3, bucket, mediaUrl } from "../lib/s3.js";

const COLOR_KEYS = { accent: "theme.accent", highlight: "theme.highlight", background: "theme.background", support: "theme.support" } as const;
/**
 * The whole theme as sent, as JSON (jimbo.ui 0.13): colours, fonts, backdrop
 * (with its motion), motif, and whatever the theme gains later, so a new
 * option saves without a change here. The app's `withDefaults` and
 * `ownColours` drop what they don't know.
 */
const THEME_KEY = "theme.json";
/** Per-field keys from before the theme was stored whole — read when there's no theme.json yet, cleared on save and reset. */
const FONTS_KEY = "theme.fonts";
const BACKDROP_KEY = "theme.backdrop";
const OPTION_KEYS = { infer: "theme.infer", vibrancy: "theme.vibrancy", contrast: "theme.contrast" } as const;
const LEGACY_KEYS = [...Object.values(COLOR_KEYS), FONTS_KEY, BACKDROP_KEY, ...Object.values(OPTION_KEYS), "theme.logo"];
const ASSET_KEYS = { logo: "theme.logo_file", favicon: "theme.favicon_file" } as const;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colours are #RRGGBB");
/** Colours are checked; everything else passes through, kept to a small JSON object. */
const themeBody = z
  .object({ accent: hex, background: hex, highlight: hex.optional(), support: hex.optional() })
  .passthrough()
  .refine((t) => JSON.stringify(t).length <= 16_000, "Theme is too large");

const ASSET_TYPES: Record<string, string> = {
  "image/svg+xml": ".svg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/jpeg": ".jpg",
};

async function setValue(key: string, value: string, description: string): Promise<void> {
  await db
    .insert(schema.siteCopy)
    .values({ key, value, description, section: "theme" })
    .onConflictDoUpdate({ target: schema.siteCopy.key, set: { value, updatedAt: new Date() } });
}

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try { const v = JSON.parse(raw); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; }
}

const num = (v: string | null): number | null => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

async function readTheme() {
  const rows = await db.select().from(schema.siteCopy).where(sql`${schema.siteCopy.section} = 'theme'`);
  const get = (k: string) => rows.find((r) => r.key === k)?.value || null;
  const whole = parseJson(get(THEME_KEY));
  return {
    colors: whole ?? {
      accent: get(COLOR_KEYS.accent),
      highlight: get(COLOR_KEYS.highlight),
      background: get(COLOR_KEYS.background),
      support: get(COLOR_KEYS.support),
      fonts: parseJson(get(FONTS_KEY)),
      backdrop: parseJson(get(BACKDROP_KEY)),
      infer: get(OPTION_KEYS.infer),
      vibrancy: num(get(OPTION_KEYS.vibrancy)),
      contrast: num(get(OPTION_KEYS.contrast)),
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
    // Stored whole (jimbo.ui 0.13): highlight and support may be left out (the app infers them),
    // and every other field — fonts, backdrop and its motion, motif — is kept as sent.
    const parsed = themeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "accent and background must be #RRGGBB colours (highlight and support too, if given), and the theme must be a small JSON object." });
    const theme = { ...parsed.data } as Record<string, unknown>;
    for (const k of Object.keys(COLOR_KEYS)) if (typeof theme[k] === "string") theme[k] = (theme[k] as string).toUpperCase();
    await setValue(THEME_KEY, JSON.stringify(theme), "Theme");
    await db.delete(schema.siteCopy).where(inArray(schema.siteCopy.key, LEGACY_KEYS));
    return reply.send({ theme });
  });

  app.delete("/admin/theme", { preHandler: [requireAdmin] }, async (_req, reply) => {
    await db.delete(schema.siteCopy).where(inArray(schema.siteCopy.key, [THEME_KEY, ...LEGACY_KEYS]));
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
