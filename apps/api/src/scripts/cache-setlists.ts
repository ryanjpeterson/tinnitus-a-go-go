/**
 * One-off backfill for the setlist.fm song cache.
 *
 *   docker compose exec api npx tsx src/scripts/cache-setlists.ts
 *
 * 1. Normalises stored links to the bare setlist.fm id (older links were saved
 *    as full URLs) and removes duplicates that the normalisation reveals.
 * 2. Fetches songs for every link that has never been cached, ~2 per second.
 */
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { env } from "../lib/env.js";
import { cacheSetlist, parseSetlistId } from "../lib/setlist-cache.js";

if (!env.SETLISTFM_API_KEY) {
  console.error("SETLISTFM_API_KEY is not set.");
  process.exit(1);
}

// 1 — normalise ids, dropping a row when its normalised id is already linked.
const rows = await db.select().from(schema.setlists).where(isNotNull(schema.setlists.setlistfmId));
const seen = new Map<string, string>(); // bare id → row id kept
// Rows already holding a bare id win over URL-form duplicates.
rows.sort((a, b) => Number(a.setlistfmId!.includes("/")) - Number(b.setlistfmId!.includes("/")));
let normalised = 0;
let removed = 0;
for (const r of rows) {
  const bare = parseSetlistId(r.setlistfmId!);
  if (!bare) continue;
  if (seen.has(bare)) {
    await db.delete(schema.setlists).where(eq(schema.setlists.id, r.id));
    removed++;
    continue;
  }
  seen.set(bare, r.id);
  if (bare !== r.setlistfmId) {
    await db.update(schema.setlists).set({ setlistfmId: bare }).where(eq(schema.setlists.id, r.id));
    normalised++;
  }
}
console.log(`normalised ${normalised} link(s), removed ${removed} duplicate(s)`);

// 2 — fill the cache.
const pending = await db
  .select({ id: schema.setlists.id, setlistfmId: schema.setlists.setlistfmId })
  .from(schema.setlists)
  .where(and(isNotNull(schema.setlists.setlistfmId), isNull(schema.setlists.fetchedAt)));
let cached = 0;
for (const r of pending) {
  try {
    if (await cacheSetlist(r.id, r.setlistfmId)) cached++;
  } catch (err) {
    console.warn(`failed ${r.setlistfmId}: ${(err as Error).message}`);
  }
  await new Promise((res) => setTimeout(res, 600)); // setlist.fm allows ~2 requests/second
}
console.log(`cached ${cached} of ${pending.length} setlist(s)`);
process.exit(0);
