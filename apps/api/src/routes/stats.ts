/**
 * Deep stats route — rich analytics for the authenticated user's concert log.
 *
 *   GET /concerts/deep-stats
 *
 * Runs ~8 queries in parallel, all scoped to req.user.id.
 * Designed for the Stats page; heavier than /concerts/stats which only returns
 * status counts.
 */

import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { requireUser } from "../auth/middleware.js";

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/concerts/deep-stats",
    { preHandler: [requireUser] },
    async (req, reply) => {
      const userId = req.user!.id;

      // Accept a browser-supplied local date (YYYY-MM-DD) so "On This Day"
      // reflects the client's calendar day, not the server's.
      const rawLocalDate = (req.query as Record<string, unknown>).localDate;
      const localDate =
        typeof rawLocalDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawLocalDate)
          ? rawLocalDate
          : new Date().toISOString().slice(0, 10);

      // ── Run all aggregation queries in parallel ────────────────────────────
      const [
        byStatusRows,
        byYearRows,
        byMonthRows,
        byDowRows,
        heatmapRows,
        topArtistRows,
        topVenueRows,
        ratingDistRows,
        onThisDayRows,
        ticketRows,
        milestoneRows,
        firstLastRows,
      ] = await Promise.all([

        // 1. By status
        db
          .select({
            status: schema.concertAttendees.status,
            count: sql<number>`count(*)::int`,
          })
          .from(schema.concertAttendees)
          .where(eq(schema.concertAttendees.userId, userId))
          .groupBy(schema.concertAttendees.status),

        // 2. By year
        db
          .select({
            year: sql<string>`extract(year from ${schema.concerts.date})::text`,
            count: sql<number>`count(*)::int`,
            attended: sql<number>`count(*) filter (where ${schema.concertAttendees.status} = 'attended')::int`,
            avgRating: sql<number | null>`round(avg(${schema.concertAttendees.rating})::numeric, 1)`,
          })
          .from(schema.concertAttendees)
          .innerJoin(schema.concerts, eq(schema.concertAttendees.concertId, schema.concerts.id))
          .where(eq(schema.concertAttendees.userId, userId))
          .groupBy(sql`extract(year from ${schema.concerts.date})`)
          .orderBy(sql`extract(year from ${schema.concerts.date}) desc`),

        // 3. By month (1–12, aggregated across all years)
        db
          .select({
            month: sql<number>`extract(month from ${schema.concerts.date})::int`,
            count: sql<number>`count(*)::int`,
          })
          .from(schema.concertAttendees)
          .innerJoin(schema.concerts, eq(schema.concertAttendees.concertId, schema.concerts.id))
          .where(eq(schema.concertAttendees.userId, userId))
          .groupBy(sql`extract(month from ${schema.concerts.date})`)
          .orderBy(sql`extract(month from ${schema.concerts.date})`),

        // 4. By day of week (0=Sun … 6=Sat)
        db
          .select({
            dow: sql<number>`extract(dow from ${schema.concerts.date})::int`,
            count: sql<number>`count(*)::int`,
          })
          .from(schema.concertAttendees)
          .innerJoin(schema.concerts, eq(schema.concertAttendees.concertId, schema.concerts.id))
          .where(eq(schema.concertAttendees.userId, userId))
          .groupBy(sql`extract(dow from ${schema.concerts.date})`)
          .orderBy(sql`extract(dow from ${schema.concerts.date})`),

        // 5. Heatmap — year × month counts
        db
          .select({
            year: sql<string>`extract(year from ${schema.concerts.date})::text`,
            month: sql<number>`extract(month from ${schema.concerts.date})::int`,
            count: sql<number>`count(*)::int`,
          })
          .from(schema.concertAttendees)
          .innerJoin(schema.concerts, eq(schema.concertAttendees.concertId, schema.concerts.id))
          .where(eq(schema.concertAttendees.userId, userId))
          .groupBy(
            sql`extract(year from ${schema.concerts.date})`,
            sql`extract(month from ${schema.concerts.date})`,
          )
          .orderBy(
            sql`extract(year from ${schema.concerts.date})`,
            sql`extract(month from ${schema.concerts.date})`,
          ),

        // 6. Top 20 artists (by shows in the user's log, any status)
        db.execute<{
          artist_id: string;
          name: string;
          slug: string;
          count: number;
          avg_rating: number | null;
          first_seen: string;
          last_seen: string;
        }>(sql`
          select
            a.id          as artist_id,
            a.name,
            a.slug,
            count(*)::int as count,
            round(avg(ca_att.rating)::numeric, 1) as avg_rating,
            min(c.date)   as first_seen,
            max(c.date)   as last_seen
          from concert_attendees ca_att
          join concerts c         on c.id = ca_att.concert_id
          join concert_artists ca on ca.concert_id = c.id
          join artists a          on a.id = ca.artist_id
          where ca_att.user_id = ${userId}
          group by a.id, a.name, a.slug
          order by count desc, a.name
          limit 20
        `),

        // 7. Top 15 venues (by attended shows)
        db.execute<{
          venue_id: string;
          name: string;
          city: string | null;
          slug: string;
          count: number;
          avg_rating: number | null;
        }>(sql`
          select
            v.id          as venue_id,
            v.name,
            v.city,
            v.slug,
            count(*)::int as count,
            round(avg(ca.rating)::numeric, 1) as avg_rating
          from concert_attendees ca
          join concerts c on c.id = ca.concert_id
          join venues v   on v.id = c.venue_id
          where ca.user_id = ${userId}
            and ca.status  = 'attended'
          group by v.id, v.name, v.city, v.slug
          order by count desc, v.name
          limit 15
        `),

        // 8. Rating distribution (1–10)
        db
          .select({
            rating: schema.concertAttendees.rating,
            count: sql<number>`count(*)::int`,
          })
          .from(schema.concertAttendees)
          .where(
            and(
              eq(schema.concertAttendees.userId, userId),
              sql`${schema.concertAttendees.rating} is not null`,
            ),
          )
          .groupBy(schema.concertAttendees.rating)
          .orderBy(schema.concertAttendees.rating),

        // 9. On this day — today's month/day in previous years (uses client-supplied date)
        db.execute<{
          concert_id: string;
          date: string;
          headliner_hint: string | null;
          series_name: string | null;
          status: string;
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
            ca.status,
            v.name          as venue_name
          from concert_attendees ca
          join concerts c on c.id = ca.concert_id
          left join venues v on v.id = c.venue_id
          left join event_series es on es.id = c.event_series_id
          where ca.user_id = ${userId}
            and extract(month from c.date) = extract(month from cast(${localDate} as date))
            and extract(day   from c.date) = extract(day   from cast(${localDate} as date))
            and extract(year  from c.date) < extract(year  from cast(${localDate} as date))
          order by c.date desc
        `),

        // 10. Ticket price stats
        db.execute<{ avg_cents: number | null; max_cents: number | null }>(sql`
          select
            round(avg(ca.ticket_price_paid))::int as avg_cents,
            max(ca.ticket_price_paid)             as max_cents
          from concert_attendees ca
          where ca.user_id = ${userId}
            and ca.ticket_price_paid is not null
        `),

        // 11. Milestones — 1st, 5th, 10th, 25th, 50th, 100th, 200th, 500th attended show
        db.execute<{
          rn: number;
          concert_id: string;
          date: string;
          headliner_hint: string | null;
          series_name: string | null;
        }>(sql`
          with ranked as (
            select
              ca.concert_id,
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
            from concert_attendees ca
            join concerts c on c.id = ca.concert_id
            left join event_series es on es.id = c.event_series_id
            where ca.user_id = ${userId}
              and ca.status  = 'attended'
          )
          select * from ranked
          where rn in (1, 5, 10, 25, 50, 100, 200, 500)
          order by rn
        `),

        // 12. First + latest show (any status)
        db.execute<{
          first_date: string | null;
          first_hint: string | null;
          first_id: string | null;
          last_date: string | null;
          last_hint: string | null;
          last_id: string | null;
          total: number;
          total_attended: number;
          unique_artists: number;
          unique_venues: number;
          years_active: number;
          avg_rating: number | null;
        }>(sql`
          select
            min(c.date)::text as first_date,
            (select c2.headliner_hint from concerts c2
               join concert_attendees ca2 on ca2.concert_id = c2.id
               where ca2.user_id = ${userId} order by c2.date asc  limit 1) as first_hint,
            (select c2.id from concerts c2
               join concert_attendees ca2 on ca2.concert_id = c2.id
               where ca2.user_id = ${userId} order by c2.date asc  limit 1) as first_id,
            max(c.date)::text as last_date,
            (select c2.headliner_hint from concerts c2
               join concert_attendees ca2 on ca2.concert_id = c2.id
               where ca2.user_id = ${userId} order by c2.date desc limit 1) as last_hint,
            (select c2.id from concerts c2
               join concert_attendees ca2 on ca2.concert_id = c2.id
               where ca2.user_id = ${userId} order by c2.date desc limit 1) as last_id,
            count(*)::int                                            as total,
            count(*) filter (where ca.status = 'attended')::int     as total_attended,
            count(distinct art.artist_id)                           as unique_artists,
            count(distinct c.venue_id) filter (where ca.status = 'attended')  as unique_venues,
            count(distinct extract(year from c.date))::int          as years_active,
            round(avg(ca.rating) filter (where ca.status = 'attended')::numeric, 1) as avg_rating
          from concert_attendees ca
          join concerts c on c.id = ca.concert_id
          left join concert_artists art on art.concert_id = c.id
          where ca.user_id = ${userId}
        `),
      ]);

      // ── Most expensive show lookup ─────────────────────────────────────────
      // db.execute() with postgres-js returns a RowList that IS the array (no .rows wrapper)
      const ticketStat = (ticketRows as unknown as Array<{ avg_cents: number | null; max_cents: number | null }>)[0] ?? null;
      let mostExpensiveShow = null;
      if (ticketStat?.max_cents) {
        const [expensive] = await db
          .select({
            id: schema.concerts.id,
            date: schema.concerts.date,
            headlinerHint: schema.concerts.headlinerHint,
            amount: schema.concertAttendees.ticketPricePaid,
            currency: schema.concertAttendees.ticketPriceCurrency,
          })
          .from(schema.concertAttendees)
          .innerJoin(schema.concerts, eq(schema.concertAttendees.concertId, schema.concerts.id))
          .where(
            and(
              eq(schema.concertAttendees.userId, userId),
              sql`${schema.concertAttendees.ticketPricePaid} = ${ticketStat.max_cents}`,
            ),
          )
          .orderBy(desc(schema.concerts.date))
          .limit(1);
        if (expensive) {
          mostExpensiveShow = {
            concertId:   expensive.id,
            date:        expensive.date,
            headlinerHint: expensive.headlinerHint,
            amountCents: expensive.amount,
            currency:    expensive.currency ?? "CAD",
          };
        }
      }

      const overview = (firstLastRows as unknown as Array<{
        first_date: string | null; first_hint: string | null; first_id: string | null;
        last_date: string | null; last_hint: string | null; last_id: string | null;
        total: number; total_attended: number; unique_artists: number; unique_venues: number;
        years_active: number; avg_rating: number | null;
      }>)[0] ?? null;

      return reply.send({
        // Overview totals
        totalShows:     overview?.total       ?? 0,
        totalAttended:  overview?.total_attended ?? 0,
        totalArtists:   Number(overview?.unique_artists ?? 0),
        totalVenues:    Number(overview?.unique_venues  ?? 0),
        yearsActive:    overview?.years_active ?? 0,
        avgRating:      overview?.avg_rating   ?? null,
        firstShow: overview?.first_id
          ? { concertId: overview.first_id, date: overview.first_date!, headlinerHint: overview.first_hint }
          : null,
        latestShow: overview?.last_id
          ? { concertId: overview.last_id, date: overview.last_date!, headlinerHint: overview.last_hint }
          : null,

        // Breakdowns
        byStatus:  byStatusRows,
        byYear:    byYearRows,
        byMonth:   byMonthRows,
        byDayOfWeek: byDowRows,
        heatmap:   heatmapRows,

        // Lists — db.execute() returns the array directly with postgres-js
        topArtists: ([...topArtistRows] as Array<{
          artist_id: string; name: string; slug: string; count: number;
          avg_rating: number | null; first_seen: string; last_seen: string;
        }>).map((r) => ({
          artistId:  r.artist_id,
          name:      r.name,
          slug:      r.slug,
          count:     r.count,
          avgRating: r.avg_rating,
          firstSeen: r.first_seen,
          lastSeen:  r.last_seen,
        })),
        topVenues: ([...topVenueRows] as Array<{
          venue_id: string; name: string; city: string | null; slug: string;
          count: number; avg_rating: number | null;
        }>).map((r) => ({
          venueId:   r.venue_id,
          name:      r.name,
          city:      r.city,
          slug:      r.slug,
          count:     r.count,
          avgRating: r.avg_rating,
        })),

        // Distribution
        ratingDist: ratingDistRows
          .filter((r) => r.rating != null)
          .map((r) => ({ rating: r.rating!, count: r.count })),

        // Fun
        onThisDay: ([...onThisDayRows] as Array<{
          concert_id: string; date: string; headliner_hint: string | null;
          series_name: string | null; status: string; venue_name: string | null;
        }>).map((r) => ({
          concertId:     r.concert_id,
          date:          r.date,
          headlinerHint: r.headliner_hint,
          seriesName:    r.series_name,
          status:        r.status,
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
        avgTicketCents:    ticketStat?.avg_cents ?? null,
        mostExpensiveShow,
      });
    },
  );
}
