-- Venue aliases: alternative names for the same physical venue over time.
-- Alias slugs redirect to the canonical venue at the API level.

CREATE TABLE "venue_aliases" (
  "id"                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "canonical_venue_id"  uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  "name"                text NOT NULL,
  "slug"                text NOT NULL UNIQUE,
  "active_from"         date,
  "active_until"        date,
  "notes"               text,
  "created_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "venue_aliases_canonical_idx" ON "venue_aliases" ("canonical_venue_id");
CREATE INDEX "venue_aliases_slug_idx" ON "venue_aliases" ("slug");
