# tinnitus-a-go-go explained

tinnitus a-go-go is a personal concert log: every show attended, coming up or missed, with lineups, festivals as containers of day shows, photos and videos, setlists from setlist.fm, artist and venue pages, a venue map, stats, a year in review for every year, a calendar feed, and reminders and a weekly recap by ntfy and email. One account, self-hosted on the Mac mini, used on a phone (and as an iOS app shell). It's for Ryan. What it does best: years of shows turned into a browsable, shareable history, with almost no typing.

## At a glance

| | |
|-|-|
| What | Personal concert log: shows, festivals, media, setlists, stats, reminders |
| For | Just me (self): one account, the admin; tailnet only |
| Status | Active: CalVer 2026.11.0 on 2026-11-03, more Unreleased since (last change 2026-11-05) |
| Runs at | http://macmini:4444 (web), plus an iOS Capacitor shell |
| Built with | TypeScript: Fastify 5 API, BullMQ worker, React 18 + Vite 5 + Tailwind 4 on jimbo-ui 0.14.4; Postgres 16, Redis 7, MinIO |
| Leans on | setlist.fm, Last.fm, Deezer / Wikidata, Google Maps, ntfy, Gmail, Tailscale |
| Started | 2026-05-27 |
| Docs checked | 2026-11-08 at 0bf92b0 |

## The docs

- [Overview](overview.md): what it is, why it exists, what it isn't
- [Audience](audience.md): who it's for and what that rules out
- [Features](features.md): everything it does, and where
- [History](history.md): how it got here
- [Roadmap](roadmap.md): now, next, later, and what's off the table
- [Stack](stack.md): what it's built on and every dependency
- [Integrations](integrations.md): every outside system it talks to
- [Architecture](architecture.md): the parts, the data, the deploy
- [Decisions](decisions.md): the choices that shaped it
- [Health](health.md): risks, debt, chores and open questions
