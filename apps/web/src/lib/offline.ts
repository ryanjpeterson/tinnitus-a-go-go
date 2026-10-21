/**
 * Offline support. The service worker (vite.config.ts) keeps API responses for
 * 60 days and images for 180; these helpers fill those caches ahead of time by
 * requesting the same URLs the pages request.
 *
 *   warmCache()       on launch (once per session, when online): the main lists
 *   saveEverything()  on demand: every show, artist, venue and festival page,
 *                     plus their flyers and photos
 */

import { api } from "./api";

const localDate = () => new Date().toLocaleDateString("en-CA");

/** The requests each tab makes when first opened — same arguments, same URLs. */
function mainLists(): Promise<unknown>[] {
  return [
    api.getDeepStats(localDate()),
    api.listConcerts({ status: ["attended"], page: 1, limit: 24, sort: "date_desc" }),
    api.listConcerts({ status: ["attending"], page: 1, limit: 24, sort: "date_asc" }),
    api.listArtists({ page: 1, limit: 40 }),
    api.listVenues({ page: 1, limit: 30 }),
    api.listFestivals({ page: 1, limit: 60 }),
    api.listVenuesForMap(),
    api.listReviewYears(),
  ];
}

export function warmCache(): void {
  try {
    if (!navigator.onLine || sessionStorage.getItem("tagg.warmed")) return;
    sessionStorage.setItem("tagg.warmed", "1");
  } catch {
    return;
  }
  // After the first page has settled, so it never competes with what's on screen.
  setTimeout(() => { void Promise.allSettled(mainLists()); }, 4000);
}

/** Run tasks a few at a time, reporting progress. */
async function runAll(tasks: (() => Promise<unknown>)[], onProgress: (done: number, total: number) => void): Promise<number> {
  let done = 0;
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++]!;
      try { await task(); } catch { failed++; }
      onProgress(++done, tasks.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return failed;
}

/** Image bytes into the service worker's media cache. */
const cacheImage = (url: string | null | undefined) => async () => {
  if (url) await fetch(url, { mode: url.startsWith(location.origin) || url.startsWith("/") ? "same-origin" : "no-cors" });
};

interface Bundle { entries: { url: string; body: unknown }[]; images: string[] }

async function fetchBundle(part: string): Promise<Bundle> {
  const res = await fetch(`/api/offline/bundle?part=${part}`, { credentials: "include" });
  if (!res.ok) throw new Error(`bundle ${part}: ${res.status}`);
  return (await res.json()) as Bundle;
}

/**
 * Save every show, artist, venue and festival page plus their images.
 * Pages arrive as four bundles and are written straight into the service
 * worker's API cache under the URLs the pages fetch; images are then fetched
 * so the service worker stores them.
 */
export async function saveEverything(onProgress: (done: number, total: number) => void): Promise<{ failed: number; total: number }> {
  await Promise.allSettled(mainLists());
  const parts = ["shows", "artists", "venues", "festivals"];
  const cache = "caches" in window ? await caches.open("api-cache") : null;
  const images: string[] = [];
  let failed = 0;

  for (const [i, part] of parts.entries()) {
    onProgress(i, parts.length);
    try {
      const b = await fetchBundle(part);
      if (cache) {
        await Promise.all(b.entries.map((e) => cache.put(
          new URL(e.url, location.origin).toString(),
          new Response(JSON.stringify(e.body), { headers: { "Content-Type": "application/json" } }),
        )));
      }
      images.push(...b.images);
    } catch {
      failed++;
    }
  }

  const unique = [...new Set(images)];
  const imageFailed = await runAll(unique.map((u) => cacheImage(u)), (done) => onProgress(parts.length + done, parts.length + unique.length));
  return { failed: failed + imageFailed, total: parts.length + unique.length };
}
