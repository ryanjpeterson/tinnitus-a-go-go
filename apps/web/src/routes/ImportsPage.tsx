import { useState, useRef, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type ImportRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState, List, PageHeader, Section } from "@/components/ui/kit";
import type { ExportFormat } from "@/lib/api";

const STATUS_COLORS: Record<ImportRow["status"], string> = {
  queued: "text-text-muted",
  running: "text-accent-lime",
  completed: "text-emerald-400",
  failed: "text-accent-pink",
};

export function ImportsPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const listQuery = useQuery({
    queryKey: ["imports"],
    queryFn: () => api.listImports(),
    refetchInterval: 3_000,
  });

  // Poll the active import every second until it terminates.
  const activeQuery = useQuery({
    queryKey: ["imports", activeId],
    queryFn: () => api.getImport(activeId!),
    enabled: !!activeId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "completed" || s === "failed" ? false : 1_000;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadCsvImport(file),
    onSuccess: ({ importId }) => {
      setActiveId(importId);
      setError(null);
      qc.invalidateQueries({ queryKey: ["imports"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Upload failed."),
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Pick a .csv file first.");
      return;
    }
    uploadMutation.mutate(file);
  };

  const active = activeQuery.data;
  const pct =
    active && active.totalRows > 0
      ? Math.min(100, Math.round((active.processedRows / active.totalRows) * 100))
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Import & export" />

      <ExportSection />

      <h2 className="h-section px-0.5">Import</h2>
      <p className="meta -mt-3">
        Upload a <span className="font-semibold text-text-base">Concerts - Shows.csv</span>. Rows are grouped by date and
        venue, artists and venues are matched or created, and past shows are marked attended.
      </p>

      <form onSubmit={handleSubmit} className="card space-y-4 p-4 sm:p-5">
        <label className="label" htmlFor="csv-file">CSV file</label>
        <input
          id="csv-file"
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm text-text-muted file:mr-4 file:h-10 file:rounded-control file:border-0 file:bg-surface-2 file:px-4 file:text-sm file:font-semibold file:text-text-base hover:file:bg-border"
        />
        {error && <p className="text-sm text-accent-pink">{error}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={uploadMutation.isPending}>
            {uploadMutation.isPending ? "Uploading…" : "Start import"}
          </Button>
          <span className="meta">5 MB max</span>
        </div>
      </form>

      {active && (
        <Section
          title={active.originalFilename ?? "Import"}
          action={<span className={`text-sm font-semibold capitalize ${STATUS_COLORS[active.status]}`}>{active.status}</span>}
        >
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent-lime transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="meta mt-2">{active.processedRows} / {active.totalRows} shows · {pct}%</p>

          {active.summary && (
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.entries(active.summary).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-surface-2 px-3 py-2.5">
                  <dt className="eyebrow">{k.replace(/([A-Z])/g, " $1")}</dt>
                  <dd className="font-display text-2xl">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {active.errorsSample && active.errorsSample.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-accent-pink">
                {active.errorCount} warning{active.errorCount === 1 ? "" : "s"}
              </summary>
              <ul className="meta mt-2 space-y-1">
                {active.errorsSample.map((e, i) => (
                  <li key={i}>Row {e.row}: {e.message}</li>
                ))}
              </ul>
            </details>
          )}
        </Section>
      )}

      <section className="space-y-3">
        <h2 className="h-section px-0.5">Recent imports</h2>
        {listQuery.data && listQuery.data.imports.length > 0 ? (
          <List>
            {listQuery.data.imports.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setActiveId(row.id)}
                className="flex min-h-[64px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/70"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{row.originalFilename ?? row.id}</span>
                  <span className="meta">{new Date(row.createdAt).toLocaleString()}</span>
                </span>
                <span className={`shrink-0 text-sm font-semibold capitalize ${STATUS_COLORS[row.status]}`}>{row.status}</span>
              </button>
            ))}
          </List>
        ) : (
          <EmptyState title="No imports yet." />
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

const EXPORTS: { format: ExportFormat; label: string; sub: string }[] = [
  { format: "csv", label: "CSV", sub: "Same columns as the import file, plus setlists — can be imported again" },
  { format: "json", label: "JSON", sub: "Every show with venue, status, notes, ticket, lineup and setlists" },
  { format: "md", label: "Markdown", sub: "A readable log grouped by year, with setlists" },
];

function ExportSection() {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (format: ExportFormat): Promise<void> => {
    setBusy(format);
    setError(null);
    try {
      const blob = await api.exportLog(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `concerts-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      // Safari starts the download asynchronously; revoking immediately can cancel it.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("Export failed — try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="h-section px-0.5">Export</h2>
      <List>
        {EXPORTS.map((e) => (
          <button key={e.format} type="button" onClick={() => void download(e.format)} disabled={busy !== null}
            className="flex min-h-[64px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/70 disabled:opacity-60">
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold">{e.label}</span>
              <span className="meta block">{e.sub}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-accent-lime">{busy === e.format ? "Preparing…" : "Download"}</span>
          </button>
        ))}
      </List>
      {error && <p className="text-sm text-accent-pink">{error}</p>}
    </section>
  );
}
