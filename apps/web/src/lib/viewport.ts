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
 * Installed, the app doesn't zoom, like a native app: no pinch-zoom and no
 * double-tap zoom (lockAppZoom). In a browser tab it's a web page, and
 * pinch-zoom stays.
 *
 * Part of jimbo-ui (foundation — don't edit here; change jimbo-ui and update).
 */

const REQUIRED = { width: "device-width", "initial-scale": "1", "viewport-fit": "cover" } as const;

let checked = false;

export function ensureFullScreenViewport(): void {
  if (checked || typeof document === "undefined") return;
  checked = true;
  lockAppZoom();
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

/**
 * True when running from the Home Screen, as an installed desktop app, or
 * inside the iOS shell (jimbo-deploy's Capacitor wrapper, which adds
 * "JimboShell" to the user agent).
 */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    /JimboShell/.test(navigator.userAgent)
  );
}

/**
 * No page zoom in the installed app. Three layers, because each browser
 * honours a different one:
 * - the viewport meta gets maximum-scale=1, user-scalable=no (Android Chrome);
 * - html gets data-installed, which globals.css turns into
 *   touch-action: pan-x pan-y (no pinch or double-tap zoom where supported);
 * - iOS's own pinch events (gesturestart/change) are cancelled, since iOS
 *   ignores user-scalable=no.
 * Touch events still reach the page, so maps and image viewers that do their
 * own pinch (in JS) keep working.
 */
function lockAppZoom(): void {
  if (!isInstalledApp()) return;
  document.documentElement.dataset.installed = "";
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta && !/user-scalable/.test(meta.content)) meta.content += ", maximum-scale=1, user-scalable=no";
  const stop = (e: Event) => e.preventDefault();
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, stop, { passive: false });
  }
}
