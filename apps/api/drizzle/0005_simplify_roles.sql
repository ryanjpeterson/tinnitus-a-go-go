-- Collapse 'opener' and 'festival_set' into 'support'
-- Postgres can't drop enum values directly, so we recreate the type.

-- Step 1: migrate data
UPDATE concert_artists SET role = 'support' WHERE role IN ('opener', 'festival_set');

-- Step 2: rename old type out of the way
ALTER TYPE concert_artist_role RENAME TO concert_artist_role_old;

-- Step 3: create the new type with only three values
CREATE TYPE concert_artist_role AS ENUM ('headliner', 'co_headliner', 'support');

-- Step 4: drop the column default so the type cast doesn't fail
ALTER TABLE concert_artists ALTER COLUMN role DROP DEFAULT;

-- Step 5: update the column (cast through text)
ALTER TABLE concert_artists
  ALTER COLUMN role TYPE concert_artist_role
  USING role::text::concert_artist_role;

-- Step 6: restore the column default with the new type
ALTER TABLE concert_artists ALTER COLUMN role SET DEFAULT 'headliner'::concert_artist_role;

-- Step 7: drop the old type
DROP TYPE concert_artist_role_old;
