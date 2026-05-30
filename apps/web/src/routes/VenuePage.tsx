/**
 * Venue detail — cover photo, stats, show history, inline editor, and alias management.
 */

import { useState, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type VenueAlias } from "@/lib/api";
import { VenueMap } from "@/components/VenueMap";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

const STATUS_CHIP: Record<string, { label: string; color: string }> = {
  attended:  { label: "Attended",  color: "text-accent-lime" },
  attending: { label: "Attending", color: "text-yellow-400"  },
  interested:{ label: "Interested",color: "text-purple-400"  },
  missed:    { label: "Missed",    color: "text-red-400"     },
  cancelled: { label: "Cancelled", color: "text-text-subtle" },
  dismissed: { label: "Dismissed", color: "text-text-subtle" },
};
const DEFAULT_CHIP = { label: "Unknown", color: "text-text-subtle" };

// ─────────────────────────────────────────────────────────────────────────────
// Venue edit form
// ─────────────────────────────────────────────────────────────────────────────

interface VenueEditFormProps {
  venue: {
    name: string;
    slug: string;
    city: string | null;
    region: string | null;
    country: string | null;
    lat: number | null;
    lng: number | null;
    capacity: number | null;
  };
  onCancel: () => void;
  onSaved: (newSlug: string) => void;
}

function VenueEditForm({ venue, onCancel, onSaved }: VenueEditFormProps) {
  const [name,     setName]     = useState(venue.name);
  const [city,     setCity]     = useState(venue.city     ?? "");
  const [region,   setRegion]   = useState(venue.region   ?? "");
  const [country,  setCountry]  = useState(venue.country  ?? "");
  const [lat,      setLat]      = useState(venue.lat      != null ? String(venue.lat)  : "");
  const [lng,      setLng]      = useState(venue.lng      != null ? String(venue.lng)  : "");
  const [capacity, setCapacity] = useState(venue.capacity != null ? String(venue.capacity) : "");
  const [saveError, setSaveError] = useState<string | null>(null);

  const patchMutation = useMutation({
    mutationFn: () =>
      api.patchVenue(venue.slug, {
        name:     name.trim()     || venue.name,
        city:     city.trim()     || null,
        region:   region.trim()   || null,
        country:  country.trim()  || null,
        lat:      lat.trim()      ? parseFloat(lat)      : null,
        lng:      lng.trim()      ? parseFloat(lng)      : null,
        capacity: capacity.trim() ? parseInt(capacity, 10) : null,
      }),
    onSuccess: ({ slug: newSlug }) => onSaved(newSlug),
    onError: (err) => setSaveError(err instanceof Error ? err.message : "Save failed."),
  });

  return (
    <div className="rounded-lg border border-accent-lime/30 bg-surface p-5 mb-6">
      <h2 className="font-display uppercase text-sm text-accent-lime tracking-widest mb-4">Edit Venue</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs text-text-muted font-mono mb-1">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-base focus:outline-none focus:border-accent-lime" />
        </div>

        <div>
          <label className="block text-xs text-text-muted font-mono mb-1">City</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Toronto"
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime" />
        </div>

        <div>
          <label className="block text-xs text-text-muted font-mono mb-1">State / Province</label>
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. ON"
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime" />
        </div>

        <div>
          <label className="block text-xs text-text-muted font-mono mb-1">Country</label>
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Canada"
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime" />
        </div>

        <div>
          <label className="block text-xs text-text-muted font-mono mb-1">Capacity</label>
          <input value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 19800"
            type="number" min="1"
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime" />
        </div>

        <div>
          <label className="block text-xs text-text-muted font-mono mb-1">Latitude</label>
          <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="e.g. 43.6435"
            type="number" step="any"
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime font-mono" />
        </div>

        <div>
          <label className="block text-xs text-text-muted font-mono mb-1">Longitude</label>
          <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="e.g. -79.3791"
            type="number" step="any"
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime font-mono" />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        {saveError && <span className="text-xs text-accent-pink font-mono">{saveError}</span>}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCancel} disabled={patchMutation.isPending}
            className="text-xs font-mono px-3 py-1.5 rounded border border-border text-text-muted hover:text-text-base transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="button"
            onClick={() => { setSaveError(null); patchMutation.mutate(); }}
            disabled={patchMutation.isPending || !name.trim()}
            className="text-xs font-mono px-3 py-1.5 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
            {patchMutation.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Alias management
// ─────────────────────────────────────────────────────────────────────────────

function AliasesSection({
  venueSlug,
  aliases,
}: {
  venueSlug: string;
  aliases: VenueAlias[];
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [aliasName, setAliasName]         = useState("");
  const [aliasFrom, setAliasFrom]         = useState("");
  const [aliasUntil, setAliasUntil]       = useState("");
  const [aliasNotes, setAliasNotes]       = useState("");
  const [addError, setAddError]           = useState<string | null>(null);
  const [deletingId, setDeletingId]       = useState<string | null>(null);

  const addMutation = useMutation({
    mutationFn: () =>
      api.addVenueAlias(venueSlug, {
        name:        aliasName.trim(),
        activeFrom:  aliasFrom.trim()  || null,
        activeUntil: aliasUntil.trim() || null,
        notes:       aliasNotes.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venues", venueSlug] });
      setAdding(false);
      setAliasName(""); setAliasFrom(""); setAliasUntil(""); setAliasNotes("");
    },
    onError: (err) => setAddError(err instanceof Error ? err.message : "Failed to add alias."),
  });

  const deleteMutation = useMutation({
    mutationFn: (aliasId: string) => api.deleteVenueAlias(venueSlug, aliasId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venues", venueSlug] });
      setDeletingId(null);
    },
  });

  return (
    <div className="rounded-lg border border-border bg-surface p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-mono uppercase tracking-wider text-text-muted">
          Also known as
        </h2>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors">
            + Add alias
          </button>
        )}
      </div>

      {aliases.length === 0 && !adding && (
        <p className="text-xs text-text-subtle font-mono">No aliases recorded.</p>
      )}

      {aliases.length > 0 && (
        <ul className="space-y-2 mb-3">
          {aliases.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-sm text-text-base">{a.name}</span>
                {(a.activeFrom || a.activeUntil) && (
                  <span className="ml-2 text-xs font-mono text-text-subtle">
                    {a.activeFrom ?? "?"} – {a.activeUntil ?? "present"}
                  </span>
                )}
                {a.notes && (
                  <p className="text-xs text-text-subtle italic mt-0.5">{a.notes}</p>
                )}
              </div>
              {deletingId === a.id ? (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => deleteMutation.mutate(a.id)} disabled={deleteMutation.isPending}
                    className="text-xs font-mono px-2 py-0.5 rounded bg-accent-pink text-white hover:opacity-90 disabled:opacity-50">
                    {deleteMutation.isPending ? "…" : "Remove"}
                  </button>
                  <button onClick={() => setDeletingId(null)}
                    className="text-xs font-mono px-2 py-0.5 rounded border border-border text-text-muted hover:text-text-base">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setDeletingId(a.id)}
                  className="text-xs font-mono text-text-subtle hover:text-accent-pink transition-colors shrink-0">
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="border-t border-border pt-3 mt-2 space-y-2">
          <div>
            <label className="block text-xs text-text-muted font-mono mb-1">Alias name</label>
            <input value={aliasName} onChange={(e) => setAliasName(e.target.value)}
              placeholder="e.g. Air Canada Centre"
              className="w-full rounded border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-muted font-mono mb-1">Used from</label>
              <input value={aliasFrom} onChange={(e) => setAliasFrom(e.target.value)}
                type="date"
                className="w-full rounded border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent-lime" />
            </div>
            <div>
              <label className="block text-xs text-text-muted font-mono mb-1">Used until</label>
              <input value={aliasUntil} onChange={(e) => setAliasUntil(e.target.value)}
                type="date"
                className="w-full rounded border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent-lime" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-muted font-mono mb-1">Notes <span className="text-text-subtle">(optional)</span></label>
            <input value={aliasNotes} onChange={(e) => setAliasNotes(e.target.value)}
              placeholder="e.g. former name before 2018 renovation"
              className="w-full rounded border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime" />
          </div>
          {addError && <p className="text-xs text-accent-pink font-mono">{addError}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => { setAdding(false); setAddError(null); }}
              className="text-xs font-mono px-3 py-1.5 rounded border border-border text-text-muted hover:text-text-base transition-colors">
              Cancel
            </button>
            <button onClick={() => { setAddError(null); addMutation.mutate(); }}
              disabled={addMutation.isPending || !aliasName.trim()}
              className="text-xs font-mono px-3 py-1.5 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
              {addMutation.isPending ? "Saving…" : "Add alias"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function VenuePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  const q = useQuery({
    queryKey: ["venues", slug],
    queryFn: () => api.getVenue(slug!),
    enabled: !!slug,
  });

  if (q.isLoading) {
    return <div className="py-16 text-center text-text-subtle font-mono text-sm animate-pulse">Loading…</div>;
  }
  if (q.isError || !q.data) {
    return (
      <div className="py-16 text-center font-mono text-sm text-accent-pink">
        Venue not found. <Link to="/app/venues" className="underline text-text-muted">Back to venues</Link>
      </div>
    );
  }

  const { venue, concerts, stats } = q.data;

  const handlePhotoUpload = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0 || !slug) return;
    try {
      await api.uploadVenuePhoto(slug, files[0]!);
      await qc.invalidateQueries({ queryKey: ["venues", slug] });
    } catch {
      // swallow — future toast system
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const hasCoords = venue.lat != null && venue.lng != null;

  return (
    <div className="max-w-2xl">
      <Link to="/app/venues" className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors">
        ← Venues
      </Link>

      {/* Venue photo */}
      <div className="mt-4 mb-5 rounded-lg border border-border bg-surface overflow-hidden">
        <div className="relative aspect-video bg-surface-2">
          {venue.imageUrl ? (
            <img src={venue.imageUrl} alt={venue.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="font-display uppercase text-4xl text-text-subtle opacity-20 tracking-widest">
                {venue.name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
              </span>
            </div>
          )}
          <label className="absolute bottom-2 right-2 text-xs font-mono px-2 py-1 rounded border border-white/30 text-white/60 bg-black/40 hover:border-accent-lime hover:text-accent-lime cursor-pointer transition-colors">
            {venue.imageUrl ? "Change photo" : "Add photo"}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
              onChange={(e) => void handlePhotoUpload(e.target.files)} />
          </label>
        </div>
      </div>

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="font-display uppercase text-3xl mb-1">{venue.name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
              {(venue.city || venue.region) && (
                <span>{[venue.city, venue.region, venue.country].filter(Boolean).join(", ")}</span>
              )}
              {venue.capacity != null && (
                <span className="font-mono text-xs text-text-subtle">Cap. {venue.capacity.toLocaleString()}</span>
              )}
              {hasCoords && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${venue.lat}&mlon=${venue.lng}#map=16/${venue.lat}/${venue.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors"
                >
                  → Map ↗
                </a>
              )}
            </div>
          </div>
          {!editing && (
            <button onClick={() => setEditing(true)}
              className="mt-1 flex-shrink-0 text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors border border-border rounded px-2.5 py-1">
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <VenueEditForm
          venue={venue}
          onCancel={() => setEditing(false)}
          onSaved={(newSlug) => {
            setEditing(false);
            if (newSlug !== slug) {
              navigate(`/app/venues/${newSlug}`, { replace: true });
            } else {
              qc.invalidateQueries({ queryKey: ["venues", slug] });
            }
          }}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Total shows", value: stats.total },
          { label: "Attended",    value: stats.attended },
          { label: "First visit", value: stats.firstVisit ? fmtDate(stats.firstVisit) : "–" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-4 text-center">
            <div className="font-mono text-lg text-text-base leading-tight">{value}</div>
            <div className="text-xs text-text-muted mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Aliases */}
      <AliasesSection venueSlug={slug!} aliases={venue.aliases} />

      {/* Map */}
      {hasCoords && (
        <div className="mb-6">
          <p className="text-xs font-mono uppercase tracking-wider text-text-muted mb-2">Location</p>
          <VenueMap lat={venue.lat!} lng={venue.lng!} venueName={venue.name} />
        </div>
      )}

      {/* Show history */}
      {concerts.length === 0 ? (
        <p className="py-8 text-center text-xs text-text-subtle font-mono border border-border rounded-lg">No shows logged.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {concerts.map((c) => (
            <Link
              key={c.id}
              to={`/app/concerts/${c.id}`}
              className="group flex items-start gap-3 rounded-lg border border-border bg-surface p-3 hover:border-accent-lime transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-base truncate group-hover:text-accent-lime transition-colors">
                  {c.headlinerName ?? c.headlinerHint ?? c.eventSeries?.name ?? "Unknown show"}
                </div>
                <time className="font-mono text-xs text-text-muted tabular-nums block mt-0.5">
                  {fmtDate(c.date)}
                </time>
                {c.eventSeries && (
                  <div className="text-xs text-text-subtle font-mono mt-0.5 italic">{c.eventSeries.name}</div>
                )}
              </div>
              <span className={`shrink-0 text-xs font-mono mt-0.5 ${(STATUS_CHIP[c.attendance.status] ?? DEFAULT_CHIP).color}`}>
                {(STATUS_CHIP[c.attendance.status] ?? DEFAULT_CHIP).label}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
