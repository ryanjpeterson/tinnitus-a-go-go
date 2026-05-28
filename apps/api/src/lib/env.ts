import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  APP_URL: z.string().url(),

  MINIO_ENDPOINT: z.string(),
  MINIO_PORT: z.coerce.number().int().positive(),
  MINIO_USE_SSL: z.enum(["true", "false"]).transform((v) => v === "true"),
  MINIO_ROOT_USER: z.string(),
  MINIO_ROOT_PASSWORD: z.string(),
  MINIO_BUCKET: z.string(),
  // Public-facing base URL for MinIO (used in presigned URLs the browser fetches).
  // In dev this is http://localhost:9000; in prod it may be a CDN or reverse-proxy URL.
  // Defaults to the internal endpoint so existing deployments don't break.
  MINIO_PUBLIC_URL: z.string().url().optional(),

  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_FROM: z.string(),

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 chars"),
  SESSION_COOKIE_NAME: z.string().default("tagg_session"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Optional: setlist.fm API key for concert prefill. Get one at https://api.setlist.fm/docs/1.0/
  SETLISTFM_API_KEY: z.string().optional(),

  // Optional: Anthropic API key for LLM-assisted URL parsing.
  // When set, the /concerts/parse-url endpoint can fall back to Claude extraction
  // if no JSON-LD structured data is found on the target page.
  ANTHROPIC_API_KEY: z.string().optional(),

  INVITES_PER_USER: z.coerce.number().int().nonnegative().default(3),
  INVITE_TTL_DAYS: z.coerce.number().int().positive().default(14),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),

  CORS_ORIGINS: z.string().transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),

  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
