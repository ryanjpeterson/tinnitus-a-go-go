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
 * set as `--font-display` / `--font-body` and their `-weight` / `-tracking` /
 * `-size` (an em multiple every text size follows: headings and body each ±);
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
import { ensureFullScreenViewport } from "./viewport";

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
  fonts?: { headings?: FontKey; body?: FontKey; headingsWeight?: number; bodyWeight?: number; headingsTracking?: number; bodyTracking?: number;
    /** Every heading's / body text's size as a multiple of its usual size (1 = as designed; 0.8–1.3). */
    headingsSize?: number; bodySize?: number };
  /** Colour vibrancy: 1 as picked, lower is calmer (0.4), higher is louder (1.5). */
  vibrancy?: number;
  /** Layer contrast: 1 is standard; up to 1.6 for cards, borders and labels that stand out more, down to 0.8 for softer. */
  contrast?: number;
  /** The page's backdrop: an abstract pattern over a base, in the theme's colours (`BACKDROPS`). */
  backdrop?: Backdrop;
  /** The brand motif: the flat shape `ThemeDots` draws in the theme's colours (`MOTIFS`; default circles). */
  motif?: MotifKey;
  /**
   * How missing colours are inferred: `contrast` (the default) picks new hues
   * that stand apart; `tonal` uses lighter and darker versions of the accent,
   * for a simple one-colour scheme.
   */
  infer?: "contrast" | "tonal";
}

/** A theme as a server or cache returns it: anything may be missing or null. */
export type SavedTheme = { [K in "accent" | "background" | "highlight" | "support"]?: string | null }
  & { fonts?: Theme["fonts"] | null; infer?: Theme["infer"] | null; vibrancy?: number | null; contrast?: number | null; backdrop?: Backdrop | null; motif?: MotifKey | null };

/**
 * The fonts a theme can use. `css` is the font stack; `google` the Google Fonts
 * family query that loads it (Archivo, Inter and JetBrains Mono are in
 * index.html); `weights` the range it has; `body: false` marks display faces
 * that are for headings only (blackletter, old print, poster faces — wrong for running text).
 * Nine per group; decorative faces are blackletter and old print, plus a few
 * modern poster faces (Bebas Neue, Unbounded, Syne) — no novelty.
 */
export type FontDef = { label: string; group: "Sans" | "Serif" | "Mono" | "Decorative"; css: string; google: string | null; weights: [number, number]; body?: false };
export const FONTS: Record<string, FontDef> = {
  archivo:        { label: "Archivo", group: "Sans", css: "'Archivo', ui-sans-serif, system-ui, sans-serif", google: null, weights: [500, 900] },
  inter:          { label: "Inter", group: "Sans", css: "'Inter', ui-sans-serif, system-ui, sans-serif", google: null, weights: [400, 700] },
  "space-grotesk":{ label: "Space Grotesk", group: "Sans", css: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif", google: "family=Space+Grotesk:wght@300..700", weights: [300, 700] },
  "dm-sans":      { label: "DM Sans", group: "Sans", css: "'DM Sans', ui-sans-serif, system-ui, sans-serif", google: "family=DM+Sans:opsz,wght@9..40,300..900", weights: [300, 900] },
  manrope:        { label: "Manrope", group: "Sans", css: "'Manrope', ui-sans-serif, system-ui, sans-serif", google: "family=Manrope:wght@300..800", weights: [300, 800] },
  geist:          { label: "Geist", group: "Sans", css: "'Geist', ui-sans-serif, system-ui, sans-serif", google: "family=Geist:wght@300..900", weights: [300, 900] },
  "plus-jakarta": { label: "Plus Jakarta", group: "Sans", css: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif", google: "family=Plus+Jakarta+Sans:wght@300..800", weights: [300, 800] },
  // Avenir Next / Avenir where the device has them (Apple), Nunito Sans (the nearest Google font) elsewhere.
  avenir:         { label: "Avenir", group: "Sans", css: "'Avenir Next', 'Avenir', 'Nunito Sans', ui-sans-serif, system-ui, sans-serif", google: "family=Nunito+Sans:wght@300..900", weights: [300, 900] },
  figtree:        { label: "Figtree", group: "Sans", css: "'Figtree', ui-sans-serif, system-ui, sans-serif", google: "family=Figtree:wght@300..900", weights: [300, 900] },
  newsreader:     { label: "Newsreader", group: "Serif", css: "'Newsreader', ui-serif, Georgia, serif", google: "family=Newsreader:opsz,wght@6..72,300..800", weights: [300, 800] },
  "source-serif": { label: "Source Serif", group: "Serif", css: "'Source Serif 4', ui-serif, Georgia, serif", google: "family=Source+Serif+4:opsz,wght@8..60,300..900", weights: [300, 900] },
  playfair:       { label: "Playfair", group: "Serif", css: "'Playfair Display', ui-serif, Georgia, serif", google: "family=Playfair+Display:wght@400..900", weights: [400, 900] },
  "eb-garamond":  { label: "EB Garamond", group: "Serif", css: "'EB Garamond', ui-serif, Georgia, serif", google: "family=EB+Garamond:wght@400..800", weights: [400, 800] },
  literata:       { label: "Literata", group: "Serif", css: "'Literata', ui-serif, Georgia, serif", google: "family=Literata:opsz,wght@7..72,300..900", weights: [300, 900] },
  "libre-baskerville": { label: "Baskerville", group: "Serif", css: "'Libre Baskerville', ui-serif, Georgia, serif", google: "family=Libre+Baskerville:wght@400;700", weights: [400, 700] },
  "instrument-serif": { label: "Instrument Serif", group: "Serif", css: "'Instrument Serif', ui-serif, Georgia, serif", google: "family=Instrument+Serif", weights: [400, 400], body: false },
  lora:           { label: "Lora", group: "Serif", css: "'Lora', ui-serif, Georgia, serif", google: "family=Lora:wght@400..700", weights: [400, 700] },
  "dm-serif":     { label: "DM Serif", group: "Serif", css: "'DM Serif Display', ui-serif, Georgia, serif", google: "family=DM+Serif+Display", weights: [400, 400], body: false },
  "jetbrains-mono": { label: "JetBrains Mono", group: "Mono", css: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace", google: "family=JetBrains+Mono:wght@300..800", weights: [300, 800] },
  "ibm-plex-mono":{ label: "IBM Plex Mono", group: "Mono", css: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace", google: "family=IBM+Plex+Mono:wght@300;400;500;600;700", weights: [300, 700] },
  "space-mono":   { label: "Space Mono", group: "Mono", css: "'Space Mono', ui-monospace, SFMono-Regular, monospace", google: "family=Space+Mono:wght@400;700", weights: [400, 700] },
  "fira-code":    { label: "Fira Code", group: "Mono", css: "'Fira Code', ui-monospace, SFMono-Regular, monospace", google: "family=Fira+Code:wght@300..700", weights: [300, 700] },
  "roboto-mono":  { label: "Roboto Mono", group: "Mono", css: "'Roboto Mono', ui-monospace, SFMono-Regular, monospace", google: "family=Roboto+Mono:wght@300..700", weights: [300, 700] },
  "source-code":  { label: "Source Code", group: "Mono", css: "'Source Code Pro', ui-monospace, SFMono-Regular, monospace", google: "family=Source+Code+Pro:wght@300..900", weights: [300, 900] },
  "dm-mono":      { label: "DM Mono", group: "Mono", css: "'DM Mono', ui-monospace, SFMono-Regular, monospace", google: "family=DM+Mono:wght@300;400;500", weights: [300, 500] },
  "red-hat-mono": { label: "Red Hat Mono", group: "Mono", css: "'Red Hat Mono', ui-monospace, SFMono-Regular, monospace", google: "family=Red+Hat+Mono:wght@300..700", weights: [300, 700] },
  inconsolata:    { label: "Inconsolata", group: "Mono", css: "'Inconsolata', ui-monospace, SFMono-Regular, monospace", google: "family=Inconsolata:wght@300..900", weights: [300, 900] },
  "old-english":  { label: "Old English", group: "Decorative", css: "'UnifrakturCook', serif", google: "family=UnifrakturCook:wght@700", weights: [700, 700], body: false },
  "old-german":   { label: "Old German", group: "Decorative", css: "'UnifrakturMaguntia', serif", google: "family=UnifrakturMaguntia", weights: [400, 400], body: false },
  gothic:         { label: "Gothic", group: "Decorative", css: "'Grenze Gotisch', serif", google: "family=Grenze+Gotisch:wght@300..900", weights: [300, 900], body: false },
  pirate:         { label: "Pirate", group: "Decorative", css: "'Pirata One', serif", google: "family=Pirata+One", weights: [400, 400], body: false },
  bebas:          { label: "Bebas Neue", group: "Decorative", css: "'Bebas Neue', ui-sans-serif, system-ui, sans-serif", google: "family=Bebas+Neue", weights: [400, 400], body: false },
  typewriter:     { label: "Typewriter", group: "Decorative", css: "'Special Elite', ui-monospace, monospace", google: "family=Special+Elite", weights: [400, 400], body: false },
  "old-print":    { label: "Old print", group: "Decorative", css: "'IM Fell English', ui-serif, Georgia, serif", google: "family=IM+Fell+English", weights: [400, 400], body: false },
  unbounded:      { label: "Unbounded", group: "Decorative", css: "'Unbounded', ui-sans-serif, system-ui, sans-serif", google: "family=Unbounded:wght@300..900", weights: [300, 900], body: false },
  syne:           { label: "Syne", group: "Decorative", css: "'Syne', ui-sans-serif, system-ui, sans-serif", google: "family=Syne:wght@400..800", weights: [400, 800], body: false },
};
export const FONT_GROUPS = ["Sans", "Serif", "Mono", "Decorative"] as const;

/** Fonts taken out of `FONTS`, and the nearest one still in it, so a saved theme keeps a similar face. */
export const RETIRED_FONTS: Record<string, FontKey> = {
  "ibm-plex-sans": "geist", "work-sans": "plus-jakarta", fraunces: "newsreader", marcellus: "literata", cormorant: "eb-garamond",
  rocker: "gothic", uncial: "old-print", carved: "instrument-serif",
};

/** A font key, with the older style names ("sans", "mono", "serif") turned into fonts. */
export function fontFor(key: FontKey | undefined, part: "headings" | "body"): string {
  const legacy: Record<string, [string, string]> = { sans: ["archivo", "inter"], mono: ["jetbrains-mono", "jetbrains-mono"], serif: ["newsreader", "source-serif"] };
  const k = key && legacy[key] ? legacy[key]![part === "headings" ? 0 : 1] : key && RETIRED_FONTS[key] ? RETIRED_FONTS[key] : key;
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

/** An abstract page backdrop: a pattern over a base, with strength and size. */
export type Backdrop = {
  /** A key of `BACKDROPS` (none, or one of the abstract, geo, vintage and texture patterns). */
  pattern?: BackdropPattern;
  /** solid (just the page colour) · gradient (a sweep of accent and support) · glow (soft colour orbs — the default) */
  base?: "solid" | "gradient" | "glow";
  /** 0–1, default 0.5: how strongly the pattern and base show. */
  intensity?: number;
  /** 0.5–2, default 1: the pattern's size. */
  scale?: number;
  /** 0.3–2, default 1: how far the pattern stands out from the page (the base is left as is). */
  contrast?: number;
  /** 0–1.6, default 1: the pattern's and base's colour — 0 is greys, above 1 more vivid. */
  saturation?: number;
  /**
   * How the backdrop moves (`BACKDROP_MOTIONS`): none (the default); alive
   * (each pattern its own way: rain falls, ripples spread, lines sway on their
   * own); pulse (every line and shape fades on its own beat); or drift, breathe
   * or sway (the whole layer). Off when the device asks for reduced motion.
   */
  motion?: BackdropMotion;
  /** 0.5–2, default 1: how fast it moves. */
  speed?: number;
};
export type BackdropMotion = "none" | "alive" | "pulse" | "drift" | "breathe" | "sway";
/**
 * Backdrop motions. `layer`: the whole backdrop moves (a keyframe set in
 * globals.css, `jimbo-bg-<key>`, `seconds` a cycle at speed 1); otherwise the
 * pattern's own lines and shapes move, each on its own timing, as animation
 * inside its SVG (`seconds` the typical cycle). Always slow.
 */
export const BACKDROP_MOTIONS: { key: BackdropMotion; label: string; hint: string; seconds: number; layer: boolean }[] = [
  { key: "none", label: "Still", hint: "No movement", seconds: 0, layer: false },
  { key: "alive", label: "Alive", hint: "Each pattern moves its own way: rain falls, ripples spread, stars twinkle, galaxies turn, flames flicker", seconds: 10, layer: false },
  { key: "pulse", label: "Pulse", hint: "Every line and shape fades and returns on its own beat", seconds: 7, layer: false },
  { key: "drift", label: "Drift", hint: "The whole backdrop glides slowly from corner to corner", seconds: 48, layer: true },
  { key: "breathe", label: "Breathe", hint: "The whole backdrop slowly grows and settles", seconds: 22, layer: true },
  { key: "sway", label: "Sway", hint: "The whole backdrop turns gently back and forth", seconds: 36, layer: true },
];

/** The CSS animation for a theme's backdrop motion when it moves the whole layer, or "none". */
export function backdropAnimation(theme: Theme): string {
  const b = fullTheme(theme).backdrop;
  const m = BACKDROP_MOTIONS.find((x) => x.key === b.motion);
  if (!m || !m.seconds || !m.layer || b.pattern === "none" && b.base === "solid") return "none";
  const s = Math.round((m.seconds / Math.max(0.5, Math.min(2, b.speed!))) * 10) / 10;
  return `jimbo-bg-${m.key} ${s}s ease-in-out infinite alternate`;
}

/**
 * The brand motif: flat shapes side by side in the accent, highlight and
 * support (`ThemeDots`). `path` is the shape in a 24 × 24 box, drawn as a
 * mask (black = shape); circles need none. Flat fills only, no outlines or
 * gloss, at fixed sizes like the circles they replace.
 */
export type MotifKey = "dots" | "triforce" | "sparkles" | "stars" | "hearts" | "diamonds" | "triangles" | "squares" | "crosses" | "bolts" | "flowers" | "moons" | "squiggles"
  | "skulls" | "trefoils" | "flames" | "hazards"
  | "planets" | "comets" | "suns" | "rockets" | "spirals"
  | "bats" | "pumpkins" | "ghosts" | "fangs" | "coffins" | "spiders" | "drops";
/** A bat in a 24 × 24 box, wings spread (the Bats motif and backdrop). */
const BAT = "M12 9.2 12.8 9.2 13.5 7 14.1 9.6Q18 6.4 23.5 8 21.7 9.4 21.6 11.8 20.2 10.6 18.6 11.6 17.4 11.4 16.6 13.6 14.9 12.6 13.7 14.2L12 17.6 10.3 14.2Q9.1 12.6 7.4 13.6 6.6 11.4 5.4 11.6 3.8 10.6 2.4 11.8 2.3 9.4 .5 8 6 6.4 9.9 9.6L10.5 7 11.2 9.2Z";
export const MOTIFS: { key: MotifKey; label: string; path: string | null }[] = [
  { key: "dots", label: "Circles", path: null },
  { key: "triforce", label: "Triforce", path: "<path d='M12 1.5 18 11.9H6zM6 12.1 12 22.5H0zM18 12.1 24 22.5H12z'/>" },
  { key: "sparkles", label: "Sparkles", path: "<path d='M12 0c.9 7.6 3.6 10.9 12 12-8.4 1.1-11.1 4.4-12 12-.9-7.6-3.6-10.9-12-12 8.4-1.1 11.1-4.4 12-12z'/>" },
  { key: "stars", label: "Stars", path: "<path d='m12 1 3.2 7 7.6.8-5.7 5.1 1.6 7.5L12 17.6l-6.7 3.8 1.6-7.5-5.7-5.1 7.6-.8z'/>" },
  { key: "hearts", label: "Hearts", path: "<path d='M12 22 2.6 12.9A5.9 5.9 0 0 1 12 5.4a5.9 5.9 0 0 1 9.4 7.5z'/>" },
  { key: "diamonds", label: "Diamonds", path: "<path d='M12 0 22 12 12 24 2 12z'/>" },
  { key: "triangles", label: "Triangles", path: "<path d='M12 2.5 23 21.5H1z'/>" },
  { key: "squares", label: "Squares", path: "<rect x='2' y='2' width='20' height='20' rx='5'/>" },
  { key: "crosses", label: "Crosses", path: "<path d='M8.5 1h7v7.5H23v7h-7.5V23h-7v-7.5H1v-7h7.5z'/>" },
  { key: "bolts", label: "Bolts", path: "<path d='M14.5 0 3 13.5h7.5L8.5 24 21 9.5h-7.5z'/>" },
  { key: "flowers", label: "Flowers", path: "<circle cx='12' cy='6' r='5.5'/><circle cx='18' cy='12' r='5.5'/><circle cx='12' cy='18' r='5.5'/><circle cx='6' cy='12' r='5.5'/>" },
  { key: "moons", label: "Moons", path: "<path d='M15.5 1A11 11 0 1 0 23 17.6 9 9 0 0 1 15.5 1z'/>" },
  { key: "squiggles", label: "Squiggles", path: "<path d='M1 15c3-8 6-8 7.5 0s5 8 7.5 0 5-8 7 0' fill='none' stroke='black' stroke-width='4' stroke-linecap='round'/>" },
  { key: "skulls", label: "Skulls", path: "<path fill-rule='evenodd' d='M12 1C6.5 1 2.5 5 2.5 10.2c0 3 1.4 5.3 3.5 6.6V21a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 21v-4.2c2.1-1.3 3.5-3.6 3.5-6.6C21.5 5 17.5 1 12 1zM8.2 8.6a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm7.6 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 14.4l-1.4 2.8h2.8z'/>" },
  { key: "trefoils", label: "Trefoils", path: "<path d='M14.1 15.64 17.75 21.96A11.5 11.5 0 0 1 6.25 21.96L9.9 15.64A4.2 4.2 0 0 0 14.1 15.64zM7.8 12H.5A11.5 11.5 0 0 1 6.25 2.04L9.9 8.36A4.2 4.2 0 0 0 7.8 12zM14.1 8.36 17.75 2.04A11.5 11.5 0 0 1 23.5 12H16.2A4.2 4.2 0 0 0 14.1 8.36zM12 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 1 0 0-4.8z'/>" },
  { key: "flames", label: "Flames", path: "<path d='M12 .5c1.5 5 7.5 7.5 7.5 14.5a7.5 7.5 0 0 1-15 0c0-3.6 1.8-6 3.8-7.8-.2 3 1 5 2.7 5.6C10.4 9 10.6 4.6 12 .5z'/>" },
  { key: "hazards", label: "Hazards", path: "<path fill-rule='evenodd' d='M12 1.5 23.5 21.5H.5zM10.8 8h2.4l-.4 7.2h-1.6zM12 16.6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'/>" },
  { key: "planets", label: "Planets", path: "<circle cx='12' cy='12' r='6.5'/><ellipse cx='12' cy='12' rx='11' ry='3.4' transform='rotate(-22 12 12)' fill='none' stroke='black' stroke-width='2'/>" },
  { key: "comets", label: "Comets", path: "<circle cx='16' cy='8' r='5.5'/><path d='M12.1 4.1 1 23 19.9 11.9z'/>" },
  { key: "suns", label: "Suns", path: "<circle cx='12' cy='12' r='5.2'/><path d='M12 1.2v3.6M12 19.2v3.6M1.2 12h3.6M19.2 12h3.6M4.4 4.4l2.5 2.5M17.1 17.1l2.5 2.5M4.4 19.6l2.5-2.5M17.1 6.9l2.5-2.5' stroke='black' stroke-width='2.4' stroke-linecap='round'/>" },
  { key: "rockets", label: "Rockets", path: "<path fill-rule='evenodd' d='M12 1c3.5 2.6 5 6.6 5 11v5H7v-5c0-4.4 1.5-8.4 5-11zm0 6.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 12.5l-4 4.5v4.5l4-2.5zM17 12.5l4 4.5v4.5l-4-2.5zM9.5 18h5l-1.2 5h-2.6z'/>" },
  { key: "spirals", label: "Spirals", path: "<path d='M12 12c.3-1.6 2.5-1.6 3 0 .7 2.2-1.5 4-3.6 3.6-3-.6-3.8-4.2-2.2-6.5 2.2-3.2 7-3 9 .2 2.4 3.8.4 8.8-3.6 9.9' fill='none' stroke='black' stroke-width='2.6' stroke-linecap='round'/><circle cx='12' cy='12' r='2.2'/>" },
  { key: "bats", label: "Bats", path: `<path transform='translate(0 -.6) scale(1 1.25) translate(0 -2)' d='${BAT}'/>` },
  { key: "pumpkins", label: "Pumpkins", path: "<ellipse cx='7.6' cy='15' rx='6.1' ry='7.3'/><ellipse cx='16.4' cy='15' rx='6.1' ry='7.3'/><ellipse cx='12' cy='14.6' rx='5' ry='8'/><path d='M11 7.2c0-2.3.6-4.3 2.6-5.8l1.6 1.3c-1.5 1.2-1.9 2.6-1.9 4.5z'/>" },
  { key: "ghosts", label: "Ghosts", path: "<path fill-rule='evenodd' d='M12 1.5a8 8 0 0 0-8 8V22.5l2.7-2 2.6 2 2.7-2 2.7 2 2.6-2 2.7 2V9.5a8 8 0 0 0-8-8zM9 8a1.5 2 0 1 0 0 4 1.5 2 0 0 0 0-4zm6 0a1.5 2 0 1 0 0 4 1.5 2 0 0 0 0-4z'/>" },
  { key: "fangs", label: "Fangs", path: "<path d='M1.5 4h21c0 3.2-1.6 5.3-4.2 5.8L16.4 21l-2.2-11.2H9.8L7.6 21 5.7 9.8C3.1 9.3 1.5 7.2 1.5 4z'/>" },
  { key: "coffins", label: "Coffins", path: "<path fill-rule='evenodd' d='M8 1h8l3.2 6.2L16.6 23H7.4L4.8 7.2zM11 6v3H8.5v2H11v6h2v-6h2.5V9H13V6z'/>" },
  { key: "spiders", label: "Spiders", path: "<circle cx='12' cy='14.5' r='4.2'/><circle cx='12' cy='8.8' r='2.7'/><path d='M12 0v6.5' stroke='black' stroke-width='1.2'/><path d='M9.4 12.5 4.5 8.5 2.5 11.5M8.8 14.5H3l-2 3M9.4 16.5 5 19.5l-1 4M14.6 12.5l4.9-4 2 3M15.2 14.5H21l2 3M14.6 16.5l4.4 3 1 4' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/>" },
  { key: "drops", label: "Drops", path: "<path d='M12 1C9 6.5 4.5 11 4.5 15.5a7.5 7.5 0 0 0 15 0C19.5 11 15 6.5 12 1z'/>" },
];

/** The motif's mask (a CSS url) or "none" for circles. */
export function motifMask(theme: Theme): string {
  const m = MOTIFS.find((x) => x.key === theme.motif);
  if (!m?.path) return "none";
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>${m.path}</svg>`)}")`;
}
export type BackdropPattern =
  | "none" | "ripples" | "waves" | "contours" | "shapes" | "blobs" | "flow" | "confetti" | "burst"
  | "swirl" | "ribbons" | "scribble" | "rain" | "panels"
  | "geometry" | "hexagons" | "diamonds" | "grid" | "arrows"
  | "squares" | "zigzag" | "rings" | "crosses" | "scales" | "cubes" | "checks"
  | "halftone" | "stripes" | "sunburst" | "deco"
  | "pinstripe" | "gingham" | "polka" | "plaid" | "argyle" | "racing" | "trellis" | "bauhaus"
  | "dots" | "grain" | "paper" | "linen"
  | "concrete" | "brushed" | "sand" | "speckle" | "crosshatch" | "twill" | "carbon" | "ribbed"
  | "embers" | "ash" | "cracks" | "hazard" | "skyline" | "fallout" | "smog" | "barbed" | "static" | "shockwave"
  | "starfield" | "nebula" | "galaxy" | "orbits" | "aurora" | "comets" | "constellations" | "eclipse" | "milkyway" | "planetrise"
  | "bats" | "webs" | "moonlit" | "graveyard" | "mist" | "candles" | "damask" | "drips" | "briars" | "arches";
export const BACKDROP_GROUPS = ["Abstract", "Geo", "Vintage", "Texture", "Ruin", "Cosmos", "Haunt"] as const;
export const BACKDROPS: { key: BackdropPattern; label: string; hint: string; group: (typeof BACKDROP_GROUPS)[number] | null }[] = [
  { key: "none", label: "None", hint: "Just the base", group: null },
  { key: "ripples", label: "Ripples", hint: "Rings spreading from two corners", group: "Abstract" },
  { key: "waves", label: "Waves", hint: "Layered waves along the bottom", group: "Abstract" },
  { key: "contours", label: "Contours", hint: "Topographic lines", group: "Abstract" },
  { key: "shapes", label: "Shapes", hint: "Scattered circles, triangles and squiggles", group: "Abstract" },
  { key: "blobs", label: "Blobs", hint: "Three soft organic shapes", group: "Abstract" },
  { key: "flow", label: "Flow", hint: "Lines flowing across the page", group: "Abstract" },
  { key: "confetti", label: "Confetti", hint: "Small dashes in every colour", group: "Abstract" },
  { key: "burst", label: "Light burst", hint: "Rays from the top", group: "Abstract" },
  { key: "swirl", label: "Swirl", hint: "A spiral unwinding from a corner", group: "Abstract" },
  { key: "ribbons", label: "Ribbons", hint: "Three broad bands across the page", group: "Abstract" },
  { key: "scribble", label: "Scribble", hint: "Loose looping lines", group: "Abstract" },
  { key: "rain", label: "Rain", hint: "Short slanted strokes", group: "Abstract" },
  { key: "panels", label: "Panels", hint: "Tall slanted panels side by side", group: "Abstract" },
  { key: "geometry", label: "Triangles", hint: "A triangle lattice", group: "Geo" },
  { key: "hexagons", label: "Hexagons", hint: "A honeycomb", group: "Geo" },
  { key: "diamonds", label: "Diamonds", hint: "A harlequin of diamonds", group: "Geo" },
  { key: "grid", label: "Grid", hint: "Graph paper, a heavier line every fourth", group: "Geo" },
  { key: "arrows", label: "Arrows", hint: "Chevrons heading up", group: "Geo" },
  { key: "squares", label: "Squares", hint: "Nested squares", group: "Geo" },
  { key: "zigzag", label: "Zigzag", hint: "Rows of zigzag lines", group: "Geo" },
  { key: "rings", label: "Rings", hint: "A grid of small rings", group: "Geo" },
  { key: "crosses", label: "Crosses", hint: "Small plus signs", group: "Geo" },
  { key: "scales", label: "Scales", hint: "Overlapping fish scales", group: "Geo" },
  { key: "cubes", label: "Cubes", hint: "An isometric cube lattice", group: "Geo" },
  { key: "checks", label: "Checks", hint: "A faint checkerboard", group: "Geo" },
  { key: "halftone", label: "Halftone", hint: "Print dots fading from a corner", group: "Vintage" },
  { key: "stripes", label: "Retro stripes", hint: "Three bands sweeping round a corner", group: "Vintage" },
  { key: "sunburst", label: "Sunburst", hint: "Wide rays rising from the bottom", group: "Vintage" },
  { key: "deco", label: "Deco fans", hint: "Art deco scallops", group: "Vintage" },
  { key: "pinstripe", label: "Pinstripe", hint: "Fine vertical stripes", group: "Vintage" },
  { key: "gingham", label: "Gingham", hint: "Crossed bands, picnic-cloth style", group: "Vintage" },
  { key: "polka", label: "Polka", hint: "Spaced-out polka dots", group: "Vintage" },
  { key: "plaid", label: "Plaid", hint: "A tartan of crossing stripes", group: "Vintage" },
  { key: "argyle", label: "Argyle", hint: "Diamonds with a crossing line", group: "Vintage" },
  { key: "racing", label: "Racing stripes", hint: "Three stripes across a corner", group: "Vintage" },
  { key: "trellis", label: "Trellis", hint: "A diagonal lattice with studs", group: "Vintage" },
  { key: "bauhaus", label: "Bauhaus", hint: "Quarter circles and blocks", group: "Vintage" },
  { key: "dots", label: "Dot grid", hint: "Fine dots", group: "Texture" },
  { key: "grain", label: "Grain", hint: "Fine film grain", group: "Texture" },
  { key: "paper", label: "Paper", hint: "Soft mottled paper", group: "Texture" },
  { key: "linen", label: "Linen", hint: "A fine woven crosshatch", group: "Texture" },
  { key: "concrete", label: "Concrete", hint: "Blotchy, like poured concrete", group: "Texture" },
  { key: "brushed", label: "Brushed", hint: "Fine horizontal streaks, like brushed metal", group: "Texture" },
  { key: "sand", label: "Sand", hint: "Coarse grain", group: "Texture" },
  { key: "speckle", label: "Speckle", hint: "Scattered flecks", group: "Texture" },
  { key: "crosshatch", label: "Crosshatch", hint: "Fine diagonal hatching", group: "Texture" },
  { key: "twill", label: "Twill", hint: "Diagonal weave, like denim", group: "Texture" },
  { key: "carbon", label: "Carbon", hint: "A tiny woven check", group: "Texture" },
  { key: "ribbed", label: "Ribbed", hint: "Fine horizontal ribs", group: "Texture" },
  { key: "embers", label: "Embers", hint: "Sparks rising from below", group: "Ruin" },
  { key: "ash", label: "Ash", hint: "Grey flakes drifting down", group: "Ruin" },
  { key: "cracks", label: "Cracks", hint: "Fractures spreading from a few points", group: "Ruin" },
  { key: "hazard", label: "Hazard", hint: "A band of caution stripes along the bottom", group: "Ruin" },
  { key: "skyline", label: "Skyline", hint: "A broken city along the bottom", group: "Ruin" },
  { key: "fallout", label: "Fallout", hint: "Scattered trefoil signs", group: "Ruin" },
  { key: "smog", label: "Smog", hint: "Banks of smoke across the page", group: "Ruin" },
  { key: "barbed", label: "Barbed", hint: "Rows of barbed wire", group: "Ruin" },
  { key: "static", label: "Static", hint: "Scan lines over noise, like a dead channel", group: "Ruin" },
  { key: "shockwave", label: "Shockwave", hint: "Broken rings from a blast below", group: "Ruin" },
  { key: "starfield", label: "Starfield", hint: "Stars of every size, twinkling", group: "Cosmos" },
  { key: "nebula", label: "Nebula", hint: "Clouds of colour that slowly swell and settle", group: "Cosmos" },
  { key: "galaxy", label: "Galaxy", hint: "A spiral galaxy turning about its core", group: "Cosmos" },
  { key: "orbits", label: "Orbits", hint: "Planets going round a sun in the corner", group: "Cosmos" },
  { key: "aurora", label: "Aurora", hint: "Curtains of light that fold and unfold", group: "Cosmos" },
  { key: "comets", label: "Comets", hint: "Comets crossing on a long diagonal", group: "Cosmos" },
  { key: "constellations", label: "Constellations", hint: "Stars joined into figures", group: "Cosmos" },
  { key: "eclipse", label: "Eclipse", hint: "A dark sun with a breathing corona", group: "Cosmos" },
  { key: "milkyway", label: "Milky Way", hint: "A band of stars across the sky", group: "Cosmos" },
  { key: "planetrise", label: "Planetrise", hint: "A ringed planet rising along the bottom", group: "Cosmos" },
  { key: "bats", label: "Bats", hint: "Bats flapping up and away", group: "Haunt" },
  { key: "webs", label: "Webs", hint: "Webs in two corners, a spider on its thread", group: "Haunt" },
  { key: "moonlit", label: "Moonlit", hint: "A full moon with clouds passing", group: "Haunt" },
  { key: "graveyard", label: "Graveyard", hint: "Headstones and a bare tree in low fog", group: "Haunt" },
  { key: "mist", label: "Mist", hint: "Banks of mist rolling past", group: "Haunt" },
  { key: "candles", label: "Candles", hint: "Candles along the bottom, flames flickering", group: "Haunt" },
  { key: "damask", label: "Damask", hint: "Old wallpaper with a velvet flourish", group: "Haunt" },
  { key: "drips", label: "Drips", hint: "Drips running from the top, now and then a drop", group: "Haunt" },
  { key: "briars", label: "Briars", hint: "Thorny vines from two corners", group: "Haunt" },
  { key: "arches", label: "Arches", hint: "Rows of pointed windows", group: "Haunt" },
];
export const BACKDROP_BASES = ["solid", "gradient", "glow"] as const;

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
      headingsSize: theme.fonts?.headingsSize ?? 1, bodySize: theme.fonts?.bodySize ?? 1,
    },
    vibrancy: theme.vibrancy ?? 1,
    contrast: theme.contrast ?? 1,
    backdrop: { pattern: theme.backdrop?.pattern ?? "none", base: theme.backdrop?.base ?? "glow", intensity: theme.backdrop?.intensity ?? 0.5, scale: theme.backdrop?.scale ?? 1,
      contrast: theme.backdrop?.contrast ?? 1, saturation: theme.backdrop?.saturation ?? 1, motion: theme.backdrop?.motion ?? "none", speed: theme.backdrop?.speed ?? 1 },
    motif: MOTIFS.some((m) => m.key === theme.motif) ? theme.motif! : "dots",
    infer: theme.infer ?? "contrast",
  };
}

/** A backdrop without its defaults (none, glow, 0.5, 1, 1, 1), or undefined if it's all defaults. */
function ownBackdrop(b: Backdrop | undefined): Backdrop | undefined {
  if (!b) return undefined;
  const out: Backdrop = {
    ...(b.pattern && b.pattern !== "none" ? { pattern: b.pattern } : {}),
    ...(b.base && b.base !== "glow" ? { base: b.base } : {}),
    ...(b.intensity !== undefined && b.intensity !== 0.5 ? { intensity: b.intensity } : {}),
    ...(b.scale !== undefined && b.scale !== 1 ? { scale: b.scale } : {}),
    ...(b.contrast !== undefined && b.contrast !== 1 ? { contrast: b.contrast } : {}),
    ...(b.saturation !== undefined && b.saturation !== 1 ? { saturation: b.saturation } : {}),
    ...(b.motion && b.motion !== "none" ? { motion: b.motion } : {}),
    ...(b.speed !== undefined && b.speed !== 1 ? { speed: b.speed } : {}),
  };
  return Object.keys(out).length ? out : undefined;
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
    headingsSize: f.headingsSize !== undefined && f.headingsSize !== 1 ? f.headingsSize : undefined,
    bodySize: f.bodySize !== undefined && f.bodySize !== 1 ? f.bodySize : undefined,
  }).filter(([, v]) => v !== undefined));
  return {
    accent: theme.accent, background: theme.background,
    ...(theme.highlight ? { highlight: theme.highlight } : {}),
    ...(theme.support ? { support: theme.support } : {}),
    ...(Object.keys(fonts).length ? { fonts } : {}),
    ...(theme.infer === "tonal" && (!theme.highlight || !theme.support) ? { infer: "tonal" as const } : {}),
    ...(theme.vibrancy !== undefined && theme.vibrancy !== 1 ? { vibrancy: theme.vibrancy } : {}),
    ...(theme.contrast !== undefined && theme.contrast !== 1 ? { contrast: theme.contrast } : {}),
    ...(ownBackdrop(theme.backdrop) ? { backdrop: ownBackdrop(theme.backdrop) } : {}),
    ...(theme.motif && theme.motif !== "dots" && MOTIFS.some((m) => m.key === theme.motif) ? { motif: theme.motif } : {}),
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

// Tiled patterns that travel (seamlessly, a tile at a time) when alive: the direction and a cycle's share of the motion's seconds.
const TRAVEL: Partial<Record<BackdropPattern, [number, number, number]>> = {
  rain: [0, 1, 0.14], confetti: [0, 1, 1.2], arrows: [0, -1, 0.7], zigzag: [1, 0, 1], pinstripe: [1, 0, 1.6], twill: [1, 0, 1.4], speckle: [1, 1, 3],
  embers: [0, -1, 1.1], ash: [0, 1, 1.8], barbed: [1, 0, 2.2], static: [0, 1, 0.3],
  comets: [-1, 1, 2.4], bats: [1, -1, 3.2],
};
// When alive, these patterns' plain lines and shapes twinkle (fade a little on their own beat) instead of swaying…
const TWINKLE = new Set<BackdropPattern>(["nebula", "galaxy", "aurora", "eclipse", "milkyway", "webs"]);
// …and these keep still: only the parts the pattern animates itself (planets, flames, fog, drips) move.
const HELD = new Set<BackdropPattern>(["orbits", "planetrise", "moonlit", "graveyard", "mist", "candles", "drips", "briars"]);
// A repeatable "random" number in 0–1 for element i, so a pattern looks the same on every load.
const jitter = (i: number, salt: number) => { const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); };
// Few enough animated elements to stay smooth; above this, every nth element moves.
const MAX_MOVING = 220;

/**
 * Animation inside a backdrop pattern's SVG (SMIL, which runs in a CSS
 * background image without script), so its own lines and shapes move:
 * - pulse: every element fades and returns on its own beat;
 * - alive: tiled rain falls, confetti drifts down, arrows rise and stripes
 *   slide (the tile moves by a whole tile, so the loop never jumps);
 *   ripples spread outward; every other line or shape sways a little on its
 *   own path and timing; textures (noise) and the rest of the tiles twinkle
 *   (so do the shapes of `TWINKLE` patterns; `HELD` patterns' keep still).
 * Only self-closing shapes are touched: a pattern that moves its own way (a
 * galaxy turning, a nebula breathing, a candle flickering) writes its own
 * animation inside an open-and-closed element, which this leaves alone.
 */
function animatePattern(body: string, pattern: BackdropPattern, mode: BackdropMotion, seconds: number, w: number, h: number, tiled: boolean, sc: number): string {
  const noise = body.includes("<filter");
  const travel = TRAVEL[pattern];
  if (mode === "alive" && tiled && travel) {
    const [dx, dy, share] = [travel[0] * w, travel[1] * h, travel[2]];
    const copies = [[0, 0], [-dx, 0], [0, -dy], [-dx, -dy]].filter(([x, y], i, all) => all.findIndex(([a, c]) => a === x && c === y) === i);
    return `<g><animateTransform attributeName='transform' type='translate' from='0 0' to='${dx} ${dy}' dur='${(seconds * share).toFixed(2)}s' repeatCount='indefinite'/>`
      + copies.map(([x, y]) => `<g transform='translate(${x} ${y})'>${body}</g>`).join("") + "</g>";
  }
  if (noise) {
    // One layer of noise: it can only breathe as a whole.
    return mode === "pulse" || mode === "alive"
      ? body.replace(/<rect([^>]*)\/>/, `<rect$1><animate attributeName='opacity' values='1;0.55;1' dur='${(seconds * 1.4).toFixed(2)}s' repeatCount='indefinite'/></rect>`)
      : body;
  }
  if (mode === "alive" && HELD.has(pattern)) return body;
  const shapes = body.match(/<(circle|ellipse|rect|path|line|polygon|polyline)\b[^>]*\/>/g)?.length ?? 0;
  const every = Math.max(1, Math.ceil(shapes / MAX_MOVING));
  // Waves and panels draw a fill and its line as a pair: they move together.
  const pair = pattern === "waves" || pattern === "panels" ? 2 : 1;
  let i = -1;
  return body.replace(/<(circle|ellipse|rect|path|line|polygon|polyline)\b([^>]*)\/>/g, (all, tag: string, attrs: string) => {
    i++;
    if (i % every) return all;
    const id = Math.floor(i / pair);
    const dur = seconds * (0.7 + jitter(id, 1) * 0.8);
    const begin = `-${(jitter(id, 2) * dur).toFixed(2)}s`;
    const timing = `dur='${dur.toFixed(2)}s' begin='${begin}' repeatCount='indefinite'`;
    let anim: string;
    if (mode === "pulse" || tiled || TWINKLE.has(pattern)) {
      const low = mode === "pulse" ? 0.25 : TWINKLE.has(pattern) ? 0.35 : 0.45;
      anim = `<animate attributeName='opacity' values='1;${low};1' ${timing} calcMode='spline' keyTimes='0;0.5;1' keySplines='0.4 0 0.6 1;0.4 0 0.6 1'/>`;
    } else if ((pattern === "ripples" || pattern === "shockwave") && tag === "circle") {
      // Each ring grows by one step and gives way to the next, so the rings keep spreading.
      const rad = Number(/\br='([\d.]+)'/.exec(attrs)?.[1] ?? 0);
      anim = `<animate attributeName='r' from='${rad}' to='${(rad + 44 * sc).toFixed(1)}' dur='${(seconds * 0.6).toFixed(2)}s' repeatCount='indefinite'/>`;
    } else {
      const reach = Math.max(w, h) * (0.008 + jitter(id, 3) * 0.012);
      const ang = jitter(id, 4) * Math.PI * 2;
      const [x, y] = [Math.cos(ang) * reach, Math.sin(ang) * reach].map((v) => v.toFixed(1));
      anim = `<animateTransform attributeName='transform' type='translate' additive='sum' values='0 0;${x} ${y};0 0' ${timing} calcMode='spline' keyTimes='0;0.5;1' keySplines='0.4 0 0.6 1;0.4 0 0.6 1'/>`;
    }
    return `<${tag}${attrs}>${anim}</${tag}>`;
  });
}

/** CSS background layers for a theme's backdrop, ready for `background-image` and friends. */
export type BackdropLayers = { image: string; size: string; position: string; repeat: string };

/**
 * The page backdrop as CSS background layers: the pattern (an inline SVG or a
 * gradient, drawn in the theme's colours at the chosen strength and size)
 * over the base. Abstract and static; applyTheme sets it on the page.
 */
export function backdropCss(input: Theme): BackdropLayers {
  const theme = fullTheme(input);
  const raw = themeHex(input);
  const b = theme.backdrop;
  // Saturation recolours the brand colours the backdrop draws with; text and page colours stay.
  const sv = Math.max(0, Math.min(1.6, b.saturation!));
  const satd = (hex: string) => { const [h, s, l] = rgbToHsl(hexToRgb(hex)); return rgbToHex(hslToRgb([h, Math.max(0, Math.min(1, s * sv)), l])); };
  const c: Record<string, string> = sv === 1 ? raw : { ...raw, accent: satd(raw.accent!), highlight: satd(raw.highlight!), support: satd(raw.support!) };
  const bk = Math.max(0, Math.min(1, b.intensity!)) * 2;   // 0–2, 1 at the default: the base
  const k = bk * Math.max(0.3, Math.min(2, b.contrast!));   // the pattern
  const sc = Math.max(0.5, Math.min(2, b.scale!));
  const rgba = (hex: string, a: number) => { const [r, g, bl] = hexToRgb(hex); return `rgb(${r} ${g} ${bl} / ${Math.max(0, Math.min(1, a)).toFixed(3)})`; };
  const motion = BACKDROP_MOTIONS.find((m) => m.key === b.motion && !m.layer && m.seconds);
  // Reduced motion: draw the still pattern (an SVG's own animation doesn't see the page's media queries).
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const svg = (body: string, w: number, h: number, ar = "xMidYMid slice") =>
    `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' width='${w}' height='${h}' preserveAspectRatio='${ar}'>${
      motion && !still ? animatePattern(body, b.pattern!, motion.key, motion.seconds / Math.max(0.5, Math.min(2, b.speed!)), w, h, ar === "none", sc) : body}</svg>`)}")`;
  const n = (v: number) => Math.round(v * 10) / 10;
  const layers: BackdropLayers[] = [];
  const add = (image: string, size = "auto", position = "0 0", repeat = "no-repeat") => layers.push({ image, size, position, repeat });
  // Corner art (a moon, a web, a sun) at a fixed size, so it shows whole on a phone and in a small tile alike.
  const corner = (body: string, w: number, h: number, where: string, share: number, px: number) =>
    add(svg(body, w, h, "xMidYMid meet"), `min(${share}%, ${n(px * sc)}px) auto`, where);
  // For patterns that move their own way when alive: a breath (one value to another and back),
  // a slow turn, a wander (out and back). Each goes inside an open-and-closed element.
  const live = !!motion && motion.key === "alive" && !still;
  const beat = (motion?.seconds ?? 10) / Math.max(0.5, Math.min(2, b.speed!));
  const ease = "calcMode='spline' keyTimes='0;0.5;1' keySplines='0.4 0 0.6 1;0.4 0 0.6 1'";
  const breathe = (attr: string, from: number | string, to: number | string, secs: number, lag = 0) =>
    live ? `<animate attributeName='${attr}' values='${from};${to};${from}' dur='${n(secs)}s' begin='-${n(lag)}s' repeatCount='indefinite' ${ease}/>` : "";
  const turn = (cx: number, cy: number, secs: number, dir = 1) =>
    live ? `<animateTransform attributeName='transform' type='rotate' from='0 ${n(cx)} ${n(cy)}' to='${360 * dir} ${n(cx)} ${n(cy)}' dur='${n(secs)}s' repeatCount='indefinite'/>` : "";
  const move = (kind: string, from: string, to: string, secs: number, lag = 0) =>
    live ? `<animateTransform attributeName='transform' type='${kind}' additive='sum' values='${from};${to};${from}' dur='${n(secs)}s' begin='-${n(lag)}s' repeatCount='indefinite' ${ease}/>` : "";
  const wander = (dx: number, dy: number, secs: number, lag = 0) => move("translate", "0 0", `${n(dx)} ${n(dy)}`, secs, lag);
  const flicker = (sx: number, sy: number, secs: number, lag = 0) => move("scale", "1 1", `${sx} ${sy}`, secs, lag);
  const swing = (deg: number, cx: number, cy: number, secs: number, lag = 0) => move("rotate", `0 ${cx} ${cy}`, `${deg} ${cx} ${cy}`, secs, lag);
  // A soft glow of one colour (a radial gradient) for clouds, halos and coronas.
  const glow = (id: string, col: string, o: number, inner = 0) =>
    `<radialGradient id='${id}'>${inner ? `<stop offset='${inner}' stop-color='${col}' stop-opacity='0'/>` : ""}<stop offset='${n(inner + (1 - inner) * 0.15)}' stop-color='${col}' stop-opacity='${Math.min(1, o * k).toFixed(3)}'/><stop offset='1' stop-color='${col}' stop-opacity='0'/></radialGradient>`;
  const op = (o: number) => Math.min(1, o * k).toFixed(3);

  switch (b.pattern) {
    case "ripples": {
      let body = "";
      for (const [cx, cy, col] of [[860, 140, c.accent!], [140, 900, c.support!]] as const) {
        const step = 44 * sc;
        for (let i = 1; i * step < 1500; i++) {
          body += `<circle cx='${cx}' cy='${cy}' r='${n(i * step)}' fill='none' stroke='${col}' stroke-width='1.5' stroke-opacity='${(0.16 * k * Math.max(0.15, 1 - (i * step) / 1500)).toFixed(3)}'/>`;
        }
      }
      add(svg(body, 1000, 1000), "cover", "center");
      break;
    }
    case "waves": {
      let body = "";
      const cols = [c.support!, c.highlight!, c.accent!];
      cols.forEach((col, j) => {
        const base = 900 - (70 + j * 85) * sc, amp = 34 * sc, len = 420 * sc, phase = j * 140;
        let d = `M0 ${n(base)}`;
        for (let x = 0; x <= 1600; x += 20) d += ` L${x} ${n(base + amp * Math.sin(((x + phase) / len) * Math.PI * 2))}`;
        body += `<path d='${d} L1600 900 L0 900 Z' fill='${col}' fill-opacity='${(0.06 * k).toFixed(3)}'/>`;
        body += `<path d='${d}' fill='none' stroke='${col}' stroke-width='2' stroke-opacity='${(0.22 * k).toFixed(3)}'/>`;
      });
      add(svg(body, 1600, 900, "xMidYMax slice"), "cover", "bottom");
      break;
    }
    case "contours": {
      let body = "";
      const [cx, cy] = [300, 330];
      for (let i = 0; i < 22; i++) {
        const R = (36 + i * 42) * sc;
        let d = "";
        for (let a = 0; a <= 360; a += 6) {
          const t = (a * Math.PI) / 180;
          const rr = R * (1 + 0.09 * Math.sin(3 * t + i * 0.45) + 0.05 * Math.sin(5 * t - i * 0.8));
          d += `${a ? "L" : "M"}${n(cx + rr * Math.cos(t))} ${n(cy + rr * Math.sin(t))}`;
        }
        body += `<path d='${d}Z' fill='none' stroke='${i % 4 === 0 ? c.accent! : c.support!}' stroke-width='${i % 4 === 0 ? 1.6 : 1}' stroke-opacity='${(0.2 * k).toFixed(3)}'/>`;
      }
      add(svg(body, 1000, 1000), "cover", "center");
      break;
    }
    case "geometry": {
      const w = 60, h = n(w * 0.866);
      const body = `<path d='M0 ${h} L${w / 2} 0 L${w} ${h} M0 ${h} H${w} M${w / 2} 0 H${w * 1.5}' fill='none' stroke='${c["text-subtle"]!}' stroke-opacity='${(0.18 * k).toFixed(3)}'/>`
        + `<path d='M0 ${h} L${w / 2} 0 L${w} ${h}Z' fill='${c.accent!}' fill-opacity='${(0.05 * k).toFixed(3)}'/>`;
      add(svg(body, w, h, "none"), `${n(w * sc)}px ${n(h * sc)}px`, "0 0", "repeat");
      break;
    }
    case "burst": {
      const ray = 2.2 * sc, gap = 9 * sc;
      add(`radial-gradient(circle at 50% -6%, transparent 0, transparent 18%, ${c.bg!} 78%)`, "100% 100%");
      add(`repeating-conic-gradient(from -90deg at 50% -6%, ${rgba(c.accent!, 0.14 * k)} 0deg ${n(ray)}deg, transparent ${n(ray)}deg ${n(gap)}deg)`, "100% 100%");
      break;
    }
    case "dots": {
      const body = `<circle cx='11' cy='11' r='1.4' fill='${c.text!}' fill-opacity='${(0.16 * k).toFixed(3)}'/>`;
      add(svg(body, 22, 22, "none"), `${n(22 * sc)}px ${n(22 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "arrows": {
      const body = `<path d='M10 26 L24 12 L38 26' fill='none' stroke='${c.accent!}' stroke-width='3' stroke-linecap='round' stroke-linejoin='round' stroke-opacity='${(0.16 * k).toFixed(3)}'/>`
        + `<path d='M34 58 L48 44 L62 58' fill='none' stroke='${c.highlight!}' stroke-width='3' stroke-linecap='round' stroke-linejoin='round' stroke-opacity='${(0.12 * k).toFixed(3)}'/>`;
      add(svg(body, 72, 72, "none"), `${n(72 * sc)}px ${n(72 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "shapes": {
      const so = (0.24 * k).toFixed(3), fo = (0.1 * k).toFixed(3);
      const body = `<circle cx='40' cy='44' r='16' fill='none' stroke='${c.accent!}' stroke-width='3' stroke-opacity='${so}'/>`
        + `<circle cx='196' cy='196' r='7' fill='${c.highlight!}' fill-opacity='${fo}'/>`
        + `<path d='M150 30 L172 68 H128 Z' fill='none' stroke='${c.support!}' stroke-width='3' stroke-linejoin='round' stroke-opacity='${so}'/>`
        + `<rect x='60' y='170' width='26' height='26' rx='3' transform='rotate(18 73 183)' fill='none' stroke='${c.highlight!}' stroke-width='3' stroke-opacity='${so}'/>`
        + `<path d='M212 110 v20 M202 120 h20' stroke='${c.accent!}' stroke-width='3' stroke-linecap='round' stroke-opacity='${so}'/>`
        + `<path d='M20 120 q12 -14 24 0 t24 0 t24 0' fill='none' stroke='${c.support!}' stroke-width='3' stroke-linecap='round' stroke-opacity='${so}'/>`
        + `<circle cx='120' cy='126' r='4' fill='${c.accent!}' fill-opacity='${fo}'/>`;
      add(svg(body, 240, 240, "none"), `${n(240 * sc)}px ${n(240 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "blobs": {
      const blob = (cx: number, cy: number, r: number, col: string, o: number) => {
        const pts = [1, 0.82, 1.12, 0.9, 1.05, 0.86].map((m, i) => { const a = (i / 6) * Math.PI * 2; return [cx + Math.cos(a) * r * m, cy + Math.sin(a) * r * m]; });
        let d = `M${n((pts[0]![0]! + pts[5]![0]!) / 2)} ${n((pts[0]![1]! + pts[5]![1]!) / 2)}`;
        pts.forEach((p, i) => { const q = pts[(i + 1) % 6]!; d += ` Q${n(p[0]!)} ${n(p[1]!)} ${n((p[0]! + q[0]!) / 2)} ${n((p[1]! + q[1]!) / 2)}`; });
        return `<path d='${d}Z' fill='${col}' fill-opacity='${(o * k).toFixed(3)}'/>`;
      };
      add(svg(blob(820, 160, 260 * sc, c.accent!, 0.09) + blob(150, 640, 300 * sc, c.support!, 0.08) + blob(900, 860, 200 * sc, c.highlight!, 0.08), 1000, 1000), "cover", "center");
      break;
    }
    case "flow": {
      let body = "";
      const cols = [c.accent!, c.support!, c.highlight!];
      for (let i = 0; i < 14; i++) {
        const y = 80 + i * 56 * sc, a = 60 + i * 6;
        body += `<path d='M-50 ${n(y)} C 400 ${n(y - a)}, 700 ${n(y + a * 1.6)}, 1650 ${n(y - a * 0.6)}' fill='none' stroke='${cols[i % 3]}' stroke-width='1.6' stroke-opacity='${(0.16 * k).toFixed(3)}'/>`;
      }
      add(svg(body, 1600, 900), "cover", "center");
      break;
    }
    case "confetti": {
      const so = (0.3 * k).toFixed(3);
      const bits: [number, number, number, string][] = [[20, 30, 20, c.accent!], [96, 18, -35, c.highlight!], [150, 70, 60, c.support!], [52, 110, -10, c.highlight!], [130, 140, 30, c.accent!], [10, 160, 75, c.support!], [88, 70, -60, c.accent!]];
      const body = bits.map(([x, y, r, col]) => `<rect x='${x}' y='${y}' width='14' height='4' rx='2' transform='rotate(${r} ${x + 7} ${y + 2})' fill='${col}' fill-opacity='${so}'/>`).join("");
      add(svg(body, 180, 180, "none"), `${n(180 * sc)}px ${n(180 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "hexagons": {
      const body = `<path d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100' fill='none' stroke='${c.accent!}' stroke-width='1.2' stroke-opacity='${(0.2 * k).toFixed(3)}'/>`;
      add(svg(body, 56, 100, "none"), `${n(56 * sc)}px ${n(100 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "diamonds": {
      const body = `<path d='M20 0L40 20L20 40L0 20Z' fill='${c.accent!}' fill-opacity='${(0.05 * k).toFixed(3)}' stroke='${c.support!}' stroke-opacity='${(0.18 * k).toFixed(3)}'/>`
        + `<path d='M40 20L60 40L40 60L20 40Z' fill='${c.highlight!}' fill-opacity='${(0.03 * k).toFixed(3)}'/>`;
      add(svg(body, 40, 40, "none"), `${n(40 * sc)}px ${n(40 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "grid": {
      let body = "";
      for (let i = 0; i < 4; i++) {
        const o = (i === 0 ? 0.2 : 0.08) * k, v = i * 24;
        body += `<path d='M${v} 0V96M0 ${v}H96' stroke='${i === 0 ? c.accent! : c.text!}' stroke-opacity='${o.toFixed(3)}' stroke-width='${i === 0 ? 1.2 : 0.8}'/>`;
      }
      add(svg(body, 96, 96, "none"), `${n(96 * sc)}px ${n(96 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "halftone": {
      const step = 16 * sc;
      add(`linear-gradient(35deg, transparent 0%, ${c.bg!} 70%)`, "100% 100%");
      add(`radial-gradient(circle, ${rgba(c.highlight!, 0.32 * k)} ${n(3.2 * sc)}px, transparent ${n(3.6 * sc)}px)`, `${n(step)}px ${n(step)}px`, "0 0", "repeat");
      break;
    }
    case "stripes": {
      const cols = [c.accent!, c.highlight!, c.support!];
      const body = cols.map((col, i) => {
        const r = (560 + i * 70) * sc;
        return `<path d='M1600 ${n(900 - r)} A ${n(r)} ${n(r)} 0 0 0 ${n(1600 - r)} 900' fill='none' stroke='${col}' stroke-width='${n(54 * sc)}' stroke-opacity='${(0.22 * k).toFixed(3)}'/>`;
      }).join("");
      add(svg(body, 1600, 900, "xMaxYMax slice"), "cover", "right bottom");
      break;
    }
    case "sunburst": {
      const ray = 7 * sc;
      add(`radial-gradient(circle at 50% 108%, transparent 0, transparent 22%, ${c.bg!} 92%)`, "100% 100%");
      add(`repeating-conic-gradient(from -90deg at 50% 108%, ${rgba(c.highlight!, 0.16 * k)} 0deg ${n(ray)}deg, ${rgba(c.accent!, 0.05 * k)} ${n(ray)}deg ${n(ray * 2)}deg)`, "100% 100%");
      break;
    }
    case "deco": {
      const so = (0.22 * k).toFixed(3);
      const arcs = (x: number, y: number) => [30, 20, 10].map((r) => `<path d='M${x - r} ${y} A${r} ${r} 0 0 1 ${x + r} ${y}' fill='none' stroke='${r === 30 ? c.accent! : c.support!}' stroke-width='1.4' stroke-opacity='${so}'/>`).join("");
      add(svg(arcs(30, 30) + arcs(0, 60) + arcs(60, 60), 60, 60, "none"), `${n(60 * sc)}px ${n(60 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "grain":
    case "paper": {
      const [r, g, bl] = hexToRgb(c.text!).map((v) => (v / 255).toFixed(3));
      const fine = b.pattern === "grain";
      const noise = (alpha: number, size: number, seed: number) => {
        const body = `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${fine ? 0.85 : 0.035}' numOctaves='${fine ? 2 : 4}' seed='${seed}' stitchTiles='stitch'/>`
          + `<feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${bl} 0 0 0 ${alpha.toFixed(3)} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/>`;
        add(svg(body, size, size, "none"), `${n(size * sc)}px ${n(size * sc)}px`, "0 0", "repeat");
      };
      // Grain is fine enough that its tile never shows. Paper's mottles are big, so one tile
      // repeats as a visible grid: two seeds at sizes that don't line up only meet again far apart.
      if (fine) noise(0.22 * k, 180, 0);
      else { noise(0.09 * k, 1100, 3); noise(0.08 * k, 737, 11); }
      break;
    }
    case "linen": {
      const gap = n(4 * sc);
      add(`repeating-linear-gradient(0deg, ${rgba(c.text!, 0.05 * k)} 0 1px, transparent 1px ${gap}px)`, "100% 100%");
      add(`repeating-linear-gradient(90deg, ${rgba(c.text!, 0.04 * k)} 0 1px, transparent 1px ${gap}px)`, "100% 100%");
      break;
    }
    // ── Abstract ─────────────────────────────────────────────────────────
    case "swirl": {
      let d = "";
      for (let t = 0; t < 7 * Math.PI * 2; t += 0.12) {
        const r = 14 * sc * t;
        d += `${t ? "L" : "M"}${n(120 + r * Math.cos(t))} ${n(120 + r * Math.sin(t))}`;
      }
      add(svg(`<path d='${d}' fill='none' stroke='${c.accent!}' stroke-width='1.6' stroke-opacity='${(0.18 * k).toFixed(3)}'/>`, 1000, 1000), "cover", "center");
      break;
    }
    case "ribbons": {
      const cols = [c.accent!, c.support!, c.highlight!];
      const body = cols.map((col, i) => {
        const y = (260 + i * 210) * 1, w = 70 * sc;
        return `<path d='M-100 ${y + 180} C 400 ${y - 120}, 1100 ${y + 260}, 1700 ${y - 60}' fill='none' stroke='${col}' stroke-width='${n(w)}' stroke-linecap='round' stroke-opacity='${(0.08 * k).toFixed(3)}'/>`;
      }).join("");
      add(svg(body, 1600, 900), "cover", "center");
      break;
    }
    case "panels": {
      // Tall slanted panels fanned along the right, each a soft fill with a bright leading edge.
      const cols = [c.accent!, c.support!, c.highlight!];
      let body = "";
      for (let i = 0; i < 5; i++) {
        const x = 700 + i * 170 * sc, w = 120 * sc, lean = 160, col = cols[i % 3]!;
        body += `<path d='M${n(x)} -20 L${n(x + w)} -20 L${n(x + w - lean)} 920 L${n(x - lean)} 920 Z' fill='${col}' fill-opacity='${(0.06 * k).toFixed(3)}'/>`;
        body += `<path d='M${n(x)} -20 L${n(x - lean)} 920' stroke='${col}' stroke-width='2' stroke-opacity='${(0.2 * k).toFixed(3)}'/>`;
      }
      add(svg(body, 1600, 900, "xMaxYMid slice"), "cover", "right center");
      break;
    }
    case "scribble": {
      const so = (0.2 * k).toFixed(3);
      const body = `<path d='M20 60 c20 -40 50 -40 40 0 s-40 30 -10 40 s50 -50 80 -20 s10 50 40 30' fill='none' stroke='${c.accent!}' stroke-width='2' stroke-linecap='round' stroke-opacity='${so}'/>`
        + `<path d='M150 170 c-20 -30 20 -50 30 -20 s-30 40 0 50 s40 -20 30 -50' fill='none' stroke='${c.support!}' stroke-width='2' stroke-linecap='round' stroke-opacity='${so}'/>`;
      add(svg(body, 240, 240, "none"), `${n(240 * sc)}px ${n(240 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "rain": {
      const so = (0.18 * k).toFixed(3);
      const drops: [number, number, string][] = [[10, 10, c.accent!], [50, 34, c.support!], [28, 62, c.accent!], [70, 80, c.highlight!], [6, 90, c.support!]];
      const body = drops.map(([x, y, col]) => `<path d='M${x} ${y} l6 14' stroke='${col}' stroke-width='1.6' stroke-linecap='round' stroke-opacity='${so}'/>`).join("");
      add(svg(body, 90, 110, "none"), `${n(90 * sc)}px ${n(110 * sc)}px`, "0 0", "repeat");
      break;
    }
    // ── Geo ──────────────────────────────────────────────────────────────
    case "squares": {
      const body = [36, 24, 12].map((h, i) => `<rect x='${40 - h}' y='${40 - h}' width='${h * 2}' height='${h * 2}' fill='none' stroke='${i === 0 ? c.accent! : c.support!}' stroke-width='1.2' stroke-opacity='${(0.16 * k).toFixed(3)}'/>`).join("");
      add(svg(body, 80, 80, "none"), `${n(80 * sc)}px ${n(80 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "zigzag": {
      const body = `<path d='M0 12 L10 2 L20 12 L30 2 L40 12' fill='none' stroke='${c.accent!}' stroke-width='1.6' stroke-linejoin='round' stroke-opacity='${(0.18 * k).toFixed(3)}'/>`
        + `<path d='M0 32 L10 22 L20 32 L30 22 L40 32' fill='none' stroke='${c.support!}' stroke-width='1.6' stroke-linejoin='round' stroke-opacity='${(0.12 * k).toFixed(3)}'/>`;
      add(svg(body, 40, 40, "none"), `${n(40 * sc)}px ${n(40 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "rings": {
      const body = `<circle cx='20' cy='20' r='8' fill='none' stroke='${c.accent!}' stroke-width='1.4' stroke-opacity='${(0.18 * k).toFixed(3)}'/>`
        + `<circle cx='0' cy='0' r='3' fill='${c.support!}' fill-opacity='${(0.12 * k).toFixed(3)}'/><circle cx='40' cy='40' r='3' fill='${c.support!}' fill-opacity='${(0.12 * k).toFixed(3)}'/>`;
      add(svg(body, 40, 40, "none"), `${n(40 * sc)}px ${n(40 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "crosses": {
      const body = `<path d='M16 10 v12 M10 16 h12' stroke='${c.accent!}' stroke-width='2' stroke-linecap='round' stroke-opacity='${(0.18 * k).toFixed(3)}'/>`
        + `<path d='M48 42 v12 M42 48 h12' stroke='${c.support!}' stroke-width='2' stroke-linecap='round' stroke-opacity='${(0.14 * k).toFixed(3)}'/>`;
      add(svg(body, 64, 64, "none"), `${n(64 * sc)}px ${n(64 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "scales": {
      const so = (0.18 * k).toFixed(3);
      const arc = (x: number, y: number) => `<path d='M${x - 20} ${y} A20 20 0 0 0 ${x + 20} ${y}' fill='none' stroke='${c.accent!}' stroke-width='1.3' stroke-opacity='${so}'/>`;
      add(svg(arc(20, 0) + arc(0, 20) + arc(40, 20) + arc(20, 40), 40, 40, "none"), `${n(40 * sc)}px ${n(40 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "cubes": {
      const h = 30, w = n(h * 1.732);
      const body = `<path d='M0 ${h / 2} L${w / 2} 0 L${w} ${h / 2} L${w / 2} ${h} Z' fill='${c.accent!}' fill-opacity='${(0.06 * k).toFixed(3)}'/>`
        + `<path d='M0 ${h / 2} V${h * 1.5} L${w / 2} ${h * 2} V${h} Z' fill='${c.support!}' fill-opacity='${(0.04 * k).toFixed(3)}'/>`
        + `<path d='M0 ${h / 2} L${w / 2} 0 L${w} ${h / 2} L${w / 2} ${h} Z M${w / 2} ${h} V${h * 2} M0 ${h / 2} V${h * 1.5} M${w} ${h / 2} V${h * 1.5}' fill='none' stroke='${c["text-subtle"]!}' stroke-opacity='${(0.14 * k).toFixed(3)}'/>`;
      add(svg(body, w, h * 2, "none"), `${n(w * sc)}px ${n(h * 2 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "checks": {
      const body = `<rect width='20' height='20' fill='${c.accent!}' fill-opacity='${(0.05 * k).toFixed(3)}'/><rect x='20' y='20' width='20' height='20' fill='${c.accent!}' fill-opacity='${(0.05 * k).toFixed(3)}'/>`;
      add(svg(body, 40, 40, "none"), `${n(40 * sc)}px ${n(40 * sc)}px`, "0 0", "repeat");
      break;
    }
    // ── Vintage ──────────────────────────────────────────────────────────
    case "pinstripe": {
      const gap = n(14 * sc);
      add(`repeating-linear-gradient(90deg, ${rgba(c.accent!, 0.12 * k)} 0 1px, transparent 1px ${gap}px)`, "100% 100%");
      break;
    }
    case "gingham": {
      const w = n(16 * sc);
      add(`repeating-linear-gradient(0deg, ${rgba(c.accent!, 0.06 * k)} 0 ${w}px, transparent ${w}px ${n(w * 2)}px)`, "100% 100%");
      add(`repeating-linear-gradient(90deg, ${rgba(c.accent!, 0.06 * k)} 0 ${w}px, transparent ${w}px ${n(w * 2)}px)`, "100% 100%");
      break;
    }
    case "polka": {
      const body = `<circle cx='15' cy='15' r='6' fill='${c.highlight!}' fill-opacity='${(0.12 * k).toFixed(3)}'/><circle cx='45' cy='45' r='6' fill='${c.accent!}' fill-opacity='${(0.12 * k).toFixed(3)}'/>`;
      add(svg(body, 60, 60, "none"), `${n(60 * sc)}px ${n(60 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "plaid": {
      const s1 = n(80 * sc);
      for (const deg of [0, 90]) {
        add(`repeating-linear-gradient(${deg}deg, ${rgba(c.accent!, 0.07 * k)} 0 ${n(18 * sc)}px, transparent ${n(18 * sc)}px ${n(30 * sc)}px, ${rgba(c.support!, 0.06 * k)} ${n(30 * sc)}px ${n(34 * sc)}px, transparent ${n(34 * sc)}px ${s1}px)`, "100% 100%");
      }
      break;
    }
    case "argyle": {
      const body = `<path d='M30 0 L60 40 L30 80 L0 40 Z' fill='${c.accent!}' fill-opacity='${(0.06 * k).toFixed(3)}'/>`
        + `<path d='M0 0 L60 80 M60 0 L0 80' stroke='${c.highlight!}' stroke-width='1' stroke-dasharray='4 4' stroke-opacity='${(0.16 * k).toFixed(3)}'/>`;
      add(svg(body, 60, 80, "none"), `${n(60 * sc)}px ${n(80 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "racing": {
      const cols = [c.accent!, c.highlight!, c.support!];
      const body = cols.map((col, i) => {
        const o = (i * 70 + 120) * sc;
        return `<path d='M${n(1600 - o)} -50 L-50 ${n(1600 - o)}' stroke='${col}' stroke-width='${n(40 * sc)}' stroke-opacity='${(0.12 * k).toFixed(3)}'/>`;
      }).join("");
      add(svg(body, 1600, 900, "xMinYMin slice"), "cover", "left top");
      break;
    }
    case "trellis": {
      const body = `<path d='M0 0 L40 40 M40 0 L0 40' stroke='${c.accent!}' stroke-width='1.2' stroke-opacity='${(0.16 * k).toFixed(3)}'/><circle cx='20' cy='20' r='2.4' fill='${c.highlight!}' fill-opacity='${(0.2 * k).toFixed(3)}'/>`;
      add(svg(body, 40, 40, "none"), `${n(40 * sc)}px ${n(40 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "bauhaus": {
      const fo = (0.08 * k).toFixed(3);
      const body = `<path d='M0 0 H60 A60 60 0 0 1 0 60 Z' fill='${c.accent!}' fill-opacity='${fo}'/>`
        + `<rect x='60' y='60' width='60' height='60' fill='${c.support!}' fill-opacity='${fo}'/>`
        + `<path d='M120 120 V60 A60 60 0 0 0 60 120 Z' fill='${c.highlight!}' fill-opacity='${fo}'/>`;
      add(svg(body, 120, 120, "none"), `${n(120 * sc)}px ${n(120 * sc)}px`, "0 0", "repeat");
      break;
    }
    // ── Texture ──────────────────────────────────────────────────────────
    case "concrete":
    case "brushed":
    case "sand": {
      const [r, g, bl] = hexToRgb(c.text!).map((v) => (v / 255).toFixed(3));
      const set = { concrete: ["0.012", 5, 0.16, 520], brushed: ["0.008 0.9", 2, 0.12, 300], sand: ["0.55", 3, 0.26, 200] }[b.pattern] as [string, number, number, number];
      const body = `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${set[0]}' numOctaves='${set[1]}' stitchTiles='stitch'/>`
        + `<feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${bl} 0 0 0 ${(set[2] * k).toFixed(3)} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/>`;
      add(svg(body, set[3], set[3], "none"), `${n(set[3] * sc)}px ${n(set[3] * sc)}px`, "0 0", "repeat");
      break;
    }
    case "speckle": {
      let body = "", seed = 7;
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      for (let i = 0; i < 40; i++) {
        const col = [c.text!, c.accent!, c.support!][i % 3]!;
        body += `<circle cx='${n(rnd() * 120)}' cy='${n(rnd() * 120)}' r='${n(0.6 + rnd() * 1.1)}' fill='${col}' fill-opacity='${(0.18 * k).toFixed(3)}'/>`;
      }
      add(svg(body, 120, 120, "none"), `${n(120 * sc)}px ${n(120 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "crosshatch": {
      const gap = n(9 * sc);
      add(`repeating-linear-gradient(45deg, ${rgba(c.text!, 0.06 * k)} 0 1px, transparent 1px ${gap}px)`, "100% 100%");
      add(`repeating-linear-gradient(-45deg, ${rgba(c.text!, 0.05 * k)} 0 1px, transparent 1px ${gap}px)`, "100% 100%");
      break;
    }
    case "twill": {
      const gap = n(5 * sc);
      add(`repeating-linear-gradient(60deg, ${rgba(c.support!, 0.1 * k)} 0 1.5px, transparent 1.5px ${gap}px)`, "100% 100%");
      break;
    }
    case "carbon": {
      const so = (0.08 * k).toFixed(3);
      const body = `<rect width='4' height='4' fill='${c.text!}' fill-opacity='${so}'/><rect x='4' y='4' width='4' height='4' fill='${c.text!}' fill-opacity='${so}'/>`;
      add(svg(body, 8, 8, "none"), `${n(8 * sc)}px ${n(8 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "ribbed": {
      const gap = n(6 * sc);
      add(`repeating-linear-gradient(0deg, ${rgba(c.text!, 0.07 * k)} 0 1px, transparent 1px ${n(gap / 2)}px, ${rgba(c.bg!, 0.15 * k)} ${n(gap / 2)}px ${gap}px)`, "100% 100%");
      break;
    }
    // ── Ruin ─────────────────────────────────────────────────────────────
    case "embers": {
      let body = "";
      for (let i = 0; i < 18; i++) {
        const col = [c.highlight!, c.accent!, c.support!][i % 3]!;
        body += `<circle cx='${n(jitter(i, 11) * 160)}' cy='${n(jitter(i, 12) * 200)}' r='${n(0.8 + jitter(i, 13) * 1.8)}' fill='${col}' fill-opacity='${((0.16 + jitter(i, 14) * 0.2) * k).toFixed(3)}'/>`;
      }
      add(svg(body, 160, 200, "none"), `${n(160 * sc)}px ${n(200 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "ash": {
      let body = "";
      for (let i = 0; i < 14; i++) {
        const x = n(jitter(i, 21) * 180), y = n(jitter(i, 22) * 180), r = n(1.2 + jitter(i, 23) * 2.2);
        body += `<ellipse cx='${x}' cy='${y}' rx='${r}' ry='${n(r * 0.55)}' transform='rotate(${Math.round(jitter(i, 24) * 180)} ${x} ${y})' fill='${i % 4 ? c.text! : c.support!}' fill-opacity='${(0.12 * k).toFixed(3)}'/>`;
      }
      add(svg(body, 180, 180, "none"), `${n(180 * sc)}px ${n(180 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "cracks": {
      // Jagged fractures branching out from three points of impact.
      let body = "";
      const crack = (x: number, y: number, ang: number, len: number, depth: number, col: string, salt: number) => {
        let d = `M${n(x)} ${n(y)}`;
        const steps = 6;
        for (let s2 = 1; s2 <= steps; s2++) {
          ang += (jitter(salt + s2, 31) - 0.5) * 0.9;
          x += Math.cos(ang) * (len / steps); y += Math.sin(ang) * (len / steps);
          d += ` L${n(x)} ${n(y)}`;
          if (depth > 0 && jitter(salt + s2, 32) > 0.72) crack(x, y, ang + (jitter(salt + s2, 33) > 0.5 ? 0.8 : -0.8), len * 0.5, depth - 1, col, salt * 7 + s2);
        }
        body += `<path d='${d}' fill='none' stroke='${col}' stroke-width='${depth + 0.8}' stroke-linejoin='bevel' stroke-opacity='${((0.1 + depth * 0.05) * k).toFixed(3)}'/>`;
      };
      ([[1250, 160, c.accent!], [220, 760, c.support!], [900, 980, c.highlight!]] as const).forEach(([cx, cy, col], j) => {
        for (let a = 0; a < 7; a++) crack(cx, cy, (a / 7) * Math.PI * 2 + j, 380 * sc, 2, col, j * 100 + a * 10 + 1);
      });
      add(svg(body, 1600, 900), "cover", "center");
      break;
    }
    case "hazard": {
      // A band of caution stripes along the bottom, two colours turn about.
      const band = 70 * sc, top = 900 - band - 40 * sc, w = 40 * sc;
      let body = `<rect x='0' y='${n(top)}' width='1600' height='${n(band)}' fill='${c.highlight!}' fill-opacity='${(0.08 * k).toFixed(3)}'/>`;
      for (let x = -band; x < 1600 + band; x += w * 2) body += `<path d='M${n(x)} ${n(top + band)} L${n(x + band)} ${n(top)} L${n(x + band + w)} ${n(top)} L${n(x + w)} ${n(top + band)} Z' fill='${c.accent!}' fill-opacity='${(0.14 * k).toFixed(3)}'/>`;
      add(svg(body, 1600, 900, "xMidYMax slice"), "cover", "bottom");
      break;
    }
    case "skyline": {
      // Two rows of towers along the bottom, their tops broken off at an angle.
      let body = "";
      ([[c.support!, 0.07, 1.25, 5], [c.accent!, 0.1, 0.8, 9]] as const).forEach(([col, o, tall, salt]) => {
        let d = "M0 900", x = 0, i = 0;
        while (x < 1600) {
          const bw = (50 + jitter(i, salt) * 90) * sc, bh = (90 + jitter(i, salt + 1) * 260) * sc * tall, y = 900 - bh;
          const drop = jitter(i, salt + 2) * 60 * sc, broken = jitter(i, salt + 3) > 0.45;
          d += ` L${n(x)} ${n(y + (broken ? drop : 0))}`;
          if (broken) d += ` L${n(x + bw * 0.35)} ${n(y + drop * 0.3)} L${n(x + bw * 0.5)} ${n(y + drop)} L${n(x + bw * 0.7)} ${n(y)}`;
          d += ` L${n(x + bw)} ${n(y + (broken ? drop * 0.6 : 0))}`;
          x += bw + (jitter(i, salt + 4) > 0.7 ? 14 * sc : 0); i++;
        }
        body += `<path d='${d} L1600 900 Z' fill='${col}' fill-opacity='${(o * k).toFixed(3)}'/>`;
      });
      add(svg(body, 1600, 900, "xMidYMax slice"), "cover", "bottom");
      break;
    }
    case "fallout": {
      // Small trefoil signs, set like a half-drop repeat.
      const tre = (x: number, y: number, r: number, col: string) => {
        let d = "";
        for (const a0 of [90, 210, 330]) {
          const p = (a: number, rr: number) => `${n(x + rr * Math.cos((a * Math.PI) / 180))} ${n(y + rr * Math.sin((a * Math.PI) / 180))}`;
          d += `M${p(a0 - 30, r * 0.36)} L${p(a0 - 30, r)} A${r} ${r} 0 0 1 ${p(a0 + 30, r)} L${p(a0 + 30, r * 0.36)} A${n(r * 0.36)} ${n(r * 0.36)} 0 0 0 ${p(a0 - 30, r * 0.36)}Z`;
        }
        return `<path d='${d}' fill='${col}' fill-opacity='${(0.1 * k).toFixed(3)}'/><circle cx='${x}' cy='${y}' r='${n(r * 0.2)}' fill='${col}' fill-opacity='${(0.1 * k).toFixed(3)}'/>`;
      };
      const body = tre(40, 40, 18, c.accent!) + tre(120, 120, 18, c.highlight!);
      add(svg(body, 160, 160, "none"), `${n(160 * sc)}px ${n(160 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "smog": {
      // Banks of overlapping puffs, thickest along the top and bottom.
      let body = "";
      for (let i = 0; i < 26; i++) {
        const low = i % 2, col = [c.text!, c.support!, c.highlight!][i % 3]!;
        const cx = jitter(i, 41) * 1700 - 50, cy = low ? 820 + jitter(i, 42) * 120 : 40 + jitter(i, 42) * 140;
        const rx = (180 + jitter(i, 43) * 220) * sc;
        body += `<ellipse cx='${n(cx)}' cy='${n(cy)}' rx='${n(rx)}' ry='${n(rx * 0.38)}' fill='${col}' fill-opacity='${(0.035 * k).toFixed(3)}'/>`;
      }
      add(svg(body, 1600, 900), "cover", "center");
      break;
    }
    case "barbed": {
      // Two twisted strands with a four-point barb every so often.
      const so = (0.2 * k).toFixed(3);
      let body = "";
      for (const [y, col] of [[40, c.accent!], [120, c.support!]] as const) {
        body += `<path d='M0 ${y} q15 -5 30 0 t30 0 t30 0 t30 0' fill='none' stroke='${col}' stroke-width='1.4' stroke-opacity='${so}'/>`
          + `<path d='M0 ${y} q15 5 30 0 t30 0 t30 0 t30 0' fill='none' stroke='${col}' stroke-width='1.4' stroke-opacity='${so}'/>`
          + `<path d='M54 ${y - 7} l12 14 M66 ${y - 7} l-12 14' stroke='${col}' stroke-width='1.6' stroke-linecap='round' stroke-opacity='${so}'/>`;
      }
      add(svg(body, 120, 160, "none"), `${n(120 * sc)}px ${n(160 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "static": {
      const [r, g, bl] = hexToRgb(c.text!).map((v) => (v / 255).toFixed(3));
      let body = `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='1' stitchTiles='stitch'/>`
        + `<feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${bl} 0 0 0 ${(0.22 * k).toFixed(3)} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/>`;
      for (let y = 0; y < 160; y += 4) body += `<path d='M0 ${y}H160' stroke='${c.bg!}' stroke-width='1.2' stroke-opacity='${(0.35 * k).toFixed(3)}'/>`;
      add(svg(body, 160, 160, "none"), `${n(160 * sc)}px ${n(160 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "shockwave": {
      // Rings from a blast below the page, broken into uneven arcs.
      let body = "";
      const step = 52 * sc;
      for (let i = 1; i * step < 1500; i++) {
        const dash = `${n(60 + jitter(i, 51) * 180)} ${n(10 + jitter(i, 52) * 50)} ${n(20 + jitter(i, 53) * 80)} ${n(8 + jitter(i, 54) * 30)}`;
        body += `<circle cx='800' cy='1000' r='${n(i * step)}' fill='none' stroke='${[c.accent!, c.highlight!, c.support!][i % 3]}' stroke-width='${i % 3 ? 1.4 : 2.4}' stroke-dasharray='${dash}' stroke-opacity='${(0.18 * k * Math.max(0.2, 1 - (i * step) / 1500)).toFixed(3)}'/>`;
      }
      add(svg(body, 1600, 900, "xMidYMax slice"), "cover", "bottom");
      break;
    }
    // ── Cosmos ───────────────────────────────────────────────────────────
    case "starfield": {
      // Stars of a few sizes, a handful in the theme's colours, a few with four points.
      let body = "";
      for (let i = 0; i < 48; i++) {
        const x = n(10 + jitter(i, 61) * 220), y = n(10 + jitter(i, 62) * 220), big = jitter(i, 63);
        const col = i % 7 === 0 ? c.accent! : i % 7 === 3 ? c.highlight! : i % 11 === 5 ? c.support! : c.text!;
        const o = op(0.14 + jitter(i, 64) * 0.24);
        if (big > 0.93) {
          const r = n(5 + jitter(i, 65) * 4);
          body += `<path d='M${x} ${n(y - r)}Q${x} ${y} ${n(x + r)} ${y}Q${x} ${y} ${x} ${n(y + r)}Q${x} ${y} ${n(x - r)} ${y}Q${x} ${y} ${x} ${n(y - r)}Z' fill='${col}' fill-opacity='${o}'/>`;
        } else body += `<circle cx='${x}' cy='${y}' r='${n(0.5 + big * big * 1.7)}' fill='${col}' fill-opacity='${o}'/>`;
      }
      add(svg(body, 240, 240, "none"), `${n(240 * sc)}px ${n(240 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "nebula": {
      // Clouds of soft colour that slowly swell and settle, with a scatter of stars through them.
      const cols = [c.accent!, c.highlight!, c.support!];
      let body = `<defs>${cols.map((col, j) => glow(`g${j}`, col, 0.15)).join("")}</defs>`;
      for (let i = 0; i < 11; i++) {
        const cx = 500 + jitter(i, 71) * 600 + (i % 3 - 1) * 380, cy = 60 + jitter(i, 72) * 780;
        const rx = (240 + jitter(i, 73) * 300) * sc, ry = rx * (0.45 + jitter(i, 74) * 0.35), secs = beat * (2.4 + jitter(i, 75) * 1.8);
        body += `<ellipse cx='${n(cx)}' cy='${n(cy)}' rx='${n(rx)}' ry='${n(ry)}' transform='rotate(${Math.round(jitter(i, 76) * 180)} ${n(cx)} ${n(cy)})' fill='url(#g${i % 3})'>`
          + breathe("rx", n(rx), n(rx * 1.15), secs, jitter(i, 77) * secs) + breathe("ry", n(ry), n(ry * 1.22), secs * 1.3, jitter(i, 78) * secs) + "</ellipse>";
      }
      for (let i = 0; i < 80; i++) {
        body += `<circle cx='${n(jitter(i, 79) * 1600)}' cy='${n(jitter(i, 80) * 900)}' r='${n(0.6 + jitter(i, 81) * 1.3)}' fill='${c.text!}' fill-opacity='${op(0.1 + jitter(i, 82) * 0.2)}'/>`;
      }
      add(svg(body, 1600, 900), "cover", "center");
      break;
    }
    case "galaxy": {
      // A spiral galaxy seen at a tilt, turning very slowly about its bright core.
      let arms = "";
      for (let a = 0; a < 2; a++) for (let i = 0; i < 95; i++) {
        const t = i / 95, s = i + a * 100, r = (26 + t * 600) * sc, th = a * Math.PI + t * 3.6 + (jitter(s, 83) - 0.5) * 0.5;
        const off = (jitter(s, 84) - 0.5) * (16 + t * 80) * sc;
        const x = Math.cos(th) * r - Math.sin(th) * off, y = Math.sin(th) * r + Math.cos(th) * off;
        const col = t < 0.22 ? c.highlight! : [c.accent!, c.support!, c.text!][i % 3]!;
        arms += `<circle cx='${n(x)}' cy='${n(y)}' r='${n((0.8 + jitter(s, 85) * 2) * (1.3 - t * 0.6))}' fill='${col}' fill-opacity='${op(0.12 + (1 - t) * 0.22)}'/>`;
      }
      const core = 150 * sc;
      const body = `<defs>${glow("core", c.highlight!, 0.3)}</defs><g transform='translate(860 330) rotate(-24) scale(1 0.5)'>`
        + `<circle r='${n(core)}' fill='url(#core)'>${breathe("r", n(core), n(core * 1.2), beat * 3)}</circle>`
        + `<g>${turn(0, 0, beat * 36)}${arms}</g></g>`;
      add(svg(body, 1600, 900), "cover", "center");
      break;
    }
    case "orbits": {
      // Planets on tilted orbits round a sun in the corner, each going round at its own pace.
      const [sx, sy] = [80, 720];
      let paths = "", planets = "";
      for (let i = 0; i < 5; i++) {
        const rx = (150 + i * 120) * sc, ry = rx * 0.42;
        const d = `M${n(sx - rx)} ${sy}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0`;
        paths += `<path d='${d}' fill='none' stroke='${c.text!}' stroke-width='1.2' stroke-opacity='${op(0.1)}'${i % 2 ? " stroke-dasharray='2 7'" : ""}/>`;
        const pr = (5 + jitter(i, 86) * 8) * sc, col = [c.accent!, c.support!, c.highlight!][i % 3]!;
        const period = beat * 5 * Math.pow(i + 1, 1.5), at = jitter(i, 87);
        planets += live
          ? `<circle r='${n(pr)}' fill='${col}' fill-opacity='${op(0.32)}'><animateMotion path='${d}' dur='${n(period)}s' begin='-${n(at * period)}s' repeatCount='indefinite'/></circle>`
          : `<circle cx='${n(sx + Math.cos(at * 6.28) * rx)}' cy='${n(sy + Math.sin(at * 6.28) * ry)}' r='${n(pr)}' fill='${col}' fill-opacity='${op(0.32)}'/>`;
      }
      const sun = 260 * sc;
      const body = `<defs>${glow("sun", c.highlight!, 0.32)}</defs>`
        + `<circle cx='${sx}' cy='${sy}' r='${n(sun)}' fill='url(#sun)'>${breathe("r", n(sun), n(sun * 1.15), beat * 2.6)}</circle>`
        + `<circle cx='${sx}' cy='${sy}' r='${n(44 * sc)}' fill='${c.highlight!}' fill-opacity='${op(0.24)}'/>`
        + `<g transform='rotate(-16 ${sx} ${sy})'>${paths}${planets}</g>`;
      corner(body, 900, 900, "left bottom", 120, 900);
      break;
    }
    case "aurora": {
      // Curtains of light across the top that slowly fold and unfold, over a few stars.
      let defs = "", bands = "";
      [c.accent!, c.highlight!, c.support!].forEach((col, j) => {
        const base = (220 + j * 85) * sc, tall = (200 + j * 40) * sc;
        defs += `<linearGradient id='a${j}' gradientUnits='userSpaceOnUse' x1='0' y1='${n(base - tall)}' x2='0' y2='${n(base + 50 * sc)}'><stop offset='0' stop-color='${col}' stop-opacity='0'/><stop offset='0.82' stop-color='${col}' stop-opacity='${op(0.18)}'/><stop offset='1' stop-color='${col}' stop-opacity='0'/></linearGradient>`;
        // The curtain, its lower edge and the rays rising from it, as a shape at two moments to fold between.
        const shape = (ph: number): [string, string, string] => {
          const lo: string[] = [], hi: string[] = [], rays: string[] = [];
          for (let x = -40; x <= 1640; x += 20) {
            const y = base + (Math.sin(x / 260 + ph + j * 2) * 44 + Math.sin(x / 97 + ph * 1.7) * 12) * sc;
            const up = y - tall * (0.55 + 0.45 * Math.abs(Math.sin(x / 170 + ph * 1.3 + j)));
            lo.push(`${x} ${n(y)}`);
            hi.unshift(`${x} ${n(up)}`);
            if (jitter(x, j + 1) > 0.62) rays.push(`M${x} ${n(y)}V${n(up + (y - up) * (0.1 + 0.6 * jitter(x, j + 5)))}`);
          }
          return [`M${lo.join(" L")} L${hi.join(" L")} Z`, `M${lo.join(" L")}`, rays.join("")];
        };
        const [[f0, e0, r0], [f1, e1, r1]] = [shape(0), shape(1.7)];
        const secs = beat * (2.6 + j * 0.7);
        bands += `<path d='${f0}' fill='url(#a${j})' fill-opacity='0.6'>${breathe("d", f0, f1, secs, j * 3)}</path>`
          + `<path d='${r0}' fill='none' stroke='url(#a${j})' stroke-width='${n(2.5 * sc)}' stroke-opacity='0.3'>${breathe("d", r0, r1, secs, j * 3)}</path>`
          + `<path d='${e0}' fill='none' stroke='${col}' stroke-width='2' stroke-opacity='${op(0.12)}'>${breathe("d", e0, e1, secs, j * 3)}</path>`;
      });
      let stars = "";
      for (let i = 0; i < 50; i++) stars += `<circle cx='${n(jitter(i, 88) * 1600)}' cy='${n(jitter(i, 89) * 900)}' r='${n(0.6 + jitter(i, 90) * 1.1)}' fill='${c.text!}' fill-opacity='${op(0.1 + jitter(i, 91) * 0.16)}'/>`;
      add(svg(`<defs>${defs}</defs>${stars}${bands}`, 1600, 900, "xMidYMin slice"), "cover", "top");
      break;
    }
    case "comets": {
      // Comets crossing on a long diagonal, their tails fading out behind them (travelling when alive).
      let body = "<defs>";
      let shapes = "";
      ([[70, 250, 150, c.accent!], [215, 120, 105, c.highlight!], [250, 270, 50, c.support!]] as const).forEach(([x, y, len, col], j) => {
        const p = Math.SQRT1_2, hr = 3 + len / 40, [tx, ty] = [x + len * p, y - len * p];
        body += `<linearGradient id='c${j}' gradientUnits='userSpaceOnUse' x1='${x}' y1='${y}' x2='${n(tx)}' y2='${n(ty)}'><stop offset='0' stop-color='${col}' stop-opacity='${op(0.3)}'/><stop offset='1' stop-color='${col}' stop-opacity='0'/></linearGradient>`;
        shapes += `<path d='M${n(x + p * hr)} ${n(y + p * hr)}L${n(tx)} ${n(ty)}L${n(x - p * hr)} ${n(y - p * hr)}Z' fill='url(#c${j})'/>`
          + `<circle cx='${x}' cy='${y}' r='${n(hr)}' fill='${col}' fill-opacity='${op(0.34)}'/>`;
      });
      add(svg(`${body}</defs>${shapes}`, 300, 300, "none"), `${n(300 * sc)}px ${n(300 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "constellations": {
      // A few small figures of stars joined by fine lines, among loose stars.
      let lines = "", stars = "";
      ([[95, 110], [300, 230], [130, 330]] as const).forEach(([cx, cy], j) => {
        const pts: [number, number][] = [];
        for (let i = 0; i < 5 + j; i++) {
          const a = (i / (5 + j)) * Math.PI * 1.6 + jitter(i + j * 10, 92) * 0.8, r = 25 + jitter(i + j * 10, 93) * 45;
          pts.push([n(cx + Math.cos(a) * r), n(cy + Math.sin(a) * r * 0.8)]);
        }
        lines += `<path d='M${pts.map((q) => q.join(" ")).join(" L")}' fill='none' stroke='${c.accent!}' stroke-width='0.9' stroke-opacity='${op(0.16)}'/>`;
        pts.forEach(([x, y], i) => { stars += `<circle cx='${x}' cy='${y}' r='${n(1.4 + jitter(i + j * 10, 94) * 1.6)}' fill='${i === 0 ? c.highlight! : c.text!}' fill-opacity='${op(0.3)}'/>`; });
      });
      for (let i = 0; i < 26; i++) stars += `<circle cx='${n(8 + jitter(i, 95) * 404)}' cy='${n(8 + jitter(i, 96) * 404)}' r='${n(0.5 + jitter(i, 97) * 0.9)}' fill='${c.text!}' fill-opacity='${op(0.16)}'/>`;
      add(svg(lines + stars, 420, 420, "none"), `${n(420 * sc)}px ${n(420 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "eclipse": {
      // A dark disc over the sun, its corona slowly breathing and turning.
      const [ex, ey, r] = [300, 300, 100];
      let rays = "";
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2 + jitter(i, 98) * 0.05, len = r * (0.3 + jitter(i, 99) * 1.1);
        rays += `<path d='M${n(ex + Math.cos(a) * r * 1.04)} ${n(ey + Math.sin(a) * r * 1.04)}L${n(ex + Math.cos(a) * (r + len))} ${n(ey + Math.sin(a) * (r + len))}' stroke='${i % 3 ? c.highlight! : c.accent!}' stroke-width='${n(1 + jitter(i, 100) * 1.8)}' stroke-linecap='round' stroke-opacity='${op(0.08 + jitter(i, 101) * 0.16)}'/>`;
      }
      const body = `<defs>${glow("cor", c.highlight!, 0.3, 0.3)}</defs>`
        + `<circle cx='${ex}' cy='${ey}' r='${n(r * 2.7)}' fill='url(#cor)'>${breathe("r", n(r * 2.7), n(r * 2.95), beat * 2.8)}</circle>`
        + `<g>${turn(ex, ey, beat * 60)}${rays}</g>`
        + `<circle cx='${ex}' cy='${ey}' r='${r}' fill='${c.bg!}' fill-opacity='${Math.min(1, 0.6 * k).toFixed(3)}'></circle>`
        + `<circle cx='${n(ex + r * 0.74)}' cy='${n(ey - r * 0.68)}' r='5' fill='${c.highlight!}' fill-opacity='${op(0.4)}'>${breathe("r", 5, 7, beat * 1.4)}</circle>`;
      corner(body, 600, 600, "right top", 85, 640);
      break;
    }
    case "milkyway": {
      // A band of stars across the sky, thick with light and split by a lane of dust.
      const [x0, y0, x1, y1] = [-100, 860, 1700, 60];
      const deg = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI, span = Math.hypot(x1 - x0, y1 - y0), px = -(y1 - y0) / span, py = (x1 - x0) / span;
      let body = `<defs>${glow("m0", c.support!, 0.13)}${glow("m1", c.highlight!, 0.11)}${glow("m2", c.bg!, 0.5)}</defs>`;
      for (let i = 0; i < 7; i++) {
        const t = (i + 0.5) / 7, cx = x0 + t * (x1 - x0), cy = y0 + t * (y1 - y0), rx = (280 + jitter(i, 102) * 120) * sc, ry = (95 + jitter(i, 103) * 50) * sc;
        body += `<ellipse cx='${n(cx)}' cy='${n(cy)}' rx='${n(rx)}' ry='${n(ry)}' transform='rotate(${n(deg)} ${n(cx)} ${n(cy)})' fill='url(#m${i % 2})'>${breathe("ry", n(ry), n(ry * 1.2), beat * (2.5 + i * 0.3), i * 4)}</ellipse>`;
      }
      body += `<ellipse cx='800' cy='460' rx='760' ry='${n(40 * sc)}' transform='rotate(${n(deg)} 800 460)' fill='url(#m2)' fill-opacity='0.5'></ellipse>`;
      for (let i = 0; i < 215; i++) {
        const t = 0.2 + jitter(i, 104) * 0.6, off = (jitter(i, 105) + jitter(i, 106) + jitter(i, 107) - 1.5) * 170 * sc;
        const col = i % 9 === 0 ? c.highlight! : i % 13 === 0 ? c.accent! : c.text!;
        body += `<circle cx='${n(x0 + t * (x1 - x0) + px * off)}' cy='${n(y0 + t * (y1 - y0) + py * off)}' r='${n(0.5 + jitter(i, 108) ** 2 * 1.8)}' fill='${col}' fill-opacity='${op(0.12 + jitter(i, 109) * 0.2)}'/>`;
      }
      add(svg(body, 1600, 900), "cover", "center");
      break;
    }
    case "planetrise": {
      // A ringed planet rising along the bottom, its air glowing, stars above.
      const R = 560, top = 900 - 230 * sc, cy = top + R, [rx, ry] = [R * 1.75, R * 0.2];
      let body = `<defs><radialGradient id='air'><stop offset='${(R / (R + 80) - 0.05).toFixed(3)}' stop-color='${c.highlight!}' stop-opacity='0'/>`
        + `<stop offset='${(R / (R + 80)).toFixed(3)}' stop-color='${c.highlight!}' stop-opacity='${op(0.26)}'/><stop offset='1' stop-color='${c.highlight!}' stop-opacity='0'/></radialGradient>`
        + `<clipPath id='pl'><circle cx='800' cy='${n(cy)}' r='${R}'/></clipPath></defs>`;
      for (let i = 0; i < 60; i++) body += `<circle cx='${n(jitter(i, 110) * 1600)}' cy='${n(jitter(i, 111) * (top - 40))}' r='${n(0.6 + jitter(i, 112) * 1.2)}' fill='${c.text!}' fill-opacity='${op(0.1 + jitter(i, 113) * 0.18)}'/>`;
      const ring = (part: string) => [[rx, 10, 0.12], [rx * 0.9, 3, 0.18], [rx * 1.1, 16, 0.07]].map(([a, w, o]) =>
        `<path d='${part === "back" ? `M${n(800 - a!)} ${n(top)}A${n(a!)} ${n((ry * a!) / rx)} 0 0 1 ${n(800 + a!)} ${n(top)}` : `M${n(800 - a!)} ${n(top)}A${n(a!)} ${n((ry * a!) / rx)} 0 0 0 ${n(800 + a!)} ${n(top)}`}' fill='none' stroke='${c.accent!}' stroke-width='${n(w! * sc)}' stroke-opacity='${op(o!)}' transform='rotate(-8 800 ${n(top)})'/>`).join("");
      body += `<circle cx='800' cy='${n(cy)}' r='${R + 80}' fill='url(#air)'>${breathe("r", R + 80, R + 96, beat * 3)}</circle>`
        + ring("back") + `<circle cx='800' cy='${n(cy)}' r='${R}' fill='${c.bg!}' fill-opacity='${Math.min(1, 0.5 * k).toFixed(3)}'/>`
        + `<circle cx='800' cy='${n(cy)}' r='${R}' fill='${c.support!}' fill-opacity='${op(0.1)}'/><g clip-path='url(#pl)'>`;
      for (let i = 0; i < 4; i++) body += `<ellipse cx='800' cy='${n(top + (60 + i * 60) * sc)}' rx='${R * 1.2}' ry='${n((40 + i * 20) * sc)}' fill='none' stroke='${[c.highlight!, c.accent!][i % 2]}' stroke-width='${n((10 + i * 4) * sc)}' stroke-opacity='${op(0.035)}'/>`;
      body += "</g>" + ring("front");
      add(svg(body, 1600, 900, "xMidYMax slice"), "cover", "bottom");
      break;
    }
    // ── Haunt ────────────────────────────────────────────────────────────
    case "bats": {
      // Bats of a few sizes, wings beating, drifting up and away when alive.
      let body = "";
      ([[60, 70, 1.6], [190, 50, 1], [140, 160, 2.1], [240, 205, 0.8], [40, 200, 1.1]] as const).forEach(([x, y, s], i) => {
        const col = [c.accent!, c.support!, c.highlight!][i % 3]!, secs = beat * (0.14 + jitter(i, 121) * 0.08);
        body += `<g transform='translate(${x} ${y}) scale(${s})'><g>${flicker(1, 0.55, secs, jitter(i, 122) * secs)}<path transform='translate(-12 -12)' d='${BAT}' fill='${col}' fill-opacity='${op(0.16)}'/></g></g>`;
      });
      add(svg(body, 280, 240, "none"), `${n(280 * sc)}px ${n(240 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "webs": {
      // Webs strung across two top corners, their threads glinting; a spider rides its thread up and down.
      const web = (cx: number, cy: number, a0: number, a1: number, R: number) => {
        const N = 8, spokes = Array.from({ length: N + 1 }, (_, i) => a0 + ((a1 - a0) * i) / N);
        const pt = (a: number, r: number) => `${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}`;
        let out = `<path d='${spokes.map((a) => `M${cx} ${cy}L${pt(a, R)}`).join("")}' fill='none' stroke='${c.text!}' stroke-width='1.3' stroke-opacity='${op(0.14)}'/>`;
        for (let rr = R * 0.12, j = 0; rr < R * 0.96; rr += R * (0.07 + j * 0.006), j++) {
          let d = `M${pt(spokes[0]!, rr)}`;
          for (let i = 1; i <= N; i++) d += `Q${pt((spokes[i - 1]! + spokes[i]!) / 2, rr * 0.86)} ${pt(spokes[i]!, rr)}`;
          out += `<path d='${d}' fill='none' stroke='${c.text!}' stroke-width='0.9' stroke-opacity='${op(0.12)}'/>`;
        }
        return out;
      };
      corner(web(0, 0, 0.04, Math.PI / 2 - 0.04, 560), 600, 600, "left top", 70, 520);
      const [sx, sy] = [420, 250];
      let legs = "";
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) legs += `M${sx} ${sy + 2 + i * 3}l${s * (14 + i * 2)} ${-10 + i * 6}l${s * (6 + i * 2)} ${10 + i * 3}`;
      const spider = `<g>${wander(0, 90, beat * 2.4)}<path d='M${sx} -400V${sy}' stroke='${c.text!}' stroke-width='1' stroke-opacity='${op(0.2)}'></path>`
        + `<path d='${legs}' fill='none' stroke='${c.accent!}' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' stroke-opacity='${op(0.3)}'></path>`
        + `<circle cx='${sx}' cy='${sy + 12}' r='10' fill='${c.accent!}' fill-opacity='${op(0.3)}'></circle><circle cx='${sx}' cy='${sy - 1}' r='6.5' fill='${c.accent!}' fill-opacity='${op(0.3)}'></circle></g>`;
      corner(web(600, 0, Math.PI / 2 + 0.04, Math.PI - 0.04, 520) + spider, 600, 600, "right top", 70, 520);
      break;
    }
    case "moonlit": {
      // A full moon high in a corner, its halo breathing, clouds drifting across it.
      const [mx, my, r] = [400, 230, 110];
      let body = `<defs>${glow("halo", c.highlight!, 0.22, 0.3)}</defs>`;
      for (let i = 0; i < 30; i++) body += `<circle cx='${n(jitter(i, 123) * 700)}' cy='${n(jitter(i, 124) * 560)}' r='${n(0.6 + jitter(i, 125) * 1.2)}' fill='${c.text!}' fill-opacity='${op(0.1 + jitter(i, 126) * 0.18)}'/>`;
      body += `<circle cx='${mx}' cy='${my}' r='${r * 2.6}' fill='url(#halo)'>${breathe("r", r * 2.6, r * 2.95, beat * 2.6)}</circle>`
        + `<circle cx='${mx}' cy='${my}' r='${r}' fill='${c.text!}' fill-opacity='${op(0.16)}'/>`;
      ([[-34, -28, 22], [30, 18, 30], [-20, 46, 14], [46, -40, 11], [6, -58, 8]] as const).forEach(([dx, dy, cr]) => {
        body += `<circle cx='${mx + dx}' cy='${my + dy}' r='${cr}' fill='${c.bg!}' fill-opacity='${op(0.14)}'/>`;
      });
      ([[250, 300, 1], [480, 150, 0.7], [180, 430, 1.3]] as const).forEach(([cx, cy, s], i) => {
        let cloud = "";
        ([[0, 0, 90, 22], [-50, 10, 60, 16], [55, 8, 70, 18], [10, -14, 50, 18]] as const).forEach(([dx, dy, rx, ry]) => {
          cloud += `<ellipse cx='${n(cx + dx * s)}' cy='${n(cy + dy * s)}' rx='${n(rx * s)}' ry='${n(ry * s)}' fill='${i === 1 ? c.support! : c.text!}' fill-opacity='${op(0.07)}'/>`;
        });
        body += `<g>${wander(i % 2 ? -160 : 180, 0, beat * (4 + i * 1.3), i * 9)}${cloud}</g>`;
      });
      corner(body, 700, 560, "right top", 95, 700);
      break;
    }
    case "graveyard": {
      // Headstones and crosses on a low hill, a bare tree, fog drifting along the ground.
      const ground = (x: number) => 900 - (110 + Math.sin(x / 260) * 26 + Math.sin(x / 90) * 6) * sc;
      let hill = "M0 900";
      for (let x = 0; x <= 1600; x += 40) hill += ` L${x} ${n(ground(x))}`;
      let body = `<defs>${glow("fog", c.text!, 0.09)}</defs><path d='${hill} L1600 900Z' fill='${c.support!}' fill-opacity='${op(0.1)}'/>`;
      // A bare tree: branches forking upward, thinner at each fork.
      const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number, salt: number): string => {
        const [ex, ey] = [x + Math.cos(ang) * len, y + Math.sin(ang) * len];
        const bend = (jitter(salt, 131) - 0.5) * len * 0.4;
        let out = `<path d='M${n(x)} ${n(y)}Q${n((x + ex) / 2 + bend)} ${n((y + ey) / 2)} ${n(ex)} ${n(ey)}' fill='none' stroke='${c.support!}' stroke-width='${n(w)}' stroke-linecap='round' stroke-opacity='${op(0.2)}'/>`;
        if (depth > 0) for (const s of [-1, 1]) out += branch(ex, ey, ang + s * (0.35 + jitter(salt + s, 132) * 0.4), len * (0.66 + jitter(salt + s, 133) * 0.14), w * 0.62, depth - 1, salt * 3 + s + 7);
        return out;
      };
      body += branch(1080, ground(1080), -Math.PI / 2 - 0.08, 150 * sc, 14 * sc, 5, 1) + branch(560, ground(560), -Math.PI / 2 + 0.1, 90 * sc, 9 * sc, 4, 50);
      for (let i = 0; i < 16; i++) {
        const x = 50 + i * 100 + (jitter(i, 134) - 0.5) * 40, g = ground(x) + 6, h = (54 + jitter(i, 135) * 46) * sc, w = (16 + jitter(i, 136) * 10) * sc;
        const d = i % 3 === 1
          ? `M${n(x - 4 * sc)} ${n(g)}V${n(g - h * 0.7)}H${n(x - 18 * sc)}V${n(g - h * 0.84)}H${n(x - 4 * sc)}V${n(g - h * 1.1)}H${n(x + 4 * sc)}V${n(g - h * 0.84)}H${n(x + 18 * sc)}V${n(g - h * 0.7)}H${n(x + 4 * sc)}V${n(g)}Z`
          : `M${n(x - w)} ${n(g)}V${n(g - h + w)}A${n(w)} ${n(w)} 0 0 1 ${n(x + w)} ${n(g - h + w)}V${n(g)}Z`;
        body += `<path d='${d}' transform='rotate(${n((jitter(i, 137) - 0.5) * 10)} ${n(x)} ${n(g)})' fill='${i % 2 ? c.accent! : c.text!}' fill-opacity='${op(0.11)}'/>`;
      }
      for (let i = 0; i < 6; i++) {
        const rx = (360 + jitter(i, 138) * 200) * sc, secs = beat * (4 + jitter(i, 139) * 2);
        body += `<ellipse cx='${n(i * 300)}' cy='${n(900 - (40 + jitter(i, 140) * 60) * sc)}' rx='${n(rx)}' ry='${n(rx * 0.16)}' fill='url(#fog)'>${wander(i % 2 ? 220 : -220, 0, secs, i * 7)}</ellipse>`;
      }
      add(svg(body, 1600, 900, "xMidYMax slice"), "cover", "bottom");
      break;
    }
    case "mist": {
      // Banks of mist rolling slowly past each other, heaviest near the ground.
      let body = `<defs>${glow("m0", c.text!, 0.08)}${glow("m1", c.support!, 0.09)}</defs>`;
      for (let i = 0; i < 15; i++) {
        const low = jitter(i, 141) ** 0.6, cx = jitter(i, 142) * 1600, cy = 120 + low * 760, rx = (300 + jitter(i, 143) * 320) * sc, ry = rx * (0.14 + jitter(i, 144) * 0.1);
        const secs = beat * (4.5 + jitter(i, 145) * 3);
        body += `<ellipse cx='${n(cx)}' cy='${n(cy)}' rx='${n(rx)}' ry='${n(ry)}' fill='url(#m${i % 2})'>${wander((i % 2 ? 1 : -1) * (180 + jitter(i, 146) * 160), 0, secs, jitter(i, 147) * secs)}${breathe("ry", n(ry), n(ry * 1.35), secs * 0.7, i)}</ellipse>`;
      }
      add(svg(body, 1600, 900), "cover", "center");
      break;
    }
    case "candles": {
      // Candles along the bottom, wax running down them, each flame flickering in its own glow.
      let body = `<defs>${glow("halo", c.highlight!, 0.24)}</defs>`;
      for (let i = 0; i < 11; i++) {
        const x = 130 + i * 125 + (jitter(i, 151) - 0.5) * 60, w = (20 + jitter(i, 152) * 18) * sc, h = (80 + jitter(i, 153) * 220) * sc, top = 900 - h;
        const secs = beat * (0.14 + jitter(i, 154) * 0.1), lag = jitter(i, 155) * secs, hr = 46 * sc;
        body += `<circle cx='${n(x)}' cy='${n(top - 22 * sc)}' r='${n(hr)}' fill='url(#halo)'>${breathe("r", n(hr), n(hr * 1.25), secs * 1.7, lag)}</circle>`
          + `<rect x='${n(x - w / 2)}' y='${n(top)}' width='${n(w)}' height='${n(h + 10)}' rx='3' fill='${c.text!}' fill-opacity='${op(0.1)}'/>`;
        for (let j = 0; j < 2; j++) {
          const dx = (jitter(i * 3 + j, 156) - 0.5) * (w - 6), dl = (10 + jitter(i * 3 + j, 157) * 34) * sc;
          body += `<rect x='${n(x + dx - 2.5)}' y='${n(top)}' width='5' height='${n(dl)}' rx='2.5' fill='${c.text!}' fill-opacity='${op(0.1)}'/>`;
        }
        body += `<path d='M${n(x)} ${n(top)}v${n(-7 * sc)}' stroke='${c.text!}' stroke-width='1.6' stroke-opacity='${op(0.25)}'/>`
          + `<g transform='translate(${n(x)} ${n(top - 6 * sc)}) scale(${sc})'><g>${flicker(0.86, 1.18, secs, lag)}`
          + `<path d='M0 0C-7-4-8-13 0-28 8-13 7-4 0 0Z' fill='${c.highlight!}' fill-opacity='${op(0.4)}'/><path d='M0-2C-3-4-4-9 0-15 4-9 3-4 0-2Z' fill='${c.accent!}' fill-opacity='${op(0.35)}'/></g></g>`;
      }
      add(svg(body, 1600, 900, "xMidYMax slice"), "cover", "bottom");
      break;
    }
    case "damask": {
      // Old wallpaper: a damask flourish, set as a half-drop repeat.
      const scroll = `<path d='M2 -2C16 -10 26 -2 22 10 20 16 12 16 12 10 12 6 17 6 17 9 15 2 8 2 2 6Z'/><circle cx='20' cy='-20' r='2.5'/><circle cx='18' cy='25' r='2'/>`;
      const medal = (x: number, y: number, col: string) =>
        `<g transform='translate(${x} ${y})' fill='${col}' fill-opacity='${op(0.12)}'><path d='M0 -34C10 -20 10 -6 0 6-10 -6-10 -20 0 -34Z'/><path d='M0 9C6 16 6 26 0 34-6 26-6 16 0 9Z'/>`
        + `<circle cy='-38' r='2.2'/>${scroll}<g transform='scale(-1 1)'>${scroll}</g></g>`;
      add(svg(medal(30, 40, c.accent!) + medal(90, 120, c.support!), 120, 160, "none"), `${n(120 * sc)}px ${n(160 * sc)}px`, "0 0", "repeat");
      break;
    }
    case "drips": {
      // Thick drips running from the top edge, slowly lengthening; now and then a drop falls.
      let band = "M0 0H1600V16";
      for (let x = 1600; x >= 0; x -= 40) band += `L${x} ${n(16 + Math.sin(x / 53) * 5 + Math.sin(x / 17) * 2)}`;
      let body = `<path d='${band}Z' fill='${c.accent!}' fill-opacity='${op(0.2)}'/>`;
      for (let x = 14, i = 0; x < 1600; x += (30 + jitter(i, 161) * 70) * sc, i++) {
        const j = jitter(i, 162), w = (3 + j * 6) * sc, L = (20 + j * j * 280) * sc, secs = beat * (2.5 + jitter(i, 163) * 2), lag = jitter(i, 164) * secs;
        body += `<g transform='translate(${n(x)} 14)'><path d='M${n(-w)} 0V${n(L)}A${n(w)} ${n(w)} 0 0 0 ${n(w)} ${n(L)}V0Z' fill='${c.accent!}' fill-opacity='${op(0.2)}'>${flicker(1, n(1.1 + j * 0.15), secs, lag)}</path>`;
        if (live && j > 0.55) {
          const y0 = n(L + w * 1.6), dur = `dur='${n(secs * 2)}s' begin='-${n(lag)}s' repeatCount='indefinite'`;
          body += `<circle cy='${y0}' r='${n(w * 0.75)}' fill='${c.accent!}' fill-opacity='0'><animate attributeName='cy' values='${y0};${y0};960' keyTimes='0;0.78;1' calcMode='spline' keySplines='0 0 1 1;0.55 0 1 1' ${dur}/>`
            + `<animate attributeName='fill-opacity' values='0;0;${op(0.2)};${op(0.2)}' keyTimes='0;0.62;0.72;1' ${dur}/></circle>`;
        }
        body += "</g>";
      }
      add(svg(body, 1600, 900, "xMidYMin slice"), "cover", "top");
      break;
    }
    case "briars": {
      // Thorny vines reaching in from two corners, swaying a little from the root.
      const vines = (salt: number) => {
        let out = "";
        for (let v = 0; v < 3; v++) {
          const s = salt + v * 10, col = [c.support!, c.accent!, c.support!][v]!, o = op(0.18);
          const P: [number, number][] = [[0, 600 - v * 70], [140 + jitter(s, 171) * 80, 560 - v * 110], [160 + v * 90, 300 - jitter(s, 172) * 80], [330 + v * 70 + jitter(s, 173) * 60, 250 - v * 90 - jitter(s, 174) * 60]];
          const at = (t: number) => [0, 1].map((k2) => (1 - t) ** 3 * P[0]![k2]! + 3 * (1 - t) ** 2 * t * P[1]![k2]! + 3 * (1 - t) * t * t * P[2]![k2]! + t ** 3 * P[3]![k2]!) as [number, number];
          let d = `M${P[0]!.join(" ")}`, thorns = "", leaves = "";
          for (let i = 1; i <= 48; i++) {
            const t = i / 48, [x, y] = at(t), [px, py] = at(t - 1 / 48), len = Math.hypot(x - px, y - py) || 1;
            const [tx, ty, side] = [(x - px) / len, (y - py) / len, i % 2 ? 1 : -1], [nx, ny] = [-ty * side, tx * side];
            d += ` L${n(x)} ${n(y)}`;
            if (i % 4 === 0 && i < 46) thorns += `M${n(x - tx * 3.5)} ${n(y - ty * 3.5)}L${n(x + nx * (10 - t * 4))} ${n(y + ny * (10 - t * 4))}L${n(x + tx * 3.5)} ${n(y + ty * 3.5)}Z`;
            if (i % 7 === 3) leaves += `<ellipse cx='${n(x - nx * 9)}' cy='${n(y - ny * 9)}' rx='9' ry='4' transform='rotate(${n((Math.atan2(-ny, -nx) * 180) / Math.PI)} ${n(x - nx * 9)} ${n(y - ny * 9)})' fill='${col}' fill-opacity='${o}'/>`;
          }
          const [ex, ey] = P[3]!;
          out += `<g>${swing(v % 2 ? 2.5 : -2.5, P[0]![0]!, P[0]![1]!, beat * (3 + v), v * 5)}<path d='${d}' fill='none' stroke='${col}' stroke-width='${3.4 - v * 0.6}' stroke-linecap='round' stroke-opacity='${o}'/>`
            + `<path d='${thorns}' fill='${col}' fill-opacity='${o}'/>${leaves}<circle cx='${n(ex)}' cy='${n(ey)}' r='${7 + v * 2}' fill='${c.highlight!}' fill-opacity='${op(0.2)}'/></g>`;
        }
        return out;
      };
      corner(vines(1), 600, 600, "left bottom", 80, 560);
      corner(`<g transform='rotate(180 300 300)'>${vines(5)}</g>`, 600, 600, "right top", 80, 560);
      break;
    }
    case "arches": {
      // Rows of pointed windows, each with two lancets and a round window above.
      const o = op(0.12);
      const body = `<path d='M20 250V110A100 100 0 0 1 70 23.4 100 100 0 0 1 120 110V250' fill='none' stroke='${c.accent!}' stroke-width='3' stroke-opacity='${o}'/>`
        + `<path d='M32 250V130A36 36 0 0 1 50 98.8 36 36 0 0 1 68 130V250M72 250V130A36 36 0 0 1 90 98.8 36 36 0 0 1 108 130V250' fill='none' stroke='${c.support!}' stroke-width='2' stroke-opacity='${o}'/>`
        + `<circle cx='70' cy='64' r='15' fill='none' stroke='${c.highlight!}' stroke-width='2' stroke-opacity='${o}'/>`
        + [[70, 57.5], [76.5, 64], [70, 70.5], [63.5, 64]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='3.5' fill='${c.highlight!}' fill-opacity='${o}'/>`).join("")
        + `<path d='M8 254H132' stroke='${c.accent!}' stroke-width='3' stroke-opacity='${o}'/>`;
      add(svg(body, 140, 260, "none"), `${n(140 * sc)}px ${n(260 * sc)}px`, "0 0", "repeat");
      break;
    }
  }

  // The base, under the pattern.
  if (b.base === "glow") {
    add(`radial-gradient(circle at 10% 4%, ${rgba(c.accent!, 0.2 * bk)}, transparent 36%)`);
    add(`radial-gradient(circle at 98% 36%, ${rgba(c.highlight!, 0.16 * bk)}, transparent 32%)`);
    add(`radial-gradient(circle at 14% 98%, ${rgba(c.support!, 0.16 * bk)}, transparent 38%)`);
    add(`linear-gradient(${rgba(c["bg-deep"]!, 0)}, ${c["bg-deep"]!})`);
  } else if (b.base === "gradient") {
    add(`linear-gradient(155deg, ${rgba(c.accent!, 0.16 * bk)} 0%, transparent 42%, transparent 58%, ${rgba(c.support!, 0.14 * bk)} 100%)`);
    add(`linear-gradient(${c.bg!}, ${c["bg-deep"]!})`);
  }
  if (!layers.length) add("none");
  return {
    image: layers.map((l) => l.image).join(", "),
    size: layers.map((l) => l.size === "auto" ? "100% 100%" : l.size).join(", "),
    position: layers.map((l) => l.position).join(", "),
    repeat: layers.map((l) => l.repeat).join(", "),
  };
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
  if (f.headingsSize !== 1) lines.push(`  --font-display-size: ${f.headingsSize};`);
  if (f.bodySize !== 1) lines.push(`  --font-body-size: ${f.bodySize};`);
  if (motifMask(theme) !== "none") lines.push(`  --motif-mask: ${motifMask(theme)};`, "  --motif-radius: 0px;");
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
      headingsSize: num(f.headingsSize, 0.8, 1.3), bodySize: num(f.bodySize, 0.8, 1.3),
    },
    infer: raw.infer === "tonal" ? "tonal" : undefined,
    vibrancy: num(raw.vibrancy, 0.4, 1.5), contrast: num(raw.contrast, 0.8, 1.6),
    backdrop: (() => {
      const bd = (raw.backdrop ?? {}) as Record<string, unknown>;
      const pattern = BACKDROPS.find((x) => x.key === bd.pattern)?.key;
      const base = BACKDROP_BASES.find((x) => x === bd.base);
      const motion = BACKDROP_MOTIONS.find((x) => x.key === bd.motion)?.key;
      return { pattern, base, intensity: num(bd.intensity, 0, 1), scale: num(bd.scale, 0.5, 2), contrast: num(bd.contrast, 0.3, 2), saturation: num(bd.saturation, 0, 1.6), motion, speed: num(bd.speed, 0.5, 2) };
    })(),
    motif: MOTIFS.find((x) => x.key === raw.motif)?.key,
  };
  const name = typeof obj.name === "string" ? obj.name.slice(0, 80) : undefined;
  return { theme: ownColours(theme), ...(name ? { name } : {}) };
}

/** Write the theme to the page: CSS variables, browser chrome colour, and a cached copy for next load. */
/** Every CSS variable a theme sets: colours, type and backdrop. Set them on any element to theme just that part of the page. */
export function themeVars(theme: Theme): Record<string, string> {
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
  vars["--font-display-size"] = String(f.headingsSize);
  vars["--font-body-size"] = String(f.bodySize);
  const bd = backdropCss(theme);
  vars["--bg-image"] = bd.image;
  vars["--bg-size"] = bd.size;
  vars["--bg-position"] = bd.position;
  vars["--bg-repeat"] = bd.repeat;
  vars["--bg-animation"] = backdropAnimation(theme);
  vars["--motif-mask"] = motifMask(theme);
  vars["--motif-radius"] = motifMask(theme) === "none" ? "9999px" : "0px";
  return vars;
}

export function applyTheme(theme: Theme): void {
  ensureFullScreenViewport();
  const root = document.documentElement;
  const vars = themeVars(theme);
  const f = fullTheme(theme).fonts;
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

let touchIconKey = "";

/**
 * The built-in favicon: one of the theme's motif shape (a circle by default)
 * in the accent on the page colour, softly rounded — drawn from the theme, so
 * it needs no file and follows every change of colour or motif.
 */
export function motifFavicon(input: Theme): string {
  const t = fullTheme(input);
  const m = MOTIFS.find((x) => x.key === t.motif);
  const shape = m?.path ? m.path.replace(/stroke='black'/g, `stroke='${t.accent}'`) : "<circle cx='12' cy='12' r='11'/>";
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32'><rect width='32' height='32' rx='7' fill='${t.background}'/>`
    + `<g transform='translate(5 5) scale(0.9167)' fill='${t.accent}'>${shape}</g></svg>`;
}

/** An older app favicon template recoloured to a theme: #0B0B0C → background, #A8FF3E → accent, #FF3D6E → highlight, #2EC5FF → support. Deprecated: the built-in favicon is `motifFavicon`. */
export function themedFavicon(template: string, input: Theme): string {
  const theme = fullTheme(input);
  return template
    .replace(/#0B0B0C/gi, theme.background)
    .replace(/#A8FF3E/gi, theme.accent)
    .replace(/#FF3D6E/gi, theme.highlight)
    .replace(/#2EC5FF/gi, theme.support);
}

/**
 * An image (an SVG data URL, or an uploaded icon's URL) drawn square on the
 * theme's background as a PNG data URL — an iOS home-screen icon: opaque,
 * full-bleed (iOS rounds the corners itself), `size` px.
 */
export function iconPng(src: string, background: string, size = 180): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = Object.assign(document.createElement("canvas"), { width: size, height: size });
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      try { resolve(canvas.toDataURL("image/png")); } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Point the tab icon at an uploaded favicon, or the built-in one — the theme's
 * motif in its accent (`motifFavicon`), adding the icon link if the page has
 * none — and make the iOS home-screen icon (`apple-touch-icon`)
 * from the same picture, so adding the app to a Home Screen gets the current
 * look. iOS keeps an icon from when the app was added: after a theme change,
 * it shows on phones that add the app from then on (or remove and re-add it).
 */
export async function applyFavicon(theme: Theme, customUrl: string | null): Promise<void> {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) link = document.head.appendChild(Object.assign(document.createElement("link"), { rel: "icon" }));
  const src = customUrl ?? `data:image/svg+xml,${encodeURIComponent(motifFavicon(theme))}`;
  link.type = customUrl ? "" : "image/svg+xml";
  link.href = src;

  const touch = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  const key = `${src}|${theme.background}`;
  if (!touch || key === touchIconKey) return;
  touchIconKey = key;
  try { touch.href = await iconPng(src, theme.background); } catch { /* keep the static PNG */ }
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

// ─────────────────────────────────────────────────────────────────────────────
// Page tones: one look in light, mid and dark
// ─────────────────────────────────────────────────────────────────────────────

/** How light a theme's page is: dark (near-black), mid (a deep or muted colour) or light (near-white). */
export type PageTone = "dark" | "mid" | "light";
export const PAGE_TONES: PageTone[] = ["light", "mid", "dark"];

export function toneOf(theme: Theme): PageTone {
  const l = luminance(theme.background);
  return l < 0.025 ? "dark" : l >= 0.7 ? "light" : "mid";
}

/** The readability targets every template meets (scripts/contrast.mjs): the names of any it misses. */
export const TEMPLATE_TARGETS = { text: 7, muted: 4.5, subtle: 3.5, border: 1.75, card: 1.19, accent: 3, highlight: 3, support: 4.5, button: 4.5, apart: 10 } as const;
export function templateScores(theme: Theme): Record<keyof typeof TEMPLATE_TARGETS, number> {
  const c = themeHex(theme);
  return {
    text: contrast(c.text!, c.surface!), muted: contrast(c["text-muted"]!, c.surface!), subtle: contrast(c["text-subtle"]!, c.surface!),
    border: contrast(c.border!, c.surface!), card: contrast(c.surface!, c.bg!),
    accent: contrast(c.accent!, c.bg!), highlight: contrast(c.highlight!, c.bg!), support: contrast(c.support!, c.surface!),
    button: contrast(c["on-accent"]!, c.accent!),
    // Accent and highlight need 15 apart; the other pairs 10 (scaled so the one target covers both).
    apart: Math.min(deltaE(c.accent!, c.highlight!) * (10 / 15), deltaE(c.accent!, c.support!), deltaE(c.highlight!, c.support!)),
  };
}
export function templateIssues(theme: Theme): string[] {
  const r = templateScores(theme);
  return (Object.keys(TEMPLATE_TARGETS) as (keyof typeof TEMPLATE_TARGETS)[]).filter((k) => r[k] < TEMPLATE_TARGETS[k]);
}

const chroma = (hex: string) => { const [r, g, b] = hexToRgb(hex); return (Math.max(r, g, b) - Math.min(r, g, b)) / 255; };
const isWarm = (hex: string) => { const [h, s] = rgbToHsl(hexToRgb(hex)); return s > 0.25 && (h < 45 || h > 330); };

/** `base` scaled darker or lighter (same hue) until its luminance is `target`. */
function atLuminance(base: RGB, target: number): RGB {
  let lo = 0, hi = 1, out: RGB = base;
  // Darken by scaling towards black; if even the full colour is too dark, mix towards white.
  if (luminance(base) >= target) {
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; out = mix(BLACK, base, m); if (luminance(out) > target) hi = m; else lo = m; }
  } else {
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; out = mix(base, WHITE, m); if (luminance(out) > target) hi = m; else lo = m; }
  }
  return out.map((v) => Math.round(v)) as RGB;
}

/**
 * The same look on a light, mid or dark page, made only from its own colours
 * (`extra`: more of them — a team's other kits) and lighter or darker shades
 * of them: the page is the most colourful of them, deepened or paled; each role
 * takes the first own colour that reads on it, nudged lighter or darker (reds
 * and oranges are never paled into pink). Returns null when it can't meet every
 * readability target in that tone.
 */
export function atTone(theme: Theme, tone: PageTone, extra: string[] = []): Theme | null {
  if (toneOf(theme) === tone) return theme;
  const own: string[] = [];
  for (const h of [theme.accent, theme.highlight, theme.support, ...extra, theme.background]) {
    if (h && isHex(h) && !own.some((o) => deltaE(o, h) < 8)) own.push(h.toUpperCase());
  }
  // Page hues to try: the theme's own page if it has colour, then its most colourful colours, then a neutral.
  const hued = [theme.background, ...own].filter((h, i, all) => chroma(h) >= 0.18 && all.findIndex((x) => deltaE(x, h) < 20) === i).slice(0, 3);
  const bases = [...hued, theme.background].map(hexToRgb);
  const depths: number[] = tone === "light" ? [0.045, 0.025] : tone === "mid" ? [0.05, 0.04, 0.03] : [0.011, 0.006];
  for (const base of bases) for (const depth of depths) {
    const page = rgbToHex(tone === "light" ? mix(WHITE, base, chroma(rgbToHex(base)) > 0.18 ? depth : depth * 0.6) : atLuminance(base, depth));
    const out = rolesOn(theme, own, page, tone === "light");
    if (out && !templateIssues(out).length) return out;
  }
  return null;
}

/** Fill accent, highlight and support from `own` colours (nudged lighter or darker) so each reads on `page`. */
function rolesOn(theme: Theme, own: string[], page: string, lightPage: boolean): Theme | null {
  const surface = themeHex({ accent: theme.accent, background: page }).surface!;
  // Text on the accent as deriveColors picks it: near-black on light fills, white on dark ones.
  const onBest = (c: string) => contrast(c, luminance(c) > 0.35 ? "#141416" : "#FFFFFF");
  const read = (hex: string, ok: (c: string) => boolean): string | null => {
    for (let t = 0; t <= 0.6001; t += 0.05) {
      if (!lightPage && t > 0.15 && isWarm(hex)) return null;
      const c = rgbToHex(mix(hexToRgb(hex), lightPage ? BLACK : WHITE, t));
      if (deltaE(c, page) >= 22 && ok(c)) return c;
    }
    return null;
  };
  const pick = (ok: (c: string) => boolean, apartFrom: [string, number][]) => {
    for (const h of own) {
      const c = read(h, (x) => ok(x) && apartFrom.every(([o, d]) => deltaE(x, o) >= d));
      if (c) return c;
    }
    return null;
  };
  const accent = pick((c) => contrast(c, page) >= 3.2 && onBest(c) >= 4.7, []);
  if (!accent) return null;
  const highlight = theme.highlight ? pick((c) => contrast(c, page) >= 3.2, [[accent, 16]]) : null;
  const support = theme.support ? pick((c) => contrast(c, surface) >= 4.7, [[accent, 11], ...(highlight ? [[highlight, 11]] as [string, number][] : [])]) : null;
  return {
    accent, background: page, ...(highlight ? { highlight } : {}), ...(support ? { support } : {}),
    // A role no own colour can fill is left to shades of the accent, never a new hue.
    ...((theme.highlight && !highlight) || (theme.support && !support) || theme.infer === "tonal" ? { infer: "tonal" as const } : {}),
  };
}
