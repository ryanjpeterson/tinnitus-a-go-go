/**
 * Feedback: telling people what happened and what's happening.
 *
 * - `toast()` + `Toaster` — a short note after an action ("Saved", "Deleted ·
 *   Undo"), floating above the dock.
 * - `ConfirmSheet` / `useConfirm` — asks before something destructive or
 *   surprising, in plain words, saying what survives.
 * - `ProgressBar` — how far along a job of known length is.
 * - `Stepper` — where you are in a flow of a few steps.
 * - `OfflineBanner` / `UpdateBanner` — slim bars under the top bar: offline
 *   (with changes waiting), or a new version ready.
 *
 * jimbo-ui reference: copy into an app as is. `Toaster` goes in the app shell once.
 */

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/kit";
import { cn } from "@/lib/cn";

// ─────────────────────────────────────────────────────────────────────────────
// Toasts
// ─────────────────────────────────────────────────────────────────────────────

export type ToastTone = "done" | "info" | "error";

export type ToastInput = {
  title: string;
  body?: ReactNode;
  /** done (accent dot, the default), info (support) or error (highlight; stays until closed). */
  tone?: ToastTone;
  /** One action — usually Undo. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds on screen; errors stay until closed. */
  duration?: number;
};

type ToastItem = ToastInput & { id: number };

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Shows a toast; returns a function that closes it. Works from anywhere — no hook needed. */
export function toast(input: ToastInput | string): () => void {
  const t: ToastItem = { ...(typeof input === "string" ? { title: input } : input), id: nextId++ };
  // Three at most: the oldest gives way.
  toasts = [...toasts, t].slice(-3);
  emit();
  return () => dismissToast(t.id);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const TOAST_DOT: Record<ToastTone, string> = { done: "dot-accent", info: "dot-support", error: "dot-highlight" };

function ToastCard({ t }: { t: ToastItem }) {
  const tone = t.tone ?? "done";
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (tone === "error" || paused) return;
    const timer = setTimeout(() => dismissToast(t.id), t.duration ?? (t.action ? 6000 : 4000));
    return () => clearTimeout(timer);
  }, [t.id, t.duration, t.action, tone, paused]);
  return (
    <div role={tone === "error" ? "alert" : "status"} onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-border bg-surface/95 py-2 pl-4 pr-2 shadow-2xl shadow-black/50 backdrop-blur-xl motion-safe:animate-toast-in">
      <span aria-hidden="true" className={cn(TOAST_DOT[tone], "mt-[15px] h-2.5 w-2.5 shrink-0")} />
      <div className="min-w-0 flex-1 py-2">
        <p className="text-15 font-semibold leading-snug">{t.title}</p>
        {t.body && <p className="mt-0.5 text-sm text-text-muted">{t.body}</p>}
      </div>
      {t.action && (
        <button type="button" onClick={() => { dismissToast(t.id); t.action!.onClick(); }}
          className="h-11 shrink-0 rounded-control px-3 text-sm font-semibold text-accent transition-colors hover:bg-surface-2">
          {t.action.label}
        </button>
      )}
      <button type="button" onClick={() => dismissToast(t.id)} aria-label="Close"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-subtle transition-colors hover:bg-surface-2 hover:text-text-base">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}

/**
 * Where toasts appear: above the dock on phones (`--above-dock`), bottom
 * centre on desktop, newest at the bottom. Put it in the app shell once.
 * Over sheets too (z 60), so a toast from inside one is seen.
 */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => toasts);
  return createPortal(
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[var(--above-dock)] z-[60] flex flex-col items-center gap-2 px-3">
      <div className="flex w-full max-w-md flex-col gap-2">
        {list.map((t) => <ToastCard key={t.id} t={t} />)}
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirm
// ─────────────────────────────────────────────────────────────────────────────

export type ConfirmOptions = {
  title: string;
  /** What happens, and what survives ("Its entries stay in your list"). */
  body?: ReactNode;
  /** The action in its own words: "Delete list", never "OK" or "Yes". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive: the button takes the highlight fill and Cancel gets the focus. */
  danger?: boolean;
};

/**
 * Asks before a destructive or surprising action, as a small Sheet: the
 * question, a line on what happens and what survives, then Cancel and the
 * action named in its own words. `busy` while the action runs.
 */
export function ConfirmSheet({ title, body, confirmLabel, cancelLabel = "Cancel", danger = false, busy = false, onConfirm, onClose }: ConfirmOptions & {
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => { (danger ? cancel : confirm).current?.focus(); }, [danger]);
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-5 p-5">
        {body && <p className="text-15 text-text-muted">{body}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancel} variant="secondary" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button ref={confirm} onClick={onConfirm} loading={busy} className={cn(danger && "lit-highlight hover:bg-highlight-hover")}>{confirmLabel}</Button>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * `const [confirm, confirmSheet] = useConfirm()` — render `confirmSheet`
 * once, then `if (await confirm({ title, confirmLabel, danger: true })) …`.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = (options: ConfirmOptions) => new Promise<boolean>((resolve) => setAsk({ ...options, resolve }));
  const done = (ok: boolean) => { ask?.resolve(ok); setAsk(null); };
  const sheet = ask ? <ConfirmSheet {...ask} onConfirm={() => done(true)} onClose={() => done(false)} /> : null;
  return [confirm, sheet];
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────────────────────

const BAR_FILL = { accent: "bg-accent", support: "bg-support", highlight: "bg-highlight" } as const;

/**
 * How far along a job of known length is (an upload, an import, a quota):
 * a flat bar in the tone over a surface track, the label and value above.
 * No `value` is "working, length unknown" — a slow sweep. For background
 * work that shouldn't take a whole row, use the corner ring (guide section 9).
 */
export function ProgressBar({ label, value, max = 100, tone = "accent", format, hideLabel = false, className }: {
  label: string;
  /** Leave out while the length is unknown. */
  value?: number;
  max?: number;
  tone?: keyof typeof BAR_FILL;
  /** How the value reads: "42%" by default. */
  format?: (value: number, max: number) => string;
  /** Keep the label for screen readers only. */
  hideLabel?: boolean;
  className?: string;
}) {
  const known = value != null;
  const pct = known ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const text = known ? (format ? format(value, max) : `${Math.round(pct)}%`) : "Working…";
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className={cn("flex items-baseline justify-between gap-3 text-sm", hideLabel && "sr-only")}>
        <span className="min-w-0 truncate font-semibold text-text-muted">{label}</span>
        <span className="shrink-0 tabular-nums text-text-subtle">{text}</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={known ? value : undefined} aria-valuetext={text}
        className="relative h-2 overflow-hidden rounded-full bg-surface-2">
        {known
          ? <div className={cn("h-full rounded-full transition-[width] duration-300", BAR_FILL[tone])} style={{ width: `${pct}%` }} />
          : <div className={cn("absolute inset-y-0 w-1/3 rounded-full motion-safe:animate-[jimbo-sweep_1.4s_ease-in-out_infinite]", BAR_FILL[tone])} />}
      </div>
    </div>
  );
}

/**
 * Where you are in a flow of two to five steps (set up, details, review):
 * numbered circles joined by a line — done ones ticked in an accent wash,
 * the current one a flat accent fill. Labels show from `sm:` up; phones get
 * "Step 2 of 4 · Details" under the circles. `onStep` lets people go back to
 * a step they've done.
 */
export function Stepper({ steps, current, onStep }: { steps: string[]; current: number; onStep?: (index: number) => void }) {
  return (
    <nav aria-label="Progress" className="space-y-2">
      <ol className="flex items-center">
        {steps.map((s, i) => {
          const state = i < current ? "done" : i === current ? "current" : "next";
          const circle = (
            <span className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums transition-colors",
              state === "done" && "bg-accent-950 text-accent",
              state === "current" && "lit-accent",
              state === "next" && "border border-border bg-surface-2 text-text-subtle",
            )}>
              {state === "done"
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                : i + 1}
            </span>
          );
          const label = <span className={cn("hidden text-sm font-semibold sm:inline", state === "next" ? "text-text-subtle" : "text-text-base")}>{s}</span>;
          return (
            <li key={s} aria-current={state === "current" ? "step" : undefined} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
              {onStep && state === "done"
                ? <button type="button" onClick={() => onStep(i)} className="-m-1.5 flex items-center gap-2 rounded-full p-1.5 transition-colors hover:bg-surface-2 sm:pr-3">{circle}{label}<span className="sr-only">(done, go back)</span></button>
                : <span className="flex items-center gap-2">{circle}{label}{state === "done" && <span className="sr-only">(done)</span>}</span>}
              {i < steps.length - 1 && <span aria-hidden="true" className={cn("mx-2 h-0.5 min-w-4 flex-1 rounded-full sm:mx-3", i < current ? "bg-accent" : "bg-border")} />}
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-text-muted sm:hidden">Step {current + 1} of {steps.length} · <span className="font-semibold text-text-base">{steps[current]}</span></p>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Banners under the top bar
// ─────────────────────────────────────────────────────────────────────────────

/** Whether the browser is online, kept up to date. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (l) => { addEventListener("online", l); addEventListener("offline", l); return () => { removeEventListener("online", l); removeEventListener("offline", l); }; },
    () => navigator.onLine,
    () => true,
  );
}

/** A slim bar that sticks under the top bar (z 30): one line and an optional action. */
function TopBanner({ className, dot, children, action }: { className: string; dot: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className={cn("sticky top-[var(--top-bar)] z-30 -mx-4 -mt-6 mb-6 flex min-h-11 items-center gap-3 px-4 py-1.5 text-sm font-semibold backdrop-blur-md sm:-mx-6 sm:-mt-8 sm:mb-8 sm:px-6", className)}>
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
      <p className="min-w-0 flex-1">{children}</p>
      {action}
    </div>
  );
}

/**
 * Says the app is offline, and how many changes are waiting to go. Fixed
 * yellow — it carries meaning, so it isn't themed. Shows itself while
 * offline, or while `pending` > 0 after coming back (sending). First thing
 * inside the shell's page, above the page header.
 */
export function OfflineBanner({ pending = 0, forceOffline }: {
  /** Changes made offline, not yet sent. */
  pending?: number;
  /** For previews: show it as offline. */
  forceOffline?: boolean;
}) {
  const online = useOnline() && !forceOffline;
  if (online && pending === 0) return null;
  const waiting = pending > 0 ? `${pending} ${pending === 1 ? "change" : "changes"} ${online ? "sending…" : "waiting to send"}` : null;
  return (
    <TopBanner className="bg-yellow-950/95 text-yellow-200" dot={online ? "bg-yellow-400 animate-pulse" : "bg-yellow-400"}>
      {online ? waiting : <>You're offline{waiting ? ` · ${waiting}` : " · changes will send when you're back"}</>}
    </TopBanner>
  );
}

/**
 * A new version is ready: one line and Reload. From the service worker's
 * "waiting" event (or a version check); `onReload` activates it and reloads.
 * Dismissable — it asks again next launch.
 */
export function UpdateBanner({ onReload, onDismiss }: { onReload: () => void; onDismiss?: () => void }) {
  return (
    <TopBanner className="border-b border-border bg-surface/90" dot="dot-support"
      action={<span className="flex shrink-0 items-center gap-1">
        {onDismiss && <button type="button" onClick={onDismiss} className="h-9 rounded-control px-3 text-sm font-semibold text-text-muted transition-colors hover:bg-surface-2 hover:text-text-base">Later</button>}
        <button type="button" onClick={onReload} className="lit-accent h-9 rounded-control px-3 text-sm font-semibold transition-colors hover:bg-accent-hover">Reload</button>
      </span>}>
      A new version is ready
    </TopBanner>
  );
}
