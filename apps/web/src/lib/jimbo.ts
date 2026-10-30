// Part of jimbo-ui (foundation — don't edit here; change jimbo-ui and update).
/** Which jimbo-ui this app's foundation files came from, and where to see and look things up. */
export const JIMBO_UI = {
  version: "0.8.0",
  showcase: "https://claude.ai/artifact/F4KAFYCkxZGZB7zKdaWjWC",
  repo: "https://github.com/ryanjpeterson/jimbo-ui",
  registry: "https://github.com/ryanjpeterson/jimbo-ui/blob/main/registry/apps.json",
} as const;

/**
 * The app's own jimbo-ui.json, when its Vite config passes it in:
 *   define: { __JIMBO_APP__: JSON.stringify(<the parsed jimbo-ui.json plus its repo name>) }
 * The About tab of the jimbo-ui config section reads it; without it, About shows the release only.
 */
export interface JimboAppConfig {
  name?: string;
  version?: string;
  auth?: "admin" | "none";
  registry?: { registered?: string; audited?: string };
  components?: { uses?: string[]; local?: { name: string; path: string; kind: "domain" | "candidate"; matches: string | null }[]; overrides?: unknown[] };
}
declare const __JIMBO_APP__: JimboAppConfig | undefined;
export const JIMBO_APP: JimboAppConfig | null = typeof __JIMBO_APP__ === "undefined" ? null : __JIMBO_APP__;
