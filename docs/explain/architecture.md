# Architecture

## Shape

    phone / iOS shell ──Tailscale──► web :4444 (nginx, React) ──/api──► api :3000 (Fastify) ──► Postgres
                                                     └─/tagg-media──► MinIO              ├──► Redis (sessions)
                                                                                         └──► BullMQ ──► worker
    worker: media-processing (sharp, ffmpeg), csv-import, artist-enrich(-scheduler), setlist-enrich, notify (15-min tick)
           ──► MinIO, Postgres, ntfy :8090, Gmail SMTP

## Data flow

1. Upload: web queue → API stores the original in MinIO → job → worker makes WebP / H.264 variants, strips GPS → rows updated.
2. Add show: optional ticket link parsed safely → lineup rules checked by the database → follow-up prompt after the date.
3. Enrichment: hourly jobs fetch artist data (50 at a time) and setlists within rate limits.
4. Notifications: worker tick → due reminders and recap → ntfy and email → `notifications_sent`.

## Where data lives

| Where | What | Rebuildable? |
|-|-|-|
| Postgres `db_data` | the whole log | no: precious |
| MinIO `minio_data` | photos, videos, flyers, images | no: precious |
| Redis | sessions, queues | yes |
| Backups | `scripts/backup.sh` (pg_dump and `mc mirror` to `TAGG_BACKUP_DIR`) | — |

## Jobs and schedules

Artist enrichment hourly (50 artists), setlist finder hourly, notifications every 15 minutes, orphaned storage cleanup hourly, backups by `scripts/backup.sh` (scheduled outside the app).

## Deploy

jimbo-deploy Termius snippet: pull, apply any new migration with psql, `docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d --build`, `ps`. The iOS shell picks up deploys on next open.
