/**
 * Web Push: sending, and the VAPID key pair. Used by the push routes and the
 * reminder timer (lib/push-reminders.ts). Takes the database handle and reads
 * no env.
 *
 * The VAPID key pair is generated on first use and kept in app_secrets, so a
 * fresh install needs no setup.
 */

import webpush from "web-push";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = PostgresJsDatabase<any>;

export interface PushPayload {
  title: string;
  body: string;
  /** Path in the app to open on tap, e.g. /shows/foo-fighters-2011-09-10 */
  url: string;
  /** Notifications with the same tag replace each other. */
  tag?: string;
}

export interface StoredSubscription { id: string; endpoint: string; p256dh: string; auth: string }

/** The VAPID key pair, created and stored on first use. */
export async function vapidKeys(db: DB): Promise<{ publicKey: string; privateKey: string }> {
  const read = async () => {
    const rows = [...(await db.execute<{ key: string; value: string }>(
      sql`select key, value from app_secrets where key in ('vapid_public', 'vapid_private')`,
    ))];
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    const publicKey = get("vapid_public");
    const privateKey = get("vapid_private");
    return publicKey && privateKey ? { publicKey, privateKey } : null;
  };
  const existing = await read();
  if (existing) return existing;
  const keys = webpush.generateVAPIDKeys();
  await db.execute(sql`
    insert into app_secrets (key, value) values ('vapid_public', ${keys.publicKey}), ('vapid_private', ${keys.privateKey})
    on conflict (key) do nothing`);
  return (await read())!; // another process may have won the race; use what's stored
}

/**
 * Send to every given subscription. Subscriptions the push service says are
 * gone (404/410) are deleted. Returns how many were delivered.
 */
export async function sendPush(db: DB, subs: StoredSubscription[], payload: PushPayload, contact: string): Promise<number> {
  if (subs.length === 0) return 0;
  const { publicKey, privateKey } = await vapidKeys(db);
  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { vapidDetails: { subject: contact, publicKey, privateKey }, TTL: 60 * 60 * 12 },
      );
      delivered++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.execute(sql`delete from push_subscriptions where id = ${s.id}`);
      } else {
        console.error(`[push] send failed (${status ?? "?"}):`, (err as Error).message);
      }
    }
  }
  return delivered;
}

/** A "mailto:" contact for the push services, from a From address like `Name <a@b.c>`. */
export function pushContact(from: string | undefined): string {
  const email = from?.match(/[^<\s]+@[^>\s]+/)?.[0];
  return `mailto:${email ?? "admin@tinnitus.local"}`;
}
