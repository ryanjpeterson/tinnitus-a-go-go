-- Migration: automatic setlist finder
-- One row per (show, artist) the worker has searched setlist.fm for, so a miss
-- isn't searched again every hour. Idempotent; apply by hand like 0005–0011.

CREATE TABLE IF NOT EXISTS setlist_lookups (
  concert_id      uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  artist_id       uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  attempts        integer NOT NULL DEFAULT 0,
  -- linked | no_match | taken (that setlist is already linked to another show)
  last_result     text,
  last_checked_at timestamp with time zone,
  PRIMARY KEY (concert_id, artist_id)
);
