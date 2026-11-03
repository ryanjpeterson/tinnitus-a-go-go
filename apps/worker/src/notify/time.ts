/** Calendar dates in the notification time zone. Dates are "YYYY-MM-DD" strings, like concerts.date. */

export interface LocalNow {
  date: string;
  hour: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function localNow(timeZone: string, at = new Date()): LocalNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short",
    }).formatToParts(at).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? "Sun"),
  };
}

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function addDays(iso: string, days: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (from: string, to: string): number =>
  Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);

/** "Sat, Nov 7" (with the year when it isn't `thisYear`). */
export function prettyDate(iso: string, thisYear?: number): string {
  const d = utc(iso);
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC", weekday: "short", month: "short", day: "numeric",
    ...(thisYear !== undefined && d.getUTCFullYear() !== thisYear ? { year: "numeric" } : {}),
  });
}

export const monthShort = (iso: string) => utc(iso).toLocaleDateString("en-US", { timeZone: "UTC", month: "short" }).toUpperCase();
export const dayOfMonth = (iso: string) => utc(iso).getUTCDate();
export const weekdayShort = (iso: string) => utc(iso).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });

/** "tomorrow", "in 3 days", "today". */
export function countdown(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
