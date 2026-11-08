# Stack

## Summary

TypeScript everywhere: Fastify 5 API and a BullMQ worker on Node 22, React 18 + Vite 5 + Tailwind 4 web on jimbo-ui 0.14.4 (nginx in production), Postgres 16, Redis 7, MinIO, Docker Compose on the Mac mini; a Capacitor 8 iOS shell.

## Runtime and hosting

- Docker Compose on the Mac mini with `docker-compose.yml` + `docker-compose.tailscale.yml`; web on 4444, API on 3000, MinIO 9000 / 9001, ntfy 8090, Postgres 5432, Redis 6379 (all published on the host), Mailpit 1025 / 8025 in dev.
- Volumes: `db_data`, `redis_data`, `minio_data`, `ntfy_cache`, node_modules volumes for api and worker.

## Languages and frameworks

| What | Version | Used for |
|-|-|-|
| TypeScript | 5.6 | everything |
| Node | 22 | API, worker |
| Fastify | 5 | API |
| Drizzle ORM | 0.36 | DB access |
| BullMQ | 5 | jobs |
| React | 18.3 | web |
| Vite | 5.4 | build |
| Tailwind CSS | 4.3 | styling |
| Postgres | 16 | data |
| Redis | 7 | sessions, queues |
| MinIO | latest | media (S3) |
| Capacitor | 8 | iOS shell |

## Data and storage

Postgres (shows, festivals, artists, venues, lineups, attendance, photos metadata, setlist cache, settings, notifications sent), MinIO bucket `tagg-media` (photos, videos, flyers, artist and venue images), Redis (sessions, queues, channel status). Postgres and MinIO are precious.

## Dependencies

### `apps/api`

| Package | Version | Why it's here |
|-|-|-|
| fastify, @fastify/cookie, cors, helmet, multipart, rate-limit | ^5.1, ^11, ^10, ^12, ^9, ^10 | server and its plugins |
| @node-rs/argon2 | ^2.0.2 | password hashing |
| drizzle-orm, postgres | ^0.36.4, ^3.4.5 | database |
| bullmq, ioredis | ^5.34.1, ^5.4.1 | queues, sessions |
| @aws-sdk/client-s3, s3-request-presigner | ^3.700, ^3.1053 | MinIO |
| zod | ^3.23.8 | validation |
| pino, pino-pretty | ^9.5, ^13 | logs |
| drizzle-kit, tsx (dev) | ^0.28.1, ^4.19.2 | migrations, scripts |

### `apps/worker`

| Package | Version | Why it's here |
|-|-|-|
| sharp | ^0.34.5 | image variants |
| heic-convert | ^2.1.0 | HEIC |
| nodemailer | ^6.9.16 | email |
| bullmq, ioredis, drizzle-orm, postgres, @aws-sdk/client-s3, zod | as API | jobs and data |

ffmpeg comes from the worker image (video).

### `apps/web`

| Package | Version | Why it's here |
|-|-|-|
| react, react-dom, react-router-dom | ^18.3.1, ^6.28.0 | UI |
| @tanstack/react-query | ^5.62.0 | data |
| @vis.gl/react-google-maps | ^1.8.3 | maps |
| swiper | ^12.2.0 | photo viewer |
| lucide-react | ^0.460.0 | icons |
| clsx, tailwind-merge | ^2.1.1, ^3.7.0 | class names |
| zod | ^3.23.8 | shared schemas |
| tailwindcss, @tailwindcss/vite, vite, sharp (icons) | 4, ^5.4.11, ^0.34.5 | build |

### `packages/shared`

| Package | Version | Why it's here |
|-|-|-|
| zod | ^3.23.8 | schemas shared by API and web |
| csv-parse | ^5.5.6 | CSV import |

### `native`

Capacitor core, iOS, CLI ^8.0.0; @capacitor/assets ^3.0.0.

## Tooling

`pnpm dev`, `pnpm test` (Vitest: units and the web ↔ API contract), `pnpm test:smoke` (live API), `pnpm typecheck`, `pnpm build`, `pnpm set-password`, `pnpm import-csv`, `scripts/backup.sh`. No CI.

## Upgrade watch

- MinIO, Mailpit and ntfy images are `latest`; MinIO changed licensing and features in 2025, so pin it.
- Drizzle 0.x and drizzle-kit move fast; migrations are hand-applied anyway.
- React 19 and Vite 6 come with jimbo-ui.
