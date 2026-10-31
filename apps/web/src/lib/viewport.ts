/**
 * The phone frame: makes sure the page is laid out edge to edge, so the
 * safe-area insets (--safe-top and friends in globals.css) are real numbers
 * and the dock and bars clear the home indicator and any notch. Without
 * viewport-fit=cover the insets read 0 even where the page is drawn under
 * them.
 *
 * index.html should already say it (reference/web/index.html); this repairs
 * an app that doesn't, and warns in development. Called by applyTheme, so
 * every app runs it.
 *
 * Part of jimbo-ui (foundation — don't edit here; change jimbo-ui and update).
 */

const REQUIRED = { width: "device-width", "initial-scale": "1", "viewport-fit": "cover" } as const;

let checked = false;

export function ensureFullScreenViewport(): void {
  if (checked || typeof document === "undefined") return;
  checked = true;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "viewport";
    document.head.prepend(meta);
  }
  const parts = new Map(
    (meta.content || "").split(",").map((p) => p.split("=").map((s) => s.trim()) as [string, string]).filter(([k]) => k),
  );
  const missing = Object.entries(REQUIRED).filter(([k]) => !parts.has(k) || (k === "viewport-fit" && parts.get(k) !== "cover"));
  if (!missing.length) return;
  for (const [k, v] of missing) parts.set(k, v);
  meta.content = [...parts].map(([k, v]) => (v === undefined ? k : `${k}=${v}`)).join(", ");
  if (import.meta.env?.DEV) {
    console.warn(`jimbo-ui: index.html's viewport meta is missing ${missing.map(([k, v]) => `${k}=${v}`).join(", ")}; set it there (see reference/web/index.html).`);
  }
}
