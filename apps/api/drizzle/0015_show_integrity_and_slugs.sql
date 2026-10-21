-- 0015 — Show integrity and readable slugs.
--
--   1. A show is a festival day exactly when it belongs to a festival: `type`
--      is derived from `event_series_id` by a trigger and checked.
--   2. A festival has at most one day per date.
--   3. A festival's dates widen to cover its days; it takes its first day's
--      venue and year when it has none.
--   4. Lineups: role defaults to support; at most one headliner; a headliner
--      and co-headliners never share a lineup.
--   5. headliner_hint is maintained from the lineup (and artist renames).
--   6. Every show has a readable, unique slug: festival or headliner + date,
--      e.g. "foo-fighters-2011-09-10", "bluesfest-2025-2025-07-12".
--
-- Idempotent: safe to run more than once.

-- Same rules as slugify() in packages/shared.
CREATE OR REPLACE FUNCTION tagg_slugify(input text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT left(trim(both '-' from regexp_replace(
    lower(regexp_replace(normalize(coalesce(input, ''), NFKD), '[̀-ͯ]', '', 'g')),
    '[^a-z0-9]+', '-', 'g')), 96)
$$;

-- ── 4. Lineup roles ──────────────────────────────────────────────────────────

ALTER TABLE concert_artists ALTER COLUMN role SET DEFAULT 'support';
CREATE UNIQUE INDEX IF NOT EXISTS concert_artists_one_headliner_uq
  ON concert_artists (concert_id) WHERE role = 'headliner';

-- Checked at commit, so a lineup can be rewritten inside a transaction.
CREATE OR REPLACE FUNCTION concert_artists_check_billing() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM concert_artists WHERE concert_id = NEW.concert_id AND role = 'headliner')
     AND EXISTS (SELECT 1 FROM concert_artists WHERE concert_id = NEW.concert_id AND role = 'co_headliner') THEN
    RAISE EXCEPTION 'A lineup cannot have both a headliner and co-headliners (concert %)', NEW.concert_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS concert_artists_check_billing ON concert_artists;
CREATE CONSTRAINT TRIGGER concert_artists_check_billing
  AFTER INSERT OR UPDATE OF role ON concert_artists
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION concert_artists_check_billing();

-- ── 5. headliner_hint from the lineup ────────────────────────────────────────
-- The headliner; else the co-headliners joined with " & "; else the top of the
-- bill (same order as BILLING_ORDER_SQL in show-info.ts).

CREATE OR REPLACE FUNCTION concert_headliner_hint(cid uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    (SELECT a.name FROM concert_artists ca JOIN artists a ON a.id = ca.artist_id
      WHERE ca.concert_id = cid AND ca.role = 'headliner' LIMIT 1),
    (SELECT string_agg(a.name, ' & ' ORDER BY ca.set_order NULLS LAST, a.name)
       FROM concert_artists ca JOIN artists a ON a.id = ca.artist_id
      WHERE ca.concert_id = cid AND ca.role = 'co_headliner'),
    (SELECT a.name FROM concert_artists ca JOIN artists a ON a.id = ca.artist_id
      WHERE ca.concert_id = cid ORDER BY ca.set_order NULLS LAST, a.name LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION concert_artists_refresh_hint() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE concerts SET headliner_hint = concert_headliner_hint(OLD.concert_id)
     WHERE id = OLD.concert_id AND headliner_hint IS DISTINCT FROM concert_headliner_hint(OLD.concert_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE concerts SET headliner_hint = concert_headliner_hint(NEW.concert_id)
     WHERE id = NEW.concert_id AND headliner_hint IS DISTINCT FROM concert_headliner_hint(NEW.concert_id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS concert_artists_refresh_hint ON concert_artists;
CREATE TRIGGER concert_artists_refresh_hint
  AFTER INSERT OR UPDATE OR DELETE ON concert_artists
  FOR EACH ROW EXECUTE FUNCTION concert_artists_refresh_hint();

CREATE OR REPLACE FUNCTION artists_rename_refresh_hint() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE concerts c SET headliner_hint = concert_headliner_hint(c.id)
   WHERE c.id IN (SELECT concert_id FROM concert_artists WHERE artist_id = NEW.id)
     AND c.headliner_hint IS DISTINCT FROM concert_headliner_hint(c.id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS artists_rename_refresh_hint ON artists;
CREATE TRIGGER artists_rename_refresh_hint
  AFTER UPDATE OF name ON artists
  FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION artists_rename_refresh_hint();

-- ── 1 + 6. Type and slug, set on every show write ────────────────────────────

ALTER TABLE concerts ADD COLUMN IF NOT EXISTS slug text;

CREATE OR REPLACE FUNCTION concerts_derive() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  base text;
  candidate text;
  n int := 1;
BEGIN
  NEW.type := CASE WHEN NEW.event_series_id IS NULL THEN 'concert' ELSE 'festival_day' END;

  IF TG_OP = 'INSERT' OR NEW.slug IS NULL
     OR NEW.date IS DISTINCT FROM OLD.date
     OR NEW.event_series_id IS DISTINCT FROM OLD.event_series_id
     OR NEW.headliner_hint IS DISTINCT FROM OLD.headliner_hint
     OR NEW.venue_id IS DISTINCT FROM OLD.venue_id THEN
    base := coalesce(
      (SELECT slug FROM event_series WHERE id = NEW.event_series_id),
      nullif(tagg_slugify(NEW.headliner_hint), ''),
      (SELECT slug FROM venues WHERE id = NEW.venue_id),
      'show'
    ) || '-' || NEW.date::text;
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM concerts WHERE slug = candidate AND id <> NEW.id) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS concerts_derive ON concerts;
CREATE TRIGGER concerts_derive
  BEFORE INSERT OR UPDATE ON concerts
  FOR EACH ROW EXECUTE FUNCTION concerts_derive();

-- A renamed festival or venue renames the slugs built from it.
CREATE OR REPLACE FUNCTION event_series_reslug_days() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE concerts SET slug = NULL WHERE event_series_id = NEW.id;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS event_series_reslug_days ON event_series;
CREATE TRIGGER event_series_reslug_days
  AFTER UPDATE OF slug ON event_series
  FOR EACH ROW WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
  EXECUTE FUNCTION event_series_reslug_days();

CREATE OR REPLACE FUNCTION venues_reslug_shows() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE concerts SET slug = NULL
   WHERE venue_id = NEW.id AND event_series_id IS NULL AND headliner_hint IS NULL;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS venues_reslug_shows ON venues;
CREATE TRIGGER venues_reslug_shows
  AFTER UPDATE OF slug ON venues
  FOR EACH ROW WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
  EXECUTE FUNCTION venues_reslug_shows();

-- ── 3. Festival dates, venue and year follow its days ───────────────────────

CREATE OR REPLACE FUNCTION concerts_widen_festival() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.event_series_id IS NOT NULL THEN
    UPDATE event_series es SET
      start_date = least(coalesce(es.start_date, NEW.date), NEW.date),
      end_date   = greatest(coalesce(es.end_date, es.start_date, NEW.date), NEW.date),
      venue_id   = coalesce(es.venue_id, NEW.venue_id),
      year       = coalesce(es.year, extract(year FROM least(coalesce(es.start_date, NEW.date), NEW.date))::int)
    WHERE es.id = NEW.event_series_id
      AND (es.start_date IS NULL OR NEW.date < es.start_date
           OR NEW.date > coalesce(es.end_date, es.start_date)
           OR (es.venue_id IS NULL AND NEW.venue_id IS NOT NULL)
           OR es.year IS NULL);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS concerts_widen_festival ON concerts;
CREATE TRIGGER concerts_widen_festival
  AFTER INSERT OR UPDATE OF date, event_series_id, venue_id ON concerts
  FOR EACH ROW EXECUTE FUNCTION concerts_widen_festival();

-- ── Backfill, then lock in ───────────────────────────────────────────────────

-- Hints from the lineup (fixes support-only shows whose hint was the last-listed act).
UPDATE concerts c SET headliner_hint = concert_headliner_hint(c.id)
 WHERE c.headliner_hint IS DISTINCT FROM concert_headliner_hint(c.id);

-- Slugs, oldest show first so earlier shows keep the unsuffixed slug.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM concerts WHERE slug IS NULL ORDER BY date, created_at, id LOOP
    UPDATE concerts SET slug = NULL WHERE id = r.id;
  END LOOP;
END $$;

-- Festivals widened to their days (also fills missing venue/year).
UPDATE concerts SET date = date WHERE event_series_id IS NOT NULL;

ALTER TABLE concerts ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS concerts_slug_uq ON concerts (slug);

ALTER TABLE concerts DROP CONSTRAINT IF EXISTS concerts_festival_day_has_festival;
ALTER TABLE concerts ADD CONSTRAINT concerts_festival_day_has_festival
  CHECK ((type = 'festival_day') = (event_series_id IS NOT NULL));

-- ── 2. One day per festival date ─────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS concerts_festival_date_uq
  ON concerts (event_series_id, date) WHERE event_series_id IS NOT NULL;
