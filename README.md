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
| <http://localhost:4444>        | Web app (public landing page)   |
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
| Grid editor    | AG-Grid Community v35                                                |
| Maps           | `@vis.gl/react-google-maps` v1 (dark-styled, custom pin; OSM fallback) |
| Image proc.    | Sharp (WebP variants at 200/800/1600 px, EXIF GPS strip) via BullMQ worker |
| Video proc.    | ffmpeg (H.264 MP4 transcode + WebP poster frame) via BullMQ worker   |
| LLM fallback   | `@anthropic-ai/sdk` — Claude Haiku for URL paste extraction (optional)|
| Artist data    | Last.fm API — bio, genre, MusicBrainz ID enrichment (optional)       |
| Fonts          | Antonio (display) · Caveat Brush (script) · Inter (body) · JetBrains Mono |
| Mail (dev)     | Mailpit                                                               |
| Dev orchestr.  | Docker Compose                                                        |

---

## Project structure

```
.
├── apps/
│   ├── api/                  Fastify API + Drizzle schema + migrations + auth
│   │   ├── src/
│   │   │   ├── auth/         password hashing, sessions, tokens, email, middleware
│   │   │   ├── db/           schema.ts, client, migrate runner
│   │   │   ├── routes/
│   │   │   │   ├── health.ts
│   │   │   │   ├── auth.ts           signup, login, logout, me, verify-email
│   │   │   │   ├── invites.ts        invite check + issue
│   │   │   │   ├── concerts.ts       full concert CRUD + flyer + lineup + parse-url + setlists;
│   │   │   │   │                     top-billing exclusivity enforcement (422 if headliner
│   │   │   │   │                     + co_headliner roles coexist); headliner_hint sync;
│   │   │   │   │                     festival flyer inheritance for festival_day concerts
│   │   │   │   ├── photos.ts         upload, list, reorder, delete, artist-tag endpoints
│   │   │   │   ├── artists.ts        artist list, detail, PATCH, image upload, tagged photos, setlists
│   │   │   │   ├── venues.ts         venue list, detail, PATCH, cover photo, aliases
│   │   │   │   ├── parseurl.ts       POST /concerts/parse-url — JSON-LD → OG → Claude
│   │   │   │   ├── series.ts         festival/series list + detail
│   │   │   │   ├── export.ts         CSV export
│   │   │   │   ├── stats.ts          GET /concerts/deep-stats — 12 parallel queries:
│   │   │   │   │                     by-status, by-year, by-month, by-DOW, heatmap,
│   │   │   │   │                     top artists/venues, rating dist, on-this-day,
│   │   │   │   │                     ticket prices, milestones, first/last show
│   │   │   │   ├── copy.ts           GET /public/copy (open); GET+PATCH /admin/copy (admin)
│   │   │   │   ├── setlistfm.ts      setlist.fm proxy: search by artist+date, by artist MBID/name,
│   │   │   │   │                     fetch by setlist ID or URL (optional API key)
│   │   │   │   └── admin/
│   │   │   │       └── imports.ts    async CSV import queue
│   │   │   ├── lib/          env validation (Zod), s3 client, mailer, BullMQ queues
│   │   │   └── scripts/      bootstrap-invite, import-csv (direct-to-DB)
│   │   └── drizzle/          generated SQL migrations (committed to git)
│   │
│   ├── web/                  Vite + React 18 + Tailwind frontend
│   │   ├── public/
│   │   │   ├── favicon.svg   bleeding ear, newspaper cut-and-paste style
│   │   │   └── logo.svg      full wordmark: ear mark + ransom-note letter tiles
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── LandingPage.tsx       public marketing: branded concert log with
│   │       │   │                         year filter (pills grouped by decade), status
│   │       │   │                         filter, text search; all copy CMS-driven
│   │       │   ├── PublicConcertPage.tsx  read-only show detail at /shows/:id;
│   │       │   │                         two-column layout when flyer present (poster
│   │       │   │                         sticky left, content right); login CTA for guests
│   │       │   ├── LoginPage.tsx         username-or-email + password
│   │       │   ├── SignupPage.tsx         invite code + new account form
│   │       │   ├── VerifyEmailPage.tsx   token-in-URL email confirmation
│   │       │   ├── RequireAuth.tsx       redirect-to-login guard
│   │       │   ├── RequireAdmin.tsx      is_admin guard
│   │       │   ├── AppShell.tsx          authenticated shell: header, desktop nav,
│   │       │   │                         mobile full-screen overlay nav, dashboard
│   │       │   ├── ConcertsPage.tsx      card grid with URL-synced page/sort/status/search;
│   │       │   │                         newest/oldest sort tabs; + Add show button
│   │       │   ├── AddConcertModal.tsx   create show: URL paste import, date, type,
│   │       │   │                         venue autocomplete, event/festival name,
│   │       │   │                         lineup with artist search, status + notes
│   │       │   ├── ConcertDetailPage.tsx full detail view:
│   │       │   │                         · Flyer panel with drag-and-drop upload + SHA-256 dedup
│   │       │   │                         · Compact Google Maps snippet (when venue has coords)
│   │       │   │                         · Concert meta editor (venue autocomplete, date, type, series)
│   │       │   │                         · Lineup editor (add/remove/reorder/role);
│   │       │   │                           enforceTopBilling() prevents mixing headliner +
│   │       │   │                           co_headliner simultaneously; ★ shown for both
│   │       │   │                         · Attendance editor (status, rating, notes, ticket price)
│   │       │   │                         · Media gallery (photos + videos): drag-and-drop upload,
│   │       │   │                           XHR progress overlay (blocks UI, live %), reorder,
│   │       │   │                           delete, SHA-256 dedup, lightbox with video playback,
│   │       │   │                           "⊕ Tag artists" tagging mode
│   │       │   │                         · Per-artist setlists: Load from setlist.fm or paste URL,
│   │       │   │                           save/edit/remove links, works without API key
│   │       │   ├── ConcertGridPage.tsx   AG-Grid batch editor — URL-synced status filter +
│   │       │   │                         quick search; 1 000 rows; inline editing; undo/redo
│   │       │   ├── StatsPage.tsx         personal analytics at /app/stats:
│   │       │   │                         overview tiles (attended count, unique artists/venues,
│   │       │   │                         years active, avg rating, first/last show),
│   │       │   │                         on-this-day card (uses local browser date, not server),
│   │       │   │                         activity by year (full-width stacked bars),
│   │       │   │                         year×month heatmap, day-of-week + month mini-charts,
│   │       │   │                         top 20 artists + top 15 venues, rating distribution,
│   │       │   │                         ticket price stats, milestone timeline —
│   │       │   │                         all custom CSS/SVG (no chart lib)
│   │       │   ├── ArtistsPage.tsx       paginated artist card grid (EntityCard) with search
│   │       │   ├── ArtistPage.tsx        artist detail: image, bio, stats, concert history,
│   │       │   │                         tagged photos section, setlists section; inline edit form
│   │       │   ├── VenuesPage.tsx        paginated venue card grid (EntityCard) with search
│   │       │   ├── VenuePage.tsx         venue detail: cover photo, stats, "Also known as"
│   │       │   │                         aliases, full Google Maps embed, show history;
│   │       │   │                         inline edit form for all fields
│   │       │   ├── FestivalsPage.tsx     paginated festival card grid (EntityCard)
│   │       │   ├── SeriesPage.tsx        festival detail: day-by-day lineup + stats
│   │       │   ├── CopyEditorPage.tsx    admin CMS at /app/admin/copy: edit all landing-page
│   │       │   │                         and UI copy in-place; grouped by section; instant
│   │       │   │                         cache invalidation on save
│   │       │   ├── FollowUpPrompt.tsx    dismissible banner for attended shows lacking
│   │       │   │                         rating or notes in the last 14 days
│   │       │   └── ImportsPage.tsx       admin: CSV import job queue with live status
│   │       ├── components/
│   │       │   ├── EntityCard.tsx        shared card component used by ArtistsPage,
│   │       │   │                         VenuesPage, FestivalsPage — image/initials placeholder,
│   │       │   │                         sub1/sub2 lines, 16:9 aspect ratio, placeholder colour theming
│   │       │   ├── PhotoCarousel.tsx     full-screen Swiper lightbox shared across the app:
│   │       │   │                         touch swipe, mouse drag, keyboard ← →, Escape to close,
│   │       │   │                         video slides with autoplay + controls, per-slide captions,
│   │       │   │                         portalled to document.body (escapes CSS stacking contexts),
│   │       │   │                         semi-transparent blurred overlay, body scroll-lock on open
│   │       │   ├── VenueMap.tsx          Google Maps embed (dark style, pink/lime pin);
│   │       │   │                         OSM fallback when API key absent
│   │       │   └── Wordmark.tsx          Illustrator-exported SVG logo (190×92.3 viewBox);
│   │       │                             TINNITUS in white/#a8ff3e, a-go-go in #f87171
│   │       ├── lib/
│   │       │   ├── api.ts                typed fetch wrapper + all request/response interfaces
│   │       │   ├── auth-context.tsx      React context: user, signOut
│   │       │   ├── useCopyValue.ts       useCopy(fallbacks) + useCopyValue(key, fallback) —
│   │       │   │                         reads from shared ["public/copy"] React Query cache
│   │       │   └── cn.ts                 clsx/tailwind-merge helper
│   │       └── styles/
│   │           └── globals.css           Tailwind base, body gradient, ::selection
│   │
│   └── worker/               BullMQ worker:
│                             · Images — Sharp WebP variants (200/800/1600 px), EXIF GPS strip
│                             · Videos — ffmpeg H.264 MP4 transcode + WebP poster frame extraction
│                             · Artist enrichment — scheduled Last.fm fetch (hourly, 50 artists/batch)
│
├── packages/
│   └── shared/               Zod schemas + TypeScript types shared by api + web
│                             (AttendanceStatus, concertArtistRoles, slugify, etc.)
│
├── scripts/
│   └── backup.sh             Hourly Postgres dump + MinIO mirror; 3-backup rotation;
│                             reads TAGG_BACKUP_DIR from .env; run via cron on prod machine
│
├── logs/                     Backup and ops log output (gitignored except .gitkeep)
├── docker-compose.yml        7 services: api, web, worker, db, redis, minio,
│                             minio-init (bucket setup), mailpit — all restart: always
├── .env.example              all required env vars with safe dev defaults
├── .npmrc                    shamefully-hoist=true — ensures pnpm hoists all deps to
│                             root node_modules so Docker bind mounts resolve correctly
├── CHANGELOG.md              Keep a Changelog format, CalVer
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
| `SETLISTFM_API_KEY`        | Optional — enables setlist.fm concert lookups                     |
| `ANTHROPIC_API_KEY`        | Optional — enables Claude fallback for URL paste parser           |
| `LASTFM_API_KEY`           | Optional — enables Last.fm artist enrichment (bio, genre, MBID)   |
| `GOOGLE_MAPS_API_KEY`      | Optional — enables embedded maps; OSM link shown when absent      |
| `VITE_GOOGLE_MAPS_API_KEY` | Frontend Maps key (passed to `@vis.gl/react-google-maps`)         |
| `APP_URL`                  | Public app base URL (used in email links)                         |
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
| `POST` | `/auth/signup`        | Create account; requires valid invite code               |
| `POST` | `/auth/login`         | Password login; sets `tagg_session` cookie               |
| `POST` | `/auth/logout`        | Invalidates current session                              |
| `GET`  | `/auth/me`            | Returns current user object                              |
| `POST` | `/auth/verify-email`  | Confirms email address via token from signup email       |
| `GET`  | `/invites/check`      | Validates an invite code (`?code=`)                      |

### Public (unauthenticated)

| Method | Path                    | Description                                                        |
| ------ | ----------------------- | ------------------------------------------------------------------ |
| `GET`  | `/public/concerts`      | Paginated public concert log. Query: `status`, `year`, `q`, `page` |
| `GET`  | `/public/concerts/:id`  | Full read-only concert detail (artists, venue, flyer, notes)       |
| `GET`  | `/public/copy`          | All CMS copy key/value pairs for the landing page and public UI    |

### Concerts

| Method   | Path                          | Description                                                         |
| -------- | ----------------------------- | ------------------------------------------------------------------- |
| `GET`    | `/concerts`                   | Paginated list. Query: `status`, `year`, `q`, `sort`, `page`, `limit` |
| `GET`    | `/concerts/stats`             | Count per status for the calling user                               |
| `GET`    | `/concerts/deep-stats`        | Full analytics payload: 12 aggregations (by year/month/DOW, heatmap, top artists/venues, rating dist, on-this-day, milestones, ticket prices, overview totals) |
| `GET`    | `/concerts/followup`          | Shows attended in the last 14 days without a rating or notes        |
| `GET`    | `/concerts/:id`               | Single concert with artists, venue (incl. lat/lng), series, and attendance |
| `POST`   | `/concerts`                   | Create concert + attendee record                                    |
| `PATCH`  | `/concerts/:id`               | Update attendance fields and/or shared concert fields               |
| `PATCH`  | `/concerts/batch`             | Batch-update attendance for up to 200 concerts in one transaction   |
| `DELETE` | `/concerts/:id`               | Remove calling user from the concert's attendee list                |
| `PUT`    | `/concerts/:id/artists`       | Atomically replace the full lineup; accepts `artistId` or `artistName`; rejects 422 if lineup mixes `headliner` + `co_headliner` roles |
| `POST`   | `/concerts/:id/flyer`         | Upload / replace concert flyer (JPEG/PNG/WebP ≤10 MB); SHA-256 dedup |
| `DELETE` | `/concerts/:id/flyer`         | Remove the concert flyer                                            |
| `POST`   | `/concerts/parse-url`         | Parse an event URL; returns date, venue, artists. Pipeline: JSON-LD → OG meta → Claude |
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
| `GET`    | `/venues/:slug`                   | Venue detail with concert history, stats, and aliases. Alias slugs redirect to canonical (302) |
| `PATCH`  | `/venues/:slug`                   | Update name, city, region, country, lat, lng, capacity. Slug regenerates on name change |
| `POST`   | `/venues/:slug/photo`             | Upload / replace venue cover photo                            |
| `POST`   | `/venues/:slug/photo/url`         | Import venue cover photo from URL                             |
| `DELETE` | `/venues/:slug/photo`             | Remove venue cover photo                                      |
| `POST`   | `/venues/:slug/aliases`           | Add a historical name alias (with optional date range + notes)|
| `DELETE` | `/venues/:slug/aliases/:aliasId`  | Remove a venue alias                                          |

### Series / Festivals

| Method | Path              | Description                                                    |
| ------ | ----------------- | -------------------------------------------------------------- |
| `GET`  | `/series`         | Paginated festival/series list. Query: `page`, `limit`         |
| `GET`  | `/series/:slug`   | Series detail with day-by-day concert list and stats           |

### Integrations & export

| Method | Path                          | Description                                                        |
| ------ | ----------------------------- | ------------------------------------------------------------------ |
| `GET`  | `/setlistfm/search`           | Proxy to setlist.fm API. Query: `artist`, `date`. Returns empty results gracefully when key absent |
| `GET`  | `/setlistfm/artist/:mbidOrName` | Search setlist.fm for an artist's recent setlists by MBID or name |
| `GET`  | `/setlistfm/setlist/:id`      | Fetch a specific setlist by ID or full setlist.fm URL              |
| `GET`  | `/users/me/export.csv`        | Full CSV export in the original import format                      |

### Admin (requires `is_admin = true`)

| Method  | Path                    | Description                                                        |
| ------- | ----------------------- | ------------------------------------------------------------------ |
| `POST`  | `/admin/imports`        | Upload a CSV file for async import; returns `importId`             |
| `GET`   | `/admin/imports`        | List all import jobs with status and row counts                    |
| `GET`   | `/admin/imports/:id`    | Get full status, row counts, and error samples for one import job  |
| `GET`   | `/admin/copy`           | List all CMS copy items ordered by section + key                   |
| `PATCH` | `/admin/copy/:key`      | Update the value of a single copy key. Body: `{ value: string }`   |

---

## CSV import

**Admin UI** (recommended): log in as admin → `/app/admin/imports` → upload the CSV. The BullMQ worker processes it asynchronously and the page shows live status (queued → running → completed/failed) with row counts and any error samples.

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
| `users` | Accounts with username, email, argon2id hash, `is_admin` |
| `sessions` | Server-side sessions; stores SHA-256 of token |
| `auth_events` | Audit log: login, logout, password change |
| `email_verification_tokens` | Single-use tokens from signup email |
| `invites` | Invite codes (hashed); tracks who issued and who used |
| `concerts` | Canonical show record: date, type, venue FK, series FK, flyer, flyer hash, headliner hint |
| `concert_attendees` | Per-user junction: status, rating, notes, ticket price, timestamps |
| `concert_artists` | Lineup: artist FK, role (`headliner` / `co_headliner` / `support`), set_order, appearance_notes. `headliner` and `co_headliner` are mutually exclusive in any one lineup |
| `artists` | Canonical artist: name, slug, genre, bio, MusicBrainz ID, image key |
| `venues` | Canonical venue: name, slug, city, region, country, lat/lng, capacity, image key |
| `venue_aliases` | Historical names for a venue (Air Canada Centre → Scotiabank Arena). Linked to `canonical_venue_id`; alias slugs redirect to canonical at the API level |
| `event_series` | Festival / tour series: name, slug, year |
| `photos` | Concert photos/videos: MinIO key, kind, dimensions, set_order, content_hash, processing variants |
| `photo_artists` | Junction: which artists appear in which photos (`photo_id`, `artist_id`) |
| `site_copy` | CMS key/value store for editable UI copy (key PK, value, description, section, updated_at) |
| `setlists` | Saved setlist.fm links per artist per concert: concert FK, artist FK, setlistfm_id (full URL or ID) |
| `setlist_songs` | Individual songs in a setlist: position, song_name, is_cover, cover_artist, notes |
| `imports` | CSV import job queue: status, row counts, error samples |

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

### Concert log
- Create, edit, and delete shows with date, venue, lineup, attendance status, personal rating, notes, ticket price, source URL
- Attendance statuses: `attended`, `attending`, `interested`, `missed`, `cancelled`, `dismissed`
- Lineup roles: `headliner`, `co_headliner`, `support` — `headliner` and `co_headliner` are mutually exclusive (cannot coexist in one lineup)
- Concert type: standard show vs. festival day (festival days link to a named series + year)
- **Festival flyer inheritance** — `festival_day` concerts without their own flyer automatically display the festival's flyer; `flyerInherited` flag distinguishes inherited vs. direct flyers
- Event notes (shared across all attendees) separate from personal notes (private per user)

### Public show log
- Unauthenticated landing page (`/`) shows the full concert log with year filter (pills grouped by decade), status filter, and text search — all copy driven by the CMS
- Public concert detail page (`/shows/:id`) renders the full read-only show view: headliner(s), lineup, venue, date, notes, flyer, source URL; two-column layout when a flyer is present (poster sticky-left, content right)
- Logged-in users see an "edit in my log" link on the public detail page

### Concert list (authenticated card grid)
- URL-synced state: page, sort (newest/oldest), status filter, and search query all live in the URL — browser back/forward works as expected
- Card shows headliner(s), co-headliner pairing ("Artist A & Artist B"), supporting acts (up to 3), venue, date, flyer thumbnail, and status badge

### Add show modal
- **URL paste import** — paste a Ticketmaster / Eventbrite / AXS URL: server extracts date, venue, and artists via JSON-LD → Open Graph meta → Claude API fallback; pre-fills the form
- Venue autocomplete (debounced, fills city + region automatically)
- Artist search with fuzzy "did you mean?" suggestion; type a new name to create on save

### Concert detail
- **Flyer panel** — drag-and-drop or click to upload; SHA-256 dedup; delete; tap to open full-screen modal; on mobile/tablet the flyer appears inline between the title/date/venue header and the concert meta editor; on desktop it is a sticky left column
- **Compact map** — 160 px Google Maps snippet in the header when venue has lat/lng
- **Concert info editor** — inline edit: date, type, venue (with autocomplete), event/festival name, notes, source URL
- **Lineup editor** — add/remove/reorder artists per role tier; fuzzy artist search; free-text new artist creation; `enforceTopBilling()` cascades role changes to prevent mixing `headliner` + `co_headliner`; ★ indicator shown for both headliner and co_headliner roles
- **Attendance editor** — status, rating (1–10), personal notes, ticket price
- **Photo gallery** — drag-and-drop or click upload; **sequential upload**: each file uploads, then polls BullMQ until `processing = false` before the next begins — photo appears in gallery immediately, no server overload; silent duplicate skip on batch drag (SHA-256 dedup, no error shown); reorder with ← → controls; delete with confirm overlay; Swiper lightbox (`PhotoCarousel`)
- **"⊕ Tag artists" mode** — pick an artist from the lineup, tap photos to select (lime checkmark overlay), click "Tag N photos" to assign; existing tags shown as initials badges; click a badge to untag; multi-pass support
- **Per-artist setlists** — each artist in the lineup has their own setlist lookup; "Load" button searches setlist.fm by artist name + concert date; "URL" button allows manual paste of a setlist.fm link (works even when API key is missing); saved links persist to DB and show Edit/Remove buttons; links display with "(linked)" indicator when song data isn't fetched

### Co-headliner support
- Two or more artists with role `co_headliner` display as "Artist A & Artist B" in all page titles, card headlines, and the public log
- `headliner` and `co_headliner` roles are **mutually exclusive**: the UI enforces this via `enforceTopBilling()` on every role change; the API rejects lineups that mix the two with HTTP 422
- `concerts.headliner_hint` is kept in sync: for co-headliner shows it is set to all co-headliner names joined with " & "

### Stats dashboard
- Personal analytics page at `/app/stats`
- **Overview tiles** — attended count (primary), total logged, unique artists, unique venues, years active, average rating, first and latest show
- **On This Day** — accent-pink card showing concerts from today's date in prior years; uses local browser date (not server time) so it's always correct regardless of server timezone
- **Activity by year** — stacked bar chart: lime = attended, dim overlay = other statuses; sorted newest-first
- **Year × month heatmap** — GitHub contribution-style grid, opacity-scaled lime cells
- **Day of week + month of year** — mini vertical bar charts showing when you go to shows
- **Top 20 artists + top 15 venues** — horizontal bars with show count and average rating; links to detail pages
- **Rating distribution** — vertical bars 1–10; green ≥ 8, red ≤ 4
- **Status donut** — SVG `stroke-dasharray` ring chart
- **Ticket price stats** — average price and most expensive show link
- **Milestone timeline** — 1st, 5th, 10th, 25th, 50th, 100th, 200th, 500th attended show
- All charts custom CSS/SVG — no external chart library

### Artist, venue, and festival pages
- Shared `EntityCard` component across all three index pages — consistent image/initials placeholder, sub-lines, **16:9 aspect ratio**, and placeholder colour theming
- Detail: image, genre, bio, MusicBrainz link, stats (total / attended / upcoming), full concert history
- **Inline edit form** — name, genre, bio, MusicBrainz ID, image upload/URL import/delete
- **Last.fm enrichment** — "Fetch from Last.fm" button fetches bio, genre, and MusicBrainz ID; scheduled worker enriches 50 artists/hour automatically
- **Artist stats** — first/last seen dates count only attended shows; interested/attending shows display as "Playing [venue] on [date]"
- **Photos section** — all photos tagged with this artist across all concerts, grouped by concert, with lightbox
- **Setlists section** — all saved setlists for this artist from user's attended concerts, grouped by concert date with venue info; links to setlist.fm and concert detail page; displays song list when available

### Venue pages
- Paginated card grid with search
- Detail: cover photo, stats, "Also known as" aliases panel, **full Google Maps embed** (320 px), show history
- **Inline edit form** — name, city, region, country, lat/lng, capacity, photo upload/URL import/delete
- **Alias management** — add historical names with optional date ranges and notes; alias slugs at the API level redirect to the canonical venue

### Batch editor (AG-Grid)
- URL-synced status filter tabs + quick-search input
- Up to 1,000 rows; inline edit status, rating, notes, date, venue, city, type, ticket price + currency; dirty-row highlight; 50-step undo/redo; single "Save changes" call
- Artist expand rows — click ▸ N to insert full-width artist sub-rows beneath a concert row; sub-rows stay pinned below their parent on any sort via `postSortRows` hook

### CMS copy editor
- Admin-only page at `/app/admin/copy`
- All editable text on the landing page and public UI is stored in the `site_copy` Postgres table
- Editor groups keys by section; inline textarea edit with save/cancel; shows description, key (monospace), last updated timestamp
- Save invalidates the shared `["public/copy"]` React Query cache — changes reflect on the landing page immediately with no deploy required
- Landing page uses `useCopy(fallbacks)` hook: falls back to hardcoded strings if the DB is empty (safe on fresh installs)

### Media (photos + videos)
- **Photos** (JPEG/PNG/WebP ≤ 30 MB): worker generates WebP variants at 200/800/1600 px, strips EXIF GPS
- **Videos** (MP4/MOV/WebM ≤ 500 MB): ffmpeg worker transcodes to H.264 MP4 and extracts a WebP poster frame; lightbox plays video inline with poster
- **Sequential upload** — files upload one at a time; after each upload the client polls the API every 2 s until the BullMQ worker sets `processing = false`, then shows the photo in the gallery before starting the next file; prevents server overload and gives immediate visual feedback
- **Silent duplicate skip** — on batch drag, each file is SHA-256 hashed client-side; already-present hashes are skipped without an error; only new files are uploaded
- **Upload progress overlay** — full-screen modal with spinner, file counter ("Photo 2 of 5"), filename, live percentage, animated progress bar, and a "Worker processing…" phase; blocks all interaction during upload
- **Swiper lightbox** (`PhotoCarousel`) — shared component for the concert gallery and artist photos; touch swipe, mouse drag, keyboard ← → navigation, Escape to close; portalled to `document.body` so it sits above all page stacking contexts; `bg-black/85 backdrop-blur-md` overlay; body `overflow-hidden` lock applied on open and removed on close
- SHA-256 dedup at both client (skip before upload) and server (flyer endpoint) levels
- Direct public bucket URLs — no presigning required
- Flyer, artist image, venue cover photo each stored at deterministic MinIO paths

### Google Maps
- `VenueMap` component uses `@vis.gl/react-google-maps` with a custom dark style (near-black base, muted roads, deep-navy water) and a branded pink/lime pin
- Gracefully degrades to a styled OSM link when `VITE_GOOGLE_MAPS_API_KEY` is absent

---

## Roadmap

### ✅ Shipped
- **Foundation** — Docker Compose, schema, migrations, argon2id auth, email verification, invite system
- **CSV import + export** — async BullMQ import with admin UI; full round-trip CSV export
- **Concert CRUD** — create, edit, delete; all attendance fields; event notes; source URL
- **Lineup management** — `PUT /concerts/:id/artists`; add by search or free-text; role + order editing; upsert on save
- **Excel-style editor** — AG-Grid batch PATCH, dirty-row highlighting, 50-step undo/redo, URL-synced filters, artist expand rows, full field editing (date, venue, city, type, ticket)
- **Photos** — drag-and-drop upload, MinIO + Sharp WebP variants, gallery with reorder and delete, SHA-256 dedup
- **Flyers** — drag-and-drop upload, SHA-256 dedup, delete
- **Artist / venue / festival pages** — card grids, detail pages, stats, concert history
- **Venue autocomplete** — debounced search in Add show and concert editor
- **Setlist.fm integration** — optional API key; graceful no-key fallback
- **Follow-up prompt** — dismissible banner for recently attended shows
- **Rebrand** — lime green accent, newspaper cut-and-paste favicon + logo, mobile nav overlay
- **Artist editing** — inline edit form: name, genre, bio, MusicBrainz ID, image
- **Venue editing** — inline edit form: name, city, region, country, lat/lng, capacity
- **Venue aliases** — `venue_aliases` table; "Also known as" panel; alias slug redirects
- **URL paste parser** — JSON-LD → Open Graph → Claude extraction; pre-fills Add show form
- **Role simplification** — three roles (`headliner`, `co_headliner`, `support`); legacy data migrated
- **Co-headliner display + exclusivity** — "A & B" display everywhere; `headliner`/`co_headliner` mutually exclusive; API 422 guard; `enforceTopBilling()` on lineup edits
- **URL-synced concert list** — page, sort, status, search all in the URL
- **Google Maps** — custom dark-styled embed on venue + concert detail pages; OSM fallback
- **Photo–artist tagging** — `photo_artists` junction; tagging mode in gallery; Photos section on artist page
- **Drag-and-drop uploads** — photo gallery and flyer panel both accept file drops
- **Public show log** — unauthenticated landing page + public concert detail (`/shows/:id`); poster-left two-column layout on detail
- **SVG logo system** — `logo.svg` wordmark rendered on all auth, landing, admin, and imports pages via `<Wordmark svg />`
- **Stats dashboard** — 12-query analytics endpoint; full-page stats view with custom CSS/SVG charts, milestone timeline, on-this-day card
- **CMS copy editor** — `site_copy` table; admin editor at `/app/admin/copy`; `useCopy()` hook; landing page copy fully editable without a deploy
- **Video upload** — MP4/MOV/WebM up to 500 MB; ffmpeg worker transcodes to H.264 MP4 + extracts WebP poster; lightbox plays video inline
- **Upload progress overlay** — full-screen modal with spinner, live %, animated progress bar; blocks all interaction during upload
- **New SVG logo** — Illustrator-exported paths embedded in `Wordmark.tsx`; no font dependency; matching favicon
- **Dashboard tiles** — Attended count (primary tile, lime), Watchlist / interested count (purple); status breakdown strip removed from concerts list and stats page
- **Stats: On This Day local time** — `?localDate=` param from browser; server uses `cast($date as date)` in SQL
- **Stats: milestones headliner coalesce** — `COALESCE(headliner_hint, headliner artist, any artist)` fixes "Untitled show"
- **Shared EntityCard** — single card component used by Artists, Venues, and Festivals index pages
- **Production deployment** — Mac mini (Tailscale `stingray-octatonic`, `100.123.243.36`) running the full stack; data migrated from dev
- **Automated backups** — `scripts/backup.sh` hourly Postgres dump + MinIO mirror, 3-backup rotation, `TAGG_BACKUP_DIR` from `.env`
- **Dev seed script** — `pnpm seed` wipes and loads dummy data (2 users, 5 venues, 8 artists, 13 concerts)
- **GitHub repo** — private repo; `shamefully-hoist` `.npmrc` so Docker bind mounts resolve pnpm workspace deps on fresh clones
- **Sequential upload + process-wait** — one file at a time; BullMQ polling per file; photo visible in gallery before next upload starts
- **Silent duplicate skip** — batch drag skips already-present files (SHA-256 client-side); no error shown for skips
- **Swiper lightbox (`PhotoCarousel`)** — shared full-screen carousel: swipe/drag/keyboard, video support, captions, portalled to `<body>`, blurred overlay, scroll-lock; replaces all manual lightbox implementations
- **Modal portal fix** — both the photo carousel and flyer modal use `createPortal(…, document.body)` to escape CSS stacking contexts created by parent `position: relative` + `z-index`; blurred semi-transparent overlay (`bg-black/85 backdrop-blur-md`)
- **Body scroll-lock** — `overflow-hidden` added to `<body>` on modal open, removed on close; prevents page scroll behind active lightbox or flyer
- **Flyer mobile/tablet layout** — below `lg` the flyer moves inline between the title/date/venue header and the concert meta editor; desktop sticky-left column unchanged
- **Entity cards 16:9 aspect ratio** — `EntityCard` unified to `aspect-video` across Artists, Venues, and Festivals index grids
- **Background glow fixed to viewport** — `background-attachment: fixed` so the gradient stays pinned as content scrolls over it
- **Stats 500 fix** — corrected `c.series_id` → `c.event_series_id` in two raw SQL joins in `stats.ts`; fixed all concert links from `/shows/` → `/app/concerts/`
- **Festival flyer inheritance** — `festival_day` concerts without their own flyer automatically inherit the festival's flyer; `flyerInherited` field added to API responses
- **Per-artist setlist lookups** — concert detail page shows each artist separately with individual "Load" and "URL" buttons; setlist.fm links can be saved per artist per concert; works with or without API key via manual URL paste
- **Artist setlists section** — artist detail page shows all saved setlists grouped by concert with song lists and setlist.fm links
- **Last.fm artist enrichment** — `LASTFM_API_KEY` env var enables automatic fetch of bio, genre, and MusicBrainz ID; "Fetch from Last.fm" button on artist edit form; scheduled worker enriches 50 unenriched artists per hour (note: Last.fm no longer provides artist images — Spotify fallback planned)
- **URL import for media** — venue photos and artist images can be imported via URL paste (consistent with festival flyers); click URL button, paste image link, save
- **Attended-only artist stats** — artist page first/last seen dates only count shows with `attended` status; interested/attending shows display as "Playing [venue] on [date]" instead

### ⏳ Planned
- **Export CSV UI** — button in the app to trigger `GET /users/me/export.csv` download (endpoint exists, no UI yet)
- **Photo captions** — per-photo text captions
- **Multi-user social** — "shows we both went to" views, shared activity within the instance

### 💡 Wishlist
- **YouTube video embedding** — paste a YouTube URL on a concert page; embed it inline (trailer, live recording, etc.); may be per-concert or per-artist
- **Auto poster / flyer collection with approval flow** — automatically scrape / find concert posters from public sources (Ticketmaster images, Last.fm, etc.) and present a batch approve/deny UI; approved images save as the concert flyer; reduces manual upload friction for historical shows

See [CHANGELOG.md](./CHANGELOG.md) for full change history.
