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
 * A theme can also pick fonts for headings and body text (`FONTS`: sans, serif,
 * mono and — for headings — decorative faces), with weight and letter spacing,
 * set as `--font-display` / `--font-body` and their `-weight` / `-tracking`;
 * and tune colour vibrancy and layer contrast with two sliders.
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

/** A font in `FONTS` (or an older style name: "sans", "mono", "serif"). */
export type FontKey = string;

export interface Theme {
  accent: string;
  background: string;
  /** Optional: inferred from the accent when left out (`deriveHighlight`). */
  highlight?: string;
  /** Optional: inferred from the other colours when left out (`deriveSupport`). */
  support?: string;
  /**
   * Optional type: a font for headings and one for body text (keys of `FONTS`;
   * defaults Archivo and Inter), each with a weight and letter spacing (em).
   */
  fonts?: { headings?: FontKey; body?: FontKey; headingsWeight?: number; bodyWeight?: number; headingsTracking?: number; bodyTracking?: number };
  /** Colour vibrancy: 1 as picked, lower is calmer (0.4), higher is louder (1.5). */
  vibrancy?: number;
  /** Layer contrast: 1 is standard; up to 1.6 for cards, borders and labels that stand out more, down to 0.8 for softer. */
  contrast?: number;
  /**
   * How missing colours are inferred: `contrast` (the default) picks new hues
   * that stand apart; `tonal` uses lighter and darker versions of the accent,
   * for a simple one-colour scheme.
   */
  infer?: "contrast" | "tonal";
}

/** A theme as a server or cache returns it: anything may be missing or null. */
export type SavedTheme = { [K in "accent" | "background" | "highlight" | "support"]?: string | null }
  & { fonts?: Theme["fonts"] | null; infer?: Theme["infer"] | null; vibrancy?: number | null; contrast?: number | null };

/**
 * The fonts a theme can use. `css` is the font stack; `google` the Google Fonts
 * family query that loads it (Archivo, Inter and JetBrains Mono are in
 * index.html); `weights` the range it has; `body: false` marks display faces
 * that are for headings only (blackletter, pixel, script — unreadable as text).
 */
export type FontDef = { label: string; group: "Sans" | "Serif" | "Mono" | "Decorative"; css: string; google: string | null; weights: [number, number]; body?: false };
export const FONTS: Record<string, FontDef> = {
  archivo:        { label: "Archivo", group: "Sans", css: "'Archivo', ui-sans-serif, system-ui, sans-serif", google: null, weights: [500, 900] },
  inter:          { label: "Inter", group: "Sans", css: "'Inter', ui-sans-serif, system-ui, sans-serif", google: null, weights: [400, 700] },
  "space-grotesk":{ label: "Space Grotesk", group: "Sans", css: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif", google: "family=Space+Grotesk:wght@300..700", weights: [300, 700] },
  "dm-sans":      { label: "DM Sans", group: "Sans", css: "'DM Sans', ui-sans-serif, system-ui, sans-serif", google: "family=DM+Sans:opsz,wght@9..40,300..900", weights: [300, 900] },
  manrope:        { label: "Manrope", group: "Sans", css: "'Manrope', ui-sans-serif, system-ui, sans-serif", google: "family=Manrope:wght@300..800", weights: [300, 800] },
  oswald:         { label: "Oswald", group: "Sans", css: "'Oswald', ui-sans-serif, system-ui, sans-serif", google: "family=Oswald:wght@300..700", weights: [300, 700] },
  fraunces:       { label: "Fraunces", group: "Serif", css: "'Fraunces', ui-serif, Georgia, serif", google: "family=Fraunces:opsz,wght@9..144,300..900", weights: [300, 900] },
  "source-serif": { label: "Source Serif", group: "Serif", css: "'Source Serif 4', ui-serif, Georgia, serif", google: "family=Source+Serif+4:opsz,wght@8..60,300..900", weights: [300, 900] },
  playfair:       { label: "Playfair", group: "Serif", css: "'Playfair Display', ui-serif, Georgia, serif", google: "family=Playfair+Display:wght@400..900", weights: [400, 900] },
  "eb-garamond":  { label: "EB Garamond", group: "Serif", css: "'EB Garamond', ui-serif, Georgia, serif", google: "family=EB+Garamond:wght@400..800", weights: [400, 800] },
  marcellus:      { label: "Marcellus", group: "Serif", css: "'Marcellus', ui-serif, Georgia, serif", google: "family=Marcellus", weights: [400, 400] },
  "dm-serif":     { label: "DM Serif", group: "Serif", css: "'DM Serif Display', ui-serif, Georgia, serif", google: "family=DM+Serif+Display", weights: [400, 400], body: false },
  "jetbrains-mono": { label: "JetBrains Mono", group: "Mono", css: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace", google: "family=JetBrains+Mono:wght@300..800", weights: [300, 800] },
  "ibm-plex-mono":{ label: "IBM Plex Mono", group: "Mono", css: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace", google: "family=IBM+Plex+Mono:wght@300;400;500;600;700", weights: [300, 700] },
  "space-mono":   { label: "Space Mono", group: "Mono", css: "'Space Mono', ui-monospace, SFMono-Regular, monospace", google: "family=Space+Mono:wght@400;700", weights: [400, 700] },
  "fira-code":    { label: "Fira Code", group: "Mono", css: "'Fira Code', ui-monospace, SFMono-Regular, monospace", google: "family=Fira+Code:wght@300..700", weights: [300, 700] },
  "old-english":  { label: "Old English", group: "Decorative", css: "'UnifrakturCook', serif", google: "family=UnifrakturCook:wght@700", weights: [700, 700], body: false },
  "old-german":   { label: "Old German", group: "Decorative", css: "'UnifrakturMaguntia', serif", google: "family=UnifrakturMaguntia", weights: [400, 400], body: false },
  gothic:         { label: "Gothic", group: "Decorative", css: "'Grenze Gotisch', serif", google: "family=Grenze+Gotisch:wght@300..900", weights: [300, 900], body: false },
  pirate:         { label: "Pirate", group: "Decorative", css: "'Pirata One', serif", google: "family=Pirata+One", weights: [400, 400], body: false },
  rocker:         { label: "Rocker", group: "Decorative", css: "'New Rocker', serif", google: "family=New+Rocker", weights: [400, 400], body: false },
  typewriter:     { label: "Typewriter", group: "Decorative", css: "'Special Elite', ui-monospace, monospace", google: "family=Special+Elite", weights: [400, 400], body: false },
  pixel:          { label: "Pixel", group: "Decorative", css: "'Press Start 2P', ui-monospace, monospace", google: "family=Press+Start+2P", weights: [400, 400], body: false },
  bungee:         { label: "Bungee", group: "Decorative", css: "'Bungee', ui-sans-serif, sans-serif", google: "family=Bungee", weights: [400, 400], body: false },
  neon:           { label: "Neon", group: "Decorative", css: "'Monoton', ui-sans-serif, sans-serif", google: "family=Monoton", weights: [400, 400], body: false },
  carved:         { label: "Carved caps", group: "Decorative", css: "'Cinzel', ui-serif, Georgia, serif", google: "family=Cinzel:wght@400..900", weights: [400, 900], body: false },
  script:         { label: "Script", group: "Decorative", css: "'Lobster', cursive", google: "family=Lobster", weights: [400, 400], body: false },
};
export const FONT_GROUPS = ["Sans", "Serif", "Mono", "Decorative"] as const;

/** A font key, with the older style names ("sans", "mono", "serif") turned into fonts. */
export function fontFor(key: FontKey | undefined, part: "headings" | "body"): string {
  const legacy: Record<string, [string, string]> = { sans: ["archivo", "inter"], mono: ["jetbrains-mono", "jetbrains-mono"], serif: ["fraunces", "source-serif"] };
  const k = key && legacy[key] ? legacy[key]![part === "headings" ? 0 : 1] : key;
  if (k && FONTS[k] && (part === "headings" || FONTS[k]!.body !== false)) return k;
  return part === "headings" ? "archivo" : "inter";
}

/** Load the web fonts for these keys (once each), by adding a Google Fonts stylesheet. */
export function loadFonts(keys: FontKey[]): void {
  for (const k of new Set(keys)) {
    const q = FONTS[k]?.google;
    if (!q || document.getElementById(`font-${k}`)) continue;
    const link = Object.assign(document.createElement("link"), { id: `font-${k}`, rel: "stylesheet", href: `https://fonts.googleapis.com/css2?${q}&display=swap` });
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

/** CIE76 ΔE between two colours — how different they look. */
export function deltaE(a: string | RGB, b: string | RGB): number {
  const lab = (c: string | RGB) => {
    const [r, g, bl] = (typeof c === "string" ? hexToRgb(c) : c).map((v) => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    }) as RGB;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const [x, y, z] = [(r * 0.4124 + g * 0.3576 + bl * 0.1805) / 0.95047, r * 0.2126 + g * 0.7152 + bl * 0.0722, (r * 0.0193 + g * 0.1192 + bl * 0.9505) / 1.08883].map(f) as RGB;
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)] as RGB;
  };
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/**
 * A tonal variant of the accent — the same colour made lighter or darker
 * (away from the page first) — that reaches `target` contrast on the page
 * and stands `apart` (ΔE) from the accent and `others`. Null if none does.
 */
function tonal(theme: Theme, others: string[], target: number, apart: number): string | null {
  const bg = hexToRgb(theme.background);
  const accent = hexToRgb(theme.accent);
  const light = luminance(bg) > 0.4;
  const steps = [0.15, 0.25, 0.35, 0.45, 0.55, 0.65];
  const toward = (end: RGB) => steps.map((t) => mix(accent, end, t));
  for (const c of [...toward(light ? BLACK : WHITE), ...toward(light ? WHITE : BLACK)]) {
    if (contrast(c, bg) >= target && deltaE(c, accent) >= apart && others.every((o) => deltaE(c, o) >= apart)) return rgbToHex(c);
  }
  return null;
}

/**
 * A highlight for a theme that only sets the accent: the accent's hue turned
 * 150° (a split complement, so it never looks like the accent), at least as
 * saturated, made to reach 3.5:1 on the page. A grey accent gets a red.
 */
export function deriveHighlight(theme: Theme): string {
  if (theme.infer === "tonal") return tonal(theme, [], 3.5, 15) ?? deriveHighlight({ ...theme, infer: "contrast" });
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
  if (theme.infer === "tonal") {
    const hl = theme.highlight ?? deriveHighlight(theme);
    return tonal(theme, [hl], 5.4, 10) ?? deriveSupport({ ...theme, infer: "contrast" });
  }
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
    fonts: {
      headings: fontFor(theme.fonts?.headings, "headings"), body: fontFor(theme.fonts?.body, "body"),
      headingsWeight: theme.fonts?.headingsWeight ?? 800, bodyWeight: theme.fonts?.bodyWeight ?? 400,
      headingsTracking: theme.fonts?.headingsTracking ?? -0.015, bodyTracking: theme.fonts?.bodyTracking ?? 0,
    },
    vibrancy: theme.vibrancy ?? 1,
    contrast: theme.contrast ?? 1,
    infer: theme.infer ?? "contrast",
  };
}

/** Just what a theme sets (drops empty optional colours and defaults) — what to save. */
export function ownColours(theme: Theme): Theme {
  const f = theme.fonts ?? {};
  const fonts = Object.fromEntries(Object.entries({
    headings: f.headings && fontFor(f.headings, "headings") !== "archivo" ? fontFor(f.headings, "headings") : undefined,
    body: f.body && fontFor(f.body, "body") !== "inter" ? fontFor(f.body, "body") : undefined,
    headingsWeight: f.headingsWeight !== undefined && f.headingsWeight !== 800 ? f.headingsWeight : undefined,
    bodyWeight: f.bodyWeight !== undefined && f.bodyWeight !== 400 ? f.bodyWeight : undefined,
    headingsTracking: f.headingsTracking !== undefined && f.headingsTracking !== -0.015 ? f.headingsTracking : undefined,
    bodyTracking: f.bodyTracking !== undefined && f.bodyTracking !== 0 ? f.bodyTracking : undefined,
  }).filter(([, v]) => v !== undefined));
  return {
    accent: theme.accent, background: theme.background,
    ...(theme.highlight ? { highlight: theme.highlight } : {}),
    ...(theme.support ? { support: theme.support } : {}),
    ...(Object.keys(fonts).length ? { fonts } : {}),
    ...(theme.infer === "tonal" && (!theme.highlight || !theme.support) ? { infer: "tonal" as const } : {}),
    ...(theme.vibrancy !== undefined && theme.vibrancy !== 1 ? { vibrancy: theme.vibrancy } : {}),
    ...(theme.contrast !== undefined && theme.contrast !== 1 ? { contrast: theme.contrast } : {}),
  };
}

/**
 * The theme with vibrancy applied: the brand colours' saturation scaled by it
 * (and the page's by half as much), hue and lightness kept.
 */
function tuned(theme: FullTheme): FullTheme {
  const v = Math.max(0.3, Math.min(1.6, theme.vibrancy));
  if (v === 1) return theme;
  const sat = (hex: string, by: number) => {
    const [h, s, l] = rgbToHsl(hexToRgb(hex));
    return rgbToHex(hslToRgb([h, Math.max(0, Math.min(1, s * by)), l]));
  };
  return { ...theme, accent: sat(theme.accent, v), highlight: sat(theme.highlight, v), support: sat(theme.support, v), background: sat(theme.background, 1 + (v - 1) / 2) };
}

/** Every derived colour, as RGB, keyed by CSS variable name (without the --c- prefix). */
export function deriveColors(input: Theme): Record<string, RGB> {
  const theme = tuned(fullTheme(input));
  const bg = hexToRgb(theme.background);
  const light = luminance(bg) > 0.4;
  // Surfaces step away from the background — lighter on dark themes, darker on
  // light ones — as far as it takes to read as separate layers on this background.
  const away = light ? BLACK : WHITE;
  // Layer contrast scales how far cards, fields and borders step from the page.
  const k = theme.contrast;
  const T = { ...CONTRAST_TARGETS, card: 1 + (CONTRAST_TARGETS.card - 1) * k, card2: 1 + (CONTRAST_TARGETS.card2 - 1) * k, border: 1 + (CONTRAST_TARGETS.border - 1) * k };
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

/**
 * An app's src/styles/tokens.css for a theme: every colour token ("R G B"),
 * any non-default fonts, weights and spacing, and the colour scheme — so the
 * page looks right before any script runs. scripts/tokens.mjs prints this.
 */
export function tokensCss(theme: Theme): string {
  const lines = Object.entries(deriveColors(theme)).map(([k, v]) => `  --c-${k}: ${v.map(Math.round).join(" ")};`);
  const f = fullTheme(theme).fonts;
  // Fonts other than the defaults (index.html must load their Google Fonts too).
  if (f.headings !== "archivo") lines.push(`  --font-display: ${FONTS[f.headings!]!.css};`);
  if (f.body !== "inter") lines.push(`  --font-body: ${FONTS[f.body!]!.css};`);
  if (f.headingsWeight !== 800) lines.push(`  --font-display-weight: ${f.headingsWeight};`);
  if (f.bodyWeight !== 400) lines.push(`  --font-body-weight: ${f.bodyWeight};`);
  if (f.headingsTracking !== -0.015) lines.push(`  --font-display-tracking: ${f.headingsTracking}em;`);
  if (f.bodyTracking !== 0) lines.push(`  --font-body-tracking: ${f.bodyTracking}em;`);
  return [
    `/* This app's default theme tokens ("R G B" channels), so the page looks right`,
    `   before any script runs. Owned by the app; generate from BRAND.defaultTheme`,
    `   with jimbo-ui's scripts/tokens.mjs (or export it from a Brand page).`,
    `   src/lib/theme.ts overrides them at runtime. */`,
    ":root {", ...lines, `  color-scheme: ${luminance(theme.background) > 0.4 ? "light" : "dark"};`, "}",
  ].join("\n");
}

/** The kind marker in a theme file. */
export const THEME_FILE_KIND = "jimbo-ui/theme";

/**
 * A theme as a shareable file (JSON): what it sets (inferred colours and
 * defaults left out, so they stay inferred), with an optional name. Import it
 * into any jimbo.ui app's Brand page, or paste it into an app's brand.config.ts.
 */
export function exportTheme(theme: Theme, name?: string): string {
  return JSON.stringify({ kind: THEME_FILE_KIND, version: 1, ...(name ? { name } : {}), theme: ownColours(theme) }, null, 2);
}

/** The `defaultTheme` line for an app's src/lib/brand.config.ts. */
export function brandConfigLine(theme: Theme): string {
  const literal = JSON.stringify(ownColours(theme)).replace(/"(\w+)":/g, "$1: ").replace(/,(?=\S)/g, ", ").replace(/\{(?=\S)/g, "{ ").replace(/(?<=\S)\}/g, " }");
  return `  defaultTheme: ${literal} satisfies Theme,`;
}

/**
 * Read a theme from text: a theme file (`exportTheme`), a bare theme object,
 * or anything with a `theme` or `defaultTheme` in it. Unknown fields are
 * dropped and numbers clamped; throws an Error with a plain message if there's
 * no usable accent and background.
 */
export function importTheme(text: string): { theme: Theme; name?: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error("That isn't a theme file — it should be JSON, like an export from a Brand page."); }
  const obj = (data ?? {}) as Record<string, unknown>;
  const raw = ((obj.theme ?? obj.defaultTheme ?? obj) ?? {}) as Record<string, unknown>;
  const hex = (v: unknown) => (typeof v === "string" && isHex(v) ? v.toUpperCase() : undefined);
  const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);
  const accent = hex(raw.accent), background = hex(raw.background);
  if (!accent || !background) throw new Error("The file needs at least an accent and a background colour (#RRGGBB).");
  const f = (raw.fonts ?? {}) as Record<string, unknown>;
  const theme: Theme = {
    accent, background,
    highlight: hex(raw.highlight), support: hex(raw.support),
    fonts: {
      headings: typeof f.headings === "string" ? fontFor(f.headings, "headings") : undefined,
      body: typeof f.body === "string" ? fontFor(f.body, "body") : undefined,
      headingsWeight: num(f.headingsWeight, 100, 900), bodyWeight: num(f.bodyWeight, 100, 900),
      headingsTracking: num(f.headingsTracking, -0.1, 0.3), bodyTracking: num(f.bodyTracking, -0.1, 0.3),
    },
    infer: raw.infer === "tonal" ? "tonal" : undefined,
    vibrancy: num(raw.vibrancy, 0.4, 1.5), contrast: num(raw.contrast, 0.8, 1.6),
  };
  const name = typeof obj.name === "string" ? obj.name.slice(0, 80) : undefined;
  return { theme: ownColours(theme), ...(name ? { name } : {}) };
}

/** Write the theme to the page: CSS variables, browser chrome colour, and a cached copy for next load. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const vars: Record<string, string> = {};
  for (const [name, [r, g, b]] of Object.entries(deriveColors(theme))) {
    vars[`--c-${name}`] = `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
  }
  const f = fullTheme(theme).fonts;
  vars["--font-display"] = FONTS[f.headings!]!.css;
  vars["--font-body"] = FONTS[f.body!]!.css;
  vars["--font-display-weight"] = String(f.headingsWeight);
  vars["--font-body-weight"] = String(f.bodyWeight);
  vars["--font-display-tracking"] = `${f.headingsTracking}em`;
  vars["--font-body-tracking"] = `${f.bodyTracking}em`;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  loadFonts([f.headings!, f.body!]);
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
