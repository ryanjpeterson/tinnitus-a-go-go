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
  "dismissed",
]);
export const concertArtistRoleEnum = pgEnum("concert_artist_role", [
  "headliner",
  "co_headliner",
  "support",
]);
export const photoKindEnum = pgEnum("photo_kind", ["flyer", "ticket", "photo", "poster", "video"]);

// ===== Users / Auth =====

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: text("username").notNull(),
    email: text("email").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    avatarKey: text("avatar_key"),
    bio: text("bio"),
    invitedByUserId: uuid("invited_by_user_id"),
    invitesRemaining: integer("invites_remaining").notNull().default(3),
    isAdmin: boolean("is_admin").notNull().default(false),
    // Reserved for future TOTP/2FA — adding column now avoids a migration later.
    totpSecret: text("totp_secret"),
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

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // sha256 hash of the raw code; raw code is only in the URL we send.
    codeHash: text("code_hash").notNull().unique(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedByUserId: uuid("used_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdByIdx: index("invites_created_by_idx").on(t.createdByUserId),
  }),
);

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Rate-limit / audit log of auth events. Used for lockout heuristics + audit.
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
    imageKey: text("image_key"),
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

export const festivalAttendees = pgTable(
  "festival_attendees",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    festivalId: uuid("festival_id")
      .notNull()
      .references(() => eventSeries.id, { onDelete: "cascade" }),
    status: attendanceStatusEnum("status").notNull().default("interested"),
    personalNotes: text("personal_notes"),
    rating: integer("rating"),
    ticketPricePaid: integer("ticket_price_paid"),
    ticketPriceCurrency: text("ticket_price_currency"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.festivalId] }),
    festivalStatusIdx: index("festival_attendees_festival_status_idx").on(t.festivalId, t.status),
    userStatusIdx: index("festival_attendees_user_status_idx").on(t.userId, t.status),
  }),
);

export const festivalSets = pgTable(
  "festival_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    festivalId: uuid("festival_id")
      .notNull()
      .references(() => eventSeries.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    performanceDate: date("performance_date"),
    stageName: text("stage_name"),
    setOrder: integer("set_order"),
    appearanceNotes: text("appearance_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    festivalIdx: index("festival_sets_festival_idx").on(t.festivalId),
    artistIdx: index("festival_sets_artist_idx").on(t.artistId),
    festivalDateIdx: index("festival_sets_festival_date_idx").on(t.festivalId, t.performanceDate),
  }),
);

export const concerts = pgTable(
  "concerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    date: date("date").notNull(),
    dateIsApproximate: boolean("date_is_approximate").notNull().default(false),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
    eventSeriesId: uuid("event_series_id").references(() => eventSeries.id, { onDelete: "set null" }),
    type: concertTypeEnum("type").notNull().default("concert"),
    headlinerHint: text("headliner_hint"),
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
    role: concertArtistRoleEnum("role").notNull().default("headliner"),
    setOrder: integer("set_order"),
    appearanceNotes: text("appearance_notes"),
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
    rsvpAt: timestamp("rsvp_at", { withTimezone: true }),
    attendedConfirmedAt: timestamp("attended_confirmed_at", { withTimezone: true }),
    personalNotes: text("personal_notes"),
    rating: integer("rating"), // 1..5 (or 1..10 — settle later)
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

export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const concertTags = pgTable(
  "concert_tags",
  {
    concertId: uuid("concert_id")
      .notNull()
      .references(() => concerts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.concertId, t.tagId] }),
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

// ===== Relations (required for Drizzle relational query API) =====

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  invites: many(invites),
  concertAttendees: many(concertAttendees),
  festivalAttendees: many(festivalAttendees),
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
  festivalSets: many(festivalSets),
  taggedPhotos:   many(photoArtists),
}));

export const eventSeriesRelations = relations(eventSeries, ({ one, many }) => ({
  concerts: many(concerts),
  venue: one(venues, { fields: [eventSeries.venueId], references: [venues.id] }),
  festivalAttendees: many(festivalAttendees),
  festivalSets: many(festivalSets),
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
  tags: many(concertTags),
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

export const festivalAttendeesRelations = relations(festivalAttendees, ({ one }) => ({
  user: one(users, { fields: [festivalAttendees.userId], references: [users.id] }),
  festival: one(eventSeries, {
    fields: [festivalAttendees.festivalId],
    references: [eventSeries.id],
  }),
}));

export const festivalSetsRelations = relations(festivalSets, ({ one }) => ({
  festival: one(eventSeries, {
    fields: [festivalSets.festivalId],
    references: [eventSeries.id],
  }),
  artist: one(artists, {
    fields: [festivalSets.artistId],
    references: [artists.id],
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

export const concertTagsRelations = relations(concertTags, ({ one }) => ({
  concert: one(concerts, { fields: [concertTags.concertId], references: [concerts.id] }),
  tag: one(tags, { fields: [concertTags.tagId], references: [tags.id] }),
  user: one(users, { fields: [concertTags.userId], references: [users.id] }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  concertTags: many(concertTags),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  createdBy: one(users, { fields: [invites.createdByUserId], references: [users.id] }),
  usedBy: one(users, { fields: [invites.usedByUserId], references: [users.id] }),
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
// Key/value store for editable website copy.  Managed by admin CMS at /app/admin/copy.
// Public read via GET /public/copy (no auth required).

export const siteCopy = pgTable("site_copy", {
  key:         text("key").primaryKey(),
  value:       text("value").notNull().default(""),
  description: text("description"),
  section:     text("section").notNull().default("general"),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
