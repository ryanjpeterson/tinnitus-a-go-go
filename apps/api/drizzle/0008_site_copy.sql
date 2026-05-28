-- Site copy table: stores all editable text content for the website.
-- Admin-only write access; public read via GET /public/copy.

CREATE TABLE "site_copy" (
  "key"         text NOT NULL PRIMARY KEY,
  "value"       text NOT NULL DEFAULT '',
  "description" text,
  "section"     text NOT NULL DEFAULT 'general',
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

-- Seed defaults — all current hardcoded copy from LandingPage and public pages.
INSERT INTO "site_copy" ("key", "section", "value", "description") VALUES
  ('landing.tagline',          'landing', 'Your ears gave up. We kept notes.',                                                              'Hero tagline — one-liner above the description'),
  ('landing.description',      'landing', 'Every concert survived, every opener ignored, every ticket stub currently disintegrating in a jacket pocket — all of it, here, with star ratings. Self-hosted. Invite-only. No ads, no algorithm, and absolutely no warranty against further hearing loss. Just',  'Hero description paragraph (ends before the show count)'),
  ('landing.description_suffix','landing', 'shows and a faint ringing that your doctor says is totally fine.',                              'Hero description suffix (comes after the show count)'),
  ('landing.stat_attended',    'landing', 'attended',                                                                                      'Stat strip label for attended count'),
  ('landing.stat_other',       'landing', 'pending / other',                                                                               'Stat strip label for non-attended count'),
  ('landing.stat_artists',     'landing', 'artists subjected to',                                                                          'Stat strip label for artist count'),
  ('landing.stat_years',       'landing', 'years of questionable decisions',                                                               'Stat strip label for years count'),
  ('landing.loading',          'landing', 'Scanning the damage…',                                                                          'Loading spinner text'),
  ('landing.error',            'landing', 'Couldn''t load the log. The ringing continues regardless.',                                     'Error message when concert list fails to load'),
  ('landing.empty',            'landing', 'Nothing matches. Apparently even your concert history has taste.',                              'Empty state message when filters return nothing'),
  ('landing.footer',           'landing', 'invite-only · ask someone who already has tinnitus',                                            'Footer tagline on landing page'),
  ('site.name',                'general', 'Tinnitus A Go Go',                                                                              'Site name — used in page titles and meta tags');
