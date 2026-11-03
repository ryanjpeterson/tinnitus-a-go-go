/**
 * AddFestivalModal — modal form to create a new festival.
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import type { AttendanceStatus } from "@tagg/shared";
import { Sheet } from "@/components/ui/kit";
import { ArtistAutocomplete } from "@/components/ArtistAutocomplete";
import { VenueAutocomplete } from "@/components/VenueAutocomplete";

const STATUSES: { value: AttendanceStatus; label: string; active: string }[] = [
  { value: "attending",  label: "Attending",  active: "border-yellow-600  bg-yellow-950  text-yellow-400"  },
  { value: "interested", label: "Interested", active: "border-purple-700  bg-purple-950  text-purple-400"  },
  { value: "attended",   label: "Attended",   active: "border-accent-700    bg-accent-950    text-accent"  },
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
      navigate(`/festivals/${slug}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create festival.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet title="Add festival" onClose={handleClose}>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} className="px-5 py-5 space-y-4">

          {/* Name */}
          <div>
            <label className="block mb-1 label">Festival name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Coachella"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              className="w-full field h-11"
            />
          </div>

          {/* Dates */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block mb-1 label">Start date *</label>
              <input
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setField("startDate", e.target.value)}
                className="w-full scheme-dark field h-11"
              />
            </div>
            <div className="flex-1">
              <label className="block mb-1 label">End date</label>
              <input
                type="date"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={(e) => setField("endDate", e.target.value)}
                className="w-full scheme-dark field h-11"
              />
            </div>
          </div>

          {/* Venue */}
          <div>
            <label className="block mb-1 label">Venue</label>
            <div className="flex gap-2">
              <div className="flex-2">
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
                  className="w-full field h-11"
                />
              </div>
              <div className="w-20">
                <input
                  type="text"
                  placeholder="State"
                  value={form.venueRegion}
                  onChange={(e) => setField("venueRegion", e.target.value)}
                  className="w-full field h-11"
                />
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block mb-1 label">Status</label>
            <div className="flex gap-1 flex-wrap">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setField("status", s.value)}
                  className={clsx(
                    "min-w-[72px] px-3 py-1 rounded border text-xs  transition-colors text-center",
                    form.status === s.value
                      ? s.active
                      : "border-border text-text-muted hover:border-accent",
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
            className="text-xs text-text-subtle hover:text-text-muted transition-colors"
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
                    className="w-32 scheme-dark field h-11"
                  />
                  <input
                    type="text"
                    placeholder="Stage"
                    value={a.stageName}
                    onChange={(e) => updateArtist(i, { stageName: e.target.value })}
                    className="w-24 field h-11"
                  />
                  <button
                    type="button"
                    onClick={() => removeArtist(i)}
                    className="w-6 h-6 flex items-center justify-center text-text-subtle hover:text-highlight transition-colors shrink-0"
                  >×</button>
                </div>
              ))}
              <button
                type="button"
                onClick={addArtist}
                className="link-action"
              >
                + Add artist
              </button>
            </div>
          )}

          {/* Optional fields toggle */}
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            className="text-xs text-text-subtle hover:text-text-muted transition-colors"
          >
            {showOptional ? "▾ Hide optional fields" : "▸ Optional fields (flyer, ticket price, notes)"}
          </button>

          {showOptional && (
            <div className="space-y-3 pt-1">
              {/* Flyer upload */}
              <div>
                <label className="block mb-1 label">Flyer</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className={clsx(
                      "text-xs  px-3 py-1.5 rounded border cursor-pointer transition-colors shrink-0",
                      "border-border text-text-muted hover:border-accent hover:text-accent",
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
                        "text-xs  px-3 py-1.5 rounded border transition-colors shrink-0",
                        showFlyerUrlInput
                          ? "border-accent text-accent"
                          : "border-border text-text-muted hover:border-accent hover:text-accent",
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
                          className="shrink-0 link-action hover:text-highlight"
                        >×</button>
                      </div>
                    )}
                    {!flyerFile && !flyerUrl && !showFlyerUrlInput && (
                      <span className="text-sm text-text-subtle">No flyer selected</span>
                    )}
                  </div>
                  {showFlyerUrlInput && (
                    <input
                      type="url"
                      placeholder="Paste image URL…"
                      value={flyerUrl}
                      onChange={(e) => setFlyerUrl(e.target.value)}
                      className="w-full field h-11"
                    />
                  )}
                </div>
              </div>

              {/* Ticket price */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block mb-1 label">Ticket price ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.ticketPrice}
                    onChange={(e) => setField("ticketPrice", e.target.value)}
                    className="w-full field h-11"
                  />
                </div>
                <div className="w-20">
                  <label className="block mb-1 label">Currency</label>
                  <select
                    value={form.ticketCurrency}
                    onChange={(e) => setField("ticketCurrency", e.target.value)}
                    className="w-full field h-11"
                  >
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block mb-1 label">Personal notes</label>
                <textarea
                  rows={3}
                  placeholder="Your thoughts…"
                  value={form.personalNotes}
                  onChange={(e) => setField("personalNotes", e.target.value)}
                  className="w-full resize-none field py-2.5"
                />
              </div>

              {/* Source URL */}
              <div>
                <label className="block mb-1 label">Source URL</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={form.sourceUrl}
                  onChange={(e) => setField("sourceUrl", e.target.value)}
                  className="w-full field h-11"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && <p className="text-sm text-highlight">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="text-xs text-text-subtle hover:text-text-base transition-colors px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? "Adding…" : "Add festival"}
            </button>
          </div>
        </form>
    </Sheet>
  );
}
