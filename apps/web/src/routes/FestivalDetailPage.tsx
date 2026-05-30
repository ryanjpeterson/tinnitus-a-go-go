/**
 * FestivalDetailPage — festival detail with venue, flyer, lineup/sets, and attendance.
 */

import { useState, useRef, useEffect } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, type FestivalSet, type ArtistListItem } from "@/lib/api";
import type { AttendanceStatus } from "@tagg/shared";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

const STATUS_COLORS: Record<string, string> = {
  attended: "border-lime-700 bg-lime-950 text-accent-lime",
  attending: "border-yellow-600 bg-yellow-950 text-yellow-400",
  interested: "border-purple-700 bg-purple-950 text-purple-400",
  missed: "border-red-700 bg-red-950 text-red-400",
  cancelled: "border-gray-600 bg-gray-800 text-gray-400",
  dismissed: "border-gray-600 bg-gray-800 text-gray-500",
};

const STATUSES: { value: AttendanceStatus; label: string; active: string }[] = [
  { value: "attending",  label: "Attending",  active: "border-yellow-600  bg-yellow-950  text-yellow-400"  },
  { value: "interested", label: "Interested", active: "border-purple-700  bg-purple-950  text-purple-400"  },
  { value: "attended",   label: "Attended",   active: "border-lime-700    bg-lime-950    text-accent-lime"  },
  { value: "missed",     label: "Missed",     active: "border-red-700     bg-red-950     text-red-400"      },
];

function ArtistAutocomplete({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect: (name: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [results, setResults] = useState<ArtistListItem[]>([]);
  const [showDrop, setShowDrop] = useState(false);

  const handleChange = (val: string) => {
    onChange(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!val.trim() || val.length < 2) {
      setResults([]);
      setShowDrop(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      api.listArtists({ q: val, limit: 6 }).then((r) => {
        setResults(r.artists);
        setShowDrop(r.artists.length > 0);
      }).catch(() => {});
    }, 280);
  };

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => results.length > 0 && setShowDrop(true)}
        onBlur={() => setTimeout(() => setShowDrop(false), 150)}
        placeholder="Artist name"
        className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
      />
      {showDrop && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-surface border border-border rounded-lg shadow-xl py-1 max-h-40 overflow-y-auto">
          {results.map((a) => (
            <button
              key={a.id}
              onMouseDown={() => { onSelect(a.name); setShowDrop(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 transition-colors"
            >
              {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FestivalDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["festivals", slug],
    queryFn: () => api.getFestival(slug!),
    enabled: !!slug,
  });

  // Track which set to highlight (from URL hash like #set-artist-slug)
  const [highlightedSet, setHighlightedSet] = useState<string | null>(null);

  // Scroll to and highlight set when arriving via hash link
  useEffect(() => {
    const hash = location.hash;
    if (hash && hash.startsWith("#set-") && q.data) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setHighlightedSet(hash.slice(1));
          // Remove highlight after animation
          setTimeout(() => setHighlightedSet(null), 2000);
        }, 100);
      }
    }
  }, [location.hash, q.data]);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Lineup editing
  const [editingLineup, setEditingLineup] = useState(false);
  const [lineupSets, setLineupSets] = useState<Array<{
    artistName: string;
    performanceDate: string;
    stageName: string;
  }>>([]);
  const [savingLineup, setSavingLineup] = useState(false);

  // Attendance editing
  const [editingAttendance, setEditingAttendance] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>("interested");
  const [attendanceRating, setAttendanceRating] = useState("");
  const [attendanceNotes, setAttendanceNotes] = useState("");
  const [savingAttendance, setSavingAttendance] = useState(false);

  // Flyer upload
  const flyerFileRef = useRef<HTMLInputElement>(null);
  const [uploadingFlyer, setUploadingFlyer] = useState(false);

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

  const { festival, sets, setsByDate, concertsByDate, attendance, stats } = q.data;

  const startEdit = () => {
    setEditName(festival.name);
    setEditStartDate(festival.startDate ?? "");
    setEditEndDate(festival.endDate ?? "");
    setSaveError(null);
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setSaveError(null); };

  const saveEdit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await api.patchFestival(festival.slug, {
        name: editName.trim() || undefined,
        startDate: editStartDate || null,
        endDate: editEndDate || null,
      });
      await qc.invalidateQueries({ queryKey: ["festivals"] });
      setEditing(false);
      if (res.festival.slug !== slug) {
        navigate(`/app/festivals/${res.festival.slug}`, { replace: true });
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const startEditLineup = () => {
    setLineupSets(sets.map((s) => ({
      artistName: s.artist.name,
      performanceDate: s.performanceDate ?? "",
      stageName: s.stageName ?? "",
    })));
    setEditingLineup(true);
  };

  const addLineupSet = () => {
    setLineupSets((prev) => [...prev, {
      artistName: "",
      performanceDate: festival.startDate ?? "",
      stageName: "",
    }]);
  };

  const updateLineupSet = (idx: number, patch: Partial<typeof lineupSets[0]>) => {
    setLineupSets((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx]!, ...patch };
      return updated;
    });
  };

  const removeLineupSet = (idx: number) => {
    setLineupSets((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveLineup = async () => {
    setSavingLineup(true);
    try {
      await api.putFestivalSets(
        festival.slug,
        lineupSets.filter((s) => s.artistName.trim()).map((s, i) => ({
          artistName: s.artistName.trim(),
          performanceDate: s.performanceDate || null,
          stageName: s.stageName.trim() || null,
          setOrder: i,
        })),
      );
      await qc.invalidateQueries({ queryKey: ["festivals", slug] });
      setEditingLineup(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save lineup.");
    } finally {
      setSavingLineup(false);
    }
  };

  const startEditAttendance = () => {
    setAttendanceStatus(attendance?.status ?? "interested");
    setAttendanceRating(attendance?.rating != null ? String(attendance.rating) : "");
    setAttendanceNotes(attendance?.personalNotes ?? "");
    setEditingAttendance(true);
  };

  const saveAttendance = async () => {
    setSavingAttendance(true);
    try {
      await api.patchFestivalAttendance(festival.slug, {
        status: attendanceStatus,
        rating: attendanceRating ? parseInt(attendanceRating, 10) : null,
        personalNotes: attendanceNotes.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ["festivals", slug] });
      setEditingAttendance(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleFlyerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFlyer(true);
    try {
      await api.uploadFestivalFlyer(festival.slug, file);
      await qc.invalidateQueries({ queryKey: ["festivals", slug] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingFlyer(false);
      if (flyerFileRef.current) flyerFileRef.current.value = "";
    }
  };

  const handleDeleteFlyer = async () => {
    if (!window.confirm("Remove this flyer?")) return;
    try {
      await api.deleteFestivalFlyer(festival.slug);
      await qc.invalidateQueries({ queryKey: ["festivals", slug] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  const handleRemoveAttendance = async () => {
    if (!window.confirm("Remove yourself from this festival?")) return;
    try {
      await api.deleteFestival(festival.slug);
      await qc.invalidateQueries({ queryKey: ["festivals"] });
      navigate("/app/festivals");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove.");
    }
  };

  const statusColor = attendance ? STATUS_COLORS[attendance.status] ?? "" : "";

  return (
    <div className="max-w-3xl">
      <Link to="/app/festivals" className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors">
        ← Festivals
      </Link>

      {/* Header with flyer */}
      <div className="mt-4 mb-6 flex gap-6">
        {/* Flyer */}
        <div className="w-40 shrink-0">
          <div className="aspect-[3/4] rounded-lg border border-border overflow-hidden bg-surface-2 relative group">
            {festival.flyerUrl ? (
              <>
                <div
                  className="absolute inset-0 bg-cover bg-center blur-lg scale-110 opacity-50"
                  style={{ backgroundImage: `url(${festival.flyerUrl})` }}
                />
                <img
                  src={festival.flyerUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain"
                />
                <button
                  onClick={handleDeleteFlyer}
                  className="absolute top-1 right-1 w-6 h-6 rounded bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  title="Remove flyer"
                >×</button>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-subtle">
                <span className="text-3xl font-display text-yellow-400/30 uppercase mb-2">
                  {festival.name.slice(0, 2)}
                </span>
                <label className="text-xs font-mono text-text-subtle hover:text-accent-lime cursor-pointer transition-colors">
                  + Add flyer
                  <input
                    ref={flyerFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => void handleFlyerUpload(e)}
                  />
                </label>
              </div>
            )}
            {uploadingFlyer && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <span className="text-xs font-mono text-white animate-pulse">Uploading…</span>
              </div>
            )}
          </div>
          {festival.flyerUrl && (
            <label className="block mt-2 text-xs font-mono text-text-subtle hover:text-accent-lime cursor-pointer text-center transition-colors">
              Change flyer
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => void handleFlyerUpload(e)}
              />
            </label>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
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
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-mono text-text-muted mb-1">Start date</label>
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-base focus:outline-none focus:border-accent-lime [color-scheme:dark]"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-mono text-text-muted mb-1">End date</label>
                  <input
                    type="date"
                    value={editEndDate}
                    min={editStartDate || undefined}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-base focus:outline-none focus:border-accent-lime [color-scheme:dark]"
                  />
                </div>
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
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="font-display uppercase text-3xl mb-1">{festival.name}</h1>
                </div>
                <button
                  onClick={startEdit}
                  className="mt-1 text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors shrink-0"
                >
                  Edit
                </button>
              </div>

              {(festival.startDate || festival.endDate) && (
                <p className="text-sm font-mono text-text-muted mt-2">
                  {fmtDate(festival.startDate)}
                  {festival.endDate && festival.endDate !== festival.startDate && ` – ${fmtDate(festival.endDate)}`}
                </p>
              )}

              {festival.venue && (
                <Link
                  to={`/app/venues/${festival.venue.slug}`}
                  className="block text-sm text-text-subtle hover:text-accent-lime transition-colors mt-1"
                >
                  {festival.venue.name}
                  {festival.venue.city && ` · ${festival.venue.city}`}
                  {festival.venue.region && `, ${festival.venue.region}`}
                </Link>
              )}

              {festival.sourceUrl && (
                <a
                  href={festival.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors mt-2 truncate"
                >
                  {festival.sourceUrl} ↗
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <div className="font-mono text-2xl text-text-base">{stats.totalArtists}</div>
          <div className="text-xs text-text-muted mt-1">Artists</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <div className="font-mono text-2xl text-text-base">{stats.totalDays}</div>
          <div className="text-xs text-text-muted mt-1">Days</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          {attendance?.rating ? (
            <div className="font-mono text-2xl text-accent-lime">{attendance.rating}/10</div>
          ) : (
            <div className="font-mono text-2xl text-text-subtle">—</div>
          )}
          <div className="text-xs text-text-muted mt-1">Rating</div>
        </div>
      </div>

      {/* Attendance section */}
      <div className="rounded-lg border border-border bg-surface p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-mono text-text-muted uppercase">Your attendance</h2>
          {!editingAttendance && attendance && (
            <button
              onClick={startEditAttendance}
              className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors"
            >
              Edit
            </button>
          )}
        </div>

        {editingAttendance ? (
          <div className="space-y-3">
            <div className="flex gap-1 flex-wrap">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setAttendanceStatus(s.value)}
                  className={clsx(
                    "min-w-[72px] px-3 py-1 rounded border text-xs font-mono transition-colors text-center",
                    attendanceStatus === s.value
                      ? s.active
                      : "border-border text-text-muted hover:border-accent-lime",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Rating (1-10)</label>
              <input
                type="number"
                min="1"
                max="10"
                value={attendanceRating}
                onChange={(e) => setAttendanceRating(e.target.value)}
                placeholder="—"
                className="w-24 rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent-lime"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">Notes</label>
              <textarea
                rows={3}
                value={attendanceNotes}
                onChange={(e) => setAttendanceNotes(e.target.value)}
                placeholder="Your thoughts…"
                className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void saveAttendance()}
                disabled={savingAttendance}
                className="text-xs font-mono px-3 py-1.5 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {savingAttendance ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditingAttendance(false)}
                disabled={savingAttendance}
                className="text-xs font-mono px-3 py-1.5 rounded border border-border text-text-muted hover:text-text-base transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : attendance ? (
          <div>
            <span className={`inline-block px-2 py-0.5 rounded border text-xs font-mono ${statusColor}`}>
              {attendance.status}
            </span>
            {attendance.personalNotes && (
              <p className="text-sm text-text-base mt-2">{attendance.personalNotes}</p>
            )}
            {attendance.ticketPricePaid != null && (
              <p className="text-xs font-mono text-text-muted mt-2">
                Paid: ${(attendance.ticketPricePaid / 100).toFixed(2)} {attendance.ticketPriceCurrency}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-text-subtle">Not tracked yet</p>
        )}
      </div>

      {/* Event notes */}
      {festival.eventNotes && (
        <div className="rounded-lg border border-border bg-surface p-4 mb-6">
          <h2 className="text-sm font-mono text-text-muted uppercase mb-2">Notes</h2>
          <p className="text-sm text-text-base whitespace-pre-wrap">{festival.eventNotes}</p>
        </div>
      )}

      {/* Lineup section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono text-text-muted uppercase">Lineup</h2>
          {!editingLineup && (
            <button
              onClick={startEditLineup}
              className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors"
            >
              {sets.length > 0 ? "Edit lineup" : "+ Add artists"}
            </button>
          )}
        </div>

        {editingLineup ? (
          <div className="space-y-3">
            {lineupSets.map((set, i) => (
              <div key={i} className="flex items-center gap-2">
                <ArtistAutocomplete
                  value={set.artistName}
                  onChange={(v) => updateLineupSet(i, { artistName: v })}
                  onSelect={(name) => updateLineupSet(i, { artistName: name })}
                />
                <input
                  type="date"
                  value={set.performanceDate}
                  onChange={(e) => updateLineupSet(i, { performanceDate: e.target.value })}
                  className="w-36 rounded border border-border bg-surface-2 px-2 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent-lime [color-scheme:dark]"
                />
                <input
                  type="text"
                  placeholder="Stage"
                  value={set.stageName}
                  onChange={(e) => updateLineupSet(i, { stageName: e.target.value })}
                  className="w-28 rounded border border-border bg-surface-2 px-2 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
                />
                <button
                  onClick={() => removeLineupSet(i)}
                  className="w-6 h-6 flex items-center justify-center text-text-subtle hover:text-accent-pink transition-colors font-mono shrink-0"
                >×</button>
              </div>
            ))}
            <button
              onClick={addLineupSet}
              className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors"
            >
              + Add artist
            </button>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => void saveLineup()}
                disabled={savingLineup}
                className="text-xs font-mono px-3 py-1.5 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {savingLineup ? "Saving…" : "Save lineup"}
              </button>
              <button
                onClick={() => setEditingLineup(false)}
                disabled={savingLineup}
                className="text-xs font-mono px-3 py-1.5 rounded border border-border text-text-muted hover:text-text-base transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : sets.length > 0 ? (
          <div className="space-y-3">
            {Object.entries(setsByDate).map(([date, dateSets]) => {
              const concert = concertsByDate[date];
              const concertUrl = concert?.slug
                ? `/app/concerts/${concert.slug}`
                : concert?.id
                ? `/app/concerts/${concert.id}`
                : null;

              return (
                <div
                  key={date}
                  className="rounded-lg border border-border bg-surface p-4"
                >
                  <div className="flex items-baseline justify-between mb-3">
                    {concertUrl ? (
                      <Link
                        to={concertUrl}
                        className="font-mono text-sm text-text-muted hover:text-accent-lime transition-colors"
                      >
                        {date !== "unknown" ? fmtDateShort(date) : "Date TBD"} →
                      </Link>
                    ) : (
                      <time className="font-mono text-sm text-text-muted">
                        {date !== "unknown" ? fmtDateShort(date) : "Date TBD"}
                      </time>
                    )}
                    <span className="text-xs text-text-subtle">
                      {dateSets.length} artist{dateSets.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {dateSets.map((set: FestivalSet) => (
                      <Link
                        key={set.id}
                        id={`set-${set.artist.slug}`}
                        to={`/app/artists/${set.artist.slug}`}
                        className={clsx(
                          "text-xs px-2 py-1 rounded border font-mono transition-all scroll-mt-4",
                          highlightedSet === `set-${set.artist.slug}`
                            ? "border-accent-lime bg-lime-950 text-accent-lime ring-2 ring-accent-lime/50"
                            : "border-border bg-surface-2 text-text-muted hover:border-accent-lime hover:text-accent-lime",
                        )}
                      >
                        {set.artist.name}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-text-subtle">No artists added yet.</p>
        )}
      </div>

      {/* Danger zone */}
      {attendance && (
        <div className="border-t border-border pt-6 mt-8">
          <button
            onClick={() => void handleRemoveAttendance()}
            className="text-xs font-mono text-text-subtle hover:text-accent-pink transition-colors"
          >
            Remove from my festivals
          </button>
        </div>
      )}
    </div>
  );
}
