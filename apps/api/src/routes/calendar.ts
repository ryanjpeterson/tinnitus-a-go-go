/**
 * Calendar feed — a private subscribe link for Apple Calendar, Google
 * Calendar, Outlook, etc. that stays in sync with your shows.
 *
 *   GET  /calendar/token          your feed token (created on first request)
 *   POST /calendar/token/reset    new token; the old link stops working
 *   GET  /calendar/:token.ics     the feed (no sign-in — the token is the key)
 *
 * The feed has every show you're attending or interested in, plus the last
 * year of shows you attended, as all-day events.
 */

import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { requireUser } from "../auth/middleware.js";
import { env } from "../lib/env.js";
import { loadShowInfo } from "../lib/show-info.js";

const newToken = () => randomBytes(24).toString("base64url");

/** RFC 5545 text escaping. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold lines longer than 75 octets (continuation lines start with a space). */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, "utf8") > (parts.length === 0 ? 75 : 74)) {
      parts.push(cur);
      cur = "";
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const icsDate = (iso: string) => iso.replace(/-/g, "");
const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  app.get("/calendar/token", { preHandler: [requireUser] }, async (req, reply) => {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, req.user!.id) });
    let token = user?.calendarToken ?? null;
    if (!token) {
      token = newToken();
      await db.update(schema.users).set({ calendarToken: token }).where(eq(schema.users.id, req.user!.id));
    }
    return reply.send({ token });
  });

  app.post("/calendar/token/reset", { preHandler: [requireUser] }, async (req, reply) => {
    const token = newToken();
    await db.update(schema.users).set({ calendarToken: token }).where(eq(schema.users.id, req.user!.id));
    return reply.send({ token });
  });

  app.get("/calendar/:file", async (req, reply) => {
    const { file } = req.params as { file: string };
    const token = file.replace(/\.ics$/i, "");
    if (!token || token.length < 20) return reply.code(404).send({ error: "Not found." });
    const user = await db.query.users.findFirst({ where: eq(schema.users.calendarToken, token) });
    if (!user) return reply.code(404).send({ error: "Not found." });

    const rows = [...(await db.execute<{
      id: string; slug: string; date: string; status: string; notes: string | null;
      venue: string | null; city: string | null; region: string | null; lat: number | null; lng: number | null;
      updated_at: string;
    }>(sql`
      select c.id, c.slug, c.date::text as date, att.status::text as status, c.event_notes as notes,
             v.name as venue, v.city, v.region, v.lat, v.lng,
             greatest(c.updated_at, att.updated_at)::text as updated_at
      from concert_attendees att
      join concerts c on c.id = att.concert_id
      left join venues v on v.id = c.venue_id
      where att.user_id = ${user.id}
        and (att.status in ('attending', 'interested')
             or (att.status = 'attended' and c.date >= current_date - 365))
      order by c.date
    `))];
    const info = await loadShowInfo(rows.map((r) => r.id));

    const base = env.APP_URL.replace(/\/$/, "");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Tinnitus A Go Go//Shows//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${esc("Tinnitus A Go Go")}`,
      "X-WR-CALDESC:Your shows",
      "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
      "X-PUBLISHED-TTL:PT6H",
    ];
    for (const r of rows) {
      const i = info.get(r.id);
      const lineup = i?.lineup ?? [];
      const title = i?.seriesName
        ? `${i.seriesName}${i.dayCount && i.dayCount > 1 && i.dayNumber ? ` · Day ${i.dayNumber}` : ""}`
        : lineup.slice(0, 3).join(" / ") || "Show";
      const where = [r.venue, r.city, r.region].filter(Boolean).join(", ");
      const statusLabel = r.status === "attending" ? "Going" : r.status === "interested" ? "Interested" : "Attended";
      const description = [
        lineup.length > 0 ? lineup.join(", ") : null,
        statusLabel,
        r.notes,
        `${base}/shows/${r.slug}`,
      ].filter(Boolean).join("\n");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${r.id}@tinnitus-a-go-go`,
        `DTSTAMP:${stamp()}`,
        `LAST-MODIFIED:${new Date(r.updated_at).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
        `DTSTART;VALUE=DATE:${icsDate(r.date)}`,
        `DTEND;VALUE=DATE:${icsDate(nextDay(r.date))}`,
        `SUMMARY:${esc(title)}`,
        ...(where ? [`LOCATION:${esc(where)}`] : []),
        ...(r.lat != null && r.lng != null ? [`GEO:${r.lat};${r.lng}`] : []),
        `DESCRIPTION:${esc(description)}`,
        `URL:${base}/shows/${r.slug}`,
        `STATUS:${r.status === "interested" ? "TENTATIVE" : "CONFIRMED"}`,
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR");

    return reply
      .header("Content-Type", "text/calendar; charset=utf-8")
      .header("Content-Disposition", 'inline; filename="tinnitus-a-go-go.ics"')
      .header("Cache-Control", "private, max-age=900")
      .send(lines.map(fold).join("\r\n") + "\r\n");
  });
}
