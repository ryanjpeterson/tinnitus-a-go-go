// Part of jimbo-ui (foundation — don't edit here; change jimbo-ui and update).
/** Which jimbo-ui this app's foundation files came from, and where to see and look things up. */
export const JIMBO_UI = {
  version: "0.8.4",
  showcase: "https://claude.ai/artifact/F4KAFYCkxZGZB7zKdaWjWC",
  repo: "https://github.com/ryanjpeterson/jimbo-ui",
  registry: "https://github.com/ryanjpeterson/jimbo-ui/blob/main/registry/apps.json",
  changelog: "https://github.com/ryanjpeterson/jimbo-ui/blob/main/CHANGELOG.md",
  /** Every release and what it changes, written from the changelog (scripts/releases.mjs). */
  releases: "https://raw.githubusercontent.com/ryanjpeterson/jimbo-ui/main/releases.json",
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

/* ── Newer releases ─────────────────────────────────────────────────────── */

export type ReleaseItem = {
  kind: "changed" | "added" | "removed" | "fixed" | "available";
  text: string;
  /** Registry ids of the components it names. */
  affects: string[];
  /** Only touches files every app copies as they are. */
  foundation?: true;
};
export type Release = { version: string; date: string | null; summary: string; items: ReleaseItem[]; appsMust: string[] };
export type Releases = { latest: string | null; releases: Release[] };

const parts = (v: string) => v.split(".").map(Number);
/** Negative when a is older than b. */
export function compareVersions(a: string, b: string) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

const CACHE = "jimbo-ui.releases";
const DAY = 24 * 60 * 60 * 1000;

/**
 * The published releases, or null when they can't be read (offline, blocked,
 * GitHub down). Cached in the browser for a day, so it asks GitHub at most
 * once a day per person — and only when something calls it.
 */
export async function fetchReleases(url: string = JIMBO_UI.releases): Promise<Releases | null> {
  try {
    const hit = JSON.parse(localStorage.getItem(CACHE) ?? "null") as { at: number; data: Releases } | null;
    if (hit && Date.now() - hit.at < DAY) return hit.data;
  } catch { /* no storage: fetch */ }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as Releases;
    if (!Array.isArray(data.releases)) return null;
    try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), data })); } catch { /* fine */ }
    return data;
  } catch {
    return null;
  }
}

export type Updates = {
  current: string;
  latest: string;
  /** Newer releases, newest first. */
  newer: Release[];
  /** Steps to carry out in the app's own code, oldest release first. */
  toDo: { version: string; step: string }[];
  /** Fixes and changes to kit components this app uses — port them. */
  yours: { version: string; item: ReleaseItem }[];
  /** Foundation changes and general ones: they come with copying the foundation files. */
  included: { version: string; item: ReleaseItem }[];
  /** Additions the app can take up when it wants them. */
  optional: { version: string; item: ReleaseItem }[];
  /** Changes to kit components this app doesn't use. */
  elsewhere: number;
};

/**
 * What updating from `current` to the latest release changes for an app that
 * uses the components `uses` (registry ids, from its jimbo-ui.json). Without
 * `uses`, every kit change counts as the app's. Null when it's up to date.
 */
export function updatesFor(data: Releases, current: string, uses?: string[]): Updates | null {
  const newer = data.releases.filter((r) => compareVersions(r.version, current) > 0);
  if (!newer.length) return null;
  const mine = (item: ReleaseItem) => !uses || item.affects.some((id) => uses.includes(id));
  const u: Updates = { current, latest: newer[0]!.version, newer, toDo: [], yours: [], included: [], optional: [], elsewhere: 0 };
  for (const r of [...newer].reverse()) {
    for (const step of r.appsMust) u.toDo.push({ version: r.version, step });
    const added = new Set(r.items.filter((i) => i.kind === "added").flatMap((i) => i.affects));
    for (const item of r.items) {
      // "Available" usually lists what "Added" already said.
      if (item.kind === "available" && item.affects.length && item.affects.every((id) => added.has(id))) continue;
      const entry = { version: r.version, item };
      if (item.kind === "added" || item.kind === "available") u.optional.push(entry);
      else if (item.foundation || !item.affects.length) u.included.push(entry);
      else if (mine(item)) u.yours.push(entry);
      else u.elsewhere++;
    }
  }
  return u;
}
