-- 0016 — Festival brands, calendar feed, push notifications, and cleanup.
--
--   * event_series.brand: the festival across years ("Bluesfest"), filled for
--     new festivals by a trigger; festival names made consistent
--   * users.calendar_token: secret for the private calendar-feed URL
--   * push_subscriptions / push_sent / app_secrets: Web Push
--   * removed (unused): event_series.image_key, concert_attendees.rating and
--     rsvp_at, tags / concert_tags, the "dismissed" attendance status
--
-- Idempotent: safe to run more than once.

-- ── Festival brands and names ────────────────────────────────────────────────

ALTER TABLE event_series ADD COLUMN IF NOT EXISTS brand text;

-- "Ottawa Bluesfest 2023" → "Bluesfest 2023", matching the later editions.
UPDATE event_series es SET name = regexp_replace(es.name, '^Ottawa Bluesfest (\d{4})$', 'Bluesfest \1')
 WHERE es.name ~ '^Ottawa Bluesfest \d{4}$'
   AND NOT EXISTS (SELECT 1 FROM event_series o WHERE o.name = regexp_replace(es.name, '^Ottawa Bluesfest (\d{4})$', 'Bluesfest \1'));

-- Editions named without their year get it ("Riot Fest" → "Riot Fest 2014");
-- names ending in an edition number ("Darbyfest III") are left alone.
UPDATE event_series SET name = name || ' ' || year
 WHERE year IS NOT NULL AND name !~ '\d{4}' AND name !~ '\s[IVXLC]+$';

CREATE OR REPLACE FUNCTION festival_brand(name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(trim(regexp_replace(coalesce(name, ''), '\s+(\d{4}|[IVXLC]+)$', '')), '')
$$;

UPDATE event_series SET brand = festival_brand(name) WHERE brand IS NULL;

CREATE OR REPLACE FUNCTION event_series_fill_brand() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.brand IS NULL OR NEW.brand = '' THEN
    NEW.brand := festival_brand(NEW.name);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS event_series_fill_brand ON event_series;
CREATE TRIGGER event_series_fill_brand
  BEFORE INSERT OR UPDATE OF name, brand ON event_series
  FOR EACH ROW EXECUTE FUNCTION event_series_fill_brand();

CREATE INDEX IF NOT EXISTS event_series_brand_idx ON event_series (lower(brand));

-- ── Calendar feed ────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_token text;
CREATE UNIQUE INDEX IF NOT EXISTS users_calendar_token_unique ON users (calendar_token);

-- ── Push notifications ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS push_sent (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, concert_id, kind)
);

CREATE TABLE IF NOT EXISTS app_secrets (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Removed: unused columns, tables and status ──────────────────────────────

ALTER TABLE event_series DROP COLUMN IF EXISTS image_key;
ALTER TABLE concert_attendees DROP COLUMN IF EXISTS rating;
ALTER TABLE concert_attendees DROP COLUMN IF EXISTS rsvp_at;
DROP TABLE IF EXISTS concert_tags;
DROP TABLE IF EXISTS tags;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'attendance_status' AND e.enumlabel = 'dismissed') THEN
    UPDATE concert_attendees SET status = 'missed' WHERE status = 'dismissed';
    ALTER TYPE attendance_status RENAME TO attendance_status_old;
    CREATE TYPE attendance_status AS ENUM ('interested', 'attending', 'attended', 'missed', 'cancelled');
    ALTER TABLE concert_attendees ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE concert_attendees ALTER COLUMN status TYPE attendance_status USING status::text::attendance_status;
    ALTER TABLE concert_attendees ALTER COLUMN status SET DEFAULT 'interested';
    DROP TYPE attendance_status_old;
  END IF;
END $$;
