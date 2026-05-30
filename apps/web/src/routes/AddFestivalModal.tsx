/**
 * AddFestivalModal — modal form to create a new festival.
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, type ArtistListItem, type VenueListItem } from "@/lib/api";
import type { AttendanceStatus } from "@tagg/shared";

const STATUSES: { value: AttendanceStatus; label: string; active: string }[] = [
  { value: "attending",  label: "Attending",  active: "border-yellow-600  bg-yellow-950  text-yellow-400"  },
  { value: "interested", label: "Interested", active: "border-purple-700  bg-purple-950  text-purple-400"  },
  { value: "attended",   label: "Attended",   active: "border-lime-700    bg-lime-950    text-accent-lime"  },
  { value: "missed",     label: "Missed",     active: "border-red-700     bg-red-950     text-red-400"      },
];

interface ArtistRow {
  name: string;
  performanceDate: string;
  stageName: string;
}

interface FormState {
  name: string;
  startDate: string;
  endDate: string;
  venueName: string;
  venueCity: string;
  venueRegion: string;
  eventNotes: string;
  sourceUrl: string;
  status: AttendanceStatus;
  personalNotes: string;
  ticketPrice: string;
  ticketCurrency: string;
  artists: ArtistRow[];
}

const CURRENCIES = ["CAD", "USD", "EUR"] as const;

const DEFAULT_FORM: FormState = {
  name: "",
  startDate: "",
  endDate: "",
  venueName: "",
  venueCity: "",
  venueRegion: "",
  eventNotes: "",
  sourceUrl: "",
  status: "interested",
  personalNotes: "",
  ticketPrice: "",
  ticketCurrency: "CAD",
  artists: [],
};

function VenueAutocomplete({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect: (name: string, city: string, region: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [results, setResults] = useState<VenueListItem[]>([]);
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
      api.listVenues({ q: val, limit: 6 }).then((r) => {
        if (r.venues.length > 0) {
          setResults(r.venues);
          setShowDrop(true);
        } else {
          setResults([]);
          setShowDrop(false);
        }
      }).catch(() => {});
    }, 280);
  };

  const handlePick = (v: VenueListItem) => {
    onSelect(v.name, v.city ?? "", v.region ?? "");
    setResults([]);
    setShowDrop(false);
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => results.length > 0 && setShowDrop(true)}
        onBlur={() => setTimeout(() => setShowDrop(false), 150)}
        placeholder="Venue name"
        className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
      />
      {showDrop && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-surface border border-border rounded-lg shadow-xl py-1 max-h-40 overflow-y-auto">
          {results.map((v) => (
            <button
              key={v.id}
              onMouseDown={() => handlePick(v)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 transition-colors flex items-center justify-between gap-2"
            >
              <span className="text-text-base truncate">{v.name}</span>
              <span className="text-xs text-text-subtle font-mono shrink-0">
                {[v.city, v.region].filter(Boolean).join(", ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtistAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Artist name",
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect: (name: string) => void;
  placeholder?: string;
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
        if (r.artists.length > 0) {
          setResults(r.artists);
          setShowDrop(true);
        } else {
          setResults([]);
          setShowDrop(false);
        }
      }).catch(() => {});
    }, 280);
  };

  const handlePick = (a: ArtistListItem) => {
    onSelect(a.name);
    setResults([]);
    setShowDrop(false);
  };

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => results.length > 0 && setShowDrop(true)}
        onBlur={() => setTimeout(() => setShowDrop(false), 150)}
        placeholder={placeholder}
        className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
      />
      {showDrop && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-surface border border-border rounded-lg shadow-xl py-1 max-h-40 overflow-y-auto">
          {results.map((a) => (
            <button
              key={a.id}
              onMouseDown={() => handlePick(a)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 transition-colors flex items-center justify-between gap-2"
            >
              <span className="text-text-base truncate">{a.name}</span>
              <span className="text-xs text-text-subtle font-mono shrink-0">{a.showCount} shows</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AddFestivalModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const [showLineup, setShowLineup] = useState(false);

  // Flyer upload
  const [flyerFile, setFlyerFile] = useState<File | null>(null);
  const flyerFileRef = useRef<HTMLInputElement>(null);
  const [flyerUrl, setFlyerUrl] = useState("");
  const [showFlyerUrlInput, setShowFlyerUrlInput] = useState(false);

  const isFormDirty = (): boolean => {
    if (form.name !== DEFAULT_FORM.name) return true;
    if (form.startDate !== DEFAULT_FORM.startDate) return true;
    if (form.venueName !== DEFAULT_FORM.venueName) return true;
    if (form.artists.length > 0) return true;
    if (flyerFile !== null) return true;
    if (flyerUrl.trim() !== "") return true;
    return false;
  };

  const handleClose = () => {
    if (submitting) return;
    if (isFormDirty()) {
      if (!window.confirm("Are you sure you want to close? Any unsaved changes will be lost.")) {
        return;
      }
    }
    onClose();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, flyerFile, submitting]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const updateArtist = (idx: number, patch: Partial<ArtistRow>) =>
    setForm((prev) => {
      const artists = [...prev.artists];
      artists[idx] = { ...artists[idx]!, ...patch };
      return { ...prev, artists };
    });

  const addArtist = () =>
    setForm((prev) => ({
      ...prev,
      artists: [...prev.artists, { name: "", performanceDate: prev.startDate, stageName: "" }],
    }));

  const removeArtist = (idx: number) =>
    setForm((prev) => ({
      ...prev,
      artists: prev.artists.filter((_, i) => i !== idx),
    }));

  const validate = (): string | null => {
    if (!form.name.trim()) return "Festival name is required.";
    if (!form.startDate) return "Start date is required.";
    if (form.endDate && form.endDate < form.startDate) {
      return "End date must be on or after start date.";
    }
    if (form.artists.some((a) => !a.name.trim())) {
      return "All artist names must be filled in.";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }

    setSubmitting(true);
    setError(null);
    try {
      const ticketCents = form.ticketPrice
        ? Math.round(parseFloat(form.ticketPrice) * 100)
        : undefined;

      const { slug } = await api.createFestival({
        name: form.name.trim(),
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        venueName: form.venueName.trim() || undefined,
        venueCity: form.venueCity.trim() || undefined,
        venueRegion: form.venueRegion.trim() || undefined,
        eventNotes: form.eventNotes.trim() || undefined,
        sourceUrl: form.sourceUrl.trim() || undefined,
        status: form.status,
        personalNotes: form.personalNotes.trim() || undefined,
        ticketPricePaid: ticketCents,
        ticketPriceCurrency: ticketCents ? form.ticketCurrency : undefined,
        artists: form.artists.length > 0
          ? form.artists.map((a, i) => ({
              name: a.name.trim(),
              performanceDate: a.performanceDate || undefined,
              stageName: a.stageName.trim() || undefined,
              setOrder: i,
            }))
          : undefined,
      });

      // Upload flyer if provided
      if (flyerFile) {
        try {
          await api.uploadFestivalFlyer(slug, flyerFile);
        } catch {
          // Non-fatal
        }
      } else if (flyerUrl.trim()) {
        try {
          await api.uploadFestivalFlyerFromUrl(slug, flyerUrl.trim());
        } catch {
          // Non-fatal
        }
      }

      void qc.invalidateQueries({ queryKey: ["festivals"] });
      navigate(`/app/festivals/${slug}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create festival.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-lg bg-bg border border-border rounded-xl shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display uppercase text-lg">Add festival</h2>
          <button
            onClick={handleClose}
            className="text-text-subtle hover:text-text-base transition-colors text-xl font-mono w-8 h-8 flex items-center justify-center"
          >×</button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} className="px-5 py-5 space-y-4">

          {/* Name */}
          <div>
            <label className="block text-xs text-text-muted font-mono mb-1">Festival name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Coachella"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
            />
          </div>

          {/* Dates */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-text-muted font-mono mb-1">Start date *</label>
              <input
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setField("startDate", e.target.value)}
                className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent-lime [color-scheme:dark]"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-text-muted font-mono mb-1">End date</label>
              <input
                type="date"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={(e) => setField("endDate", e.target.value)}
                className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent-lime [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Venue */}
          <div>
            <label className="block text-xs text-text-muted font-mono mb-1">Venue</label>
            <div className="flex gap-2">
              <div className="flex-[2]">
                <VenueAutocomplete
                  value={form.venueName}
                  onChange={(v) => setField("venueName", v)}
                  onSelect={(name, city, region) => {
                    setField("venueName", name);
                    setField("venueCity", city);
                    setField("venueRegion", region);
                  }}
                />
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="City"
                  value={form.venueCity}
                  onChange={(e) => setField("venueCity", e.target.value)}
                  className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
                />
              </div>
              <div className="w-20">
                <input
                  type="text"
                  placeholder="State"
                  value={form.venueRegion}
                  onChange={(e) => setField("venueRegion", e.target.value)}
                  className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
                />
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs text-text-muted font-mono mb-1">Status</label>
            <div className="flex gap-1 flex-wrap">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setField("status", s.value)}
                  className={clsx(
                    "min-w-[72px] px-3 py-1 rounded border text-xs font-mono transition-colors text-center",
                    form.status === s.value
                      ? s.active
                      : "border-border text-text-muted hover:border-accent-lime",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lineup toggle */}
          <button
            type="button"
            onClick={() => setShowLineup((v) => !v)}
            className="text-xs font-mono text-text-subtle hover:text-text-muted transition-colors"
          >
            {showLineup ? "▾ Hide lineup" : "▸ Add lineup (artists you saw)"}
          </button>

          {showLineup && (
            <div className="space-y-2 pl-2 border-l-2 border-border">
              {form.artists.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <ArtistAutocomplete
                    value={a.name}
                    onChange={(v) => updateArtist(i, { name: v })}
                    onSelect={(name) => updateArtist(i, { name })}
                    placeholder="Artist name"
                  />
                  <input
                    type="date"
                    value={a.performanceDate}
                    onChange={(e) => updateArtist(i, { performanceDate: e.target.value })}
                    className="w-32 rounded border border-border bg-surface-2 px-2 py-1.5 text-xs text-text-base focus:outline-none focus:border-accent-lime [color-scheme:dark]"
                  />
                  <input
                    type="text"
                    placeholder="Stage"
                    value={a.stageName}
                    onChange={(e) => updateArtist(i, { stageName: e.target.value })}
                    className="w-24 rounded border border-border bg-surface-2 px-2 py-1.5 text-xs text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
                  />
                  <button
                    type="button"
                    onClick={() => removeArtist(i)}
                    className="w-6 h-6 flex items-center justify-center text-text-subtle hover:text-accent-pink transition-colors font-mono shrink-0"
                  >×</button>
                </div>
              ))}
              <button
                type="button"
                onClick={addArtist}
                className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors"
              >
                + Add artist
              </button>
            </div>
          )}

          {/* Optional fields toggle */}
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            className="text-xs font-mono text-text-subtle hover:text-text-muted transition-colors"
          >
            {showOptional ? "▾ Hide optional fields" : "▸ Optional fields (flyer, ticket price, notes)"}
          </button>

          {showOptional && (
            <div className="space-y-3 pt-1">
              {/* Flyer upload */}
              <div>
                <label className="block text-xs text-text-muted font-mono mb-1">Flyer</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className={clsx(
                      "text-xs font-mono px-3 py-1.5 rounded border cursor-pointer transition-colors shrink-0",
                      "border-border text-text-muted hover:border-accent-lime hover:text-accent-lime",
                      flyerUrl && "opacity-50 cursor-not-allowed",
                    )}>
                      {flyerFile ? "Change" : "Choose image"}
                      <input
                        ref={flyerFileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={!!flyerUrl}
                        onChange={(e) => {
                          setFlyerFile(e.target.files?.[0] ?? null);
                          setFlyerUrl("");
                          setShowFlyerUrlInput(false);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowFlyerUrlInput((v) => !v)}
                      disabled={!!flyerFile}
                      className={clsx(
                        "text-xs font-mono px-3 py-1.5 rounded border transition-colors shrink-0",
                        showFlyerUrlInput
                          ? "border-accent-lime text-accent-lime"
                          : "border-border text-text-muted hover:border-accent-lime hover:text-accent-lime",
                        flyerFile && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      URL
                    </button>
                    {(flyerFile || flyerUrl) && (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs text-text-base truncate">
                          {flyerFile ? flyerFile.name : "URL set"}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setFlyerFile(null);
                            setFlyerUrl("");
                            setShowFlyerUrlInput(false);
                            if (flyerFileRef.current) flyerFileRef.current.value = "";
                          }}
                          className="text-xs text-text-subtle hover:text-accent-pink transition-colors shrink-0"
                        >×</button>
                      </div>
                    )}
                    {!flyerFile && !flyerUrl && !showFlyerUrlInput && (
                      <span className="text-xs text-text-subtle">No flyer selected</span>
                    )}
                  </div>
                  {showFlyerUrlInput && (
                    <input
                      type="url"
                      placeholder="Paste image URL…"
                      value={flyerUrl}
                      onChange={(e) => setFlyerUrl(e.target.value)}
                      className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
                    />
                  )}
                </div>
              </div>

              {/* Ticket price */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-text-muted font-mono mb-1">Ticket price ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.ticketPrice}
                    onChange={(e) => setField("ticketPrice", e.target.value)}
                    className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-xs text-text-muted font-mono mb-1">Currency</label>
                  <select
                    value={form.ticketCurrency}
                    onChange={(e) => setField("ticketCurrency", e.target.value)}
                    className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base font-mono focus:outline-none focus:border-accent-lime"
                  >
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs text-text-muted font-mono mb-1">Personal notes</label>
                <textarea
                  rows={3}
                  placeholder="Your thoughts…"
                  value={form.personalNotes}
                  onChange={(e) => setField("personalNotes", e.target.value)}
                  className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime resize-none"
                />
              </div>

              {/* Source URL */}
              <div>
                <label className="block text-xs text-text-muted font-mono mb-1">Source URL</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={form.sourceUrl}
                  onChange={(e) => setField("sourceUrl", e.target.value)}
                  className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && <p className="text-xs text-accent-pink font-mono">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="text-xs font-mono text-text-subtle hover:text-text-base transition-colors px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="text-sm font-mono px-5 py-2 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Adding…" : "Add festival"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
