/**
 * Merge a duplicate venue or artist into the record being kept, and undo it.
 *
 * A merge moves every reference to the removed record onto the kept one, fills
 * blank fields on the kept record from the removed one, keeps the old venue
 * name as an alias (so imports keep matching and its old URL redirects), then
 * deletes the removed record. Everything needed to reverse it is stored in
 * merge_log.snapshot; only the most recent merge can be undone, so nothing
 * that happened after it can depend on the merged state.
 */

import { sql } from "drizzle-orm";
import { slugify } from "@tagg/shared";
import { db } from "../db/client.js";
import type { EntityType } from "./duplicates.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Blank fields on the kept record that the removed record may fill in.
const FILLABLE: Record<EntityType, string[]> = {
  venue: ["city", "region", "country", "lat", "lng", "capacity", "image_key"],
  artist: ["mbid", "genre", "image_key", "bio"],
};

interface VenueSnapshot {
  removed: Record<string, unknown>;
  filled: string[];
  moved: { concerts: string[]; eventSeries: string[]; aliases: string[] };
  createdAliasId: string | null;
}

interface ArtistSnapshot {
  removed: Record<string, unknown>;
  filled: string[];
  moved: { concertIds: string[]; photoIds: string[]; festivalSets: string[]; setlists: string[] };
  // Rows dropped because the kept artist was already on that show/photo.
  conflicts: { concertArtists: Record<string, unknown>[]; photoArtists: Record<string, unknown>[] };
}

export interface MergePreview {
  keep: { id: string; name: string };
  remove: { id: string; name: string };
  moves: { label: string; count: number }[];
  fills: string[];
}

const ids = (rows: Iterable<{ id: string }>) => [...rows].map((r) => r.id);

async function rowJson(tx: Tx | typeof db, table: "venues" | "artists", id: string): Promise<Record<string, unknown> | null> {
  const rows = await tx.execute<{ j: Record<string, unknown> }>(
    sql`select to_jsonb(t) as j from ${sql.raw(table)} t where t.id = ${id}`,
  );
  return [...rows][0]?.j ?? null;
}

function fillPlan(type: EntityType, keep: Record<string, unknown>, remove: Record<string, unknown>): string[] {
  return FILLABLE[type].filter((col) => (keep[col] === null || keep[col] === "") && remove[col] !== null && remove[col] !== "");
}

const LABEL: Record<string, string> = {
  city: "city", region: "region", country: "country", lat: "coordinates", lng: "coordinates",
  capacity: "capacity", image_key: "photo", mbid: "MusicBrainz id", genre: "genre", bio: "bio",
};

export async function previewMerge(type: EntityType, keepId: string, removeId: string): Promise<MergePreview> {
  const table = type === "venue" ? "venues" : "artists";
  const keep = await rowJson(db, table, keepId);
  const remove = await rowJson(db, table, removeId);
  if (!keep || !remove || keepId === removeId) throw new Error("Pick two different records.");

  const count = async (q: ReturnType<typeof sql>) => [...(await db.execute<{ n: number }>(q))][0]?.n ?? 0;
  const moves =
    type === "venue"
      ? [
          { label: "shows", count: await count(sql`select count(*)::int n from concerts where venue_id = ${removeId}`) },
          { label: "festivals", count: await count(sql`select count(*)::int n from event_series where venue_id = ${removeId}`) },
          { label: "aliases", count: await count(sql`select count(*)::int n from venue_aliases where canonical_venue_id = ${removeId}`) },
        ]
      : [
          { label: "shows", count: await count(sql`select count(*)::int n from concert_artists where artist_id = ${removeId}`) },
          { label: "festival sets", count: await count(sql`select count(*)::int n from festival_sets where artist_id = ${removeId}`) },
          { label: "setlists", count: await count(sql`select count(*)::int n from setlists where artist_id = ${removeId}`) },
          { label: "photo tags", count: await count(sql`select count(*)::int n from photo_artists where artist_id = ${removeId}`) },
        ];

  return {
    keep: { id: keepId, name: String(keep.name) },
    remove: { id: removeId, name: String(remove.name) },
    moves: moves.filter((m) => m.count > 0),
    fills: [...new Set(fillPlan(type, keep, remove).map((c) => LABEL[c] ?? c))],
  };
}

async function setColumns(tx: Tx, table: string, id: string, values: Record<string, unknown>): Promise<void> {
  const cols = Object.keys(values);
  if (cols.length === 0) return;
  // Copy values from a jsonb object so each column keeps its own type.
  await tx.execute(sql`
    update ${sql.raw(table)} t set ${sql.raw(cols.map((c) => `"${c}" = src."${c}"`).join(", "))}
    from jsonb_populate_record(null::${sql.raw(table)}, ${JSON.stringify(values)}::jsonb) src
    where t.id = ${id}
  `);
}

async function uniqueAliasSlug(tx: Tx, base: string): Promise<string> {
  const taken = await tx.execute(sql`select 1 from venue_aliases where slug = ${base}`);
  return [...taken].length === 0 ? base : `${base}-${Date.now().toString(36)}`;
}

export async function mergeRecords(type: EntityType, keepId: string, removeId: string, userId: string | null): Promise<string> {
  if (keepId === removeId) throw new Error("Pick two different records.");
  const table = type === "venue" ? "venues" : "artists";

  return db.transaction(async (tx) => {
    const keep = await rowJson(tx, table, keepId);
    const removed = await rowJson(tx, table, removeId);
    if (!keep || !removed) throw new Error("One of those records no longer exists.");
    const filled = fillPlan(type, keep, removed);
    let snapshot: VenueSnapshot | ArtistSnapshot;

    if (type === "venue") {
      const concerts = ids(await tx.execute<{ id: string }>(sql`update concerts set venue_id = ${keepId} where venue_id = ${removeId} returning id`));
      const eventSeries = ids(await tx.execute<{ id: string }>(sql`update event_series set venue_id = ${keepId} where venue_id = ${removeId} returning id`));
      const aliases = ids(await tx.execute<{ id: string }>(sql`update venue_aliases set canonical_venue_id = ${keepId} where canonical_venue_id = ${removeId} returning id`));
      await tx.execute(sql`delete from venues where id = ${removeId}`);
      await setColumns(tx, "venues", keepId, Object.fromEntries(filled.map((c) => [c, removed[c]])));
      // The old name lives on as an alias: future imports match it and its old URL redirects.
      const slug = await uniqueAliasSlug(tx, String(removed.slug) || slugify(String(removed.name)));
      const alias = [...(await tx.execute<{ id: string }>(sql`
        insert into venue_aliases (canonical_venue_id, name, slug, notes)
        values (${keepId}, ${String(removed.name)}, ${slug}, ${"Merged duplicate"})
        returning id
      `))][0];
      snapshot = { removed, filled, moved: { concerts, eventSeries, aliases }, createdAliasId: alias?.id ?? null };
    } else {
      // Shows/photos where both artists are already listed: drop the duplicate row (kept for undo).
      const caConflicts = [...(await tx.execute<{ j: Record<string, unknown> }>(sql`
        delete from concert_artists ca using concert_artists k
        where ca.artist_id = ${removeId} and k.artist_id = ${keepId} and k.concert_id = ca.concert_id
        returning to_jsonb(ca) as j
      `))].map((r) => r.j);
      const paConflicts = [...(await tx.execute<{ j: Record<string, unknown> }>(sql`
        delete from photo_artists pa using photo_artists k
        where pa.artist_id = ${removeId} and k.artist_id = ${keepId} and k.photo_id = pa.photo_id
        returning to_jsonb(pa) as j
      `))].map((r) => r.j);
      const concertIds = [...(await tx.execute<{ concert_id: string }>(sql`update concert_artists set artist_id = ${keepId} where artist_id = ${removeId} returning concert_id`))].map((r) => r.concert_id);
      const photoIds = [...(await tx.execute<{ photo_id: string }>(sql`update photo_artists set artist_id = ${keepId} where artist_id = ${removeId} returning photo_id`))].map((r) => r.photo_id);
      const festivalSets = ids(await tx.execute<{ id: string }>(sql`update festival_sets set artist_id = ${keepId} where artist_id = ${removeId} returning id`));
      const setlists = ids(await tx.execute<{ id: string }>(sql`update setlists set artist_id = ${keepId} where artist_id = ${removeId} returning id`));
      await tx.execute(sql`delete from artists where id = ${removeId}`);
      await setColumns(tx, "artists", keepId, Object.fromEntries(filled.map((c) => [c, removed[c]])));
      snapshot = {
        removed, filled,
        moved: { concertIds, photoIds, festivalSets, setlists },
        conflicts: { concertArtists: caConflicts, photoArtists: paConflicts },
      };
    }

    const log = [...(await tx.execute<{ id: string }>(sql`
      insert into merge_log (entity_type, kept_id, removed_id, kept_name, removed_name, snapshot, user_id)
      values (${type}, ${keepId}, ${removeId}, ${String(keep.name)}, ${String(removed.name)}, ${JSON.stringify(snapshot)}::jsonb, ${userId})
      returning id
    `))][0];
    return log!.id;
  });
}

export async function undoMerge(logId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const latest = [...(await tx.execute<{
      id: string; entity_type: EntityType; kept_id: string; removed_id: string; snapshot: VenueSnapshot | ArtistSnapshot;
    }>(sql`select id, entity_type, kept_id, removed_id, snapshot from merge_log where undone_at is null order by created_at desc limit 1`))][0];
    if (!latest || latest.id !== logId) throw new Error("Only the most recent merge can be undone.");
    const { kept_id: keepId, removed_id: removeId } = latest;

    if (latest.entity_type === "venue") {
      const snap = latest.snapshot as VenueSnapshot;
      if (snap.createdAliasId) await tx.execute(sql`delete from venue_aliases where id = ${snap.createdAliasId}`);
      await tx.execute(sql`insert into venues select * from jsonb_populate_record(null::venues, ${JSON.stringify(snap.removed)}::jsonb)`);
      await setColumns(tx, "venues", keepId, Object.fromEntries(snap.filled.map((c) => [c, null])));
      for (const id of snap.moved.concerts) await tx.execute(sql`update concerts set venue_id = ${removeId} where id = ${id} and venue_id = ${keepId}`);
      for (const id of snap.moved.eventSeries) await tx.execute(sql`update event_series set venue_id = ${removeId} where id = ${id} and venue_id = ${keepId}`);
      for (const id of snap.moved.aliases) await tx.execute(sql`update venue_aliases set canonical_venue_id = ${removeId} where id = ${id} and canonical_venue_id = ${keepId}`);
    } else {
      const snap = latest.snapshot as ArtistSnapshot;
      await setColumns(tx, "artists", keepId, Object.fromEntries(snap.filled.map((c) => [c, null])));
      await tx.execute(sql`insert into artists select * from jsonb_populate_record(null::artists, ${JSON.stringify(snap.removed)}::jsonb)`);
      for (const cid of snap.moved.concertIds) {
        await tx.execute(sql`update concert_artists set artist_id = ${removeId} where concert_id = ${cid} and artist_id = ${keepId}`);
      }
      for (const pid of snap.moved.photoIds) {
        await tx.execute(sql`update photo_artists set artist_id = ${removeId} where photo_id = ${pid} and artist_id = ${keepId}`);
      }
      for (const id of snap.moved.festivalSets) await tx.execute(sql`update festival_sets set artist_id = ${removeId} where id = ${id}`);
      for (const id of snap.moved.setlists) await tx.execute(sql`update setlists set artist_id = ${removeId} where id = ${id}`);
      if (snap.conflicts.concertArtists.length > 0) {
        await tx.execute(sql`insert into concert_artists select * from jsonb_populate_recordset(null::concert_artists, ${JSON.stringify(snap.conflicts.concertArtists)}::jsonb) on conflict do nothing`);
      }
      if (snap.conflicts.photoArtists.length > 0) {
        await tx.execute(sql`insert into photo_artists select * from jsonb_populate_recordset(null::photo_artists, ${JSON.stringify(snap.conflicts.photoArtists)}::jsonb) on conflict do nothing`);
      }
    }
    await tx.execute(sql`update merge_log set undone_at = now() where id = ${logId}`);
  });
}
