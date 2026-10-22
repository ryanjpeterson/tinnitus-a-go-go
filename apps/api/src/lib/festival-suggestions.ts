/**
 * Shows that look like they belong to a festival, for Data cleanup:
 *
 *   join  standalone shows at a festival's venue within a week of its dates
 *         → "add these to Bluesfest 2025?"
 *   new   runs of standalone shows at one venue on nearby dates (gaps of 3
 *         days or less) with at least 3 shows and 3 different headliners
 *         → "group these as a festival?" (a two-night run isn't a festival)
 *
 * A dismissed suggestion (stored in duplicate_dismissals as
 * entity_type "festival", keyed by its first two shows) stays hidden.
 */

import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

interface ShowRow { id: string; slug: string; date: string; venue_id: string | null; venue: string | null; city: string | null; title: string | null }

export interface FestivalSuggestion {
  kind: "join" | "new";
  /** Stable key for dismissing: the first two show ids. */
  key: [string, string];
  festival: { name: string; slug: string } | null;
  suggestedName: string;
  venue: string | null;
  shows: { id: string; slug: string; date: string; title: string | null }[];
}

export async function findFestivalSuggestions(): Promise<FestivalSuggestion[]> {
  const [standalone, festivals, dismissed] = await Promise.all([
    db.execute<ShowRow & Record<string, unknown>>(sql`
      select c.id, c.slug, c.date::text as date, c.venue_id, v.name as venue, v.city, c.headliner_hint as title
      from concerts c left join venues v on v.id = c.venue_id
      where c.event_series_id is null and c.venue_id is not null
      order by c.venue_id, c.date`),
    db.execute<{ name: string; slug: string; venue_id: string | null; start_date: string | null; end_date: string | null } & Record<string, unknown>>(sql`
      select name, slug, venue_id, start_date::text, coalesce(end_date, start_date)::text as end_date
      from event_series where venue_id is not null and start_date is not null`),
    db.execute<{ id_a: string; id_b: string } & Record<string, unknown>>(sql`
      select id_a, id_b from duplicate_dismissals where entity_type = 'festival'`),
  ]);
  const hidden = new Set([...dismissed].map((d) => `${d.id_a}|${d.id_b}`));
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  const pick = (r: ShowRow) => ({ id: r.id, slug: r.slug, date: r.date, title: r.title });
  const out: FestivalSuggestion[] = [];
  const used = new Set<string>();

  // Join an existing festival.
  for (const f of festivals) {
    const near = [...standalone].filter((s) =>
      s.venue_id === f.venue_id && days(f.start_date!, s.date) >= -7 && days(s.date, f.end_date!) >= -7);
    if (near.length === 0) continue;
    near.forEach((s) => used.add(s.id));
    const key: [string, string] = [near[0]!.id, (near[1] ?? near[0])!.id];
    out.push({ kind: "join", key, festival: { name: f.name, slug: f.slug }, suggestedName: f.name, venue: near[0]!.venue, shows: near.map(pick) });
  }

  // A run of shows that could be a new festival.
  const rows = [...standalone].filter((s) => !used.has(s.id));
  let run: ShowRow[] = [];
  const flush = () => {
    const headliners = new Set(run.map((r) => r.title ?? r.id));
    const dates = new Set(run.map((r) => r.date));
    if (run.length >= 3 && headliners.size >= 3 && dates.size >= 2) {
      const key: [string, string] = [run[0]!.id, run[1]!.id];
      out.push({ kind: "new", key, festival: null, suggestedName: `${run[0]!.venue ?? "Festival"} ${run[0]!.date.slice(0, 4)}`, venue: run[0]!.venue, shows: run.map(pick) });
    }
    run = [];
  };
  for (const r of rows) {
    const last = run[run.length - 1];
    if (last && (last.venue_id !== r.venue_id || days(last.date, r.date) > 3)) flush();
    run.push(r);
  }
  flush();

  return out.filter((s) => !hidden.has(`${s.key[0]}|${s.key[1]}`));
}

export async function dismissFestivalSuggestion(key: [string, string]): Promise<void> {
  await db.execute(sql`
    insert into duplicate_dismissals (entity_type, id_a, id_b) values ('festival', ${key[0]}, ${key[1]})
    on conflict do nothing`);
}
