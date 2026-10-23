/**
 * This app's brand settings — the only theme values that differ between apps
 * built on jimbo-ui. Owned by the app: jimbo-ui updates never overwrite it.
 * (Logo artwork lives in components/Wordmark.tsx and public/favicon.svg.)
 */

import type { Theme } from "./theme";

export const BRAND = {
  /** Shown on the default theme's card on the Brand page. */
  name: "Tinnitus",
  /** The look before an admin changes anything. Keep src/styles/tokens.css in step (jimbo-ui: scripts/tokens.mjs). */
  defaultTheme: { accent: "#A8FF3E", highlight: "#FF3D6E", background: "#141416" } satisfies Theme,
  /** localStorage key prefix; index.html's pre-paint script reads `<prefix>.themeVars`. */
  storagePrefix: "tagg",
};
