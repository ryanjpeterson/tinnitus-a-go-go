import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uuid,
  primaryKey,
  uniqueIndex,
  index,
  doublePrecision,
  date,
} from "drizzle-orm/pg-core";

// ===== Enums =====

export const concertTypeEnum = pgEnum("concert_type", ["concert", "festival_day"]);
export const importStatusEnum = pgEnum("import_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "interested",
  "attending",
  "attended",
  "missed",
  "cancelled",
]);
export const concertArtistRoleEnum = pgEnum("concert_artist_role", [
  "headliner",
  "co_headliner",
  "support",
]);
export const photoKindEnum = pgEnum("photo_kind", ["flyer", "ticket", "photo", "poster", "video"]);

// ===== Users / Auth =====

/** What the worker sends you and when (migration 0020). Times are in the worker's TIMEZONE. */
export interface NotifyPrefs {
  /** Days before a show to remind you, e.g. [7, 3, 1]; empty turns reminders off. */
  remindDays: number[];
  remindNtfy: boolean;
  remindEmail: boolean;
  /** Also remind for shows marked interested, not only attending. */
  remindInterested: boolean;
  /** Weekly recap: anniversaries this week and what's coming up. Both off turns it off. */
  recapNtfy: boolean;
  recapEmail: boolean;
  /** 0 = Sunday … 6 = Saturday. */
  recapWeekday: number;
  /** Hour of the day (0–23) reminders and the recap go out. */
  hour: number;
  /** Where emails go; null = the account's email. */
  emailTo: string | null;
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  remindDays: [7, 3, 1],
  remindNtfy: true,
  remindEmail: true,
  remindInterested: false,
  recapNtfy: true,
  recapEmail: true,
  recapWeekday: 1,
  hour: 9,
  emailTo: null,
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: text("username").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    avatarKey: text("avatar_key"),
    bio: text("bio"),
    isAdmin: boolean("is_admin").notNull().default(false),
    // Reserved for future TOTP/2FA — adding column now avoids a migration later.
    totpSecret: text("totp_secret"),
    // Secret in the private calendar-feed URL (/calendar/<token>.ics); reset to revoke.
    calendarToken: text("calendar_token").unique(),
    // ntfy and email notifications (migration 0020); missing keys fall back to DEFAULT_NOTIFY_PREFS.
    notifyPrefs: jsonb("notify_prefs").$type<Partial<NotifyPrefs>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    usernameUq: uniqueIndex("users_username_lower_uq").on(sql`lower(${t.username})`),
    emailUq: uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    // sha256 hash of the raw session token; raw token is only in the cookie.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  }),
);

export const authEvents = pgTable(
  "auth_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: text("kind").notNull(), // 'login.success', 'login.fail', 'signup', 'password.change', etc.
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindIdx: index("auth_events_kind_idx").on(t.kind),
    userIdx: index("auth_events_user_idx").on(t.userId),
    createdIdx: index("auth_events_created_idx").on(t.createdAt),
  }),
);

// ===== Music domain =====

export const artists = pgTable(
  "artists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    mbid: text("mbid").unique(), // MusicBrainz ID
    genre: text("genre"),
    imageKey: text("image_key"),
    // Where an automatically found photo came from (Deezer / Wikimedia Commons).
    imageSource: text("image_source"),
    // Last time the enrichment worker looked this artist up.
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    bio: text("bio"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameIdx: index("artists_name_idx").on(t.name),
  }),
);

export const venues = pgTable(
  "venues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    city: text("city"),
    region: text("region"), // state/province
    country: text("country"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    capacity: integer("capacity"),
    imageKey: text("image_key"), // MinIO object key for venue cover photo
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameCityIdx: index("venues_name_city_idx").on(t.name, t.city),
  }),
);

export const eventSeries = pgTable(
  "event_series",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    year: integer("year"),
    // The festival across years ("Bluesfest" for Bluesfest 2024, 2025, …).
    brand: text("brand"),
    // Festival-specific fields (nullable for backward compatibility with tour names)
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
    startDate: date("start_date"),
    endDate: date("end_date"),
    flyerKey: text("flyer_key"),
    flyerHash: text("flyer_hash"),
    eventNotes: text("event_notes"),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameYearUq: uniqueIndex("event_series_name_year_uq").on(t.name, t.year),
    venueIdx: index("event_series_venue_idx").on(t.venueId),
  }),
);

// Festival lineups and attendance live on the festival's day shows
// (concerts.type = 'festival_day'); see migration 0014.

export const concerts = pgTable(
  "concerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    date: date("date").notNull(),
    dateIsApproximate: boolean("date_is_approximate").notNull().default(false),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
    eventSeriesId: uuid("event_series_id").references(() => eventSeries.id, { onDelete: "set null" }),
    // Derived by the database (migration 0015): festival_day exactly when
    // eventSeriesId is set. Writes don't need to set it.
    type: concertTypeEnum("type").notNull().default("concert"),
    // Maintained by the database from the lineup: the headliner, the
    // co-headliners joined with " & ", or the top of the bill.
    headlinerHint: text("headliner_hint"),
    // Readable and unique, maintained by the database: festival or headliner
    // name + date, e.g. "foo-fighters-2011-09-10". Changes when those do.
    slug: text("slug").notNull().default(""),
    flyerKey: text("flyer_key"),   // MinIO object key for the concert flyer image
    flyerHash: text("flyer_hash"), // SHA-256 hex of the current flyer for duplicate detection
    eventNotes: text("event_notes"),
    sourceUrl: text("source_url"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dateIdx: index("concerts_date_idx").on(t.date),
    venueDateIdx: index("concerts_venue_date_idx").on(t.venueId, t.date),
    seriesIdx: index("concerts_series_idx").on(t.eventSeriesId),
  }),
);

export const concertArtists = pgTable(
  "concert_artists",
  {
    concertId: uuid("concert_id")
      .notNull()
      .references(() => concerts.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    // At most one headliner, and never alongside co-headliners (enforced in the database).
    role: concertArtistRoleEnum("role").notNull().default("support"),
    setOrder: integer("set_order"),
    appearanceNotes: text("appearance_notes"),
    stageName: text("stage_name"), // festival days
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.concertId, t.artistId] }),
    artistIdx: index("concert_artists_artist_idx").on(t.artistId),
  }),
);

export const concertAttendees = pgTable(
  "concert_attendees",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    concertId: uuid("concert_id")
      .notNull()
      .references(() => concerts.id, { onDelete: "cascade" }),
    status: attendanceStatusEnum("status").notNull().default("interested"),
    attendedConfirmedAt: timestamp("attended_confirmed_at", { withTimezone: true }),
    personalNotes: text("personal_notes"),
    ticketPricePaid: integer("ticket_price_paid"), // cents
    ticketPriceCurrency: text("ticket_price_currency"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.concertId] }),
    concertStatusIdx: index("attendees_concert_status_idx").on(t.concertId, t.status),
    userStatusIdx: index("attendees_user_status_idx").on(t.userId, t.status),
  }),
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    concertId: uuid("concert_id")
      .notNull()
      .references(() => concerts.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: photoKindEnum("kind").notNull().default("photo"),
    objectKey: text("object_key").notNull(), // path in MinIO
    width: integer("width"),
    height: integer("height"),
    durationSec: integer("duration_sec"), // videos only
    takenAt: timestamp("taken_at", { withTimezone: true }),
    variants: jsonb("variants").$type<Record<string, string>>(),
    setOrder: integer("set_order"),          // explicit display order (null = append)
    contentHash: text("content_hash"),       // SHA-256 hex of original file for dedup
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    concertIdx: index("photos_concert_idx").on(t.concertId),
  }),
);

// ===== Photo-artist tags =====
// Junction table linking photos to the artists who appear in them.

export const photoArtists = pgTable(
  "photo_artists",
  {
    photoId:   uuid("photo_id").notNull().references(() => photos.id,   { onDelete: "cascade" }),
    artistId:  uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk:        primaryKey({ columns: [t.photoId, t.artistId] }),
    photoIdx:  index("photo_artists_photo_idx").on(t.photoId),
    artistIdx: index("photo_artists_artist_idx").on(t.artistId),
  }),
);

export const setlists = pgTable("setlists", {
  id: uuid("id").defaultRandom().primaryKey(),
  concertId: uuid("concert_id")
    .notNull()
    .references(() => concerts.id, { onDelete: "cascade" }),
  artistId: uuid("artist_id").references(() => artists.id, { onDelete: "cascade" }),
  setlistfmId: text("setlistfm_id").unique(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const setlistSongs = pgTable("setlist_songs", {
  id: uuid("id").defaultRandom().primaryKey(),
  setlistId: uuid("setlist_id")
    .notNull()
    .references(() => setlists.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  songName: text("song_name").notNull(),
  isCover: boolean("is_cover").notNull().default(false),
  coverArtist: text("cover_artist"),
  notes: text("notes"),
  // Which set the song belongs to: null = main set, "Encore", "Encore 2", or a named set.
  setName: text("set_name"),
});

// ===== Venue aliases =====
// Records alternative names for a venue over time (e.g. "Air Canada Centre" is an alias
// for the venue now known as "Scotiabank Arena"). Searching or linking to an alias slug
// automatically redirects to the canonical venue.

export const venueAliases = pgTable(
  "venue_aliases",
  {
    id:               uuid("id").defaultRandom().primaryKey(),
    canonicalVenueId: uuid("canonical_venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
    name:             text("name").notNull(),
    slug:             text("slug").notNull().unique(),
    activeFrom:       date("active_from"),   // when this name started being used (optional)
    activeUntil:      date("active_until"),  // when this name stopped being used (optional)
    notes:            text("notes"),
    createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    canonicalIdx: index("venue_aliases_canonical_idx").on(t.canonicalVenueId),
    slugIdx:      index("venue_aliases_slug_idx").on(t.slug),
  }),
);

// ===== Automatic setlist finder =====

/** setlist.fm searches the worker has made per (show, artist), so misses aren't repeated hourly. */
export const setlistLookups = pgTable(
  "setlist_lookups",
  {
    concertId:     uuid("concert_id").notNull().references(() => concerts.id, { onDelete: "cascade" }),
    artistId:      uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
    attempts:      integer("attempts").notNull().default(0),
    lastResult:    text("last_result"), // linked | no_match | taken
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.concertId, t.artistId] }) }),
);

// ===== Notifications =====

/** Notifications already sent (one row per reminder, recap week or test), so each goes out once. */
export const notificationsSent = pgTable(
  "notifications_sent",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key:    text("key").notNull(), // "remind:<concertId>:<days>" | "recap:<YYYY-MM-DD>"
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.key] }) }),
);

/** Storage objects no longer referenced by any row (queued by migration 0018's triggers); the API deletes them. */
export const storageOrphans = pgTable("storage_orphans", {
  key:       text("key").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===== Data cleanup =====

/** One row per duplicate merge; `snapshot` holds what's needed to undo it. */
export const mergeLog = pgTable(
  "merge_log",
  {
    id:          uuid("id").defaultRandom().primaryKey(),
    entityType:  text("entity_type").notNull(), // "venue" | "artist"
    keptId:      uuid("kept_id").notNull(),
    removedId:   uuid("removed_id").notNull(),
    keptName:    text("kept_name").notNull(),
    removedName: text("removed_name").notNull(),
    snapshot:    jsonb("snapshot").notNull(),
    userId:      uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    undoneAt:    timestamp("undone_at", { withTimezone: true }),
  },
  (t) => ({ createdIdx: index("merge_log_created_idx").on(t.createdAt) }),
);

/** Pairs marked "not a duplicate" (idA < idB), hidden from suggestions. */
export const duplicateDismissals = pgTable(
  "duplicate_dismissals",
  {
    entityType: text("entity_type").notNull(),
    idA:        uuid("id_a").notNull(),
    idB:        uuid("id_b").notNull(),
    createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.entityType, t.idA, t.idB] }) }),
);

// ===== Relations (required for Drizzle relational query API) =====

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  concertAttendees: many(concertAttendees),
  imports: many(imports),
}));

export const venuesRelations = relations(venues, ({ many }) => ({
  concerts: many(concerts),
  aliases: many(venueAliases),
}));

export const venueAliasesRelations = relations(venueAliases, ({ one }) => ({
  canonicalVenue: one(venues, { fields: [venueAliases.canonicalVenueId], references: [venues.id] }),
}));

export const artistsRelations = relations(artists, ({ many }) => ({
  concertArtists: many(concertArtists),
  taggedPhotos:   many(photoArtists),
}));

export const eventSeriesRelations = relations(eventSeries, ({ one, many }) => ({
  concerts: many(concerts),
  venue: one(venues, { fields: [eventSeries.venueId], references: [venues.id] }),
}));

export const concertsRelations = relations(concerts, ({ one, many }) => ({
  venue: one(venues, { fields: [concerts.venueId], references: [venues.id] }),
  eventSeries: one(eventSeries, {
    fields: [concerts.eventSeriesId],
    references: [eventSeries.id],
  }),
  concertArtists: many(concertArtists),
  concertAttendees: many(concertAttendees),
  photos: many(photos),
  setlists: many(setlists),
}));

export const concertArtistsRelations = relations(concertArtists, ({ one }) => ({
  concert: one(concerts, {
    fields: [concertArtists.concertId],
    references: [concerts.id],
  }),
  artist: one(artists, {
    fields: [concertArtists.artistId],
    references: [artists.id],
  }),
}));

export const concertAttendeesRelations = relations(concertAttendees, ({ one }) => ({
  user: one(users, { fields: [concertAttendees.userId], references: [users.id] }),
  concert: one(concerts, {
    fields: [concertAttendees.concertId],
    references: [concerts.id],
  }),
}));

export const photoArtistsRelations = relations(photoArtists, ({ one }) => ({
  photo:  one(photos,  { fields: [photoArtists.photoId],  references: [photos.id]  }),
  artist: one(artists, { fields: [photoArtists.artistId], references: [artists.id] }),
}));

export const photosRelations = relations(photos, ({ one, many }) => ({
  concert:    one(concerts, { fields: [photos.concertId],        references: [concerts.id] }),
  uploadedBy: one(users,    { fields: [photos.uploadedByUserId], references: [users.id]    }),
  taggedArtists: many(photoArtists),
}));

export const setlistsRelations = relations(setlists, ({ one, many }) => ({
  concert: one(concerts, { fields: [setlists.concertId], references: [concerts.id] }),
  artist: one(artists, { fields: [setlists.artistId], references: [artists.id] }),
  songs: many(setlistSongs),
}));

export const setlistSongsRelations = relations(setlistSongs, ({ one }) => ({
  setlist: one(setlists, { fields: [setlistSongs.setlistId], references: [setlists.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

// ===== Imports =====
// Tracks CSV import jobs. Created by the admin upload endpoint, processed by the worker.
// `errorsSample` caps at ~20 entries to avoid bloat; full error stream can go to logs.

export const imports = pgTable(
  "imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(), // path in MinIO
    originalFilename: text("original_filename"),
    status: importStatusEnum("status").notNull().default("queued"),
    totalRows: integer("total_rows").notNull().default(0),
    processedRows: integer("processed_rows").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    errorsSample: jsonb("errors_sample").$type<Array<{ row: number; message: string }>>(),
    // Counters for "shows created", "artists created", "venues created", etc.
    summary: jsonb("summary").$type<Record<string, number>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("imports_user_idx").on(t.userId),
    statusIdx: index("imports_status_idx").on(t.status),
  }),
);

export const importsRelations = relations(imports, ({ one }) => ({
  user: one(users, { fields: [imports.userId], references: [users.id] }),
}));

// ===== Site Copy =====
// Key/value settings. Section "theme" holds the brand theme (routes/theme.ts).

export const siteCopy = pgTable("site_copy", {
  key:         text("key").primaryKey(),
  value:       text("value").notNull().default(""),
  description: text("description"),
  section:     text("section").notNull().default("general"),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
