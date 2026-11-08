# Features

## Summary

A concert log with festivals, media, setlists, stats, search and admin tools, plus notifications and an iOS shell. 36 features in 9 areas.

## Features

### Shows

| Feature | What it does | Where | Status |
|-|-|-|-|
| Shows list | Past / Upcoming, ticket rows by month, named by the whole bill | `apps/web/src/routes/ConcertsPage.tsx`, `apps/api/src/routes/concerts/read.ts` | stable |
| Readable links | `/shows/<artist>-<date>`; old ids redirect | `concerts/read.ts` | stable |
| Show page | Banner, flyer, lineup with roles, attendance, map, share, media, setlists | `routes/ConcertDetailPage.tsx`, `routes/concert/` | stable |
| Add show | Date, venue, festival, lineup, status; paste a ticket link to fill it | `routes/AddConcertModal.tsx`, `apps/api/src/routes/parseurl.ts` | stable |
| Daily follow-up | Resolve past shows still marked attending / interested | `routes/FollowUpPrompt.tsx` | stable |
| Offline edits | Attendance edits queued on the device | `apps/web/src/lib/outbox.ts` | stable |

### Festivals

| Feature | What it does | Where | Status |
|-|-|-|-|
| Festivals | Containers of day shows, day numbers, days attended, brands across years | `routes/FestivalsPage.tsx`, `FestivalDetailPage.tsx`, `apps/api/src/routes/festivals.ts` | stable |
| Grouping | Select shows → add to festival; suggestions in Data cleanup | `components/FestivalPicker.tsx`, `lib/festival-suggestions.ts` | stable |

### Artists and venues

| Feature | What it does | Where | Status |
|-|-|-|-|
| Artists | Times seen, longest gap, top songs, photos, bio and genre | `routes/ArtistsPage.tsx`, `ArtistPage.tsx`, `routes/artists.ts` | stable |
| Artist photos | Found from Deezer, then Wikidata via MusicBrainz; stored locally | `lib/artist-photo.ts` | stable |
| Venues | List / Map, artists seen there, aliases | `routes/VenuesPage.tsx`, `VenuePage.tsx`, `routes/venues.ts` | stable |
| Venue map | Full screen, by-city panel, themed pins | `routes/MapPage.tsx`, `components/MapView.tsx` | stable |

### Home and stats

| Feature | What it does | Where | Status |
|-|-|-|-|
| Home | On this day, totals, charts, top artists and venues, milestones | `routes/StatsPage.tsx`, `routes/stats.ts` | stable |
| Year in review | Every year's recap with a share image | `routes/YearReviewPage.tsx` | stable |
| Ticket stub wall | Photos marked as stubs | `routes/TicketsPage.tsx` | stable |
| Share images | Story-sized cards for shows, festivals, years | `lib/shareCard.ts` | stable |

### Media

| Feature | What it does | Where | Status |
|-|-|-|-|
| Photos and videos | WebP variants (GPS stripped), H.264 with poster, HEIC | `apps/worker/src/jobs/media-processing.ts`, `routes/photos.ts` | stable |
| Background uploads | Queue with pause, resume, retry, progress ring | `lib/uploads.ts`, `components/UploadIndicator.tsx` | stable |
| Photo viewer | Swipe, swipe down to close | `components/PhotoCarousel.tsx` | stable |
| Tagging | Artists on photos, ticket stubs, reorder | `routes/concert/PhotoGallery` | stable |

### Setlists

| Feature | What it does | Where | Status |
|-|-|-|-|
| Setlists | Link a setlist.fm setlist per artist per show; song cache | `routes/setlistfm.ts`, `lib/setlist-cache.ts` | stable |
| Setlist finder | Hourly job fills in the rest within rate limits | `apps/worker/src/jobs/setlist-enrich.ts` | stable |

### Search and calendar

| Feature | What it does | Where | Status |
|-|-|-|-|
| Spotlight | ⌘K / `/` over shows, artists, festivals, venues, songs heard live, with thumbnails | `routes/Spotlight.tsx`, `routes/search.ts` | new |
| Calendar feed | Private .ics of attending / interested shows | `routes/calendar.ts` | stable |

### Notifications

| Feature | What it does | Where | Status |
|-|-|-|-|
| Reminders and recap | 7 / 3 / 1 days before shows; weekly recap; ntfy and email | `apps/worker/src/notify/`, `jimbo-notify.json` | new |
| Branded emails | Theme colours, plain-text version, preview script | `apps/worker/src/notify/templates.ts` | new |
| Notifications page | `/notifications`: channels, reminders, recap, when, tests | `routes/NotificationsPage.tsx`, `routes/notifications.ts` | new |

### Admin and account

| Feature | What it does | Where | Status |
|-|-|-|-|
| First-run setup | `/setup` creates the one account | `routes/SetupPage`, `routes/auth.ts` | new |
| Sign in and password | Login, change password, `set-password` script | `routes/LoginPage`, `apps/api/src/scripts/` | stable |
| Import | CSV import queued in the worker | `routes/ImportsPage.tsx`, `routes/admin/imports.ts`, `jobs/csv-import.ts` | stable |
| Export | CSV (with setlists), JSON, Markdown | `routes/export.ts` | stable |
| Data cleanup | Duplicates with merge and undo, health checks, festival suggestions, setlist finder progress | `routes/DataCleanupPage.tsx`, `routes/admin/data.ts` | stable |
| Artist enrichment | Last.fm bio, genre, MusicBrainz id; hourly, 50 at a time | `jobs/artist-enrich*.ts`, `lib/lastfm.ts` | stable |
| jimbo-ui config | `/jimbo-ui`, admin only: Looks, Colours, Type, Backdrop, Brand (logo, favicon), Style guide, About | `routes/JimboConfigPage.tsx`, `routes/theme.ts` | stable |
| Service health | Links to the stack's services | `components/ServicesPanel.tsx` | stable |

### iOS

| Feature | What it does | Where | Status |
|-|-|-|-|
| iOS app | Capacitor shell loading http://macmini:4444, own icon, live updates | `native/`, `deploy.json` `ios` | new |

## Removed or retired

- **Signup, invites, email verification** (Unreleased, 2026-11): one account.
- **Web Push and the offline service worker** (2026-11): needed HTTPS; `sw.js` now only retires the old worker.
- **Guitar Hero-style 3D timeline page** (2026-06-03).
- **`pnpm db:migrate`** (2026.11.0): fresh installs apply every SQL file with psql.
