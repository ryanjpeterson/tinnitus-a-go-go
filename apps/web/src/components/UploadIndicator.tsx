/**
 * UploadIndicator — the background upload queue, as a spinning progress ring
 * in the bottom-right corner (above the tab bar on phones). Tap it for the
 * list, with Pause / Resume, Cancel and Retry.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import {
  cancelUploads, clearFinished, isActive, pauseUploads, resumeUploads, retryFailed, useUploads, type UploadJob,
} from "@/lib/uploads";

const R = 24;
const C = 2 * Math.PI * R;

function statusText(j: UploadJob, paused: boolean): string {
  switch (j.status) {
    case "queued": return paused ? "Paused" : "Waiting";
    case "checking": return "Checking…";
    case "uploading": return `${j.progress}%`;
    case "done": return "Uploaded";
    case "skipped": return "Already there";
    case "failed": return j.error ?? "Failed";
  }
}

export function UploadIndicator() {
  const { jobs, paused } = useUploads();
  const [open, setOpen] = useState(false);

  const active = jobs.filter(isActive);
  const failed = jobs.filter((j) => j.status === "failed");
  const finished = jobs.filter((j) => j.status === "done" || j.status === "skipped").length;
  const current = jobs.find((j) => j.status === "uploading");
  const working = active.length > 0 && !paused;
  // Overall: finished files plus the part of the one in flight.
  const overall = jobs.length === 0 ? 0 : (finished + failed.length + (current ? current.progress / 100 : 0)) / jobs.length;

  // All done and nothing failed: show the tick briefly, then tidy away.
  useEffect(() => {
    if (jobs.length > 0 && active.length === 0 && failed.length === 0) {
      const t = setTimeout(() => { clearFinished(); setOpen(false); }, 4000);
      return () => clearTimeout(t);
    }
  }, [jobs.length, active.length, failed.length]);

  if (jobs.length === 0) return null;

  return (
    <div className="fixed right-4 z-[45] flex flex-col items-end gap-2 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] sm:bottom-6 sm:right-6">
      {open && (
        <div className="w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-surface/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">
              {active.length > 0
                ? `${paused ? "Paused" : "Uploading"} · ${active.length} left`
                : failed.length > 0 ? `${failed.length} failed` : "All uploaded"}
            </p>
            <button onClick={() => setOpen(false)} aria-label="Hide uploads" className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-surface-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </div>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto">
            {jobs.slice(-40).reverse().map((j) => (
              <li key={j.id} className="flex items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{j.file.name}</p>
                  <Link to={`/shows/${j.concertId}`} onClick={() => setOpen(false)} className="block truncate text-xs text-text-subtle hover:text-accent-lime">{j.label}</Link>
                  {j.status === "uploading" && (
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent-lime transition-all" style={{ width: `${j.progress}%` }} />
                    </div>
                  )}
                </div>
                <span className={clsx("shrink-0 text-xs font-semibold",
                  j.status === "failed" ? "text-accent-pink" : j.status === "done" ? "text-accent-lime" : "text-text-muted")}>
                  {statusText(j, paused)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 border-t border-border p-3">
            {active.length > 0 && (paused
              ? <button onClick={resumeUploads} className="btn btn-sm btn-primary">Resume</button>
              : <button onClick={pauseUploads} className="btn btn-sm btn-secondary">Pause</button>)}
            {failed.length > 0 && <button onClick={retryFailed} className="btn btn-sm btn-secondary">Retry failed</button>}
            {active.length > 0 && (
              <button onClick={() => { if (window.confirm(`Cancel ${active.length} upload${active.length === 1 ? "" : "s"}?`)) cancelUploads(); }}
                className="btn btn-sm btn-ghost">Cancel</button>
            )}
            {active.length === 0 && <button onClick={() => { clearFinished(); if (failed.length === 0) setOpen(false); }} className="btn btn-sm btn-ghost">Clear</button>}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Uploads: ${active.length} left${paused ? ", paused" : ""}`}
        className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-surface/90 shadow-xl shadow-black/50 backdrop-blur-xl transition-transform active:scale-95"
      >
        <svg width="56" height="56" viewBox="0 0 56 56" className="absolute inset-0 -rotate-90">
          <circle cx="28" cy="28" r={R} fill="none" stroke="currentColor" strokeWidth="4" className="text-white/10" />
          {/* Overall progress */}
          <circle cx="28" cy="28" r={R} fill="none" strokeWidth="4" strokeLinecap="round"
            className={failed.length > 0 && active.length === 0 ? "stroke-accent-pink" : "stroke-accent-lime"}
            strokeDasharray={C} strokeDashoffset={C * (1 - overall)} style={{ transition: "stroke-dashoffset 300ms ease" }} />
        </svg>
        {/* The swirl while working */}
        {working && (
          <svg width="56" height="56" viewBox="0 0 56 56" className="absolute inset-0 animate-spin [animation-duration:1.2s]">
            <circle cx="28" cy="28" r={R - 7} fill="none" strokeWidth="2.5" strokeLinecap="round"
              className="stroke-accent-lime/70" strokeDasharray={`${(R - 7) * 2.2} ${(R - 7) * 6}`} />
          </svg>
        )}
        <span className="relative text-[13px] font-bold tabular-nums">
          {active.length > 0
            ? (paused
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : active.length)
            : failed.length > 0
              ? <span className="text-accent-pink">!</span>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-accent-lime" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>}
        </span>
      </button>
    </div>
  );
}
