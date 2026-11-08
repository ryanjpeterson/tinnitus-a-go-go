# Health

## Snapshot

The most complete jimbo app and in regular use. Upkeep: jimbo.ui updates, hand-applied migrations, and keeping enrichment keys valid. The one thing most worth doing next: release the Unreleased work, then confirm backups of Postgres and MinIO are actually running.

## Risks

| Risk | Likelihood | What would soften it |
|-|-|-|
| Postgres or MinIO lost (years of log and media) | medium | confirm `scripts/backup.sh` runs on a schedule, or add jobs to jimbo-backup |
| Postgres, Redis and MinIO ports published on the host (5432, 6379, 9000/9001) | medium | bind to localhost or drop the published ports in production |
| Dev credentials from `.env.example` left in production | low | the README warns; check the mini's `.env` |
| `latest` images (MinIO especially) change on rebuild | medium | pin versions |
| Free Apple ID iOS installs expire weekly | high | paid account or SideStore |

## Tech debt

- jimbo-ui 0.14.4, three minors behind (and this is the pilot app).
- Notification engine inline rather than jimbo-notify's `engine.ts`.
- **README is stale in places:** the "Current status: Phase 14" banner is from May, and the roadmap lists multi-user social after one account was chosen.
- Internal names still `tagg` (DB, cookie, bucket, package scope).
- A web bundle chunk over 500 KB; tests don't cover writes or the UI.
- Migrations applied by hand.

## Known issues

- Some venues share or have wrong coordinates; renamed venues not yet merged as aliases (README roadmap).

## Maintenance chores

- Apply new migrations on deploy, before the build.
- Rebuild the iOS shell every 7 days (free Apple ID).
- Rotate the Gmail app password if leaked; keep setlist.fm and Last.fm keys valid.
- Backups via `scripts/backup.sh` (needs `mc`).

## Open questions

- Is `scripts/backup.sh` scheduled on the mini, or should jimbo-backup take over?
- Drop "multi-user social" from the roadmap?
- Rename `tagg` internals, or leave them?
