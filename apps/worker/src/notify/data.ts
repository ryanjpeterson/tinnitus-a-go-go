/** What reminders and the weekly recap are made from. */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { emailTheme, type EmailTheme } from "./theme.js";

export interface NotifyShow {
  id: string;
  slug: string;
  date: string;
  status: string;
  /** Festival name, else the top of the bill. */
  title: string;
  /** Everyone else on the bill (festival days: the whole bill). */
  support: string[];
  venue: string | null;
  city: string | null;
}

type Row = {
  id: string; slug: string; date: string; status: string;
  lineup: string[] | null; series_name: string | null;
  venue: string | null; city: string | null; region: string | null;
};

/** Same billing order as the API's show-info. */
const LINEUP = sql.raw(`
  (select array_agg(a.name order by
      case ca.role::text when 'headliner' then 0 when 'co_headliner' then 1 when 'support' then 2 when 'opener' then 3 else 4 end,
      ca.set_order asc nulls last, a.name asc)
     from concert_artists ca join artists a on a.id = ca.artist_id
    where ca.concert_id = c.id)`);

function toShow(r: Row): NotifyShow {
  const lineup = r.lineup ?? [];
  return {
    id: r.id,
    slug: r.slug,
    date: r.date,
    status: r.status,
    title: r.series_name ?? lineup[0] ?? "A show",
    support: r.series_name ? lineup : lineup.slice(1),
    venue: r.venue,
    city: [r.city, r.region].filter(Boolean).join(", ") || null,
  };
}

const select = (extra = sql``) => sql`
  select c.id, c.slug, c.date::text as date, att.status::text as status, ${LINEUP} as lineup,
         es.name as series_name, v.name as venue, v.city, v.region ${extra}
    from concert_attendees att
    join concerts c on c.id = att.concert_id
    left join event_series es on es.id = c.event_series_id
    left join venues v on v.id = c.venue_id`;

/** Shows you're going to (optionally also interested in) dated after `from` up to and including `to`. */
export async function upcomingShows(userId: string, from: string, to: string, includeInterested: boolean): Promise<NotifyShow[]> {
  const statuses = includeInterested ? sql`('attending', 'interested')` : sql`('attending')`;
  const rows = await db.execute<Row>(sql`${select()}
    where att.user_id = ${userId} and att.status in ${statuses}
      and c.date > ${from}::date and c.date <= ${to}::date
    order by c.date, c.slug`);
  return [...rows].map(toShow);
}

export interface Anniversary extends NotifyShow {
  /** The date it falls on this time round. */
  on: string;
  years: number;
}

/** Shows you attended on the same calendar day as one of the 7 days from `from`, in earlier years. */
export async function anniversaries(userId: string, from: string): Promise<Anniversary[]> {
  const rows = await db.execute<Row & { on: string; years: number }>(sql`
    with days as (select (${from}::date + i)::date as d from generate_series(0, 6) i)
    ${select(sql`, days.d::text as "on", (extract(year from days.d) - extract(year from c.date))::int as years`)}
    join days on to_char(days.d, 'MM-DD') = to_char(c.date, 'MM-DD') and c.date < days.d
    where att.user_id = ${userId} and att.status = 'attended' and not c.date_is_approximate
    order by days.d, c.date`);
  return [...rows].map((r) => ({ ...toShow(r), on: r.on, years: r.years }));
}

export async function attendedInYear(userId: string, year: number): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from concert_attendees att join concerts c on c.id = att.concert_id
     where att.user_id = ${userId} and att.status = 'attended' and extract(year from c.date) = ${year}`);
  return [...rows][0]?.n ?? 0;
}

/** The brand theme as emails use it: site_copy theme.json, or the older per-colour keys. */
export async function loadEmailTheme(): Promise<EmailTheme> {
  try {
    const rows = [...(await db.execute<{ key: string; value: string }>(
      sql`select key, value from site_copy where section = 'theme'`,
    ))];
    const get = (k: string) => rows.find((r) => r.key === k)?.value || undefined;
    let whole: Record<string, unknown> | null = null;
    try { whole = JSON.parse(get("theme.json") ?? "null"); } catch { /* not JSON */ }
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    return emailTheme(whole
      ? { accent: str(whole.accent), highlight: str(whole.highlight), background: str(whole.background), support: str(whole.support) }
      : { accent: get("theme.accent"), highlight: get("theme.highlight"), background: get("theme.background"), support: get("theme.support") });
  } catch {
    return emailTheme({});
  }
}
