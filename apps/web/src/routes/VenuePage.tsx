/**
 * Venue detail — cover photo, stats, show history, inline editor, and alias management.
 */

import { useState, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type VenueAlias } from "@/lib/api";
import { VenueMap } from "@/components/VenueMap";
import { useAuth } from "@/lib/auth-context";
import { fmtDate, plural } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState, EventRow, Hero, List, Loading, StatTile } from "@/components/ui/kit";

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
      <h2 className="font-display text-sm text-accent-lime tracking-widest mb-4">Edit Venue</h2>

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
  isAdmin = false,
}: {
  venueSlug: string;
  aliases: VenueAlias[];
  isAdmin?: boolean;
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
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="h-section">
          Also known as
        </h2>
        {isAdmin && !adding && (
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
              {isAdmin && (deletingId === a.id ? (
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
              ))}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && adding && (
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
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  // Photo upload state
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPhotoUrlInput, setShowPhotoUrlInput] = useState(false);
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [photoUrlImporting, setPhotoUrlImporting] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["venues", slug],
    queryFn: () => api.getVenue(slug!),
    enabled: !!slug,
  });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) {
    return (
      <EmptyState tone="error" title="Venue not found."
        action={<Link to="/venues"><Button variant="secondary">Back to venues</Button></Link>} />
    );
  }

  const { venue, concerts, stats } = q.data;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file || !slug) return;
    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      await api.uploadVenuePhoto(slug, file);
      await qc.invalidateQueries({ queryKey: ["venues", slug] });
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingPhoto(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handlePhotoUrlImport = async (): Promise<void> => {
    if (!photoUrlInput.trim() || !slug) return;
    setPhotoUrlImporting(true);
    setPhotoError(null);
    try {
      await api.uploadVenuePhotoFromUrl(slug, photoUrlInput.trim());
      await qc.invalidateQueries({ queryKey: ["venues", slug] });
      setPhotoUrlInput("");
      setShowPhotoUrlInput(false);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Failed to import image from URL.");
    } finally {
      setPhotoUrlImporting(false);
    }
  };

  const handleDeletePhoto = async (): Promise<void> => {
    if (!slug || !window.confirm("Remove this photo?")) return;
    try {
      await api.deleteVenuePhoto(slug);
      await qc.invalidateQueries({ queryKey: ["venues", slug] });
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  const hasCoords = venue.lat != null && venue.lng != null;

  const busy = uploadingPhoto || photoUrlImporting;
  const place = [venue.city, venue.region, venue.country].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      {!editing && (
        <Hero
          back={{ to: "/venues", label: "Venues" }}
          imageUrl={venue.imageUrl}
          square
          eyebrow="Venue"
          title={venue.name}
          accent="pink"
          actions={isAdmin && (
            <>
              <Button variant="secondary" className="rounded-full" onClick={() => setEditing(true)}>Edit venue</Button>
              <label className={`inline-flex h-10 cursor-pointer items-center rounded-full border border-border bg-surface-2 px-4 text-sm font-semibold transition-colors hover:bg-surface ${busy ? "pointer-events-none opacity-50" : ""}`}>
                {uploadingPhoto ? "Uploading…" : venue.imageUrl ? "Replace photo" : "Upload photo"}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                  onChange={(e) => void handlePhotoUpload(e)} disabled={busy} />
              </label>
              <Button variant="ghost" className="rounded-full" disabled={busy} onClick={() => setShowPhotoUrlInput((v) => !v)}>Photo URL</Button>
              {venue.imageUrl && (
                <Button variant="ghost" className="rounded-full text-text-muted hover:text-accent-pink" disabled={busy} onClick={() => void handleDeletePhoto()}>
                  Remove photo
                </Button>
              )}
            </>
          )}
        >
          {place && <p className="font-semibold text-text-base">{place}</p>}
          <p>
            {plural(stats.total, "show")}
            {stats.firstVisit && <> · first visit {fmtDate(stats.firstVisit)}</>}
            {venue.capacity != null && <> · cap. {venue.capacity.toLocaleString()}</>}
          </p>
        </Hero>
      )}

      {isAdmin && (showPhotoUrlInput || photoError) && (
        <div className="space-y-2">
          {showPhotoUrlInput && (
            <div className="flex gap-2">
              <input type="url" placeholder="Paste image URL" value={photoUrlInput}
                onChange={(e) => setPhotoUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handlePhotoUrlImport()}
                disabled={photoUrlImporting} className="field h-12 flex-1 sm:h-11" />
              <Button onClick={() => void handlePhotoUrlImport()} disabled={photoUrlImporting || !photoUrlInput.trim()} className="h-12 sm:h-11">
                {photoUrlImporting ? "Importing…" : "Import"}
              </Button>
            </div>
          )}
          {photoError && <p className="text-sm text-accent-pink">{photoError}</p>}
        </div>
      )}

      {/* Edit form (admin only) */}
      {isAdmin && editing && (
        <VenueEditForm
          venue={venue}
          onCancel={() => setEditing(false)}
          onSaved={(newSlug) => {
            setEditing(false);
            if (newSlug !== slug) {
              navigate(`/venues/${newSlug}`, { replace: true });
            } else {
              qc.invalidateQueries({ queryKey: ["venues", slug] });
            }
          }}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Shows" value={stats.total} accent="pink" />
        <StatTile label="Artists seen" value={stats.uniqueArtists} />
      </div>

      <section className="space-y-3">
        <h2 className="h-section px-0.5">Shows here<span className="ml-2 text-sm font-body font-medium text-text-subtle">{concerts.length}</span></h2>
        {concerts.length === 0 ? (
          <EmptyState title="No shows logged." />
        ) : (
          <List>
            {concerts.map((c) => (
              <EventRow
                key={c.id}
                to={`/shows/${c.id}`}
                date={c.date}
                title={c.headlinerName ?? c.headlinerHint ?? c.eventSeries?.name ?? "Unknown show"}
                subtitle={c.headlinerName || c.headlinerHint ? c.eventSeries?.name : undefined}
                status={c.attendance?.status}
              />
            ))}
          </List>
        )}
      </section>

      {hasCoords && (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3 px-0.5">
            <h2 className="h-section">Location</h2>
            <a href={`https://www.openstreetmap.org/?mlat=${venue.lat}&mlon=${venue.lng}#map=16/${venue.lat}/${venue.lng}`}
              target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-text-muted hover:text-accent-lime">
              Open map ↗
            </a>
          </div>
          <VenueMap lat={venue.lat!} lng={venue.lng!} venueName={venue.name} />
        </section>
      )}

      <AliasesSection venueSlug={slug!} aliases={venue.aliases} isAdmin={isAdmin} />
    </div>
  );
}
