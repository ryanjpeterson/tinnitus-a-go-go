import { describe, expect, it, vi } from "vitest";

// lib/env.ts validates the whole environment on import.
const ENV = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  APP_URL: "http://localhost:4444",
  MINIO_ENDPOINT: "minio",
  MINIO_PORT: "9000",
  MINIO_USE_SSL: "false",
  MINIO_ROOT_USER: "user",
  MINIO_ROOT_PASSWORD: "password",
  MINIO_BUCKET: "tagg-media",
  SMTP_HOST: "mailpit",
  SMTP_PORT: "1025",
  SMTP_FROM: "test@example.com",
  SESSION_SECRET: "x".repeat(32),
  CORS_ORIGINS: "http://localhost:4444",
};

async function load(extra: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...ENV, ...extra })) vi.stubEnv(k, v);
  return import("../src/lib/s3");
}

describe("mediaUrl (shared by every route that returns images)", () => {
  it("uses the public MinIO address when set", async () => {
    const { mediaUrl } = await load({ MINIO_PUBLIC_URL: "http://macmini:4444" });
    expect(mediaUrl("flyers/abc.jpg")).toBe("http://macmini:4444/tagg-media/flyers/abc.jpg");
  });

  it("falls back to the internal endpoint", async () => {
    vi.unstubAllEnvs();
    const { mediaUrl } = await load();
    expect(mediaUrl("a.png")).toBe("http://minio:9000/tagg-media/a.png");
  });
});
