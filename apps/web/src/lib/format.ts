/**
 * Date and count formatting shared across pages. Concert dates are plain
 * YYYY-MM-DD strings (no time zone), so everything is formatted in UTC to
 * avoid off-by-one days.
 */

function parseIso(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/** "Oct 14, 2023" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = parseIso(iso);
  if (!date) return iso;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Saturday, October 14, 2023" */
export function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = parseIso(iso);
  if (!date) return iso;
  return date.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

/** Parts for a ticket-style date block: { month: "OCT", day: "14", year: "2023", weekday: "Sat" } */
export function dateParts(iso: string): { month: string; day: string; year: string; weekday: string } {
  const date = parseIso(iso);
  if (!date) return { month: "", day: "?", year: iso.slice(0, 4), weekday: "" };
  return {
    month: date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(),
    day: String(date.getUTCDate()),
    year: String(date.getUTCFullYear()),
    weekday: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
  };
}

/** "October 2023" — used for month group headers in show lists. */
export function monthLabel(iso: string): string {
  const date = parseIso(iso);
  if (!date) return iso.slice(0, 7);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? word : pluralWord}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
