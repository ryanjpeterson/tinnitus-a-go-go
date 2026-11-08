# History

## Timeline

| When | What happened |
|-|-|
| 2026-05 | 80 commits: v1 in a few days through "Phase 14": the log, festivals, media pipeline, setlists, artist enrichment, venue map, `/concerts` renamed `/shows`, a 3D timeline page |
| 2026-06 | PWA support for iOS and desktop, mobile polish; the timeline page removed |
| 2026-10 | 48 commits: HTTPS compose (2026-10-21); jimbo.ui split out of this app (2026-10-23) and adopted release by release, 0.8.0 → 0.14.x; code tidy-up |
| 2026-11 | jimbo-deploy (`deploy.json`), tests, first CalVer release 2026.11.0 (2026-11-03); one account and first-run setup; notifications by ntfy and Gmail, then jimbo-notify's page; iOS shell (2026-11-04); jimbo.ui 0.14.4 and Spotlight (2026-11-05) |

## Milestones

- **2026-05-27, ddda3e9:** first commit.
- **2026-10-23:** jimbo.ui split out of this app.
- **2026-11-03, v2026.11.0:** first tagged release.
- **2026-11-04, 1043208:** iOS app.

## Pivots and renames

- **Multi-user to one account** (2026-11): signup, invites and verification removed.
- **Became the pilot for jimbo.ui** (2026-10-23): its look became the shared system; patterns are tried here first.
- **`/concerts` → `/shows`** (2026-05-31).
- **Name all lower case**, "tinnitus a-go-go" (Unreleased). Internal names still say `tagg` (database, cookie, bucket).

## By the numbers

- First commit 2026-05-27, latest 2026-11-05. 150 commits on 17 active days; authors Ryan and Claude.
- One tag and CHANGELOG version (2026.11.0, CalVer); 21 SQL migrations (0000–0020).
- About 34,500 lines of TypeScript.
