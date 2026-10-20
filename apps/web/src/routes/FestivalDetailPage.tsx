/**
 * FestivalDetailPage — festival detail with venue, flyer, lineup/sets, and attendance.
 */

import { useState, useRef, useEffect } from "react";
import { Link, useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, type FestivalSet, type ArtistListItem } from "@/lib/api";
import type { AttendanceStatus } from "@tagg/shared";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Chevron, DateBlock, EmptyState, Hero, Loading, PillTabs, SelectField, StatTile, StatusBadge } from "@/components/ui/kit";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;

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
  const [showFlyerUrlInput, setShowFlyerUrlInput] = useState(false);
  const [flyerUrlInput, setFlyerUrlInput] = useState("");
  const [flyerUrlImporting, setFlyerUrlImporting] = useState(false);
  const [flyerError, setFlyerError] = useState<string | null>(null);

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) {
    return (
      <EmptyState tone="error" title="Festival not found."
        action={<Link to="/festivals"><Button variant="secondary">Back to festivals</Button></Link>} />
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
        navigate(`/festivals/${res.festival.slug}`, { replace: true });
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

  const handleFlyerUrlImport = async () => {
    if (!flyerUrlInput.trim()) return;
    setFlyerUrlImporting(true);
    setFlyerError(null);
    try {
      await api.uploadFestivalFlyerFromUrl(festival.slug, flyerUrlInput.trim());
      await qc.invalidateQueries({ queryKey: ["festivals", slug] });
      setFlyerUrlInput("");
      setShowFlyerUrlInput(false);
    } catch (err) {
      setFlyerError(err instanceof Error ? err.message : "Failed to import image from URL.");
    } finally {
      setFlyerUrlImporting(false);
    }
  };

  const handleRemoveAttendance = async () => {
    if (!window.confirm("Remove yourself from this festival?")) return;
    try {
      await api.deleteFestival(festival.slug);
      await qc.invalidateQueries({ queryKey: ["festivals"] });
      navigate("/festivals");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove.");
    }
  };

  const statusColor = attendance ? STATUS_COLORS[attendance.status] ?? "" : "";

  const flyerBusy = uploadingFlyer || flyerUrlImporting;

  // Lineup view: the whole festival at once (default), every day stacked, or one day.
  // Kept in ?day= (all | 1..n) so a specific day can be linked to.
  const dayEntries = Object.entries(setsByDate);
  const dayParam = searchParams.get("day");
  type LineupView = "lineup" | "days" | `${number}`;
  const lineupView: LineupView =
    dayEntries.length <= 1 ? "days"
    : dayParam === "all" ? "days"
    : dayParam && Number(dayParam) >= 1 && Number(dayParam) <= dayEntries.length ? (dayParam as LineupView)
    : "lineup";
  const setLineupView = (v: LineupView): void => {
    setSearchParams((cur) => {
      const next = new URLSearchParams(cur);
      if (v === "lineup") next.delete("day");
      else next.set("day", v === "days" ? "all" : v);
      return next;
    }, { replace: true });
  };
  const viewOptions: { value: LineupView; label: string }[] = [
    { value: "lineup", label: `Full lineup · ${stats.totalArtists}` },
    { value: "days", label: "All days" },
    ...dayEntries.map(([date, ds], i) => ({
      value: String(i + 1) as LineupView,
      label: date === "unknown" ? `Date TBD · ${ds.length}` : `Day ${i + 1} · ${fmtDateShort(date)}`,
    })),
  ];
  // Whole-festival lineup: each artist once, in day then set order, tagged with their day.
  const fullLineup = (() => {
    const seen = new Map<string, { set: FestivalSet; day: number }>();
    dayEntries.forEach(([, ds], i) => ds.forEach((set: FestivalSet) => {
      if (!seen.has(set.artist.id)) seen.set(set.artist.id, { set, day: i + 1 });
    }));
    return [...seen.values()];
  })();
  const dateRange = (festival.startDate || festival.endDate)
    ? `${fmtDate(festival.startDate)}${festival.endDate && festival.endDate !== festival.startDate ? ` – ${fmtDate(festival.endDate)}` : ""}`
    : null;

  return (
    <div className="space-y-6">
      <Hero
        back={{ to: "/festivals", label: "Festivals" }}
        imageUrl={festival.flyerUrl}
        eyebrow="Festival"
        title={festival.name}
        accent="yellow"
        actions={
          <>
            {attendance && <StatusBadge status={attendance.status} className="h-10 px-4 text-sm" />}
            {isAdmin && !editing && <Button variant="secondary" className="rounded-full" onClick={startEdit}>Edit festival</Button>}
            {isAdmin && (
              <label className={`inline-flex h-10 cursor-pointer items-center rounded-full border border-border bg-surface-2 px-4 text-sm font-semibold transition-colors hover:bg-surface ${flyerBusy ? "pointer-events-none opacity-50" : ""}`}>
                {uploadingFlyer ? "Uploading…" : festival.flyerUrl ? "Replace flyer" : "Upload flyer"}
                <input ref={flyerFileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                  onChange={(e) => void handleFlyerUpload(e)} disabled={flyerBusy} />
              </label>
            )}
            {isAdmin && <Button variant="ghost" className="rounded-full" disabled={flyerBusy} onClick={() => setShowFlyerUrlInput((v) => !v)}>Flyer URL</Button>}
            {isAdmin && festival.flyerUrl && (
              <Button variant="ghost" className="rounded-full text-text-muted hover:text-accent-pink" disabled={flyerBusy} onClick={handleDeleteFlyer}>Remove flyer</Button>
            )}
            {festival.sourceUrl && (
              <a href={festival.sourceUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" className="rounded-full">Event page ↗</Button>
              </a>
            )}
          </>
        }
      >
        {dateRange && <p className="font-semibold text-text-base">{dateRange}</p>}
        {festival.venue && (
          <p>
            <Link to={`/venues/${festival.venue.slug}`} className="hover:text-accent-lime">{festival.venue.name}</Link>
            {festival.venue.city && <span className="text-text-subtle"> · {festival.venue.city}{festival.venue.region && `, ${festival.venue.region}`}</span>}
          </p>
        )}
      </Hero>

      {isAdmin && (showFlyerUrlInput || flyerError) && (
        <div className="space-y-2">
          {showFlyerUrlInput && (
            <div className="flex gap-2">
              <input type="url" placeholder="Paste image URL" value={flyerUrlInput}
                onChange={(e) => setFlyerUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleFlyerUrlImport()}
                disabled={flyerUrlImporting} className="field h-12 flex-1 sm:h-11" />
              <Button onClick={() => void handleFlyerUrlImport()} disabled={flyerUrlImporting || !flyerUrlInput.trim()} className="h-12 sm:h-11">
                {flyerUrlImporting ? "Importing…" : "Import"}
              </Button>
            </div>
          )}
          {flyerError && <p className="text-sm text-accent-pink">{flyerError}</p>}
        </div>
      )}

      {/* Edit form (admin only) */}
      {isAdmin && editing && (
        <div className="card space-y-4 p-4 sm:p-5">
          <h2 className="h-section">Edit festival</h2>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-text-muted">Name</span>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} className="field h-12 w-full sm:h-11" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-text-muted">Start date</span>
              <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)}
                className="field h-12 w-full [color-scheme:dark] sm:h-11" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-text-muted">End date</span>
              <input type="date" value={editEndDate} min={editStartDate || undefined} onChange={(e) => setEditEndDate(e.target.value)}
                className="field h-12 w-full [color-scheme:dark] sm:h-11" />
            </label>
          </div>
          {saveError && <p className="text-sm text-accent-pink">{saveError}</p>}
          <div className="flex gap-2">
            <Button onClick={() => void saveEdit()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            <Button variant="secondary" onClick={cancelEdit} disabled={saving}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Artists" value={stats.totalArtists} accent="lime" />
        <StatTile label="Days" value={stats.totalDays} />
        <StatTile label="Rating" value={attendance?.rating ? `${attendance.rating}/10` : "—"} />
      </div>

      {/* Attendance section (admin only) */}
      {isAdmin && (
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="h-section">Attendance</h2>
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
      )}

      {/* Event notes */}
      {festival.eventNotes && (
        <div className="card p-4 sm:p-5">
          <h2 className="h-section mb-2">Notes</h2>
          <p className="text-sm text-text-base whitespace-pre-wrap">{festival.eventNotes}</p>
        </div>
      )}

      {/* Lineup section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="h-section">Lineup</h2>
          {isAdmin && !editingLineup && (
            <button
              onClick={startEditLineup}
              className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors"
            >
              {sets.length > 0 ? "Edit lineup" : "+ Add artists"}
            </button>
          )}
        </div>

        {isAdmin && editingLineup ? (
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
            {dayEntries.length > 1 && (
              <>
                <SelectField label="Lineup view" className="sm:hidden" value={lineupView} options={viewOptions} onChange={setLineupView} />
                <div className="hidden sm:block">
                  <PillTabs value={lineupView} options={viewOptions.map((o) => ({ ...o, label: o.label.replace(/ · .*$/, "") }))} onChange={setLineupView} />
                </div>
              </>
            )}

            {lineupView === "lineup" && (
              <div className="card p-4 sm:p-5">
                <div className="flex flex-wrap gap-2">
                  {fullLineup.map(({ set, day }) => (
                    <Link
                      key={set.artist.id}
                      id={`set-${set.artist.slug}`}
                      to={`/artists/${set.artist.slug}`}
                      className={clsx(
                        "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all scroll-mt-24",
                        highlightedSet === `set-${set.artist.slug}`
                          ? "border-accent-lime bg-lime-950 text-accent-lime ring-2 ring-accent-lime/50"
                          : "border-border bg-surface-2 text-text-muted hover:border-accent-lime hover:text-accent-lime",
                      )}
                    >
                      {set.artist.name}
                      <span className="text-xs text-text-subtle">D{day}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {Object.entries(setsByDate).map(([date, dateSets], dayIdx) => {
              // "lineup" shows the combined list above; a day number shows just that day.
              if (lineupView === "lineup") return null;
              if (lineupView !== "days" && lineupView !== String(dayIdx + 1)) return null;
              const concert = concertsByDate[date];
              const concertUrl = concert?.slug
                ? `/shows/${concert.slug}`
                : concert?.id
                ? `/shows/${concert.id}`
                : null;

              return (
                <div
                  key={date}
                  className="card overflow-hidden"
                >
                  {/* Day header — a ticket-style row linking to that day's show */}
                  {concertUrl && date !== "unknown" ? (
                    <Link to={concertUrl} className="group flex min-h-[64px] items-center gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-surface-2/70">
                      <DateBlock date={date} />
                      <span className="flex-1 text-[15px] font-semibold group-hover:text-accent-lime">
                        Day {dayIdx + 1}
                        <span className="block text-sm font-normal text-text-subtle">Open this day</span>
                      </span>
                      <span className="text-sm text-text-subtle">{dateSets.length} artist{dateSets.length !== 1 ? "s" : ""}</span>
                      <Chevron className="text-text-subtle group-hover:text-accent-lime" />
                    </Link>
                  ) : (
                    <div className="flex min-h-[64px] items-center gap-3 border-b border-border px-4 py-3">
                      {date !== "unknown" ? <DateBlock date={date} /> : <span className="text-[15px] font-semibold">Date TBD</span>}
                      <span className="flex-1" />
                      <span className="text-sm text-text-subtle">{dateSets.length} artist{dateSets.length !== 1 ? "s" : ""}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 p-4">
                    {dateSets.map((set: FestivalSet) => (
                      <Link
                        key={set.id}
                        id={`set-${set.artist.slug}`}
                        to={`/artists/${set.artist.slug}`}
                        className={clsx(
                          "rounded-full border px-3.5 py-2 text-sm font-medium transition-all scroll-mt-24",
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

      {/* Danger zone (admin only) */}
      {isAdmin && (
        <div className="border-t border-border pt-6 mt-8">
          <button
            onClick={() => void handleRemoveAttendance()}
            className="text-sm font-semibold text-text-subtle hover:text-accent-pink transition-colors"
          >
            Delete festival
          </button>
        </div>
      )}
    </div>
  );
}
