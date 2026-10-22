/**
 * Offline edits. Attendance changes (a show's status, notes, ticket price —
 * and the festival "every day" switch) made without a connection are kept on
 * the device and sent when it's back. The change shows straight away: the
 * saved copies of the affected show pages are updated to match.
 *
 * Other edits (lineups, uploads, new shows) still need a connection.
 */

import type { QueryClient } from "@tanstack/react-query";

const KEY = "tagg.outbox";
const ATTENDANCE_FIELDS = new Set(["status", "personalNotes", "ticketPricePaid", "ticketPriceCurrency"]);

export interface OutboxItem { path: string; method: string; body: string; at: number }

let qc: QueryClient | null = null;
const listeners = new Set<(n: number) => void>();

function read(): OutboxItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as OutboxItem[]; } catch { return []; }
}
function write(items: OutboxItem[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l(items.length));
}

export const outboxCount = (): number => read().length;
export function onOutboxChange(fn: (n: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Whether this request may wait in the outbox: attendance-only edits. */
export function queueable(path: string, method: string, body: unknown): boolean {
  if (method !== "PATCH" || typeof body !== "string") return false;
  let data: Record<string, unknown>;
  try { data = JSON.parse(body) as Record<string, unknown>; } catch { return false; }
  if (/^\/concerts\/[0-9a-f-]{36}$/i.test(path)) return Object.keys(data).every((k) => ATTENDANCE_FIELDS.has(k));
  if (/^\/festivals\/[^/]+\/attendance$/.test(path)) return Object.keys(data).every((k) => k === "status");
  if (path === "/concerts/batch") {
    const updates = (data.updates as Record<string, unknown>[] | undefined) ?? [];
    return updates.every((u) => Object.keys(u).every((k) => k === "id" || ATTENDANCE_FIELDS.has(k)));
  }
  return false;
}

/** Put the change in the outbox and show it on the saved copies of the pages it affects. */
export async function enqueue(path: string, method: string, body: string): Promise<void> {
  write([...read(), { path, method, body, at: Date.now() }]);
  const data = JSON.parse(body) as Record<string, unknown>;
  const edits: { id: string; fields: Record<string, unknown> }[] =
    path === "/concerts/batch"
      ? ((data.updates as Record<string, unknown>[]) ?? []).map(({ id, ...fields }) => ({ id: String(id), fields }))
      : /^\/concerts\//.test(path) ? [{ id: path.split("/")[2]!, fields: data }] : [];
  for (const e of edits) await applyLocally(e.id, e.fields);
}

/** A show's detail response with the attendance edit applied. */
function patched(json: unknown, id: string, fields: Record<string, unknown>): unknown {
  const r = json as { concert?: { id?: string; status?: unknown; attendance?: Record<string, unknown> | null } };
  if (!r?.concert || r.concert.id !== id) return null;
  return {
    ...r,
    concert: {
      ...r.concert,
      ...(fields.status ? { status: fields.status } : {}),
      attendance: { ...(r.concert.attendance ?? {}), ...fields },
    },
  };
}

async function applyLocally(id: string, fields: Record<string, unknown>): Promise<void> {
  // In-memory (React Query) copies.
  qc?.getQueryCache().findAll({ queryKey: ["concerts"] }).forEach((q) => {
    const next = patched(q.state.data, id, fields);
    if (next) qc!.setQueryData(q.queryKey, next);
  });
  // Saved copies the service worker serves offline (by id and by slug).
  if (!("caches" in window)) return;
  const cache = await caches.open("api-cache");
  for (const req of await cache.keys()) {
    if (!/\/api\/concerts\/[^/?]+$/.test(new URL(req.url).pathname)) continue;
    const res = await cache.match(req);
    const next = res ? patched(await res.clone().json().catch(() => null), id, fields) : null;
    if (next) await cache.put(req, new Response(JSON.stringify(next), { headers: { "Content-Type": "application/json" } }));
  }
}

let flushing = false;
/** Send waiting changes, oldest first. Stops at the first network failure. */
export async function flushOutbox(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  let sent = 0;
  try {
    for (;;) {
      const [item, ...rest] = read();
      if (!item) break;
      let res: Response;
      try {
        res = await fetch(`/api${item.path}`, {
          method: item.method, credentials: "include", body: item.body, headers: { "Content-Type": "application/json" },
        });
      } catch {
        break; // still offline
      }
      // Done, or refused for good (e.g. the show was deleted) — either way it leaves the outbox.
      if (res.ok || (res.status >= 400 && res.status < 500 && ![401, 408, 429].includes(res.status))) {
        write(rest);
        sent++;
      } else {
        break; // signed out, rate-limited or server trouble: try again later
      }
    }
  } finally {
    flushing = false;
  }
  if (sent > 0) await qc?.invalidateQueries();
}

/** Wire up: flush when the connection returns, on launch, and every minute. */
export function startOutbox(client: QueryClient): void {
  qc = client;
  window.addEventListener("online", () => void flushOutbox());
  setInterval(() => void flushOutbox(), 60_000);
  void flushOutbox();
}
