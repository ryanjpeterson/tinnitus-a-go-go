/**
 * AddConcertModal — modal form to create a new concert + attendance record.
 *
 * Uses the existing POST /concerts endpoint which upserts artists and venues by
 * name, so the user can type existing names or new ones freely.
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, type ArtistListItem, type VenueListItem, type SetlistfmResult, type SetlistfmError, type ParsedEvent } from "@/lib/api";
import type { AttendanceStatus } from "@tagg/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Types / constants
// ─────────────────────────────────────────────────────────────────────────────

type ArtistRole = "headliner" | "co_headliner" | "support";

const ROLES: { value: ArtistRole; label: string }[] = [
  { value: "headliner",    label: "Headliner" },
  { value: "co_headliner", label: "Co-headliner" },
  { value: "support",      label: "Support" },
];

const STATUSES: { value: AttendanceStatus; label: string; active: string }[] = [
  { value: "attending",  label: "Attending",  active: "border-yellow-600  bg-yellow-950  text-yellow-400"  },
  { value: "interested", label: "Interested", active: "border-purple-700  bg-purple-950  text-purple-400"  },
  { value: "attended",   label: "Attended",   active: "border-lime-700    bg-lime-950    text-accent-lime"  },
  { value: "missed",     label: "Missed",     active: "border-red-700     bg-red-950     text-red-400"      },
];

interface ArtistRow {
  name: string;
  role: ArtistRole;
  // populated when user selects from autocomplete
  resolvedName?: string;
}

interface FormState {
  date: string;
  dateIsApproximate: boolean;
  venueName: string;
  venueCity: string;
  venueRegion: string;
  eventSeriesName: string; // Tour name (e.g., "The Eras Tour")
  artists: ArtistRow[];
  status: AttendanceStatus;
  personalNotes: string;
  ticketPrice: string;       // display dollars, converted to cents on submit
  ticketCurrency: string;
}

const CURRENCIES = ["CAD", "USD", "EUR"] as const;

const DEFAULT_FORM: FormState = {
  date: "",
  dateIsApproximate: false,
  venueName: "",
  venueCity: "",
  venueRegion: "",
  eventSeriesName: "", // Tour name
  artists: [{ name: "", role: "headliner" }],
  status: "interested",
  personalNotes: "",
  ticketPrice: "",
  ticketCurrency: "CAD",
};

/** Levenshtein edit distance (case-insensitive inputs expected). */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!;
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j - 1]!, row[j]!);
      prev = tmp;
    }
  }
  return row[n]!;
}

// ─────────────────────────────────────────────────────────────────────────────
// Venue autocomplete input
// ─────────────────────────────────────────────────────────────────────────────

function VenueAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Venue name",
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect: (name: string, city: string, region: string) => void;
  placeholder?: string;
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
        placeholder={placeholder}
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

// ─────────────────────────────────────────────────────────────────────────────
// Artist row with autocomplete + fuzzy suggestion
// ─────────────────────────────────────────────────────────────────────────────

function ArtistInput({
  row,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  row: ArtistRow;
  index: number;
  canRemove: boolean;
  onChange: (idx: number, patch: Partial<ArtistRow>) => void;
  onRemove: (idx: number) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [results, setResults] = useState<ArtistListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [suggested, setSuggested] = useState<ArtistListItem | null>(null);

  const handleNameChange = (val: string) => {
    onChange(index, { name: val, resolvedName: undefined });
    setSuggested(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!val.trim()) { setResults([]); setShowDrop(false); return; }
    setShowDrop(true);
    timerRef.current = setTimeout(() => {
      setSearching(true);
      api.listArtists({ q: val, limit: 6 })
        .then(async (r) => {
          setResults(r.artists);
          // Fuzzy suggestion when no results
          if (r.artists.length === 0 && val.length >= 3) {
            const stem = val.slice(0, Math.max(3, Math.floor(val.length * 0.7)));
            try {
              const stemRes = await api.listArtists({ q: stem, limit: 12 });
              if (stemRes.artists.length > 0) {
                const valLower = val.toLowerCase();
                let best = stemRes.artists[0]!;
                let bestDist = levenshtein(valLower, best.name.toLowerCase());
                for (const c of stemRes.artists.slice(1)) {
                  const d = levenshtein(valLower, c.name.toLowerCase());
                  if (d < bestDist) { bestDist = d; best = c; }
                }
                if (bestDist <= 2) setSuggested(best);
              }
            } catch {
              // ignore
            }
          }
        })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 280);
  };

  const handlePick = (artist: ArtistListItem) => {
    onChange(index, { name: artist.name, resolvedName: artist.name });
    setResults([]);
    setShowDrop(false);
    setSuggested(null);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {/* Artist name with autocomplete */}
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            placeholder={index === 0 ? "Headliner name" : "Artist name"}
            value={row.name}
            onChange={(e) => handleNameChange(e.target.value)}
            onFocus={() => row.name.trim() && setShowDrop(true)}
            onBlur={() => setTimeout(() => setShowDrop(false), 150)}
            className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
          />
          {showDrop && (searching || results.length > 0) && (
            <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-surface border border-border rounded-lg shadow-xl py-1 max-h-40 overflow-y-auto">
              {searching ? (
                <div className="px-3 py-2 text-xs text-text-subtle font-mono animate-pulse">Searching…</div>
              ) : (
                results.map((a) => (
                  <button
                    key={a.id}
                    onMouseDown={() => handlePick(a)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 flex items-center justify-between gap-2"
                  >
                    <span className="text-text-base truncate">{a.name}</span>
                    <span className="text-xs text-text-subtle font-mono shrink-0">{a.showCount} shows</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Role */}
        <select
          value={row.role}
          onChange={(e) => onChange(index, { role: e.target.value as ArtistRole })}
          className="text-xs font-mono rounded border border-border bg-surface-2 px-1.5 py-1.5 text-text-muted focus:outline-none focus:border-accent-lime w-[120px] shrink-0"
        >
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>

        {/* Remove */}
        <button
          type="button"
          onClick={() => onRemove(index)}
          disabled={!canRemove}
          className="w-7 h-7 flex items-center justify-center text-text-subtle hover:text-accent-pink disabled:opacity-20 transition-colors font-mono shrink-0"
          title="Remove"
        >×</button>
      </div>

      {/* Fuzzy "Did you mean?" hint */}
      {suggested && (
        <p className="text-xs font-mono text-text-muted pl-0.5">
          Did you mean{" "}
          <button
            type="button"
            className="text-accent-lime hover:underline"
            onMouseDown={() => {
              handlePick(suggested);
            }}
          >
            {suggested.name}
          </button>
          ?
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

export function AddConcertModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);

  // Flyer upload (optional, happens after concert is created)
  const [flyerFile, setFlyerFile] = useState<File | null>(null);
  const flyerFileRef = useRef<HTMLInputElement>(null);
  const [flyerUrl, setFlyerUrl] = useState("");
  const [showFlyerUrlInput, setShowFlyerUrlInput] = useState(false);

  // URL paste parser
  const [urlInput, setUrlInput] = useState("");

  // Check if form has been modified from defaults
  const isFormDirty = (): boolean => {
    if (form.date !== DEFAULT_FORM.date) return true;
    if (form.venueName !== DEFAULT_FORM.venueName) return true;
    if (form.venueCity !== DEFAULT_FORM.venueCity) return true;
    if (form.venueRegion !== DEFAULT_FORM.venueRegion) return true;
    if (form.eventSeriesName !== DEFAULT_FORM.eventSeriesName) return true;
    if (form.personalNotes !== DEFAULT_FORM.personalNotes) return true;
    if (form.ticketPrice !== DEFAULT_FORM.ticketPrice) return true;
    if (form.artists.length !== 1) return true;
    if (form.artists[0]?.name !== "") return true;
    if (flyerFile !== null) return true;
    if (flyerUrl.trim() !== "") return true;
    if (urlInput.trim() !== "") return true;
    return false;
  };

  // Close with confirmation if form has unsaved changes
  const handleClose = () => {
    if (submitting) return;
    if (isFormDirty()) {
      if (!window.confirm("Are you sure you want to close this modal? Any unsaved changes will be lost.")) {
        return;
      }
    }
    onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, flyerFile, urlInput, submitting]);

  const [urlParsing, setUrlParsing] = useState(false);
  const [urlParseError, setUrlParseError] = useState<string | null>(null);
  const [urlParseApplied, setUrlParseApplied] = useState(false);

  const handleParseUrl = async (): Promise<void> => {
    if (!urlInput.trim()) return;
    setUrlParsing(true);
    setUrlParseError(null);
    try {
      const result = await api.parseEventUrl(urlInput.trim());
      applyParsed(result);
      setUrlParseApplied(true);
    } catch (err) {
      setUrlParseError(err instanceof Error ? err.message : "Could not parse the URL.");
    } finally {
      setUrlParsing(false);
    }
  };

  const applyParsed = (parsed: ParsedEvent): void => {
    // Auto-select status based on date: past = attended, future/none = interested
    const todayStr = new Date().toISOString().slice(0, 10);
    const autoStatus: AttendanceStatus = parsed.date && parsed.date < todayStr
      ? "attended"
      : "interested";

    setForm((prev) => ({
      ...prev,
      date:            parsed.date       ?? prev.date,
      venueName:       parsed.venueName  ?? prev.venueName,
      venueCity:       parsed.venueCity  ?? prev.venueCity,
      status:          autoStatus,
      artists: parsed.artists.length > 0
        ? parsed.artists.map((name, i) => ({
            name,
            role: (i === 0 ? "headliner" : "support") as ArtistRole,
          }))
        : prev.artists,
    }));
    // Show optional section if event series name came through
    if (parsed.eventName) setShowOptional(true);
  };

  // Setlist.fm prefill
  const [setlistResults, setSetlistResults] = useState<SetlistfmResult[]>([]);
  const [setlistSearching, setSetlistSearching] = useState(false);
  const [setlistApplied, setSetlistApplied] = useState(false);
  const [setlistAvailable, setSetlistAvailable] = useState(true);
  const [setlistError, setSetlistError] = useState<SetlistfmError | null>(null);
  const setlistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SETLIST_ERROR_MESSAGES: Record<SetlistfmError, string> = {
    auth_error:     "Setlist.fm API key is invalid — check SETLISTFM_API_KEY in your server config.",
    rate_limited:   "Setlist.fm rate limit hit — wait a moment then try again.",
    upstream_error: "Setlist.fm returned an error. Try again shortly.",
    network_error:  "Couldn't reach setlist.fm — check your internet connection.",
    parse_error:    "Unexpected response from setlist.fm. Try again.",
  };

  // Today's ISO date for min/max constraints
  const today = new Date().toISOString().slice(0, 10);

  // Date input constraints based on status
  const dateMin = (form.status === "interested" || form.status === "attending") ? today : undefined;
  const dateMax = (form.status === "attended" || form.status === "missed") ? today : undefined;

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // When status changes, clear date if it violates the new constraint
  const handleStatusChange = (status: AttendanceStatus) => {
    setField("status", status);
    if ((status === "interested" || status === "attending") && form.date && form.date < today) {
      setField("date", "");
    }
    if ((status === "attended" || status === "missed") && form.date && form.date > today) {
      setField("date", "");
    }
  };

  // Auto-fetch setlist.fm when artist[0] + date are both filled
  const firstArtistName = form.artists[0]?.name.trim() ?? "";

  const runSetlistSearch = (artist: string, date: string) => {
    setSetlistSearching(true);
    setSetlistError(null);
    setSetlistResults([]);
    api
      .searchSetlistfm({ artist, date })
      .then((res) => {
        setSetlistAvailable(res.available);
        if (res.error) {
          setSetlistError(res.error);
        } else {
          setSetlistResults(res.results);
        }
      })
      .catch(() => {
        // Network/parse failure that didn't reach the server (e.g. auth session expired)
        setSetlistError("network_error");
      })
      .finally(() => setSetlistSearching(false));
  };

  useEffect(() => {
    // Skip if no artist, no date, already applied, or date is today or in the future
    // (setlist.fm only has data for past concerts)
    if (!firstArtistName || !form.date || setlistApplied || form.date >= today) return;
    // Clear stale results/errors whenever the inputs change
    setSetlistError(null);
    setSetlistResults([]);
    if (setlistTimerRef.current) clearTimeout(setlistTimerRef.current);
    setlistTimerRef.current = setTimeout(() => {
      runSetlistSearch(firstArtistName, form.date);
    }, 600);
    return () => { if (setlistTimerRef.current) clearTimeout(setlistTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstArtistName, form.date, today]);

  const applySetlistResult = (r: SetlistfmResult) => {
    setField("venueName", r.venue);
    setField("venueCity", r.city);
    setSetlistApplied(true);
    setSetlistResults([]);
    setSetlistError(null);
  };

  const updateArtist = (idx: number, patch: Partial<ArtistRow>) =>
    setForm((prev) => {
      const artists = [...prev.artists];
      artists[idx] = { ...artists[idx]!, ...patch };
      return { ...prev, artists };
    });

  const addArtist = () =>
    setForm((prev) => ({
      ...prev,
      artists: [...prev.artists, { name: "", role: "support" }],
    }));

  const removeArtist = (idx: number) =>
    setForm((prev) => ({
      ...prev,
      artists: prev.artists.filter((_, i) => i !== idx),
    }));

  const validate = (): string | null => {
    if (!form.date) return "Date is required.";
    // Enforce status-based date constraints
    if ((form.status === "interested" || form.status === "attending") && form.date < today) {
      return `Status "${form.status}" requires a future date (today or later).`;
    }
    if ((form.status === "attended" || form.status === "missed") && form.date > today) {
      return `Status "${form.status}" requires today's date or earlier.`;
    }
    if (!form.venueName.trim()) return "Venue name is required.";
    if (form.artists.length === 0) return "At least one artist is required.";
    if (form.artists.some((a) => !a.name.trim())) return "All artist names must be filled in.";
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

      const { concertId } = await api.createConcert({
        date: form.date,
        dateIsApproximate: form.dateIsApproximate || undefined,
        type: "concert", // Always "concert" now; festivals are separate entities
        venueName: form.venueName.trim(),
        venueCity: form.venueCity.trim() || undefined,
        venueRegion: form.venueRegion.trim() || undefined,
        eventSeriesName: form.eventSeriesName.trim() || undefined, // Tour name
        artists: form.artists.map((a, i) => ({
          name: a.name.trim(),
          role: a.role,
          setOrder: i,
        })),
        status: form.status,
        personalNotes: form.personalNotes.trim() || undefined,
        ticketPricePaid: ticketCents,
        ticketPriceCurrency: ticketCents ? form.ticketCurrency : undefined,
      });

      // Upload flyer if one was selected (non-blocking — navigate even if this fails)
      if (flyerFile) {
        try {
          await api.uploadFlyer(concertId, flyerFile);
        } catch {
          // Flyer upload failure is non-fatal; user can upload from the detail page
        }
      } else if (flyerUrl.trim()) {
        try {
          await api.uploadFlyerFromUrl(concertId, flyerUrl.trim());
        } catch {
          // Flyer URL upload failure is non-fatal; user can upload from the detail page
        }
      }

      void qc.invalidateQueries({ queryKey: ["concerts"] });
      void qc.invalidateQueries({ queryKey: ["concerts/stats"] });
      navigate(`/shows/${concertId}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create show.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-lg bg-bg border border-border rounded-xl shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display uppercase text-lg">Add show</h2>
          <button
            onClick={handleClose}
            className="text-text-subtle hover:text-text-base transition-colors text-xl font-mono w-8 h-8 flex items-center justify-center"
          >×</button>
        </div>

        {/* URL paste pre-fill */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="Paste a Ticketmaster, Eventbrite, or AXS URL to pre-fill…"
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setUrlParseApplied(false); setUrlParseError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleParseUrl(); } }}
              className="flex-1 rounded border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
            />
            <button
              type="button"
              onClick={() => void handleParseUrl()}
              disabled={urlParsing || !urlInput.trim()}
              className="text-xs font-mono px-3 py-1.5 rounded bg-surface-2 border border-border text-text-muted hover:text-accent-lime hover:border-accent-lime transition-colors disabled:opacity-40 shrink-0"
            >
              {urlParsing ? "Parsing…" : "Import"}
            </button>
          </div>
          {urlParseError && (
            <p className="mt-1 text-xs text-accent-pink font-mono">{urlParseError}</p>
          )}
          {urlParseApplied && !urlParseError && (
            <p className="mt-1 text-xs text-accent-lime font-mono">
              ✓ Form pre-filled from URL —{" "}
              <button type="button" className="underline text-text-subtle hover:text-text-base"
                onClick={() => { setForm(DEFAULT_FORM); setUrlParseApplied(false); setUrlInput(""); }}>
                reset
              </button>
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} className="px-5 py-5 space-y-4">

          {/* Date + type */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-text-muted font-mono mb-1">Date *</label>
              <input
                type="date"
                required
                value={form.date}
                min={dateMin}
                max={dateMax}
                onChange={(e) => setField("date", e.target.value)}
                className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent-lime [color-scheme:dark]"
              />
              {(dateMin || dateMax) && (
                <p className="mt-0.5 text-xs text-text-subtle font-mono">
                  {dateMin ? `Must be ${today} or later` : `Must be ${today} or earlier`}
                </p>
              )}
            </div>
          </div>

          {/* Venue row: name (autocomplete) + city + state/province */}
          <div>
            <div className="flex gap-2 mb-2">
              <div className="flex-[2]">
                <label className="block text-xs text-text-muted font-mono mb-1">Venue *</label>
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
                <label className="block text-xs text-text-muted font-mono mb-1">City</label>
                <input
                  type="text"
                  placeholder="City"
                  value={form.venueCity}
                  onChange={(e) => setField("venueCity", e.target.value)}
                  className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-text-muted font-mono mb-1">State/province</label>
                <input
                  type="text"
                  placeholder="e.g. ON"
                  value={form.venueRegion}
                  onChange={(e) => setField("venueRegion", e.target.value)}
                  className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
                />
              </div>
            </div>
          </div>

          {/* Tour name (optional) */}
          <div>
            <label className="block text-xs text-text-muted font-mono mb-1">
              Tour name <span className="text-text-subtle">(optional — e.g. The Eras Tour)</span>
            </label>
            <input
              type="text"
              placeholder="Tour name…"
              value={form.eventSeriesName}
              onChange={(e) => setField("eventSeriesName", e.target.value)}
              className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
            />
          </div>

          {/* Artists */}
          <div>
            <label className="block text-xs text-text-muted font-mono mb-1.5">Artists *</label>
            <div className="space-y-2">
              {form.artists.map((a, i) => (
                <ArtistInput
                  key={i}
                  row={a}
                  index={i}
                  canRemove={form.artists.length > 1}
                  onChange={updateArtist}
                  onRemove={removeArtist}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addArtist}
              className="mt-2 text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors"
            >
              + Add another artist
            </button>
          </div>

          {/* Setlist.fm suggestion */}
          {setlistAvailable && !setlistApplied && (setlistSearching || setlistResults.length > 0 || setlistError) && (
            <div className={clsx(
              "rounded border bg-surface-2 px-3 py-2.5",
              setlistError ? "border-rose-800" : "border-border",
            )}>
              {/* Header row */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-text-subtle uppercase tracking-wider">
                    Setlist.fm
                  </span>
                  {setlistSearching && (
                    <span className="text-xs font-mono text-text-subtle animate-pulse">Searching…</span>
                  )}
                </div>
                {/* Retry button — shown on errors or empty results */}
                {!setlistSearching && (setlistError || setlistResults.length === 0) && (
                  <button
                    type="button"
                    onClick={() => runSetlistSearch(firstArtistName, form.date)}
                    className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors"
                  >
                    ↺ Retry
                  </button>
                )}
              </div>

              {/* Error state */}
              {setlistError && (
                <p className="text-xs font-mono text-accent-pink">
                  {SETLIST_ERROR_MESSAGES[setlistError]}
                </p>
              )}

              {/* Empty — no error */}
              {!setlistSearching && !setlistError && setlistResults.length === 0 && (
                <p className="text-xs text-text-subtle font-mono italic">No matches found for this artist and date.</p>
              )}

              {/* Results */}
              {setlistResults.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-1.5 border-t border-border first:border-0"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-text-base truncate">{r.artist}</div>
                    <div className="text-xs text-text-subtle font-mono">
                      {r.venue}{r.city ? ` · ${r.city}` : ""}{r.country ? ` (${r.country})` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => applySetlistResult(r)}
                    className="shrink-0 text-xs font-mono px-2.5 py-1 rounded border border-accent-lime text-accent-lime hover:bg-accent-lime/10 transition-colors"
                  >
                    Apply venue
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Venue applied confirmation */}
          {setlistApplied && (
            <p className="text-xs font-mono text-accent-lime">
              ✓ Venue prefilled from setlist.fm —{" "}
              <button
                type="button"
                className="underline text-text-subtle hover:text-text-base"
                onClick={() => setSetlistApplied(false)}
              >
                undo
              </button>
            </p>
          )}

          {/* Status */}
          <div>
            <label className="block text-xs text-text-muted font-mono mb-1">Status</label>
            <div className="flex gap-1 flex-wrap">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => handleStatusChange(s.value)}
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
              {submitting ? "Adding…" : "Add show"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
