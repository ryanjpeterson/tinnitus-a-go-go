/**
 * Data health checks for the admin cleanup page: each check lists the records
 * with a problem and, where it's safe, offers a one-tap fix.
 */

import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { cityKey } from "./names.js";

export interface HealthItem {
  id: string;
  label: string;
  sub?: string | null;
  href?: string;
}

export interface HealthCheck {
  id: string;
  title: string;
  description: string;
  items: HealthItem[];
  /** One-tap fix for the whole list, if there is a safe one. */
  fix?: { label: string; confirm: string };
  /** City spelling groups: each offers "use this spelling". */
  cityGroups?: { spellings: { city: string; venues: number }[] }[];
}

type Row = Record<string, string | null>;
const rows = async (q: ReturnType<typeof sql>) => [...(await db.execute<Row>(q))];

export async function runHealthChecks(): Promise<HealthCheck[]> {
  const [orphanVenues, orphanArtists, untidyVenues, untidyArtists, noLineup, noStatus, noCoords, cities] = await Promise.all([
    rows(sql`
      select v.id, v.name, v.city, v.slug from venues v
      where not exists (select 1 from concerts c where c.venue_id = v.id)
        and not exists (select 1 from event_series es where es.venue_id = v.id)
      order by v.name`),
    rows(sql`
      select a.id, a.name, a.slug from artists a
      where not exists (select 1 from concert_artists ca where ca.artist_id = a.id)
        and not exists (select 1 from festival_sets fs where fs.artist_id = a.id)
        and not exists (select 1 from setlists s where s.artist_id = a.id)
        and not exists (select 1 from photo_artists pa where pa.artist_id = a.id)
      order by a.name`),
    rows(sql`select id, name, city, slug from venues where name <> btrim(regexp_replace(name, '\\s+', ' ', 'g')) order by name`),
    rows(sql`select id, name, slug from artists where name <> btrim(regexp_replace(name, '\\s+', ' ', 'g')) order by name`),
    rows(sql`
      select c.id, c.date::text as date, v.name as venue from concerts c left join venues v on v.id = c.venue_id
      where not exists (select 1 from concert_artists ca where ca.concert_id = c.id)
      order by c.date desc`),
    rows(sql`
      select c.id, c.date::text as date, v.name as venue from concerts c left join venues v on v.id = c.venue_id
      where not exists (select 1 from concert_attendees ca where ca.concert_id = c.id)
      order by c.date desc`),
    rows(sql`select id, name, city, slug from venues where lat is null or lng is null or city is null or city = '' order by name`),
    rows(sql`select city, count(*)::text as n from venues where city is not null and city <> '' group by city`),
  ]);

  // Cities spelled more than one way ("Montréal" / "Montreal" / "montreal").
  const byKey = new Map<string, { city: string; venues: number }[]>();
  for (const r of cities) {
    const k = cityKey(r.city);
    byKey.set(k, [...(byKey.get(k) ?? []), { city: r.city!, venues: Number(r.n) }]);
  }
  const cityGroups = [...byKey.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({ spellings: g.sort((a, b) => b.venues - a.venues) }));

  const venueItem = (r: Row): HealthItem => ({ id: r.id!, label: r.name!, sub: r.city, href: `/venues/${r.slug}` });
  const artistItem = (r: Row): HealthItem => ({ id: r.id!, label: r.name!, href: `/artists/${r.slug}` });
  const showItem = (r: Row): HealthItem => ({ id: r.id!, label: r.date!, sub: r.venue, href: `/shows/${r.id}` });

  return [
    {
      id: "city-spellings",
      title: "City spelled more than one way",
      description: "Venues in the same city with different spellings. Pick the spelling to use everywhere.",
      items: cityGroups.map((g) => ({ id: g.spellings[0]!.city, label: g.spellings.map((s) => s.city).join(" · ") })),
      cityGroups,
    },
    {
      id: "untidy-names",
      title: "Names with extra spaces",
      description: "Leading, trailing or doubled spaces make the same name look different.",
      items: [...untidyVenues.map(venueItem), ...untidyArtists.map(artistItem)],
      fix: { label: "Tidy all", confirm: "Trim and collapse spaces in these names?" },
    },
    {
      id: "orphan-venues",
      title: "Venues with no shows",
      description: "Left behind after edits or merges. Safe to delete.",
      items: orphanVenues.map(venueItem),
      fix: { label: "Delete all", confirm: "Delete these venues? This can't be undone." },
    },
    {
      id: "orphan-artists",
      title: "Artists with no shows",
      description: "Not on any show, festival, setlist or photo. Safe to delete.",
      items: orphanArtists.map(artistItem),
      fix: { label: "Delete all", confirm: "Delete these artists? This can't be undone." },
    },
    {
      id: "no-status",
      title: "Shows with no status",
      description: "Not marked attended, attending or anything else, so they don't appear in Past or Upcoming. Open each to set it.",
      items: noStatus.map(showItem),
    },
    {
      id: "no-lineup",
      title: "Shows with no artists",
      description: "Open each to add its lineup.",
      items: noLineup.map(showItem),
    },
    {
      id: "venue-location",
      title: "Venues missing a city or map location",
      description: "They won't appear on the map. Open each and edit the venue.",
      items: noCoords.map(venueItem),
    },
  ];
}

export async function applyFix(check: string, value?: string, to?: string): Promise<number> {
  switch (check) {
    case "untidy-names": {
      const a = await db.execute(sql`update venues set name = btrim(regexp_replace(name, '\\s+', ' ', 'g')) where name <> btrim(regexp_replace(name, '\\s+', ' ', 'g')) returning id`);
      const b = await db.execute(sql`update artists set name = btrim(regexp_replace(name, '\\s+', ' ', 'g')) where name <> btrim(regexp_replace(name, '\\s+', ' ', 'g')) returning id`);
      return [...a].length + [...b].length;
    }
    case "orphan-venues": {
      // Re-checked at delete time so a venue that gained a show meanwhile is kept.
      const r = await db.execute(sql`
        delete from venues v
        where not exists (select 1 from concerts c where c.venue_id = v.id)
          and not exists (select 1 from event_series es where es.venue_id = v.id)
        returning id`);
      return [...r].length;
    }
    case "orphan-artists": {
      const r = await db.execute(sql`
        delete from artists a
        where not exists (select 1 from concert_artists ca where ca.artist_id = a.id)
          and not exists (select 1 from festival_sets fs where fs.artist_id = a.id)
          and not exists (select 1 from setlists s where s.artist_id = a.id)
          and not exists (select 1 from photo_artists pa where pa.artist_id = a.id)
        returning id`);
      return [...r].length;
    }
    case "city-spellings": {
      // Rename every spelling of this city to `to`.
      if (!value || !to) throw new Error("Pick a spelling.");
      const all = await rows(sql`select distinct city from venues where city is not null`);
      const variants = all.map((r) => r.city!).filter((c) => cityKey(c) === cityKey(value) && c !== to);
      if (variants.length === 0) return 0;
      const r = await db.execute(sql`update venues set city = ${to} where city in ${variants} returning id`);
      return [...r].length;
    }
    default:
      throw new Error("Unknown fix.");
  }
}
