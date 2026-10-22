# Tinnitus A Go Go

A multi-user concert log for people who still believe the next show is worth the ringing.
Self-hosted, invite-only, served directly from a personal Mac via Tailscale to a small group of friends.

> **Current status:** Phase 14 complete — PWA support for iOS/desktop (installable, offline-ready, splash screens), Last.fm artist enrichment (auto-fetch bio, genre, MusicBrainz ID; scheduled worker enriches 50 artists/hour), URL import for venue/artist photos.

---

## Prerequisites

Everything runs inside Docker, so the only hard requirements are **Docker** and **Git**. `Node` + `pnpm` are only needed if you want to run scripts outside the containers.

| Tool | Required for | Min version |
|---|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop) (Mac/Win) or [Docker Engine](https://docs.docker.com/engine/install/) + Compose plugin (Linux) | Running the stack | Docker 24, Compose v2 |
| [Git](https://git-scm.com) | Cloning the repo | any |
| [Node.js](https://nodejs.org) | Running scripts outside Docker | 22 LTS |
| [pnpm](https://pnpm.io) | Package management outside Docker | 9 |
| [mc (MinIO Client)](https://min.io/docs/minio/linux/reference/minio-mc.html) | `scripts/backup.sh` media backup | any |

---

## Installation

### macOS

```bash
# 1. Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Core tools
brew install git node pnpm

# 3. Docker Desktop
brew install --cask docker
open /Applications/Docker.app   # start Docker, wait for the whale in the menu bar

# 4. mc — only needed on the machine running backups
brew install minio/stable/mc

# 5. Clone and set up
git clone https://github.com/ryanjpeterson/tinnitus-a-go-go.git
cd tinnitus-a-go-go
cp .env.example .env
# edit .env — at minimum set SESSION_SECRET (openssl rand -base64 32)
```

### Linux (Debian / Ubuntu)

```bash
# 1. Git + Node (via nvm is cleanest)
sudo apt update && sudo apt install -y git curl
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 22 && nvm use 22

# 2. pnpm
npm install -g pnpm

# 3. Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # allow running docker without sudo
newgrp docker

# 4. mc — only needed on the machine running backups
curl -O https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc && sudo mv mc /usr/local/bin/

# 5. Clone and set up
git clone https://github.com/ryanjpeterson/tinnitus-a-go-go.git
cd tinnitus-a-go-go
cp .env.example .env
# edit .env — at minimum set SESSION_SECRET (openssl rand -base64 32)
```

### Windows (WSL 2 — recommended)

Docker Desktop on Windows works best with the WSL 2 backend.

```powershell
# 1. Enable WSL 2 (run in PowerShell as Administrator)
wsl --install
# Restart, then open the Ubuntu app that was installed

# 2. Inside the Ubuntu WSL shell — follow the Linux steps above
```

If you prefer native Windows without WSL:

```powershell
# Install Chocolatey (PowerShell as Administrator)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install tools
choco install git nodejs-lts docker-desktop

# Install pnpm
npm install -g pnpm

# mc (MinIO client) — only needed on the machine running backups
choco install minio-client

# Clone (in Git Bash or PowerShell)
git clone https://github.com/ryanjpeterson/tinnitus-a-go-go.git
cd tinnitus-a-go-go
copy .env.example .env
# edit .env
```

> ⚠️ **Windows note:** The `scripts/backup.sh` backup script requires a bash shell. Run it inside WSL or Git Bash. Native Windows cron equivalents (Task Scheduler) are untested.

---

## Quick start

```bash
# 1. clone, then from the repo root:
cp .env.example .env
# edit .env: at minimum replace SESSION_SECRET with `openssl rand -base64 32`

# 2. bring up the stack
docker compose up -d

# 3. run migrations
docker compose exec api pnpm db:migrate

# 4. create your first invite (only works while DB is empty)
docker compose exec api pnpm bootstrap-invite

# 5. open the URL it prints, sign up, then verify your email in Mailpit (localhost:8025)

# 6. promote yourself to admin:
docker compose exec db psql -U tagg -d tagg -c \
  "UPDATE users SET is_admin = true WHERE username = 'YOUR_USERNAME';"

# 7. import your concert CSV via the admin UI or CLI (see below)
```

Then visit:

| URL                            | What                            |
| ------------------------------ | ------------------------------- |
| <http://localhost:4444>        | Web app                         |
| <http://localhost:3000/health> | API health                      |
| <http://localhost:9001>        | MinIO console                   |
| <http://localhost:8025>        | Mailpit (captures dev SMTP)     |

Credentials for everything: see [Dev logins](#dev-logins) below.

---

## Dev logins

> ⚠️ **Dev only.** These values come from `.env.example` and are checked into git. **Never** ship a deployed instance with any of them unchanged — rotate every secret (Postgres password, MinIO creds, `SESSION_SECRET`, SMTP) before sharing access beyond your own machine.

### Web app — <http://localhost:4444>

The DB starts with zero users. To get in the first time:

```bash
docker compose exec api pnpm bootstrap-invite
# Open the printed http://localhost:4444/signup?invite=... URL.
# Pick a username/email/password (≥12 chars, screened against haveibeenpwned).
# Verify your email in Mailpit (localhost:8025) before logging in.

# Then promote yourself to admin:
docker compose exec db psql -U tagg -d tagg -c \
  "UPDATE users SET is_admin = true WHERE username = 'YOUR_USERNAME';"
```

Subsequent logins at <http://localhost:4444/login> with the same username (or email) + password.

### MinIO console — <http://localhost:9001>

| Field    | Value                     |
| -------- | ------------------------- |
| Username | `tagg_minio`              |
| Password | `tagg_minio_dev_password` |

S3 API on `:9000` (same credentials). Default bucket: `tagg-media`.

### Mailpit — <http://localhost:8025>

No login. Catches every email the API sends in dev. Signup triggers a verification email — click the link in Mailpit to flip `users.email_verified_at`. SMTP relay on `:1025`.

### Postgres — `localhost:5432`

| Field    | Value               |
| -------- | ------------------- |
| User     | `tagg`              |
| Password | `tagg_dev_password` |
| Database | `tagg`              |

```bash
# psql shell
docker compose exec db psql -U tagg -d tagg

# or with a GUI (TablePlus, DBeaver, etc.) at localhost:5432 using the above creds
```

### Redis — `localhost:6379`

No auth in dev. Used for sessions and BullMQ queues.

```bash
docker compose exec redis redis-cli
```

### API — <http://localhost:3000>

No standalone UI. `GET /health` is open; everything else needs the `tagg_session` cookie that the web app sets on login.

```bash
curl http://localhost:3000/health
curl -H "Cookie: tagg_session=<value>" http://localhost:3000/auth/me
```

---

## Stack

| Layer          | Choice                                                               |
| -------------- | -------------------------------------------------------------------- |
| API            | Fastify 5 (TypeScript, ESM)                                          |
| DB access      | Drizzle ORM + drizzle-kit                                            |
| Database       | Postgres 16                                                          |
| Cache / queue  | Redis 7 + BullMQ                                                     |
| Object store   | MinIO (S3-compatible, swappable for real S3)                         |
| Auth           | Hand-rolled sessions + `@node-rs/argon2`                             |
| Validation     | Zod (shared between API and web)                                     |
| Frontend       | React 18 + Vite + Tailwind CSS + TanStack Query                      |
| Routing        | React Router v6                                                      |
| PWA            | vite-plugin-pwa (Workbox service worker — active only over HTTPS)    |
| Photo viewer   | Swiper                                                               |
| Maps           | `@vis.gl/react-google-maps` v1 (dark-styled, custom pin; OSM fallback) |
| Image proc.    | Sharp (WebP variants at 200/800/1600 px, EXIF GPS strip) via BullMQ worker |
| Video proc.    | ffmpeg (H.264 MP4 transcode + WebP poster frame) via BullMQ worker   |
| LLM fallback   | `@anthropic-ai/sdk` — Claude for the URL paste parser (optional; no UI uses it now) |
| Artist data    | Last.fm API — bio, genre, MusicBrainz ID (optional); photos from Deezer / Wikidata (no key) |
| Setlists       | setlist.fm API (optional) — linking, song cache, automatic finder    |
| Push           | `web-push` (VAPID keys generated by the server)                      |
| Fonts          | Archivo 800 (headings, `font-display`) · Inter (everything else, tabular figures) |
| Mail (dev)     | Mailpit                                                               |
| Dev orchestr.  | Docker Compose                                                        |

---

## Project structure

```
.
├── apps/
│   ├── api/                      Fastify API + Drizzle schema + hand-applied SQL migrations
│   │   ├── drizzle/              SQL migrations, committed (0005+ applied by hand — see Migration workflow)
│   │   └── src/
│   │       ├── index.ts          server setup: plugins, rate limit, error handler (DB rule → 4xx), routes,
│   │       │                     push reminder timer
│   │       ├── auth/             argon2id passwords, sessions, tokens, verification email, auth middleware
│   │       ├── db/               schema.ts (Drizzle), client, migrate runner
│   │       ├── routes/
│   │       │   ├── health.ts         /health (process up), /health/deep (database reachable)
│   │       │   ├── auth.ts           signup, login, logout, me, verify email, change password
│   │       │   ├── invites.ts        list, issue, check, revoke invites
│   │       │   ├── concerts.ts       shows: list, detail (by id or readable slug), create, edit, batch edit,
│   │       │   │                     delete, lineup, flyer, saved setlists, follow-up list
│   │       │   ├── festivals.ts      festivals as containers of day shows: list, detail, create, edit,
│   │       │   │                     lineup across days, every-day attendance, flyer, delete
│   │       │   ├── photos.ts         upload, list, reorder, delete, artist tags, ticket stubs
│   │       │   ├── artists.ts        list, detail (times seen, longest gap, top songs), edit, image,
│   │       │   │                     enrichment, tagged photos, setlists
│   │       │   ├── venues.ts         list, map pins, detail (artists seen here), edit, photo, aliases
│   │       │   ├── stats.ts          /concerts/deep-stats (Home) and /concerts/year-review[/:year]
│   │       │   ├── search.ts         /search/index — compact index searched on the device
│   │       │   ├── calendar.ts       private .ics calendar feed + its token
│   │       │   ├── push.ts           Web Push subscribe / unsubscribe / test / preferences
│   │       │   ├── offline.ts        /offline/bundle — every page's response in four requests
│   │       │   ├── export.ts         your log as CSV, JSON or Markdown
│   │       │   ├── setlistfm.ts      setlist.fm proxy (search, by artist, by id/URL)
│   │       │   ├── parseurl.ts       POST /concerts/parse-url (no UI uses it at the moment)
│   │       │   ├── public.ts         unauthenticated show list/detail (no UI uses it at the moment)
│   │       │   ├── copy.ts           editable site text (no UI uses it at the moment)
│   │       │   └── admin/
│   │       │       ├── imports.ts    CSV import queue
│   │       │       └── data.ts       data cleanup: duplicates, merge + undo, health checks, setlist finder
│   │       ├── lib/
│   │       │   ├── show-info.ts      whole-bill lineups and festival day numbers for naming shows
│   │       │   ├── festival-days.ts  festival day loading, attendance summary, day numbers and length
│   │       │   ├── lineup.ts         billing rules (one headliner, no headliner + co-headliner mix)
│   │       │   ├── setlistfm-core.ts setlist.fm calls + parsing (shared with the worker)
│   │       │   ├── setlist-cache.ts  setlist.fm song cache in the database
│   │       │   ├── artist-photo.ts   keyless artist photos: Deezer, then Wikidata via MusicBrainz
│   │       │   ├── lastfm.ts         Last.fm bio / genre / MusicBrainz id
│   │       │   ├── names.ts          name normalising for duplicate detection
│   │       │   ├── duplicates.ts     likely duplicate venues and artists
│   │       │   ├── merge.ts          merge a duplicate (with an undo snapshot) and undo it
│   │       │   ├── data-health.ts    data health checks and their fixes
│   │       │   ├── push-core.ts      Web Push sending + server-generated VAPID keys
│   │       │   ├── push-reminders.ts Tonight / How was it? / anniversary reminders (15-minute timer)
│   │       │   ├── safe-fetch.ts     fetch user-supplied URLs without reaching the private network
│   │       │   └── env, mailer, queues, redis, s3
│   │       └── scripts/              bootstrap-invite, import-csv (direct to DB), cache-setlists (backfill),
│   │                                 requeue-stuck-photos, seed-dev
│   │
│   ├── web/                      Vite + React 18 + Tailwind, installable PWA
│   │   ├── nginx.conf            production web server (with docker-compose.https.yml): SPA, /api and
│   │   │                         /tagg-media proxies, large uploads, service-worker caching headers
│   │   ├── public/               favicon, logo, app icons + iPhone splash screens, push-sw.js
│   │   └── src/
│   │       ├── App.tsx           query client, auth, routes; starts the offline outbox and upload queue
│   │       ├── routes/
│   │       │   ├── AppShell.tsx          top bar (search, + add show, account), tab dock
│   │       │   │                         (Home · Shows · Artists · Festivals · Venues), pull to refresh,
│   │       │   │                         offline banner, upload indicator, all in-app routes
│   │       │   ├── StatsPage.tsx         Home: on this day, totals, year in review link, charts, top
│   │       │   │                         artists/venues, milestones, ticket stubs link
│   │       │   ├── YearReviewPage.tsx    one year's recap, with a share image
│   │       │   ├── ConcertsPage.tsx      Shows: Past / Upcoming tabs, month-grouped ticket rows
│   │       │   ├── ConcertDetailPage.tsx one show: banner, festival days, lineup editor, attendance,
│   │       │   │                         setlists, media gallery (tagging, tickets, reorder), share
│   │       │   ├── AddConcertModal.tsx   new show: date, venue, festival, lineup, status
│   │       │   ├── ArtistsPage.tsx / ArtistPage.tsx       artist list and detail
│   │       │   ├── VenuesPage.tsx / VenuePage.tsx         venue list (List | Map) and detail
│   │       │   ├── MapPage.tsx           full-screen venue map with a by-city panel
│   │       │   ├── FestivalsPage.tsx / FestivalDetailPage.tsx  festivals and their days, other years
│   │       │   ├── AddFestivalModal.tsx  new festival with its lineup
│   │       │   ├── SearchSheet.tsx       search across shows, artists, festivals, venues, songs
│   │       │   ├── TicketsPage.tsx       ticket stub wall
│   │       │   ├── FollowUpPrompt.tsx    daily prompt to resolve past shows still marked attending/interested
│   │       │   ├── AccountPage.tsx       profile, password, calendar feed, admin links, (HTTPS only:
│   │       │   │                         notifications, offline saving)
│   │       │   ├── ImportsPage.tsx       admin: CSV import + CSV / JSON / Markdown export
│   │       │   ├── DataCleanupPage.tsx   admin: duplicates, merges + undo, data health, setlist finder
│   │       │   ├── LoginPage, SignupPage, VerifyEmailPage
│   │       │   └── RequireAuth, RequireAdmin     route guards
│   │       ├── components/
│   │       │   ├── ui/kit.tsx        the UI kit every page is built from: PageHeader, Hero/Banner,
│   │       │   │                     Section, List, EventRow, EntityRow, MediaCard, LinkCard, StatTile,
│   │       │   │                     RankedList, SearchField, SelectField, Tabs, PillTabs, Pager, Sheet,
│   │       │   │                     ImageViewer, VenueViewSwitch, ShareButton, Loading (skeleton),
│   │       │   │                     EmptyState, StatusBadge
│   │       │   ├── ui/button, card, input, label   primitives
│   │       │   ├── PhotoCarousel.tsx full-screen photo/video viewer (swipe, swipe down to close)
│   │       │   ├── UploadIndicator.tsx corner progress ring for background uploads
│   │       │   ├── VenueMap.tsx      venue map embed (Google Maps, OSM fallback)
│   │       │   ├── ServicesPanel.tsx admin: service health links
│   │       │   └── Wordmark.tsx      SVG logo
│   │       ├── lib/
│   │       │   ├── api.ts            typed fetch wrapper + all request/response types
│   │       │   ├── auth-context.tsx  signed-in user
│   │       │   ├── showTitle.ts      one way to name a show (whole bill, festival day)
│   │       │   ├── format.ts         dates and counts
│   │       │   ├── useListParams.ts  list state kept in the URL
│   │       │   ├── uploads.ts        background upload queue (pause, resume, retry)
│   │       │   ├── gestures.ts       pull to refresh, horizontal swipes
│   │       │   ├── shareCard.ts      story-sized share images
│   │       │   ├── offline.ts        cache warming + Save everything (HTTPS only)
│   │       │   ├── outbox.ts         attendance edits made offline, synced later
│   │       │   ├── push.ts           Web Push on this device (HTTPS only)
│   │       │   └── cn.ts             class-name helper
│   │       └── styles/globals.css   Tailwind base, type and component classes
│   │
│   └── worker/                   BullMQ worker
│       └── src/jobs/
│           ├── media-processing.ts   photos → WebP variants (EXIF GPS stripped); videos → H.264 + poster;
│           │                         HEIC via ffmpeg
│           ├── csv-import.ts         admin CSV import
│           ├── artist-enrich*.ts     hourly: Last.fm data + automatic photos, stored locally
│           └── setlist-enrich.ts     hourly setlist.fm finder (rate limited, daily budget)
│
├── packages/shared/              shared by api, web and worker: Zod schemas and types (attendance
│                                 statuses, roles), CSV parsing, slugify, queue names
├── scripts/
│   ├── backup.sh                 Postgres dump + MinIO mirror with rotation (TAGG_BACKUP_DIR)
│   ├── setup-tailscale.sh        Tailscale overlay setup helper
│   └── venue-coords.sql          one-off venue coordinate fill
├── docker-compose.yml            db, redis, minio (+ minio-init), mailpit, api, worker, web
├── docker-compose.tailscale.yml  overlay: bind ports for the tailnet, Tailscale URLs
├── docker-compose.https.yml      optional overlay: production web build (nginx) — needs HTTPS to matter
├── .env.example                  every variable, with safe dev defaults
├── .npmrc                        shamefully-hoist=true so Docker bind mounts resolve workspace deps
├── CHANGELOG.md                  Keep a Changelog, CalVer
└── README.md
```

---

## Design system

| Token | Value | Usage |
| ----- | ----- | ----- |
| `bg` | `#141416` | Page background |
| `surface` | `#1C1C1F` | Cards, panels |
| `surface-2` | `#252528` | Inputs, hover states |
| `border` | `#303034` | All borders |
| `text-base` | `#E8E8E8` | Primary text |
| `text-muted` | `#A0A0A0` | Secondary text |
| `text-subtle` | `#5A5A5C` | Tertiary / placeholder |
| `accent-lime` | `#A8FF3E` | Primary action, links, selection, save buttons |
| `accent-pink` | `#FF3D6E` | Alerts, destructive, on-this-day card, secondary accent |
| `accent-cyan` | `#3DFFE8` | Available for future use |
| `accent-orange` | `#FF8C3A` | Available for future use |

Body gradient: subtle lime bloom top, pink bloom bottom. `::selection` uses lime on dark.

**Layout and components.** Pages are assembled from `src/components/ui/kit.tsx` plus a few component classes in `globals.css` (`.card`, `.eyebrow`, `.h-page`, `.h-section`, `.field`). Mobile first: a sticky app bar and bottom tab bar, full-width rows with 44px+ tap targets, 16px form fields, and nothing that scrolls sideways — filters become selects on phones and wrap as pills on desktop. Lists of shows use `EventRow` (ticket-style date block, title, venue, status dot, chevron); detail pages open with a `Hero` (blurred image backdrop, thumbnail, bold title); every modal is a `Sheet` (bottom sheet on phones, centered dialog on desktop).

**Type and controls.** Two typefaces only: Archivo 800 for headings (sentence case), Inter for everything else with tabular figures so counts and dates line up. No monospace in the UI and nothing under 11px. The scale is `.h-page`, `.h-section`, body 15px, `.meta` 14px, `.eyebrow` 11px caps. Controls come from `globals.css`: `.btn` + `.btn-primary|secondary|ghost|danger` (+ `.btn-sm`), `.field` for inputs/selects/textareas, `.label`, `.chip`, `.link-action`. The `Button`, `Input`, `Label` and `Card` components are thin wrappers over the same classes.

The logo (`Wordmark.tsx`) is an Illustrator-exported SVG (190 × 92.3 viewBox) embedded directly as React path data — no external font dependency. "TINNITUS" renders in white fill with `#a8ff3e` stroke; "a-go-go" in `#f87171` (red). The favicon (`public/favicon.svg`) uses the same path data scaled into a 32 × 32 dark rounded-rect. All auth, landing, admin, and imports pages render the `<Wordmark />` component.

---

## Environment variables

All defined in [.env.example](./.env.example). Highlights:

| Variable                   | Purpose                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`             | Postgres connection string                                        |
| `REDIS_URL`                | Redis connection string                                           |
| `MINIO_ENDPOINT`           | MinIO host (default `minio` inside Docker)                        |
| `MINIO_PORT`               | MinIO port (default `9000`)                                       |
| `MINIO_ROOT_USER`          | MinIO access key                                                  |
| `MINIO_ROOT_PASSWORD`      | MinIO secret key — **rotate before sharing access**               |
| `MINIO_BUCKET`             | Object storage bucket (default `tagg-media`)                      |
| `MINIO_PUBLIC_URL`         | Externally-reachable MinIO URL for media links                    |
| `SMTP_HOST/PORT/FROM`      | SMTP config (Mailpit in dev)                                      |
| `SESSION_SECRET`           | 32+ byte secret — **regenerate per environment**                  |
| `SESSION_COOKIE_NAME`      | Cookie key for session ID                                         |
| `SESSION_TTL_DAYS`         | Session lifetime (default 30)                                     |
| `INVITES_PER_USER`         | How many invites each new user gets (default 3)                   |
| `INVITE_TTL_DAYS`          | Invite expiry (default 14)                                        |
| `CORS_ORIGINS`             | Comma-separated allowed web origins                               |
| `RATE_LIMIT_MAX`           | Max requests per window per IP (default 200)                      |
| `RATE_LIMIT_WINDOW`        | Rate-limit window (default `1 minute`)                            |
| `SETLISTFM_API_KEY`        | Optional — setlist.fm lookups in the app, and the worker's hourly automatic setlist finder (passed to api and worker) |
| `ANTHROPIC_API_KEY`        | Optional — enables Claude fallback for URL paste parser           |
| `LASTFM_API_KEY`           | Optional — enables Last.fm artist enrichment (bio, genre, MBID)   |
| `GOOGLE_MAPS_API_KEY`      | Optional — enables embedded maps; OSM link shown when absent      |
| `VITE_GOOGLE_MAPS_API_KEY` | Frontend Maps key (passed to `@vis.gl/react-google-maps`)         |
| `APP_URL`                  | Public app base URL (used in email links and calendar-feed links) |
| `PUSH_TIMEZONE`            | Time zone for push reminders (default `America/Toronto`)          |
| `TAGG_BACKUP_DIR`          | Backup destination path for `scripts/backup.sh` (prod only)      |

---

## Common commands

From the repo root:

```bash
pnpm dev                  # docker compose up (foreground)
pnpm dev:detached         # docker compose up -d
pnpm dev:tailscale        # start with Tailscale overlay (see docker-compose.tailscale.yml)
pnpm setup:tailscale      # one-time script: auto-detects Tailscale IP and patches .env
pnpm down                 # docker compose down (preserves volumes)
pnpm logs                 # follow all logs

pnpm db:generate          # generate a new migration from schema changes
pnpm db:migrate           # apply pending migrations
pnpm db:studio            # open Drizzle Studio for the DB
pnpm bootstrap-invite     # one-time first-user invite (only when DB is empty)
pnpm import-csv -- --username <user>   # direct-to-DB CSV import (no Docker needed)

pnpm typecheck            # typecheck all workspaces
pnpm build                # build all workspaces

# Dev seed (wipes DB and loads dummy data — dev only)
docker compose exec api pnpm seed
```

---

## API reference

All routes require a valid session cookie (`tagg_session`) unless noted.

### Auth

| Method | Path                  | Description                                              |
| ------ | --------------------- | -------------------------------------------------------- |
| `GET`  | `/health`             | Health check (open, no auth required)                    |
| `GET`  | `/health/deep`        | Database reachability check; 503 if the database is down |
| `POST` | `/auth/signup`        | Create account; requires valid invite code               |
| `POST` | `/auth/login`         | Password login; sets `tagg_session` cookie               |
| `POST` | `/auth/logout`        | Invalidates current session                              |
| `GET`  | `/auth/me`            | Returns current user object                              |
| `POST` | `/auth/verify-email`  | Confirms email address via token from signup email       |
| `PATCH` | `/auth/password`     | Change your password (current + new)                     |
| `GET`  | `/invites/check`      | Validates an invite code (`?code=`)                      |
| `GET`  | `/invites`            | Signed in. Invites you've issued, with used / expired state |
| `POST` | `/invites`            | Signed in. Issue an invite (uses one of your invites; rate limited) |
| `DELETE` | `/invites/:id`      | Signed in. Revoke one of your unused invites (409 if already used) |

### Public (unauthenticated)

| Method | Path                    | Description                                                        |
| ------ | ----------------------- | ------------------------------------------------------------------ |
| `GET`  | `/public/concerts`      | Paginated public concert log. Query: `status`, `year`, `q`, `page` |
| `GET`  | `/public/concerts/:id`  | Full read-only concert detail (artists, venue, flyer, notes)       |
| `GET`  | `/public/copy`          | All editable site-text key/value pairs (no UI uses this at the moment) |

### Concerts

| Method   | Path                          | Description                                                         |
| -------- | ----------------------------- | ------------------------------------------------------------------- |
| `GET`    | `/concerts`                   | Paginated list. Query: `status`, `year`, `q`, `sort`, `page`, `limit` |
| `GET`    | `/concerts/stats`             | Count per status for the calling user                               |
| `GET`    | `/concerts/deep-stats`        | Home's data: totals, shows by year / month / day of week, top artists and venues, on this day (with flyers, falling back to the surrounding week; `?localDate=`), milestones, first and latest show, ticket prices |
| `GET`    | `/concerts/year-review`       | Every year with attended shows and its count, newest first (public)  |
| `GET`    | `/concerts/year-review/:year` | One year's recap: totals (vs previous year), new artists/venues, cities, top artists/venues, festivals, most-heard songs, photo/video counts, every show with flyer (public, attended only) |
| `GET`    | `/concerts/followup`          | Past shows still marked attending or interested (the daily follow-up prompt) |
| `GET`    | `/concerts/:idOrSlug`         | Single concert with artists, venue (incl. lat/lng), series, and attendance. Accepts the id, the readable `slug`, or an older `venue-slug-YYYY-MM-DD` / `festival-slug-YYYY-MM-DD` link |
| `POST`   | `/concerts`                   | Create concert + attendee record                                    |
| `PATCH`  | `/concerts/:id`               | Update attendance fields and/or shared concert fields               |
| `PATCH`  | `/concerts/batch`             | Batch-update attendance for up to 200 concerts in one transaction   |
| `DELETE` | `/concerts/:id`               | Remove calling user from the concert's attendee list                |
| `PUT`    | `/concerts/:id/artists`       | Atomically replace the full lineup; accepts `artistId` or `artistName`; rejects 422 if lineup mixes `headliner` + `co_headliner` roles |
| `POST`   | `/concerts/:id/flyer`         | Upload / replace concert flyer (JPEG/PNG/WebP ≤10 MB); SHA-256 dedup |
| `POST`   | `/concerts/:id/flyer/url`     | Import the concert flyer from an image URL (fetched safely server-side) |
| `DELETE` | `/concerts/:id/flyer`         | Remove the concert flyer                                            |
| `POST`   | `/concerts/parse-url`         | Parse an event URL; returns date, venue, artists. Pipeline: JSON-LD → OG meta → Claude (no UI uses this at the moment) |
| `PUT`    | `/concerts/:id/setlists/:artistId` | Save a setlist.fm link for an artist on this concert           |
| `DELETE` | `/concerts/:id/setlists/:artistId` | Remove a setlist link for an artist                             |

### Photos

| Method   | Path                           | Description                                                  |
| -------- | ------------------------------ | ------------------------------------------------------------ |
| `GET`    | `/concerts/:id/photos`         | List all photos for a concert                                |
| `POST`   | `/concerts/:id/photos`         | Upload photo (JPEG/PNG/WebP ≤30 MB) or video (MP4/MOV/WebM ≤500 MB); queues processing; SHA-256 dedup |
| `PUT`    | `/concerts/:id/photos/order`   | Reorder photos by providing a full ordered array of IDs      |
| `DELETE` | `/photos/:id`                  | Delete photo from MinIO and DB (uploader or admin only)      |
| `PUT`    | `/photos/:id/artists`          | Replace all artist tags on a photo. Body: `{ artistIds: string[] }` |
| `GET`    | `/photos/:id/artists`          | List artists currently tagged in a photo                     |
| `PATCH`  | `/photos/:id`                  | Mark a photo as a ticket stub or back. Body: `{ kind: "ticket" \| "photo" }` |
| `GET`    | `/photos/tickets`              | Every ticket stub with its show (the ticket wall)             |

### Artists

| Method   | Path                      | Description                                                        |
| -------- | ------------------------- | ------------------------------------------------------------------ |
| `GET`    | `/artists`                | Paginated artist list. Query: `q`, `page`, `limit`                 |
| `GET`    | `/artists/:slug`          | Artist detail with concert history and stats                       |
| `PATCH`  | `/artists/:slug`          | Update name, genre, bio, MusicBrainz ID. Slug regenerates on name change |
| `POST`   | `/artists/:slug/image`    | Upload / replace artist image (JPEG/PNG/WebP ≤10 MB)              |
| `POST`   | `/artists/:slug/image/url`| Import artist image from URL                                      |
| `DELETE` | `/artists/:slug/image`    | Remove artist image                                               |
| `POST`   | `/artists/:slug/enrich`   | Fetch bio, genre, MBID from Last.fm immediately                   |
| `POST`   | `/artists/:slug/enrich/queue` | Queue artist for background Last.fm enrichment                |
| `POST`   | `/artists/enrich/bulk`    | Queue all artists missing bio/image for enrichment                |
| `GET`    | `/artists/:slug/photos`   | All photos tagged with this artist (user's concerts only), newest concert first |
| `GET`    | `/artists/:slug/setlists` | All saved setlists for this artist from user's attended concerts   |

### Venues

| Method   | Path                              | Description                                                   |
| -------- | --------------------------------- | ------------------------------------------------------------- |
| `GET`    | `/venues`                         | Paginated venue list. Query: `q`, `page`, `limit`             |
| `GET`    | `/venues/map`                     | Every venue with coordinates, with its show count — the map's pins |
| `GET`    | `/venues/:slug`                   | Venue detail with concert history, stats, artists seen there, and aliases. An alias slug serves the canonical venue (the page then switches to the canonical URL) |
| `PATCH`  | `/venues/:slug`                   | Update name, city, region, country, lat, lng, capacity. Slug regenerates on name change |
| `POST`   | `/venues/:slug/photo`             | Upload / replace venue cover photo                            |
| `POST`   | `/venues/:slug/photo/url`         | Import venue cover photo from URL                             |
| `DELETE` | `/venues/:slug/photo`             | Remove venue cover photo                                      |
| `POST`   | `/venues/:slug/aliases`           | Add a historical name alias (with optional date range + notes)|
| `DELETE` | `/venues/:slug/aliases/:aliasId`  | Remove a venue alias                                          |

### Festivals

| Method | Path              | Description                                                    |
| ------ | ----------------- | -------------------------------------------------------------- |
| `GET`    | `/festivals`                   | Festival list with day and artist counts and your attendance (summarised from the days) |
| `GET`    | `/festivals/:slug`             | Festival detail built from its day shows: lineup (`sets`, `setsByDate`), each day's show and your status (`concertsByDate`), attendance summary, stats |
| `POST`   | `/festivals`                   | Create a festival and its day shows (one per lineup date, or per festival date when no lineup is given) |
| `PATCH`  | `/festivals/:slug`             | Edit name, brand, dates, venue, notes, source URL. Dates must still cover the festival's days; a venue change moves the days that were at the old venue |
| `POST`   | `/festivals/:slug/flyer`       | Upload / replace the festival flyer (days without their own flyer show it) |
| `POST`   | `/festivals/:slug/flyer/url`   | Import the festival flyer from an image URL |
| `DELETE` | `/festivals/:slug/flyer`       | Remove the festival flyer |
| `PUT`    | `/festivals/:slug/sets`        | Replace the lineup across the days: dates pick the day, new dates add days, emptied days are removed unless they hold photos or setlists |
| `PATCH`  | `/festivals/:slug/attendance`  | Set your attendance on every day at once. Body: `status` |
| `DELETE` | `/festivals/:slug`             | Delete the festival; its days stay as ordinary shows |

A festival is a container of day shows (`concerts.type = 'festival_day'`). Each day holds its own lineup and attendance; nothing about lineup or attendance is stored on the festival itself.

### Search, calendar & notifications

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET`  | `/search/index` | Everything searchable in one compact response — artists, venues, festivals, shows, and setlist songs (as `[song, artist, show index]`). The app filters it on the device, so search works offline |
| `GET`  | `/calendar/token` | Signed in. Your private calendar-feed token (created on first request) |
| `POST` | `/calendar/token/reset` | Signed in. New token; the old feed link stops working |
| `GET`  | `/calendar/:token.ics` | The feed (no sign-in; the token is the key): shows you're attending or interested in, plus the last year attended, as all-day events |
| `GET`  | `/push/key` | VAPID public key (the key pair is generated on first use and stored in `app_secrets`) |
| `POST` | `/push/subscribe` | Signed in. Save this device's Web Push subscription |
| `POST` | `/push/unsubscribe` | Signed in. Remove it |
| `POST` | `/push/test` | Signed in. Send a test notification to your devices |
| `GET`  | `/push/prefs` | Signed in. Which kinds you get: `{ tonight, howWasIt, anniversaries }` |
| `PUT`  | `/push/prefs` | Signed in. Change them (all three booleans) |

Reminders run inside the API every 15 minutes between 10:00 and 22:00 (`PUSH_TIMEZONE`): **Tonight: …** on the day of a show you're attending, **How was …?** the morning after a show still marked attending, and **N years ago today** for shows you attended (several on one day arrive as one notification). Each kind can be switched off in Account → Notifications (`users.push_prefs`); each is sent once (`push_sent`, anniversaries once a year).

### Integrations & export

| Method | Path                          | Description                                                        |
| ------ | ----------------------------- | ------------------------------------------------------------------ |
| `GET`  | `/setlistfm/search`           | Proxy to setlist.fm API. Query: `artist`, `date`. Returns empty results gracefully when key absent |
| `GET`  | `/setlistfm/artist/:mbidOrName` | Search setlist.fm for an artist's recent setlists by MBID or name |
| `GET`  | `/setlistfm/setlist/:id`      | Fetch a specific setlist by ID or full setlist.fm URL              |
| `GET`  | `/users/me/export.csv`        | Full CSV export in the original import format, plus a `setlist` column (that artist's setlist for the show as JSON) |
| `GET`  | `/offline/bundle?part=shows\|artists\|venues\|festivals` | Signed in. Every page's API response for that part (produced by running the normal routes in-process with the caller's cookie), keyed by URL, plus the image URLs they show — the app writes them into its offline cache |
| `GET`  | `/users/me/export.json` · `/users/me/export.md` | The same log as JSON (every show with venue, status, notes, ticket, lineup and setlists) or as a readable Markdown log grouped by year |

### Admin (requires `is_admin = true`)

Data cleanup (`/admin/data` in the app):

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET`  | `/admin/data/duplicates?type=venue\|artist` | Suggested duplicate groups: same name (ignoring case, accents, punctuation, a leading "The"), same name apart from generic venue words, or similar spelling; venues must share a city |
| `GET`  | `/admin/data/merge-preview?type&keepId&removeId` | What a merge would move and which blank fields it would fill |
| `POST` | `/admin/data/merge` | `{ type, keepId, removeIds[] }` — move every reference onto `keepId`, keep old venue names as aliases, delete the duplicates; logged with an undo snapshot |
| `POST` | `/admin/data/dismiss` | `{ type, ids[] }` — mark records as not duplicates |
| `GET`  | `/admin/data/merges` · `POST /admin/data/merges/:id/undo` | Merge history; undo the most recent merge |
| `GET`  | `/admin/data/health` · `POST /admin/data/health/fix` | Health checks (city spellings, untidy names, records with no shows, shows with no status/lineup, venues without a location) and their one-tap fixes |
| `GET`  | `/admin/data/similar?type&name&city` | Existing records a new name would duplicate (used by Add show) |
| `GET`  | `/admin/data/setlist-finder` | Automatic setlist finder progress: found, no match, still to check, shows with setlists |
| `POST` | `/admin/data/setlist-finder/run` | Queue a setlist finder scan now instead of waiting for the hourly one |

| Method  | Path                    | Description                                                        |
| ------- | ----------------------- | ------------------------------------------------------------------ |
| `POST`  | `/admin/imports`        | Upload a CSV file for async import; returns `importId`             |
| `GET`   | `/admin/imports`        | List all import jobs with status and row counts                    |
| `GET`   | `/admin/imports/:id`    | Get full status, row counts, and error samples for one import job  |
| `GET`   | `/admin/copy`           | List all CMS copy items ordered by section + key                   |
| `PATCH` | `/admin/copy/:key`      | Update the value of a single copy key. Body: `{ value: string }`   |

---

## CSV import

**Admin UI** (recommended): log in as admin → Account → **Import & export** (`/admin/imports`) → upload the CSV. The BullMQ worker processes it asynchronously and the page shows live status (queued → running → completed/failed) with row counts and any error samples.

**CLI** (useful for bootstrapping): runs the same upsert logic directly against the DB.

```bash
# Inside Docker:
docker compose exec api pnpm import-csv -- --username YOUR_USERNAME

# Outside Docker (with DATABASE_URL in env):
pnpm --filter @tagg/api import-csv -- --username YOUR_USERNAME [--file /path/to/file.csv]
```

The script is **idempotent** — safe to re-run. Duplicate concerts (same date + venue) are skipped; past dates → `attended`, future → `attending`.

### Dev seed (dummy data)

Wipes the database and loads 2 users, 5 venues, 8 artists, and 13 concerts with a realistic mix of statuses. **Dev only — destructive.**

```bash
# Full reset → migrate → seed
docker compose down -v && docker compose up -d
docker compose exec api pnpm db:migrate
docker compose exec api pnpm seed
# Login: admin@example.com / password123456
```

### Clearing and reseeding with real data

```bash
# Wipe music-domain tables only (users/sessions/invites survive):
docker compose exec db psql -U tagg -d tagg -c "
  TRUNCATE concert_attendees, concert_artists, photos, photo_artists,
           concerts, artists, venues, venue_aliases, event_series, site_copy
  CASCADE;
"
docker compose exec api pnpm import-csv -- --username YOUR_USERNAME

# Full reset (destroys all data including users):
docker compose down -v && docker compose up -d
docker compose exec api pnpm db:migrate
# then re-run quick-start steps
```

---

## Auth & security

- Passwords hashed with **argon2id** (`@node-rs/argon2`, OWASP 2024 params)
- Password length ≥ 12, checked against the **Pwned Passwords** k-anonymity API at signup
- **Server-side sessions** stored in Postgres; only the SHA-256 of the token is stored
- Session cookies: `HttpOnly`, `SameSite=Lax`, `Secure` in production
- Sessions auto-renew when more than halfway elapsed; explicit logout invalidates server-side
- Rate-limited routes: signup and login (configurable via `RATE_LIMIT_*` env vars)
- Invite codes hashed in DB; raw codes only ever exist in the URL sent to the invitee
- `@fastify/helmet` security headers; CORS locked to `CORS_ORIGINS`
- Email must be verified before logging in; token sent via SMTP, captured by Mailpit in dev

---

## Schema overview

| Table | Purpose |
| ----- | ------- |
| `users` | Accounts with username, email, argon2id hash, `is_admin`, `calendar_token` (private feed URL), `push_prefs` (which notifications) |
| `sessions` | Server-side sessions; stores SHA-256 of token |
| `auth_events` | Audit log: login, logout, password change |
| `email_verification_tokens` | Single-use tokens from signup email |
| `invites` | Invite codes (hashed); tracks who issued and who used |
| `concerts` | Canonical show record: date, venue FK, series FK, flyer, flyer hash. Maintained by the database: `type` (`festival_day` exactly when it belongs to a festival), `headliner_hint` (from the lineup), and a unique readable `slug` (festival or headliner + date). One show per festival per date |
| `concert_attendees` | Per-user junction: status (`interested` / `attending` / `attended` / `missed` / `cancelled`), notes, ticket price, timestamps |
| `concert_artists` | Lineup: artist FK, role (`headliner` / `co_headliner` / `support`, default `support`), set_order, appearance_notes, stage_name (festival days). At most one headliner, never alongside co-headliners (enforced by the database). `headliner` and `co_headliner` are mutually exclusive in any one lineup |
| `artists` | Canonical artist: name, slug, genre, bio, MusicBrainz ID, image key |
| `venues` | Canonical venue: name, slug, city, region, country, lat/lng, capacity, image key |
| `venue_aliases` | Historical names for a venue (Air Canada Centre → Scotiabank Arena). Linked to `canonical_venue_id`; alias slugs redirect to canonical at the API level |
| `event_series` | Festival: name, slug, year, `brand` (the festival across years, e.g. "Bluesfest" — filled from the name when empty), venue, dates, flyer. A container — its lineup and attendance live on its day shows (`concerts` with `type = 'festival_day'`) |
| `photos` | Concert photos/videos: MinIO key, kind (`photo`, `ticket`, `video`, …), dimensions, set_order, content_hash, processing variants |
| `photo_artists` | Junction: which artists appear in which photos (`photo_id`, `artist_id`) |
| `site_copy` | CMS key/value store for editable UI copy (key PK, value, description, section, updated_at) |
| `setlists` | Saved setlist.fm links per artist per concert: concert FK, artist FK, setlistfm_id (full URL or ID) |
| `setlist_songs` | Individual songs in a setlist: position, song_name, is_cover, cover_artist, notes |
| `imports` | CSV import job queue: status, row counts, error samples |
| `push_subscriptions` | Web Push subscriptions per device (endpoint, keys) |
| `push_sent` | Reminders already sent (user, show, kind) so each goes out once |
| `app_secrets` | Server-generated secrets, e.g. the VAPID key pair for Web Push |

---

## Migration workflow

```bash
# 1. edit apps/api/src/db/schema.ts
# 2. generate the SQL migration
pnpm db:generate
# 3. review apps/api/drizzle/*.sql, commit it
git add apps/api/drizzle/
# 4. pnpm db:migrate applies it on next startup or deploy
```

Applied migrations:

| File | Description |
| ---- | ----------- |
| `0000_damp_timeslip.sql` | Initial schema: all core tables |
| `0001_classy_albert_cleary.sql` | Email verification: `email_verified_at`, `email_verification_tokens` |
| `0002_brown_pretty_boy.sql` | Imports queue table; `flyer_key` on concerts; `image_key` on venues |
| `0003_photo_management.sql` | Photos: `set_order`, `content_hash` columns |
| `0004_flyer_hash.sql` | Concerts: `flyer_hash` column for upload deduplication |
| `0005_simplify_roles.sql` | Migrate `opener` + `festival_set` rows → `support`; recreate `concert_artist_role` enum with 3 values |
| `0006_venue_aliases.sql` | Add `venue_aliases` table with canonical FK, slug, date range, notes |
| `0007_photo_artists.sql` | Add `photo_artists` junction table (photo_id, artist_id PK + indexes) |
| `0008_site_copy.sql` | Add `site_copy` CMS table; seed default landing-page copy keys |
| `0009_festivals_refactor.sql` | Festivals as first-class entities: venue, dates, flyer on `event_series`; `festival_sets`, `festival_attendees` |
| `0010_setlist_song_sets.sql` | `set_name` on `setlist_songs` (main set / "Encore" / named set) for the setlist.fm song cache |
| `0011_data_cleanup.sql` | `merge_log` (each duplicate merge with an undo snapshot) and `duplicate_dismissals` ("not a duplicate" pairs) |
| `0012_setlist_lookups.sql` | `setlist_lookups`: which (show, artist) pairs the automatic setlist finder has searched, with attempts and result |
| `0013_artist_photos.sql` | `enriched_at` and `image_source` on artists (automatic photos; hourly enrichment moves through the list) |
| `0017_notification_prefs.sql` | `users.push_prefs`: which push notifications each user wants (tonight, how was it, anniversaries — all on by default) |
| `0016_brands_calendar_push_cleanup.sql` | `event_series.brand` (+ trigger) and consistent festival names (Ottawa Bluesfest → Bluesfest, year added where missing); `users.calendar_token`; `push_subscriptions`, `push_sent`, `app_secrets`; removes unused `event_series.image_key`, `concert_attendees.rating` / `rsvp_at`, `tags` / `concert_tags`, and the `dismissed` status (any rows become `missed`) |
| `0015_show_integrity_and_slugs.sql` | Database-enforced show rules: `type` derived from the festival link (+ check), one show per festival per date, festival dates/venue/year widened to cover its days, one headliner per lineup (no headliner + co-headliner mix), `headliner_hint` maintained from the lineup, readable unique `slug` on every show |
| `0014_festival_days_single_source.sql` | Festival days become the only source for festival lineups and attendance: `stage_name` on `concert_artists`; anything only `festival_sets` / `festival_attendees` held is copied onto the days, then both tables are dropped |

0005–0017 are not in the Drizzle journal; apply them by hand, then backfill the setlist cache once:

```bash
docker compose exec -T db psql -U tagg -d tagg -f - < apps/api/drizzle/0010_setlist_song_sets.sql
docker compose exec -T db psql -U tagg -d tagg -f - < apps/api/drizzle/0011_data_cleanup.sql
docker compose exec -T db psql -U tagg -d tagg -f - < apps/api/drizzle/0012_setlist_lookups.sql
docker compose exec -T db psql -U tagg -d tagg -f - < apps/api/drizzle/0013_artist_photos.sql
docker compose exec -T db psql -U tagg -d tagg -v ON_ERROR_STOP=1 -f - < apps/api/drizzle/0014_festival_days_single_source.sql
docker compose exec -T db psql -U tagg -d tagg -v ON_ERROR_STOP=1 -f - < apps/api/drizzle/0015_show_integrity_and_slugs.sql
docker compose exec -T db psql -U tagg -d tagg -v ON_ERROR_STOP=1 -f - < apps/api/drizzle/0016_brands_calendar_push_cleanup.sql
docker compose exec -T db psql -U tagg -d tagg -v ON_ERROR_STOP=1 -f - < apps/api/drizzle/0017_notification_prefs.sql
docker compose exec api npx tsx src/scripts/cache-setlists.ts
```

For destructive changes (drop column/table, rename), use **expand/contract**: add the new shape, backfill, switch reads/writes, then drop the old shape in a follow-up migration. Never edit a migration that has already been applied.

---

## Deployment (Tailscale, self-hosted from Mac)

This is a friends project served from a personal Mac — no VPS. Tailscale handles access control. All Docker services run with `restart: always` so they survive reboots automatically.

1. Install [Tailscale](https://tailscale.com) on the host Mac and each friend's device
2. Use **Tailscale Funnel** for public HTTPS, or share via Tailnet for Tailscale-only access
3. `docker compose up -d` keeps the stack running; `restart: always` handles reboots
4. Rotate all secrets from `.env.example` before sharing access (see [Dev logins](#dev-logins) warning)
5. Set `CORS_ORIGINS` to the Tailscale hostname
6. Set `MINIO_PUBLIC_URL` to the externally-reachable MinIO address (used in media URLs)
7. Optionally add `GOOGLE_MAPS_API_KEY` / `VITE_GOOGLE_MAPS_API_KEY`, `SETLISTFM_API_KEY`, `ANTHROPIC_API_KEY` in `.env`

### Installed app: HTTPS and the production build

The app on your phone's Home Screen only gets **offline mode** and **notifications** when two things are true — without them it still works, but only with a connection:

1. **It's served as a production build** (nginx), not the Vite dev server — only the build has a service worker. Add `docker-compose.https.yml` to the compose command:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.tailscale.yml -f docker-compose.https.yml up -d --build
   ```

   Leave the file off to go back to the dev server.

2. **It's opened over HTTPS.** Browsers only run service workers (and Web Push) on `https://` or `localhost` — not on `http://100.x.x.x:4444`, even on a private network. Tailscale provides HTTPS **inside your tailnet** — `tailscale serve` is still Tailscale-only; only `tailscale funnel` makes anything public:

   1. In the Tailscale admin console → **DNS**, make sure **MagicDNS** and **HTTPS Certificates** are enabled.
   2. On the Mac mini: `tailscale serve --bg 4444` — the app is now at `https://macmini.<your-tailnet>.ts.net` for devices on your tailnet (`tailscale serve status` shows the exact URL).
   3. In `.env` on the Mac mini, use that URL:

      ```env
      APP_URL=https://macmini.<your-tailnet>.ts.net
      MINIO_PUBLIC_URL=https://macmini.<your-tailnet>.ts.net
      CORS_ORIGINS=https://macmini.<your-tailnet>.ts.net,http://100.123.243.36:4444
      ```

      `MINIO_PUBLIC_URL` must be the app's own address — media is served through it at `/tagg-media/`, and an `http://` media URL on an `https://` page would be blocked. With an `https://` `APP_URL` the session cookie becomes secure-only, so sign in through the HTTPS address from then on.
   4. Restart: the compose command above.
   5. On the iPhone: open the HTTPS address in Safari, **Share → Add to Home Screen** (replace the old icon), open it from the Home Screen, then **Account → Notifications → Turn on** and **Save everything for offline**.

### Tailscale Funnel (public internet access)

Funnel exposes the app at `https://macmini.stingray-octatonic.ts.net` on the public internet. Media is proxied through the Vite dev server (`/tagg-media/` path), so only port 4444 needs to be tunnelled — MinIO port 9000 stays private.

**1 — Update `.env` on the Mac mini before enabling Funnel:**

```env
APP_URL=https://macmini.stingray-octatonic.ts.net
MINIO_PUBLIC_URL=https://macmini.stingray-octatonic.ts.net
CORS_ORIGINS=https://macmini.stingray-octatonic.ts.net,http://100.123.243.36:4444
```

`SESSION_COOKIE_OPTS.secure` is automatically set to `true` when `APP_URL` starts with `https://`, so cookies are hardened without any extra config.

**2 — Pull the latest changes and restart the stack:**

```bash
git pull
docker compose down && docker compose up -d
docker compose exec api pnpm db:migrate   # run if there are new migrations
```

**3 — Enable Funnel:**

```bash
# Route HTTPS traffic at your Tailscale domain to the local Vite server
tailscale serve --bg https / http://localhost:4444

# Open port 443 to the public internet
tailscale funnel --bg 443

# Confirm both are active
tailscale serve status
tailscale funnel status
```

The app will be reachable at `https://macmini.stingray-octatonic.ts.net` for anyone on the internet.

**4 — To turn Funnel off:**

```bash
tailscale funnel --bg off
# Optionally remove the serve rule too:
tailscale serve --bg https / off
```

> **Note:** HMR (hot-module reload) WebSocket connections from external users will silently fail — this has no effect on app functionality, only on live code reloading. For a fully hardened public deployment, build the frontend (`docker compose exec web pnpm build`) and serve it via an nginx container on port 80 instead of the Vite dev server.

---

### Automated backups

`scripts/backup.sh` dumps Postgres and mirrors all MinIO media to a local directory, then rotates to keep the last 3 of each. It reads credentials from `.env` automatically.

**Setup (macOS/Linux):**

```bash
# 1. Install mc if not already (see Prerequisites)
brew install minio/stable/mc   # macOS
# or: curl -O https://dl.min.io/client/mc/release/linux-amd64/mc && chmod +x mc && sudo mv mc /usr/local/bin/

# 2. Set your backup destination in .env
echo 'TAGG_BACKUP_DIR=/Volumes/YourDrive/Backups/tinnitus-a-go-go' >> .env

# 3. Test manually
bash /path/to/tinnitus-a-go-go/scripts/backup.sh

# 4. Create the log directory
mkdir -p /path/to/tinnitus-a-go-go/logs

# 5. Add to crontab — runs every hour on the hour
crontab -e
# Add this line (adjust path to match your clone location):
# 0 * * * * bash /path/to/tinnitus-a-go-go/scripts/backup.sh >> /path/to/tinnitus-a-go-go/logs/backup.log 2>&1
```

> **macOS note:** Cron jobs won't fire if the machine is asleep or the external drive isn't mounted — the script exits cleanly with an error in the log if `TAGG_BACKUP_DIR` is unset or unreachable.

---

## Feature overview

An installable web app (add it to your phone's Home Screen). Phone-first layout: a top bar with **search** and **+ add show**, and a floating tab dock — **Home · Shows · Artists · Festivals · Venues**.

### Shows
- **Past / Upcoming** tabs (Past by default): Past is attended, missed and cancelled; Upcoming is attending and interested. Ticket-style rows grouped by month, named by the whole bill ("Foo Fighters / Against Me!") or, for festival days, the festival and day ("Bluesfest 2025 · Day 3 of 11"). Filters, sort and page live in the URL.
- **Readable links** — `/shows/foo-fighters-2011-09-10`, `/shows/bluesfest-2025-2025-07-12`; ids and older links still open and switch to the readable one.
- **Show page** — a full-width banner with the flyer (tap for full size), status and share; the lineup in billing order with roles (one headliner, or co-headliners) and stages on festival days; your attendance (status, notes, ticket price); setlists per artist; photos and videos; the venue map. Festival days list the festival's other days, and you can swipe between them.
- **Media and setlists only for attended shows.** Missed and cancelled shows stay on the Shows page only.
- **Daily follow-up** — a prompt to resolve past shows still marked attending or interested.
- Statuses: `attended`, `attending`, `interested`, `missed`, `cancelled`.

### Festivals
- A festival is a **container of day shows**: each day is a show with its own lineup, attendance, photos and setlists; the festival page is built from its days.
- **Full lineup / All days / Day N** views; days are numbered from the festival's dates ("Day 5 of 5"); **Days attended** (e.g. 1/5); set every day's attendance at once.
- Editing the lineup edits the days (a new date adds a day; an emptied day is removed unless it has photos or setlists).
- **Brands across years** — "More Bluesfest" shows the other years' flyers. Festivals have no ratings.

### Home and Year in review
- **On this day** — the flyer of a show from today's date in an earlier year; otherwise **This week, years ago**.
- Totals, shows by year, day of week, month, most-seen artists, most-visited venues, milestones, first and latest show, and a link to the **ticket stub wall**.
- **Year in review** for every year: headline numbers vs the previous year, months, repeat and first-time artists, venues, festivals, songs heard live, and every show with its flyer.

### Artists and venues
- **Artists** — photo (found automatically from Deezer or Wikimedia Commons and stored locally), bio and genre from Last.fm, times seen and the longest gap between sightings, songs heard most, every show, tagged photos, saved setlists. Admins edit name, genre, bio, MusicBrainz id and image.
- **Venues** — **List | Map** switch. The map is full screen with a searchable by-city panel (tap a city to zoom to it); venues on the same spot share one pin. Venue pages show the photo, artists seen there, shows, location and **aliases** (former names — old links open the current venue).

### Search
- One search (magnifier or `/`) across shows, artists, festivals, venues and every song in your setlists ("All My Life — heard 3×"). It filters a compact index on the device, so results are instant.

### Media
- **Photos** (JPEG / PNG / WebP / HEIC) → WebP variants with location data stripped; **videos** (MP4 / MOV / WebM) → H.264 with a poster frame.
- **Background uploads** — files queue and upload one at a time while you use the app; a progress ring in the corner with Pause / Resume, Cancel and Retry. Files already on the show are skipped.
- **Photo viewer** — swipe between photos; swipe down or tap around a photo to close.
- Tag artists on photos; mark photos as **ticket stubs**; reorder; delete.
- **Share images** — story-sized (1080×1920) cards for shows, festivals and years.

### Setlists
- Link a setlist.fm setlist per artist per show (search or paste a URL); songs are cached in the database. An hourly **setlist finder** fills in the rest automatically, within setlist.fm's rate limits.

### Calendar feed
- A private subscribe link (Account → Calendar) that keeps Apple / Google / Outlook calendars up to date with shows you're attending or interested in.

### Admin
- **Import & export** — CSV import (queued in the worker); export your log as CSV (with setlists), JSON or Markdown.
- **Data cleanup** — suggested duplicate venues and artists with merge preview, merge history with undo, data health checks with one-tap fixes, setlist finder progress; similar names flagged when adding a show.
- Invites (accounts are invite-only), service health links.

### Needs HTTPS (dormant on plain http)
- **Notifications** (Tonight, How was it?, show anniversaries — each switchable), **offline mode** (pages and photos kept on the device, Save everything), and **offline attendance edits**. Browsers only allow these over HTTPS; see [Installed app: HTTPS and the production build](#installed-app-https-and-the-production-build). On plain http they're hidden.

### Maps
- Google Maps with a custom dark style and branded pins when `VITE_GOOGLE_MAPS_API_KEY` is set; an OpenStreetMap link otherwise.

---

## Roadmap

### ✅ Shipped
Summarised by area — [CHANGELOG.md](./CHANGELOG.md) has the detail.

- **Foundation** — Docker Compose stack, Postgres + Drizzle, argon2id auth, email verification, invite-only accounts, self-hosting on a Mac mini over Tailscale, automated backups
- **The log** — shows with whole-bill names and readable links; Past / Upcoming; lineups with database-enforced billing rules; attendance with notes and ticket price; daily follow-up prompt
- **Festivals** — festivals as containers of day shows; day numbers from the festival's dates; days attended; brands linking years
- **Media** — photos and videos with WebP / H.264 processing, HEIC support, artist tagging, ticket stubs, background upload queue, full-screen viewer, share images
- **Setlists** — per-artist setlist.fm links with a song cache and an automatic hourly finder
- **Artists and venues** — automatic artist photos (stored locally), Last.fm bios, venue aliases, full-screen venue map, artists-seen and songs-heard stats
- **Home and Year in review** — on this day, totals, charts, milestones, a recap for every year
- **App** — phone-first UI kit, tab dock, search across everything (including songs), pull to refresh, skeleton loaders, calendar feed
- **Admin** — CSV import, CSV / JSON / Markdown export, data cleanup (duplicates, merge + undo, health checks)
- **Built, waiting on HTTPS** — Web Push (tonight, how was it, anniversaries), offline mode, offline attendance edits, production web build overlay

### ⏳ Open
- **Photo captions** — a caption per photo
- **Venue data** — fix shared / wrong coordinates (Velvet Underground / The Concert Hall; Rogers Stadium) and merge renamed venues as aliases (Air Canada Centre / Scotiabank Arena, Molson Canadian Amphitheatre / Budweiser Stage, Landsdowne Park / TD Place) — doable today from venue pages and Data cleanup
- **Endpoints without a UI** — `/public/concerts`, `/public/copy` + `/admin/copy`, `/concerts/batch`, `/concerts/parse-url`, `/concerts/stats`: bring back a screen for them, or remove them
- **Code health** — no automated tests yet; `ConcertDetailPage.tsx` is ~2,700 lines; the web bundle has a chunk over 500 KB
- **Multi-user social** — "shows we both went to", shared activity within the instance

### 💡 Wishlist
- **YouTube embeds** — a live recording or video on a show or artist page
- **Flyer finder** — find posters for historical shows from public sources and approve or skip them in a batch (without an AI key)

See [CHANGELOG.md](./CHANGELOG.md) for full change history.
