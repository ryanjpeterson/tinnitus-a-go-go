/**
 * Delete storage objects nothing points at any more. Database triggers queue
 * them in storage_orphans (e.g. a festival removed after its last show was
 * deleted); this sweep removes each file unless something references it again.
 */

import { sql } from "drizzle-orm";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../db/client.js";
import { s3, bucket } from "./s3.js";

type Log = { info: (o: object, m: string) => void; error: (o: object, m: string) => void };

export async function sweepStorageOrphans(log: Log): Promise<number> {
  const rows = [...(await db.execute<{ key: string }>(sql`
    select o.key from storage_orphans o
    where not exists (select 1 from concerts c where c.flyer_key = o.key)
      and not exists (select 1 from event_series e where e.flyer_key = o.key)
      and not exists (select 1 from photos p where p.object_key = o.key)
      and not exists (select 1 from artists a where a.image_key = o.key)
      and not exists (select 1 from venues v where v.image_key = o.key)`))];
  let removed = 0;
  for (const { key } of rows) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      removed++;
    } catch (err) {
      log.error({ err, key }, "couldn't delete orphaned storage object");
      continue;
    }
    await db.execute(sql`delete from storage_orphans where key = ${key}`);
  }
  // Keys that are referenced again just leave the queue.
  await db.execute(sql`
    delete from storage_orphans o
    where exists (select 1 from concerts c where c.flyer_key = o.key)
       or exists (select 1 from event_series e where e.flyer_key = o.key)`);
  if (removed > 0) log.info({ removed }, "orphaned storage objects deleted");
  return removed;
}

/** Sweep two minutes after startup, then hourly. */
export function startStorageOrphanSweep(log: Log): () => void {
  const run = () => void sweepStorageOrphans(log).catch((err) => log.error({ err }, "storage orphan sweep failed"));
  const first = setTimeout(run, 120_000);
  const every = setInterval(run, 60 * 60 * 1000);
  return () => { clearTimeout(first); clearInterval(every); };
}
