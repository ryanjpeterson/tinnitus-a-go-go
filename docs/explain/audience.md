# Audience

## Who it's for

Self: Ryan, as the one account and admin. Others see it only through share images or by running their own copy.

## How they use it

- On the phone (installed web app or the iOS shell): look up a past show, add one coming up, check off attendance, upload photos after a gig.
- On the laptop: imports, data cleanup, theme.
- Passively: reminders before shows, the weekly recap, the calendar feed in Apple / Google Calendar.

## Access and accounts

`http://macmini:4444` on the tailnet. One account with a password (12+ characters, checked against haveibeenpwned), cookie sessions; no email reset (`pnpm set-password` on the server). Admin-only: imports, data cleanup, notifications, jimbo-ui config. The calendar feed is a private token link.

## What that means for decisions

- No multi-tenant work; "multi-user social" on the README roadmap conflicts with the 2026-11 one-account decision.
- The iOS shell needs the phone on the tailnet.
