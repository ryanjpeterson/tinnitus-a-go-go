# Integrations

## Summary

Ten outside systems; only Tailscale is needed to use it. The rest fill in data or deliver notifications and are optional.

## Services

| Name | Kind | What for | Direction | Required | Auth |
|-|-|-|-|-|-|
| setlist.fm | service | setlists, song cache, hourly finder | read | no | `SETLISTFM_API_KEY` |
| Last.fm | service | artist bio, genre, MusicBrainz id | read | no | `LASTFM_API_KEY` |
| Deezer | service | artist photos | read | no | none |
| Wikidata / MusicBrainz | service | artist photo fallback | read | no | none |
| Google Maps | service | themed venue maps | read | no | `VITE_GOOGLE_MAPS_API_KEY` |
| haveibeenpwned | service | password screening at setup | read | yes for setup | none (k-anonymity) |
| ntfy | self-hosted | push reminders | write | no | `NTFY_TOPIC`, `NTFY_TOKEN` |
| Gmail | service | reminder and recap emails | write | no | `SMTP_USER`, `SMTP_PASS` (app password) |
| Event pages | service | "paste a ticket link" parsing (JSON-LD / Open Graph) | read | no | none; private network blocked |
| Tailscale | self-hosted | the only way in; iOS shell and ntfy | read | yes | tailnet |

## jimbo standards

jimbo-ui 0.14.4 (latest 0.17.0), `auth: admin`; jimbo-deploy (`deploy.json`, port 4444, two compose files, `ios` block); jimbo-notify 0.1.0 (`files.engine: inline`); jimbo-explain 0.1.0.

## Secrets and config

Server `.env` on the mini: `POSTGRES_*`, `DATABASE_URL`, `REDIS_*`, `MINIO_*`, `SESSION_SECRET`, `SESSION_*`, `RATE_LIMIT_*`, `CORS_ORIGINS`, `SMTP_*`, `NTFY_*`, `TIMEZONE`, `SETLISTFM_API_KEY`, `LASTFM_API_KEY`, `VITE_*`, `TAGG_BACKUP_DIR`, `APP_URL`, `API_URL`, `COMPOSE_PROFILES`. Never values. `.env.example` holds dev-only defaults that must be rotated in production.

## When one is down

- setlist.fm, Last.fm, Deezer: enrichment waits for the next run; pages show what's cached.
- Google Maps: an OpenStreetMap link instead of the map.
- ntfy or Gmail: that channel retries on the next tick.
- MinIO: media won't load or upload; the log still works.
