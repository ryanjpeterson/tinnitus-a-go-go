/**
 * jimbo.ui reference kit — an exact copy of jimbo-ui's reference/web/src/components/ui/kit.tsx.
 * Update it by copying; Tinnitus's own pieces live in ./kit.tsx, which re-exports this.
 */

/**
 * The UI kit — the shared building blocks every page is assembled from.
 *
 * Mobile first: full-width rows with 44px+ tap targets, nothing that scrolls
 * sideways, and type that steps up a size on phones rather than down.
 * Look: bold heading font, image heroes with a dark gradient, ticket-style
 * date blocks on dated rows, chevrons on anything that navigates.
 *
 * jimbo-ui reference: copy into an app and extend it with the app's own
 * domain pieces (statuses, rows, switches) built from the same tokens.
 */

import { Children, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { backdropCss, fullTheme, loadFonts, themeVars, type BackdropPattern, type Theme } from "@/lib/theme";
import { useBrand } from "@/lib/useBrand";
import { BRAND } from "@/lib/brand.config";

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/** "2026-10-14" → { month: "OCT", day: "14", year: "2026", weekday: "Wed" } (UTC, so dates don't shift). */
export function dateParts(iso: string): { month: string; day: string; year: string; weekday: string } {
  const date = /^\d{4}-\d{2}-\d{2}/.test(iso) ? new Date(`${iso.slice(0, 10)}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime())) return { month: "", day: "?", year: iso.slice(0, 4), weekday: "" };
  return {
    month: date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(),
    day: String(date.getUTCDate()),
    year: String(date.getUTCFullYear()),
    weekday: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
  };
}

/** Up to two initials for an avatar placeholder: "Main Hall" → "MH". */
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tones — fixed colours for states that carry meaning (statuses, badges)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Status colours are fixed, not themed, because they carry meaning. The
 * "done" state uses the accent. An app maps its own statuses onto these
 * (e.g. done / going / maybe / missed / cancelled).
 */
export type Tone = "accent" | "yellow" | "purple" | "red" | "muted";

export const TONES: Record<Tone, { text: string; chip: string; border: string; tint: string; dot: string }> = {
  accent: { text: "text-accent",      chip: "bg-accent-950 text-accent border-accent-700",      border: "border-accent-700", tint: "bg-accent-950", dot: "bg-accent" },
  yellow: { text: "text-yellow-400",  chip: "bg-yellow-950 text-yellow-400 border-yellow-700", border: "border-yellow-600", tint: "bg-yellow-950", dot: "bg-yellow-400" },
  purple: { text: "text-purple-400",  chip: "bg-purple-950 text-purple-400 border-purple-800", border: "border-purple-700", tint: "bg-purple-950", dot: "bg-purple-400" },
  red:    { text: "text-red-400",     chip: "bg-red-950 text-red-400 border-red-800",          border: "border-red-700",    tint: "bg-red-950",    dot: "bg-red-400" },
  muted:  { text: "text-text-subtle", chip: "bg-surface-2 text-text-subtle border-border",      border: "border-border",     tint: "bg-surface-2",  dot: "bg-text-subtle" },
};

/** A status dot: a 10 px flat circle (add a tone's `dot`). */
export const STATUS_DOT = "h-2.5 w-2.5 shrink-0 rounded-full";

/** A status dot that pulses while something is happening (running, syncing) — movement keeps it apart from a same-coloured still dot. */
export const LIVE = "animate-pulse";

/** A status as a labelled chip — for detail pages, headers and settings. `dot`: a status dot before the label (`live` pulses it). */
export function Badge({ tone, children, dot = false, live = false, className }: { tone: Tone; children: ReactNode; dot?: boolean; live?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold", TONES[tone].chip, className)}>
      {dot && <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", TONES[tone].dot, live && LIVE)} />}
      {children}
    </span>
  );
}

/** A status on a row: a tone plus the words a screen reader and tooltip use; `live` pulses the dot (running now). */
export type RowStatus = { tone: Tone; label: string; live?: boolean };

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────

export function Chevron({ dir = "right", className }: { dir?: "left" | "right" | "down"; className?: string }) {
  const d = dir === "left" ? "M15 18l-6-6 6-6" : dir === "down" ? "M6 9l6 6 6-6" : "M9 18l6-6-6-6";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
      strokeLinecap="round" strokeLinejoin="round" className={cn("shrink-0", className)} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme dots — the circle motif
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The theme's colours (accent, highlight, support) as flat dots side by side —
 * jimbo.ui's motif. In empty states and brand moments only; never above a page
 * title. Decorative; follows the live theme.
 */
export function ThemeDots({ size = 8, className }: { size?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center", className)} style={{ gap: size >= 16 ? 6 : 4 }}>
      {(["dot-accent", "dot-highlight", "dot-support"] as const).map((dot) => (
        <span key={dot} className={dot} style={{ width: size, height: size }} />
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Full width — edge-to-edge sections inside the page column
// ─────────────────────────────────────────────────────────────────────────────

const BLEED_TONES = {
  none: "",
  surface: "border-y border-border bg-surface",
  accent: "bg-accent text-on-accent shadow-[inset_0_1px_0_0_rgb(var(--c-accent-darker)/0.55),inset_0_-1px_0_0_rgb(var(--c-accent-darker)/0.55)]",
  highlight: "bg-highlight text-on-highlight shadow-[inset_0_1px_0_0_rgb(var(--c-highlight-darker)/0.55),inset_0_-1px_0_0_rgb(var(--c-highlight-darker)/0.55)]",
  support: "bg-support text-on-support shadow-[inset_0_1px_0_0_rgb(var(--c-support-darker)/0.55),inset_0_-1px_0_0_rgb(var(--c-support-darker)/0.55)]",
} as const;

/**
 * Part of the page in another theme — its colours, type and backdrop — without
 * touching the rest (a carousel of looks, a preview). Loads the theme's fonts.
 */
export function ThemeScope({ theme, className, children }: { theme: Theme; className?: string; children: ReactNode }) {
  useEffect(() => { const f = fullTheme(theme).fonts; loadFonts([f.headings!, f.body!]); }, [theme]);
  return <div className={cn("theme-scope", className)} style={themeVars(theme) as React.CSSProperties}>{children}</div>;
}

/**
 * Breaks out of the page column to the full screen width — a band, a strip of
 * media, a hero. Its content lines up with the page column again unless
 * `flush`. `tone` fills it: the surface, or a flat brand colour (with its
 * `on-` text). The app shell clips sideways overflow, so 100vw is safe.
 */
export function FullBleed({ children, tone = "none", flush = false, pad = true, className, style }: {
  children: ReactNode;
  tone?: keyof typeof BLEED_TONES;
  /** Content runs edge to edge too (media, maps). */
  flush?: boolean;
  /** Vertical padding (24 / 32 px). */
  pad?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={cn("relative ml-[calc(50%-50vw)] w-screen", BLEED_TONES[tone], pad && "py-6 sm:py-8", className)} style={style}>
      <div className={flush ? "" : "mx-auto max-w-5xl px-4 sm:px-6"}>{children}</div>
    </section>
  );
}

/**
 * A full-width page opener without a photo: big title, a line, actions, over
 * an abstract pattern in the theme's colours (any backdrop pattern) on a
 * gradient. Use at the top of a landing or home page; `size="lg"` fills most
 * of the first screen. Pulls up under the top bar like `Banner`.
 */
export function HeroSection({ eyebrow, title, children, actions, pattern = "ripples", size = "md", align = "left", pullUp = true }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** A line or two under the title. */
  children?: ReactNode;
  actions?: ReactNode;
  pattern?: BackdropPattern;
  size?: "md" | "lg";
  align?: "left" | "center";
  /** Tuck up under the top bar (the default, when it opens the page). Turn off when something sits above it. */
  pullUp?: boolean;
}) {
  const { theme } = useBrand();
  const look = backdropCss({ ...theme, backdrop: { pattern, base: "gradient", intensity: 0.75, scale: 0.8 } });
  return (
    <FullBleed pad={false} className={cn("isolate mb-2", pullUp && "-mt-6 sm:-mt-8")}>
      {/* The pattern fades out top and bottom (.fade-out, plus .fade-in when something sits above),
          so the opener melts into the page's backdrop instead of ending on a line. */}
      <div aria-hidden="true" className={cn("fade-out absolute inset-0 -z-10", !pullUp && "fade-both")}
        style={{ backgroundImage: look.image, backgroundSize: look.size, backgroundPosition: look.position, backgroundRepeat: look.repeat }} />
      <div className={cn("flex flex-col justify-end gap-3 py-10 sm:py-14", size === "lg" ? "min-h-[62dvh]" : "min-h-[34dvh]", align === "center" && "items-center text-center")}>
        {eyebrow && <p className="eyebrow text-support">{eyebrow}</p>}
        <h1 className="font-display text-[40px] leading-[1.02] text-text-base sm:text-6xl">{title}</h1>
        {children && <div className={cn("max-w-xl text-[17px] text-text-muted", align === "center" && "mx-auto")}>{children}</div>}
        {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </FullBleed>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page scaffolding
// ─────────────────────────────────────────────────────────────────────────────

export function PageHeader({ eyebrow, title, count, actions, className }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  count?: number;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-5 sm:mb-6", className)}>
      {eyebrow && <p className="eyebrow mb-1 text-support">{eyebrow}</p>}
      <div className="flex items-end justify-between gap-3">
        <h1 className="h-page min-w-0">
          {title}
          {count != null && count > 0 && (
            <span className="ml-2 align-middle text-base font-body font-medium text-text-subtle">{count.toLocaleString()}</span>
          )}
        </h1>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** Round back button — sits top-left on heroes and above plain pages. */
export function BackButton({ to, label, overlay = false }: { to: string; label: string; overlay?: boolean }) {
  return (
    <Link
      to={to}
      aria-label={`Back to ${label}`}
      className={cn(
        "inline-flex h-10 items-center gap-1 rounded-full pl-2 pr-3.5 text-sm font-semibold transition-colors",
        overlay
          ? "bg-black/45 text-white backdrop-blur-md hover:bg-black/60"
          : "-ml-2 text-text-muted hover:text-text-base",
      )}
    >
      <Chevron dir="left" />
      {label}
    </Link>
  );
}

/**
 * Full-width banner at the top of a page: the backdrop runs edge to edge of
 * the screen with no frame, while its content lines up with the page column.
 */
export function Banner({ backdrop, glow = "accent", back, badge, children, pullUp = true }: {
  /** Image blurred to fill the banner; falls back to a soft accent gradient. */
  backdrop?: string | null;
  glow?: "accent" | "highlight" | "support" | "yellow" | "purple";
  back?: { to: string; label: string };
  /** Top-right of the banner, opposite the back button (e.g. a status flag). */
  badge?: ReactNode;
  children: ReactNode;
  /** Tuck up under the top bar (the default, when it opens the page). Turn off when something sits above it. */
  pullUp?: boolean;
}) {
  const glowCls = {
    accent: "from-accent-900/70",
    highlight: "from-highlight-900/70",
    support: "from-support-900/70",
    yellow: "from-yellow-900/70",
    purple: "from-purple-900/70",
  }[glow];

  return (
    // Breaks out of the page column to the full screen width and up against the app bar.
    <section className={cn("relative isolate mb-6 ml-[calc(50%-50vw)] w-screen overflow-hidden sm:mb-8", pullUp && "-mt-6 sm:-mt-8")}>
      {/* Backdrop: the image itself, blurred and scaled up so it fills the whole
          banner edge to edge (scaling hides the soft edges blur leaves behind),
          under a light dim. The whole layer fades out at the bottom (.fade-out), so
          the page's own backdrop shows through — never a hard edge or a band of page colour. */}
      <div aria-hidden="true" className={cn("fade-out absolute inset-0 -z-10 overflow-hidden", !pullUp && "fade-both")}>
        {backdrop ? (
          <img src={backdrop} alt="" className="absolute inset-0 h-full w-full scale-150 object-cover blur-2xl saturate-150" />
        ) : (
          <div className={cn("absolute inset-0 bg-gradient-to-br via-support-950/60 to-transparent", glowCls)} />
        )}
        <div className="absolute inset-0 bg-black/35" />
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {(back || badge) && (
          <div className="flex min-h-[56px] items-center justify-between gap-3 pt-3 sm:pt-4">
            {back ? <BackButton to={back.to} label={back.label} overlay /> : <span />}
            {badge}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

/** Full-size image over the page; tap anywhere or press Escape to close. */
export function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  // Portalled to <body> so it covers the app bar and tab bar (the banner it
  // opens from is its own stacking context).
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 pt-[calc(1rem+var(--safe-top))] backdrop-blur-md">
      <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
      <button onClick={onClose} aria-label="Close"
        className="absolute right-4 top-[calc(1rem+var(--safe-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}

/**
 * Banner for detail pages: thumbnail (tap for full size), eyebrow, big title,
 * meta lines and pill actions over the blurred image.
 */
export function Hero({ imageUrl, imageAlt, eyebrow, title, children, actions, back, badge, accent = "accent", square = false, pullUp = true }: {
  imageUrl?: string | null;
  imageAlt?: string;
  eyebrow?: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  /** Shown top-right, e.g. a status Badge. */
  badge?: ReactNode;
  accent?: "accent" | "highlight" | "support" | "yellow" | "purple";
  /** Square thumbnail (people, places) instead of a portrait one (posters). */
  square?: boolean;
  /** As `Banner`'s: off when something sits above the hero. */
  pullUp?: boolean;
}) {
  const glow = {
    accent: "from-accent-900/70",
    highlight: "from-highlight-900/70",
    support: "from-support-900/70",
    yellow: "from-yellow-900/70",
    purple: "from-purple-900/70",
  }[accent];
  const [viewing, setViewing] = useState(false);
  const thumbCls = cn(
    "shrink-0 overflow-hidden rounded-xl border border-white/10 bg-surface-2 shadow-2xl shadow-black/50",
    square ? "h-24 w-24 sm:h-44 sm:w-44" : "h-32 w-24 sm:h-60 sm:w-44",
  );

  return (
    <Banner backdrop={imageUrl} glow={accent} back={back} badge={badge} pullUp={pullUp}>
      {viewing && imageUrl && <ImageViewer src={imageUrl} alt={imageAlt ?? title} onClose={() => setViewing(false)} />}
      <div className="flex items-end gap-4 pb-6 pt-6 sm:gap-8 sm:pb-8 sm:pt-10">
        <div className={thumbCls}>
          {imageUrl ? (
            <button type="button" onClick={() => setViewing(true)} aria-label="View full size"
              className="group relative block h-full w-full cursor-zoom-in">
              <img src={imageUrl} alt={imageAlt ?? title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
              {/* Small expand hint in the corner */}
              <span className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white/90 backdrop-blur-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              </span>
            </button>
          ) : (
            <div className={cn("flex h-full w-full items-center justify-center bg-gradient-to-br to-surface-2", glow)}>
              <span className="font-display text-3xl text-white/40 sm:text-5xl">{initials(title)}</span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="eyebrow mb-1.5 text-text-muted">{eyebrow}</p>}
          <h1 className="font-display text-[28px] leading-[1.05] text-white break-words sm:text-6xl">{title}</h1>
          {children && <div className="mt-2 space-y-0.5 text-[15px] text-text-muted sm:mt-3 sm:text-lg">{children}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2 pb-6 sm:pb-8">{actions}</div>}
    </Banner>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sections and lists
// ─────────────────────────────────────────────────────────────────────────────

/** Titled block. `flush` drops the inner padding for edge-to-edge lists; `plain` drops the card (for a grid of tiles under a title). */
export function Section({ title, count, action, children, flush = false, plain = false, className }: {
  title?: ReactNode;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  plain?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3 px-0.5">
          {title && (
            <h2 className="h-section">
              {title}
              {count != null && <span className="ml-2 text-sm font-body font-medium text-text-subtle">{count.toLocaleString()}</span>}
            </h2>
          )}
          {action}
        </div>
      )}
      {plain ? children : <div className={cn("card", flush ? "overflow-hidden" : "p-4 sm:p-5")}>{children}</div>}
    </section>
  );
}

export type ListLayout = "rows" | "tiles";

/**
 * Divided list inside a card — pair with EventRow / EntityRow. `layout="tiles"`
 * shows the same items as a grid of cards instead (one column on phones, two
 * or three wider); `bare` leaves out the card around rows, for use inside a
 * `Section flush`. Let people pick with `LayoutSwitch` + `useListLayout`.
 */
export function List({ children, layout = "rows", bare = false, className }: { children: ReactNode; layout?: ListLayout; bare?: boolean; className?: string }) {
  if (layout === "tiles") {
    return (
      <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
        {Children.toArray(children).map((child, i) => <div key={i} className="card overflow-hidden">{child}</div>)}
      </div>
    );
  }
  return <div className={cn(!bare && "card overflow-hidden", "divide-etched", className)}>{children}</div>;
}

/** Rows or tiles, remembered per list (`key`) in this browser. */
export function useListLayout(key: string, initial: ListLayout = "rows"): [ListLayout, (l: ListLayout) => void] {
  const storageKey = `${BRAND.storagePrefix}.layout.${key}`;
  const [layout, setLayout] = useState<ListLayout>(() => {
    try { const v = localStorage.getItem(storageKey); return v === "rows" || v === "tiles" ? v : initial; } catch { return initial; }
  });
  const set = (l: ListLayout) => {
    setLayout(l);
    try { localStorage.setItem(storageKey, l); } catch { /* storage unavailable: the choice lasts until reload */ }
  };
  return [layout, set];
}

/** The rows ⇄ tiles switch for a `List` — small `Tabs`, sized for a `Section`'s action slot. */
export function LayoutSwitch({ value, onChange }: { value: ListLayout; onChange: (l: ListLayout) => void }) {
  return <Tabs size="sm" value={value} onChange={onChange} options={[{ value: "rows", label: "List" }, { value: "tiles", label: "Tiles" }]} />;
}

/** Sticky-style group label between rows (month headers etc.). */
export function ListGroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="list-group-label flex items-center gap-2 bg-gradient-to-r from-support-900/50 via-support-950/40 to-transparent px-4 py-2 text-xs font-semibold uppercase tracking-wider text-support">
      <span aria-hidden="true" className="dot-support h-2 w-2" />
      {children}
    </div>
  );
}

/**
 * A tear-off calendar ticket: the month on a solid, lit highlight band, the day
 * big below it, then the year or weekday. Opaque colour on purpose — a thin
 * wash of the highlight would go grey on a background of the opposite hue.
 */
export function DateBlock({ date, showYear = false, approximate = false }: { date: string; showYear?: boolean; approximate?: boolean }) {
  const p = dateParts(date);
  return (
    <div className="flex w-[52px] shrink-0 flex-col items-center overflow-hidden rounded-xl border border-border bg-surface-2 leading-none shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_6px_14px_-8px_rgba(0,0,0,0.6)] sm:w-14">
      <span className="lit-highlight w-full py-[3px] text-center text-[10px] font-bold tracking-wider">{p.month}</span>
      <span className="pt-1 font-display text-[24px] leading-[1.05] text-text-base sm:text-[26px]">{approximate ? "~" : p.day}</span>
      <span className="pb-1.5 text-[10.5px] font-medium text-text-subtle">{showYear ? p.year : p.weekday}</span>
    </div>
  );
}

const rowBase = "group flex items-center gap-3 px-4 py-3.5 min-h-[76px] transition-colors hover:bg-surface-2/70 active:bg-surface-2 sm:gap-4";

/** A dated item as a row: date block, optional thumb, title, sub lines, status dot, chevron. */
export function EventRow({ to, onOpen, date, title, subtitle, meta, imageUrl, status, showYear = true, approximate, selected, onSelect }: {
  /** Where the row goes. Or give `onOpen` instead, to open something in place (a log in a Sheet). */
  to?: string;
  onOpen?: () => void;
  date: string;
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  imageUrl?: string | null;
  status?: RowStatus | null;
  showYear?: boolean;
  approximate?: boolean;
  /** Selection mode: the row toggles instead of opening the item. */
  selected?: boolean;
  onSelect?: () => void;
}) {
  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} aria-pressed={!!selected}
        className={cn(rowBase, "w-full text-left", selected && "bg-accent/10")}>
        <span className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          selected ? "lit-accent border-accent" : "border-border",
        )}>
          {selected && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
          )}
        </span>
        <DateBlock date={date} showYear={showYear} approximate={approximate} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-text-base sm:text-base">{title}</p>
          {subtitle && <p className="mt-0.5 truncate text-sm text-text-muted">{subtitle}</p>}
          {meta && <p className="mt-0.5 truncate text-xs text-text-subtle">{meta}</p>}
        </div>
      </button>
    );
  }
  const body = (
    <>
      <DateBlock date={date} showYear={showYear} approximate={approximate} />
      {imageUrl !== undefined && (
        <div className="hidden h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:block">
          {imageUrl && <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-text-base group-hover:text-accent sm:text-base">{title}</p>
        {subtitle && <p className="mt-0.5 truncate text-sm text-text-muted">{subtitle}</p>}
        {meta && <p className="mt-0.5 truncate text-xs text-text-subtle">{meta}</p>}
      </div>
      {/* Status as a quiet dot — the label is in the tooltip and on the detail page */}
      {status && <span title={status.label} aria-label={status.label} className={cn(STATUS_DOT, TONES[status.tone].dot, status.live && LIVE)} />}
      <Chevron className="text-text-subtle group-hover:text-accent" />
    </>
  );
  return onOpen || !to
    ? <button type="button" onClick={onOpen} className={cn(rowBase, "w-full text-left")}>{body}</button>
    : <Link to={to} className={rowBase}>{body}</Link>;
}

/**
 * A read-only label and its value: `inline` (label left, value right — settings, a job's details)
 * or `stacked` (a small label above — a detail page's facts). Put several in a `List` or `Section flush`.
 */
export function KeyValue({ label, children, layout = "inline" }: { label: ReactNode; children: ReactNode; layout?: "inline" | "stacked" }) {
  return layout === "inline" ? (
    <div className="flex min-h-[56px] items-center justify-between gap-4 px-4 py-3">
      <span className="text-[15px] font-semibold text-text-base">{label}</span>
      <span className="min-w-0 text-right text-sm text-text-muted">{children}</span>
    </div>
  ) : (
    <div className="px-4 py-3">
      <p className="text-xs font-semibold text-text-subtle">{label}</p>
      <div className="mt-0.5 text-[15px] text-text-base">{children}</div>
    </div>
  );
}

/** One setting turned on or off, as a whole-row switch (44 px+ tall) with a label and an optional hint. */
export function SwitchRow({ label, hint, checked, onChange, disabled }: {
  label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2/60 disabled:opacity-60">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        {hint && <span className="block text-sm text-text-muted">{hint}</span>}
      </span>
      <span className={cn("relative h-7 w-12 shrink-0 rounded-full border transition-colors", checked ? "lit-accent border-accent" : "border-border bg-surface-2")}>
        <span className={cn("absolute top-0.5 h-[22px] w-[22px] rounded-full shadow-sm transition-[left]", checked ? "left-[22px] bg-on-accent" : "left-0.5 bg-text-subtle")} />
      </span>
    </button>
  );
}

export type AutocompleteOption = { id: string; label: string; sub?: ReactNode };

/**
 * Pick an existing record as you type, or make a new one: a field with a list of matches
 * under it (arrow keys, Enter, Escape). `onCreate` adds "Add “…”" when nothing matches
 * exactly. For several (a lineup, tags), keep the picks as chips above it and clear the text on pick.
 */
export function Autocomplete({ label, value, onChange, options, onPick, onCreate, placeholder }: {
  label?: string;
  value: string;
  onChange: (text: string) => void;
  /** The matches for `value` (the app filters or fetches them). */
  options: AutocompleteOption[];
  onPick: (option: AutocompleteOption) => void;
  onCreate?: (text: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const text = value.trim();
  const canCreate = !!onCreate && !!text && !options.some((o) => o.label.toLowerCase() === text.toLowerCase());
  const count = options.length + (canCreate ? 1 : 0);
  const choose = (i: number) => {
    if (i < options.length) onPick(options[i]!);
    else if (canCreate) onCreate!(text);
    setOpen(false);
  };
  return (
    <div className="relative">
      {label && <label className="label">{label}</label>}
      <input value={value} placeholder={placeholder} role="combobox" aria-expanded={open && count > 0} aria-autocomplete="list"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, count - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && count) { e.preventDefault(); choose(active); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className={cn("field h-12 w-full sm:h-11", label && "mt-1.5")} />
      {open && count > 0 && text && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-2xl">
          {options.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)}
                className={cn("block min-h-[44px] w-full px-3 py-2 text-left", i === active && "bg-surface-2")}>
                <span className="block truncate text-[15px] font-semibold">{o.label}</span>
                {o.sub && <span className="block truncate text-xs text-text-subtle">{o.sub}</span>}
              </button>
            </li>
          ))}
          {canCreate && (
            <li role="option" aria-selected={active === options.length}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(options.length)}
                className={cn("block min-h-[44px] w-full px-3 py-2 text-left text-[15px] font-semibold text-accent", active === options.length && "bg-surface-2")}>
                Add “{text}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** A named thing (person, place, group) as a row with an avatar. */
export function EntityRow({ to, name, imageUrl, sub, meta, round = false }: {
  to: string;
  name: string;
  imageUrl?: string | null;
  sub?: ReactNode;
  meta?: ReactNode;
  round?: boolean;
}) {
  return (
    <Link to={to} className={rowBase}>
      <div className={cn("h-12 w-12 shrink-0 overflow-hidden bg-surface-2", round ? "rounded-full" : "rounded-lg")}>
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="dot-support flex h-full w-full items-center justify-center font-display text-base text-on-support">{initials(name)}</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-text-base group-hover:text-accent sm:text-base">{name}</p>
        {sub && <p className="mt-0.5 truncate text-sm text-text-muted">{sub}</p>}
      </div>
      {meta && <span className="shrink-0 text-sm font-medium text-text-subtle">{meta}</span>}
      <Chevron className="text-text-subtle group-hover:text-accent" />
    </Link>
  );
}

/** Image-led card for grids. */
export function MediaCard({ to, name, imageUrl, sub, meta, aspect = "video", contain = false, badge }: {
  to: string;
  name: string;
  imageUrl?: string | null;
  sub?: ReactNode;
  meta?: ReactNode;
  aspect?: "video" | "square" | "portrait";
  /** Fit the whole image (posters) over a blurred copy instead of cropping. */
  contain?: boolean;
  badge?: ReactNode;
}) {
  const aspectCls = aspect === "square" ? "aspect-square" : aspect === "portrait" ? "aspect-[3/4]" : "aspect-video";
  return (
    <Link to={to} className="group card flex flex-col overflow-hidden transition-colors hover:border-accent/60">
      <div className={cn("relative overflow-hidden bg-surface-2", aspectCls)}>
        {imageUrl ? (
          contain ? (
            <>
              <img src={imageUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-lg" />
              <img src={imageUrl} alt={name} loading="lazy" className="relative h-full w-full object-contain" />
            </>
          ) : (
            <img src={imageUrl} alt={name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-2 to-surface">
            <span className="font-display text-3xl text-text-subtle/50">{initials(name)}</span>
          </div>
        )}
        {badge && <div className="absolute left-2 top-2">{badge}</div>}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-text-base group-hover:text-accent">{name}</p>
        {sub && <p className="truncate text-sm text-text-muted">{sub}</p>}
        {meta && <p className="mt-auto truncate pt-1 text-xs font-medium text-text-subtle">{meta}</p>}
      </div>
    </Link>
  );
}

/** Tappable summary card: eyebrow, title, sub line, chevron. */
const DOT = { accent: "dot-accent", highlight: "dot-highlight", support: "dot-support" } as const;
/** A soft pool of the colour in a card's top-right corner, over the card's own gradient. */
const GLOW = {
  accent: "bg-[radial-gradient(circle_at_100%_0%,rgb(var(--c-accent)/0.2),transparent_55%),linear-gradient(rgb(var(--c-surface)/0.9),rgb(var(--c-bg-deep)/0.9))]",
  highlight: "bg-[radial-gradient(circle_at_100%_0%,rgb(var(--c-highlight)/0.2),transparent_55%),linear-gradient(rgb(var(--c-surface)/0.9),rgb(var(--c-bg-deep)/0.9))]",
  support: "bg-[radial-gradient(circle_at_100%_0%,rgb(var(--c-support)/0.2),transparent_55%),linear-gradient(rgb(var(--c-surface)/0.9),rgb(var(--c-bg-deep)/0.9))]",
} as const;

export function LinkCard({ to, eyebrow, title, sub, accent = false }: {
  to?: string;
  eyebrow: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  /** Accent border — for the one card on a page that should stand out. */
  accent?: boolean;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="eyebrow mb-1">{eyebrow}</p>
        <p className="truncate text-base font-semibold text-text-base group-hover:text-accent sm:text-lg">{title}</p>
        {sub && <p className="mt-0.5 truncate text-sm text-text-muted">{sub}</p>}
      </div>
      {to && <Chevron className="text-text-subtle group-hover:text-accent" />}
    </>
  );
  const cls = cn("group card flex min-h-[84px] items-center gap-3 p-4 sm:p-5", accent && cn("border-accent/50", GLOW.accent));
  return to
    ? <Link to={to} className={cn(cls, "transition-colors hover:border-accent/60")}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Numbers
// ─────────────────────────────────────────────────────────────────────────────

export function StatTile({ label, value, sub, accent = "muted", trend }: {
  label: string;
  value: string | number;
  sub?: ReactNode;
  accent?: "accent" | "highlight" | "support" | "muted";
  /** Recent values, oldest first: a sparkline under the number, its latest point in the tile's colour. */
  trend?: number[];
}) {
  const col = { accent: "text-accent", highlight: "text-highlight", support: "text-support", muted: "text-text-base" }[accent];
  return (
    <div className={cn("card relative overflow-hidden p-4 sm:p-5", accent !== "muted" && GLOW[accent])}>
      <p className="eyebrow mb-1 flex items-center gap-1.5">
        {accent !== "muted" && <span aria-hidden="true" className={cn(DOT[accent], "h-2 w-2")} />}
        {label}
      </p>
      <p className={cn("font-display text-[32px] leading-none sm:text-4xl", col)}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {trend && trend.length > 1 && <Sparkline values={trend} tone={accent === "muted" ? "accent" : accent} className="mt-3" />}
      {sub && <p className="mt-1.5 text-sm text-text-subtle">{sub}</p>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Charts — flat SVG in the theme's colours. Series take accent, support and
// highlight in that order (three at most); a chart never relies on colour
// alone: one series needs no legend, two or three get a readout that names
// each with its line key and value. Every chart has a hidden table of its
// numbers for screen readers, and a readout row instead of a hover-only
// tooltip, so a tap shows a value as well as a hover.
// ─────────────────────────────────────────────────────────────────────────────

export type ChartTone = "accent" | "support" | "highlight";
const SERIES_TONES: ChartTone[] = ["accent", "support", "highlight"];
const STROKE: Record<ChartTone, string> = { accent: "stroke-accent", support: "stroke-support", highlight: "stroke-highlight" };
const FILL: Record<ChartTone, string> = { accent: "fill-accent", support: "fill-support", highlight: "fill-highlight" };
const WASH: Record<ChartTone, string> = { accent: "fill-accent/10", support: "fill-support/10", highlight: "fill-highlight/10" };
const KEY: Record<ChartTone, string> = { accent: "bg-accent", support: "bg-support", highlight: "bg-highlight" };

/** 1,284 → "1,284"; 12,900 → "12.9K". */
export function compactNumber(n: number): string {
  return Math.abs(n) >= 10_000 ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n) : n.toLocaleString();
}

/** Round axis ticks from 0 up past `max`: 0 / 5 / 10 / 15, 0 / 1K / 2K… */
function niceTicks(max: number, count = 3): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => +(i * step).toPrecision(12));
}

/** The element's width, kept up to date (charts draw in real pixels, so lines and dots never stretch). */
function useWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(e?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** The numbers behind a chart, for screen readers. (In a hidden div: a table ignores sr-only's 1 px width and would widen the page.) */
function ChartTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead><tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => (j === 0 ? <th key={j} scope="row">{v}</th> : <td key={j}>{v}</td>))}</tr>)}</tbody>
      </table>
    </div>
  );
}

/**
 * A small trend line with no axes — under a StatTile's number, or beside a
 * row. A 2 px line in the subtle text colour, the latest point as a dot in
 * the tone, so "now" stands out from the history.
 */
export function Sparkline({ values, tone = "accent", height = 28, className }: { values: number[]; tone?: ChartTone; height?: number; className?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const pad = 5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => pad + (i / Math.max(values.length - 1, 1)) * (width - pad * 2);
  const y = (v: number) => pad + (max === min ? 0.5 : 1 - (v - min) / (max - min)) * (height - pad * 2);
  const last = values.length - 1;
  return (
    <div ref={ref} className={cn("w-full", className)} style={{ height }}
      role="img" aria-label={`Trend: ${values[0]?.toLocaleString()} to ${values[last]?.toLocaleString()}`}>
      {width > 0 && values.length > 1 && (
        <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
          <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-text-subtle/70" />
          <circle cx={x(last)} cy={y(values[last]!)} r={4} strokeWidth={2} className={cn(FILL[tone], "stroke-surface")} />
        </svg>
      )}
    </div>
  );
}

export type TrendSeries = { label: string; values: number[]; tone?: ChartTone };

/**
 * Change over time: one to three lines over the same labels (days, weeks).
 * One series gets a soft wash under its line. Drag, tap or use the arrow keys
 * to move the crosshair; the readout above shows the values there (the
 * latest by default) and names each series, so it doubles as the legend.
 * One y-axis only — two measures of different sizes are two charts.
 */
export function TrendChart({ labels, series, format = compactNumber, height = 180, title }: {
  labels: string[];
  series: TrendSeries[];
  format?: (n: number) => string;
  height?: number;
  /** What's plotted, for screen readers (the Section title usually says it on screen). */
  title?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const last = labels.length - 1;
  const [active, setActive] = useState<number | null>(null);
  const at = active ?? last;
  const lines = series.slice(0, 3).map((s, i) => ({ ...s, tone: s.tone ?? SERIES_TONES[i]! }));
  const ticks = niceTicks(Math.max(...lines.flatMap((l) => l.values), 0));
  const top = ticks[ticks.length - 1]!;
  const gutter = Math.max(...ticks.map((t) => format(t).length)) * 7 + 10;
  const pad = { top: 8, right: 8, bottom: 24, left: gutter };
  const plotW = Math.max(width - pad.left - pad.right, 1);
  const plotH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (labels.length > 1 ? (i / last) * plotW : plotW / 2);
  const y = (v: number) => pad.top + (1 - v / top) * plotH;
  const nearest = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    return Math.min(last, Math.max(0, Math.round(((clientX - r.left - pad.left) / plotW) * last)));
  };
  const onPointer = (e: ReactPointerEvent<SVGRectElement>) => setActive(nearest(e.clientX, e.currentTarget.ownerSVGElement!));
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setActive(Math.min(last, Math.max(0, at + (e.key === "ArrowRight" ? 1 : -1))));
    }
  };
  // First, middle and last labels: enough to read the span without collisions.
  const xLabels = [...new Set([0, Math.round(last / 2), last])].filter((i) => labels.length > 1 || i === 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1" aria-live="polite">
        <span className="text-xs font-semibold text-text-subtle">{labels[at]}</span>
        {lines.map((l) => (
          <span key={l.label} className="flex items-baseline gap-2">
            {lines.length > 1 && <span aria-hidden="true" className={cn("h-0.5 w-3 self-center rounded-full", KEY[l.tone])} />}
            <span className="text-lg font-semibold tabular-nums text-text-base">{l.values[at] != null ? format(l.values[at]!) : "—"}</span>
            {lines.length > 1 && <span className="text-sm text-text-muted">{l.label}</span>}
          </span>
        ))}
      </div>
      <div ref={ref} tabIndex={0} onKeyDown={onKey} onBlur={() => setActive(null)}
        aria-label={`${title ?? lines.map((l) => l.label).join(", ")}: use the arrow keys to read each point`}
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent" style={{ height }} data-no-swipe>
        {width > 0 && (
          <svg width={width} height={height} aria-hidden="true" className="touch-pan-y select-none overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} strokeWidth={1} className="stroke-border/70" />
                <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-text-subtle text-[11px] tabular-nums">{format(t)}</text>
              </g>
            ))}
            {xLabels.map((i) => (
              <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} className="fill-text-subtle text-[11px]">{labels[i]}</text>
            ))}
            {lines.length === 1 && lines[0]!.values.length > 1 && (
              <path className={WASH[lines[0]!.tone]}
                d={`M${x(0)},${y(0)} ${lines[0]!.values.map((v, i) => `L${x(i)},${y(v)}`).join(" ")} L${x(lines[0]!.values.length - 1)},${y(0)} Z`} />
            )}
            {lines.map((l) => (
              <polyline key={l.label} points={l.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none"
                strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className={STROKE[l.tone]} />
            ))}
            <line x1={x(at)} x2={x(at)} y1={pad.top} y2={pad.top + plotH} strokeWidth={1} className="stroke-text-subtle/60" />
            {lines.map((l) => l.values[at] != null && (
              <circle key={l.label} cx={x(at)} cy={y(l.values[at]!)} r={4.5} strokeWidth={2} className={cn(FILL[l.tone], "stroke-surface")} />
            ))}
            {/* The hit area: the whole plot, so the pointer only has to be near a point. */}
            <rect x={pad.left} y={0} width={plotW} height={height} fill="transparent"
              onPointerDown={onPointer} onPointerMove={onPointer} onPointerLeave={(e) => { if (e.pointerType === "mouse") setActive(null); }} />
          </svg>
        )}
      </div>
      <ChartTable caption={title ?? "Values over time"} columns={["", ...lines.map((l) => l.label)]}
        rows={labels.map((lab, i) => [lab, ...lines.map((l) => (l.values[i] != null ? format(l.values[i]!) : "—"))])} />
    </div>
  );
}

export type BarItem = { id: string; label: string; value: number; to?: string };

/**
 * Compares a few amounts as bars, in one tone. `horizontal` (the default):
 * a row each, label left, the value at the bar's tip — good for long names
 * and lists that link (`to`). `vertical`: columns over a short run (days,
 * months); tap or hover a column, or tab to it, to read its value above the
 * chart (the largest shows until you do).
 */
export function BarChart({ items, direction = "horizontal", tone = "accent", format = compactNumber, height = 160, title }: {
  items: BarItem[];
  direction?: "horizontal" | "vertical";
  tone?: ChartTone;
  format?: (n: number) => string;
  /** Vertical only: the plot's height in px. */
  height?: number;
  title?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 0) || 1;
  const biggest = items.reduce((b, it, i) => (it.value > (items[b]?.value ?? -Infinity) ? i : b), 0);
  const [active, setActive] = useState<number | null>(null);
  const table = <ChartTable caption={title ?? "Amounts"} columns={["", "Value"]} rows={items.map((i) => [i.label, format(i.value)])} />;

  if (direction === "horizontal") {
    return (
      <div className="space-y-1">
        {items.map((it) => {
          const body = (
            <>
              <span className="w-[32%] shrink-0 truncate text-sm font-semibold text-text-muted group-hover:text-text-base">{it.label}</span>
              <span className="flex h-3 flex-1 items-center">
                {/* Square at the baseline, a 4 px round on the data end. */}
                <span className={cn("block h-full min-w-[2px] rounded-r-[4px]", KEY[tone])} style={{ width: `${(it.value / max) * 100}%` }} />
              </span>
              <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">{format(it.value)}</span>
            </>
          );
          const cls = "group flex h-11 items-center gap-3 rounded-lg px-1";
          return it.to
            ? <Link key={it.id} to={it.to} className={cn(cls, "transition-colors hover:bg-surface-2/70")}>{body}</Link>
            : <div key={it.id} className={cls}>{body}</div>;
        })}
        {table}
      </div>
    );
  }

  const shown = active ?? biggest;
  const every = Math.ceil(items.length / 8);
  return (
    <div className="space-y-3">
      <p className="flex items-baseline gap-2" aria-live="polite">
        <span className="text-lg font-semibold tabular-nums">{items[shown] ? format(items[shown]!.value) : "—"}</span>
        <span className="text-sm text-text-muted">{items[shown]?.label}{active == null && items.length > 1 ? " · highest" : ""}</span>
      </p>
      {/* A finger lifting also "leaves", so only a mouse moving away puts the readout back. */}
      <div className="flex border-b border-border" style={{ height }} onPointerLeave={(e) => { if (e.pointerType === "mouse") setActive(null); }} data-no-swipe>
        {items.map((it, i) => (
          <button key={it.id} type="button" aria-label={`${it.label}: ${format(it.value)}`}
            onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} onFocus={() => setActive(i)}
            className="group flex h-full min-w-0 flex-1 items-end justify-center px-[1px] outline-none">
            <span className={cn("block w-full max-w-6 rounded-t-[4px] transition-opacity", KEY[tone],
              shown === i ? "opacity-100" : "opacity-70 group-hover:opacity-100", "group-focus-visible:ring-2 group-focus-visible:ring-text-base")}
              style={{ height: `${Math.max((it.value / max) * 100, it.value > 0 ? 2 : 0)}%` }} />
          </button>
        ))}
      </div>
      <div className="flex">
        {items.map((it, i) => (
          <span key={it.id} className="min-w-0 flex-1 truncate text-center text-[11px] text-text-subtle">{i % every === 0 ? it.label : ""}</span>
        ))}
      </div>
      {table}
    </div>
  );
}

export type RankedItem = {
  id: string;
  name: string;
  sub?: string;
  count: number;
  href: string;
};

/** Leaderboard rows: rank, name, sub line, count. Two columns from sm up. */
export function RankedList({ items, unit = "item" }: { items: RankedItem[]; unit?: string }) {
  if (items.length === 0) return <p className="p-4 text-sm text-text-subtle">Nothing here yet.</p>;
  const rankColor = (rank: number) =>
    rank === 1 ? "text-accent" : rank === 2 ? "text-highlight" : rank === 3 ? "text-support" : "text-text-subtle";
  return (
    <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-border">
      {[items.slice(0, Math.ceil(items.length / 2)), items.slice(Math.ceil(items.length / 2))].map((col, ci) => (
        <div key={ci} className={cn("divide-etched", ci === 1 && "border-t border-border sm:border-t-0")}>
          {col.map((item, i) => {
            const rank = ci * Math.ceil(items.length / 2) + i + 1;
            return (
              <Link key={item.id} to={item.href} className={rowBase}>
                <span className={cn("w-7 shrink-0 text-right font-display text-xl", rankColor(rank))}>{rank}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-text-base group-hover:text-accent">{item.name}</p>
                  {item.sub && <p className="truncate text-sm text-text-subtle">{item.sub}</p>}
                </div>
                <span className="shrink-0 text-sm font-semibold text-text-muted">
                  {item.count}
                  <span className="ml-1 font-normal text-text-subtle">{item.count === 1 ? unit : `${unit}s`}</span>
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Controls
// ─────────────────────────────────────────────────────────────────────────────

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block flex-1">
      <span className="sr-only">{placeholder}</span>
      <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-subtle" width="18" height="18"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field h-12 w-full pl-10 sm:h-11"
      />
    </label>
  );
}

/**
 * A labelled slider (weight, spacing, vibrancy…): the label and current value
 * above, a full-width track in the accent below, 44 px tall for thumbs.
 */
export function RangeField({ label, value, onChange, min, max, step, format = String, className }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  /** How the value reads beside the label ("800", "+0.04 em", "120%"). */
  format?: (v: number) => string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-text-muted">{label}</span>
        <span className="font-mono text-xs text-text-subtle">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-[rgb(var(--c-accent))]" />
    </label>
  );
}

/** Native select styled as a field — the phone-friendly filter control. */
export function SelectField<T extends string>({ value, onChange, options, label, className }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}
        className="field h-12 w-full appearance-none pr-10 font-semibold sm:h-11">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Chevron dir="down" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle" />
    </label>
  );
}

/** Two to four tabs for views of one thing (Upcoming / Past). Full width on phones; `size="sm"` is a compact inline switch for a section's action slot. */
export function Tabs<T extends string>({ value, onChange, options, size = "md" }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: "md" | "sm";
}) {
  if (size === "sm") {
    return (
      <div role="tablist" className="glass inline-grid shrink-0 rounded-control p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, auto)` }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            // 36 px tall, with the row's padding making up a 44 px target.
            <button key={o.value} role="tab" aria-selected={active} onClick={() => onChange(o.value)}
              className={cn("h-9 rounded-lg px-3 text-sm font-semibold transition-colors", active ? "lit-accent" : "text-text-muted hover:text-text-base")}>
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div role="tablist" className="glass grid rounded-xl p-1 sm:inline-grid sm:min-w-[320px]"
      // Four or more tabs size to their labels (equal widths would clip the longest).
      style={{ gridTemplateColumns: options.length > 3 ? `repeat(${options.length}, auto)` : `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} role="tab" aria-selected={active} onClick={() => onChange(o.value)}
            className={cn(
              "h-10 truncate rounded-lg font-semibold transition-colors sm:h-9 sm:px-4 sm:text-sm",
              // Four or more tabs: tighter on phones so every label fits.
              options.length > 3 ? "px-2.5 text-sm" : "px-4 text-[15px]",
              active ? "lit-accent" : "text-text-muted hover:text-text-base",
            )}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Pill tabs for desktop filters; wraps rather than scrolling. `scroll` keeps
 * them on one row that scrolls sideways (to the screen's edges on phones) —
 * for a page's own sections when there are more than fit, so they don't stack
 * into rows that look like the filters under them.
 */
export function PillTabs<T extends string>({ value, onChange, options, scroll = false }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; activeClass?: string }[];
  scroll?: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  // Keep the chosen tab in view when it changes (or opens from a link).
  useEffect(() => {
    if (!scroll) return;
    const box = row.current, tab = box?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (!box || !tab) return;
    const [left, right] = [tab.offsetLeft - box.offsetLeft, tab.offsetLeft - box.offsetLeft + tab.offsetWidth];
    if (left < box.scrollLeft) box.scrollTo({ left: left - 16, behavior: "smooth" });
    else if (right > box.scrollLeft + box.clientWidth) box.scrollTo({ left: right - box.clientWidth + 16, behavior: "smooth" });
  }, [scroll, value]);
  return (
    <div ref={row} className={scroll
      ? "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      : "flex flex-wrap gap-2"}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} type="button" aria-pressed={active} onClick={() => onChange(o.value)}
            className={cn(
              "h-10 shrink-0 rounded-control border px-4 text-sm font-semibold transition-colors",
              active ? (o.activeClass ?? "lit-accent border-accent") : "border-border text-text-muted hover:border-text-subtle hover:text-text-base",
            )}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Pager({ page, totalPages, total, pageSize, onPage }: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = "glass inline-flex h-12 flex-1 items-center justify-center gap-1 rounded-xl text-[15px] font-semibold transition-colors hover:border-accent disabled:opacity-30 disabled:hover:border-white/10 sm:h-11 sm:flex-none sm:px-5";
  return (
    <nav className="mt-6 flex items-center gap-3" aria-label="Pagination">
      <button className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <Chevron dir="left" /> Prev
      </button>
      <p className="shrink-0 text-center text-sm text-text-subtle sm:flex-1">
        <span className="hidden sm:inline">{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} · </span>
        Page {page} of {totalPages}
      </p>
      <button className={btn} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next <Chevron />
      </button>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet — the one modal: slides up from the bottom on phones, centered dialog on desktop
// ─────────────────────────────────────────────────────────────────────────────

export function Sheet({ title, subtitle, onClose, children, wide = false }: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  // Keep the page behind from scrolling while the sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Portalled to <body>, so a parent's spacing (space-y margins) or transform can't shift the backdrop.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-bg shadow-2xl shadow-black/60",
          "sm:max-h-[88dvh] sm:rounded-3xl",
          wide ? "sm:max-w-xl" : "sm:max-w-lg",
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden="true" />
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pb-4 pt-3 sm:pt-5">
          <div className="min-w-0">
            <h2 className="h-section">{title}</h2>
            {subtitle && <p className="meta mt-1">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close"
            className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text-base">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[var(--safe-bottom)]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// States
// ─────────────────────────────────────────────────────────────────────────────

/** Placeholder shaped like a page — a title and a list of rows — while it loads. */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="animate-pulse space-y-5 py-2">
      <span className="sr-only">{label}</span>
      <div className="space-y-2.5">
        <div className="h-3 w-24 rounded-full bg-surface-2" />
        <div className="h-8 w-56 max-w-[70%] rounded-lg bg-surface-2" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 rounded-2xl bg-surface" />
        <div className="h-24 rounded-2xl bg-surface" />
      </div>
      <div className="card divide-etched overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="h-12 w-12 shrink-0 rounded-xl bg-surface-2" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 rounded-full bg-surface-2" style={{ width: `${70 - i * 8}%` }} />
              <div className="h-3 w-1/3 rounded-full bg-surface-2/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action, tone = "muted" }: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div className="card px-6 py-14 text-center">
      <ThemeDots size={12} className="mb-4" />
      <p className={cn("text-lg font-semibold", tone === "error" ? "text-highlight" : "text-text-base")}>{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// View switch — two or three views of one page as links (List | Map)
// ─────────────────────────────────────────────────────────────────────────────

export function ViewSwitch({ options, current, floating = false }: {
  options: { to: string; label: string }[];
  /** The `to` of the view showing now. */
  current: string;
  /** Frosted, for sitting over a map or image. */
  floating?: boolean;
}) {
  return (
    <div className={cn(
      "flex rounded-xl p-0.5",
      floating ? "border border-border bg-bg/90 shadow-xl backdrop-blur-md" : "glass",
    )}>
      {options.map((o) => (
        <Link key={o.to} to={o.to} replace aria-current={o.to === current ? "page" : undefined}
          className={cn(
            "flex h-9 items-center rounded-lg px-4 text-sm font-semibold transition-colors",
            o.to === current ? "lit-accent" : "text-text-muted hover:text-text-base",
          )}>
          {o.label}
        </Link>
      ))}
    </div>
  );
}
