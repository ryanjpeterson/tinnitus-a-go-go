import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://tagg:tagg_dev_password@localhost:5432/tagg",
  },
  strict: true,
  verbose: true,
} satisfies Config;
