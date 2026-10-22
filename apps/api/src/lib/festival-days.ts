/**
 * Festival days — a festival (event_series) is a container of shows
 * (concerts.type = 'festival_day'). Each show owns its lineup and attendance;
 * a date can have several (separately logged sets), and the festival groups
 * them by date into days. Everything the festival shows about lineup or
 * attendance is read from its shows.
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";

type Status = (typeof schema.attendanceStatusEnum.enumValues)[number];
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface FestivalDay {
  id: string;
  festivalId: string;
  date: string;
  slug: string;
  /** The caller's attendance for this day, if any. */
  status: Status | null;
  artists: {
    id: string;
    name: string;
    slug: string;
    imageKey: string | null;
    role: string;
    setOrder: number | null;
    stageName: string | null;
    appearanceNotes: string | null;
  }[];
}

/** Shows of the given festivals in date order (several per date allowed), with lineups and the caller's attendance. */
export async function loadFestivalDays(festivalIds: string[], userId: string | null): Promise<FestivalDay[]> {
  if (festivalIds.length === 0) return [];
  const days = await db
    .select({ id: schema.concerts.id, festivalId: schema.concerts.eventSeriesId, date: schema.concerts.date, slug: schema.concerts.slug })
    .from(schema.concerts)
    .where(and(inArray(schema.concerts.eventSeriesId, festivalIds), eq(schema.concerts.type, "festival_day")))
    .orderBy(asc(schema.concerts.date), asc(schema.concerts.createdAt));
  if (days.length === 0) return [];
  const dayIds = days.map((d) => d.id);

  const [artistRows, attendance] = await Promise.all([
    db
      .select({
        concertId: schema.concertArtists.concertId,
        id: schema.artists.id,
        name: schema.artists.name,
        slug: schema.artists.slug,
        imageKey: schema.artists.imageKey,
        role: schema.concertArtists.role,
        setOrder: schema.concertArtists.setOrder,
        stageName: schema.concertArtists.stageName,
        appearanceNotes: schema.concertArtists.appearanceNotes,
      })
      .from(schema.concertArtists)
      .innerJoin(schema.artists, eq(schema.concertArtists.artistId, schema.artists.id))
      .where(inArray(schema.concertArtists.concertId, dayIds))
      .orderBy(sql`${schema.concertArtists.setOrder} asc nulls last`, asc(schema.artists.name)),
    userId
      ? db
          .select({ concertId: schema.concertAttendees.concertId, status: schema.concertAttendees.status })
          .from(schema.concertAttendees)
          .where(and(eq(schema.concertAttendees.userId, userId), inArray(schema.concertAttendees.concertId, dayIds)))
      : Promise.resolve([]),
  ]);

  const statusByDay = new Map(attendance.map((a) => [a.concertId, a.status]));
  return days.map((d) => ({
    id: d.id,
    festivalId: d.festivalId!,
    date: d.date,
    slug: d.slug,
    status: statusByDay.get(d.id) ?? null,
    artists: artistRows.filter((a) => a.concertId === d.id).map(({ concertId: _c, ...a }) => a),
  }));
}

const dayMs = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/**
 * How long the festival runs, from its dates — not just the days logged as
 * shows (you may have been to one day of five). Falls back to the logged days
 * when the festival has no dates.
 */
export function festivalLength(festival: { startDate: string | null; endDate: string | null }, loggedDays: number): number {
  if (!festival.startDate) return loggedDays;
  const span = Math.round((utc(festival.endDate ?? festival.startDate) - utc(festival.startDate)) / dayMs) + 1;
  return Math.max(span, loggedDays);
}

/** 1-based day of the festival a date falls on, counted from its start date. */
export function festivalDayNumber(festival: { startDate: string | null }, date: string, fallback: number): number {
  if (!festival.startDate) return fallback;
  return Math.round((utc(date) - utc(festival.startDate)) / dayMs) + 1;
}

const PRECEDENCE: Status[] = ["attended", "attending", "interested", "missed", "cancelled"];

/** How many distinct dates the festival's shows fall on. */
export const loggedDates = (shows: Pick<FestivalDay, "date">[]): number => new Set(shows.map((s) => s.date)).size;

/**
 * A festival's attendance, summarised from its shows: attended if any was
 * attended, otherwise the most committed status any has. Days attended counts
 * dates (two sets on one day are one day).
 */
export function festivalAttendance(shows: Pick<FestivalDay, "status" | "date">[], totalDays = loggedDates(shows)): { status: Status; daysAttended: number; totalDays: number } | null {
  const statuses = shows.map((d) => d.status).filter((s): s is Status => !!s);
  const status = PRECEDENCE.find((s) => statuses.includes(s));
  if (!status) return null;
  const daysAttended = new Set(shows.filter((s) => s.status === "attended").map((s) => s.date)).size;
  return { status, daysAttended, totalDays };
}

/** The festival's (first) show on a date, created if it has none yet. */
export async function ensureFestivalDay(
  tx: Tx,
  festival: { id: string; venueId: string | null },
  date: string,
  userId: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await tx
    .select({ id: schema.concerts.id })
    .from(schema.concerts)
    .where(and(eq(schema.concerts.eventSeriesId, festival.id), eq(schema.concerts.type, "festival_day"), eq(schema.concerts.date, date)))
    .orderBy(asc(schema.concerts.createdAt))
    .limit(1);
  if (existing[0]) return { id: existing[0].id, created: false };

  // A festival without its own venue takes the one its other days are at.
  let venueId = festival.venueId;
  if (!venueId) {
    const [other] = await tx
      .select({ venueId: schema.concerts.venueId })
      .from(schema.concerts)
      .where(and(eq(schema.concerts.eventSeriesId, festival.id), sql`${schema.concerts.venueId} is not null`))
      .limit(1);
    venueId = other?.venueId ?? null;
  }
  const [row] = await tx
    .insert(schema.concerts)
    .values({ date, venueId, eventSeriesId: festival.id, createdByUserId: userId })
    .returning({ id: schema.concerts.id });
  return { id: row!.id, created: true };
}

/** Every date from start to end inclusive (YYYY-MM-DD), at most `max`. */
export function dateRange(start: string, end: string | null | undefined, max = 14): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end && end >= start ? end : start}T00:00:00Z`);
  while (d <= last && out.length < max) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
