/**
 * CopyEditorPage — admin CMS for editing all website copy.
 *
 * Route: /app/admin/copy  (RequireAdmin + RequireAuth gate in App.tsx)
 *
 * Shows all copy items grouped by section.  Each row has an inline edit area:
 * click "Edit" → textarea opens → Save / Cancel.
 * Changes invalidate the ["public/copy"] React Query cache so the next page
 * load picks up the new text without a full refresh.
 */

import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wordmark } from "@/components/Wordmark";
import { api, type CopyItem } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Section labels — maps DB section → human-readable header
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  landing: "Landing page",
  general: "General / site-wide",
};

function sectionLabel(s: string): string {
  return SECTION_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// CopyRow — single editable row
// ─────────────────────────────────────────────────────────────────────────────

function CopyRow({ item, onSaved }: { item: CopyItem; onSaved: (updated: CopyItem) => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(item.value);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const enterEdit = () => {
    setDraft(item.value);
    setError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.adminPatchCopyKey(item.key, draft);
      onSaved(res.item);
      // Invalidate public cache so LandingPage picks up the new text
      await qc.invalidateQueries({ queryKey: ["public/copy"] });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const isMultiline = item.value.length > 80;

  return (
    <div className="py-4 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-4 mb-1.5">
        <div className="min-w-0">
          <code className="text-xs font-mono text-accent-lime">{item.key}</code>
          {item.description && (
            <p className="text-xs text-text-subtle mt-0.5">{item.description}</p>
          )}
        </div>
        {!editing ? (
          <button
            onClick={enterEdit}
            className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors shrink-0"
          >
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            {error && <span className="text-xs text-accent-pink font-mono">{error}</span>}
            <button
              onClick={() => setEditing(false)}
              className="text-xs font-mono text-text-subtle hover:text-text-base transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving || draft === item.value}
              className="text-xs font-mono px-3 py-1 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <textarea
          rows={isMultiline ? 5 : 2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          className="w-full rounded border border-accent-lime/50 bg-surface-2 px-3 py-2 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime resize-y font-mono leading-relaxed"
        />
      ) : (
        <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">{item.value || <em className="text-text-subtle">(empty)</em>}</p>
      )}

      <p className="text-[10px] font-mono text-text-subtle mt-1.5 opacity-60">
        Updated: {new Date(item.updatedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function CopyEditorPage() {
  const q = useQuery({
    queryKey: ["admin/copy"],
    queryFn: () => api.adminGetCopy(),
    staleTime: 0, // always fresh in the editor
  });

  const [items, setItems] = useState<CopyItem[]>([]);

  // Sync query data into local state (allows optimistic updates via onSaved)
  const serverItems = q.data?.items ?? [];
  const displayItems = items.length > 0 ? items : serverItems;

  const handleSaved = (updated: CopyItem) => {
    setItems((prev) => {
      const source = prev.length > 0 ? prev : serverItems;
      return source.map((i) => (i.key === updated.key ? updated : i));
    });
  };

  // Group by section
  const sections = useMemo(() => {
    const map = new Map<string, CopyItem[]>();
    for (const item of displayItems) {
      const list = map.get(item.section) ?? [];
      list.push(item);
      map.set(item.section, list);
    }
    // Sort: landing first, then alpha
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "general") return -1;
      if (b === "general") return 1;
      return a.localeCompare(b);
    });
  }, [displayItems]);

  return (
    <div className="min-h-screen bg-bg text-text-base">
      {/* Nav */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 border-b border-border bg-bg/95 backdrop-blur">
        <Link to="/app">
          <Wordmark size="sm" svg />
        </Link>
        <Link to="/app" className="text-xs font-mono text-text-subtle hover:text-text-base">
          ← back to app
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8 sm:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-display uppercase mb-1">Copy Editor</h1>
          <p className="text-sm text-text-muted">
            Edit all website text. Changes take effect immediately (after a quick page refresh).
            Only you can see this page.
          </p>
        </div>

        {q.isLoading && (
          <p className="text-text-subtle font-mono text-sm animate-pulse">Loading…</p>
        )}
        {q.isError && (
          <p className="text-accent-pink font-mono text-sm">Failed to load copy items.</p>
        )}

        {sections.map(([section, sectionItems]) => (
          <div key={section} className="mb-10">
            <h2 className="text-xs font-mono uppercase tracking-widest text-text-subtle mb-1 pb-2 border-b border-border">
              {sectionLabel(section)}
            </h2>
            <div className="rounded-lg border border-border bg-surface divide-y divide-border">
              <div className="px-4 divide-y divide-border">
                {sectionItems.map((item) => (
                  <CopyRow key={item.key} item={item} onSaved={handleSaved} />
                ))}
              </div>
            </div>
          </div>
        ))}

        {!q.isLoading && sections.length === 0 && (
          <p className="text-text-subtle font-mono text-sm">
            No copy items found. Run the migration: <code className="text-accent-lime">0008_site_copy.sql</code>
          </p>
        )}
      </main>
    </div>
  );
}
