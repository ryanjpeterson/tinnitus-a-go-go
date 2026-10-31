// Part of jimbo-ui (foundation — don't edit here; change jimbo-ui and update).
/** A theme token: `rgb(var(--c-name) / <alpha>)`. */
const tok = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
/** A brand colour and its derived tokens (see src/lib/theme.ts). */
const family = (name) => ({
  DEFAULT: tok(name),
  ...Object.fromEntries(["hover", "lighter", "light", "dark", "darker", "top", "bottom", "950", "900", "800", "700"].map((k) => [k, tok(`${name}-${k}`)])),
});

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // Every colour is a theme token (CSS variable of "R G B" channels, set by
      // src/lib/theme.ts from the brand colours) so opacity modifiers like
      // bg-accent/15 keep working. Defaults: src/styles/globals.css.
      colors: {
        bg: tok("bg"),
        "bg-deep": tok("bg-deep"),
        surface: tok("surface"),
        "surface-2": tok("surface-2"),
        border: tok("border"),
        text: {
          base: tok("text"),
          muted: tok("text-muted"),
          subtle: tok("text-subtle"),
        },
        // accent / highlight / support: the theme's brand colours, each with hover,
        // shades (lighter … darker), a lit two-stop fill (top → bottom, for
        // bg-gradient-to-b) and washes mixed into the page (950 … 700):
        // bg-accent, text-highlight-light, from-support-top, bg-accent-950…
        accent: {
          ...family("accent"),
          // Legacy names from before 0.3 (lime = accent, pink = highlight); kept so older apps still build.
          lime:         tok("accent"),
          "lime-hover": tok("accent-hover"),
          pink:         tok("highlight"),
          "pink-hover": tok("highlight-hover"),
          cyan:         "#3DFFE8",
          "cyan-hover": "#70FFF0",
          orange:       "#FF8C3A",
        },
        highlight: family("highlight"),
        support: family("support"),
        // Text on an accent / highlight / support fill: dark or light, whichever reads.
        "on-accent": tok("on-accent"),
        "on-highlight": tok("on-highlight"),
        "on-support": tok("on-support"),
        // Legacy wash names (lime = accent, rose = highlight).
        lime: { 700: tok("accent-700"), 900: tok("accent-900"), 950: tok("accent-950") },
        rose: { 800: tok("highlight-800"), 900: tok("highlight-900"), 950: tok("highlight-950") },
        danger: "#FF5252",
      },
      // Every text size follows the theme's size setting: × --fs (globals.css) —
      // the body size, or the headings size inside .font-display. Line heights
      // are ratios so they follow too. Pixel sizes the kit uses are named here
      // (text-15 = 15px × --fs); use them instead of text-[15px].
      fontSize: {
        ...Object.fromEntries([["xs", 0.75, 1.333], ["sm", 0.875, 1.43], ["base", 1, 1.5], ["lg", 1.125, 1.556], ["xl", 1.25, 1.4],
          ["2xl", 1.5, 1.333], ["3xl", 1.875, 1.2], ["4xl", 2.25, 1.111], ["5xl", 3, 1], ["6xl", 3.75, 1], ["7xl", 4.5, 1], ["8xl", 6, 1], ["9xl", 8, 1]]
          .map(([k, rem, lh]) => [k, [`calc(${rem}rem * var(--fs, 1))`, { lineHeight: String(lh) }]])),
        ...Object.fromEntries([7, 8, 9, 10, 10.5, 11, 12, 13, 15, 17, 22, 24, 26, 28, 30, 32, 40]
          .map((px) => [String(px), `calc(${px}px * var(--fs, 1))`])),
      },
      fontFamily: {
        // Headings and body follow the theme's type styles (sans, mono or serif),
        // set by src/lib/theme.ts as --font-display / --font-body; defaults in globals.css.
        // Weight and letter spacing follow --font-display-weight / -tracking (globals.css).
        display: ["var(--font-display)"],
        script: ["'Caveat Brush'", "cursive"],
        body: ["var(--font-body)"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      // Softly rounded, not pills: cards 14, fields 11, controls 10, chips 8.
      // Circles (avatars, dots, orbs) stay rounded-full — they're the motif.
      borderRadius: {
        "3xl": "18px",
        "2xl": "14px",
        xl: "11px",
        control: "10px",
        lg: "8px",
        md: "6px",
        sm: "4px",
      },
    },
  },
  plugins: [],
};
