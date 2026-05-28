import { Link } from "react-router-dom";
import { useState, useRef, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type ImportRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/Wordmark";

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
    <div className="min-h-full">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link to="/app">
          <Wordmark size="sm" svg />
        </Link>
        <Link to="/app" className="text-sm text-text-muted hover:text-text-base">
          ← back
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-display uppercase text-4xl mb-3">Imports</h1>
        <p className="text-text-muted">
          Upload a <code className="font-mono">Concerts - Shows.csv</code>. We'll group rows by
          (date, venue), upsert artists/venues, and mark past shows as attended.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 rounded-lg border border-border bg-surface p-6">
          <label className="block text-xs uppercase tracking-wider text-text-muted mb-2">
            CSV file
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm text-text-base file:mr-4 file:rounded file:border-0 file:bg-accent-lime file:px-4 file:py-2 file:text-bg file:font-medium hover:file:bg-accent-lime/90"
          />
          {error && (
            <div className="mt-3 text-sm text-accent-pink font-mono">{error}</div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <Button type="submit" disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? "Uploading…" : "Start import"}
            </Button>
            <span className="text-xs text-text-subtle font-mono">5 MB max</span>
          </div>
        </form>

        {active && (
          <section className="mt-8 rounded-lg border border-border bg-surface p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display uppercase text-2xl">
                {active.originalFilename ?? "Import"}
              </h2>
              <span
                className={`font-mono text-xs uppercase ${STATUS_COLORS[active.status]}`}
              >
                {active.status}
              </span>
            </div>

            <div className="mt-4 h-2 w-full overflow-hidden rounded bg-bg">
              <div
                className="h-full bg-accent-lime transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-text-muted font-mono">
              {active.processedRows} / {active.totalRows} shows · {pct}%
            </div>

            {active.summary && (
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {Object.entries(active.summary).map(([k, v]) => (
                  <div key={k} className="rounded border border-border px-3 py-2">
                    <dt className="text-xs uppercase tracking-wider text-text-muted">{k}</dt>
                    <dd className="font-mono text-lg">{v}</dd>
                  </div>
                ))}
              </dl>
            )}

            {active.errorsSample && active.errorsSample.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-accent-pink">
                  {active.errorCount} warning{active.errorCount === 1 ? "" : "s"}
                </summary>
                <ul className="mt-2 space-y-1 font-mono text-xs">
                  {active.errorsSample.map((e, i) => (
                    <li key={i}>
                      row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        <section className="mt-12">
          <h2 className="font-display uppercase text-xl mb-4">Recent imports</h2>
          {listQuery.data && listQuery.data.imports.length > 0 ? (
            <ul className="space-y-2 font-mono text-sm">
              {listQuery.data.imports.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between rounded border border-border px-3 py-2"
                >
                  <button
                    type="button"
                    className="text-left hover:text-accent-lime"
                    onClick={() => setActiveId(row.id)}
                  >
                    {row.originalFilename ?? row.id} · {new Date(row.createdAt).toLocaleString()}
                  </button>
                  <span className={`text-xs uppercase ${STATUS_COLORS[row.status]}`}>
                    {row.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">No imports yet.</p>
          )}
        </section>
      </main>
    </div>
  );
}
