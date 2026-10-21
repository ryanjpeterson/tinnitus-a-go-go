/**
 * Admin data cleanup — /admin/data
 *
 *   Duplicates  suggested duplicate venues/artists; pick the one to keep, preview, merge
 *   Health      setlist finder progress, then problems in the data with one-tap fixes
 *   History     every merge, with undo for the most recent one
 */

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type DataEntityType, type DupGroup, type HealthCheck, type MergePreview } from "@/lib/api";
import { fmtDate, plural } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState, List, Loading, PageHeader, Sheet, Tabs } from "@/components/ui/kit";

type View = "duplicates" | "health" | "history";

const VIEWS: { value: View; label: string }[] = [
  { value: "duplicates", label: "Duplicates" },
  { value: "health", label: "Health" },
  { value: "history", label: "History" },
];

const REASON_LABEL: Record<DupGroup["reason"], string> = {
  "same-name": "Same name",
  "same-core": "Same name apart from Theatre / Centre / Hall…",
  "similar-spelling": "Similar spelling",
};

function years(first: string | null, last: string | null): string | null {
  if (!first) return null;
  const a = first.slice(0, 4);
  const b = last?.slice(0, 4);
  return b && b !== a ? `${a}–${b}` : a;
}

// ─────────────────────────────────────────────────────────────────────────────
// Duplicates
// ─────────────────────────────────────────────────────────────────────────────

function DuplicateGroup({ type, group }: { type: DataEntityType; group: DupGroup }) {
  const qc = useQueryClient();
  const [keepId, setKeepId] = useState(group.records[0]!.id);
  const [previews, setPreviews] = useState<MergePreview[] | null>(null);
  const removeIds = group.records.filter((r) => r.id !== keepId).map((r) => r.id);
  const keep = group.records.find((r) => r.id === keepId)!;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin/data"] });
    void qc.invalidateQueries({ queryKey: [type === "venue" ? "venues" : "artists"] });
  };

  const preview = useMutation({
    mutationFn: () => Promise.all(removeIds.map((id) => api.dataMergePreview(type, keepId, id))),
    onSuccess: setPreviews,
  });
  const merge = useMutation({
    mutationFn: () => api.dataMerge(type, keepId, removeIds),
    onSuccess: () => { setPreviews(null); refresh(); },
  });
  const dismiss = useMutation({
    mutationFn: () => api.dataDismiss(type, group.records.map((r) => r.id)),
    onSuccess: refresh,
  });

  return (
    <div className="card overflow-hidden">
      <p className="border-b border-border px-4 py-2.5 text-sm font-semibold text-text-muted">{REASON_LABEL[group.reason]}</p>
      <div className="divide-y divide-border">
        {group.records.map((r) => {
          const href = `/${type === "venue" ? "venues" : "artists"}/${r.slug}`;
          return (
            <label key={r.id} className="flex min-h-[64px] cursor-pointer items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
              <input type="radio" name={`keep-${group.records[0]!.id}`} checked={r.id === keepId}
                onChange={() => setKeepId(r.id)} className="h-5 w-5 shrink-0 accent-[#A8FF3E]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                <span className="meta block truncate">
                  {[r.sub, plural(r.showCount, "show"), years(r.firstDate, r.lastDate)].filter(Boolean).join(" · ")}
                </span>
              </span>
              {r.id === keepId && <span className="shrink-0 text-xs font-semibold text-accent-lime">Keep</span>}
              <Link to={href} className="link-action shrink-0" onClick={(e) => e.stopPropagation()}>View</Link>
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        <Button size="sm" onClick={() => preview.mutate()} disabled={preview.isPending}>
          {preview.isPending ? "Checking…" : `Merge into ${keep.name}`}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => dismiss.mutate()} disabled={dismiss.isPending}>
          Not duplicates
        </Button>
        {(preview.isError || dismiss.isError) && <span className="text-sm text-accent-pink">Something went wrong — try again.</span>}
      </div>

      {previews && (
        <Sheet title={`Merge into ${keep.name}?`} onClose={() => setPreviews(null)}
          subtitle={`${plural(previews.length, type)} will be removed. You can undo this from History.`}>
          <div className="space-y-4 p-5">
            {previews.map((p) => (
              <div key={p.remove.id} className="rounded-xl bg-surface-2 p-4">
                <p className="text-[15px] font-semibold">{p.remove.name} → {p.keep.name}</p>
                <p className="meta mt-1">
                  {p.moves.length > 0 ? `Moves ${p.moves.map((m) => `${m.count} ${m.label}`).join(", ")}.` : "Nothing to move."}
                  {p.fills.length > 0 && ` Fills in ${p.fills.join(", ")}.`}
                  {type === "venue" && ` "${p.remove.name}" is kept as an alias.`}
                </p>
              </div>
            ))}
            {merge.isError && <p className="text-sm text-accent-pink">{(merge.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPreviews(null)}>Cancel</Button>
              <Button onClick={() => merge.mutate()} disabled={merge.isPending}>{merge.isPending ? "Merging…" : "Merge"}</Button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Duplicates() {
  const [type, setType] = useState<DataEntityType>("venue");
  const q = useQuery({ queryKey: ["admin/data", "duplicates", type], queryFn: () => api.dataDuplicates(type) });

  return (
    <div className="space-y-4">
      <Tabs value={type} onChange={setType} options={[{ value: "venue", label: "Venues" }, { value: "artist", label: "Artists" }]} />
      {q.isLoading ? <Loading /> : q.isError ? (
        <EmptyState tone="error" title="Couldn't look for duplicates." />
      ) : q.data!.groups.length === 0 ? (
        <EmptyState title={`No duplicate ${type}s found.`} body="Names are compared ignoring case, accents, punctuation and a leading “The”." />
      ) : (
        q.data!.groups.map((g) => <DuplicateGroup key={g.records.map((r) => r.id).join()} type={type} group={g} />)
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────────────────────────────────────

function Check({ check }: { check: HealthCheck }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const fix = useMutation({
    mutationFn: (args: { value?: string; to?: string }) => api.dataHealthFix(check.id, args.value, args.to),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin/data"] }),
  });
  const n = check.items.length;
  const shown = open ? check.items : check.items.slice(0, 5);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{check.title}</p>
          <p className="meta">{check.description}</p>
        </div>
        <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold ${n > 0 ? "bg-yellow-950 text-yellow-300" : "bg-lime-950 text-accent-lime"}`}>
          {n > 0 ? n : "✓"}
        </span>
      </div>

      {check.cityGroups && check.cityGroups.length > 0 && (
        <div className="divide-y divide-border border-t border-border">
          {check.cityGroups.map((g) => (
            <div key={g.spellings[0]!.city} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="meta mr-1">Use:</span>
              {g.spellings.map((sp) => (
                <Button key={sp.city} size="sm" variant="secondary" disabled={fix.isPending}
                  onClick={() => fix.mutate({ value: sp.city, to: sp.city })}>
                  {sp.city} <span className="text-text-subtle">({sp.venues})</span>
                </Button>
              ))}
            </div>
          ))}
        </div>
      )}

      {!check.cityGroups && n > 0 && (
        <div className="divide-y divide-border border-t border-border">
          {shown.map((it) => (
            it.href ? (
              <Link key={it.id} to={it.href} className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2 hover:bg-surface-2/60">
                <span className="truncate text-[15px]">{it.label}</span>
                {it.sub && <span className="meta shrink-0">{it.sub}</span>}
              </Link>
            ) : (
              <p key={it.id} className="px-4 py-2 text-[15px]">{it.label}</p>
            )
          ))}
          {n > 5 && (
            <button className="link-action w-full px-4 py-2.5 text-left" onClick={() => setOpen((v) => !v)}>
              {open ? "Show less" : `Show all ${n}`}
            </button>
          )}
        </div>
      )}

      {check.fix && n > 0 && (
        <div className="flex items-center gap-3 border-t border-border px-4 py-3">
          <Button size="sm" variant={check.id.startsWith("orphan") ? "danger" : "secondary"} disabled={fix.isPending}
            onClick={() => { if (window.confirm(check.fix!.confirm)) fix.mutate({}); }}>
            {fix.isPending ? "Working…" : check.fix.label}
          </Button>
          {fix.isSuccess && <span className="meta">Done.</span>}
          {fix.isError && <span className="text-sm text-accent-pink">{(fix.error as Error).message}</span>}
        </div>
      )}
    </div>
  );
}

function SetlistFinder() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin/data", "setlist-finder"],
    queryFn: () => api.setlistFinderStatus(),
    refetchInterval: 15_000, // numbers move while a batch runs
  });
  const run = useMutation({
    mutationFn: () => api.setlistFinderRun(),
    onSuccess: () => setTimeout(() => void qc.invalidateQueries({ queryKey: ["admin/data", "setlist-finder"] }), 5000),
  });
  const d = q.data;
  if (!d) return null;

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Setlist finder</p>
          <p className="meta">
            {d.available
              ? `Searches setlist.fm every hour for artists on attended shows without a setlist, 30 at a time. ${d.callsToday} of ${d.dailyBudget} calls used today${d.callsToday >= d.dailyBudget ? " — paused until midnight UTC" : ""}.`
              : "Off — set SETLISTFM_API_KEY for the worker to turn it on."}
          </p>
        </div>
        {d.available && (
          <Button size="sm" variant="secondary" disabled={run.isPending || d.stillToCheck === 0} onClick={() => run.mutate()}>
            {run.isSuccess ? "Queued" : "Run now"}
          </Button>
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Have a setlist", `${d.withSetlist} / ${d.total}`],
          ["Found automatically", d.foundAutomatically],
          ["Not on setlist.fm yet", d.notOnSetlistfm],
          ["Still to check", d.stillToCheck],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-surface-2 px-3 py-2.5">
            <dt className="eyebrow">{label}</dt>
            <dd className="font-display text-2xl">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Health() {
  const q = useQuery({ queryKey: ["admin/data", "health"], queryFn: () => api.dataHealth() });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <EmptyState tone="error" title="Couldn't run the checks." />;
  // Problems first, clean checks after.
  const checks = [...q.data!.checks].sort((a, b) => Number(b.items.length > 0) - Number(a.items.length > 0));
  return (
    <div className="space-y-4">
      <SetlistFinder />
      {checks.map((c) => <Check key={c.id} check={c} />)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────────────────────

function History() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin/data", "merges"], queryFn: () => api.dataMerges() });
  const undo = useMutation({
    mutationFn: (id: string) => api.dataUndoMerge(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin/data"] });
      void qc.invalidateQueries({ queryKey: ["venues"] });
      void qc.invalidateQueries({ queryKey: ["artists"] });
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.isError) return <EmptyState tone="error" title="Couldn't load the history." />;
  if (q.data!.merges.length === 0) return <EmptyState title="No merges yet." body="Merges you make appear here, and the latest can be undone." />;

  return (
    <div className="space-y-3">
      <List>
        {q.data!.merges.map((m) => (
          <div key={m.id} className="flex min-h-[64px] items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className={`truncate text-[15px] font-semibold ${m.undoneAt ? "text-text-subtle line-through" : ""}`}>
                {m.removedName} → {m.keptName}
              </p>
              <p className="meta">
                {m.entityType === "venue" ? "Venue" : "Artist"} · {fmtDate(m.createdAt.slice(0, 10))}
                {m.undoneAt && " · undone"}
              </p>
            </div>
            {m.canUndo && (
              <Button size="sm" variant="secondary" disabled={undo.isPending}
                onClick={() => { if (window.confirm(`Undo merging "${m.removedName}" into "${m.keptName}"?`)) undo.mutate(m.id); }}>
                {undo.isPending ? "Undoing…" : "Undo"}
              </Button>
            )}
          </div>
        ))}
      </List>
      {undo.isError && <p className="text-sm text-accent-pink">{(undo.error as Error).message}</p>}
      <p className="meta px-0.5">Only the most recent merge can be undone.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function DataCleanupPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const view: View = raw === "health" || raw === "history" ? raw : "duplicates";

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Data cleanup" />
      <Tabs value={view} options={VIEWS}
        onChange={(v) => setParams(v === "duplicates" ? {} : { tab: v }, { replace: true })} />
      {view === "duplicates" ? <Duplicates /> : view === "health" ? <Health /> : <History />}
    </div>
  );
}
