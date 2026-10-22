-- 0017 — Which push notifications each user wants.
--
--   tonight        day of a show you're attending
--   howWasIt       the morning after, if it's still marked attending
--   anniversaries  N years ago today, for shows you attended
--
-- All on by default. Idempotent.

ALTER TABLE users ADD COLUMN IF NOT EXISTS push_prefs jsonb NOT NULL
  DEFAULT '{"tonight": true, "howWasIt": true, "anniversaries": true}'::jsonb;
