/**
 * seed-dev.ts — wipe the dev database and load realistic dummy data.
 *
 * Run with:  pnpm --filter @tagg/api seed
 *            (or: docker compose exec api pnpm seed)
 *
 * ⚠️  DESTRUCTIVE — drops all rows before inserting. Dev only.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env.js";
import { hashPassword } from "../auth/password.js";
import * as s from "../db/schema.js";

const client = postgres(env.DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema: s });

// ── Seed data ──────────────────────────────────────────────────────────────────

const VENUES = [
  { name: "Roundhouse",              slug: "roundhouse",     city: "London",   region: null,  country: "GB", lat: 51.5418,  lng: -0.1497,   capacity: 3300  },
  { name: "Red Rocks Amphitheatre",  slug: "red-rocks",      city: "Morrison", region: "CO",  country: "US", lat: 39.6654,  lng: -105.2057, capacity: 9525  },
  { name: "Paradiso",                slug: "paradiso",       city: "Amsterdam",region: null,  country: "NL", lat: 52.3641,  lng: 4.8829,    capacity: 1500  },
  { name: "Berghain",                slug: "berghain",       city: "Berlin",   region: null,  country: "DE", lat: 52.5115,  lng: 13.4406,   capacity: 1500  },
  { name: "Brixton Academy",         slug: "brixton-academy",city: "London",   region: null,  country: "GB", lat: 51.4626,  lng: -0.1143,   capacity: 4921  },
];

const ARTISTS = [
  { name: "Radiohead",                    slug: "radiohead",                     genre: "Alternative Rock"  },
  { name: "Nine Inch Nails",              slug: "nine-inch-nails",               genre: "Industrial Rock"   },
  { name: "Portishead",                   slug: "portishead",                    genre: "Trip Hop"          },
  { name: "Massive Attack",               slug: "massive-attack",                genre: "Trip Hop"          },
  { name: "Aphex Twin",                   slug: "aphex-twin",                    genre: "Electronic"        },
  { name: "Godspeed You! Black Emperor",  slug: "godspeed-you-black-emperor",    genre: "Post-Rock"         },
  { name: "Swans",                        slug: "swans",                         genre: "Experimental Rock" },
  { name: "PJ Harvey",                    slug: "pj-harvey",                     genre: "Alternative Rock"  },
];

// Concerts: [date, venueIdx, headliner, artistIdxs (role: headliner=0, support=1), status]
type ConcertSeed = {
  date: string;
  venueIdx: number;
  headliner: string;
  artists: Array<{ idx: number; role: "headliner" | "support" }>;
  status: "attended" | "attending" | "interested" | "missed";
  notes?: string;
};

const CONCERTS: ConcertSeed[] = [
  // Past — attended
  { date: "2023-03-15", venueIdx: 0, headliner: "Radiohead",       artists: [{ idx: 0, role: "headliner" }],                                      status: "attended", notes: "Incredible light show." },
  { date: "2023-05-22", venueIdx: 1, headliner: "Nine Inch Nails", artists: [{ idx: 1, role: "headliner" }, { idx: 6, role: "support" }],          status: "attended" },
  { date: "2023-07-08", venueIdx: 4, headliner: "Portishead",      artists: [{ idx: 2, role: "headliner" }],                                      status: "attended", notes: "First time seeing them live." },
  { date: "2023-09-30", venueIdx: 2, headliner: "Massive Attack",  artists: [{ idx: 3, role: "headliner" }, { idx: 2, role: "support" }],          status: "attended" },
  { date: "2023-11-18", venueIdx: 3, headliner: "Aphex Twin",      artists: [{ idx: 4, role: "headliner" }],                                      status: "attended", notes: "Unbelievable set at Berghain." },
  { date: "2024-02-14", venueIdx: 0, headliner: "Swans",           artists: [{ idx: 6, role: "headliner" }, { idx: 5, role: "support" }],          status: "attended" },
  { date: "2024-04-20", venueIdx: 1, headliner: "PJ Harvey",       artists: [{ idx: 7, role: "headliner" }],                                      status: "attended" },
  { date: "2024-06-01", venueIdx: 4, headliner: "Radiohead",       artists: [{ idx: 0, role: "headliner" }, { idx: 7, role: "support" }],          status: "attended", notes: "Second time this tour." },
  // Past — missed
  { date: "2023-08-12", venueIdx: 2, headliner: "Godspeed You! Black Emperor", artists: [{ idx: 5, role: "headliner" }], status: "missed" },
  { date: "2024-01-25", venueIdx: 3, headliner: "Nine Inch Nails", artists: [{ idx: 1, role: "headliner" }],                                      status: "missed", notes: "Sold out before I could buy tickets." },
  // Upcoming — interested / attending
  { date: "2026-08-03", venueIdx: 0, headliner: "Massive Attack",  artists: [{ idx: 3, role: "headliner" }, { idx: 2, role: "support" }],          status: "attending" },
  { date: "2026-09-15", venueIdx: 1, headliner: "Aphex Twin",      artists: [{ idx: 4, role: "headliner" }],                                      status: "interested" },
  { date: "2026-10-22", venueIdx: 4, headliner: "Swans",           artists: [{ idx: 6, role: "headliner" }],                                      status: "interested" },
];

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("⚠️  Wiping dev database…");

  // Truncate in dependency order (children first)
  await client`TRUNCATE
    setlist_songs, setlists,
    photo_artists, photos,
    concert_tags, tags,
    concert_attendees, concert_artists,
    concerts,
    venue_aliases, venues,
    artists,
    event_series,
    imports,
    auth_events,
    email_verification_tokens, password_reset_tokens,
    sessions, invites,
    users,
    site_copy
    CASCADE`;

  console.log("✓ Tables cleared");

  // ── Users ──────────────────────────────────────────────────────────────────
  const adminHash = await hashPassword("password123456");
  const userHash  = await hashPassword("password123456");

  const [admin] = await db.insert(s.users).values({
    username:        "admin",
    email:           "admin@example.com",
    passwordHash:    adminHash,
    displayName:     "Admin",
    emailVerifiedAt: new Date(),
    isAdmin:         true,
    invitesRemaining: 10,
  }).returning();

  const [user] = await db.insert(s.users).values({
    username:        "dev",
    email:           "dev@example.com",
    passwordHash:    userHash,
    displayName:     "Dev User",
    emailVerifiedAt: new Date(),
    invitesRemaining: 3,
  }).returning();

  console.log("✓ Users — admin@example.com / dev@example.com (password: password123456)");

  // ── Venues ─────────────────────────────────────────────────────────────────
  const venueRows = await db.insert(s.venues).values(VENUES).returning();
  console.log(`✓ ${venueRows.length} venues`);

  // ── Artists ────────────────────────────────────────────────────────────────
  const artistRows = await db.insert(s.artists).values(ARTISTS).returning();
  console.log(`✓ ${artistRows.length} artists`);

  // ── Concerts + attendees + concert-artists ─────────────────────────────────
  let concertCount = 0;
  for (const c of CONCERTS) {
    const venue   = venueRows[c.venueIdx];
    const [concert] = await db.insert(s.concerts).values({
      date:            c.date,
      venueId:         venue?.id ?? null,
      headlinerHint:   c.headliner,
      eventNotes:      c.notes ?? null,
      createdByUserId: admin!.id,
    }).returning();

    await db.insert(s.concertAttendees).values({
      userId:    admin!.id,
      concertId: concert!.id,
      status:    c.status,
    });

    for (const a of c.artists) {
      const artist = artistRows[a.idx];
      if (!artist) continue;
      await db.insert(s.concertArtists).values({
        concertId: concert!.id,
        artistId:  artist.id,
        role:      a.role,
        setOrder:  a.role === "headliner" ? 1 : 2,
      });
    }

    concertCount++;
  }

  console.log(`✓ ${concertCount} concerts`);
  console.log("");
  console.log("🌱 Dev seed complete!");
  console.log("   Login at http://localhost:5173");
  console.log("   admin@example.com / password123456");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => client.end());
