/**
 * Overlays that float by something on the page: Menu (a list of actions),
 * Popover (a small panel of controls), Tooltip (a label for an icon button)
 * and CommandPalette (⌘K: find a page or run an action by typing).
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
// CommandPalette — ⌘K: go anywhere or do anything by typing
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

/** Opens the palette on ⌘K or Ctrl+K, from anywhere. `[open, setOpen]`. */
export function useCommandPalette(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return [open, setOpen];
}

/**
 * Find a page or run an action by typing: a search field over a list of
 * commands grouped under headings, matched on label and keywords. Arrow keys
 * move, Enter runs, Escape closes. Open it with `useCommandPalette` (⌘K) and
 * a top-bar search button, so phones can reach it too. Desktop's shortcut,
 * never the only way to something.
 */
export function CommandPalette({ open, onClose, commands, placeholder = "Search pages and actions" }: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const back = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    back.current = document.activeElement as HTMLElement | null;
    setQ(""); setActive(0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; back.current?.focus?.(); };
  }, [open]);

  const matches = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter((c) => {
      const hay = [c.label, c.group ?? "", ...(c.keywords ?? [])].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [commands, q]);
  const groups = useMemo(() => {
    const out: { group: string; items: { c: Command; i: number }[] }[] = [];
    matches.forEach((c, i) => {
      const g = c.group ?? "";
      (out.find((x) => x.group === g) ?? out[out.push({ group: g, items: [] }) - 1]!).items.push({ c, i });
    });
    return out;
  }, [matches]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;
  const run = (c?: Command) => { if (!c) return; onClose(); c.run(); };
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); run(matches[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "Tab") e.preventDefault();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-center bg-black/60 px-3 pt-[calc(var(--safe-top)+12px)] backdrop-blur-xs sm:pt-[12vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Command palette"
        className="flex max-h-[min(32rem,calc(100dvh-var(--safe-top)-24px))] w-full max-w-lg flex-col self-start overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl shadow-black/60">
        <label className="flex shrink-0 items-center gap-3 border-b border-border px-4">
          <svg className="shrink-0 text-text-subtle" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="sr-only">{placeholder}</span>
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey}
            placeholder={placeholder} role="combobox" aria-expanded="true" aria-controls={id}
            aria-activedescendant={matches[active] ? `${id}-${active}` : undefined}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-text-base outline-hidden placeholder:text-text-subtle" />
          <kbd className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-11 text-text-subtle sm:block">esc</kbd>
        </label>
        <ul ref={list} id={id} role="listbox" aria-label="Commands" className="flex-1 overflow-y-auto overscroll-contain py-1.5">
          {groups.map(({ group, items }) => (
            <li key={group} role="presentation">
              {group && <p className="eyebrow px-4 pb-1 pt-2.5">{group}</p>}
              <ul role="presentation">
                {items.map(({ c, i }) => (
                  <li key={c.id} id={`${id}-${i}`} data-index={i} role="option" aria-selected={i === active}
                    onPointerMove={() => setActive(i)} onClick={() => run(c)}
                    className={cn("mx-1.5 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-15 font-semibold", i === active ? "bg-surface-2 text-text-base" : "text-text-muted")}>
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    {c.hint && <span className="shrink-0 text-xs font-medium text-text-subtle">{c.hint}</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {matches.length === 0 && <li className="px-4 py-8 text-center text-sm text-text-muted">Nothing matches “{q.trim()}”.</li>}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
