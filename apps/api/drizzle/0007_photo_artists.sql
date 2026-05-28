-- Photo-artist tagging: links photos to the artists who appear in them.

CREATE TABLE "photo_artists" (
  "photo_id"    uuid NOT NULL REFERENCES photos(id)   ON DELETE CASCADE,
  "artist_id"   uuid NOT NULL REFERENCES artists(id)  ON DELETE CASCADE,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("photo_id", "artist_id")
);

CREATE INDEX "photo_artists_photo_idx"  ON "photo_artists" ("photo_id");
CREATE INDEX "photo_artists_artist_idx" ON "photo_artists" ("artist_id");
