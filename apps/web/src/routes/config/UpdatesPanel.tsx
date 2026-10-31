/**
 * Newer jimbo-ui releases, in the About tab of the jimbo-ui config section.
 *
 * Reads releases.json from GitHub (once a day per person, only when the
 * section or its link is shown), compares it with the foundation this app was
 * built from, and sorts what updating would change into: to do in the app,
 * changes to components it uses, what comes with the update, and what's new
 * if it wants it. An app can't update itself — updating is a code change in
 * the app's Claude session — so it hands over the request to paste there.
 * Shows nothing extra when GitHub can't be reached.
 */

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Section } from "@/components/ui/kit";
import { Button } from "@/components/ui/button";
import { JIMBO_APP, JIMBO_UI, fetchReleases, updatesFor, type ReleaseItem, type Releases } from "@/lib/jimbo";

const DAY = 24 * 60 * 60 * 1000;
export const UPDATE_REQUEST = "Update this app to the latest jimbo-ui.";

/** The published releases and what they change for this app; `updates` is null when it's current or they can't be read. */
export function useJimboUpdates(enabled = true) {
  const { data } = useQuery({ queryKey: ["jimbo-ui", "releases"], queryFn: () => fetchReleases(), staleTime: DAY, retry: false, enabled });
  const updates = data ? updatesFor(data, JIMBO_UI.version, JIMBO_APP?.components?.uses) : null;
  return { releases: data ?? null, updates };
}

/** `code` and **bold** from the changelog; everything else as text. */
function Md({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("`") ? <code key={i}>{part.slice(1, -1)}</code>
        : part.startsWith("**") ? <strong key={i} className="font-semibold text-text-base">{part.slice(2, -2)}</strong>
        : part)}
    </>
  );
}

function Rows<T>({ title, hint, rows, render }: { title: string; hint: string; rows: T[]; render: (row: T) => ReactNode }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, 5);
  return (
    <Section title={title} count={rows.length} flush>
      <p className="px-4 pt-3 text-xs text-text-subtle">{hint}</p>
      <div className="divide-y divide-border">
        {shown.map((row, i) => <div key={i} className="px-4 py-3 text-sm leading-relaxed text-text-muted">{render(row)}</div>)}
      </div>
      {rows.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="link-action flex h-11 w-full items-center justify-center border-t border-border text-sm">
          Show all {rows.length}
        </button>
      )}
    </Section>
  );
}

const Version = ({ v }: { v: string }) => <span className="mr-2 font-mono text-xs text-text-subtle">{v}</span>;
const item = ({ version, item }: { version: string; item: ReleaseItem }) => <><Version v={version} /><Md text={item.text} /></>;

/**
 * What updating to the latest release changes for an app on `current` that
 * uses `uses`. The About tab passes the live releases; the showcase passes
 * fixed ones to show an app behind.
 */
export function JimboUpdates({ releases, current = JIMBO_UI.version, uses = JIMBO_APP?.components?.uses }: {
  releases: Releases | null;
  current?: string;
  uses?: string[];
}) {
  const [copied, setCopied] = useState(false);
  if (!releases) return null;
  const u = updatesFor(releases, current, uses);
  if (!u) {
    return (
      <div className="card flex min-h-[56px] items-center justify-between gap-4 px-4 py-3">
        <span className="text-15 font-semibold">Up to date</span>
        <span className="text-sm text-text-muted">{current} is the latest release</span>
      </div>
    );
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(UPDATE_REQUEST); setCopied(true); } catch { /* the text is on screen */ }
  };
  return (
    <div className="space-y-6">
      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="yellow" dot>Update available</Badge>
          <span className="text-sm text-text-muted">
            {u.newer.length === 1 ? "1 release" : `${u.newer.length} releases`} behind
          </span>
        </div>
        <p className="font-display text-2xl leading-tight">jimbo-ui {u.latest} is out</p>
        <p className="text-sm text-text-muted">
          This app is on {current}. Updating is a change to the app's code: ask for it in the app's Claude session with
          {" "}<q className="text-text-base">{UPDATE_REQUEST}</q>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void copy()}>{copied ? "Copied" : "Copy the request"}</Button>
          <a href={JIMBO_UI.changelog} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Full changelog</a>
        </div>
        <ul className="space-y-2 border-t border-border pt-4">
          {u.newer.map((r) => (
            <li key={r.version} className="text-sm text-text-muted"><Version v={r.version} /><Md text={r.summary || "Fixes and small changes."} /></li>
          ))}
        </ul>
      </div>

      <Rows title="To do in the app" hint="Steps the update carries out in this app's own code, oldest release first."
        rows={u.toDo} render={({ version, step }) => <><Version v={version} /><Md text={step} /></>} />
      <Rows title="Changes to components you use" hint={uses ? "Fixes and changes to kit components this app uses — the update ports them." : "Fixes and changes to kit components. List the app's components in jimbo-ui.json to see only its own."}
        rows={u.yours} render={item} />
      <Rows title="Comes with the update" hint="Foundation and general changes: they arrive with the copied files."
        rows={u.included} render={item} />
      <Rows title="New, if you want it" hint="Additions the app can take up when it needs them."
        rows={u.optional} render={item} />
      {u.elsewhere > 0 && (
        <p className="meta px-0.5">{u.elsewhere === 1 ? "1 more change touches" : `${u.elsewhere} more changes touch`} only components this app doesn't use.</p>
      )}
    </div>
  );
}
