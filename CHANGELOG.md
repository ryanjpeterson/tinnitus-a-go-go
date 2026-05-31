# Changelog

All notable changes to Tinnitus A Go Go.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: CalVer (`YYYY.MM.PATCH`). Dates are local to the maintainer.

## [Unreleased]

### Added — Last.fm artist enrichment, URL import for photos, artist stats improvements

- **Last.fm artist enrichment** — automatic fetch of bio, genre, and MusicBrainz ID from Last.fm. New env var `LASTFM_API_KEY` (optional). Artist edit form gains a "Fetch from Last.fm" button for immediate enrichment. A scheduled worker automatically enriches 50 artists per hour that are missing bio or image. Note: Last.fm no longer provides artist images (all are placeholders); Spotify fallback planned for future.
- **URL import for venue photos** — venue edit form now has Upload/URL/Remove buttons for cover photo (consistent with artist images and festival flyers). Paste an image URL instead of uploading a file.
- **URL import for artist images** — artist edit form now has Upload/URL/Remove buttons for artist image. Same flow as venues and festival flyers.
- **Artist stats: attended-only first/last seen** — artist page `firstSeen` and `lastSeen` dates now count only shows with `attended` status. Shows marked interested/attending display as "Playing [venue] on [date]" instead of inflating the seen count.
- **New API endpoints:**
  - `POST /artists/:slug/enrich` — fetch from Last.fm immediately
  - `POST /artists/:slug/enrich/queue` — queue for background enrichment
  - `POST /artists/enrich/bulk` — queue all artists missing bio/image
  - `POST /artists/:slug/image/url` — import image from URL
  - `DELETE /artists/:slug/image` — remove artist image
  - `POST /venues/:slug/photo/url` — import cover photo from URL
  - `DELETE /venues/:slug/photo` — remove venue cover photo

### Added / Changed — Stats polish, consistent index cards, home tile fixes

- **Home "Attended" tile** — "Shows logged" renamed to **Attended**; the value now shows the attended count (lime) and the sub-line shows total logged. Clicking navigates to `?status=attended`. Previously this tile navigated to all concerts and showed a less actionable number.
- **Status breakdown removed (Stats page)** — the status donut chart and `StatusDonut` component are gone. The "Activity by year" section is now full-width.
- **"On This Day" uses local browser time** — the frontend passes `?localDate=YYYY-MM-DD` (using the browser's local calendar date via `toLocaleDateString("en-CA")`) so "On This Day" shows shows from the correct date regardless of where the server is hosted. The API accepts and validates this param, falling back to server date if absent or malformed.
- **Milestones "Untitled show" fixed** — the milestones SQL now coalesces `headliner_hint` with the first headliner artist name (then any artist name) so milestone shows without a cached hint no longer appear as "Untitled show". Same fix applied to the "On This Day" query.
- **Consistent index cards** — Artists, Venues, and Festivals pages now all use a shared `EntityCard` component (`src/components/EntityCard.tsx`). Same border, hover, image-or-initials, and text layout across all three. Festivals changed from a list of rows to a 2–4 column card grid with yellow initials placeholder, matching the visual language of Artists and Venues.

### Added / Changed — New logo, video uploads, progress overlay, home page fixes

- **New logo** — replaced Metal Mania + Grenze Gotisch text-based wordmark with the Illustrator-exported vector logo (`tagg-logo.svg`). `Wordmark.tsx` embeds the paths directly; no Google Fonts required for the logo. Metal Mania and Grenze Gotisch removed from the Google Fonts link in `index.html`. Favicon updated to the new wordmark.
- **Home page "Watchlist" tile** — replaced the broken "Photos" tile (which did nothing) with a **Watchlist** tile showing the `interested` count in purple. Clicking it navigates to `?status=interested`. Tile value colour now reflects its accent (lime/yellow/purple).
- **Status breakdown removed** — the row of clickable count badges (Attended / Attending / Interested / Missed) at the top of the concerts list has been removed. The "+ Add show" and "Export CSV ↓" buttons that were in that strip are now in the main toolbar row alongside the filter tabs, search, and sort controls.

### Added — Video upload support + upload progress overlay

- **Video uploads** — photos, videos, and reels (MP4, MOV, WebM) can now be uploaded from concert detail pages. The backend already transcoded video to H.264 MP4 + WebP poster frame; the missing plumbing is now wired end-to-end:
  - API `MAX_VIDEO_BYTES` raised to **500 MB** (images stay capped at 30 MB); per-type enforcement happens after buffering.
  - `video/webm` added to allowed MIME types (`.webm` extension).
  - `resolveUrls()` now exposes the transcoded `video` key so the lightbox plays the H.264 variant instead of the raw original.
  - `PhotoItem.urls.video` field added to the frontend type.
  - Lightbox uses `urls.video ?? urls.original` for video items; adds `poster` (WebP thumb) and `autoPlay`.
  - "Upload by artist" zones now accept video MIME types (`mp4`, `quicktime`, `webm`).
  - Section header "Photos" renamed to **"Media"**; upload button "+ Add photo" renamed to **"+ Add media"** throughout.
- **Upload progress overlay** — a full-screen modal overlay (z-60, blurred backdrop) appears during any upload (main gallery or per-artist zone) and blocks all interaction until the upload completes. Shows a spinning ring, live `N%` percentage, and an animated progress bar driven by XHR `upload.progress` events. `api.uploadPhoto` now uses `XMLHttpRequest` instead of `fetch` to enable real upload progress tracking.

### Added / Changed — QoL sweep, status polish, lightbox navigation

- **Lightbox keyboard navigation** — Escape closes the photo lightbox; ← / → arrow keys step through photos in sequence; prev/next chevron buttons visible when applicable; current position counter ("3 / 12") shown at top.
- **Status colours applied consistently** — every view that shows attendance status now uses the correct colour for each state (lime/yellow/purple/red). Previously missed locations fixed: `VenuePage`, `ArtistPage`, `ConcertsPage` stats strip and status tab bar, `AddConcertModal` status picker, `ConcertDetailPage` status chip, `FollowUpPrompt` "Missed" button, `AppShell` dashboard "Upcoming" tile.
- **Per-status active tabs** — the status filter tabs in `ConcertsPage` now each highlight in their own colour when active (lime for Attended, yellow for Attending, purple for Interested, red for Missed) instead of always lime.
- **AddConcertModal status picker** — each status button now highlights in its own accent colour when selected (yellow for Attending, purple for Interested, lime for Attended, red for Missed).
- **Status labels capitalised** — all bare `{status}` strings replaced with proper labels ("Attended", "Attending", "Interested", "Missed", "Cancelled", "Dismissed") in `ConcertDetailPage`, `ArtistPage`, and `VenuePage`.
- **Festival badge colour** — the "festival" overlay badge on concert cards changed from pink to yellow (matches the festival-day theme, not an error state).
- **FlyerPlaceholder per-status tint** — concert cards without a flyer now use a faint tint matching the attendance status (lime for attended, yellow for attending, purple for interested, red for missed) instead of always lime.
- **Festival series name on concert cards** — festival/series name shown in yellow monospace below the headliner on cards in `ConcertsPage`; hidden for regular concerts.
- **Event series name fallback** — all "Unknown" show labels across `ConcertsPage`, `ConcertDetailPage`, `FollowUpPrompt`, and `VenuePage` now fall back to the event series name before giving up.
- **FestivalsPage hover** — festival list cards use `hover:border-accent-lime` instead of `hover:border-accent-pink`.
- **Event series labels** — event series / festival name in `ArtistPage` and `VenuePage` concert history changed from `text-accent-pink` (looked like an error) to `text-text-subtle italic`.
- **Keyboard `Escape` for modals** — `AddConcertModal` and `FollowUpPrompt` now listen for `Escape` and dismiss when pressed.
- **Dashboard tile** — "Upcoming" tile now uses yellow hover border instead of pink, consistent with the attending status colour.
- **Version bump** — app footer updated to `v2026.05.27`.
- **Type cleanup** — `ConcertGridPage` row type no longer carries the removed `rating` / `_origRating` fields.

### Added / Changed — Logo · Status colors · Per-artist uploads · Tailscale · Stats revamp · Ratings removed

- **New logo design** — "TINNITUS" now uses Metal Mania (horror/punk font via Google Fonts) and "a-go-go" uses Grenze Gotisch in red. `Wordmark.tsx` renders an inline SVG so the fonts load from the page's Google Fonts link; all instances still use `<Wordmark svg />` — no call-site changes required.
- **Nav renamed** — "The log" navigation label and all breadcrumbs renamed to **"The Damage"** across the entire app.
- **Status colour system** — attendance statuses now have a consistent, distinct colour identity: **attended = lime**, **attending = yellow**, **interested = purple**, **missed = red**; cancelled and dismissed remain muted grey. Updated everywhere: `ConcertsPage`, `ConcertDetailPage`, `ConcertGridPage`, `PublicConcertPage`, `LandingPage`, `StatsPage`.
- **Ratings removed** — rating field removed from the UI throughout (attendance editor, grid editor, public detail page, stats page). The DB column is preserved; no migration needed.
- **Per-artist photo uploads** — a new "Upload by artist" panel appears below the photo gallery on each concert detail page. Each artist in the lineup gets their own drag-and-drop / click-to-upload zone. Photos uploaded via an artist's zone are automatically tagged to that artist via `PUT /photos/:id/artists`. The main gallery and tag-by-artist mode remain available alongside this feature.
- **Stats page revamp** — top artists and venues now display as numbered card grids (rank badge + name + year range / city + show count) instead of horizontal bars; top 3 get medal colours (lime #1, cyan #2, pink #3). Day-of-week and month-of-year bar charts are 2× taller. The density heatmap uses more compact cells. Rating distribution section removed. Avg rating tile removed. Series/event name used as fallback for "Untitled show" when `headliner_hint` is null (on-this-day + milestones). API queries updated to join `event_series` for `series_name`.
- **Tailscale / remote access** — `docker-compose.tailscale.yml` overlay added; `pnpm dev:tailscale` script added; `.env.example` annotated with `CORS_ORIGINS` and `MINIO_PUBLIC_URL` instructions for Tailnet access from macmini / macbookair.

### Added — Stats page

- **Stats page** (`/app/stats`) — full personal analytics dashboard powered by a new `GET /concerts/deep-stats` endpoint. All charts are custom CSS/SVG — no chart library dependency.
  - **Overview tiles** — shows logged, attended, unique artists seen, venues visited, years active, avg rating
  - **On This Day** — accent-pink card shown when you have shows on today's date in previous years; links to public show pages with "X years ago" labels
  - **Activity by year** — stacked horizontal bar chart; lime = attended, greyed = total logged; avg rating per year
  - **Year × month heatmap** — GitHub-contribution-style grid; opacity scales with show count; hover for exact count
  - **Day of week + Month of year** — mini vertical bar charts showing when you tend to go out
  - **Top 20 artists** — horizontal bars with avg rating badge; top 3 highlighted lime, rest in muted grey; links to artist pages
  - **Top 15 venues** — same treatment in accent-pink for top 3; links to venue pages
  - **Rating distribution** — vertical bars 1–10; green = 8–10, red = 1–4
  - **Status donut** — SVG `stroke-dasharray` ring chart with legend
  - **Ticket prices** — average + most expensive show with a link
  - **Milestones** — vertical timeline of the 1st, 5th, 10th, 25th, 50th, 100th, 200th, 500th attended show; each links to the public show page
- **API: `GET /concerts/deep-stats`** — runs ~8 queries in parallel via `Promise.all`; requires auth; scoped strictly to the requesting user

### Changed — Co-headliner display · top-billing exclusivity rule

- **Co-headliner headers** — concert titles now show all co-headliners joined with " & " (e.g. "Band A & Band B") in `ConcertDetailPage` and `PublicConcertPage`. The landing page list rows do the same for the primary headline, and the secondary support line no longer re-lists co-headliners (they're already in the headline).
- **Top-billing exclusivity enforced** — a lineup cannot mix `headliner` and `co_headliner` roles simultaneously; they represent different promotional arrangements:
  - **Frontend auto-correction** in `LineupEditor`: changing an artist *to* `headliner` auto-demotes any existing `co_headliner`s to `support`; changing *to* `co_headliner` converts any existing `headliner` to `co_headliner`. Same cascade applies when adding a new artist. A pure `enforceTopBilling()` helper function handles both directions.
  - **Server-side validation**: `PUT /concerts/:id/artists` now returns HTTP 422 if the submitted lineup mixes both roles.
- **`headlinerHint` sync for co-headliners** — when a concert has co-headliners, the `concerts.headliner_hint` column (used by fast list queries) is now set to all co-headliner names joined with " & " rather than only the first one.
- **★ star marker extended** — the lineup star badge in `LineupEditor` read mode and edit mode now appears on `co_headliner` artists as well as `headliner`.

### Added — CMS copy editor · SVG logo everywhere · Decade year filter · Poster layout

- **CMS copy editor** (`/app/admin/copy`) — admin-only UI for editing all website text in one place. Text is stored in a new `site_copy` Postgres table (migration `0008_site_copy.sql`) with key, value, description, and section columns. Every key ships with a seed default so the site works immediately after migration. Edit any row inline; save invalidates the React Query cache so changes appear on the landing page without a full reload. Accessible via "→ Copy editor" in the admin section of the app home.
- **API: site copy routes** — `GET /public/copy` (no auth) returns `{ copy: Record<string, string> }` consumed by the `useCopy` / `useCopyValue` React hooks. `GET /admin/copy` and `PATCH /admin/copy/:key` are admin-gated and used by the CMS editor.
- **`useCopy` / `useCopyValue` hooks** (`apps/web/src/lib/useCopyValue.ts`) — share a single React Query cache entry (`["public/copy"]`), so the whole app makes one copy-fetch per page load. Landing page now reads all its copy from this hook with hardcoded fallbacks.
- **SVG logo everywhere** — `svg` prop added to every remaining `<Wordmark>` usage across `LoginPage`, `SignupPage`, `VerifyEmailPage`, `ImportsPage`, and `LandingPage` hero. The CSS text wordmark is now completely replaced by the SVG ear-glyph + ransom-note tiles logo on all pages.
- **Landing page — years grouped by decade** — the year filter now shows decade labels ("2020s", "2010s", …) with each decade's year pills inline. The flat horizontally-scrollable single row is gone; this scales cleanly to many years without horizontal overflow.
- **Public concert page — poster on left** — when a flyer is present, `/shows/:id` now uses a two-column layout with the flyer image sticky on the left and all concert details (lineup, venue, attendance, notes) on the right, matching the auth'd `ConcertDetailPage` layout. Pages without a flyer remain single-column.

### Changed — Brand colours · Landing page polish · Branding

- **Lighter base background** — `bg` token lifted from `#0B0B0C` to `#141416` so the app sits at a warm charcoal rather than a void. `surface`, `surface-2`, and `border` all nudged upward proportionally. `globals.css` body gradient and `::selection` updated to match. AG-Grid theme variables and Google Maps dark-style palette updated to stay consistent with the new scale.
- **Landing page redesign** — copy rewritten to be appropriately self-aware about hearing loss ("Your ears gave up. We kept notes."). Year filter now shows every year with data (was capped at 8). Status filters capitalized ("Attended", "Missed", etc.) with colour-coded active states; "Any status" renamed to "Show All". Pagination added at 40 shows per page with smart ellipsis range. Logo SVG rendered in nav bar. Loading/empty states given more personality.
- **Brand colours standardised** — all hardcoded hex values in `VenueMap.tsx` dark-style array and `ConcertGridPage.tsx` AG-Grid CSS variables replaced with values from the shared colour scale.

### Added — Public log · Full grid editing · Artist expand rows

- **Public landing page** — the home page (`/`) now shows the full concert log to unauthenticated visitors. Fetches from the new `GET /public/concerts` endpoint (no auth). Shows date, headliner + support acts, venue · city, status badge, and rating for every show. Filterable by year, status, and text search. Branded with the app's dark style and accent colours. Links to `/shows/:id` public concert detail pages.
- **Public concert detail page** (`/shows/:id`) — full read-only view of a single concert: full lineup with roles, venue with compact map, attendance (status, rating, ticket cost), personal notes, and flyer. Visible to unauthenticated visitors. Logged-in users get an "edit in my log" link that jumps directly to the auth'd detail page.
- **`GET /public/concerts`** and **`GET /public/concerts/:id`** — new unauthenticated API routes. Return concerts with artists, venue, and first attendee's attendance data (status, rating, personalNotes, ticket price). No session required.
- **Grid editor — all fields editable** — `date`, `venueName`, `venueCity`, and `concertType` are now editable in the grid alongside the existing attendance fields. Click any cell to edit in place. Venue + city grouped under a "Venue" column header group; ticket price + currency grouped under "Ticket".
- **Grid editor — artist expand rows** — each concert row shows a `▸ N` expand button (where N = artist count). Clicking it inserts full-width artist sub-rows immediately below the concert via `applyTransaction`. Supports expand/collapse per concert. A `postSortRows` hook ensures artist rows always follow their parent when sorting. Artist rows are styled distinctly and are not editable (use the concert detail page for lineup editing).
- **Batch PATCH extended** — `PATCH /concerts/batch` now accepts concert-level fields (`date`, `type`, `venueName`, `venueCity`) in addition to existing attendance fields. Venue upserts run inside the transaction per update item.

### Added — Photo-artist tagging · Google Maps · Drag-and-drop uploads

- **Photo-artist tagging** — tag artists in concert photos with an iPhone-style multi-select UX.
  - New `photo_artists` junction table (migration `0007_photo_artists.sql`) with a composite PK and indexed FK columns.
  - `PUT /photos/:id/artists` — replaces all artist tags on a photo atomically; validates artistIds against the DB; attendee-or-admin gate.
  - `GET /photos/:id/artists` — returns artists currently tagged in a photo.
  - `GET /artists/:slug/photos` — returns all photos tagged with this artist that belong to concerts the current user attended, with concert + venue context; ordered newest concert first.
  - **Concert detail — "⊕ Tag artists" mode** — button appears when there are both photos and lineup artists. Entering tagging mode loads all existing tags for the gallery's photos. An artist selector (concert lineup) sits above the grid; tap photos to toggle checkmark overlays; "Tag N photos" assigns that artist and clears the selection so you can do another pass. Existing tags shown as initials badges at the bottom of each thumbnail; click a badge to remove that artist's tag. "Done tagging" exits the mode.
  - **Artist detail — Photos section** — new section below the concerts list shows all photos tagged with this artist, grouped by concert (date + venue), in a 4-column grid. Clicking a photo opens a lightbox with a concert context link.
- **Google Maps** — venue locations are now shown on an embedded map with a custom dark style and a branded pink/lime pin.
  - New `VenueMap` component (`apps/web/src/components/VenueMap.tsx`) using `@vis.gl/react-google-maps`. Dark base tiles, muted road colours, deep-navy water; venue pin is accent-pink `#FF3D6E` with an accent-lime `#A8FF3E` ring.
  - **VenuePage** — full 320 px tall map shown under the "Also known as" section when `lat`/`lng` are set. OSM link in the header row kept for quick external navigation.
  - **ConcertDetailPage** — compact 160 px tall map shown below the venue name in the right-column header when the venue has coordinates.
  - When `VITE_GOOGLE_MAPS_API_KEY` is not set, both locations render a styled OSM fallback link instead (no blank box).
  - `GET /concerts/:id` now includes `lat` and `lng` on the venue object. `ConcertVenue` TypeScript interface updated accordingly.
- **Drag-and-drop photo uploads** — drag image/video files directly onto the concert photo gallery or the flyer panel to upload without clicking the file picker.
  - The entire `PhotoGallery` section is a drop zone; a lime-bordered overlay appears on hover with an upload-arrow icon. Dropped files go through the same sequential `for…of` pipeline and SHA-256 dedup as click uploads.
  - `FlyerSection` is also a drop zone; overlay shows "Drop flyer" on hover.
  - Drag-counter pattern (`dragCounterRef`) handles nested child `dragenter`/`dragleave` events cleanly so the overlay doesn't flicker.

### Added — Artist editing · Role simplification

- **Artist info editor** — `ArtistPage` now has an inline edit form (toggle with an "Edit" button). Editable fields: name, genre, bio, MusicBrainz ID, and image. Saving regenerates the URL slug if the name changes and redirects automatically. Image previewed in a square tile; clicking the tile or the "Upload image" button opens a file picker. Cancel restores the previous values.
- **`PATCH /artists/:slug`** — new API endpoint. Validates fields via Zod, regenerates the slug on name change (appends a short ID suffix to avoid collisions), returns `{ ok, slug }`.
- **`POST /artists/:slug/image`** — new API endpoint. Uploads a JPEG/PNG/WebP artist photo to MinIO at `artists/{id}/image{ext}`; updates `artists.image_key`. Response includes `imageUrl`.
- **Artist detail response includes `imageUrl`** — `GET /artists/:slug` now returns a resolved `imageUrl` alongside `imageKey`, removing the need for the frontend to compute the MinIO URL.
- **Role simplification** — lineup roles reduced from five to three: `headliner`, `co_headliner`, `support`. `opener` and `festival_set` removed from all dropdowns (Add show and Concert detail lineup editor). Existing DB rows with those values migrated to `support` via migration `0005_simplify_roles.sql`. The Postgres `concert_artist_role` enum was recreated without the two removed values. Import script updated to use the simplified roles.
- **Concert cards: co-headliner display** — co-headliners now shown as "Artist A & Artist B" on the card title line. Supporting acts listed below (up to 3) without any prefix.
- **URL-synced concert list state** — page, sort, status filter, and search query are now stored in the URL (`?page=&sort=&status=&q=`). Browser back/forward restores the exact page and filters you left. Page changes push new history entries (back goes to previous page); filter/sort/search changes replace the current entry so they don't pollute history. Default sort is "Newest first"; "Oldest first" is a second named tab alongside it.
- **Venue editing** — `VenuePage` now has an inline edit form (toggle with "Edit"). Editable fields: name, city, state/province, country, lat, lng, capacity. Slug regenerates if the name changes; page redirects automatically. New `PATCH /venues/:slug` endpoint.
- **Venue aliases** — venues can now have multiple historical names (e.g. Air Canada Centre → Scotiabank Arena). New `venue_aliases` table (migration `0006_venue_aliases.sql`). VenuePage shows an "Also known as" panel — add aliases with optional date ranges and notes, remove them individually. Navigating to an alias slug at the API level redirects to the canonical venue. New endpoints: `POST /venues/:slug/aliases`, `DELETE /venues/:slug/aliases/:aliasId`.
- **Grid editor filter bar** — ConcertGridPage now has a status tab strip and a quick-search input above the AG-Grid table. Both are URL-synced (`?status=&q=`) so navigating away and back preserves the active filter.
- **URL paste parser** — paste a Ticketmaster, Eventbrite, or AXS URL into the Add show modal to pre-fill date, venue, and artist lineup. Server fetches the page and tries JSON-LD structured data first; falls back to Open Graph meta tags; falls back further to Claude API extraction if `ANTHROPIC_API_KEY` is set. New endpoint `POST /concerts/parse-url`. `ANTHROPIC_API_KEY` env var added (optional).

### Fixed

- **Venue and festival links on concert detail** — venue name and festival badge now link to the correct slug-based routes (`/app/venues/:slug` and `/app/festivals/:slug`) instead of the raw UUID. `GET /concerts` (list), `GET /concerts/followup`, and `GET /concerts/:id` all now return `slug` on the `venue` and `eventSeries` objects. `ConcertVenue` and `ConcertSeries` TypeScript interfaces updated to include `slug: string`.

### Added — Phase 9: Rebrand · Mobile nav

- **Lime green accent** — primary accent color changed from acid yellow (`#E4FF3A`) to lime green (`#A8FF3E`) throughout. All `accent-yellow` / `accent-yellow-hover` tokens renamed to `accent-lime` / `accent-lime-hover`. Tailwind built-in `yellow-*` utility classes on status badges updated to `lime-*` equivalents. AG-Grid dirty-row highlight hex updated. CSS `::selection` and body gradient updated.
- **Extended accent palette** — two new complementary accent tokens: `accent-cyan` (`#3DFFE8`) and `accent-orange` (`#FF8C3A`) available as Tailwind colors for future use.
- **Newspaper cut-and-paste favicon** — `public/favicon.svg` redesigned as a bold B&W bleeding-ear icon: a cream-paper scrap (slightly rotated) with a graphic ear silhouette, inner-ear cutout, and a crimson blood drip from the lobe. Replaces the abstract soundwave lines.
- **Newspaper cut-and-paste logo** — `public/logo.svg` wordmark with each letter as an individual cut-out tile at a slight random angle. Alternating paper tones (black, cream, off-white), with the N and second G tiles in lime and the U tile in pink. "a Go Go" row uses mixed Impact + Georgia serif tiles. Referenced via `<Wordmark svg />` prop.
- **`Wordmark` component** — new optional `svg` prop: `<Wordmark svg />` renders the `logo.svg` file at the size-mapped height; default (no prop) keeps the CSS-text version with updated lime/pink colors.
- **Mobile navigation** — `AppShell` now renders a full-screen slide-in menu on mobile (`sm:hidden`). Hamburger button in the header (inline SVG, no dependency); tapping opens an overlay with: large-tap nav links in condensed uppercase, follow-up badge, username, and sign-out. Overlay closes on nav link click, route change, or Escape key. Body scroll locked while open. Follow-up dot badge also shown on the hamburger button when there are pending shows. Desktop header layout unchanged.
- **Tighter mobile padding** — `main` content area uses `px-4 py-6` on mobile, `sm:px-6 sm:py-8` on desktop (was always `px-6 py-8`).

### Fixed

- **Venue and festival links on concert detail** — venue name and festival badge now link to the correct slug-based routes (`/app/venues/:slug` and `/app/festivals/:slug`) instead of the raw UUID. `GET /concerts` (list), `GET /concerts/followup`, and `GET /concerts/:id` all now return `slug` on the `venue` and `eventSeries` objects. `ConcertVenue` and `ConcertSeries` TypeScript interfaces updated to include `slug: string`.

### Added — Phase 8: Lineup new-artist entry · Venue autocomplete · Type-driven event/festival name

- **Lineup editor: add by name (no search required)** — "Add to lineup" button is now enabled whenever the search field has any text, not only when a dropdown result is selected. Typed names that don't match any existing artist are sent as `artistName` and the server upserts a new artist record via `onConflictDoUpdate`. The button also responds to Enter. A hint message appears below the field when no match was found: _"No existing artist found — will create '…' on save."_
- **`PUT /concerts/:id/artists` accepts `artistId` or `artistName`** — schema now accepts either field per entry (one is required). The handler validates explicit IDs, upserts name-only entries via `INSERT … ON CONFLICT DO UPDATE`, builds a `resolvedIds` map, then performs the atomic delete+insert. `headlinerHint` sync uses the resolved ID.
- **`LocalArtist` uses a stable `uid` key** — added `uid: crypto.randomUUID()` to each local artist entry so lineup handlers (changeRole, moveUp, moveDown, remove) don't depend on `artistId` being non-null.
- **Venue autocomplete** — the venue name field in both **Add show** and the **Concert info editor** now shows a debounced dropdown (280 ms, up to 6 results) from `GET /venues?q=`. Selecting a result fills name, city, and state/province all at once.
- **State/province label** — all "State / region" labels and placeholders updated to "State/province".
- **Type-driven event / festival name** — Concert type shows an optional **Event name** field (e.g. "The Eras Tour"). Festival type shows a required **Festival name** field and a year picker; switching back to Concert clears the year. Validation enforces festival name when `type === "festival_day"`. The `PATCH /concerts/:id` payload omits `eventSeriesYear` for concert-type saves.

### Added — Phase 7: Flyer dedup + Add show form

- **Flyer duplicate detection** — `POST /concerts/:id/flyer` now computes SHA-256 of the uploaded buffer and returns `409 Conflict` if it matches the stored `flyer_hash`. Client-side: `FlyerSection` hashes the file via `SubtleCrypto` before the request and short-circuits with an inline error if it matches `concert.flyerHash`. `DELETE /concerts/:id/flyer` clears both `flyer_key` and `flyer_hash`. Migration `0004_flyer_hash.sql` adds `flyer_hash text` to `concerts`.
- **Add show modal** — **+ Add show** button in the concert list toolbar opens a modal form with: date picker, concert/festival toggle, venue name + city, dynamic artist list with debounced autocomplete search (search existing or type a new name) + role per artist, status picker, and optional ticket price + notes (behind a toggle). On submit calls `POST /concerts`, invalidates queries, and navigates directly to the new concert detail page.

### Added — Phase 6: Photo management

- **Delete photos** — hover over any gallery thumbnail to reveal a ✕ icon. First click arms the confirmation overlay (Yes / No); second click calls `DELETE /photos/:id`, removes the photo from MinIO and the DB, and re-fetches the gallery. Works in both normal and reorder mode.
- **Reorder photos** — **⇄ Reorder** button appears when a concert has more than one photo. In reorder mode each thumbnail shows ← (move earlier) and → (move later) arrows with a position counter. Changes are local until **Save order** is clicked, which calls `PUT /concerts/:id/photos/order`. Sends the final ordered array of IDs; server updates `set_order` in a transaction. Gallery always displays in `set_order ASC NULLS LAST, created_at ASC` order.
- **Duplicate detection** — before each upload the browser hashes the file with `SubtleCrypto.digest("SHA-256")`; if the hash matches any `contentHash` in the current gallery the upload is blocked with an inline error message. The server also computes the hash on its side (Node `crypto.createHash`) and returns `409 Conflict` if the same file has already been uploaded to the concert, preventing race conditions. Intra-batch duplicates (multiple files selected at once) are also caught client-side.
- **Migration `0003_photo_management.sql`** — `ALTER TABLE photos ADD COLUMN set_order integer`; `ALTER TABLE photos ADD COLUMN content_hash text`; partial index `photos_concert_hash_idx ON photos (concert_id, content_hash) WHERE content_hash IS NOT NULL`.

### Added — Phase 5: Lineup editing

- **`PUT /concerts/:id/artists`** — atomically replaces a concert's entire lineup in one transaction (delete all existing rows, insert new set). Any attendee of the concert may edit the shared lineup. Updates `headlinerHint` on the concerts row for fast list queries. Validates all `artistId` values exist before writing.
- **`putConcertArtists` API client method** — wraps the new endpoint, accepts role + optional setOrder per entry.
- **Lineup editor on concert detail** — the read-only lineup list now has an **Edit** button that switches to edit mode:
  - **Role dropdown** per artist (headliner / co-headliner / support / opener / festival set). Changing the role instantly re-sorts the artist into the correct tier.
  - **↑ / ↓** buttons to reorder within the same role tier.
  - **× remove** button per row.
  - **Add artist** section: debounced search box (300 ms) queries `GET /artists?q=` and shows a dropdown; clicking a result adds the artist with the selected role. Artists already in the lineup are excluded from results.
  - **Save changes** / **Cancel** toolbar at the top of the card. On save, `setOrder` is recomputed as 0-indexed position within each role tier and sent to `PUT /concerts/:id/artists`. Invalidates the concert and list queries on success.

### Added — Phase 4: AG-Grid batch editor

- **Concert grid editor** (`/app/concerts/grid`) — full AG-Grid Community v35 spreadsheet view of the entire concert log. Loads up to 1 000 rows in one request; virtual scrolling handles large collections.
- **Batch PATCH endpoint** (`PATCH /concerts/batch`) — accepts up to 200 attendance updates in a single DB transaction; only changed fields are sent; silently skips unknown IDs.
- **Inline editing** — status (dropdown), rating 1-10 (number editor), personal notes (large-text popup), ticket price in cents, currency code all editable directly in the grid.
- **Dirty-row tracking** — each row stores `_orig*` shadow values; `isDirty()` compares on every `onCellValueChanged`. Dirty rows highlighted with a semi-transparent accent-yellow background and a 2 px left border.
- **Save / Revert toolbar** — "Save N" button (disabled while pending) batch-PATCHes only dirty rows; "Revert" resets the grid back to server state without a network call. Unsaved-change count shown in real time.
- **Undo/redo** — 50-step cell-level undo/redo via AG-Grid's `undoRedoCellEditing`.
- **Dark theme** — AG-Grid CSS custom properties wired to app design tokens (`--ag-background-color: #0e0e0e`, `--ag-font-family: JetBrains Mono`, accent-yellow focus ring, etc.).
- **"⊞ Grid" toggle button** — added to the `ConcertsPage` toolbar; navigates to `/app/concerts/grid`. Grid page has a "← Card view" back-link.

### Added — Phase 3.1: Cards, flyers, venue photos

- **Concert card grid** — `ConcertsPage` replaced the row list with a `2/3/4`-column card grid. Each card shows the flyer image (or a monogram placeholder), headliner name, date, venue, supporting acts, and the inline status chip menu.
- **Concert flyer** — dedicated `flyer_key` column on `concerts`. `POST /concerts/:id/flyer` uploads to MinIO and sets the key; `DELETE /concerts/:id/flyer` removes it. Concert detail page shows the flyer in a sticky right-column panel with "Set flyer / Replace flyer / Remove" controls. Generic SVG placeholder shown when no flyer is set.
- **Lineup order on concert detail** — artists sorted headliner → co-headliner → support → opener → festival_set, then by `set_order` within each role. Headliner marked with ★. `set_order` number shown inline.
- **Venue card grid** — `VenuesPage` is now a card grid matching the concert/artist pattern, with venue photo and city.
- **Venue cover photo** — `image_key` column on `venues`. `POST /venues/:slug/photo` uploads to MinIO. Shown full-width at the top of the venue detail page with inline "Add / Change photo" overlay button.
- **Venue lat/lng map link** — venue detail page now shows an OpenStreetMap link when `lat`/`lng` are set.
- **Venue "Unknown" artist fix** — `GET /venues/:slug` now joins `concert_artists` to resolve the headliner's name; the venue history cards show the real artist name instead of `headlinerHint ?? "Unknown"`.
- **Artist card grid** — `ArtistsPage` uses the same card grid pattern; shows artist image (or monogram placeholder), name, genre, and show count.
- **`MINIO_PUBLIC_URL` env var** — added to `env.ts` (optional, defaults to internal endpoint), `docker-compose.yml` API env, `.env`, and `.env.example`. Presigned photo URLs and direct media URLs now use this value so browsers can actually fetch them (was broken before because the internal `minio:9000` hostname was baked into URLs).
- **Photo gallery polling** — gallery refetches every 3 s while any photo has `processing: true`, so the thumbnail appears automatically once the worker finishes.
- **Migration `0002_brown_pretty_boy.sql`** — `ALTER TABLE concerts ADD COLUMN flyer_key text`; `ALTER TABLE venues ADD COLUMN image_key text`.

### Fixed

- **Broken images after photo upload** — presigned URL hostname was `minio:9000` (Docker-internal); rewritten to `MINIO_PUBLIC_URL` before sending to the client.
- **API crash on startup** — `api_node_modules` and `worker_node_modules` Docker named volumes were stale (predated `@aws-sdk/s3-request-presigner` and `sharp` being added). Fixed by dropping and recreating the volumes after rebuilding the images. Documented as a known footgun.
- **Worker not processing media** — same stale volume issue as above; worker now starts cleanly and processes queued jobs on boot.

### Added — Phase 3: Detail pages + photo pipeline

- **Concert detail page** (`/app/concerts/:id`) — headliner title, full lineup with roles, attendance editor (status dropdown, rating, personal notes, ticket price), photo gallery with lightbox. Concert title in the list view now links to the detail page.
- **Artist pages** — searchable index at `/app/artists`; detail at `/app/artists/:slug` with stats (total/attended/upcoming, first/last seen) and full concert history.
- **Venue pages** — searchable index at `/app/venues`; detail at `/app/venues/:slug` with visit stats and chronological concert history.
- **Festival pages** — index at `/app/festivals`; detail at `/app/festivals/:slug` showing days attended, artist count, and per-day artist lineups.
- **AppShell nav** — Artists / Venues / Festivals links now active (previously "coming soon" stubs).
- **Photo upload API** (`POST /concerts/:id/photos`) — multipart, max 30 MB, JPEG/PNG/WebP/HEIC/GIF/MP4/MOV. Streams directly to MinIO, inserts `photos` row, enqueues `media-process` job.
- **Photo list API** (`GET /concerts/:id/photos`) — returns photos with presigned 1-hour MinIO URLs for each variant (thumb/medium/large) or the original if still processing.
- **Photo delete** (`DELETE /photos/:id`) — removes all MinIO objects and the DB row; uploader or admin only.
- **Media processing worker job** (`media-process` queue) — Sharp WebP variants at 200/800/1600px with EXIF/GPS strip; ffmpeg 1080p MP4 transcode + poster-frame WebP for videos; temp-dir based, cleans up after itself. Updates `photos.variants` on completion.
- **Worker Dockerfile** — added `apk add ffmpeg` to `base` and `prod` stages; Sharp 0.34 ships pre-built musl binaries for Alpine, no extra system libs needed.
- **`QUEUE_MEDIA_PROCESS`** constant + `MediaProcessJobData` / `MediaProcessJobResult` types added to `@tagg/shared`.
- **`mediaProcessQueue`** added to `apps/api/src/lib/queues.ts` (3 attempts, exponential back-off).
- **API routes registered** — `/photos`, `/artists`, `/venues`, `/series` all wired up in `apps/api/src/index.ts`.
- **Web API client additions** — `listPhotos`, `uploadPhoto`, `deletePhoto`, `listArtists`, `getArtist`, `listVenues`, `getVenue`, `listSeries`, `getSeries` + full TypeScript interfaces for all response shapes.
- **Reseed workflow documented** in README — `TRUNCATE` command + `import-csv` re-run.

### Added — Phase 2: Concert API + log view

- **Concert routes** (`GET/POST/PATCH/DELETE /concerts`, `GET /concerts/stats`, `GET /concerts/:id`) — paginated, filterable by status/year/search; two-query pattern (paginated concerts + single artist batch) avoids N+1.
- **CSV export** `GET /users/me/export.csv` — streams a faithful reproduction of the original 10-column `Concerts - Shows.csv` format, including "Weekday,  Month DD, YYYY" date style and RFC 4180 quoting.
- **Drizzle relations** — added all `relations()` declarations to `schema.ts` to enable the relational query API (`db.query.*.findMany({ with: { … } })`).
- **CLI import script** (`pnpm --filter @tagg/api import-csv -- --username <user>`) — direct-to-DB CSV import that reads from disk (no MinIO/BullMQ required). Idempotent; assigns roles (opener/support/headliner for concerts, festival_set for festivals); past dates → `attended`, future → `attending`.
- **Concert log page** (`/app/concerts`) — filterable by status, searchable by artist/venue, sortable, paginated (25/page). Inline status dropdown per row. Stat tiles clickable to filter. CSV export button.
- **AppShell** — live show counts from `/concerts/stats`; nav bar with links (artists/venues/festivals marked "soon"); dashboard quick-action links; version stamp.
- **`api.ts` additions** — `listConcerts`, `concertStats`, `getConcert`, `patchConcert`, `deleteConcert`, `exportCsv` client methods; `ConcertListItem`, `ConcertDetail`, `ConcertListResponse`, `ConcertStatsResponse`, `ConcertAttendance`, `ConcertVenue`, `ConcertSeries`, `ConcertArtist` TypeScript interfaces.

### Added — Email verification

- Nodemailer SMTP transport (`apps/api/src/lib/mailer.ts`); sends via `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` env vars. Mailpit catches everything in dev.
- `createVerificationToken(userId, email, tx?)` and `sendVerificationEmail(user, rawToken)` helpers in `apps/api/src/auth/email.ts`. Token row stores `sha256(token)`; raw token only appears in the URL we send.
- Signup transaction now creates a verification token atomically with the user-insert + invite-mark-used; `sendVerificationEmail` is fired-and-logged after commit so SMTP issues never break signup.
- `POST /auth/verify-email` — single-use, rate-limited; sets `users.email_verified_at` and deletes the token row in a transaction.
- `/verify-email` page in web (`VerifyEmailPage.tsx`) reads `?token=…`, calls the verify endpoint, refreshes `/auth/me`, shows success or error with a path back to the app.
- README's Mailpit section updated to call out the verification flow.

### Added — Phase 2: CSV import

- CSV importer for the 10-column `Concerts - Shows.csv` format. Pure parser at `@tagg/shared/csv` (regex-based date parser, "City, ST" splitter, "Warped Tour 2011" → series + year extractor). Tolerates the source file's optional weekday prefix and double-space quirks.
- Group-by-`(date, venue)` so the 468 artist-rows collapse into 170 concerts; per-artist appearance notes preserved on `concert_artists.appearance_notes`.
- `slugify()` helper in `@tagg/shared`; shared BullMQ queue payload types (`CsvImportJobData`, `CsvImportJobResult`).
- Drizzle migration `0001_classy_albert_cleary.sql`: new `import_status` enum and `imports` table (status, totals, processed, errors_sample, summary, timestamps).
- BullMQ worker (`apps/worker`) consuming the `csv-import` queue. Downloads the file from MinIO, parses, upserts venues / artists / event_series by slug, find-or-creates concerts by `(date, venue_id)`, inserts `concert_artists` and `concert_attendees` rows with `ON CONFLICT DO NOTHING`. Past shows → `attended`, future shows → `attending`. Idempotent on re-run.
- `worker` docker-compose service with its own Dockerfile and `worker_node_modules` volume.
- Admin import API: `POST /admin/imports` (multipart, 5 MB cap, MinIO upload, enqueue), `GET /admin/imports`, `GET /admin/imports/:id`. All gated by `requireUser` + `requireAdmin`.
- `@fastify/multipart`, `bullmq`, `ioredis`, `@aws-sdk/client-s3` added to the API.
- `RequireAdmin` route guard and `/app/admin/imports` page (file picker, progress bar polling every 1 s, summary counters, expandable warnings table). Admin card on the dashboard for quick access.
- "Dev logins" section in README covering credentials for web, MinIO, Mailpit, Postgres, Redis, API.

### Added — Foundation

- Initial monorepo scaffold: pnpm workspace with `apps/api`, `apps/web`, `apps/worker`, `packages/shared`.
- `docker-compose.yml` defining Postgres 16, Redis 7, MinIO + bucket init, Mailpit, API, and Web services with health checks and named volumes.
- `.env.example` with every variable documented; Zod-validated env loader in the API refuses to boot on missing/invalid values.
- Full database schema (Drizzle) covering users, sessions, invites, email-verification tokens, password-reset tokens, auth events, artists, venues, event_series, concerts, concert_artists, concert_attendees, photos, tags, concert_tags, setlists, setlist_songs.
- Secure auth implementation:
  - `argon2id` password hashing via `@node-rs/argon2` (OWASP 2024 params).
  - Server-side sessions in Postgres; only the SHA-256 of the token is stored. `HttpOnly`, `SameSite=Lax`, `Secure` (in prod) cookies. Half-life renewal.
  - Pwned Passwords k-anonymity check at signup (fails open on network error).
  - `/auth/signup`, `/auth/login`, `/auth/logout`, `/auth/me` endpoints.
  - Rate limits on signup/login (10 per 10 min per IP).
  - Constant-time login that runs a dummy hash on missing users to avoid timing leaks.
  - `auth_events` table records logins, failures, signups for audit.
  - `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit` configured.
- Invite system: hashed-in-DB single-use codes with optional expiry, per-user quota (`INVITES_PER_USER`, default 3), endpoints to list/create/revoke/check, signup pre-flight check that confirms an invite is valid before showing the form.
- `pnpm bootstrap-invite` CLI that creates the first invite URL — refuses to run if any users already exist.
- Web frontend (Vite + React + Tailwind):
  - Brand wordmark component ("TINNITUS" in Antonio + "a Go Go" in Caveat Brush, acid yellow + marquee pink).
  - Dark theme by default; custom Tailwind tokens for `bg`, `surface`, `border`, `text`, `accent.yellow`, `accent.pink`.
  - Landing page (`/`) with branded hero, feature trio, invite-only callout.
  - Login page (`/login`) with shared Zod schema validation.
  - Signup page (`/signup?invite=…`) with live invite-validity check and inline password strength.
  - Auth-guarded `/app` placeholder showing "the damage" tiles for future stats.
  - React Router v6, TanStack Query, typed API client with cookie credentials.
  - Custom 404 with "Wrong venue, pal." microcopy.
- Worker scaffold (`apps/worker`) — placeholder until phase 3 brings BullMQ + Sharp + ffmpeg online.
- Shared package (`@tagg/shared`) — Zod schemas for signup/login/user, used by both API and web to keep validation rules in lockstep.
- Root README with quick start, stack table, structure, env variables, common commands, auth/security overview, migration workflow, deploy notes, and roadmap.
- This changelog.

### Changed

- `@tagg/shared` now exports the CSV parser as a `./csv` subpath rather than from the main entry. Pulling csv-parse into web's Vite import graph broke `vite:import-analysis` because Vite can't optimize transitive workspace deps the same way Node resolves them.
- `apps/worker/tsconfig.json` includes `../api/src/db/schema.ts` and drops `rootDir` so the worker can import the Drizzle schema by relative path. (To be replaced when schema moves to its own `packages/db`.)
- `docker-compose.yml` pinned with `name: tinnitus-a-go-go` so compose commands resolve to the same project regardless of which directory you run from.
- Web service env `VITE_API_URL` now points at `http://api:3000` (docker network DNS) instead of `http://localhost:3000`. The vite dev server proxies API calls server-side, where `localhost` resolves to the web container itself.
- Semantics of `imports.total_rows` changed: now tracks units of work (grouped shows) rather than raw CSV line count. Raw count is preserved at `summary.csvRowCount`. Keeps the progress bar honest (100 % at completion).

### Fixed

- After adding deps to a workspace package, Vite's dep cache at `apps/web/node_modules/.vite/deps` can hold a stale graph. Documented as a footgun; clear the cache and restart the web container when touching shared-package exports.
- Stale Docker bind mounts: containers started from an older host path keep reading from that path even after the directory is moved. Resolved by `docker compose down` + `docker compose up -d` from the live directory.
