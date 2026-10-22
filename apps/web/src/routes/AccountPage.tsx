/**
 * Account settings — password change, admin tools, and sign out.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ServicesPanel } from "@/components/ServicesPanel";
import { LinkCard, PageHeader } from "@/components/ui/kit";
import { saveEverything } from "@/lib/offline";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";

export function AccountPage() {
  const { user, signOut } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader eyebrow={`@${user?.username ?? ""}`} title="Account" />

      {/* Profile info — read-only */}
      <div className="card space-y-3 p-4 sm:p-5">
        <h2 className="h-section mb-3">Profile</h2>
        <div className="flex justify-between gap-3 text-[15px]">
          <span className="text-text-muted">Username</span>
          <span className="text-text-base">@{user?.username}</span>
        </div>
        <div className="flex justify-between gap-3 text-[15px]">
          <span className="text-text-muted">Email</span>
          <span className="text-text-base">{user?.email}</span>
        </div>
        {user?.isAdmin && (
          <div className="flex justify-between gap-3 text-[15px]">
            <span className="text-text-muted">Role</span>
            <span className="text-accent-lime text-sm">Admin</span>
          </div>
        )}
      </div>

      {/* Change password */}
      <div className="card p-4 sm:p-5">
        <h2 className="h-section mb-4">Change password</h2>
        <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-text-muted">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="field h-12 w-full sm:h-11"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-text-muted">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="field h-12 w-full sm:h-11"
            />
            <p className="text-sm text-text-subtle mt-1">Minimum 12 characters</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-text-muted">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="field h-12 w-full sm:h-11"
            />
          </div>

          {error && <p className="text-sm text-accent-pink">{error}</p>}
          {success && <p className="text-sm text-accent-lime">Password updated.</p>}

          <button
            type="submit"
            disabled={saving}
            className="h-12 w-full sm:h-11 sm:w-auto sm:px-6 btn btn-primary"
          >
            {saving ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>

      {user?.isAdmin && (
        <>
          <div className="space-y-3">
            <h2 className="h-section px-0.5">Admin</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <LinkCard to="/admin/imports" eyebrow="Data" title="Import & export" sub="CSV import · CSV, JSON or Markdown export" />
              <LinkCard to="/admin/data" eyebrow="Data" title="Data cleanup" sub="Merge duplicates, fix gaps" />
            </div>
          </div>
          <ServicesPanel />
        </>
      )}

      <NotificationsCard />
      <CalendarCard />
      <OfflineCard />

      {/* Sign out — the only sign-out control on mobile, where the header has no room for one */}
      <div className="space-y-3">
        <Button variant="secondary" onClick={() => void signOut()} className="h-12 w-full rounded-full text-[15px] text-accent-pink">
          Sign out
        </Button>
        <p className="text-center text-sm text-text-subtle">Tinnitus A Go Go · v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}

/** Save every page and image to the device so the whole log works offline. */
function OfflineCard() {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const running = progress !== null && result === null;

  const run = async (): Promise<void> => {
    setResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      const r = await saveEverything((done, total) => setProgress({ done, total }));
      setResult(r.failed === 0 ? "Everything is saved on this device." : `Saved, except ${r.failed} item${r.failed === 1 ? "" : "s"} that didn't load.`);
    } catch {
      setResult("Couldn't finish — check your connection and try again.");
    }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="card space-y-3 p-4 sm:p-5">
      <div>
        <h2 className="h-section">Offline</h2>
        <p className="meta mt-1">
          Pages you open are kept on this device for 60 days. Save everything to have every show, artist, venue and
          festival — with flyers and photos — available without a connection.
        </p>
      </div>
      {running && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent-lime transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="meta mt-1.5">{progress!.total > 0 ? `${progress!.done} / ${progress!.total}` : "Gathering the list…"}</p>
        </div>
      )}
      {result && <p className="text-sm font-semibold text-accent-lime">{result}</p>}
      <Button variant="secondary" disabled={running || !navigator.onLine} onClick={() => void run()} className="w-full sm:w-auto">
        {running ? "Saving…" : "Save everything for offline"}
      </Button>
    </div>
  );
}

/** Push notifications on this device: "Tonight: …" and "How was it?". */
function NotificationsCard() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { void pushState().then(setState).catch(() => setState("unsupported")); }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setNote(null);
    try { await fn(); } catch (err) { setNote(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setBusy(false); }
  };

  return (
    <div className="card space-y-3 p-4 sm:p-5">
      <div>
        <h2 className="h-section">Notifications</h2>
        <p className="meta mt-1">
          On the day of a show you're attending: “Tonight: …”. The morning after: “How was it?”, to mark it attended.
        </p>
      </div>
      {state === "needs-install" && (
        <p className="text-sm text-yellow-400">On iPhone, add this app to your Home Screen (Share → Add to Home Screen) and open it from there to turn on notifications.</p>
      )}
      {state === "unsupported" && (
        <p className="text-sm text-text-muted">
          {window.isSecureContext
            ? "This browser can't receive notifications."
            : "Notifications need the app to be opened over HTTPS — see “Turning on HTTPS” in the README."}
        </p>
      )}
      {state === "denied" && <p className="text-sm text-text-muted">Notifications are blocked for this app in your device's settings.</p>}
      {note && <p className="text-sm text-accent-pink">{note}</p>}
      <div className="flex flex-wrap gap-2">
        {state === "off" && (
          <Button disabled={busy} onClick={() => void act(async () => setState(await enablePush()))}>
            {busy ? "Turning on…" : "Turn on notifications"}
          </Button>
        )}
        {state === "on" && (
          <>
            <Button variant="secondary" disabled={busy}
              onClick={() => void act(async () => { const r = await api.testPush(); setNote(r.delivered > 0 ? "Test sent — it should arrive in a few seconds." : "Couldn't reach this device."); })}>
              Send a test
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void act(async () => setState(await disablePush()))}>
              Turn off
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Private calendar subscription: shows you're going to, in your phone's Calendar. */
function CalendarCard() {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void api.getCalendarToken().then((r) => setToken(r.token)).catch(() => setError("Calendar needs a connection.")); }, []);

  const https = `${window.location.origin}/api/calendar/${token}.ics`;
  const webcal = https.replace(/^https?:/, "webcal:");
  const copy = async () => {
    try { await navigator.clipboard.writeText(https); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt("Copy this link:", https); }
  };
  const reset = async () => {
    if (!window.confirm("Make a new link? Calendars using the old one stop updating.")) return;
    const r = await api.resetCalendarToken();
    setToken(r.token);
  };

  return (
    <div className="card space-y-3 p-4 sm:p-5">
      <div>
        <h2 className="h-section">Calendar</h2>
        <p className="meta mt-1">
          Subscribe once and your Calendar app keeps every show you're attending or interested in up to date. The link is private — anyone with it can see your shows.
        </p>
      </div>
      {error && <p className="text-sm text-accent-pink">{error}</p>}
      {token && (
        <div className="flex flex-wrap gap-2">
          <a href={webcal}><Button>Subscribe in Calendar</Button></a>
          <Button variant="secondary" onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</Button>
          <Button variant="ghost" onClick={() => void reset()}>New link</Button>
        </div>
      )}
      <p className="text-xs text-text-subtle">Google Calendar: Other calendars → From URL, and paste the link.</p>
    </div>
  );
}
