import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  MINIO_ENDPOINT: z.string(),
  MINIO_PORT: z.coerce.number().int().positive(),
  MINIO_USE_SSL: z.enum(["true", "false"]).transform((v) => v === "true"),
  MINIO_ROOT_USER: z.string(),
  MINIO_ROOT_PASSWORD: z.string(),
  MINIO_BUCKET: z.string(),
  // Optional: Last.fm API key for artist enrichment
  LASTFM_API_KEY: z.string().optional(),
  // Optional: setlist.fm API key for the automatic setlist finder
  SETLISTFM_API_KEY: z.string().optional(),

  // ── Notifications (show reminders, weekly recap) ──
  // Links in emails and ntfy messages, and the time zone their schedule runs in.
  APP_URL: z.string().url().default("http://localhost:5173"),
  TIMEZONE: z.string().default("America/Toronto"),
  // Email over SMTP. Gmail: smtp.gmail.com, 587, your address and an app password.
  // In dev, Mailpit (no user/password). Unset SMTP_HOST turns email off.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("tinnitus a-go-go <no-reply@tinnitusagogo.local>"),
  // ntfy push. NTFY_URL is how the worker reaches the server (http://ntfy in
  // compose); NTFY_PUBLIC_URL is how your phone does (shown on the Account page).
  // Unset NTFY_TOPIC turns ntfy off.
  NTFY_URL: z.string().url().default("http://ntfy"),
  NTFY_PUBLIC_URL: z.string().url().optional(),
  NTFY_TOPIC: z.string().regex(/^[-_A-Za-z0-9]{1,64}$/, "letters, numbers, - and _ only").optional(),
  NTFY_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(
  Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== "")),
);
if (!parsed.success) {
  console.error("worker: invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
