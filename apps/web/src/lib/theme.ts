/**
 * Theme engine — two to four brand colours in, every colour token out.
 *
 *   accent      primary colour (buttons, active tabs, "done" states, the dot in the name)
 *   background  page colour; surfaces, borders and text are derived from it,
 *               and a light background flips the text to dark
 *   highlight   secondary colour (dates, badges, alerts) — optional, inferred
 *               from the accent when left out
 *   support     third colour (page eyebrows, avatars, third rank, glows) —
 *               optional, inferred from the others when left out
 *
 * Each of accent, highlight and support also gets lighter and darker shades
 * (`-lighter`, `-light`, `-dark`, `-darker`), a two-stop fill for buttons and
 * badges (`-top` → `-bottom`, lit from above, never lower contrast with its
 * `on-` text) and washes mixed into the page (`-950` … `-700`).
 *
 * A theme can also pick a type style for headings and for body text — sans
 * (the default), mono or serif — set as `--font-display` / `--font-body`.
 *
 * Tokens are CSS variables holding "R G B" channels, so Tailwind classes keep
 * their opacity modifiers (`bg-accent/15`). The defaults live in
 * globals.css too, so the app looks right before any script runs; index.html
 * applies the last-used theme from localStorage before first paint.
 *
 * Part of jimbo-ui (foundation — don't edit here; change jimbo-ui and update).
 * The app's own values live in ./brand.config.ts.
 */

import { BRAND } from "./brand.config";

/** A type style: the family used for headings or for body text. */
export type FontStyle = "sans" | "mono" | "serif";

export interface Theme {
  accent: string;
  background: string;
  /** Optional: inferred from the accent when left out (`deriveHighlight`). */
  highlight?: string;
  /** Optional: inferred from the other colours when left out (`deriveSupport`). */
  support?: string;
  /** Optional type styles; both default to sans. */
  fonts?: { headings?: FontStyle; body?: FontStyle };
}

/** A theme as a server or cache returns it: anything may be missing or null. */
export type SavedTheme = { [K in "accent" | "background" | "highlight" | "support"]?: string | null } & { fonts?: Theme["fonts"] | null };

/**
 * The type styles. `display` is the headings family, `body` the text family;
 * `google` is the Google Fonts query that loads them (sans is in index.html).
 */
export const FONT_STYLES: Record<FontStyle, { label: string; display: string; body: string; google: string | null }> = {
  sans: {
    label: "Sans",
    display: "'Archivo', ui-sans-serif, system-ui, sans-serif",
    body: "'Inter', ui-sans-serif, system-ui, sans-serif",
    google: null,
  },
  mono: {
    label: "Mono",
    display: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    body: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    google: "family=JetBrains+Mono:wght@400;500;600;700;800",
  },
  serif: {
    label: "Serif",
    display: "'Fraunces', ui-serif, Georgia, serif",
    body: "'Source Serif 4', ui-serif, Georgia, serif",
    google: "family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,800;9..144,900&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700",
  },
};
export const FONT_KEYS = ["sans", "mono", "serif"] as const;

/** Load the web fonts for these styles (once each), by adding a Google Fonts stylesheet. */
export function loadFonts(styles: FontStyle[]): void {
  for (const s of new Set(styles)) {
    const q = FONT_STYLES[s]?.google;
    if (!q || document.getElementById(`font-${s}`)) continue;
    const link = Object.assign(document.createElement("link"), { id: `font-${s}`, rel: "stylesheet", href: `https://fonts.googleapis.com/css2?${q}&display=swap` });
    document.head.appendChild(link);
  }
}

/** A theme with all four colours filled in (missing ones inferred). */
export type FullTheme = Required<Theme>;

/** The colours a theme may leave out. */
export const OPTIONAL_KEYS = ["highlight", "support"] as const;

/** The colour keys in editor order. */
export const THEME_KEYS = ["accent", "highlight", "support", "background"] as const;

export const DEFAULT_THEME: Theme = BRAND.defaultTheme;

export const THEME_STORAGE_KEY = `${BRAND.storagePrefix}.theme`;
/** The computed CSS variables, cached for index.html to apply before first paint. */
export const THEME_VARS_KEY = `${BRAND.storagePrefix}.themeVars`;

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = ([r, g, b]: RGB): string =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/** a → b by t (0 = a, 1 = b). */
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

/** WCAG relative luminance, 0 (black) – 1 (white). */
export function luminance(hex: string | RGB): number {
  const [r, g, b] = (typeof hex === "string" ? hexToRgb(hex) : hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1 – 21). */
export function contrast(a: string | RGB, b: string | RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export const isHex = (v: string): boolean => /^#[0-9a-f]{6}$/i.test(v);

/**
 * Contrast targets (WCAG ratios) the derived colours are stepped to meet on
 * every background, measured on cards — the surface most text sits on.
 */
export const CONTRAST_TARGETS = { card: 1.2, card2: 1.15, border: 1.8, muted: 5, subtle: 3.8 } as const;

/** Smallest t in [min, max] where mix(from, to, t) reaches `target` contrast with `against` (it grows with t). */
function stepTo(from: RGB, to: RGB, against: RGB, target: number, min: number, max: number): number {
  if (contrast(mix(from, to, min), against) >= target) return min;
  if (contrast(mix(from, to, max), against) < target) return max;
  let lo = min, hi = max;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    if (contrast(mix(from, to, t), against) >= target) hi = t; else lo = t;
  }
  return hi;
}

/** Largest t in [0, max] where mix(from, to, t) still keeps `target` contrast with `against` (it shrinks with t). */
function fadeTo(from: RGB, to: RGB, against: RGB, target: number, max: number): number {
  if (contrast(mix(from, to, max), against) >= target) return max;
  let lo = 0, hi = max;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    if (contrast(mix(from, to, t), against) >= target) lo = t; else hi = t;
  }
  return lo;
}

type HSL = [number, number, number];
function rgbToHsl([r, g, b]: RGB): HSL {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d + 6) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb([h, s, l]: HSL): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
  return [f(0), f(8), f(4)];
}

/** Hue `hue`, saturation `sat`, starting at lightness `l` and stepping away from the page until it reaches `target` contrast. */
function readableOn(bg: RGB, hue: number, sat: number, l: number, target: number): string {
  const light = luminance(bg) > 0.4;
  for (let i = 0; i < 50 && contrast(hslToRgb([hue, sat, l]), bg) < target; i++) l = light ? l - 0.02 : l + 0.02;
  return rgbToHex(hslToRgb([hue, sat, Math.max(0.05, Math.min(0.95, l))]));
}

/**
 * A highlight for a theme that only sets the accent: the accent's hue turned
 * 150° (a split complement, so it never looks like the accent), at least as
 * saturated, made to reach 3.5:1 on the page. A grey accent gets a red.
 */
export function deriveHighlight(theme: Theme): string {
  const [ha, sa, la] = rgbToHsl(hexToRgb(theme.accent));
  const grey = sa < 0.15;
  return readableOn(hexToRgb(theme.background), grey ? 350 : (ha + 150) % 360, grey ? 0.85 : Math.max(0.6, sa), grey ? 0.6 : la, 3.5);
}

/**
 * A support colour for a theme that doesn't set one: the hue furthest from
 * both the accent and the highlight, as saturated as they are, made light or
 * dark enough to read on cards (5.4:1 on the page).
 */
export function deriveSupport(theme: Theme): string {
  const bg = hexToRgb(theme.background);
  const [ha, sa, la] = rgbToHsl(hexToRgb(theme.accent));
  const [hh, sh] = rgbToHsl(hexToRgb(theme.highlight ?? deriveHighlight(theme)));
  const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  let hue = 0, best = -1;
  for (let h = 0; h < 360; h += 5) {
    const d = Math.min(sa > 0.15 ? gap(h, ha) : 180, sh > 0.15 ? gap(h, hh) : 180);
    if (d > best) { best = d; hue = h; }
  }
  // 5.4:1 on the page leaves 4.5:1 on cards, which sit a step away from it.
  return readableOn(bg, hue, Math.max(0.55, (sa + sh) / 2), la, 5.4);
}

/** The theme with every colour filled in: missing highlight and support are inferred. */
export function fullTheme(theme: Theme): FullTheme {
  const highlight = theme.highlight || deriveHighlight(theme);
  return {
    accent: theme.accent, background: theme.background, highlight,
    support: theme.support || deriveSupport({ ...theme, highlight }),
    fonts: { headings: theme.fonts?.headings ?? "sans", body: theme.fonts?.body ?? "sans" },
  };
}

/** Just what a theme sets (drops empty optional colours and default fonts) — what to save. */
export function ownColours(theme: Theme): Theme {
  const headings = theme.fonts?.headings && theme.fonts.headings !== "sans" ? theme.fonts.headings : undefined;
  const body = theme.fonts?.body && theme.fonts.body !== "sans" ? theme.fonts.body : undefined;
  return {
    accent: theme.accent, background: theme.background,
    ...(theme.highlight ? { highlight: theme.highlight } : {}),
    ...(theme.support ? { support: theme.support } : {}),
    ...(headings || body ? { fonts: { ...(headings ? { headings } : {}), ...(body ? { body } : {}) } } : {}),
  };
}

/** Every derived colour, as RGB, keyed by CSS variable name (without the --c- prefix). */
export function deriveColors(input: Theme): Record<string, RGB> {
  const theme = fullTheme(input);
  const bg = hexToRgb(theme.background);
  const light = luminance(bg) > 0.4;
  // Surfaces step away from the background — lighter on dark themes, darker on
  // light ones — as far as it takes to read as separate layers on this background.
  const away = light ? BLACK : WHITE;
  const T = CONTRAST_TARGETS;
  const cardT = stepTo(bg, away, bg, T.card, light ? 0.04 : 0.05, 0.3);
  const surface = mix(bg, away, cardT);
  const surface2 = mix(bg, away, stepTo(bg, away, surface, T.card2, cardT + 0.03, 0.45));
  const border = mix(bg, away, stepTo(bg, away, surface, T.border, cardT + 0.06, 0.6));
  const text: RGB = light ? [17, 17, 19] : [250, 248, 244];
  const onColor = (c: RGB): RGB => (luminance(c) > 0.35 ? [20, 20, 22] : [255, 255, 255]);
  /** A brand colour's tokens: itself, hover, on-colour, shades, a lit fill and page washes. */
  const family = (name: string, c: RGB): Record<string, RGB> => {
    const on = onColor(c);
    // The fill's far stop moves away from the on-colour, so text on it only gets clearer:
    // dark text → a lighter top; white text → a darker bottom.
    const darkText = on[0] < 128;
    return {
      [name]: c,
      [`${name}-hover`]: mix(c, light ? BLACK : WHITE, 0.2),
      [`on-${name}`]: on,
      [`${name}-lighter`]: mix(c, WHITE, 0.5),
      [`${name}-light`]: mix(c, WHITE, 0.22),
      [`${name}-dark`]: mix(c, BLACK, 0.22),
      [`${name}-darker`]: mix(c, BLACK, 0.5),
      [`${name}-top`]: darkText ? mix(c, WHITE, 0.3) : c,
      [`${name}-bottom`]: darkText ? c : mix(c, BLACK, 0.28),
      [`${name}-950`]: mix(bg, c, 0.1),
      [`${name}-900`]: mix(bg, c, 0.28),
      [`${name}-800`]: mix(bg, c, 0.4),
      [`${name}-700`]: mix(bg, c, 0.5),
    };
  };
  return {
    bg,
    "bg-deep": mix(bg, away, cardT * 0.35),
    surface,
    "surface-2": surface2,
    border,
    text,
    // Secondary text fades toward the page only as far as it stays readable on cards.
    "text-muted": mix(text, bg, fadeTo(text, bg, surface, T.muted, 0.4)),
    "text-subtle": mix(text, bg, fadeTo(text, bg, surface, T.subtle, 0.6)),
    ...family("accent", hexToRgb(theme.accent)),
    ...family("highlight", hexToRgb(theme.highlight)),
    ...family("support", hexToRgb(theme.support)),
  };
}

/** The same colours as hex strings — for canvas, maps and other non-CSS uses. */
export function themeHex(theme: Theme): Record<string, string> {
  return Object.fromEntries(Object.entries(deriveColors(theme)).map(([k, v]) => [k, rgbToHex(v)]));
}

/** A Google Maps style rule (the shape of google.maps.MapTypeStyle, without needing its types). */
export interface MapStyle { featureType?: string; elementType?: string; stylers: Record<string, string | number>[] }

/** Map style for Google Maps, tinted from the theme (dark or light). */
export function mapStyles(theme: Theme): MapStyle[] {
  const c = themeHex(theme);
  const bg = hexToRgb(theme.background);
  const accent = hexToRgb(theme.accent);
  const tint = (t: number) => rgbToHex(mix(bg, accent, t));
  return [
    { elementType: "geometry", stylers: [{ color: c.bg! }] },
    { elementType: "labels.text.stroke", stylers: [{ color: c.bg! }] },
    { elementType: "labels.text.fill", stylers: [{ color: tint(0.38) }] },
    { featureType: "administrative", elementType: "geometry", stylers: [{ color: c.surface! }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: tint(0.5) }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "landscape", elementType: "geometry", stylers: [{ color: c.bg! }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: tint(0.1) }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: tint(0.3) }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: tint(0.16) }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: c.bg! }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "water", elementType: "geometry.fill", stylers: [{ color: rgbToHex(mix(bg, accent, 0.05)) }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: tint(0.25) }] },
  ];
}

/** Write the theme to the page: CSS variables, browser chrome colour, and a cached copy for next load. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const vars: Record<string, string> = {};
  for (const [name, [r, g, b]] of Object.entries(deriveColors(theme))) {
    vars[`--c-${name}`] = `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
  }
  const { headings, body } = fullTheme(theme).fonts;
  vars["--font-display"] = FONT_STYLES[headings!].display;
  vars["--font-body"] = FONT_STYLES[body!].body;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  loadFonts([headings!, body!]);
  const scheme = luminance(theme.background) > 0.4 ? "light" : "dark";
  root.style.colorScheme = scheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.background);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(ownColours(theme)));
    localStorage.setItem(THEME_VARS_KEY, JSON.stringify({ vars, scheme, background: theme.background }));
  } catch { /* storage unavailable */ }
}

let faviconTemplate: string | null = null;

/** Point the tab icon at an uploaded favicon, or recolour the built-in one to match the theme. */
export async function applyFavicon(theme: Theme, customUrl: string | null): Promise<void> {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  if (customUrl) { link.href = customUrl; return; }
  try {
    const template: string = faviconTemplate ?? (await fetch("/favicon.svg").then((r) => r.text()));
    faviconTemplate = template;
    const svg = template
      .replace(/#0B0B0C/gi, theme.background)
      .replace(/#A8FF3E/gi, theme.accent)
      .replace(/#FF3D6E/gi, fullTheme(theme).highlight)
      .replace(/#2EC5FF/gi, fullTheme(theme).support);
    link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  } catch { /* keep the static icon */ }
}

/** A round map pin in the highlight colour, as an SVG data URL (bigger when selected). */
export function markerIcon(input: Theme, selected = false): string {
  const theme = fullTheme(input);
  const hl = hexToRgb(theme.highlight);
  const ring = rgbToHex(mix(hl, WHITE, selected ? 0.45 : 0.3));
  const size = selected ? 28 : 20;
  const r = selected ? 11 : 8;
  return "data:image/svg+xml," + encodeURIComponent(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${theme.highlight}" stroke="${ring}" stroke-width="${selected ? 3 : 2}"/></svg>`,
  );
}
