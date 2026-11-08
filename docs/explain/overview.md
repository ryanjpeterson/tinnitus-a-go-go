# Overview

## What it is

A pnpm monorepo: [`apps/api`](../../apps/api/) (Fastify 5, Drizzle, hand-applied SQL migrations), [`apps/worker`](../../apps/worker/) (BullMQ: media processing, CSV import, artist and setlist enrichment, notifications), [`apps/web`](../../apps/web/) (the jimbo-ui app, served by nginx in production), [`packages/shared`](../../packages/shared/) (zod schemas and helpers) and [`native/`](../../native/) (an iOS Capacitor shell). Postgres, Redis and MinIO run beside them in Docker Compose. The web app has a tab dock (Home, Shows, Artists, Festivals, Venues), ⌘K Spotlight search, and an Account area with admin tools (import/export, data cleanup, notifications, jimbo-ui config).

## Why it exists

Years of concerts lived in a spreadsheet and camera roll. The app turns them into a history you can browse, search, map and share, keeps upcoming shows in front of you with reminders, and fills in artist photos, bios and setlists on its own. It was also the pilot app jimbo.ui was split out of (2026-10-23).

## What it is not

- Not social or multi-user: one account (signup, invites and verification removed); to share it, someone runs their own copy.
- Not a ticketing or event discovery app.
- Not public: tailnet only.

## Principles and hard rules

- **One account, the admin;** first run opens `/setup`, then it closes.
- **Media and setlists only for attended shows.**
- **Billing rules enforced by the database** (one headliner, or co-headliners).
- **Location data stripped from photos** (EXIF GPS).
- **User-supplied URLs fetched without reaching the private network** (`apps/api/src/lib/safe-fetch.ts`).
- **No images in emails** (Gmail can't load from a Tailscale address).
- **Migrations 0005+ are applied by hand** with psql, before the build on deploy.
- jimbo-ui for the UI (config admin-only, `auth: admin`), jimbo-deploy for deploys, jimbo-notify for notifications.

## Status

Active since 2026-05-27, with a long pause from June to October. The log, media, festivals, setlists, stats and notifications are done; recent work is jimbo-ui updates, the iOS shell and Spotlight search.
