/**
 * Background photo/video uploads. Files are queued and sent one at a time
 * while you keep using the app — on any page — with progress in the corner
 * (UploadIndicator). The queue can be paused and resumed; pausing stops the
 * file in flight, which starts over from the beginning on resume.
 *
 * Queued files live in memory only: closing or reloading the app drops
 * whatever hasn't uploaded yet (the browser warns first).
 */

import { useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";

export type UploadStatus = "queued" | "checking" | "uploading" | "done" | "skipped" | "failed";

export interface UploadJob {
  id: string;
  concertId: string;
  /** Show name, for the queue list. */
  label: string;
  file: File;
  /** Tag this artist on the photo once it's uploaded. */
  artistId?: string;
  status: UploadStatus;
  progress: number;
  error?: string;
}

interface State { jobs: UploadJob[]; paused: boolean }

let state: State = { jobs: [], paused: false };
const listeners = new Set<() => void>();
let qc: QueryClient | null = null;
let running = false;
let inFlight: AbortController | null = null;

function set(next: Partial<State>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
function update(id: string, patch: Partial<UploadJob>): void {
  set({ jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) });
}

export function useUploads(): State {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
  );
}

export const isActive = (j: UploadJob) => j.status === "queued" || j.status === "checking" || j.status === "uploading";

/** Queue files for a show. Returns how many were added. */
export function enqueueUploads(concertId: string, label: string, files: File[], opts: { artistId?: string } = {}): number {
  const jobs = files.map((file): UploadJob => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    concertId, label, file, artistId: opts.artistId, status: "queued", progress: 0,
  }));
  set({ jobs: [...state.jobs, ...jobs] });
  void run();
  return jobs.length;
}

export function pauseUploads(): void {
  set({ paused: true });
  inFlight?.abort();
}
export function resumeUploads(): void {
  set({ paused: false });
  void run();
}
/** Drop everything not yet uploaded. */
export function cancelUploads(): void {
  inFlight?.abort();
  set({ jobs: state.jobs.filter((j) => !isActive(j)), paused: false });
}
/** Forget finished, skipped and failed entries. */
export function clearFinished(): void {
  set({ jobs: state.jobs.filter(isActive) });
}
export function retryFailed(): void {
  set({ jobs: state.jobs.map((j) => (j.status === "failed" ? { ...j, status: "queued", progress: 0, error: undefined } : j)) });
  void run();
}

async function sha256(file: File): Promise<string | null> {
  // Hashing reads the whole file into memory — skip it for big videos and let the server catch duplicates.
  if (file.size > 150 * 1024 * 1024 || !crypto?.subtle) return null;
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

async function run(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      if (state.paused) break;
      const job = state.jobs.find((j) => j.status === "queued");
      if (!job) break;

      // Skip files already on this show (same content).
      update(job.id, { status: "checking", progress: 0 });
      const hash = await sha256(job.file);
      if (hash) {
        try {
          const existing = await api.listPhotos(job.concertId);
          if (existing.photos.some((p) => p.contentHash === hash)) {
            update(job.id, { status: "skipped" });
            continue;
          }
        } catch { /* offline or blip — let the upload decide */ }
      }
      if (state.paused) { update(job.id, { status: "queued" }); break; }

      update(job.id, { status: "uploading", progress: 0 });
      inFlight = new AbortController();
      try {
        const { photoId } = await api.uploadPhoto(job.concertId, job.file, (pct) => update(job.id, { progress: pct }), inFlight.signal);
        if (job.artistId) {
          try { await api.tagPhotoArtists(photoId, [job.artistId]); } catch { /* best-effort */ }
        }
        update(job.id, { status: "done", progress: 100 });
        void qc?.invalidateQueries({ queryKey: ["concerts", job.concertId, "photos"] });
      } catch (err) {
        if (state.paused) {
          update(job.id, { status: "queued", progress: 0 }); // starts over on resume
          break;
        }
        if (!state.jobs.some((j) => j.id === job.id)) continue; // cancelled
        if (err instanceof ApiError && err.status === 409) update(job.id, { status: "skipped" });
        else update(job.id, { status: "failed", error: err instanceof Error ? err.message : "Upload failed" });
      } finally {
        inFlight = null;
      }
    }
  } finally {
    running = false;
  }
}

/** Wire up: refresh galleries as files land, and warn before closing with uploads pending. */
export function startUploads(client: QueryClient): void {
  qc = client;
  window.addEventListener("beforeunload", (e) => {
    if (state.jobs.some(isActive)) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}
