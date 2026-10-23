/**
 * Search index — everything searchable, in one compact response:
 *
 *   GET /search/index   artists, venues, festivals, shows and setlist songs
 *
 * The app downloads it once (the service worker keeps it, so search works
 * offline) and filters it on the device as you type.
 */

import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { BILLING_ORDER_SQL } from "../lib/show-info.js";
import { env } from "../lib/env.js";
import { bucket } from "../lib/s3.js";

const mediaUrl = (key: string | null): string | null =>
  key ? `${env.MINIO_PUBLIC_URL ?? `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`}/${bucket}/${key}` : null;

const rows = async <T>(q: ReturnType<typeof sql>) => [...(await db.execute<T & Record<string, unknown>>(q))];

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get("/search/index", async (_req, reply) => {
    const [artists, venues, festivals, shows, songs] = await Promise.all([
      rows<{ name: string; slug: string; image_key: string | null; shows: number }>(sql`
        select a.name, a.slug, a.image_key,
          count(distinct ca.concert_id) filter (where exists (
            select 1 from concert_attendees att where att.concert_id = ca.concert_id and att.status = 'attended'))::int as shows
        from artists a left join concert_artists ca on ca.artist_id = a.id
        group by a.id order by shows desc, a.name`),
      rows<{ name: string; slug: string; city: string | null; shows: number }>(sql`
        select v.name, v.slug, v.city, count(c.id)::int as shows
        from venues v left join concerts c on c.venue_id = v.id
        group by v.id order by shows desc, v.name`),
      rows<{ name: string; slug: string; year: number | null; start_date: string | null }>(sql`
        select name, slug, year, start_date::text from event_series order by start_date desc nulls last`),
      rows<{ slug: string; date: string; festival: string | null; venue: string | null; city: string | null; lineup: string | null }>(sql`
        select c.slug, c.date::text as date, es.name as festival, v.name as venue, v.city,
          (select string_agg(a.name, ' / ' order by ${BILLING_ORDER_SQL})
             from concert_artists ca join artists a on a.id = ca.artist_id where ca.concert_id = c.id) as lineup
        from concerts c
        left join event_series es on es.id = c.event_series_id
        left join venues v on v.id = c.venue_id
        order by c.date desc`),
      rows<{ song: string; artist: string | null; slug: string; date: string }>(sql`
        select distinct ss.song_name as song, a.name as artist, c.slug, c.date::text as date
        from setlist_songs ss
        join setlists sl on sl.id = ss.setlist_id
        join concerts c on c.id = sl.concert_id
        left join artists a on a.id = sl.artist_id
        order by 4 desc`),
    ]);

    const showIndex = new Map(shows.map((s, i) => [s.slug, i]));
    return reply.send({
      artists: artists.map((a) => ({ name: a.name, slug: a.slug, imageUrl: mediaUrl(a.image_key), shows: a.shows })),
      venues: venues.map((v) => ({ name: v.name, slug: v.slug, city: v.city, shows: v.shows })),
      festivals: festivals.map((f) => ({ name: f.name, slug: f.slug, year: f.year, startDate: f.start_date })),
      shows: shows.map((s) => ({ slug: s.slug, date: s.date, festival: s.festival, venue: s.venue, city: s.city, lineup: s.lineup })),
      // Compact: [song, artist, index into shows] — thousands of rows, so no repeated show details.
      songs: songs.map((s) => [s.song, s.artist, showIndex.get(s.slug) ?? -1]).filter((s) => s[2] !== -1),
    });
  });
}
