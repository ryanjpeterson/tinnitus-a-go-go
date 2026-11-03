/**
 * The brand theme's colours for emails, from the same place the app reads them
 * (site_copy — see loadEmailTheme in data.ts), worked out into the handful of
 * email-safe colours the templates use. No database here, so previews run anywhere.
 */

export interface EmailTheme {
  accent: string;
  highlight: string;
  support: string;
  background: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  /** Text on an accent fill. */
  onAccent: string;
  /** The accent where it's text on the background (falls back to the text colour when too faint). */
  accentText: string;
  highlightText: string;
  supportText: string;
  dark: boolean;
}

/** jimbo.ui's default theme for this app (apps/web/src/lib/brand.config.ts). */
export const DEFAULT_COLOURS = { accent: "#A8FF3E", highlight: "#FF3D6E", background: "#141416", support: "#2EC5FF" };

const HEX = /^#[0-9a-fA-F]{6}$/;

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `a` moved `t` (0–1) of the way to `b`. */
function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((c, i) => Math.round(c + (y[i]! - c) * t).toString(16).padStart(2, "0")).join("")}`;
}

export function emailTheme(colours: Partial<typeof DEFAULT_COLOURS>): EmailTheme {
  const pick = (k: keyof typeof DEFAULT_COLOURS) => (colours[k] && HEX.test(colours[k]!) ? colours[k]! : DEFAULT_COLOURS[k]);
  const background = pick("background");
  const accent = pick("accent");
  const highlight = pick("highlight");
  const support = pick("support");
  const dark = luminance(background) < 0.18;
  const text = dark ? "#F4F4F5" : "#141416";
  const readable = (c: string) => (contrast(c, background) >= 3 ? c : text);
  return {
    accent, highlight, support, background, text, dark,
    surface: mix(background, text, dark ? 0.06 : 0.04),
    border: mix(background, text, dark ? 0.16 : 0.14),
    muted: mix(text, background, 0.38),
    onAccent: contrast("#000000", accent) >= contrast("#FFFFFF", accent) ? "#0A0A0A" : "#FFFFFF",
    accentText: readable(accent),
    highlightText: readable(highlight),
    supportText: readable(support),
  };
}
