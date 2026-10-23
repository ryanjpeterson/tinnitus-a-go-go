/**
 * Theme engine — three brand colours in, every colour token out.
 *
 *   accent      primary colour (buttons, active tabs, "attended", the logo's TINNITUS)
 *   highlight   secondary colour (dates, "on this day", alerts, the logo's a-go-go)
 *   background  page colour; surfaces, borders and text are derived from it,
 *               and a light background flips the text to dark
 *
 * Tokens are CSS variables holding "R G B" channels, so Tailwind classes keep
 * their opacity modifiers (`bg-accent-lime/15`). The defaults live in
 * globals.css too, so the app looks right before any script runs; index.html
 * applies the last-used theme from localStorage before first paint.
 *
 * Part of jimbo-ui (foundation — don't edit here; change jimbo-ui and update).
 * The app's own values live in ./brand.config.ts.
 */

import { BRAND } from "./brand.config";

export interface Theme {
  accent: string;
  highlight: string;
  background: string;
}

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
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export const isHex = (v: string): boolean => /^#[0-9a-f]{6}$/i.test(v);

/** Every derived colour, as RGB, keyed by CSS variable name (without the --c- prefix). */
export function deriveColors(theme: Theme): Record<string, RGB> {
  const bg = hexToRgb(theme.background);
  const accent = hexToRgb(theme.accent);
  const highlight = hexToRgb(theme.highlight);
  const light = luminance(bg) > 0.4;
  // Surfaces step away from the background: lighter on dark themes, darker on light ones.
  const away = light ? BLACK : WHITE;
  const text: RGB = light ? [20, 20, 22] : [244, 241, 235];
  const onColor = (c: RGB): RGB => (luminance(c) > 0.35 ? [20, 20, 22] : [255, 255, 255]);
  return {
    bg,
    "bg-deep": mix(bg, away, 0.017),
    surface: mix(bg, away, light ? 0.04 : 0.034),
    "surface-2": mix(bg, away, light ? 0.075 : 0.072),
    border: mix(bg, away, light ? 0.14 : 0.119),
    text,
    "text-muted": mix(text, bg, 0.38),
    "text-subtle": mix(text, bg, 0.58),
    accent,
    "accent-hover": mix(accent, light ? BLACK : WHITE, 0.22),
    "on-accent": onColor(accent),
    // Tints for the "attended" style and other accent washes (were Tailwind's lime-950/900/700).
    "accent-950": mix(bg, accent, 0.1),
    "accent-900": mix(bg, accent, 0.28),
    "accent-700": mix(bg, accent, 0.5),
    highlight,
    "highlight-hover": mix(highlight, light ? BLACK : WHITE, 0.2),
    "on-highlight": onColor(highlight),
    "highlight-950": mix(bg, highlight, 0.1),
    "highlight-900": mix(bg, highlight, 0.28),
    "highlight-800": mix(bg, highlight, 0.4),
  };
}

/** The same colours as hex strings — for canvas, maps and other non-CSS uses. */
export function themeHex(theme: Theme): Record<string, string> {
  return Object.fromEntries(Object.entries(deriveColors(theme)).map(([k, v]) => [k, rgbToHex(v)]));
}

/** Map style for Google Maps, tinted from the theme (dark or light). */
export function mapStyles(theme: Theme): google.maps.MapTypeStyle[] {
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
    root.style.setProperty(`--c-${name}`, vars[`--c-${name}`]!);
  }
  const scheme = luminance(theme.background) > 0.4 ? "light" : "dark";
  root.style.colorScheme = scheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.background);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
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
      .replace(/#A8FF3E/gi, theme.accent);
    link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  } catch { /* keep the static icon */ }
}

/** A round map pin in the highlight colour, as an SVG data URL (bigger when selected). */
export function markerIcon(theme: Theme, selected = false): string {
  const hl = hexToRgb(theme.highlight);
  const ring = rgbToHex(mix(hl, WHITE, selected ? 0.45 : 0.3));
  const size = selected ? 28 : 20;
  const r = selected ? 11 : 8;
  return "data:image/svg+xml," + encodeURIComponent(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${theme.highlight}" stroke="${ring}" stroke-width="${selected ? 3 : 2}"/></svg>`,
  );
}
