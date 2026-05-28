/**
 * Festival / series detail — all of the user's days at this event series.
 */

import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export function SeriesPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["series", slug],
    queryFn: () => api.getSeries(slug!),
    enabled: !!slug,
  });

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editYear, setEditYear] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (q.isLoading) {
    return <div className="py-16 text-center text-text-subtle font-mono text-sm animate-pulse">Loading…</div>;
  }
  if (q.isError || !q.data) {
    return (
      <div className="py-16 text-center font-mono text-sm text-accent-pink">
        Festival not found. <Link to="/app/festivals" className="underline text-text-muted">Back to festivals</Link>
      </div>
    );
  }

  const { series, concerts, stats } = q.data;

  const startEdit = () => {
    setEditName(series.name);
    setEditYear(series.year != null ? String(series.year) : "");
    setSaveError(null);
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setSaveError(null); };

  const saveEdit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const year = editYear.trim() ? parseInt(editYear, 10) : null;
      const res = await api.patchSeries(series.slug, {
        name: editName.trim() || undefined,
        year,
      });
      // Slug may have changed — invalidate old key and navigate to new slug
      await qc.invalidateQueries({ queryKey: ["series"] });
      setEditing(false);
      if (res.series.slug !== slug) {
        navigate(`/app/festivals/${res.series.slug}`, { replace: true });
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Link to="/app/festivals" className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors">
        ← Festivals
      </Link>

      <div className="mt-4 mb-6">
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-base focus:outline-none focus:border-accent-lime"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Year</label>
              <input
                type="number"
                value={editYear}
                onChange={(e) => setEditYear(e.target.value)}
                placeholder="e.g. 2024"
                className="w-40 rounded border border-border bg-surface px-3 py-2 text-sm text-text-base focus:outline-none focus:border-accent-lime"
              />
            </div>
            {saveError && <p className="text-xs font-mono text-accent-pink">{saveError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => void saveEdit()}
                disabled={saving}
                className="text-xs font-mono px-3 py-1.5 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="text-xs font-mono px-3 py-1.5 rounded border border-border text-text-muted hover:text-text-base transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display uppercase text-3xl mb-1">{series.name}</h1>
              {series.year && <p className="text-sm text-text-muted font-mono">{series.year}</p>}
            </div>
            <button
              onClick={startEdit}
              className="mt-1 text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors shrink-0"
            >
              Edit
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <div className="font-mono text-2xl text-text-base">{stats.daysAttended}</div>
          <div className="text-xs text-text-muted mt-1">Days attended</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <div className="font-mono text-2xl text-text-base">{stats.uniqueArtists}</div>
          <div className="text-xs text-text-muted mt-1">Artists seen</div>
        </div>
      </div>

      <div className="space-y-3">
        {concerts.map((c) => (
          <Link
            key={c.id}
            to={`/app/concerts/${c.id}`}
            className="block rounded-lg border border-border bg-surface p-4 hover:border-accent-lime transition-colors"
          >
            <div className="flex items-baseline justify-between mb-2">
              <time className="font-mono text-sm text-text-muted">{fmtDate(c.date)}</time>
              {c.venue && (
                <span className="text-xs text-text-subtle">
                  {c.venue.name}{c.venue.city ? ` · ${c.venue.city}` : ""}
                </span>
              )}
            </div>
            {c.artists.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {c.artists.map((a) => (
                  <span
                    key={a.slug}
                    className="text-xs px-2 py-0.5 rounded border border-border bg-surface-2 text-text-muted font-mono"
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
