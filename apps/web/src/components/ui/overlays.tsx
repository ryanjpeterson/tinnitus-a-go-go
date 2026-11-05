/**
 * Overlays that float by something on the page: Menu (a list of actions),
 * Popover (a small panel of controls), Tooltip (a label for an icon button)
 * and CommandPalette (⌘K: Spotlight for the app — search everything, go
 * anywhere, run an action).
 *
 * Each is portalled to <body> and placed against the thing that opened it,
 * below it where there's room and above it where there isn't, kept 8 px
 * inside the screen. Escape closes, and focus goes back where it came from.
 * For a choice or a short flow, use a Sheet instead.
 *
 * jimbo-ui reference: copy into an app as is.
 */

import {
  cloneElement, forwardRef, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactElement, type ReactNode, type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { BRAND } from "@/lib/brand.config";
import { cn } from "@/lib/cn";

// ─────────────────────────────────────────────────────────────────────────────
// Placing a floating panel against its anchor
// ─────────────────────────────────────────────────────────────────────────────

const EDGE = 8;
const GAP = 6;

/**
 * Where a floating panel goes: under `anchor` (or over it when there isn't
 * room below), lined up with its start or end edge, or centred, and kept
 * inside the screen. Follows scrolling and resizing while `open`.
 */
function useAnchored(anchor: RefObject<HTMLElement>, panel: RefObject<HTMLElement>, open: boolean, align: "start" | "end" | "center" = "start"): CSSProperties {
  // Unplaced it's see-through but still focusable (a hidden one couldn't take focus as it opens).
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", top: 0, left: 0, opacity: 0 });
  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const p = panel.current;
    if (!a || !p) return;
    const w = p.offsetWidth, h = p.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const below = a.bottom + GAP + h <= vh - EDGE || a.top - GAP - h < EDGE;
    const top = below ? a.bottom + GAP : a.top - GAP - h;
    const raw = align === "end" ? a.right - w : align === "center" ? a.left + a.width / 2 - w / 2 : a.left;
    const left = Math.min(Math.max(raw, EDGE), vw - EDGE - w);
    setStyle({ position: "fixed", top: Math.max(top, EDGE), left, transformOrigin: below ? "top" : "bottom" });
  }, [anchor, panel, align]);
  useLayoutEffect(() => {
    if (!open) return;
    place();
    addEventListener("scroll", place, { passive: true, capture: true });
    addEventListener("resize", place);
    return () => { removeEventListener("scroll", place, { capture: true }); removeEventListener("resize", place); };
  }, [open, place]);
  return style;
}

/** Closes on a press outside both the anchor and the panel, and on Escape (focus goes back to the anchor). */
function useDismiss(open: boolean, close: () => void, anchor: RefObject<HTMLElement>, panel: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); anchor.current?.focus(); }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey); };
  }, [open, close, anchor, panel]);
}

/** What a trigger needs: put these on the button that opens the overlay. */
export type TriggerProps = {
  ref: RefObject<HTMLButtonElement>;
  onClick: () => void;
  "aria-expanded": boolean;
  "aria-controls": string;
  "aria-haspopup": "menu" | "dialog";
};

const PANEL = "z-[45] rounded-xl border border-border bg-surface shadow-2xl shadow-black/40";

/** The kit's round "more" button (⋯): a 44 px ghost circle. Spread a trigger's props on it. */
export const MoreButton = forwardRef<HTMLButtonElement, Omit<TriggerProps, "ref"> & { label?: string }>(({ label = "More", ...props }, ref) => (
  <button ref={ref} type="button" aria-label={label} {...props}
    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text-base aria-expanded:bg-surface-2 aria-expanded:text-text-base">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" /></svg>
  </button>
));
MoreButton.displayName = "MoreButton";

// ─────────────────────────────────────────────────────────────────────────────
// Menu — a short list of actions on one thing
// ─────────────────────────────────────────────────────────────────────────────

export type MenuItem =
  | { label: string; onSelect: () => void; hint?: ReactNode; icon?: ReactNode; danger?: boolean; disabled?: boolean }
  | "divider";

/**
 * A list of actions on one thing (a row's Edit / Duplicate / Delete), opened
 * from a button — the ⋯ `MoreButton` unless `trigger` draws another. Arrow
 * keys move, Home and End jump, a letter goes to the next item starting with
 * it, Enter picks. `danger` items are in the highlight colour and go last,
 * after a divider; confirm them with `ConfirmSheet`.
 */
export function Menu({ items, label = "More", trigger, align = "end" }: {
  items: MenuItem[];
  /** Names the button for screen readers. */
  label?: string;
  trigger?: (props: TriggerProps) => ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const style = useAnchored(anchor, panel, open, align);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, anchor, panel);

  const buttons = () => [...(panel.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? [])];
  useEffect(() => { if (open) buttons()[0]?.focus(); }, [open]);
  const onKey = (e: ReactKeyboardEvent) => {
    const all = buttons();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => { e.preventDefault(); all[(i + all.length) % all.length]?.focus(); };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(all.length - 1);
    else if (e.key === "Tab") close();
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase();
      const next = [...all.slice(at + 1), ...all.slice(0, at + 1)].find((b) => b.textContent?.trim().toLowerCase().startsWith(k));
      if (next) { e.preventDefault(); next.focus(); }
    }
  };
  const pick = (item: Exclude<MenuItem, "divider">) => { close(); anchor.current?.focus(); item.onSelect(); };
  const props: TriggerProps = { ref: anchor, onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-controls": id, "aria-haspopup": "menu" };

  return (
    <>
      {trigger ? trigger(props) : <MoreButton label={label} {...props} />}
      {open && createPortal(
        <div ref={panel} id={id} role="menu" aria-label={label} onKeyDown={onKey} style={style}
          className={cn(PANEL, "min-w-[12rem] max-w-[calc(100vw-16px)] py-1")}>
          {items.map((item, i) => item === "divider"
            ? <div key={i} role="separator" className="my-1 h-px bg-border" />
            : (
              <button key={i} type="button" role="menuitem" disabled={item.disabled} onClick={() => pick(item)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 px-3.5 text-left text-15 font-semibold outline-hidden transition-colors focus-visible:bg-surface-2 hover:bg-surface-2 disabled:opacity-45",
                  item.danger ? "text-highlight" : "text-text-base",
                )}>
                {item.icon && <span aria-hidden="true" className="flex w-5 shrink-0 justify-center text-text-subtle">{item.icon}</span>}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint && <span className="shrink-0 text-xs font-medium text-text-subtle">{item.hint}</span>}
              </button>
            ))}
        </div>,
        document.body,
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Popover — a small panel of controls by its button
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A small panel by its button — a few filters, a quick setting, a short
 * explanation — that stays open while you use it and closes on a press
 * outside or Escape. More than a few controls, or anything that saves, is a
 * Sheet. `trigger` draws the button with the props it's given.
 */
export function Popover({ label, trigger, children, align = "start", className }: {
  /** Names the panel for screen readers. */
  label: string;
  trigger: (props: TriggerProps) => ReactNode;
  /** The panel's content, or a function of `close` for content with a Done button. */
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end" | "center";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const style = useAnchored(anchor, panel, open, align);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, anchor, panel);
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>("input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])")?.focus();
  }, [open]);

  return (
    <>
      {trigger({ ref: anchor, onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-controls": id, "aria-haspopup": "dialog" })}
      {open && createPortal(
        <div ref={panel} id={id} role="dialog" aria-label={label} style={style}
          className={cn(PANEL, "w-72 max-w-[calc(100vw-16px)] p-4", className)}>
          {typeof children === "function" ? children(close) : children}
        </div>,
        document.body,
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip — a short label for an icon button, on hover or keyboard focus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A short label for an icon-only control, shown after a moment's hover or on
 * keyboard focus. Never the only place something is said: the control has
 * its own `aria-label`, and touch screens don't show tooltips at all, so
 * nothing a person needs lives only here. Wraps one element.
 */
export function Tooltip({ text, children }: { text: string; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<number>();
  const style = useAnchored(anchor, panel, open, "center");
  const show = (delay: number) => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), delay); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const child = isValidElement<{ "aria-describedby"?: string }>(children)
    ? cloneElement(children, { "aria-describedby": open ? id : undefined })
    : children;

  return (
    <span ref={anchor} className="inline-flex"
      onPointerEnter={(e) => { if (e.pointerType === "mouse") show(450); }}
      onPointerLeave={hide}
      onFocus={(e) => { if (e.target.matches(":focus-visible")) show(0); }}
      onBlur={hide}>
      {child}
      {open && createPortal(
        <div ref={panel} id={id} role="tooltip" style={style}
          className="pointer-events-none z-[45] max-w-60 rounded-lg bg-text-base px-2.5 py-1.5 text-xs font-semibold text-bg shadow-lg">
          {text}
        </div>,
        document.body,
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CommandPalette — ⌘K search: Spotlight for the app
// ─────────────────────────────────────────────────────────────────────────────

export type Command = {
  id: string;
  label: string;
  /** Heading it's listed under ("Go to", "Actions"). */
  group?: string;
  /** Other words it should match ("theme" for "Change the look"). */
  keywords?: string[];
  /** Shown on the right: a shortcut or where it goes. */
  hint?: ReactNode;
  run: () => void;
};

/** One `facet:value` token from the query (`size:2-4` → `{ key: "size", value: "2-4" }`). */
export type SpotlightFilter = { key: string; value: string };
/** What providers search with: the free text, and the filters parsed out of it. */
export type SpotlightQuery = { text: string; filters: SpotlightFilter[] };

/** One result. Plain data (no functions), so it can be kept with recent picks. */
export type SpotlightItem = {
  id: string;
  title: string;
  subtitle?: string;
  /** Short and on the right: a count, a year, a duration. */
  meta?: string;
  /** A 40 px thumbnail: an image URL, or `null` for the theme's motif in its place. Leave it out for no thumbnail. */
  image?: string | null;
  /** A round thumbnail (people). */
  round?: boolean;
  /** Anything else `pick` and `preview` need. Kept with recent picks, so plain JSON. */
  data?: unknown;
};

/** A source of results, listed under its `label`. Results are debounced, and a newer query aborts `signal`. */
export type SearchProvider<T extends SpotlightItem = SpotlightItem> = {
  id: string;
  label: string;
  /** Results for the query, best first. Return nothing for a filter it doesn't know. */
  search: (query: SpotlightQuery, signal: AbortSignal) => T[] | Promise<T[]>;
  /** Open it: usually navigate to its page. The palette has closed by then. */
  pick: (item: T) => void;
  /** The preview pane for the highlighted result (wide screens). */
  preview?: (item: T) => ReactNode;
  /** "See all": the full results page for this query (put the query in its URL). */
  more?: (query: SpotlightQuery) => void;
  /** Rows shown (5). */
  limit?: number;
  /** Wait after typing, in ms (120). */
  debounce?: number;
};

/** A filter the query understands as `key:value`. `values` are offered as you type; `hint` shows the form ("2-4"). */
export type Facet = { key: string; label: string; values?: string[]; hint?: string };

/** A search to try, shown while the query is empty: picking it fills the query. */
export type Suggestion = { id: string; title: string; subtitle?: string; query: string };

type Token = { raw: string; facet?: Facet; value?: string };

function tokenize(raw: string, facets: Facet[]): Token[] {
  const out: Token[] = [];
  for (const m of raw.matchAll(/([A-Za-z][\w-]*):(?:"([^"]*)"?|(\S*))|\S+/g)) {
    const facet = m[1] ? facets.find((f) => f.key.toLowerCase() === m[1]!.toLowerCase()) : undefined;
    out.push(facet ? { raw: m[0], facet, value: m[2] ?? m[3] ?? "" } : { raw: m[0] });
  }
  return out;
}

const formatFilter = (f: SpotlightFilter) => `${f.key}:${/\s/.test(f.value) ? `"${f.value}"` : f.value}`;

/** Splits a query into the app's facet filters and free text. `10:30` or an unknown `x:y` stays text. */
export function parseQuery(raw: string, facets: Facet[] = []): SpotlightQuery {
  const filters: SpotlightFilter[] = [];
  const words: string[] = [];
  for (const t of tokenize(raw, facets)) {
    if (!t.facet) words.push(t.raw);
    else if (t.value) filters.push({ key: t.facet.key, value: t.value });
  }
  return { text: words.join(" "), filters };
}

/** A query written back as text: filters first, then the words (for a results page's URL). */
export function formatQuery(q: SpotlightQuery): string {
  return [...q.filters.map(formatFilter), q.text].filter(Boolean).join(" ");
}

/** Chips (finished filters) and what's left for the field, which keeps the token still being typed. */
function splitQuery(raw: string, facets: Facet[]): { chips: SpotlightFilter[]; text: string } {
  const ts = tokenize(raw, facets);
  const typing = raw.length > 0 && !/\s$/.test(raw);
  const chips: SpotlightFilter[] = [];
  const rest: string[] = [];
  ts.forEach((t, i) => {
    if (t.facet && t.value && !(typing && i === ts.length - 1)) chips.push({ key: t.facet.key, value: t.value });
    else rest.push(t.raw);
  });
  return { chips, text: rest.join(" ") + (rest.length && !typing ? " " : "") };
}

const joinQuery = (chips: SpotlightFilter[], text: string) => chips.map((c) => `${formatFilter(c)} `).join("") + text.trimStart();

/** Toggles on ⌘K or Ctrl+K, from anywhere. */
function useShortcut(toggle: () => void) {
  const latest = useRef(toggle);
  latest.current = toggle;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); latest.current(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

/** Opens the palette on ⌘K or Ctrl+K, from anywhere. `[open, setOpen]`. Use `useSpotlight` to keep it in the URL. */
export function useCommandPalette(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useShortcut(() => setOpen((o) => !o));
  return [open, setOpen];
}

/**
 * The palette's open state and query in the URL (`?find=size:2 blue`), so
 * a refresh or a shared link reopens the same search; ⌘K / Ctrl+K toggles it.
 * Spread `bind` into `CommandPalette`.
 */
export function useSpotlight(param = "find") {
  const [params, setParams] = useSearchParams();
  const write = useCallback((change: (p: URLSearchParams) => void) => setParams((p) => {
    const next = new URLSearchParams(p);
    change(next);
    return next;
  }, { replace: true }), [setParams]);
  const setOpen = useCallback((open: boolean) => write((p) => {
    if (!open) p.delete(param);
    else if (!p.has(param)) p.set(param, "");
  }), [write, param]);
  const setQuery = useCallback((q: string) => write((p) => p.set(param, q)), [write, param]);
  useShortcut(() => write((p) => { if (p.has(param)) p.delete(param); else p.set(param, ""); }));
  const open = params.has(param);
  const query = params.get(param) ?? "";
  return { open, setOpen, query, setQuery, bind: { open, onClose: () => setOpen(false), query, onQueryChange: setQuery } };
}

const MOD = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "⌘" : "Ctrl ";

/** The magnifier, 18 px: for a top-bar search button (`TopBarButton`) that opens the palette on phones. */
export function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="shrink-0" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** Looks like a search field and opens the palette: the search bar at the top of an explore or library page. */
export function SearchTrigger({ onClick, label = "Search", className }: { onClick: () => void; label?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("glass flex h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-base text-text-subtle transition-colors hover:border-accent sm:h-11", className)}>
      <SearchIcon />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <kbd className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-11 sm:block">{MOD}K</kbd>
    </button>
  );
}

function Thumb({ image, round }: { image: string | null; round?: boolean }) {
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden bg-surface-2", round ? "rounded-full" : "rounded-lg")}>
      {image ? <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="motif-support h-4 w-4" />}
    </span>
  );
}

type Row = {
  key: string;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  image?: string | null;
  round?: boolean;
  preview?: () => ReactNode;
  /** Picking it changes the query and the palette stays open. */
  keep?: boolean;
  /** Kept as a recent pick. */
  recent?: Recent;
  pick: () => void;
};
type Group = { key: string; label: string; rows: Row[]; loading?: boolean; error?: boolean; action?: { label: string; run: () => void } };
type Recent = { p: string; item: SpotlightItem };
type Found = { status: "loading" | "done" | "error"; items: SpotlightItem[] };

const RECENT_MAX = 6;
const readRecents = (key: string): Recent[] => {
  try { return (JSON.parse(localStorage.getItem(key) ?? "[]") as Recent[]).filter((r) => r?.p && r.item?.id); } catch { return []; }
};

const commandWords = (c: Command) => [c.label, c.group ?? "", ...(c.keywords ?? [])].join(" ").toLowerCase();

/**
 * Spotlight for the app: one search field over everything. Results come live
 * from the app's `providers` (debounced, cancelled when the query moves on),
 * grouped under each one's label, with thumbnails and a preview pane for the
 * highlighted result on wide screens. `facets` turn `key:value` tokens into
 * removable chips and offer their values as you type; providers get the text
 * and the filters apart. With an empty query it shows recent picks (kept under
 * the app's storage prefix), `suggestions` and the facets. `commands` (go to a
 * page, run an action) are matched by name and listed after the results.
 *
 * Arrow keys move, Tab jumps to the next group, Enter opens, Escape closes,
 * Backspace in an empty field takes off the last chip. Open it with
 * `useSpotlight` (in the URL) or `useCommandPalette`, and a top-bar search
 * button on phones, where there's no ⌘K.
 */
export function CommandPalette({
  open, onClose, commands = [], providers = [], facets = [], suggestions = [], query, onQueryChange,
  recentKey = "spotlight.recent", placeholder,
}: {
  open: boolean;
  onClose: () => void;
  commands?: Command[];
  // Each provider's own item type; the palette only passes its items back to it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providers?: SearchProvider<any>[];
  facets?: Facet[];
  suggestions?: Suggestion[];
  /** The query as text, to hold it in the URL (`useSpotlight`); leave out to keep it here. */
  query?: string;
  onQueryChange?: (query: string) => void;
  /** Where recent picks are kept, after the storage prefix; `null` keeps none. */
  recentKey?: string | null;
  placeholder?: string;
}) {
  const [own, setOwn] = useState("");
  const raw = query ?? own;
  const setRaw = (v: string) => { if (query === undefined) setOwn(v); onQueryChange?.(v); };
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [found, setFound] = useState<Record<string, Found>>({});
  const storeKey = recentKey === null ? null : `${BRAND.storagePrefix}.${recentKey}`;
  const [recents, setRecents] = useState<Recent[]>([]);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLElement | null>(null);
  const live = useRef({ providers, raw, setRaw });
  live.current = { providers, raw, setRaw };

  useEffect(() => {
    if (!open) return;
    back.current = document.activeElement as HTMLElement | null;
    // A query from the URL comes back as chips, ready for more words.
    const { raw: r, setRaw: set } = live.current;
    if (query === undefined) set("");
    else if (r.trim() && !/\s$/.test(r)) set(`${r.trim()} `);
    setActiveKey(null);
    setRecents(storeKey ? readRecents(storeKey) : []);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; back.current?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { chips, text } = useMemo(() => splitQuery(raw, facets), [raw, facets]);
  const parsed = useMemo(() => parseQuery(raw, facets), [raw, facets]);
  const empty = !parsed.text && parsed.filters.length === 0;
  const qKey = JSON.stringify(parsed);
  const providerIds = providers.map((p) => p.id).join("\n");

  // Ask each provider after its debounce; a newer query aborts the last one.
  useEffect(() => {
    if (!open) return;
    const q = JSON.parse(qKey) as SpotlightQuery;
    const ps = live.current.providers;
    if (!q.text && !q.filters.length) { setFound({}); return; }
    const ctl = new AbortController();
    setFound((prev) => Object.fromEntries(ps.map((p) => [p.id, { status: "loading", items: prev[p.id]?.items ?? [] }])));
    const timers = ps.map((p) => window.setTimeout(async () => {
      try {
        const items = await p.search(q, ctl.signal);
        if (!ctl.signal.aborted) setFound((f) => ({ ...f, [p.id]: { status: "done", items } }));
      } catch {
        if (!ctl.signal.aborted) setFound((f) => ({ ...f, [p.id]: { status: "error", items: [] } }));
      }
    }, p.debounce ?? 120));
    return () => { ctl.abort(); timers.forEach(clearTimeout); };
  }, [open, qKey, providerIds]);

  const groups = useMemo((): Group[] => {
    const out: Group[] = [];
    const setText = (t: string) => live.current.setRaw(joinQuery(chips, t));
    const itemRow = (p: SearchProvider<SpotlightItem>, item: SpotlightItem, key: string): Row => ({
      key, title: item.title, subtitle: item.subtitle, meta: item.meta, image: item.image, round: item.round,
      preview: p.preview && (() => p.preview!(item)), recent: { p: p.id, item }, pick: () => p.pick(item),
    });
    const cmdRow = (c: Command, key = `c:${c.id}`): Row => ({
      key, title: c.label, meta: c.hint, recent: { p: "command", item: { id: c.id, title: c.label } }, pick: c.run,
    });
    const commandGroups = (match: (c: Command) => boolean) => {
      for (const c of commands.filter(match)) {
        const g = c.group ?? "";
        (out.find((x) => x.key === `cg:${g}`) ?? out[out.push({ key: `cg:${g}`, label: g, rows: [] }) - 1]!).rows.push(cmdRow(c));
      }
    };

    if (empty) {
      const rows = recents.flatMap((r): Row[] => {
        if (r.p === "command") { const c = commands.find((x) => x.id === r.item.id); return c ? [cmdRow(c, `r:command:${c.id}`)] : []; }
        const p = providers.find((x) => x.id === r.p);
        return p ? [itemRow(p, r.item, `r:${p.id}:${r.item.id}`)] : [];
      });
      if (rows.length) out.push({ key: "recent", label: "Recent", rows, action: storeKey ? { label: "Clear", run: () => { try { localStorage.removeItem(storeKey); } catch { /* fine */ } setRecents([]); } } : undefined });
      if (suggestions.length) out.push({ key: "suggest", label: "Try", rows: suggestions.map((s) => ({ key: `s:${s.id}`, title: s.title, subtitle: s.subtitle, keep: true, pick: () => live.current.setRaw(`${s.query.trim()} `) })) });
      if (facets.length) out.push({ key: "facets", label: "Filters", rows: facets.map((f) => ({ key: `f:${f.key}`, title: `${f.key}:`, subtitle: f.label, meta: f.hint, keep: true, pick: () => setText(`${f.key}:`) })) });
      commandGroups(() => true);
      return out;
    }

    // The word being typed: complete a facet's value, or offer facets it could be.
    const typing = /\S$/.test(raw) ? text.split(" ").pop() ?? "" : "";
    const head = text.slice(0, text.length - typing.length);
    const [, key, partial] = /^([A-Za-z][\w-]*):(.*)$/.exec(typing) ?? [];
    const facet = key ? facets.find((f) => f.key.toLowerCase() === key.toLowerCase()) : undefined;
    if (facet?.values?.length) {
      const p = partial!.toLowerCase();
      const values = facet.values.filter((v) => v.toLowerCase().startsWith(p) && v.toLowerCase() !== p).slice(0, 8);
      if (values.length) out.push({ key: "values", label: facet.label, rows: values.map((v) => ({ key: `v:${v}`, title: v, subtitle: `${facet.key}:${v}`, keep: true, pick: () => setText(`${head}${formatFilter({ key: facet.key, value: v })} `) })) });
    }

    for (const p of providers) {
      const f = found[p.id];
      if (!f) continue;
      const limit = p.limit ?? 5;
      const rows = f.items.slice(0, limit).map((item) => itemRow(p, item, `p:${p.id}:${item.id}`));
      if (p.more && f.items.length > limit) rows.push({ key: `m:${p.id}`, title: `See all in ${p.label}`, meta: "→", pick: () => p.more!(parsed) });
      if (rows.length || f.status !== "done") out.push({ key: `p:${p.id}`, label: p.label, rows, loading: f.status === "loading", error: f.status === "error" });
    }

    if (!parsed.filters.length) {
      const words = parsed.text.toLowerCase().split(/\s+/).filter(Boolean);
      commandGroups((c) => words.every((w) => commandWords(c).includes(w)));
    }

    if (typing && !typing.includes(":")) {
      const t = typing.toLowerCase();
      const fs = facets.filter((f) => f.key.toLowerCase().startsWith(t) || f.label.toLowerCase().startsWith(t));
      if (fs.length) out.push({ key: "facets", label: "Filters", rows: fs.map((f) => ({ key: `f:${f.key}`, title: `${f.key}:`, subtitle: f.label, meta: f.hint, keep: true, pick: () => setText(`${head}${f.key}:`) })) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empty, recents, suggestions, facets, commands, providers, found, raw, text, chips, parsed, storeKey]);

  const rows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  const at = Math.max(0, rows.findIndex((r) => r.key === activeKey));
  const active = rows[at];
  const busy = groups.some((g) => g.loading);
  const hasPreview = providers.some((p) => p.preview);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);

  if (!open) return null;

  const pick = (r?: Row) => {
    if (!r) return;
    if (r.keep) { r.pick(); setActiveKey(null); input.current?.focus(); return; }
    if (r.recent && storeKey) {
      const same = (x: Recent) => x.p === r.recent!.p && x.item.id === r.recent!.item.id;
      const next = [r.recent, ...readRecents(storeKey).filter((x) => !same(x))].slice(0, RECENT_MAX);
      try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* fine */ }
    }
    onClose();
    r.pick();
  };
  const move = (i: number) => setActiveKey(rows[Math.min(Math.max(i, 0), rows.length - 1)]?.key ?? null);
  const jumpGroup = (dir: 1 | -1) => {
    const withRows = groups.filter((g) => g.rows.length);
    if (withRows.length < 2) return;
    const g = withRows.findIndex((x) => x.rows.some((r) => r.key === active?.key));
    const next = withRows[(g + dir + withRows.length) % withRows.length]!;
    setActiveKey(next.rows[0]!.key);
  };
  const removeChip = (i: number) => { setRaw(joinQuery(chips.filter((_, j) => j !== i), text)); setActiveKey(null); input.current?.focus(); };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(at + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(at - 1); }
    else if (e.key === "Enter") { e.preventDefault(); pick(active); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "Tab") { e.preventDefault(); jumpGroup(e.shiftKey ? -1 : 1); }
    else if (e.key === "Backspace" && !text && chips.length && e.currentTarget.selectionStart === 0) { e.preventDefault(); removeChip(chips.length - 1); }
  };
  const label = (key: string) => facets.find((f) => f.key === key)?.label ?? key;
  const shown = placeholder ?? (providers.length ? "Search" : "Search pages and actions");

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-center bg-black/60 px-3 pt-[calc(var(--safe-top)+12px)] backdrop-blur-xs sm:pt-[12vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Search"
        className={cn("flex max-h-[min(34rem,calc(100dvh-var(--safe-top)-24px))] w-full max-w-lg flex-col self-start overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl shadow-black/60",
          hasPreview && "md:h-[min(34rem,calc(100dvh-var(--safe-top)-24px))] md:max-w-3xl")}>
        <div className="shrink-0 border-b border-border">
          <label className="flex items-center gap-3 px-4 text-text-subtle">
            <SearchIcon />
            <span className="sr-only">{shown}</span>
            <input ref={input} autoFocus value={text} onKeyDown={onKey}
              onChange={(e) => { setRaw(joinQuery(chips, e.target.value)); setActiveKey(null); }}
              placeholder={chips.length ? "Add words or filters" : shown} role="combobox" aria-expanded="true" aria-controls={id}
              aria-autocomplete="list" aria-activedescendant={active ? `${id}-${at}` : undefined}
              enterKeyHint="go" autoCapitalize="off" autoCorrect="off" spellCheck={false}
              className="h-14 min-w-0 flex-1 bg-transparent text-base text-text-base outline-hidden placeholder:text-text-subtle" />
            {busy && <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" />}
            <kbd className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-11 text-text-subtle sm:block">esc</kbd>
          </label>
          {chips.length > 0 && (
            <div className="-mt-1 flex flex-wrap gap-2 px-4 pb-3">
              {chips.map((c, i) => (
                <button key={`${c.key}:${c.value}:${i}`} type="button" onClick={() => removeChip(i)} aria-label={`Remove filter ${label(c.key)} ${c.value}`}
                  className="chip relative min-h-9 text-text-base transition-colors before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] hover:border-accent">
                  <span className="text-text-subtle">{label(c.key)}</span>
                  <span className="font-semibold">{c.value}</span>
                  <svg className="-mr-1 text-text-subtle" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1">
          <div ref={list} id={id} role="listbox" aria-label="Results" className="min-w-0 flex-1 overflow-y-auto overscroll-contain py-1.5 pb-[max(0.375rem,var(--safe-bottom))]">
            {groups.map((g) => (
              <div key={g.key} role="group" aria-labelledby={`${id}-${g.key}`}>
                {(g.label || g.action) && (
                  <div className={cn("flex items-center justify-between gap-3 px-4", g.action ? "min-h-11" : "pb-1 pt-2.5")}>
                    <p id={`${id}-${g.key}`} className="eyebrow">{g.label}</p>
                    {g.loading && g.rows.length > 0 && <span className="meta">Searching…</span>}
                    {g.action && <button type="button" onClick={() => { g.action!.run(); input.current?.focus(); }} className="link-action -mr-2 min-h-11 px-2 text-sm">{g.action.label}</button>}
                  </div>
                )}
                {g.rows.map((r) => {
                  const i = rows.indexOf(r);
                  return (
                    <div key={r.key} id={`${id}-${i}`} data-index={i} role="option" aria-selected={i === at}
                      onPointerMove={() => setActiveKey(r.key)} onClick={() => pick(r)}
                      className={cn("mx-1.5 flex cursor-pointer items-center gap-3 rounded-lg px-2.5", r.subtitle || r.image !== undefined ? "min-h-14 py-2" : "min-h-11",
                        i === at ? "bg-surface-2" : "")}>
                      {r.image !== undefined && <Thumb image={r.image} round={r.round} />}
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-15 font-semibold", i === at ? "text-text-base" : "text-text-muted")}>{r.title}</span>
                        {r.subtitle && <span className="block truncate text-sm text-text-subtle">{r.subtitle}</span>}
                      </span>
                      {r.meta && <span className="shrink-0 text-xs font-medium text-text-subtle">{r.meta}</span>}
                    </div>
                  );
                })}
                {g.loading && g.rows.length === 0 && (
                  <div aria-hidden="true" className="mx-1.5 flex min-h-14 items-center gap-3 px-2.5">
                    <span className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-surface-2" />
                    <span className="flex-1 space-y-2"><span className="block h-3 w-1/2 animate-pulse rounded-sm bg-surface-2" /><span className="block h-2.5 w-1/3 animate-pulse rounded-sm bg-surface-2" /></span>
                  </div>
                )}
                {g.error && <p className="px-4 pb-2 text-sm text-text-muted">Couldn't search {g.label.toLowerCase()}. Try again in a moment.</p>}
              </div>
            ))}
            {!empty && rows.length === 0 && !busy && (
              <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                <span aria-hidden="true" className="inline-flex gap-1">{(["motif-accent", "motif-highlight", "motif-support"] as const).map((m) => <span key={m} className={cn(m, "h-2 w-2")} />)}</span>
                <p className="text-sm text-text-muted">Nothing matches “{formatQuery(parsed)}”.{chips.length > 0 && " Try taking off a filter."}</p>
              </div>
            )}
            {empty && rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-text-muted">Type to search.</p>}
          </div>
          {hasPreview && (
            <aside aria-label="Preview" className="hidden w-80 shrink-0 overflow-y-auto overscroll-contain border-l border-border md:block">
              {active?.preview ? active.preview() : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-text-subtle">Highlight a result to see it here.</div>
              )}
            </aside>
          )}
        </div>

        <div className="hidden shrink-0 items-center gap-4 border-t border-border px-4 py-2 text-11 text-text-subtle sm:flex">
          {[["↑↓", "move"], ["↵", "open"], ["tab", "next group"], ["esc", "close"]].map(([k, v]) => (
            <span key={v} className="flex items-center gap-1.5"><kbd className="rounded-md border border-border px-1.5 py-0.5 font-mono">{k}</kbd>{v}</span>
          ))}
        </div>
        <p className="sr-only" aria-live="polite">{busy ? "Searching" : empty ? "" : `${rows.length} results`}</p>
      </div>
    </div>,
    document.body,
  );
}
