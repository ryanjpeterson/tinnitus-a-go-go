/** Show page: the lineup editor (roles, order, adding artists). */
import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, type ConcertDetail, type ArtistListItem } from "@/lib/api";
import { closestByName, searchStem } from "@/lib/fuzzy";
import { Chevron, initials } from "@/components/ui/kit";
import { ROLE_LABEL, ROLE_ORDER } from "./roles";

/**
 * localUid() requires a secure context (HTTPS / localhost) and fails
 * over plain HTTP (e.g. Tailscale IP).  This helper uses crypto.getRandomValues
 * which is available in all contexts and produces a good-enough local row key.
 */
function localUid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}


// ─────────────────────────────────────────────────────────────────────────────
// Lineup editor
// ─────────────────────────────────────────────────────────────────────────────

type ArtistRole = "headliner" | "co_headliner" | "support";
const ALL_ROLES: ArtistRole[] = ["headliner", "co_headliner", "support"];

/**
 * Enforce top-billing exclusivity: a concert cannot have both a "headliner"
 * and a "co_headliner" at the same time (they reflect different promotional
 * arrangements and are mutually exclusive).
 *
 * Rules:
 *  • If the changed artist is now "headliner"    → demote all co_headliners to "support"
 *  • If the changed artist is now "co_headliner" → convert any headliner to "co_headliner"
 *  • "support" role change → no cascade needed
 */
function enforceTopBilling(artists: LocalArtist[], changedUid: string): LocalArtist[] {
  const changed = artists.find((a) => a.uid === changedUid);
  if (!changed) return artists;

  if (changed.role === "headliner") {
    // One clear headliner → co-headliners lose equal billing, become support
    return artists.map((a) =>
      a.uid !== changedUid && a.role === "co_headliner"
        ? { ...a, role: "support" as ArtistRole }
        : a,
    );
  }

  if (changed.role === "co_headliner") {
    // Equal billing → any existing solo headliner joins as a co-headliner
    return artists.map((a) =>
      a.uid !== changedUid && a.role === "headliner"
        ? { ...a, role: "co_headliner" as ArtistRole }
        : a,
    );
  }

  return artists;
}

interface LocalArtist {
  uid: string;            // local-only unique key (localUid)
  artistId: string | null; // null for name-only (new) artists — server will upsert
  name: string;
  slug: string;
  role: ArtistRole;
  appearanceNotes: string | null;
}

export function LineupEditor({ concert, isAdmin = false }: { concert: ConcertDetail; isAdmin?: boolean }) {
  const qc = useQueryClient();
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [editing, setEditing] = useState(false);
  const [localArtists, setLocalArtists] = useState<LocalArtist[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Add-artist search state
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<ArtistListItem[]>([]);
  const [addRole, setAddRole] = useState<ArtistRole>("support");
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Explicit selection: user picks from dropdown but hasn't committed yet
  const [addSelectedArtist, setAddSelectedArtist] = useState<ArtistListItem | null>(null);
  // Fuzzy "did you mean?" suggestion
  const [suggestedArtist, setSuggestedArtist] = useState<ArtistListItem | null>(null);

  // Drag-and-drop reorder state
  const dragItemRef = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const enterEdit = () => {
    const sorted = [...concert.artists].sort((a, b) => {
      const rd = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
      return rd !== 0 ? rd : (a.setOrder ?? 99) - (b.setOrder ?? 99);
    });
    setLocalArtists(
      sorted.map((a) => ({
        uid: localUid(),
        artistId: a.id,
        name: a.name,
        slug: a.slug,
        role: a.role as ArtistRole,
        appearanceNotes: a.appearanceNotes,
      })),
    );
    setSaveError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setAddQuery("");
    setAddResults([]);
    setAddSelectedArtist(null);
    setSuggestedArtist(null);
    setSaveError(null);
  };

  const handleSearchChange = (val: string) => {
    setAddQuery(val);
    setAddSelectedArtist(null); // typing always clears any prior selection
    setSuggestedArtist(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!val.trim()) {
      setAddResults([]);
      setShowDropdown(false);
      return;
    }
    setShowDropdown(true);
    searchTimerRef.current = setTimeout(() => {
      setSearching(true);
      api
        .listArtists({ q: val, limit: 8 })
        .then(async (res) => {
          const filtered = res.artists.filter(
            (a) => !localArtists.some((la) => la.artistId === a.id),
          );
          setAddResults(filtered);

          // Fuzzy: if no results returned, try a stem search and compute edit distance
          if (filtered.length === 0 && val.length >= 3) {
            try {
              const stemRes = await api.listArtists({ q: searchStem(val), limit: 12 });
              const candidates = stemRes.artists.filter(
                (a) => !localArtists.some((la) => la.artistId === a.id),
              );
              const best = closestByName(val, candidates);
              if (best) setSuggestedArtist(best);
            } catch {
              // ignore
            }
          }
        })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
  };

  /** Insert helper — places artist after the last item at or before the same role tier,
   *  then enforces top-billing exclusivity (headliner ↔ co_headliner cannot coexist). */
  const insertArtist = (artist: LocalArtist) => {
    setLocalArtists((prev) => {
      const result = [...prev];
      let insertAfter = -1;
      for (let i = 0; i < result.length; i++) {
        if ((ROLE_ORDER[result[i]!.role] ?? 99) <= (ROLE_ORDER[artist.role] ?? 99)) {
          insertAfter = i;
        }
      }
      result.splice(insertAfter + 1, 0, artist);
      return enforceTopBilling(result, artist.uid);
    });
  };

  const handleAddArtist = (artist: ArtistListItem) => {
    if (localArtists.some((a) => a.artistId === artist.id)) return;
    insertArtist({
      uid: localUid(),
      artistId: artist.id,
      name: artist.name,
      slug: artist.slug,
      role: addRole,
      appearanceNotes: null,
    });
    setAddQuery("");
    setAddResults([]);
    setAddSelectedArtist(null);
    setSuggestedArtist(null);
    setShowDropdown(false);
  };

  /** Commit: either add the selected dropdown item, or add a new artist by typed name. */
  const handleCommitAdd = () => {
    if (addSelectedArtist) {
      handleAddArtist(addSelectedArtist);
    } else if (addQuery.trim()) {
      insertArtist({
        uid: localUid(),
        artistId: null,
        name: addQuery.trim(),
        slug: "",
        role: addRole,
        appearanceNotes: null,
      });
      setAddQuery("");
      setAddResults([]);
      setAddSelectedArtist(null);
      setSuggestedArtist(null);
      setShowDropdown(false);
    }
  };

  const handleChangeRole = (uid: string, newRole: ArtistRole) => {
    setLocalArtists((prev) => {
      const idx = prev.findIndex((a) => a.uid === uid);
      if (idx === -1) return prev;
      const artist = { ...prev[idx]!, role: newRole };
      const without = prev.filter((_, i) => i !== idx);
      // Re-insert at end of the new role tier
      let insertAfter = -1;
      for (let i = 0; i < without.length; i++) {
        if ((ROLE_ORDER[without[i]!.role] ?? 99) <= (ROLE_ORDER[newRole] ?? 99)) {
          insertAfter = i;
        }
      }
      const result = [...without];
      result.splice(insertAfter + 1, 0, artist);
      // Enforce: headliner and co_headliner cannot coexist
      return enforceTopBilling(result, uid);
    });
  };

  const handleMoveUp = (uid: string) => {
    setLocalArtists((prev) => {
      const idx = prev.findIndex((a) => a.uid === uid);
      if (idx <= 0) return prev;
      const role = prev[idx]!.role;
      let prevIdx = -1;
      for (let i = idx - 1; i >= 0; i--) {
        if (prev[i]!.role === role) { prevIdx = i; break; }
      }
      if (prevIdx === -1) return prev;
      const result = [...prev];
      [result[prevIdx], result[idx]] = [result[idx]!, result[prevIdx]!];
      return result;
    });
  };

  const handleMoveDown = (uid: string) => {
    setLocalArtists((prev) => {
      const idx = prev.findIndex((a) => a.uid === uid);
      if (idx === -1) return prev;
      const role = prev[idx]!.role;
      let nextIdx = -1;
      for (let i = idx + 1; i < prev.length; i++) {
        if (prev[i]!.role === role) { nextIdx = i; break; }
      }
      if (nextIdx === -1) return prev;
      const result = [...prev];
      [result[idx], result[nextIdx]] = [result[nextIdx]!, result[idx]!];
      return result;
    });
  };

  const handleRemove = (uid: string) => {
    setLocalArtists((prev) => prev.filter((a) => a.uid !== uid));
  };

  // ── Drag-and-drop handlers ───────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    dragItemRef.current = idx;
    setDraggingIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnterItem = (idx: number) => {
    if (dragItemRef.current === null || dragItemRef.current === idx) return;
    setDragOverIdx(idx);
  };

  const handleDragOverItem = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDropItem = (toIdx: number) => {
    const fromIdx = dragItemRef.current;
    if (fromIdx === null || fromIdx === toIdx) {
      dragItemRef.current = null;
      setDraggingIdx(null);
      setDragOverIdx(null);
      return;
    }
    setLocalArtists((prev) => {
      const result = [...prev];
      const [item] = result.splice(fromIdx, 1);
      // After removing `fromIdx`, items above `toIdx` shift down by 1
      const insertAt = toIdx > fromIdx ? toIdx - 1 : toIdx;
      result.splice(insertAt, 0, item!);
      return result;
    });
    dragItemRef.current = null;
    setDraggingIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEndItem = () => {
    dragItemRef.current = null;
    setDraggingIdx(null);
    setDragOverIdx(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Compute setOrder as 0-indexed position within each role tier
      const roleCounters: Partial<Record<ArtistRole, number>> = {};
      const payload = localArtists.map((a) => {
        const order = roleCounters[a.role] ?? 0;
        roleCounters[a.role] = order + 1;
        if (a.artistId) {
          return { artistId: a.artistId, role: a.role, setOrder: order, appearanceNotes: a.appearanceNotes };
        } else {
          // Name-only artist — server will upsert
          return { artistName: a.name, role: a.role, setOrder: order, appearanceNotes: a.appearanceNotes };
        }
      });
      await api.putConcertArtists(concert.id, payload);
      await qc.invalidateQueries({ queryKey: ["concerts", concert.id] });
      void qc.invalidateQueries({ queryKey: ["concerts"] });
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  // Sorted artists for read mode
  const sortedArtists = [...concert.artists].sort((a, b) => {
    const rd = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
    return rd !== 0 ? rd : (a.setOrder ?? 99) - (b.setOrder ?? 99);
  });

  return (
    <div className="card p-4 sm:p-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="h-section">Lineup</h2>
        {isAdmin && (
          !editing ? (
            <button
              onClick={enterEdit}
              className="link-action"
            >
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {saveError && <span className="text-sm text-accent-pink">{saveError}</span>}
              <button onClick={cancelEdit} className="btn btn-sm btn-ghost">
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="btn btn-sm btn-primary"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )
        )}
      </div>

      {!editing ? (
        /* ── Read mode ── */
        <>
          {sortedArtists.length === 0 ? (
            <p className="text-sm text-text-subtle">No artists recorded.</p>
          ) : (
            // Billing order: top-billed artists get a lime avatar and a label, support sits quieter below.
            <ul className="-mx-2 space-y-1">
              {sortedArtists.map((a) => {
                const top = a.role === "headliner" || a.role === "co_headliner";
                return (
                  <li key={a.id}>
                    <Link to={`/artists/${a.slug}`}
                      className="group flex min-h-[56px] items-center gap-3 rounded-xl px-2 transition-colors hover:bg-white/[0.04]">
                      <span className={clsx(
                        "flex shrink-0 items-center justify-center rounded-full font-display",
                        top
                          ? "h-11 w-11 bg-accent-lime/15 text-base text-accent-lime ring-1 ring-accent-lime/40"
                          : "h-9 w-9 bg-surface-2 text-sm text-text-subtle ring-1 ring-white/5",
                      )}>
                        {initials(a.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={clsx("block truncate", top ? "text-base font-semibold" : "text-15 text-text-muted")}>{a.name}</span>
                        {top && <span className="block text-xs font-semibold uppercase tracking-wider text-accent-lime/80">{ROLE_LABEL[a.role] ?? "Headliner"}</span>}
                      </span>
                      <Chevron className="text-text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent-lime" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {concert.eventNotes && (
            <p className="meta mt-3">{concert.eventNotes}</p>
          )}
        </>
      ) : (
        /* ── Edit mode (admin only, but this branch only reached when editing is true) ── */
        <div>
          {localArtists.length === 0 ? (
            <p className="text-sm text-text-subtle mb-3">No artists yet — add one below.</p>
          ) : (
            <ul className="mb-4">
              {localArtists.map((a, idx) => {
                const sameRole = localArtists.filter((x) => x.role === a.role);
                const posInRole = sameRole.findIndex((x) => x.uid === a.uid);
                const canMoveUp   = posInRole > 0;
                const canMoveDown = posInRole < sameRole.length - 1;
                const isDragging  = draggingIdx === idx;
                const isDropTarget = dragOverIdx === idx && draggingIdx !== idx;

                return (
                  <li
                    key={a.uid}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragEnter={() => handleDragEnterItem(idx)}
                    onDragOver={handleDragOverItem}
                    onDrop={() => handleDropItem(idx)}
                    onDragEnd={handleDragEndItem}
                    className={clsx(
                      "flex items-center gap-2 py-1 rounded transition-opacity",
                      isDropTarget && "border-t-2 border-accent-lime",
                      !isDropTarget && "border-t-2 border-transparent",
                      isDragging ? "opacity-30" : "opacity-100",
                    )}
                  >
                    {/* Drag handle — 6-dot grip */}
                    <div
                      title="Drag to reorder"
                      className="cursor-grab active:cursor-grabbing shrink-0 text-text-subtle hover:text-text-muted transition-colors flex items-center justify-center w-4"
                    >
                      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
                        <circle cx="2.5" cy="2"  r="1.4"/>
                        <circle cx="7.5" cy="2"  r="1.4"/>
                        <circle cx="2.5" cy="7"  r="1.4"/>
                        <circle cx="7.5" cy="7"  r="1.4"/>
                        <circle cx="2.5" cy="12" r="1.4"/>
                        <circle cx="7.5" cy="12" r="1.4"/>
                      </svg>
                    </div>

                    <select
                      value={a.role}
                      onChange={(e) => handleChangeRole(a.uid, e.target.value as ArtistRole)}
                      className="w-[128px] shrink-0 field h-11"
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>

                    <span className="flex-1 text-sm text-text-base truncate min-w-0">
                      {(a.role === "headliner" || a.role === "co_headliner") && (
                        <span className="text-accent-lime text-sm mr-1.5">★</span>
                      )}
                      {a.name}
                    </span>

                    <div className="flex items-center shrink-0">
                      <button
                        onClick={() => handleMoveUp(a.uid)}
                        disabled={!canMoveUp}
                        title="Move up within tier"
                        className="w-6 h-6 flex items-center justify-center text-xs text-text-subtle hover:text-text-base disabled:opacity-20 transition-colors"
                      >↑</button>
                      <button
                        onClick={() => handleMoveDown(a.uid)}
                        disabled={!canMoveDown}
                        title="Move down within tier"
                        className="w-6 h-6 flex items-center justify-center text-xs text-text-subtle hover:text-text-base disabled:opacity-20 transition-colors"
                      >↓</button>
                      <button
                        onClick={() => handleRemove(a.uid)}
                        title="Remove from lineup"
                        className="w-6 h-6 ml-1 link-action hover:text-accent-pink"
                      >×</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Add artist */}
          <div className="border-t border-border pt-3">
            <p className="mb-2 eyebrow">Add artist</p>
            <div className="flex gap-2 items-start flex-wrap">
              {/* Search input */}
              <div className="relative flex-1 min-w-[160px]">
                <input
                  type="text"
                  placeholder="Type a name to search or add…"
                  value={addQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => addQuery.trim() && !addSelectedArtist && setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleCommitAdd(); }
                  }}
                  className={clsx(
                    "field h-11 w-full",
                    addSelectedArtist && "border-accent-lime text-accent-lime",
                  )}
                />
                {showDropdown && !addSelectedArtist && (searching || addResults.length > 0) && (
                  <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-surface border border-border rounded-lg shadow-xl py-1 max-h-52 overflow-y-auto">
                    {searching ? (
                      <div className="px-3 py-2 text-sm text-text-subtle animate-pulse">Searching…</div>
                    ) : (
                      addResults.map((ar) => (
                        <button
                          key={ar.id}
                          onMouseDown={() => {
                            setAddSelectedArtist(ar);
                            setAddQuery(ar.name);
                            setShowDropdown(false);
                            setSuggestedArtist(null);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 transition-colors flex items-center justify-between gap-2"
                        >
                          <span className="text-text-base truncate">{ar.name}</span>
                          <span className="text-sm text-text-subtle shrink-0">{ar.showCount} shows</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Role selector */}
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as ArtistRole)}
                className="w-[128px] shrink-0 field h-11"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>

              {/* Add to lineup button */}
              <button
                type="button"
                onClick={handleCommitAdd}
                disabled={!addSelectedArtist && !addQuery.trim()}
                className="shrink-0 btn btn-sm btn-primary"
              >
                Add to lineup
              </button>
            </div>

            {/* "Did you mean?" fuzzy suggestion */}
            {suggestedArtist && (
              <p className="mt-2 text-sm text-text-muted">
                Did you mean{" "}
                <button
                  type="button"
                  className="text-accent-lime hover:underline"
                  onMouseDown={() => {
                    setAddSelectedArtist(suggestedArtist);
                    setAddQuery(suggestedArtist.name);
                    setSuggestedArtist(null);
                    setAddResults([]);
                    setShowDropdown(false);
                  }}
                >
                  {suggestedArtist.name}
                </button>
                ?
              </p>
            )}

            {/* Hint text */}
            {addSelectedArtist ? (
              <p className="mt-1.5 text-sm text-text-subtle">
                ✓ {addSelectedArtist.name} selected — choose a role then click "Add to lineup"
              </p>
            ) : addQuery.trim() && !searching && addResults.length === 0 && !suggestedArtist ? (
              <p className="mt-1.5 text-sm text-text-subtle">
                No existing artist found — will create <span className="text-text-muted">"{addQuery.trim()}"</span> on save.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
