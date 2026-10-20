/**
 * One way to name a show everywhere it's listed:
 *   concert      → the whole bill in billing order, "Foo Fighters / Against Me!"
 *   festival day → the festival, with "Day 2 of 7" and that day's lineup as the sub line
 */

import type { ShowInfo } from "./api";

const MAX_NAMES = 3;

/** "A / B / C +2" */
export function billLine(names: string[], max = MAX_NAMES, sep = " / "): string {
  if (names.length === 0) return "";
  const shown = names.slice(0, max).join(sep);
  return names.length > max ? `${shown} +${names.length - max}` : shown;
}

export function isFestivalDay(info: ShowInfo | null | undefined): info is ShowInfo & { seriesName: string } {
  return !!info && info.type === "festival_day" && !!info.seriesName;
}

/** "Day 2 of 7", or null for one-day festivals and regular shows. */
export function dayLabel(info: ShowInfo | null | undefined): string | null {
  if (!isFestivalDay(info) || info.dayNumber == null) return null;
  return info.dayCount && info.dayCount > 1 ? `Day ${info.dayNumber} of ${info.dayCount}` : null;
}

export function showTitle(info: ShowInfo | null | undefined, fallback?: string | null): string {
  if (isFestivalDay(info)) return info.seriesName;
  if (info && info.lineup.length > 0) return billLine(info.lineup);
  return fallback || "Untitled show";
}

/** Second line: day + lineup for festival days; nothing extra for regular shows. */
export function showSubtitle(info: ShowInfo | null | undefined): string | undefined {
  if (!isFestivalDay(info)) return undefined;
  return [dayLabel(info), billLine(info.lineup, 4, ", ")].filter(Boolean).join(" · ") || undefined;
}
