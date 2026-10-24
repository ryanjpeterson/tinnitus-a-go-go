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

const COLOR_KEYS = { accent: "theme.accent", highlight: "theme.highlight", background: "theme.background", support: "theme.support" } as const;
/** Colours the theme used to have — cleared on save and reset. */
const RETIRED_KEYS = ["theme.logo"];
const ASSET_KEYS = { logo: "theme.logo_file", favicon: "theme.favicon_file" } as const;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colours are #RRGGBB");
/** Fonts (jimbo.ui): a font key for headings and body (the app's FONTS; old "sans" / "mono" / "serif" still work), with weights and letter spacing; stored as JSON. */
const FONTS_KEY = "theme.fonts";
const fontKey = z.string().regex(/^[a-z0-9-]{1,40}$/);
const fonts = z.object({
  headings: fontKey.optional(),
  body: fontKey.optional(),
  headingsWeight: z.number().int().min(100).max(900).optional(),
  bodyWeight: z.number().int().min(100).max(900).optional(),
  headingsTracking: z.number().min(-0.1).max(0.3).optional(),
  bodyTracking: z.number().min(-0.1).max(0.3).optional(),
});
/** Look settings (jimbo.ui): how missing colours are inferred, colour vibrancy and layer contrast. */
const OPTION_KEYS = { infer: "theme.infer", vibrancy: "theme.vibrancy", contrast: "theme.contrast" } as const;
const options = {
  infer: z.enum(["contrast", "tonal"]).optional(),
  vibrancy: z.number().min(0.4).max(1.5).optional(),
  contrast: z.number().min(0.8).max(1.6).optional(),
};

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

function parseFonts(raw: string | null): z.infer<typeof fonts> | null {
  if (!raw) return null;
  try { const f = fonts.safeParse(JSON.parse(raw)); return f.success ? f.data : null; } catch { return null; }
}

const num = (v: string | null): number | null => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

async function readTheme() {
  const rows = await db.select().from(schema.siteCopy).where(sql`${schema.siteCopy.section} = 'theme'`);
  const get = (k: string) => rows.find((r) => r.key === k)?.value || null;
  return {
    colors: {
      accent: get(COLOR_KEYS.accent),
      highlight: get(COLOR_KEYS.highlight),
      background: get(COLOR_KEYS.background),
      support: get(COLOR_KEYS.support),
      fonts: parseFonts(get(FONTS_KEY)),
      infer: get(OPTION_KEYS.infer) === "tonal" ? "tonal" : get(OPTION_KEYS.infer) === "contrast" ? "contrast" : null,
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
    // Highlight and support are optional (jimbo.ui 0.5–0.6): what's left out, the app infers from the
    // accent and background. Store only what's sent; fonts default to sans.
    const parsed = z.object({ accent: hex, background: hex, highlight: hex.optional(), support: hex.optional(), fonts: fonts.optional(), ...options }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "accent and background must be #RRGGBB colours (highlight and support too, if given); fonts, vibrancy (0.4–1.5) and contrast (0.8–1.6) must be in range." });
    const labels = { accent: "Accent colour", highlight: "Highlight colour", background: "Background colour", support: "Support colour" };
    for (const k of Object.keys(COLOR_KEYS) as (keyof typeof COLOR_KEYS)[]) {
      const v = parsed.data[k];
      if (v) await setValue(COLOR_KEYS[k], v.toUpperCase(), labels[k]);
    }
    const cleared: string[] = [
      ...(parsed.data.highlight ? [] : [COLOR_KEYS.highlight]),
      ...(parsed.data.support ? [] : [COLOR_KEYS.support]),
    ];
    const f = parsed.data.fonts;
    if (f && Object.keys(f).length > 0) await setValue(FONTS_KEY, JSON.stringify(f), "Fonts");
    else cleared.push(FONTS_KEY);
    const optionLabels = { infer: "Inferred colours", vibrancy: "Colour vibrancy", contrast: "Layer contrast" };
    for (const k of Object.keys(OPTION_KEYS) as (keyof typeof OPTION_KEYS)[]) {
      const v = parsed.data[k];
      if (v != null) await setValue(OPTION_KEYS[k], String(v), optionLabels[k]);
      else cleared.push(OPTION_KEYS[k]);
    }
    await db.delete(schema.siteCopy).where(inArray(schema.siteCopy.key, [...RETIRED_KEYS, ...cleared]));
    return reply.send({ theme: parsed.data });
  });

  app.delete("/admin/theme", { preHandler: [requireAdmin] }, async (_req, reply) => {
    await db.delete(schema.siteCopy).where(inArray(schema.siteCopy.key, [...Object.values(COLOR_KEYS), FONTS_KEY, ...Object.values(OPTION_KEYS), ...RETIRED_KEYS]));
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
