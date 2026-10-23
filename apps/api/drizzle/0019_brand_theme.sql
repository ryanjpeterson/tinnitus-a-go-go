-- 0019 — Storage for the brand theme.
--
-- The theme (accent / highlight / background / logo colours, uploaded logo
-- and favicon) is kept in site_copy, section 'theme'. site_copy came from
-- 0008, which was never applied on some installs — create it if missing
-- (without 0008's old landing-page text, which no page uses any more).
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS site_copy (
  key         text NOT NULL PRIMARY KEY,
  value       text NOT NULL DEFAULT '',
  description text,
  section     text NOT NULL DEFAULT 'general',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
