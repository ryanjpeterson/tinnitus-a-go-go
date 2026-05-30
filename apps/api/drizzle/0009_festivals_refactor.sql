-- Migration: Festivals Refactor
-- Festivals become first-class entities with their own venue, flyer, dates,
-- and sets/lineup separate from concerts.

-- ====== Extend event_series table ======
ALTER TABLE event_series ADD COLUMN venue_id uuid REFERENCES venues(id) ON DELETE SET NULL;
ALTER TABLE event_series ADD COLUMN start_date date;
ALTER TABLE event_series ADD COLUMN end_date date;
ALTER TABLE event_series ADD COLUMN flyer_key text;
ALTER TABLE event_series ADD COLUMN flyer_hash text;
ALTER TABLE event_series ADD COLUMN event_notes text;
ALTER TABLE event_series ADD COLUMN source_url text;
ALTER TABLE event_series ADD COLUMN updated_at timestamp with time zone DEFAULT now() NOT NULL;

-- Index for venue lookups
CREATE INDEX event_series_venue_idx ON event_series(venue_id);

-- ====== Create festival_attendees table ======
CREATE TABLE festival_attendees (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  festival_id uuid NOT NULL REFERENCES event_series(id) ON DELETE CASCADE,
  status attendance_status NOT NULL DEFAULT 'interested',
  personal_notes text,
  rating integer,
  ticket_price_paid integer,
  ticket_price_currency text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, festival_id)
);

-- Indexes for festival_attendees
CREATE INDEX festival_attendees_festival_status_idx ON festival_attendees(festival_id, status);
CREATE INDEX festival_attendees_user_status_idx ON festival_attendees(user_id, status);

-- ====== Create festival_sets table ======
CREATE TABLE festival_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL REFERENCES event_series(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  performance_date date,
  stage_name text,
  set_order integer,
  appearance_notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes for festival_sets
CREATE INDEX festival_sets_festival_idx ON festival_sets(festival_id);
CREATE INDEX festival_sets_artist_idx ON festival_sets(artist_id);
CREATE INDEX festival_sets_festival_date_idx ON festival_sets(festival_id, performance_date);

-- Unique constraint: same artist can't play same festival on same day twice
CREATE UNIQUE INDEX festival_sets_unique_artist_day ON festival_sets(festival_id, artist_id, performance_date)
  WHERE performance_date IS NOT NULL;
