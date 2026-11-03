/**
 * Branded emails: the show reminder and the weekly recap, each as HTML and
 * plain text. Pure functions (no env or database), so `pnpm preview-emails`
 * can render them from sample data.
 *
 * Email-safe on purpose: tables for layout, inline styles, no images (the
 * app's Tailscale address isn't reachable from Gmail's image proxy), web fonts
 * only where the client supports them (Apple Mail) with condensed fallbacks.
 * Colours come from the brand theme (see theme.ts).
 */
import type { EmailTheme } from "./theme.js";
import type { Anniversary, NotifyShow } from "./data.js";
import { countdown, dayOfMonth, monthShort, prettyDate, weekdayShort } from "./time.js";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const DISPLAY = "'Antonio','Oswald','Arial Narrow','Helvetica Neue',Impact,sans-serif";
const SCRIPT = "'Caveat Brush','Marker Felt','Segoe Print','Comic Sans MS',cursive";
const BODY = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const showUrl = (appUrl: string, s: NotifyShow) => `${appUrl.replace(/\/$/, "")}/shows${s.slug ? `/${encodeURIComponent(s.slug)}` : ""}`;

/** "with A, B, C +2 more" — the rest of the bill, kept short. */
function supportLine(s: NotifyShow): string | null {
  if (s.support.length === 0) return null;
  const shown = s.support.slice(0, 4);
  const more = s.support.length - shown.length;
  return `with ${shown.join(", ")}${more > 0 ? ` +${more} more` : ""}`;
}

const whereLine = (s: NotifyShow) => [s.venue, s.city].filter(Boolean).join(" · ") || null;

// ── Building blocks ──────────────────────────────────────────────────────────

function dots(t: EmailTheme): string {
  const dot = (c: string) =>
    `<span style="display:inline-block;width:7px;height:7px;border-radius:7px;background:${c};margin-right:4px;vertical-align:middle;"></span>`;
  return `${dot(t.accent)}${dot(t.highlight)}${dot(t.support)}`;
}

function wordmark(t: EmailTheme): string {
  return `<span style="font-family:${DISPLAY};font-size:30px;line-height:1;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${t.accentText};">Tinnitus</span>`
    + `<span style="font-family:${SCRIPT};font-size:26px;line-height:1;color:${t.highlightText};padding-left:6px;">a Go Go</span>`;
}

function sectionHeading(t: EmailTheme, label: string): string {
  return `<tr><td style="padding:28px 0 6px;">
    <div style="font-family:${BODY};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${t.supportText};">${esc(label)}</div>
    <div style="height:1px;line-height:1px;font-size:1px;background:${t.border};margin-top:8px;">&nbsp;</div>
  </td></tr>`;
}

function pill(t: EmailTheme, label: string, strong = false): string {
  const fill = strong ? `background:${t.highlight};color:${contrastText(t.highlight)};border:1px solid ${t.highlight};` : `color:${t.highlightText};border:1px solid ${t.highlightText};`;
  return `<span style="display:inline-block;${fill}font-family:${BODY};font-size:12px;font-weight:700;letter-spacing:0.04em;line-height:1;padding:5px 9px;border-radius:999px;white-space:nowrap;">${esc(label)}</span>`;
}

/** Dark or light text for a fill colour. */
function contrastText(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const y = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return y > 0.55 ? "#0A0A0A" : "#FFFFFF";
}

/** The app's calendar ticket: month on an accent band, the day underneath. */
function ticket(t: EmailTheme, iso: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="58" style="width:58px;border-collapse:separate;border:1px solid ${t.border};border-radius:10px;">
    <tr><td align="center" style="background:${t.accent};border-radius:9px 9px 0 0;padding:4px 0;font-family:${BODY};font-size:11px;font-weight:800;letter-spacing:0.12em;color:${t.onAccent};">${monthShort(iso)}</td></tr>
    <tr><td align="center" style="background:${t.background};border-radius:0 0 9px 9px;padding:5px 0 6px;">
      <div style="font-family:${DISPLAY};font-size:26px;line-height:26px;font-weight:700;color:${t.text};">${dayOfMonth(iso)}</div>
      <div style="font-family:${BODY};font-size:10px;line-height:14px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${t.muted};">${weekdayShort(iso)}</div>
    </td></tr>
  </table>`;
}

function showRow(t: EmailTheme, appUrl: string, s: NotifyShow, date: string, badge: string, strong = false, last = false): string {
  const support = supportLine(s);
  const where = whereLine(s);
  return `<tr><td style="padding:14px 0;${last ? "" : `border-bottom:1px solid ${t.border};`}">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td width="58" valign="top" style="width:58px;">${ticket(t, date)}</td>
      <td valign="top" style="padding-left:14px;font-family:${BODY};">
        <a href="${esc(showUrl(appUrl, s))}" style="font-family:${DISPLAY};font-size:21px;line-height:25px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;color:${t.text};text-decoration:none;">${esc(s.title)}</a>
        ${support ? `<div style="font-size:14px;line-height:20px;color:${t.muted};padding-top:2px;">${esc(support)}</div>` : ""}
        ${where ? `<div style="font-size:14px;line-height:20px;color:${t.muted};">${esc(where)}</div>` : ""}
        <div style="padding-top:8px;">${pill(t, badge, strong)}${s.status === "interested" ? ` <span style="font-size:12px;color:${t.muted};padding-left:4px;">interested</span>` : ""}</div>
      </td>
    </tr></table>
  </td></tr>`;
}

function button(t: EmailTheme, label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr>
    <td align="center" bgcolor="${t.accent}" style="border-radius:12px;background:${t.accent};">
      <a href="${esc(url)}" style="display:inline-block;padding:14px 22px;font-family:${BODY};font-size:15px;font-weight:700;color:${t.onAccent};text-decoration:none;border-radius:12px;">${esc(label)} &rarr;</a>
    </td>
  </tr></table>`;
}

function stats(t: EmailTheme, tiles: { value: string; label: string }[]): string {
  const cells = tiles.map((s, i) => `<td valign="top" width="${Math.floor(100 / tiles.length)}%" style="padding:0 ${i === tiles.length - 1 ? 0 : 4}px 0 ${i === 0 ? 0 : 4}px;">
    <div style="background:${t.background};border:1px solid ${t.border};border-radius:12px;padding:12px 12px 10px;">
      <div style="font-family:${DISPLAY};font-size:28px;line-height:30px;font-weight:700;color:${t.accentText};" class="stat">${esc(s.value)}</div>
      <div style="font-family:${BODY};font-size:10px;line-height:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${t.muted};">${esc(s.label)}</div>
    </div>
  </td>`).join("");
  return `<tr><td style="padding-top:24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="table-layout:fixed;"><tr>${cells}</tr></table></td></tr>`;
}

interface LayoutOptions {
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  rows: string;
  cta: { label: string; url: string };
  appUrl: string;
}

function layout(t: EmailTheme, o: LayoutOptions): string {
  const settings = `${o.appUrl.replace(/\/$/, "")}/account#notifications`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="${t.dark ? "dark" : "light"}">
<meta name="supported-color-schemes" content="${t.dark ? "dark" : "light"}">
<title>${esc(o.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Antonio:wght@700&family=Caveat+Brush&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: ${t.dark ? "dark" : "light"}; }
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${t.accentText}; }
  @media (max-width:620px) {
    .card { padding:22px 18px !important; border-radius:0 !important; border-left:0 !important; border-right:0 !important; }
    .outer { padding:12px 0 !important; }
    .title { font-size:34px !important; line-height:36px !important; }
    .edge { padding-left:18px !important; padding-right:18px !important; }
    .stat { font-size:24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${t.background};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(o.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${t.background}" style="background:${t.background};">
  <tr><td align="center" class="outer" style="padding:28px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">
      <tr><td class="edge" style="padding:0 6px 18px;">
        <a href="${esc(o.appUrl)}" style="text-decoration:none;">${wordmark(t)}</a>
      </td></tr>
      <tr><td class="card" style="background:${t.surface};border:1px solid ${t.border};border-radius:18px;padding:30px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="font-family:${BODY};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${t.supportText};padding-bottom:10px;">${dots(t)}<span style="vertical-align:middle;padding-left:4px;">${esc(o.eyebrow)}</span></td></tr>
          <tr><td class="title" style="font-family:${DISPLAY};font-size:40px;line-height:42px;font-weight:700;letter-spacing:0.01em;text-transform:uppercase;color:${t.text};">${esc(o.title)}</td></tr>
          <tr><td style="font-family:${BODY};font-size:16px;line-height:24px;color:${t.muted};padding-top:10px;">${o.intro}</td></tr>
          ${o.rows}
          <tr><td>${button(t, o.cta.label, o.cta.url)}</td></tr>
        </table>
      </td></tr>
      <tr><td class="edge" style="padding:20px 6px 0;font-family:${BODY};font-size:12px;line-height:18px;color:${t.muted};">
        Sent by your own Tinnitus A Go Go. Change what you get in <a href="${esc(settings)}" style="color:${t.muted};text-decoration:underline;">Account &rarr; Notifications</a>.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Show reminder ────────────────────────────────────────────────────────────

export interface ReminderItem {
  show: NotifyShow;
  days: number;
}

/** A line of advice for how far out the show is. */
function nudge(days: number): string {
  if (days <= 1) return "Tickets on your phone, earplugs in your pocket, a ride home sorted.";
  if (days <= 3) return "Check the set times, find the earplugs, charge something.";
  return "Plenty of time to learn the new songs.";
}

const headline = (days: number) => (days <= 1 ? "Tomorrow night" : days === 7 ? "One week out" : `${days} days out`);

const subjectWhen = (days: number) => (days <= 1 ? "Tomorrow" : days === 7 ? "In a week" : `In ${days} days`);

export function reminderEmail(t: EmailTheme, items: ReminderItem[], appUrl: string, thisYear: number): RenderedEmail {
  const sorted = [...items].sort((a, b) => a.days - b.days);
  const first = sorted[0]!;
  const single = sorted.length === 1;
  const where = (s: NotifyShow) => (s.venue ? ` at ${s.venue}` : "");

  const subject = single
    ? `${subjectWhen(first.days)}: ${first.show.title}${where(first.show)}`
    : `${sorted.length} shows coming up — first one ${countdown(first.days)}`;
  const intro = single
    ? `<strong style="color:${t.text};">${esc(first.show.title)}</strong>${esc(where(first.show))}, ${esc(prettyDate(first.show.date, thisYear))}. ${esc(nudge(first.days))}`
    : `${sorted.length} shows on the way. ${esc(nudge(first.days))}`;
  const rows = sorted
    .map((i, n) => showRow(t, appUrl, i.show, i.show.date, countdown(i.days), i.days <= 1, n === sorted.length - 1))
    .join("");

  const html = layout(t, {
    preheader: single ? `${prettyDate(first.show.date, thisYear)}${where(first.show)}. ${nudge(first.days)}` : sorted.map((i) => i.show.title).join(", "),
    eyebrow: "Show reminder",
    title: single ? headline(first.days) : "Coming right up",
    intro,
    rows: `<tr><td style="padding-top:12px;"></td></tr>${rows}`,
    cta: single ? { label: "Open the show", url: showUrl(appUrl, first.show) } : { label: "See your shows", url: `${appUrl.replace(/\/$/, "")}/shows` },
    appUrl,
  });

  const text = [
    single ? `${headline(first.days)}.` : "Coming right up.",
    "",
    ...sorted.flatMap((i) => [
      `${i.show.title} — ${countdown(i.days)} (${prettyDate(i.show.date, thisYear)})`,
      ...[supportLine(i.show), whereLine(i.show)].filter((l): l is string => Boolean(l)).map((l) => `  ${l}`),
      `  ${showUrl(appUrl, i.show)}`,
      "",
    ]),
    nudge(first.days),
    "",
    "— Tinnitus A Go Go",
  ].join("\n");

  return { subject, html, text };
}

// ── Weekly recap ─────────────────────────────────────────────────────────────

export interface RecapData {
  /** First day of the week the recap covers. */
  from: string;
  /** Last day (from + 6). */
  to: string;
  anniversaries: Anniversary[];
  /** Upcoming shows, soonest first, with days until each. */
  upcoming: ReminderItem[];
  /** How many more upcoming shows there are beyond `upcoming`. */
  moreUpcoming: number;
  attendedThisYear: number;
  year: number;
}

const yearsAgo = (n: number) => (n === 1 ? "1 year ago" : `${n} years ago`);

function recapSummary(d: RecapData): string {
  const parts: string[] = [];
  if (d.anniversaries.length > 0) parts.push(`${d.anniversaries.length} ${d.anniversaries.length === 1 ? "anniversary" : "anniversaries"}`);
  const upcoming = d.upcoming.length + d.moreUpcoming;
  if (upcoming > 0) parts.push(`${upcoming} ${upcoming === 1 ? "show" : "shows"} coming up`);
  return parts.join(", ");
}

export function recapEmail(t: EmailTheme, d: RecapData, appUrl: string): RenderedEmail {
  const range = `${prettyDate(d.from).replace(/^\w+, /, "")} – ${prettyDate(d.to).replace(/^\w+, /, "")}`;
  const summary = recapSummary(d);
  const subject = summary ? `Your week: ${summary}` : "Your week: a quiet one";
  const quiet = d.anniversaries.length === 0 && d.upcoming.length === 0;

  let rows = "";
  if (d.anniversaries.length > 0) {
    rows += sectionHeading(t, "This week, years ago");
    rows += d.anniversaries
      .map((a, n) => showRow(t, appUrl, a, a.on, `${yearsAgo(a.years)} · ${a.date.slice(0, 4)}`, false, n === d.anniversaries.length - 1))
      .join("");
  }
  if (d.upcoming.length > 0) {
    rows += sectionHeading(t, "Coming up");
    rows += d.upcoming
      .map((i, n) => showRow(t, appUrl, i.show, i.show.date, countdown(i.days), i.days <= 7, n === d.upcoming.length - 1))
      .join("");
    if (d.moreUpcoming > 0) {
      rows += `<tr><td style="padding-top:6px;font-family:${BODY};font-size:14px;color:${t.muted};">…and ${d.moreUpcoming} more after that.</td></tr>`;
    }
  }
  const next = d.upcoming[0];
  rows += stats(t, [
    { value: String(d.attendedThisYear), label: `Shows · ${d.year}` },
    { value: next ? String(next.days) : "—", label: "Days to next" },
    { value: String(d.anniversaries.length), label: "Throwbacks" },
  ]);

  const html = layout(t, {
    preheader: summary ? `${summary[0]!.toUpperCase()}${summary.slice(1)}.` : "Nothing on the books this week.",
    eyebrow: `Weekly recap · ${range}`,
    title: quiet ? "A quiet week" : "Your week in shows",
    intro: quiet
      ? "No anniversaries, nothing booked. Your ears thank you. Maybe check who's touring?"
      : `${esc(summary[0]!.toUpperCase() + summary.slice(1))}. Here's what's ringing.`,
    rows,
    cta: { label: "Open Tinnitus", url: appUrl },
    appUrl,
  });

  const text = [
    `Weekly recap · ${range}`,
    "",
    ...(d.anniversaries.length > 0
      ? ["THIS WEEK, YEARS AGO", ...d.anniversaries.flatMap((a) => [
          `${a.title} — ${yearsAgo(a.years)} on ${weekdayShort(a.on)} (${prettyDate(a.date, d.year)})`,
          ...[whereLine(a)].filter((l): l is string => Boolean(l)).map((l) => `  ${l}`),
        ]), ""]
      : []),
    ...(d.upcoming.length > 0
      ? ["COMING UP", ...d.upcoming.flatMap((i) => [
          `${i.show.title} — ${countdown(i.days)} (${prettyDate(i.show.date, d.year)})`,
          ...[whereLine(i.show)].filter((l): l is string => Boolean(l)).map((l) => `  ${l}`),
        ]), ...(d.moreUpcoming > 0 ? [`…and ${d.moreUpcoming} more.`] : []), ""]
      : []),
    quiet ? "A quiet week. Your ears thank you.\n" : "",
    `${d.attendedThisYear} shows so far in ${d.year}.`,
    "",
    appUrl,
    "— Tinnitus A Go Go",
  ].join("\n");

  return { subject, html, text };
}
