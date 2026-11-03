-- 0020 — One account, and ntfy + email notifications.
--
--   * signup, invites and email verification are gone: the app has a single
--     admin account, created on the setup page on first run
--   * users.notify_prefs: what the worker sends you and when (missing keys
--     fall back to the defaults in code)
--   * notifications_sent: each reminder / weekly recap goes out once
--   * removed: the Web Push leftovers 0016–0017 kept (push_subscriptions,
--     push_sent, app_secrets, users.push_prefs)
--
-- Other accounts, if any, are left alone — delete them by hand if you want
-- (their attendance rows go with them):
--   DELETE FROM users WHERE NOT is_admin;
--
-- Idempotent: safe to run more than once.

ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS notifications_sent (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key     text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- ── Removed: signup, invites, email verification ────────────────────────────

DROP TABLE IF EXISTS invites;
DROP TABLE IF EXISTS email_verification_tokens;
ALTER TABLE users DROP COLUMN IF EXISTS invites_remaining;
ALTER TABLE users DROP COLUMN IF EXISTS invited_by_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;

-- ── Removed: Web Push leftovers ─────────────────────────────────────────────

DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS push_sent;
DROP TABLE IF EXISTS app_secrets;
ALTER TABLE users DROP COLUMN IF EXISTS push_prefs;
