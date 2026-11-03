/**
 * Renders every email from sample data to HTML files you can open in a browser
 * — for working on the templates without sending anything.
 *
 *   pnpm --filter @tagg/worker preview-emails [out-dir]   (default: ./email-preview)
 *   … -- --theme '{"accent":"#FFD400","background":"#F6F1E7"}'   to try other colours
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Anniversary, NotifyShow } from "./data.js";
import { recapEmail, reminderEmail } from "./templates.js";
import { emailTheme } from "./theme.js";
import { addDays } from "./time.js";

const args = process.argv.slice(2);
const themeArg = args.indexOf("--theme");
const colours = themeArg >= 0 ? JSON.parse(args[themeArg + 1] ?? "{}") : {};
const outDir = path.resolve(args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--theme") ?? "email-preview");
const theme = emailTheme(colours);
const appUrl = "http://100.64.0.1:4444";
const today = new Date().toISOString().slice(0, 10);
const year = Number(today.slice(0, 4));

const show = (title: string, date: string, extra: Partial<NotifyShow> = {}): NotifyShow => ({
  id: title, slug: title.toLowerCase().replace(/\W+/g, "-"), date, status: "attending", title, support: [], venue: null, city: null, ...extra,
});

const fooFighters = show("Foo Fighters", addDays(today, 3), { support: ["Wet Leg", "Mannequin Pussy"], venue: "Canadian Tire Centre", city: "Ottawa, ON" });
const idles = show("IDLES", addDays(today, 1), { support: ["Lambrini Girls"], venue: "TD Place", city: "Ottawa, ON" });
const bluesfest = show("Bluesfest 2027", addDays(today, 7), { support: ["Green Day", "Charley Crockett", "Japanese Breakfast", "The Linda Lindas", "Tune-Yards", "Mdou Moctar"], venue: "LeBreton Flats", city: "Ottawa, ON" });

const anniv = (title: string, years: number, offset: number, extra: Partial<NotifyShow> = {}): Anniversary => {
  const on = addDays(today, offset);
  return { ...show(title, `${year - years}${on.slice(4)}`, { status: "attended", ...extra }), on, years };
};

const emails = {
  "reminder-1-day": reminderEmail(theme, [{ show: idles, days: 1 }], appUrl, year),
  "reminder-3-days": reminderEmail(theme, [{ show: fooFighters, days: 3 }], appUrl, year),
  "reminder-7-days": reminderEmail(theme, [{ show: bluesfest, days: 7 }], appUrl, year),
  "reminder-several": reminderEmail(theme, [{ show: fooFighters, days: 3 }, { show: idles, days: 1 }], appUrl, year),
  "recap": recapEmail(theme, {
    from: today, to: addDays(today, 6), year, attendedThisYear: 23, moreUpcoming: 2,
    anniversaries: [
      anniv("Foo Fighters", 15, 1, { support: ["Social Distortion"], venue: "Scotiabank Place", city: "Ottawa, ON" }),
      anniv("Riot Fest 2014", 12, 4, { support: ["The Cure", "Weezer", "Social Distortion"], venue: "Humboldt Park", city: "Chicago, IL" }),
    ],
    upcoming: [{ show: idles, days: 1 }, { show: fooFighters, days: 3 }, { show: bluesfest, days: 7 }],
  }, appUrl),
  "recap-quiet": recapEmail(theme, { from: today, to: addDays(today, 6), year, attendedThisYear: 4, moreUpcoming: 0, anniversaries: [], upcoming: [] }, appUrl),
};

mkdirSync(outDir, { recursive: true });
const links: string[] = [];
for (const [name, e] of Object.entries(emails)) {
  writeFileSync(path.join(outDir, `${name}.html`), e.html);
  writeFileSync(path.join(outDir, `${name}.txt`), `Subject: ${e.subject}\n\n${e.text}`);
  links.push(`<li><a href="${name}.html">${name}</a> — ${e.subject.replace(/</g, "&lt;")} (<a href="${name}.txt">text</a>)</li>`);
}
writeFileSync(path.join(outDir, "index.html"), `<!doctype html><meta charset="utf-8"><title>Email previews</title><body style="font-family:system-ui;padding:24px"><h1>Email previews</h1><ul>${links.join("")}</ul>`);
console.log(`Wrote ${Object.keys(emails).length} emails to ${outDir}`);
