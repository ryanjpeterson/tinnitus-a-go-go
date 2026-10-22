-- 0018 — Shows join and leave festivals freely.
--
--   * A festival can have several shows on the same date (each logged set
--     stays its own show); the festival groups them by date into days.
--   * A show joining a festival takes the festival's venue if it has none.
--     A second show on a festival date gets the headliner in its slug
--     ("bluesfest-2025-pixies-2025-07-12").
--   * Festival suggestions can be dismissed (duplicate_dismissals takes 'festival').
--   * A festival that loses its last show is removed. If that show has no
--     flyer of its own it takes the festival's; otherwise the festival's flyer
--     file is queued in storage_orphans for the API to delete from storage.
--
-- Idempotent: safe to run more than once.

DROP INDEX IF EXISTS concerts_festival_date_uq;
CREATE INDEX IF NOT EXISTS concerts_festival_date_idx
  ON concerts (event_series_id, date) WHERE event_series_id IS NOT NULL;

-- "Not a festival" dismissals of festival suggestions share the duplicates table.
ALTER TABLE duplicate_dismissals DROP CONSTRAINT IF EXISTS duplicate_dismissals_entity_type_check;
ALTER TABLE duplicate_dismissals ADD CONSTRAINT duplicate_dismissals_entity_type_check
  CHECK (entity_type IN ('venue', 'artist', 'festival'));

-- Storage objects no longer referenced by any row, for the API to delete.
CREATE TABLE IF NOT EXISTS storage_orphans (
  key        text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Type, venue inheritance and slug, set on every show write.
CREATE OR REPLACE FUNCTION concerts_derive() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  base text;
  candidate text;
  n int := 1;
BEGIN
  NEW.type := CASE WHEN NEW.event_series_id IS NULL THEN 'concert' ELSE 'festival_day' END;

  -- Joining a festival: no venue of its own → the festival's.
  IF NEW.event_series_id IS NOT NULL AND NEW.venue_id IS NULL THEN
    NEW.venue_id := (SELECT venue_id FROM event_series WHERE id = NEW.event_series_id);
  END IF;

  IF TG_OP = 'INSERT' OR NEW.slug IS NULL
     OR NEW.date IS DISTINCT FROM OLD.date
     OR NEW.event_series_id IS DISTINCT FROM OLD.event_series_id
     OR NEW.headliner_hint IS DISTINCT FROM OLD.headliner_hint
     OR NEW.venue_id IS DISTINCT FROM OLD.venue_id THEN
    IF NEW.event_series_id IS NOT NULL THEN
      base := (SELECT slug FROM event_series WHERE id = NEW.event_series_id);
      -- Another set already holds this festival date: name this one by its headliner.
      IF EXISTS (SELECT 1 FROM concerts c WHERE c.event_series_id = NEW.event_series_id
                   AND c.date = NEW.date AND c.id <> NEW.id
                   AND c.slug = base || '-' || NEW.date::text)
         AND nullif(tagg_slugify(NEW.headliner_hint), '') IS NOT NULL THEN
        base := base || '-' || tagg_slugify(NEW.headliner_hint);
      END IF;
    ELSE
      base := coalesce(
        nullif(tagg_slugify(NEW.headliner_hint), ''),
        (SELECT slug FROM venues WHERE id = NEW.venue_id),
        'show'
      );
    END IF;
    base := coalesce(base, 'show') || '-' || NEW.date::text;
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM concerts WHERE slug = candidate AND id <> NEW.id) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END $$;

-- An emptied festival goes away.
CREATE OR REPLACE FUNCTION concerts_remove_empty_festival() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  fk text;
  fh text;
BEGIN
  -- Only direct changes: not the FK's own SET NULL while a festival is being
  -- deleted, and not this trigger's own flyer hand-over.
  IF pg_trigger_depth() > 1 OR OLD.event_series_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.event_series_id IS NOT DISTINCT FROM OLD.event_series_id THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM concerts WHERE event_series_id = OLD.event_series_id) THEN
    RETURN NULL;
  END IF;

  SELECT flyer_key, flyer_hash INTO fk, fh FROM event_series WHERE id = OLD.event_series_id;
  IF fk IS NOT NULL THEN
    IF TG_OP = 'UPDATE' AND NEW.flyer_key IS NULL THEN
      UPDATE concerts SET flyer_key = fk, flyer_hash = fh WHERE id = NEW.id;
    ELSE
      INSERT INTO storage_orphans (key) VALUES (fk) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  DELETE FROM event_series WHERE id = OLD.event_series_id;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS concerts_remove_empty_festival ON concerts;
CREATE TRIGGER concerts_remove_empty_festival
  AFTER UPDATE OF event_series_id OR DELETE ON concerts
  FOR EACH ROW EXECUTE FUNCTION concerts_remove_empty_festival();
