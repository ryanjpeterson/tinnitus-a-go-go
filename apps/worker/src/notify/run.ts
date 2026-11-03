/**
 * Sends show reminders and the weekly recap.
 *
 * `runNotifyTick` runs every 15 minutes. Once the hour you picked has come
 * (in TIMEZONE), it sends what's due today: a reminder for each show you're
 * going to that's reached one of your reminder days (7, 3, 1 by default), and
 * on your recap day the weekly recap. notifications_sent records each one, so
 * it goes out once, and a worker that was down at that hour catches up later
 * the same day. A show added inside a window gets that window's reminder
 * ("in 2 days" when added 2 days out).
 */
import { and, eq, sql } from "drizzle-orm";
import type { NotifyJobData, NotifyJobResult } from "@tagg/shared";
import { db, schema } from "../db.js";
import { env } from "../env.js";
import { emailConfigured, ntfyConfigured, sendEmail, sendNtfy, type NtfyMessage } from "./channels.js";
import { anniversaries, attendedInYear, loadEmailTheme, upcomingShows, type NotifyShow } from "./data.js";
import { recapEmail, reminderEmail, type RecapData, type ReminderItem } from "./templates.js";
import { addDays, countdown, daysBetween, localNow, prettyDate, weekdayShort } from "./time.js";

type User = typeof schema.users.$inferSelect;
type Prefs = schema.NotifyPrefs;

const prefsOf = (u: User): Prefs => ({ ...schema.DEFAULT_NOTIFY_PREFS, ...u.notifyPrefs });
const appUrl = () => env.APP_URL.replace(/\/$/, "");
const showLink = (s: NotifyShow) => `${appUrl()}/shows${s.slug ? `/${encodeURIComponent(s.slug)}` : ""}`;

/** Marks `key` sent; false if it already was. */
async function claim(userId: string, key: string): Promise<boolean> {
  const rows = await db.insert(schema.notificationsSent).values({ userId, key }).onConflictDoNothing().returning();
  return rows.length > 0;
}

const release = (userId: string, key: string) =>
  db.delete(schema.notificationsSent).where(and(eq(schema.notificationsSent.userId, userId), eq(schema.notificationsSent.key, key)));

/** Runs each channel that's on, reporting "sent", "off" or the error. Throws only if every channel that ran failed. */
async function deliver(email: (() => Promise<void>) | null, ntfy: (() => Promise<void>) | null): Promise<NotifyJobResult> {
  const run = async (fn: (() => Promise<void>) | null) => {
    if (!fn) return "off";
    try { await fn(); return "sent"; } catch (err) { return err instanceof Error ? err.message : String(err); }
  };
  const [e, n] = await Promise.all([run(email), run(ntfy)]);
  return { email: e, ntfy: n };
}

const failedEverywhere = (r: NotifyJobResult) => r.email !== "sent" && r.ntfy !== "sent" && (r.email !== "off" || r.ntfy !== "off");

// ── Reminders ────────────────────────────────────────────────────────────────

function reminderNtfy(i: ReminderItem, thisYear: number): NtfyMessage {
  const where = [i.show.venue, i.show.city].filter(Boolean).join(", ");
  const when = countdown(i.days);
  return {
    title: `${i.show.title} — ${when}`,
    message: [`${prettyDate(i.show.date, thisYear)}${where ? ` · ${where}` : ""}`, i.show.support.length ? `with ${i.show.support.slice(0, 4).join(", ")}` : null]
      .filter(Boolean).join("\n"),
    click: showLink(i.show),
    tags: ["ticket"],
    priority: i.days <= 1 ? 4 : 3,
  };
}

/** The reminder window a show is in: the smallest reminder day it's within. */
const windowFor = (days: number, remindDays: number[]) =>
  [...remindDays].sort((a, b) => a - b).find((d) => days <= d) ?? null;

async function dueReminders(u: User, p: Prefs, today: string): Promise<{ item: ReminderItem; key: string }[]> {
  if (p.remindDays.length === 0 || !(p.remindEmail || p.remindNtfy)) return [];
  const shows = await upcomingShows(u.id, today, addDays(today, Math.max(...p.remindDays)), p.remindInterested);
  const due: { item: ReminderItem; key: string }[] = [];
  for (const show of shows) {
    const days = daysBetween(today, show.date);
    const window = windowFor(days, p.remindDays);
    if (window === null) continue;
    const key = `remind:${show.id}:${window}`;
    if (await claim(u.id, key)) due.push({ item: { show, days }, key });
  }
  return due;
}

async function sendReminders(u: User, p: Prefs, items: ReminderItem[], thisYear: number): Promise<NotifyJobResult> {
  const to = p.emailTo || u.email;
  const theme = await loadEmailTheme();
  return deliver(
    p.remindEmail && emailConfigured ? () => sendEmail({ to, ...reminderEmail(theme, items, appUrl(), thisYear) }) : null,
    p.remindNtfy && ntfyConfigured ? async () => { for (const i of items) await sendNtfy(reminderNtfy(i, thisYear)); } : null,
  );
}

// ── Weekly recap ─────────────────────────────────────────────────────────────

async function recapData(u: User, today: string): Promise<RecapData> {
  const year = Number(today.slice(0, 4));
  const [anniv, upcoming, attended] = await Promise.all([
    anniversaries(u.id, today),
    upcomingShows(u.id, addDays(today, -1), addDays(today, 60), true),
    attendedInYear(u.id, year),
  ]);
  const shown = upcoming.slice(0, 6);
  return {
    from: today,
    to: addDays(today, 6),
    anniversaries: anniv,
    upcoming: shown.map((show) => ({ show, days: daysBetween(today, show.date) })),
    moreUpcoming: upcoming.length - shown.length,
    attendedThisYear: attended,
    year,
  };
}

function recapNtfy(d: RecapData): NtfyMessage {
  const lines = [
    ...d.anniversaries.slice(0, 4).map((a) => `${a.years === 1 ? "1 yr" : `${a.years} yrs`} ago ${weekdayShort(a.on)}: ${a.title}`),
    ...d.upcoming.slice(0, 4).map((i) => `${countdown(i.days)}: ${i.show.title}`),
  ];
  return {
    title: "Your week in shows",
    message: lines.length > 0 ? lines.join("\n") : "A quiet week — no anniversaries, nothing booked.",
    click: appUrl(),
    tags: ["loud_sound"],
    priority: 2,
  };
}

async function sendRecap(u: User, p: Prefs, d: RecapData): Promise<NotifyJobResult> {
  const to = p.emailTo || u.email;
  const theme = await loadEmailTheme();
  return deliver(
    p.recapEmail && emailConfigured ? () => sendEmail({ to, ...recapEmail(theme, d, appUrl()) }) : null,
    p.recapNtfy && ntfyConfigured ? () => sendNtfy(recapNtfy(d)) : null,
  );
}

// ── Entry points ─────────────────────────────────────────────────────────────

export async function runNotifyTick(): Promise<void> {
  if (!emailConfigured && !ntfyConfigured) return;
  const now = localNow(env.TIMEZONE);
  const thisYear = Number(now.date.slice(0, 4));
  const users = await db.select().from(schema.users);
  for (const u of users) {
    const p = prefsOf(u);
    if (now.hour < p.hour) continue;

    const due = await dueReminders(u, p, now.date);
    if (due.length > 0) {
      const result = await sendReminders(u, p, due.map((d) => d.item), thisYear);
      console.log(`[notify] reminders user=${u.username} shows=${due.length} email=${result.email} ntfy=${result.ntfy}`);
      if (failedEverywhere(result)) for (const d of due) await release(u.id, d.key); // try again next tick
    }

    if (now.weekday === p.recapWeekday && (p.recapEmail || p.recapNtfy)) {
      const key = `recap:${now.date}`;
      if (await claim(u.id, key)) {
        const result = await sendRecap(u, p, await recapData(u, now.date));
        console.log(`[notify] recap user=${u.username} email=${result.email} ntfy=${result.ntfy}`);
        if (failedEverywhere(result)) await release(u.id, key);
      }
    }
  }
}

/** "Send a test" from the Account page: the real thing, now, on every configured channel, recorded nowhere. */
export async function runNotifyTest(job: NotifyJobData): Promise<NotifyJobResult> {
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, job.userId) });
  if (!u) throw new Error("No such account.");
  const p: Prefs = { ...prefsOf(u), remindEmail: true, remindNtfy: true, recapEmail: true, recapNtfy: true };
  const now = localNow(env.TIMEZONE);
  const thisYear = Number(now.date.slice(0, 4));

  if (job.what === "recap") return sendRecap(u, p, await recapData(u, now.date));

  // The next show you're going to, or a stand-in if there isn't one.
  const [next] = await upcomingShows(u.id, addDays(now.date, -1), addDays(now.date, 365), true);
  const item: ReminderItem = next
    ? { show: next, days: daysBetween(now.date, next.date) }
    : {
        show: { id: "test", slug: "", date: addDays(now.date, 3), status: "attending", title: "Nothing booked yet", support: ["This is a test"], venue: null, city: null },
        days: 3,
      };
  return sendReminders(u, p, [item], thisYear);
}

/** Old rows are only there to stop repeats; a year is plenty. */
export async function pruneNotificationsSent(): Promise<void> {
  await db.delete(schema.notificationsSent).where(sql`${schema.notificationsSent.sentAt} < now() - interval '1 year'`);
}
