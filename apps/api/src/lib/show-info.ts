/**
 * What every show listing needs to name a show properly: the whole bill in
 * billing order (not just one headliner), and for festival days which
 * festival it belongs to and which day of it this was.
 */

import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

export interface ShowInfo {
  type: "concert" | "festival_day";
  /** Every billed artist: headliners, co-headliners, support, openers, then the rest. */
  lineup: string[];
  seriesName: string | null;
  seriesSlug: string | null;
  /** 1-based day of the festival, counted from its start date (else by logged days), festival days only. */
  dayNumber: number | null;
  /** How many days the festival runs (from its dates, else logged days), festival days only. */
  dayCount: number | null;
}

/** Billing order used everywhere a lineup is listed. */
export const BILLING_ORDER_SQL = sql.raw(`
  case ca.role::text
    when 'headliner' then 0
    when 'co_headliner' then 1
    when 'support' then 2
    when 'opener' then 3
    else 4
  end, ca.set_order asc nulls last, a.name asc
`);

export async function loadShowInfo(concertIds: string[]): Promise<Map<string, ShowInfo>> {
  const ids = [...new Set(concertIds)];
  const out = new Map<string, ShowInfo>();
  if (ids.length === 0) return out;

  const rows = await db.execute<{
    id: string;
    type: "concert" | "festival_day";
    lineup: string[] | null;
    series_name: string | null;
    series_slug: string | null;
    day_number: number | null;
    day_count: number | null;
  }>(sql`
    select
      c.id,
      c.type,
      (select array_agg(a.name order by ${BILLING_ORDER_SQL})
         from concert_artists ca join artists a on a.id = ca.artist_id
        where ca.concert_id = c.id) as lineup,
      es.name as series_name,
      es.slug as series_slug,
      case when c.event_series_id is not null then
        coalesce((c.date - es.start_date) + 1,
          (select count(distinct c2.date)::int from concerts c2
            where c2.event_series_id = c.event_series_id and c2.date <= c.date))
      end as day_number,
      case when c.event_series_id is not null then
        greatest(
          (coalesce(es.end_date, es.start_date) - es.start_date) + 1,
          (select count(distinct c2.date)::int from concerts c2 where c2.event_series_id = c.event_series_id))
      end as day_count
    from concerts c
    left join event_series es on es.id = c.event_series_id
    where c.id in ${ids}
  `);

  for (const r of rows) {
    out.set(r.id, {
      type: r.type,
      lineup: r.lineup ?? [],
      seriesName: r.series_name,
      seriesSlug: r.series_slug,
      dayNumber: r.day_number,
      dayCount: r.day_count,
    });
  }
  return out;
}
