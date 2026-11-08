# Decisions

## Log

### 2026-11-04 — iOS app as a live Capacitor shell

- **Decision:** `native/` loads `http://macmini:4444`; free Apple ID signing.
- **Why:** deploys reach the phone without rebuilding.
- **Alternatives:** the Home Screen web app only.
- **Consequences:** rebuild every 7 days on a free Apple ID.

### 2026-11 — One account

- **Decision:** remove signup, invites and email verification; `/setup` creates the only account.
- **Why:** it's a personal tool; less auth surface to keep.
- **Alternatives:** keep multi-user.
- **Consequences:** sharing means running another copy; "multi-user social" is effectively off the table.

### 2026-11-03 — Notifications by ntfy and Gmail from the worker

- **Decision:** the worker sends; ntfy self-hosted with ntfy.sh upstream; Gmail app password; Mailpit dev-only. Became the jimbo-notify standard.
- **Why:** instant iOS pushes and email with no paid service.
- **Alternatives:** Web Push (needs HTTPS), a paid email API.
- **Consequences:** the engine is inline, not jimbo-notify's verbatim copy.

### 2026-11-03 — CalVer releases

- **Decision:** versions like 2026.11.0.
- **Why:** an app, not a library; dates say more than numbers.
- **Consequences:** one tag so far.

### 2026-10-23 — Split jimbo.ui out of this app

- **Decision:** the look and kit became the shared jimbo.ui; this app is its pilot.
- **Why:** reuse across apps.
- **Consequences:** frequent jimbo.ui updates here; new patterns tried here first.

### 2026-05 — Hand-applied SQL migrations

- **Decision:** migrations 0005+ written and applied by hand with psql.
- **Why:** control over data changes on a precious database.
- **Alternatives:** drizzle-kit migrate.
- **Consequences:** a deploy step to remember.
