/**
 * Deep stats route — rich analytics for the concert log.
 *
 *   GET /concerts/deep-stats
 *
 * Runs ~8 queries in parallel showing aggregate stats across attended concerts only.
 * Only concerts with status='attended' are counted in all stats.
 * Artists seen = unique artists across all attended shows.
 * Shows = count of concerts (not artist appearances).
 */

import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  // Public endpoint - shows aggregate stats for attended concerts only
  app.get(
    "/concerts/deep-stats",
    async (req, reply) => {

      // Accept a browser-supplied local date (YYYY-MM-DD) so "On This Day"
      // reflects the client's calendar day, not the server's.
      const rawLocalDate = (req.query as Record<string, unknown>).localDate;
      const localDate =
        typeof rawLocalDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawLocalDate)
          ? rawLocalDate
          : new Date().toISOString().slice(0, 10);

      // ── Run all aggregation queries in parallel (only attended concerts) ──
      const [
        byYearRows,
        byMonthRows,
        byDowRows,
        heatmapRows,
        topArtistRows,
        topVenueRows,
        onThisDayRows,
        milestoneRows,
        firstLastRows,
      ] = await Promise.all([

        // 1. By year (attended concerts only)
        db.execute<{ year: string; count: number }>(sql`
          select
            extract(year from c.date)::text as year,
            count(distinct c.id)::int as count
          from concerts c
          join concert_attendees ca on ca.concert_id = c.id and ca.status = 'attended'
          group by extract(year from c.date)
          order by extract(year from c.date) desc
        `),

        // 2. By month (1–12, aggregated across all years, attended only)
        db.execute<{ month: number; count: number }>(sql`
          select
            extract(month from c.date)::int as month,
            count(distinct c.id)::int as count
          from concerts c
          join concert_attendees ca on ca.concert_id = c.id and ca.status = 'attended'
          group by extract(month from c.date)
          order by extract(month from c.date)
        `),

        // 3. By day of week (0=Sun … 6=Sat, attended only)
        db.execute<{ dow: number; count: number }>(sql`
          select
            extract(dow from c.date)::int as dow,
            count(distinct c.id)::int as count
          from concerts c
          join concert_attendees ca on ca.concert_id = c.id and ca.status = 'attended'
          group by extract(dow from c.date)
          order by extract(dow from c.date)
        `),

        // 4. Heatmap — year × month counts (attended only)
        db.execute<{ year: string; month: number; count: number }>(sql`
          select
            extract(year from c.date)::text as year,
            extract(month from c.date)::int as month,
            count(distinct c.id)::int as count
          from concerts c
          join concert_attendees ca on ca.concert_id = c.id and ca.status = 'attended'
          group by extract(year from c.date), extract(month from c.date)
          order by extract(year from c.date), extract(month from c.date)
        `),

        // 5. Top 20 artists (by attended show count, counting shows not appearances)
        db.execute<{
          artist_id: string;
          name: string;
          slug: string;
          count: number;
          first_seen: string;
          last_seen: string;
        }>(sql`
          select
            a.id          as artist_id,
            a.name,
            a.slug,
            count(distinct c.id)::int as count,
            min(c.date)   as first_seen,
            max(c.date)   as last_seen
          from concerts c
          join concert_attendees ca on ca.concert_id = c.id and ca.status = 'attended'
          join concert_artists cart on cart.concert_id = c.id
          join artists a on a.id = cart.artist_id
          group by a.id, a.name, a.slug
          order by count desc, a.name
          limit 20
        `),

        // 6. Top 15 venues (by attended show count)
        db.execute<{
          venue_id: string;
          name: string;
          city: string | null;
          slug: string;
          count: number;
        }>(sql`
          select
            v.id          as venue_id,
            v.name,
            v.city,
            v.slug,
            count(distinct c.id)::int as count
          from concerts c
          join concert_attendees ca on ca.concert_id = c.id and ca.status = 'attended'
          join venues v on v.id = c.venue_id
          group by v.id, v.name, v.city, v.slug
          order by count desc, v.name
          limit 15
        `),

        // 7. On this day — today's month/day in previous years (attended only)
        db.execute<{
          concert_id: string;
          date: string;
          headliner_hint: string | null;
          series_name: string | null;
          venue_name: string | null;
        }>(sql`
          select
            c.id            as concert_id,
            c.date::text    as date,
            coalesce(
              c.headliner_hint,
              (select a.name from concert_artists caa
               join artists a on a.id = caa.artist_id
               where caa.concert_id = c.id
                 and caa.role in ('headliner', 'co_headliner')
               order by caa.set_order asc nulls last, a.name asc
               limit 1),
              (select a.name from concert_artists caa
               join artists a on a.id = caa.artist_id
               where caa.concert_id = c.id
               order by caa.set_order asc nulls last, a.name asc
               limit 1)
            )               as headliner_hint,
            es.name         as series_name,
            v.name          as venue_name
          from concerts c
          join concert_attendees ca on ca.concert_id = c.id and ca.status = 'attended'
          left join venues v on v.id = c.venue_id
          left join event_series es on es.id = c.event_series_id
          where extract(month from c.date) = extract(month from cast(${localDate} as date))
            and extract(day   from c.date) = extract(day   from cast(${localDate} as date))
            and extract(year  from c.date) < extract(year  from cast(${localDate} as date))
          order by c.date desc
        `),

        // 8. Milestones — 1st, 5th, 10th, 25th, 50th, 100th, 200th, 500th attended show
        db.execute<{
          rn: number;
          concert_id: string;
          date: string;
          headliner_hint: string | null;
          series_name: string | null;
        }>(sql`
          with ranked as (
            select
              c.id as concert_id,
              c.date::text as date,
              coalesce(
                c.headliner_hint,
                (select a.name from concert_artists caa
                 join artists a on a.id = caa.artist_id
                 where caa.concert_id = c.id
                   and caa.role in ('headliner', 'co_headliner')
                 order by caa.set_order asc nulls last, a.name asc
                 limit 1),
                (select a.name from concert_artists caa
                 join artists a on a.id = caa.artist_id
                 where caa.concert_id = c.id
                 order by caa.set_order asc nulls last, a.name asc
                 limit 1)
              )            as headliner_hint,
              es.name      as series_name,
              row_number() over (order by c.date asc, c.id asc) as rn
            from concerts c
            join concert_attendees ca on ca.concert_id = c.id and ca.status = 'attended'
            left join event_series es on es.id = c.event_series_id
          )
          select * from ranked
          where rn in (1, 5, 10, 25, 50, 100, 200, 500)
          order by rn
        `),

        // 9. First + latest attended show + totals (unique artists, unique venues)
        db.execute<{
          first_date: string | null;
          first_hint: string | null;
          first_id: string | null;
          last_date: string | null;
          last_hint: string | null;
          last_id: string | null;
          total: number;
          unique_artists: number;
          unique_venues: number;
          years_active: number;
        }>(sql`
          with attended_concerts as (
            select c.*
            from concerts c
            join concert_attendees ca on ca.concert_id = c.id and ca.status = 'attended'
          ),
          first_show as (
            select
              ac.id,
              ac.date,
              coalesce(
                ac.headliner_hint,
                (select a.name from concert_artists caa
                 join artists a on a.id = caa.artist_id
                 where caa.concert_id = ac.id
                   and caa.role in ('headliner', 'co_headliner')
                 order by caa.set_order asc nulls last, a.name asc
                 limit 1),
                (select a.name from concert_artists caa
                 join artists a on a.id = caa.artist_id
                 where caa.concert_id = ac.id
                 order by caa.set_order asc nulls last, a.name asc
                 limit 1)
              ) as headliner_hint
            from attended_concerts ac
            order by ac.date asc, ac.id asc
            limit 1
          ),
          last_show as (
            select
              ac.id,
              ac.date,
              coalesce(
                ac.headliner_hint,
                (select a.name from concert_artists caa
                 join artists a on a.id = caa.artist_id
                 where caa.concert_id = ac.id
                   and caa.role in ('headliner', 'co_headliner')
                 order by caa.set_order asc nulls last, a.name asc
                 limit 1),
                (select a.name from concert_artists caa
                 join artists a on a.id = caa.artist_id
                 where caa.concert_id = ac.id
                 order by caa.set_order asc nulls last, a.name asc
                 limit 1)
              ) as headliner_hint
            from attended_concerts ac
            order by ac.date desc, ac.id desc
            limit 1
          )
          select
            (select date::text from first_show) as first_date,
            (select headliner_hint from first_show) as first_hint,
            (select id from first_show) as first_id,
            (select date::text from last_show) as last_date,
            (select headliner_hint from last_show) as last_hint,
            (select id from last_show) as last_id,
            (select count(*)::int from attended_concerts) as total,
            (select count(distinct cart.artist_id)::int
             from attended_concerts ac
             join concert_artists cart on cart.concert_id = ac.id) as unique_artists,
            (select count(distinct ac.venue_id)::int from attended_concerts ac) as unique_venues,
            (select count(distinct extract(year from ac.date))::int from attended_concerts ac) as years_active
        `),
      ]);

      const overview = (firstLastRows as unknown as Array<{
        first_date: string | null; first_hint: string | null; first_id: string | null;
        last_date: string | null; last_hint: string | null; last_id: string | null;
        total: number; unique_artists: number; unique_venues: number;
        years_active: number;
      }>)[0] ?? null;

      return reply.send({
        // Overview totals (attended shows only)
        totalShows:     overview?.total       ?? 0,
        totalAttended:  overview?.total       ?? 0,
        totalArtists:   Number(overview?.unique_artists ?? 0),
        totalVenues:    Number(overview?.unique_venues  ?? 0),
        yearsActive:    overview?.years_active ?? 0,
        avgRating:      null,
        firstShow: overview?.first_id
          ? { concertId: overview.first_id, date: overview.first_date!, headlinerHint: overview.first_hint }
          : null,
        latestShow: overview?.last_id
          ? { concertId: overview.last_id, date: overview.last_date!, headlinerHint: overview.last_hint }
          : null,

        // Breakdowns (attended only)
        byStatus:  [],
        byYear:    [...byYearRows].map((r) => ({ year: r.year, count: r.count, attended: r.count })),
        byMonth:   [...byMonthRows],
        byDayOfWeek: [...byDowRows],
        heatmap:   [...heatmapRows],

        // Lists
        topArtists: ([...topArtistRows] as Array<{
          artist_id: string; name: string; slug: string; count: number;
          first_seen: string; last_seen: string;
        }>).map((r) => ({
          artistId:  r.artist_id,
          name:      r.name,
          slug:      r.slug,
          count:     r.count,
          avgRating: null,
          firstSeen: r.first_seen,
          lastSeen:  r.last_seen,
        })),
        topVenues: ([...topVenueRows] as Array<{
          venue_id: string; name: string; city: string | null; slug: string;
          count: number;
        }>).map((r) => ({
          venueId:   r.venue_id,
          name:      r.name,
          city:      r.city,
          slug:      r.slug,
          count:     r.count,
          avgRating: null,
        })),

        // Distribution
        ratingDist: [],

        // Fun
        onThisDay: ([...onThisDayRows] as Array<{
          concert_id: string; date: string; headliner_hint: string | null;
          series_name: string | null; venue_name: string | null;
        }>).map((r) => ({
          concertId:     r.concert_id,
          date:          r.date,
          headlinerHint: r.headliner_hint,
          seriesName:    r.series_name,
          status:        "attended",
          venueName:     r.venue_name,
        })),

        milestones: ([...milestoneRows] as Array<{
          rn: number; concert_id: string; date: string; headliner_hint: string | null; series_name: string | null;
        }>).map((r) => ({
          n:             Number(r.rn),
          concertId:     r.concert_id,
          date:          r.date,
          headlinerHint: r.headliner_hint,
          seriesName:    r.series_name,
        })),

        // Money
        avgTicketCents:    null,
        mostExpensiveShow: null,
      });
    },
  );
}
