/**
 * Artist detail — shows featuring this artist, plus inline info editor.
 */

import { useState, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ArtistPhoto } from "@/lib/api";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", {
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
// Inline edit form
// ─────────────────────────────────────────────────────────────────────────────

interface ArtistEditFormProps {
  artist: {
    name: string;
    slug: string;
    genre: string | null;
    bio: string | null;
    mbid: string | null;
    imageUrl: string | null;
  };
  onCancel: () => void;
  onSaved: (newSlug: string) => void;
}

function ArtistEditForm({ artist, onCancel, onSaved }: ArtistEditFormProps) {
  const [name, setName]   = useState(artist.name);
  const [genre, setGenre] = useState(artist.genre ?? "");
  const [bio, setBio]     = useState(artist.bio ?? "");
  const [mbid, setMbid]   = useState(artist.mbid ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(artist.imageUrl);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const qc = useQueryClient();

  const patchMutation = useMutation({
    mutationFn: () =>
      api.patchArtist(artist.slug, {
        name:  name.trim()  || artist.name,
        genre: genre.trim() || null,
        bio:   bio.trim()   || null,
        mbid:  mbid.trim()  || null,
      }),
    onSuccess: ({ slug: newSlug }) => {
      qc.invalidateQueries({ queryKey: ["artists"] });
      onSaved(newSlug);
    },
    onError: (err) => {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    },
  });

  const imageMutation = useMutation({
    mutationFn: (file: File) => api.uploadArtistImage(artist.slug, file),
    onSuccess: ({ imageUrl: url }) => {
      setImageUrl(url);
      setImageError(null);
      qc.invalidateQueries({ queryKey: ["artists", artist.slug] });
    },
    onError: (err) => {
      setImageError(err instanceof Error ? err.message : "Upload failed.");
    },
  });

  return (
    <div className="rounded-lg border border-accent-lime/30 bg-surface p-5 mb-6">
      <h2 className="font-display uppercase text-sm text-accent-lime tracking-widest mb-4">
        Edit Artist
      </h2>

      {/* Image section */}
      <div className="flex items-start gap-4 mb-5">
        <div
          className="w-20 h-20 rounded-lg border border-border bg-surface-2 flex-shrink-0 overflow-hidden cursor-pointer hover:border-accent-lime transition-colors"
          onClick={() => fileRef.current?.click()}
          title="Click to upload image"
        >
          {imageUrl ? (
            <img src={imageUrl} alt={artist.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-subtle">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={imageMutation.isPending}
            className="text-xs font-mono text-text-muted hover:text-accent-lime transition-colors border border-border rounded px-3 py-1.5 disabled:opacity-50"
          >
            {imageMutation.isPending ? "Uploading…" : "Upload image"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) imageMutation.mutate(f);
              e.target.value = "";
            }}
          />
          {imageError && <p className="text-xs text-accent-pink font-mono mt-1">{imageError}</p>}
          <p className="text-xs text-text-subtle mt-1">JPEG, PNG or WebP · max 10 MB</p>
        </div>
      </div>

      {/* Fields */}
      <div className="grid gap-3">
        <div>
          <label className="block text-xs text-text-muted font-mono mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
          />
        </div>

        <div>
          <label className="block text-xs text-text-muted font-mono mb-1">Genre</label>
          <input
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="e.g. Post-punk"
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
          />
        </div>

        <div>
          <label className="block text-xs text-text-muted font-mono mb-1">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Short bio or notes…"
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-text-muted font-mono mb-1">
            MusicBrainz ID
            <span className="text-text-subtle ml-1">(UUID)</span>
          </label>
          <input
            value={mbid}
            onChange={(e) => setMbid(e.target.value)}
            placeholder="e.g. 65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab"
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime font-mono"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4">
        {saveError && <span className="text-xs text-accent-pink font-mono">{saveError}</span>}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={patchMutation.isPending}
            className="text-xs font-mono px-3 py-1.5 rounded border border-border text-text-muted hover:text-text-base transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { setSaveError(null); patchMutation.mutate(); }}
            disabled={patchMutation.isPending || !name.trim()}
            className="text-xs font-mono px-3 py-1.5 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {patchMutation.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function ArtistPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [photoLightbox, setPhotoLightbox] = useState<ArtistPhoto | null>(null);

  const q = useQuery({
    queryKey: ["artists", slug],
    queryFn: () => api.getArtist(slug!),
    enabled: !!slug,
  });

  const photosQ = useQuery({
    queryKey: ["artists", slug, "photos"],
    queryFn: () => api.getArtistPhotos(slug!),
    enabled: !!slug,
    staleTime: 30_000,
  });

  if (q.isLoading) {
    return <div className="py-16 text-center text-text-subtle font-mono text-sm animate-pulse">Loading…</div>;
  }
  if (q.isError || !q.data) {
    return (
      <div className="py-16 text-center font-mono text-sm text-accent-pink">
        Artist not found.{" "}
        <Link to="/app/artists" className="underline text-text-muted">Back to artists</Link>
      </div>
    );
  }

  const { artist, concerts, stats } = q.data;

  return (
    <div className="max-w-2xl">
      <Link to="/app/artists" className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors">
        ← Artists
      </Link>

      {/* Header */}
      <div className="mt-4 mb-6 flex items-start gap-4">
        {artist.imageUrl && !editing && (
          <img
            src={artist.imageUrl}
            alt={artist.name}
            className="w-20 h-20 rounded-lg object-cover border border-border flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3">
            <h1 className="font-display uppercase text-3xl leading-tight flex-1 min-w-0">{artist.name}</h1>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="mt-1 flex-shrink-0 text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors border border-border rounded px-2.5 py-1"
              >
                Edit
              </button>
            )}
          </div>
          {artist.genre && <p className="text-sm text-text-muted mt-1">{artist.genre}</p>}
          {artist.bio && <p className="text-sm text-text-muted mt-2">{artist.bio}</p>}
          {artist.mbid && (
            <a
              href={`https://musicbrainz.org/artist/${artist.mbid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors mt-1 inline-block"
            >
              MusicBrainz ↗
            </a>
          )}
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <ArtistEditForm
          artist={artist}
          onCancel={() => setEditing(false)}
          onSaved={(newSlug) => {
            setEditing(false);
            if (newSlug !== slug) {
              // Name changed — navigate to new slug
              navigate(`/app/artists/${newSlug}`, { replace: true });
            }
          }}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Total shows", value: stats.total },
          { label: "Attended",    value: stats.attended },
          { label: "Upcoming",    value: stats.upcoming },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-4 text-center">
            <div className="font-mono text-2xl text-text-base">{value}</div>
            <div className="text-xs text-text-muted mt-1">{label}</div>
          </div>
        ))}
      </div>

      {stats.firstSeen && (
        <p className="text-xs text-text-subtle font-mono mb-4">
          First seen {fmtDate(stats.firstSeen)}
          {stats.lastSeen && stats.lastSeen !== stats.firstSeen
            ? ` · last seen ${fmtDate(stats.lastSeen)}`
            : ""}
        </p>
      )}

      {/* Concert list */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {concerts.length === 0 ? (
          <p className="py-8 text-center text-xs text-text-subtle font-mono">No shows logged.</p>
        ) : (
          concerts.map((c) => (
            <Link
              key={c.id}
              to={`/app/concerts/${c.id}`}
              className="flex items-start gap-4 py-3 px-4 border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors"
            >
              <time className="w-28 shrink-0 text-right font-mono text-sm text-text-muted tabular-nums">
                {fmtDate(c.date)}
              </time>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-base truncate">
                  {c.venue?.name ?? "Unknown venue"}
                  {c.venue?.city && <span className="text-text-subtle"> · {c.venue.city}</span>}
                </div>
                {c.eventSeries && (
                  <div className="text-xs text-text-subtle font-mono italic">{c.eventSeries.name}</div>
                )}
                {c.appearanceNotes && (
                  <div className="text-xs text-text-subtle italic mt-0.5">{c.appearanceNotes}</div>
                )}
              </div>
              <span className={`shrink-0 text-xs font-mono ${(STATUS_CHIP[c.attendance.status] ?? DEFAULT_CHIP).color}`}>
                {(STATUS_CHIP[c.attendance.status] ?? DEFAULT_CHIP).label}
              </span>
            </Link>
          ))
        )}
      </div>

      {/* Photos section */}
      {(photosQ.data?.total ?? 0) > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-3">
            Photos
            <span className="ml-2 text-text-subtle">({photosQ.data!.total})</span>
          </h2>

          {/* Group by concert */}
          {(() => {
            const photos = photosQ.data!.photos;
            // Build ordered concert groups
            const concertMap = new Map<string, { date: string; venueName: string | null; venueCity: string | null; photos: ArtistPhoto[] }>();
            for (const photo of photos) {
              const existing = concertMap.get(photo.concert.id);
              if (existing) {
                existing.photos.push(photo);
              } else {
                concertMap.set(photo.concert.id, {
                  date: photo.concert.date,
                  venueName: photo.concert.venue?.name ?? null,
                  venueCity: photo.concert.venue?.city ?? null,
                  photos: [photo],
                });
              }
            }
            return Array.from(concertMap.entries()).map(([concertId, group]) => (
              <div key={concertId} className="mb-5">
                <div className="flex items-baseline gap-2 mb-2">
                  <Link
                    to={`/app/concerts/${concertId}`}
                    className="text-xs font-mono text-text-muted hover:text-accent-lime transition-colors"
                  >
                    {fmtDate(group.date)}
                    {group.venueName && <span className="ml-1 text-text-subtle">· {group.venueName}</span>}
                    {group.venueCity && <span className="text-text-subtle">, {group.venueCity}</span>}
                  </Link>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {group.photos.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPhotoLightbox(p)}
                      className="aspect-square rounded overflow-hidden bg-surface border border-border hover:border-accent-lime transition-colors"
                    >
                      <img
                        src={p.urls.thumb ?? p.urls.medium ?? p.urls.original}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* Photo lightbox */}
      {photoLightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPhotoLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-2xl font-mono"
            onClick={() => setPhotoLightbox(null)}
          >×</button>
          <img
            src={photoLightbox.urls.medium ?? photoLightbox.urls.original}
            alt=""
            className="max-h-[90vh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/70 text-xs font-mono text-center">
            <Link
              to={`/app/concerts/${photoLightbox.concert.id}`}
              className="hover:text-accent-lime transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {fmtDate(photoLightbox.concert.date)}
              {photoLightbox.concert.venue && ` · ${photoLightbox.concert.venue.name}`}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
