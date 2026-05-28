/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#141416",
        surface: "#1C1C1F",
        "surface-2": "#252528",
        border: "#303034",
        text: {
          base: "#F4F1EB",
          muted: "#9C9A93",
          subtle: "#6B6963",
        },
        accent: {
          lime:         "#A8FF3E",
          "lime-hover": "#BFFF60",
          pink:         "#FF3D6E",
          "pink-hover": "#FF6589",
          cyan:         "#3DFFE8",
          "cyan-hover": "#70FFF0",
          orange:       "#FF8C3A",
        },
        danger: "#FF5252",
      },
      fontFamily: {
        display: ["Antonio", "ui-sans-serif", "system-ui", "sans-serif"],
        script: ["'Caveat Brush'", "cursive"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        lg: "10px",
        md: "8px",
        sm: "6px",
      },
    },
  },
  plugins: [],
};
