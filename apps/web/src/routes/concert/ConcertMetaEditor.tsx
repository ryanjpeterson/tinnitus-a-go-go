/** Show page: editor for the shared show fields (date, venue, type, festival, notes, url). */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, type ConcertDetail } from "@/lib/api";
import { VenueAutocomplete } from "@/components/VenueAutocomplete";
import { fmtDate } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// Concert metadata editor (shared fields: date, venue, type, series, notes, url)
// ─────────────────────────────────────────────────────────────────────────────

interface MetaForm {
  date: string;
  dateIsApproximate: boolean;
  type: "concert" | "festival_day";
  venueName: string;
  venueCity: string;
  venueRegion: string;
  eventSeriesName: string;
  eventSeriesYear: string;
  eventNotes: string;
  sourceUrl: string;
}

export function ConcertMetaEditor({ concert }: { concert: ConcertDetail }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const enterEdit = () => {
    setForm({
      date: concert.date,
      dateIsApproximate: concert.dateIsApproximate,
      type: concert.type,
      venueName: concert.venue?.name ?? "",
      venueCity: concert.venue?.city ?? "",
      venueRegion: concert.venue?.region ?? "",
      eventSeriesName: concert.eventSeries?.name ?? "",
      eventSeriesYear: concert.type === "festival_day" ? (concert.eventSeries?.year?.toString() ?? "") : "",
      eventNotes: concert.eventNotes ?? "",
      sourceUrl: concert.sourceUrl ?? "",
    });
    setSaveError(null);
    setEditing(true);
  };

  const [form, setForm] = useState<MetaForm>({
    date: concert.date,
    dateIsApproximate: concert.dateIsApproximate,
    type: concert.type,
    venueName: concert.venue?.name ?? "",
    venueCity: concert.venue?.city ?? "",
    venueRegion: concert.venue?.region ?? "",
    eventSeriesName: concert.eventSeries?.name ?? "",
    eventSeriesYear: concert.type === "festival_day" ? (concert.eventSeries?.year?.toString() ?? "") : "",
    eventNotes: concert.eventNotes ?? "",
    sourceUrl: concert.sourceUrl ?? "",
  });

  const setField = <K extends keyof MetaForm>(k: K, v: MetaForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleTypeChange = (t: "concert" | "festival_day") => {
    setField("type", t);
    // Clear year when switching to concert (year only applies to festival)
    if (t === "concert") setField("eventSeriesYear", "");
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const body: Parameters<typeof api.patchConcert>[1] = {
        date: form.date,
        dateIsApproximate: form.dateIsApproximate,
        type: form.type,
        venueName: form.venueName.trim(),
        venueCity: form.venueCity.trim() || null,
        venueRegion: form.venueRegion.trim() || null,
        // A festival day belongs to its festival; a concert to none.
        eventSeriesName: form.type === "festival_day" ? form.eventSeriesName.trim() || null : null,
        eventSeriesYear: (form.type === "festival_day" && form.eventSeriesYear)
          ? parseInt(form.eventSeriesYear, 10)
          : null,
        eventNotes: form.eventNotes.trim() || null,
        sourceUrl: form.sourceUrl.trim() || null,
      };
      await api.patchConcert(concert.id, body);
      await qc.invalidateQueries({ queryKey: ["concerts", concert.id] });
      void qc.invalidateQueries({ queryKey: ["concerts"] });
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="h-section">Concert info</span>
        {!editing ? (
          <button
            onClick={enterEdit}
            className="link-action"
          >
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {saveError && <span className="text-sm text-accent-pink">{saveError}</span>}
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-text-subtle hover:text-text-base transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="btn btn-sm btn-primary"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      {!editing ? (
        /* ── Read mode ── */
        <dl className="space-y-1.5 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-xs text-text-subtle w-16 shrink-0">Date</dt>
            <dd className="text-text-base">
              {fmtDate(concert.date)}
              {concert.dateIsApproximate && (
                <span className="ml-2 text-sm text-text-subtle">(approx.)</span>
              )}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-xs text-text-subtle w-16 shrink-0">Type</dt>
            <dd>
              <span className="text-sm px-1.5 py-0.5 rounded border border-border text-text-muted">
                {concert.type === "festival_day" ? "Festival day" : "Concert"}
              </span>
            </dd>
          </div>
          {concert.venue && (
            <div className="flex items-baseline gap-2">
              <dt className="text-xs text-text-subtle w-16 shrink-0">Venue</dt>
              <dd className="text-text-base">
                {concert.venue.name}
                {concert.venue.city && <span className="text-text-subtle"> · {concert.venue.city}</span>}
                {concert.venue.region && <span className="text-text-subtle">, {concert.venue.region}</span>}
              </dd>
            </div>
          )}
          {concert.eventSeries && (
            <div className="flex items-baseline gap-2">
              <dt className="text-xs text-text-subtle w-16 shrink-0">
                {concert.type === "festival_day" ? "Festival" : "Tour"}
              </dt>
              <dd className="text-text-base">
                {concert.eventSeries.name}
              </dd>
            </div>
          )}
          {concert.eventNotes && (
            <div className="flex items-baseline gap-2">
              <dt className="text-xs text-text-subtle w-16 shrink-0">Notes</dt>
              <dd className="text-text-base italic text-sm">{concert.eventNotes}</dd>
            </div>
          )}
          {concert.sourceUrl && (
            <div className="flex items-baseline gap-2">
              <dt className="text-xs text-text-subtle w-16 shrink-0">Source</dt>
              <dd>
                <a
                  href={concert.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate block max-w-xs link-action"
                >
                  {concert.sourceUrl} ↗
                </a>
              </dd>
            </div>
          )}
        </dl>
      ) : (
        /* ── Edit mode ── */
        <div className="space-y-3">
          {/* Date + approximate */}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block mb-1 label">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
                className="w-full [color-scheme:dark] field h-11"
              />
            </div>
            <label className="flex items-center gap-2 mb-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.dateIsApproximate}
                onChange={(e) => setField("dateIsApproximate", e.target.checked)}
                className="accent-accent-lime"
              />
              <span className="text-sm text-text-muted">Approximate</span>
            </label>
          </div>

          {/* Type */}
          <div>
            <label className="block mb-1 label">Type</label>
            <div className="flex rounded border border-border overflow-hidden w-fit">
              {(["concert", "festival_day"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={clsx(
                    "px-3 py-1.5 text-xs  transition-colors",
                    form.type === t
                      ? "bg-accent-lime text-on-accent font-bold"
                      : "bg-surface-2 text-text-muted hover:text-text-base",
                  )}
                >
                  {t === "concert" ? "Concert" : "Festival day"}
                </button>
              ))}
            </div>
          </div>

          {/* Venue with autocomplete */}
          <div className="flex gap-2">
            <div className="flex-[2]">
              <label className="block mb-1 label">Venue name</label>
              <VenueAutocomplete
                value={form.venueName}
                onChange={(v) => setField("venueName", v)}
                onSelect={(name, city, region) => {
                  setField("venueName", name);
                  setField("venueCity", city);
                  setField("venueRegion", region);
                }}
                placeholder="Venue name"
              />
            </div>
            <div className="flex-1">
              <label className="block mb-1 label">City</label>
              <input
                type="text"
                value={form.venueCity}
                onChange={(e) => setField("venueCity", e.target.value)}
                placeholder="City"
                className="w-full field h-11"
              />
            </div>
            <div className="flex-1">
              <label className="block mb-1 label">State/province</label>
              <input
                type="text"
                value={form.venueRegion}
                onChange={(e) => setField("venueRegion", e.target.value)}
                placeholder="State / province"
                className="w-full field h-11"
              />
            </div>
          </div>

          {/* A festival day names its festival; a concert has none. */}
          {form.type === "concert" ? null : (
            <div>
              <label className="block mb-1 label">
                Festival name <span className="text-accent-pink">*</span>
              </label>
              <input
                type="text"
                value={form.eventSeriesName}
                onChange={(e) => setField("eventSeriesName", e.target.value)}
                placeholder="Festival name…"
                className="w-full field h-11"
              />
            </div>
          )}

          {/* Event notes */}
          <div>
            <label className="block mb-1 label">Event notes (shared)</label>
            <textarea
              rows={2}
              value={form.eventNotes}
              onChange={(e) => setField("eventNotes", e.target.value)}
              placeholder="Notes visible to all attendees…"
              className="w-full resize-none field py-2.5"
            />
          </div>

          {/* Source URL */}
          <div>
            <label className="block mb-1 label">Source URL</label>
            <input
              type="url"
              value={form.sourceUrl}
              onChange={(e) => setField("sourceUrl", e.target.value)}
              placeholder="https://…"
              className="w-full field h-11"
            />
          </div>
        </div>
      )}
    </div>
  );
}
