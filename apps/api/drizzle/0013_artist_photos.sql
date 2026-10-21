-- Migration: automatic artist photos
-- enriched_at: when the enrichment worker last looked this artist up, so the
--   hourly job moves through the list instead of retrying the same artists.
-- image_source: page the photo came from (Deezer / Wikimedia Commons), for credit.
-- Idempotent; apply by hand like 0005–0012.

ALTER TABLE artists ADD COLUMN IF NOT EXISTS enriched_at timestamp with time zone;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS image_source text;
