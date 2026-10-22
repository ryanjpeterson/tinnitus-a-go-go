/**
 * Push reminders, checked every 15 minutes from 10:00 to 22:00 local time
 * (PUSH_TIMEZONE), each one only for users who have it switched on
 * (users.push_prefs):
 *
 *   tonight        day of a show you're attending: "Tonight: Alice Cooper"
 *   how-was-it     the day after a show still marked attending: "How was it?"
 *   anniversary    N years ago today, for shows you attended — several on
 *                  the same day arrive as one notification
 *
 * push_sent records each one (anniversaries per year), so nothing is sent twice.
 */

import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { env } from "./env.js";
import { loadShowInfo, type ShowInfo } from "./show-info.js";
import { pushContact, sendPush, type PushPayload, type StoredSubscription } from "./push-core.js";

const INTERVAL_MS = 15 * 60 * 1000;

type Log = { info: (o: object, m: string) => void; error: (o: object, m: string) => void };

/** Local date (YYYY-MM-DD) and hour in the reminder time zone. */
function localNow(): { date: string; yesterday: string; hour: number } {
  const now = new Date();
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: env.PUSH_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: env.PUSH_TIMEZONE, hour: "numeric", hourCycle: "h23" }).format(now));
  return { date: fmt(now), yesterday: fmt(new Date(now.getTime() - 86_400_000)), hour };
}

/** "Bluesfest 2025 · Day 3" or "Foo Fighters / Against Me!". */
function showName(i: ShowInfo | undefined): string {
  return i?.seriesName
    ? `${i.seriesName}${i.dayCount && i.dayCount > 1 && i.dayNumber ? ` · Day ${i.dayNumber}` : ""}`
    : (i?.lineup ?? []).slice(0, 2).join(" / ") || "your show";
}

const yearsAgo = (n: number) => (n === 1 ? "1 year ago" : `${n} years ago`);

async function subscriptions(userId: string): Promise<StoredSubscription[]> {
  return [...(await db.execute<StoredSubscription & Record<string, unknown>>(sql`
    select id, endpoint, p256dh, auth from push_subscriptions where user_id = ${userId}`))];
}

export async function runPushReminders(log: Log): Promise<void> {
  const { date, yesterday, hour } = localNow();
  if (hour < 10 || hour >= 22) return;
  const contact = pushContact(env.SMTP_FROM);

  // ── Tonight / How was it ─────────────────────────────────────────────────
  const due = [...(await db.execute<{ user_id: string; concert_id: string; slug: string; kind: string; venue: string | null }>(sql`
    select att.user_id, c.id as concert_id, c.slug, k.kind, v.name as venue
    from concert_attendees att
    join users u on u.id = att.user_id
    join concerts c on c.id = att.concert_id
    left join venues v on v.id = c.venue_id
    join (values ('tonight', ${date}::date, 'tonight'), ('how-was-it', ${yesterday}::date, 'howWasIt')) as k(kind, day, pref)
      on c.date = k.day
    where att.status = 'attending'
      and coalesce((u.push_prefs ->> k.pref)::boolean, true)
      and exists (select 1 from push_subscriptions s where s.user_id = att.user_id)
      and not exists (select 1 from push_sent p where p.user_id = att.user_id and p.concert_id = c.id and p.kind = k.kind)
  `))];

  // ── Anniversaries: attended shows on today's date in earlier years ───────
  // (Feb 29 shows land on Feb 28 in other years.)
  const thisYear = Number(date.slice(0, 4));
  const anniversaryKind = `anniversary-${thisYear}`;
  const anniversaries = [...(await db.execute<{ user_id: string; concert_id: string; slug: string; date: string; venue: string | null }>(sql`
    select att.user_id, c.id as concert_id, c.slug, c.date::text as date, v.name as venue
    from concert_attendees att
    join users u on u.id = att.user_id
    join concerts c on c.id = att.concert_id
    left join venues v on v.id = c.venue_id
    where att.status = 'attended'
      and coalesce((u.push_prefs ->> 'anniversaries')::boolean, true)
      and extract(year from c.date) < ${thisYear}
      and (c.date + make_interval(years => (${thisYear} - extract(year from c.date))::int))::date = ${date}::date
      and exists (select 1 from push_subscriptions s where s.user_id = att.user_id)
      and not exists (select 1 from push_sent p where p.user_id = att.user_id and p.concert_id = c.id and p.kind = ${anniversaryKind})
    order by c.date
  `))];

  if (due.length === 0 && anniversaries.length === 0) return;
  const info = await loadShowInfo([...new Set([...due, ...anniversaries].map((d) => d.concert_id))]);

  for (const d of due) {
    const name = showName(info.get(d.concert_id));
    const payload: PushPayload = d.kind === "tonight"
      ? { title: `Tonight: ${name}`, body: d.venue ? `At ${d.venue}. Have a loud one.` : "Have a loud one.", url: `/shows/${d.slug}`, tag: `tonight-${d.concert_id}` }
      : { title: `How was ${name}?`, body: "Tap to mark it attended and add photos.", url: `/shows/${d.slug}`, tag: `how-${d.concert_id}` };
    // Record first, so a slow or failing push service can't cause repeats.
    await db.execute(sql`insert into push_sent (user_id, concert_id, kind) values (${d.user_id}, ${d.concert_id}, ${d.kind}) on conflict do nothing`);
    const delivered = await sendPush(db, await subscriptions(d.user_id), payload, contact);
    log.info({ kind: d.kind, concert: d.slug, delivered }, "push reminder sent");
  }

  // One notification per user, however many anniversaries fall today.
  const byUser = new Map<string, typeof anniversaries>();
  for (const a of anniversaries) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a]);
  for (const [userId, shows] of byUser) {
    const first = shows[0]!;
    const payload: PushPayload = shows.length === 1
      ? {
          title: `${yearsAgo(thisYear - Number(first.date.slice(0, 4)))} today`,
          body: [showName(info.get(first.concert_id)), first.venue].filter(Boolean).join(" · "),
          url: `/shows/${first.slug}`,
          tag: `anniversary-${date}`,
        }
      : {
          title: `On this day: ${shows.length} shows`,
          body: shows.map((s) => `${showName(info.get(s.concert_id))} (${s.date.slice(0, 4)})`).join(", "),
          url: "/",
          tag: `anniversary-${date}`,
        };
    for (const s of shows) {
      await db.execute(sql`insert into push_sent (user_id, concert_id, kind) values (${userId}, ${s.concert_id}, ${anniversaryKind}) on conflict do nothing`);
    }
    const delivered = await sendPush(db, await subscriptions(userId), payload, contact);
    log.info({ kind: "anniversary", shows: shows.length, delivered }, "push reminder sent");
  }
}

/** Start the 15-minute reminder check (first run a minute after startup). */
export function startPushReminders(log: Log): () => void {
  const run = () => void runPushReminders(log).catch((err) => log.error({ err }, "push reminders failed"));
  const first = setTimeout(run, 60_000);
  const every = setInterval(run, INTERVAL_MS);
  return () => { clearTimeout(first); clearInterval(every); };
}
