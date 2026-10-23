// Part of jimbo-ui (foundation — don't edit here; change jimbo-ui and update).
/** A theme token: `rgb(var(--c-name) / <alpha>)`. */
const tok = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // Every colour is a theme token (CSS variable of "R G B" channels, set by
      // src/lib/theme.ts from three brand colours) so opacity modifiers like
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
        // accent / highlight: the theme's primary and secondary colours, with
        // hover shades and washes (bg-accent, text-highlight, bg-accent-950…).
        accent: {
          DEFAULT:      tok("accent"),
          hover:        tok("accent-hover"),
          950:          tok("accent-950"),
          900:          tok("accent-900"),
          700:          tok("accent-700"),
          // Legacy names from before 2.0 (lime = accent, pink = highlight); kept so older apps still build.
          lime:         tok("accent"),
          "lime-hover": tok("accent-hover"),
          pink:         tok("highlight"),
          "pink-hover": tok("highlight-hover"),
          cyan:         "#3DFFE8",
          "cyan-hover": "#70FFF0",
          orange:       "#FF8C3A",
        },
        highlight: {
          DEFAULT: tok("highlight"),
          hover:   tok("highlight-hover"),
          950:     tok("highlight-950"),
          900:     tok("highlight-900"),
          800:     tok("highlight-800"),
        },
        // Text on an accent / highlight fill: dark or light, whichever reads.
        "on-accent": tok("on-accent"),
        "on-highlight": tok("on-highlight"),
        // Legacy wash names (lime = accent, rose = highlight).
        lime: { 700: tok("accent-700"), 900: tok("accent-900"), 950: tok("accent-950") },
        rose: { 800: tok("highlight-800"), 900: tok("highlight-900"), 950: tok("highlight-950") },
        danger: "#FF5252",
      },
      fontFamily: {
        // Heavy grotesque for headings — set to weight 800 in globals.css.
        display: ["Archivo", "ui-sans-serif", "system-ui", "sans-serif"],
        script: ["'Caveat Brush'", "cursive"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        "2xl": "18px",
        xl: "14px",
        lg: "10px",
        md: "8px",
        sm: "6px",
      },
    },
  },
  plugins: [],
};
