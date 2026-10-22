/**
 * Push reminders, checked every 15 minutes from 10:00 to 22:00 local time
 * (PUSH_TIMEZONE):
 *
 *   tonight      day of a show you're attending: "Tonight: Alice Cooper"
 *   how-was-it   the day after a show still marked attending: "How was it?"
 *
 * push_sent records each one, so nothing is sent twice.
 */

import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { env } from "./env.js";
import { loadShowInfo } from "./show-info.js";
import { pushContact, sendPush, type StoredSubscription } from "./push-core.js";

const INTERVAL_MS = 15 * 60 * 1000;

/** Local date (YYYY-MM-DD) and hour in the reminder time zone. */
function localNow(): { date: string; yesterday: string; hour: number } {
  const now = new Date();
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: env.PUSH_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: env.PUSH_TIMEZONE, hour: "numeric", hourCycle: "h23" }).format(now));
  return { date: fmt(now), yesterday: fmt(new Date(now.getTime() - 86_400_000)), hour };
}

export async function runPushReminders(log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void }): Promise<void> {
  const { date, yesterday, hour } = localNow();
  if (hour < 10 || hour >= 22) return;

  const due = [...(await db.execute<{ user_id: string; concert_id: string; slug: string; kind: string; venue: string | null }>(sql`
    select att.user_id, c.id as concert_id, c.slug, k.kind, v.name as venue
    from concert_attendees att
    join concerts c on c.id = att.concert_id
    left join venues v on v.id = c.venue_id
    join (values ('tonight', ${date}::date), ('how-was-it', ${yesterday}::date)) as k(kind, day) on c.date = k.day
    where att.status = 'attending'
      and exists (select 1 from push_subscriptions s where s.user_id = att.user_id)
      and not exists (select 1 from push_sent p where p.user_id = att.user_id and p.concert_id = c.id and p.kind = k.kind)
  `))];
  if (due.length === 0) return;

  const info = await loadShowInfo([...new Set(due.map((d) => d.concert_id))]);
  const contact = pushContact(env.SMTP_FROM);
  for (const d of due) {
    const i = info.get(d.concert_id);
    const name = i?.seriesName
      ? `${i.seriesName}${i.dayCount && i.dayCount > 1 && i.dayNumber ? ` · Day ${i.dayNumber}` : ""}`
      : (i?.lineup ?? []).slice(0, 2).join(" / ") || "your show";
    const payload = d.kind === "tonight"
      ? { title: `Tonight: ${name}`, body: d.venue ? `At ${d.venue}. Have a loud one.` : "Have a loud one.", url: `/shows/${d.slug}`, tag: `tonight-${d.concert_id}` }
      : { title: `How was ${name}?`, body: "Tap to mark it attended and add photos.", url: `/shows/${d.slug}`, tag: `how-${d.concert_id}` };
    const subs: StoredSubscription[] = [...(await db.execute<StoredSubscription & Record<string, unknown>>(sql`
      select id, endpoint, p256dh, auth from push_subscriptions where user_id = ${d.user_id}`))];
    // Record first, so a slow or failing push service can't cause repeats.
    await db.execute(sql`insert into push_sent (user_id, concert_id, kind) values (${d.user_id}, ${d.concert_id}, ${d.kind}) on conflict do nothing`);
    const delivered = await sendPush(db, subs, payload, contact);
    log.info({ kind: d.kind, concert: d.slug, delivered }, "push reminder sent");
  }
}

/** Start the 15-minute reminder check (first run a minute after startup). */
export function startPushReminders(log: Parameters<typeof runPushReminders>[0]): () => void {
  const run = () => void runPushReminders(log).catch((err) => log.error({ err }, "push reminders failed"));
  const first = setTimeout(run, 60_000);
  const every = setInterval(run, INTERVAL_MS);
  return () => { clearTimeout(first); clearInterval(every); };
}
