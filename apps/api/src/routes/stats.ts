/**
 * Deep stats route — rich analytics for the concert log.
 *
 *   GET /concerts/deep-stats
 *   GET /concerts/year-review[/:year]  — per-year recap ("Year in review")
 *
 * Runs ~8 queries in parallel showing aggregate stats across attended concerts only.
 * Only concerts with status='attended' are counted in all stats.
 * Artists seen = unique artists across all attended shows.
 * Shows = count of concerts (not artist appearances).
 */

import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { bucket } from "../lib/s3.js";
import { env } from "../lib/env.js";
import { loadShowInfo } from "../lib/show-info.js";

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
              (select a.name from concert_artists caa
               join artists a on a.id = caa.artist_id
               where caa.concert_id = c.id
                 and caa.role in ('headliner', 'co_headliner')
               order by caa.set_order asc nulls last, a.name asc
               limit 1),
              c.headliner_hint,
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
                (select a.name from concert_artists caa
                 join artists a on a.id = caa.artist_id
                 where caa.concert_id = c.id
                   and caa.role in ('headliner', 'co_headliner')
                 order by caa.set_order asc nulls last, a.name asc
                 limit 1),
                c.headliner_hint,
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
                (select a.name from concert_artists caa
                 join artists a on a.id = caa.artist_id
                 where caa.concert_id = ac.id
                   and caa.role in ('headliner', 'co_headliner')
                 order by caa.set_order asc nulls last, a.name asc
                 limit 1),
                ac.headliner_hint,
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
                (select a.name from concert_artists caa
                 join artists a on a.id = caa.artist_id
                 where caa.concert_id = ac.id
                   and caa.role in ('headliner', 'co_headliner')
                 order by caa.set_order asc nulls last, a.name asc
                 limit 1),
                ac.headliner_hint,
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

      // Full lineups / festival-day numbers for every show named below.
      const info = await loadShowInfo([
        ...[...onThisDayRows].map((r) => r.concert_id),
        ...[...milestoneRows].map((r) => r.concert_id),
        ...(overview?.first_id ? [overview.first_id] : []),
        ...(overview?.last_id ? [overview.last_id] : []),
      ]);
      const infoFor = (id: string) => info.get(id) ?? null;

      return reply.send({
        // Overview totals (attended shows only)
        totalShows:     overview?.total       ?? 0,
        totalAttended:  overview?.total       ?? 0,
        totalArtists:   Number(overview?.unique_artists ?? 0),
        totalVenues:    Number(overview?.unique_venues  ?? 0),
        yearsActive:    overview?.years_active ?? 0,
        avgRating:      null,
        firstShow: overview?.first_id
          ? { concertId: overview.first_id, date: overview.first_date!, headlinerHint: overview.first_hint, info: infoFor(overview.first_id) }
          : null,
        latestShow: overview?.last_id
          ? { concertId: overview.last_id, date: overview.last_date!, headlinerHint: overview.last_hint, info: infoFor(overview.last_id) }
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
          info:          infoFor(r.concert_id),
        })),

        milestones: ([...milestoneRows] as Array<{
          rn: number; concert_id: string; date: string; headliner_hint: string | null; series_name: string | null;
        }>).map((r) => ({
          n:             Number(r.rn),
          concertId:     r.concert_id,
          date:          r.date,
          headlinerHint: r.headliner_hint,
          seriesName:    r.series_name,
          info:          infoFor(r.concert_id),
        })),

        // Money
        avgTicketCents:    null,
        mostExpensiveShow: null,
      });
    },
  );

  // ── Year in review ──────────────────────────────────────────────────────────
  //
  //   GET /concerts/year-review         → every year with attended shows
  //   GET /concerts/year-review/:year   → one year's recap
  //
  // Public, like deep-stats: attended shows only, no personal notes or prices.

  app.get("/concerts/year-review", async (_req, reply) => {
    const rows = await db.execute<{ year: number; count: number }>(sql`
      select extract(year from c.date)::int as year, count(*)::int as count
      from concerts c
      where ${attendedSql("c")}
      group by 1
      order by 1 desc
    `);
    return reply.send({ years: [...rows] });
  });

  app.get("/concerts/year-review/:year", async (req, reply) => {
    const year = Number((req.params as { year: string }).year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return reply.code(400).send({ error: "Invalid year." });
    }
    const start = `${year}-01-01`;
    const end = `${year + 1}-01-01`;

    // Attended concerts in the year. Inlined as a CTE in each query below.
    const yc = sql`
      yc as (
        select c.* from concerts c
        where ${attendedSql("c")}
          and c.date >= cast(${start} as date) and c.date < cast(${end} as date)
      )
    `;
    // First attended date ever per artist / venue — "new this year" means it falls in the year.
    const artistFirsts = sql`
      artist_firsts as (
        select cart.artist_id, min(c.date) as first_date
        from concerts c
        join concert_artists cart on cart.concert_id = c.id
        where ${attendedSql("c")}
        group by cart.artist_id
      )
    `;
    const venueFirsts = sql`
      venue_firsts as (
        select c.venue_id, min(c.date) as first_date
        from concerts c
        where ${attendedSql("c")} and c.venue_id is not null
        group by c.venue_id
      )
    `;

    const [
      yearRows,
      showRows,
      totalsRows,
      topArtistRows,
      newArtistRows,
      topVenueRows,
      festivalRows,
      songTotalRows,
      topSongRows,
      mediaRows,
    ] = await Promise.all([
      db.execute<{ year: number; count: number }>(sql`
        select extract(year from c.date)::int as year, count(*)::int as count
        from concerts c
        where ${attendedSql("c")}
        group by 1
        order by 1 desc
      `),

      db.execute<{
        id: string; date: string; type: string; headliner: string | null;
        flyer_key: string | null; series_flyer_key: string | null;
        series_name: string | null; series_slug: string | null;
        venue_name: string | null; venue_city: string | null; venue_slug: string | null;
      }>(sql`
        with ${yc}
        select
          yc.id, yc.date::text as date, yc.type,
          ${headlinerSql("yc")} as headliner,
          yc.flyer_key, es.flyer_key as series_flyer_key,
          es.name as series_name, es.slug as series_slug,
          v.name as venue_name, v.city as venue_city, v.slug as venue_slug
        from yc
        left join venues v on v.id = yc.venue_id
        left join event_series es on es.id = yc.event_series_id
        order by yc.date asc, yc.id asc
      `),

      db.execute<{
        unique_artists: number; new_artists: number;
        unique_venues: number; new_venues: number; unique_cities: number;
      }>(sql`
        with ${yc}, ${artistFirsts}, ${venueFirsts}
        select
          (select count(distinct cart.artist_id)::int
             from yc join concert_artists cart on cart.concert_id = yc.id) as unique_artists,
          (select count(*)::int from artist_firsts
             where first_date >= cast(${start} as date) and first_date < cast(${end} as date)) as new_artists,
          (select count(distinct yc.venue_id)::int from yc) as unique_venues,
          (select count(*)::int from venue_firsts
             where first_date >= cast(${start} as date) and first_date < cast(${end} as date)) as new_venues,
          (select count(distinct lower(v.city))::int
             from yc join venues v on v.id = yc.venue_id where v.city is not null) as unique_cities
      `),

      db.execute<{ id: string; name: string; slug: string; count: number; is_new: boolean }>(sql`
        with ${yc}, ${artistFirsts}
        select a.id, a.name, a.slug, count(distinct yc.id)::int as count,
               (af.first_date >= cast(${start} as date)) as is_new
        from yc
        join concert_artists cart on cart.concert_id = yc.id
        join artists a on a.id = cart.artist_id
        join artist_firsts af on af.artist_id = a.id
        group by a.id, a.name, a.slug, af.first_date
        order by count desc, a.name
        limit 12
      `),

      db.execute<{ id: string; name: string; slug: string; first_date: string }>(sql`
        with ${artistFirsts}
        select a.id, a.name, a.slug, af.first_date::text as first_date
        from artist_firsts af
        join artists a on a.id = af.artist_id
        where af.first_date >= cast(${start} as date) and af.first_date < cast(${end} as date)
        order by af.first_date asc, a.name
        limit 60
      `),

      db.execute<{ id: string; name: string; slug: string; city: string | null; count: number; is_new: boolean }>(sql`
        with ${yc}, ${venueFirsts}
        select v.id, v.name, v.slug, v.city, count(*)::int as count,
               (vf.first_date >= cast(${start} as date)) as is_new
        from yc
        join venues v on v.id = yc.venue_id
        join venue_firsts vf on vf.venue_id = v.id
        group by v.id, v.name, v.slug, v.city, vf.first_date
        order by count desc, v.name
        limit 9
      `),

      db.execute<{ id: string; name: string; slug: string; days: number; start_date: string }>(sql`
        with ${yc}
        select es.id, es.name, es.slug, count(*)::int as days, min(yc.date)::text as start_date
        from yc
        join event_series es on es.id = yc.event_series_id
        where yc.type = 'festival_day'
        group by es.id, es.name, es.slug
        order by min(yc.date)
      `),

      db.execute<{ total: number }>(sql`
        with ${yc}
        select count(*)::int as total
        from yc
        join setlists sl on sl.concert_id = yc.id
        join setlist_songs ss on ss.setlist_id = sl.id
      `),

      db.execute<{ song: string; artist_name: string | null; artist_slug: string | null; count: number }>(sql`
        with ${yc}
        select ss.song_name as song, a.name as artist_name, a.slug as artist_slug,
               count(distinct yc.id)::int as count
        from yc
        join setlists sl on sl.concert_id = yc.id
        join setlist_songs ss on ss.setlist_id = sl.id
        left join artists a on a.id = sl.artist_id
        group by lower(ss.song_name), ss.song_name, a.name, a.slug
        having count(distinct yc.id) > 1
        order by count desc, ss.song_name
        limit 10
      `),

      db.execute<{ photos: number; videos: number }>(sql`
        with ${yc}
        select
          count(*) filter (where p.kind = 'photo')::int as photos,
          count(*) filter (where p.kind = 'video')::int as videos
        from yc
        join photos p on p.concert_id = yc.id
      `),
    ]);

    const years = [...yearRows];
    const totals = [...totalsRows][0];
    const showInfo = await loadShowInfo([...showRows].map((r) => r.id));
    const prevYearCount = years.find((y) => y.year === year - 1)?.count ?? null;

    return reply.send({
      year,
      years,
      totalShows: showRows.length,
      prevYearShows: prevYearCount,
      uniqueArtists: totals?.unique_artists ?? 0,
      newArtistCount: totals?.new_artists ?? 0,
      uniqueVenues: totals?.unique_venues ?? 0,
      newVenueCount: totals?.new_venues ?? 0,
      uniqueCities: totals?.unique_cities ?? 0,
      songsHeard: [...songTotalRows][0]?.total ?? 0,
      photos: [...mediaRows][0]?.photos ?? 0,
      videos: [...mediaRows][0]?.videos ?? 0,
      shows: [...showRows].map((r) => {
        // Festival days without their own flyer inherit the festival's, as elsewhere.
        const key = r.flyer_key ?? (r.type === "festival_day" ? r.series_flyer_key : null);
        return {
          concertId: r.id,
          date: r.date,
          type: r.type,
          headliner: r.headliner,
          info: showInfo.get(r.id) ?? null,
          flyerUrl: key ? mediaUrl(key) : null,
          series: r.series_slug ? { name: r.series_name!, slug: r.series_slug } : null,
          venue: r.venue_slug ? { name: r.venue_name!, city: r.venue_city, slug: r.venue_slug } : null,
        };
      }),
      topArtists: [...topArtistRows].map((r) => ({
        artistId: r.id, name: r.name, slug: r.slug, count: r.count, isNew: r.is_new,
      })),
      newArtists: [...newArtistRows].map((r) => ({
        artistId: r.id, name: r.name, slug: r.slug, firstSeen: r.first_date,
      })),
      topVenues: [...topVenueRows].map((r) => ({
        venueId: r.id, name: r.name, slug: r.slug, city: r.city, count: r.count, isNew: r.is_new,
      })),
      festivals: [...festivalRows].map((r) => ({
        seriesId: r.id, name: r.name, slug: r.slug, days: r.days, startDate: r.start_date,
      })),
      topSongs: [...topSongRows].map((r) => ({
        song: r.song, artistName: r.artist_name, artistSlug: r.artist_slug, count: r.count,
      })),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Direct public URL for a MinIO object (bucket is set to anonymous download). */
function mediaUrl(key: string): string {
  const base = env.MINIO_PUBLIC_URL ?? `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`;
  return `${base}/${bucket}/${key}`;
}

/** True when someone marked the concert as attended. `alias` is a fixed table alias. */
function attendedSql(alias: string) {
  return sql`exists (
    select 1 from concert_attendees ca
    where ca.concert_id = ${sql.raw(alias)}.id and ca.status = 'attended'
  )`;
}

/** Headliner name, falling back to the cached hint, then any billed artist. */
function headlinerSql(alias: string) {
  const c = sql.raw(alias);
  return sql`coalesce(
    (select a.name from concert_artists caa
     join artists a on a.id = caa.artist_id
     where caa.concert_id = ${c}.id and caa.role in ('headliner', 'co_headliner')
     order by caa.set_order asc nulls last, a.name asc
     limit 1),
    ${c}.headliner_hint,
    (select a.name from concert_artists caa
     join artists a on a.id = caa.artist_id
     where caa.concert_id = ${c}.id
     order by caa.set_order asc nulls last, a.name asc
     limit 1)
  )`;
}
