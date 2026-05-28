import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "./env.js";
// Relative import from the api workspace — schema is co-located there until we extract
// it into its own `packages/db` package. See ../../api/src/db/schema.ts for the source of truth.
import * as schema from "../../api/src/db/schema.js";

const client = postgres(env.DATABASE_URL, {
  // Worker stays small: a handful of import jobs at most, each opens its own transaction.
  max: 5,
});

export const db = drizzle(client, { schema });
export { schema };
export type DB = typeof db;
