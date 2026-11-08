# Roadmap

## Now

- **Release the Unreleased work** (one account, notifications, iOS shell, Spotlight, jimbo.ui 0.14.4) as the next CalVer version.

## Next

- **Update to jimbo-ui 0.17.0** (large: 0.14.5 through 0.17, including toasts, the numbered rules, a hero on every page; the pilot app, so new rules land here first).
- **Move notifications onto jimbo-notify's verbatim `engine.ts`** (`files.engine` is `inline`) (medium).
- **Venue data:** fix shared or wrong coordinates and merge renamed venues as aliases (small).
- **Photo captions** (small).

## Later

- Code health: split the web bundle chunk over 500 KB; tests for writes and the UI.
- `/api/dashboard` for jimbos-dashboard (next show, last import).

## Ideas

- YouTube embeds on a show or artist page.
- Flyer finder: posters for old shows from public sources, approved in a batch, without an AI key.
- Multi-user social ("shows we both went to") — on the README roadmap, but it contradicts the one-account decision; decide which wins.

## Decided against

- **Signup and invites** — one account; others run their own copy (2026-11).
- **Web Push and the offline service worker** — need HTTPS; ntfy and the outbox replace them.
- **The 3D timeline page** — removed 2026-06-03.
