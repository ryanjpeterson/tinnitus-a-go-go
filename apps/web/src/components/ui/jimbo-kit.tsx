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

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";

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

/** A status dot: a small flat circle with a slight outline (add a tone's `dot`). */
export const STATUS_DOT = "h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/25";

/** A status as a labelled chip — for detail pages and headers. */
export function Badge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold", TONES[tone].chip, className)}>
      {children}
    </span>
  );
}

/** A status on a row: a tone plus the words a screen reader and tooltip use. */
export type RowStatus = { tone: Tone; label: string };

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
 * The theme's colours as small overlapping lit circles (accent, highlight,
 * support) — jimbo.ui's motif. Use here and there: before a page eyebrow, in
 * empty states, beside a brand moment. Decorative; follows the live theme.
 */
export function ThemeDots({ size = 10, className }: { size?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center", className)}>
      {(["orb-accent", "orb-highlight", "orb-support"] as const).map((orb, i) => (
        <span key={orb} className={cn(orb, "ring-2 ring-bg")}
          style={{ width: size, height: size, marginLeft: i ? -size * 0.3 : 0, zIndex: 3 - i }} />
      ))}
    </span>
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
      {eyebrow && <p className="eyebrow mb-1.5 flex items-center gap-2 text-support"><ThemeDots size={9} />{eyebrow}</p>}
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
export function Banner({ backdrop, glow = "accent", back, badge, children }: {
  /** Image blurred to fill the banner; falls back to a soft accent gradient. */
  backdrop?: string | null;
  glow?: "accent" | "highlight" | "support" | "yellow" | "purple";
  back?: { to: string; label: string };
  /** Top-right of the banner, opposite the back button (e.g. a status flag). */
  badge?: ReactNode;
  children: ReactNode;
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
    <section className="relative isolate -mt-6 mb-6 ml-[calc(50%-50vw)] w-screen overflow-hidden sm:-mt-8 sm:mb-8">
      {/* Backdrop: the image itself, blurred and scaled up so it fills the whole
          banner edge to edge (scaling hides the soft edges blur leaves behind). */}
      {backdrop ? (
        <img src={backdrop} alt="" aria-hidden="true"
          className="absolute inset-0 -z-20 h-full w-full scale-150 object-cover blur-2xl saturate-150" />
      ) : (
        <div className={cn("absolute inset-0 -z-20 bg-gradient-to-br via-support-950/60 to-bg", glowCls)}>
          {/* No image: two soft orbs give the frost something to blur. */}
          <span className="orb-highlight absolute -right-10 -top-12 h-44 w-44 opacity-30 blur-2xl" />
          <span className="orb-support absolute -bottom-16 left-1/4 h-40 w-40 opacity-25 blur-2xl" />
        </div>
      )}
      {/* Light overall dim, fading into the page at the bottom so there's no hard edge. */}
      <div className="absolute inset-0 -z-10 bg-black/35" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-bg via-bg/40 to-transparent" />

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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-md">
      <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
      <button onClick={onClose} aria-label="Close"
        className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20">
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
export function Hero({ imageUrl, imageAlt, eyebrow, title, children, actions, back, badge, accent = "accent", square = false }: {
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
    <Banner backdrop={imageUrl} glow={accent} back={back} badge={badge}>
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

/** Titled block. `flush` drops the inner padding for edge-to-edge lists. */
export function Section({ title, count, action, children, flush = false, className }: {
  title?: ReactNode;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
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
      <div className={cn("card", flush ? "overflow-hidden" : "p-4 sm:p-5")}>{children}</div>
    </section>
  );
}

/** Divided list inside a card — pair with EventRow / EntityRow. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card divide-etched overflow-hidden", className)}>{children}</div>;
}

/** Sticky-style group label between rows (month headers etc.). */
export function ListGroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 bg-gradient-to-r from-support-900/50 via-support-950/40 to-transparent px-4 py-2 text-xs font-semibold uppercase tracking-wider text-support">
      <span aria-hidden="true" className="orb-support h-2 w-2" />
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
export function EventRow({ to, date, title, subtitle, meta, imageUrl, status, showYear = true, approximate, selected, onSelect }: {
  to: string;
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
  return (
    <Link to={to} className={rowBase}>
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
      {status && <span title={status.label} aria-label={status.label} className={cn(STATUS_DOT, TONES[status.tone].dot)} />}
      <Chevron className="text-text-subtle group-hover:text-accent" />
    </Link>
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
          <div className="orb-support flex h-full w-full items-center justify-center font-display text-base text-on-support">{initials(name)}</div>
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
const ORB = { accent: "orb-accent", highlight: "orb-highlight", support: "orb-support" } as const;
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

export function StatTile({ label, value, sub, accent = "muted" }: {
  label: string;
  value: string | number;
  sub?: ReactNode;
  accent?: "accent" | "highlight" | "support" | "muted";
}) {
  const col = { accent: "text-accent", highlight: "text-highlight", support: "text-support", muted: "text-text-base" }[accent];
  return (
    <div className={cn("card relative overflow-hidden p-4 sm:p-5", accent !== "muted" && GLOW[accent])}>
      <p className="eyebrow mb-1 flex items-center gap-1.5">
        {accent !== "muted" && <span aria-hidden="true" className={cn(ORB[accent], "h-2.5 w-2.5")} />}
        {label}
      </p>
      <p className={cn("font-display text-[32px] leading-none sm:text-4xl", col)}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-1.5 text-sm text-text-subtle">{sub}</p>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>;
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

/** Two to four tabs for views of one thing (Upcoming / Past). Full width on phones. */
export function Tabs<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
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

/** Pill tabs for desktop filters; wraps rather than scrolling. */
export function PillTabs<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; activeClass?: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={cn(
              "h-10 rounded-control border px-4 text-sm font-semibold transition-colors",
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
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">{children}</div>
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
      <ThemeDots size={tone === "error" ? 18 : 22} className="mb-4" />
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
