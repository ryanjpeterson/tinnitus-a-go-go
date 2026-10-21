-- Migration: admin data cleanup (duplicate merges with undo)
-- Idempotent so it can be applied by hand like 0005–0010.

-- One row per merge: the removed record and everything that moved, so the
-- merge can be undone exactly.
CREATE TABLE IF NOT EXISTS merge_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   text NOT NULL CHECK (entity_type IN ('venue', 'artist')),
  kept_id       uuid NOT NULL,
  removed_id    uuid NOT NULL,
  kept_name     text NOT NULL,
  removed_name  text NOT NULL,
  snapshot      jsonb NOT NULL,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  undone_at     timestamp with time zone
);
CREATE INDEX IF NOT EXISTS merge_log_created_idx ON merge_log (created_at DESC);

-- Pairs an admin marked "not a duplicate" (id_a < id_b), hidden from suggestions.
CREATE TABLE IF NOT EXISTS duplicate_dismissals (
  entity_type text NOT NULL CHECK (entity_type IN ('venue', 'artist')),
  id_a        uuid NOT NULL,
  id_b        uuid NOT NULL,
  created_at  timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, id_a, id_b)
);
