/**
 * Live API smoke test — every read endpoint the web app calls, against a running
 * dev stack (`pnpm dev`). Skipped unless SMOKE_DATABASE_URL is set.
 *
 *   SMOKE_DATABASE_URL=postgres://tagg:…@localhost:5432/tagg pnpm test:smoke
 *
 * It signs in as the first admin by inserting a short-lived session row (removed
 * afterwards), then checks each endpoint answers 200 with JSON. With
 * SMOKE_SNAPSHOT_DIR set it also records each response the first run and, on
 * later runs, fails when a response changed — run it before and after a refactor
 * to prove nothing a page reads was lost. Snapshots hold personal data, so keep
 * that directory outside the repo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DB_URL = process.env.SMOKE_DATABASE_URL;
const BASE = process.env.SMOKE_API_URL ?? "http://localhost:3000";
const SNAP_DIR = process.env.SMOKE_SNAPSHOT_DIR;
const COOKIE = process.env.SMOKE_COOKIE_NAME ?? "tagg_session";

const sql = DB_URL ? postgres(DB_URL, { max: 1 }) : null;
let token = "";
const sample: Record<string, string> = {};

beforeAll(async () => {
  if (!sql) return;
  const [admin] = await sql`select id from users where is_admin order by created_at limit 1`;
  token = randomBytes(32).toString("base64url");
  const id = createHash("sha256").update(token).digest("hex");
  await sql`insert into sessions (id, user_id, expires_at, user_agent)
            values (${id}, ${admin!.id}, now() + interval '1 hour', 'smoke-test')`;
  const one = async (q: Promise<postgres.RowList<postgres.Row[]>>) => String(Object.values((await q)[0] ?? {})[0] ?? "");
  sample.concert = await one(sql`select id from concerts order by date desc, id limit 1`);
  sample.artist = await one(sql`select a.slug from artists a join concert_artists ca on ca.artist_id = a.id order by a.slug limit 1`);
  sample.venue = await one(sql`select slug from venues order by slug limit 1`);
  sample.festival = await one(sql`select slug from event_series order by slug limit 1`);
  sample.photo = await one(sql`select id from photos order by created_at, id limit 1`);
  sample.import = await one(sql`select id from imports order by created_at, id limit 1`);
  sample.year = await one(sql`select extract(year from date)::int from concerts where date < now() order by date desc limit 1`);
});

afterAll(async () => {
  if (!sql) return;
  await sql`delete from sessions where user_agent = 'smoke-test'`;
  await sql.end();
});

/** Presigned URLs carry a fresh signature and expiry on every request. */
function normalise(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/\?X-Amz-[^"\s]*/g, "?<signed>");
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !["lastUsedAt", "generatedAt", "exportedAt", "callsToday"].includes(k))
        .map(([k, v]) => [k, normalise(v)]),
    );
  }
  return value;
}

async function get(p: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(BASE + p, { headers: { cookie: `${COOKIE}=${token}` } });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* calendar feeds, exports */ }
  return { status: res.status, body };
}

// Read endpoints the web client calls, keyed by a stable name. `:x` → sample.x.
const ENDPOINTS: Record<string, string> = {
  health: "/health",
  me: "/auth/me",
  publicTheme: "/public/theme",
  concerts: "/concerts?limit=50",
  concertsUpcoming: "/concerts?status=attending,interested&sort=date_asc",
  followup: "/concerts/followup",
  concert: "/concerts/:concert",
  concertPhotos: "/concerts/:concert/photos",
  reviewYears: "/concerts/year-review",
  yearReview: "/concerts/year-review/:year",
  stats: "/concerts/deep-stats?localDate=2026-11-02",
  searchIndex: "/search/index",
  tickets: "/photos/tickets",
  photoArtists: "/photos/:photo/artists",
  calendarToken: "/calendar/token",
  artists: "/artists?limit=50",
  artist: "/artists/:artist",
  artistPhotos: "/artists/:artist/photos",
  artistSetlists: "/artists/:artist/setlists",
  venues: "/venues?limit=50",
  venuesMap: "/venues/map",
  venue: "/venues/:venue",
  festivals: "/festivals",
  festival: "/festivals/:festival",
  imports: "/admin/imports",
  import: "/admin/imports/:import",
  dupArtists: "/admin/data/duplicates?type=artist",
  dupVenues: "/admin/data/duplicates?type=venue",
  merges: "/admin/data/merges",
  health_checks: "/admin/data/health",
  setlistFinder: "/admin/data/setlist-finder",
  festivalSuggestions: "/admin/data/festival-suggestions",
  similar: "/admin/data/similar?type=artist&name=the",
  exportJson: "/users/me/export.json",
};

describe.skipIf(!sql)("live API smoke", () => {
  for (const [name, template] of Object.entries(ENDPOINTS)) {
    it(`${name}: GET ${template}`, async () => {
      const p = template.replace(/:(\w+)/g, (_, k: string) => sample[k] ?? "");
      if (/\/$|\/\//.test(p)) return; // no sample row in this database
      const { status, body } = await get(p);
      expect(status, JSON.stringify(body).slice(0, 300)).toBe(200);
      if (!SNAP_DIR) return;
      fs.mkdirSync(SNAP_DIR, { recursive: true });
      const file = path.join(SNAP_DIR, `${name}.json`);
      const now = JSON.stringify(normalise(body), null, 1);
      if (!fs.existsSync(file)) return fs.writeFileSync(file, now);
      const before = fs.readFileSync(file, "utf8");
      if (before !== now) fs.writeFileSync(file.replace(/\.json$/, ".after.json"), now);
      expect(now === before, `${name} changed — diff ${file} with its .after.json`).toBe(true);
    });
  }

  it("removed endpoints answer 404", async () => {
    for (const p of ["/public/concerts", "/public/copy", "/admin/copy", "/concerts/stats", "/push/key", "/offline/bundle"]) {
      expect((await get(p)).status, p).toBe(404);
    }
  });
});
