-- Migration: setlist song cache keeps set boundaries
-- setlist_songs now caches setlist.fm songs; set_name marks which set or
-- encore a song belongs to ("Encore", "Encore 2", or a named set; null = main set).
-- Idempotent so it can be applied by hand like 0005–0009.

ALTER TABLE setlist_songs ADD COLUMN IF NOT EXISTS set_name text;
CREATE INDEX IF NOT EXISTS setlist_songs_setlist_idx ON setlist_songs (setlist_id, position);
