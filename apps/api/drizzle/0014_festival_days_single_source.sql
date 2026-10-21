-- 0014 — Festival days are the single source for festival lineups and attendance.
--
-- A festival (event_series) is a container; each of its days is a show
-- (concerts.type = 'festival_day') with its own lineup (concert_artists) and
-- attendance (concert_attendees). festival_sets and festival_attendees held a
-- second copy of the same data and are retired here.
--
-- Idempotent: safe to run more than once. Anything only the old tables knew is
-- carried onto the days before they are dropped.

-- Stage moves onto the day's artist row.
ALTER TABLE concert_artists ADD COLUMN IF NOT EXISTS stage_name text;

DO $$
BEGIN
  IF to_regclass('public.festival_sets') IS NOT NULL THEN
    -- A day show for every (festival, date) that has sets but no day yet.
    INSERT INTO concerts (date, type, venue_id, event_series_id)
    SELECT DISTINCT fs.performance_date, 'festival_day'::concert_type, es.venue_id, fs.festival_id
    FROM festival_sets fs
    JOIN event_series es ON es.id = fs.festival_id
    WHERE fs.performance_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM concerts c
        WHERE c.event_series_id = fs.festival_id AND c.type = 'festival_day' AND c.date = fs.performance_date
      );

    -- Sets missing from their day's lineup.
    INSERT INTO concert_artists (concert_id, artist_id, role, set_order, appearance_notes, stage_name)
    SELECT DISTINCT ON (c.id, fs.artist_id) c.id, fs.artist_id, 'support'::concert_artist_role, fs.set_order, fs.appearance_notes, fs.stage_name
    FROM festival_sets fs
    JOIN concerts c ON c.event_series_id = fs.festival_id AND c.type = 'festival_day' AND c.date = fs.performance_date
    ORDER BY c.id, fs.artist_id, fs.set_order
    ON CONFLICT (concert_id, artist_id) DO NOTHING;

    -- Stage and notes the day rows don't have yet.
    UPDATE concert_artists ca
    SET stage_name = COALESCE(ca.stage_name, fs.stage_name),
        appearance_notes = COALESCE(ca.appearance_notes, fs.appearance_notes)
    FROM festival_sets fs
    JOIN concerts c ON c.event_series_id = fs.festival_id AND c.type = 'festival_day' AND c.date = fs.performance_date
    WHERE ca.concert_id = c.id AND ca.artist_id = fs.artist_id
      AND (fs.stage_name IS NOT NULL OR fs.appearance_notes IS NOT NULL);
  END IF;

  IF to_regclass('public.festival_attendees') IS NOT NULL THEN
    -- Festival-level attendance becomes attendance on each day that has none.
    INSERT INTO concert_attendees (user_id, concert_id, status, personal_notes, ticket_price_paid, ticket_price_currency)
    SELECT fa.user_id, c.id, fa.status, fa.personal_notes, fa.ticket_price_paid, fa.ticket_price_currency
    FROM festival_attendees fa
    JOIN concerts c ON c.event_series_id = fa.festival_id AND c.type = 'festival_day'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

DROP TABLE IF EXISTS festival_sets;
DROP TABLE IF EXISTS festival_attendees;
