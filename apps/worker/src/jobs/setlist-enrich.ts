/**
 * Automatic setlist finder — the setlist.fm counterpart of artist enrichment.
 *
 *   scan    (hourly)  pick up to BATCH_SIZE (show, artist) pairs on attended,
 *                     past shows that have no setlist yet, newest shows first,
 *                     and queue a lookup for each
 *   lookup            search setlist.fm by artist + date; link the result only
 *                     when the artist name and the venue's city match and it has
 *                     songs, and store the songs (same cache the show page reads)
 *
 * Every search is recorded in setlist_lookups. A miss is retried at most
 * MAX_ATTEMPTS times, RETRY_DAYS apart — setlists are often added after a show.
 *
 * Rate limits: the worker spaces calls 1.2 s apart (setlist.fm throttles faster bursts),
 * counts its calls per UTC day in Redis and stops at SETLIST_FINDER_DAILY_BUDGET
 * (leaving the rest of the free ~1,440/day for searches made in the app), and on
 * a 429 pauses the whole queue for COOLDOWN_MS. A paused lookup goes back in the
 * queue; it is not recorded as a miss.
 */
import type { Job } from "bullmq";
import { Queue, Worker } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import {
  QUEUE_SETLIST_ENRICH,
  SETLIST_FINDER_DAILY_BUDGET,
  setlistfmUsageKey,
  type SetlistEnrichJobData,
  type SetlistEnrichJobResult,
} from "@tagg/shared";
import { db, schema } from "../db.js";
import { redis } from "../redis.js";
import { env } from "../env.js";
// Pure helpers shared with the API (same relative-import arrangement as the schema).
import { pickMatch, searchSetlists, SetlistfmRateLimit, songRows } from "../../../api/src/lib/setlistfm-core.js";

// setlist.fm's free key allows ~1,440 requests a day; 30 an hour leaves room
// for searches made from the show page.
const BATCH_SIZE = 30;
const MAX_ATTEMPTS = 3;
const RETRY_DAYS = 30;
const COOLDOWN_MS = 15 * 60 * 1000;

let worker: Worker<SetlistEnrichJobData> | null = null;
/** Called once from index.ts so lookups can pause the queue on a rate limit. */
export function bindSetlistWorker(w: Worker<SetlistEnrichJobData>): void {
  worker = w;
}

const today = () => new Date().toISOString().slice(0, 10);
const msUntilUtcMidnight = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime() + 60_000;
};
async function callsToday(): Promise<number> {
  return Number((await redis.get(setlistfmUsageKey(today()))) ?? 0);
}

/** Pause every setlist lookup for `ms`, and put this job back in the queue. */
async function pauseQueue(ms: number, why: string): Promise<never> {
  console.warn(`[worker] setlist finder paused ${Math.round(ms / 60000)} min: ${why}`);
  if (worker) await worker.rateLimit(ms);
  throw Worker.RateLimitError();
}

export const setlistQueue = new Queue<SetlistEnrichJobData>(QUEUE_SETLIST_ENRICH, { connection: redis });

async function scan(): Promise<SetlistEnrichJobResult> {
  // Nothing to queue if today's budget is already spent; the next hourly scan tries again.
  const remaining = SETLIST_FINDER_DAILY_BUDGET - (await callsToday());
  if (remaining <= 0) return { result: "scanned", queued: 0 };
  const pairs = await db.execute<{ concert_id: string; artist_id: string }>(sql`
    select c.id as concert_id, ca.artist_id
    from concerts c
    join concert_artists ca on ca.concert_id = c.id
    where c.date < current_date
      and exists (select 1 from concert_attendees x where x.concert_id = c.id and x.status = 'attended')
      and not exists (select 1 from setlists s where s.concert_id = c.id and s.artist_id = ca.artist_id)
      and not exists (
        select 1 from setlist_lookups l
        where l.concert_id = c.id and l.artist_id = ca.artist_id
          and (l.attempts >= ${MAX_ATTEMPTS}
               or l.last_result = 'taken'
               or l.last_checked_at > now() - make_interval(days => ${RETRY_DAYS}))
      )
    order by c.date desc, ca.set_order asc nulls last
    limit ${Math.min(BATCH_SIZE, remaining)}
  `);
  const list = [...pairs];
  if (list.length > 0) {
    await setlistQueue.addBulk(list.map((p) => ({
      name: "lookup",
      data: { kind: "lookup" as const, concertId: p.concert_id, artistId: p.artist_id },
      // Removed when done so the same pair can be queued again on a later retry.
      opts: { jobId: `setlist-${p.concert_id}-${p.artist_id}`, removeOnComplete: true, removeOnFail: { age: 86_400 } },
    })));
  }
  return { result: "scanned", queued: list.length };
}

async function record(concertId: string, artistId: string, result: "linked" | "no_match" | "taken"): Promise<void> {
  await db.insert(schema.setlistLookups)
    .values({ concertId, artistId, attempts: 1, lastResult: result, lastCheckedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.setlistLookups.concertId, schema.setlistLookups.artistId],
      set: { attempts: sql`${schema.setlistLookups.attempts} + 1`, lastResult: result, lastCheckedAt: new Date() },
    });
}

async function lookup(concertId: string, artistId: string): Promise<SetlistEnrichJobResult> {
  const [row] = await db
    .select({ date: schema.concerts.date, city: schema.venues.city, artistName: schema.artists.name })
    .from(schema.concerts)
    .innerJoin(schema.artists, eq(schema.artists.id, artistId))
    .leftJoin(schema.venues, eq(schema.venues.id, schema.concerts.venueId))
    .where(eq(schema.concerts.id, concertId));
  if (!row) return { result: "skipped" };

  // Linked by hand since this was queued.
  const existing = await db.query.setlists.findFirst({
    where: and(eq(schema.setlists.concertId, concertId), eq(schema.setlists.artistId, artistId)),
  });
  if (existing) return { result: "skipped" };

  if ((await callsToday()) >= SETLIST_FINDER_DAILY_BUDGET) {
    await pauseQueue(msUntilUtcMidnight(), "daily budget used");
  }
  // Count the call before making it, so failures still count toward the budget.
  const key = setlistfmUsageKey(today());
  await redis.multi().incr(key).expire(key, 2 * 86_400).exec();
  let results;
  try {
    results = await searchSetlists(row.artistName, row.date, env.SETLISTFM_API_KEY!);
  } catch (err) {
    if (err instanceof SetlistfmRateLimit) await pauseQueue(COOLDOWN_MS, "setlist.fm returned 429");
    throw err;
  }
  const match = pickMatch(results, row.artistName, row.city);
  if (!match) {
    await record(concertId, artistId, "no_match");
    return { result: "no_match" };
  }

  const taken = await db.query.setlists.findFirst({ where: eq(schema.setlists.setlistfmId, match.id) });
  if (taken) {
    await record(concertId, artistId, "taken");
    return { result: "taken" };
  }

  // Search results include the full setlist, so the songs are stored now.
  const songs = songRows(match);
  await db.transaction(async (tx) => {
    const [setlist] = await tx.insert(schema.setlists)
      .values({ concertId, artistId, setlistfmId: match.id, fetchedAt: new Date() })
      .returning({ id: schema.setlists.id });
    if (songs.length > 0) {
      await tx.insert(schema.setlistSongs).values(songs.map((s) => ({ ...s, setlistId: setlist!.id })));
    }
  });
  await record(concertId, artistId, "linked");
  return { result: "linked" };
}

export async function runSetlistEnrich(job: Job<SetlistEnrichJobData>): Promise<SetlistEnrichJobResult> {
  if (!env.SETLISTFM_API_KEY) return { result: "skipped" };
  return job.data.kind === "scan" ? scan() : lookup(job.data.concertId, job.data.artistId);
}
