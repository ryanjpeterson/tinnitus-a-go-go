/**
 * Account → Notifications: show reminders and the weekly recap, by ntfy push
 * and email. Every change saves at once; the worker reads it on its next run.
 */
import { useEffect, useState } from "react";
import type { NotifyTestKind } from "@tagg/shared";
import { api, type NotificationSettings, type NotifyPrefs } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/forms";
import { toast } from "@/components/ui/feedback";
import { KeyValue, SelectField, SwitchRow, ToggleGrid } from "@/components/ui/kit";

const DAY_OPTIONS = [
  { value: 1, label: "1 day" },
  { value: 3, label: "3 days" },
  { value: 7, label: "1 week" },
  { value: 14, label: "2 weeks" },
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;

const resultLine = (channel: string, r: string) => (r === "sent" ? `${channel}: sent` : r === "off" ? `${channel}: not set up` : `${channel}: ${r}`);

export function NotificationsCard() {
  const [data, setData] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [testing, setTesting] = useState<NotifyTestKind | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void api.getNotifications()
      .then((d) => { setData(d); setEmailTo(d.prefs.emailTo ?? ""); })
      .catch(() => setError("Notifications need a connection."));
  }, []);

  const save = async (patch: Partial<NotifyPrefs>) => {
    if (!data) return;
    const before = data;
    setData({ ...data, prefs: { ...data.prefs, ...patch } });
    try {
      const r = await api.patchNotifications(patch);
      setData((d) => (d ? { ...d, prefs: r.prefs } : d));
    } catch (err) {
      setData(before);
      toast({ title: "Couldn't save", body: err instanceof Error ? err.message : undefined, tone: "error" });
    }
  };

  const test = async (what: NotifyTestKind) => {
    setTesting(what);
    try {
      const { result } = await api.testNotification(what);
      const ok = result.email === "sent" || result.ntfy === "sent";
      toast({ title: ok ? "Test sent" : "Nothing went out", body: `${resultLine("ntfy", result.ntfy)} · ${resultLine("Email", result.email)}`, tone: ok ? "done" : "error" });
    } catch (err) {
      toast({ title: "Test failed", body: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setTesting(null);
    }
  };

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt("Copy this link:", url); }
  };

  const p = data?.prefs;
  const ch = data?.channels;
  const ntfyOn = Boolean(ch?.ntfy.configured);
  const emailOn = Boolean(ch?.email.configured);

  return (
    <div id="notifications" className="card scroll-mt-24 space-y-4 p-4 sm:p-5">
      <div>
        <h2 className="h-section">Notifications</h2>
        <p className="meta mt-1">
          A nudge before each show you're going to, and a weekly recap: anniversaries this week and what's coming up. By ntfy push, email, or both.
        </p>
      </div>
      {error && <p className="text-sm text-highlight">{error}</p>}

      {data && p && (
        <>
          <div className="divide-etched overflow-hidden rounded-control border border-border">
            <KeyValue label="ntfy">
              {ntfyOn && ch?.ntfy.subscribeUrl ? (
                <button type="button" onClick={() => void copy(ch.ntfy.subscribeUrl!)} className="break-all text-left text-accent underline-offset-2 hover:underline">
                  {copied ? "Copied" : ch.ntfy.subscribeUrl}
                </button>
              ) : "Not set up — NTFY_TOPIC"}
            </KeyValue>
            <KeyValue label="Email">{emailOn ? (p.emailTo || data.accountEmail) : "Not set up — SMTP_HOST"}</KeyValue>
            {!ch && <KeyValue label="Worker">Hasn't checked in — restart it</KeyValue>}
          </div>
          {ntfyOn && <p className="text-xs text-text-subtle">In the ntfy app: + → Subscribe to topic → Use another server, and paste the link above.</p>}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text-muted">Show reminders — before shows you're attending</h3>
            <ToggleGrid
              options={DAY_OPTIONS}
              selected={p.remindDays}
              onToggle={(d) => void save({ remindDays: p.remindDays.includes(d) ? p.remindDays.filter((x) => x !== d) : [...p.remindDays, d] })}
            />
            <div className="divide-etched overflow-hidden rounded-control border border-border">
              <SwitchRow label="Push (ntfy)" checked={p.remindNtfy} onChange={(v) => void save({ remindNtfy: v })} disabled={!ntfyOn} />
              <SwitchRow label="Email" checked={p.remindEmail} onChange={(v) => void save({ remindEmail: v })} disabled={!emailOn} />
              <SwitchRow label="Interested shows too" hint="Not only the ones you're attending" checked={p.remindInterested} onChange={(v) => void save({ remindInterested: v })} />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text-muted">Weekly recap</h3>
            <div className="divide-etched overflow-hidden rounded-control border border-border">
              <SwitchRow label="Push (ntfy)" checked={p.recapNtfy} onChange={(v) => void save({ recapNtfy: v })} disabled={!ntfyOn} />
              <SwitchRow label="Email" checked={p.recapEmail} onChange={(v) => void save({ recapEmail: v })} disabled={!emailOn} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Recap day"
                value={String(p.recapWeekday)}
                onChange={(v) => void save({ recapWeekday: Number(v) })}
                options={WEEKDAYS.map((d, i) => ({ value: String(i), label: `Recap on ${d}` }))}
              />
              <SelectField
                label="Send time"
                value={String(p.hour)}
                onChange={(v) => void save({ hour: Number(v) })}
                options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `Send at ${hourLabel(h)}` }))}
              />
            </div>
            {ch?.timezone && <p className="text-xs text-text-subtle">Times are {ch.timezone} (TIMEZONE).</p>}
          </div>

          <TextField
            label="Send emails to"
            type="email"
            optional
            value={emailTo}
            placeholder={data.accountEmail ?? ""}
            onChange={setEmailTo}
            onBlur={() => { if ((emailTo || null) !== p.emailTo) void save({ emailTo: emailTo.trim() || null }); }}
            hint="Leave blank to use your account's email."
          />

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={testing === "reminder"} disabled={testing !== null || (!ntfyOn && !emailOn)} onClick={() => void test("reminder")}>Send a test reminder</Button>
            <Button variant="secondary" loading={testing === "recap"} disabled={testing !== null || (!ntfyOn && !emailOn)} onClick={() => void test("recap")}>Send a test recap</Button>
          </div>
        </>
      )}
    </div>
  );
}
