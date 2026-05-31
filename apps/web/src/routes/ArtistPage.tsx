/**
 * Artist detail — shows featuring this artist, plus inline info editor.
 */

import { useState, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ArtistPhoto, type ArtistSetlist, type SetlistfmResult } from "@/lib/api";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { useAuth } from "@/lib/auth-context";

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

  // Image URL import state
  const [showImageUrlInput, setShowImageUrlInput] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [imageUrlImporting, setImageUrlImporting] = useState(false);

  // Last.fm enrichment state
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [enrichSuccess, setEnrichSuccess] = useState<string | null>(null);

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

  const handleImageUrlImport = async () => {
    if (!imageUrlInput.trim()) return;
    setImageUrlImporting(true);
    setImageError(null);
    try {
      const { imageUrl: url } = await api.uploadArtistImageFromUrl(artist.slug, imageUrlInput.trim());
      setImageUrl(url);
      setImageUrlInput("");
      setShowImageUrlInput(false);
      qc.invalidateQueries({ queryKey: ["artists", artist.slug] });
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Failed to import image from URL.");
    } finally {
      setImageUrlImporting(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!window.confirm("Remove this image?")) return;
    try {
      await api.deleteArtistImage(artist.slug);
      setImageUrl(null);
      qc.invalidateQueries({ queryKey: ["artists", artist.slug] });
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  const handleEnrichFromLastfm = async () => {
    setEnriching(true);
    setEnrichError(null);
    setEnrichSuccess(null);
    try {
      const result = await api.enrichArtist(artist.slug, { overwrite: false });
      if (result.updated.length > 0) {
        // Update local state with fetched data
        if (result.fetched.bio) setBio(result.fetched.bio);
        if (result.fetched.genre) setGenre(result.fetched.genre);
        if (result.fetched.mbid) setMbid(result.fetched.mbid);
        if (result.fetched.imageUrl) setImageUrl(result.fetched.imageUrl);
        setEnrichSuccess(`Updated: ${result.updated.join(", ")}`);
        qc.invalidateQueries({ queryKey: ["artists", artist.slug] });
      } else {
        setEnrichSuccess("No new data found (fields already populated or not available on Last.fm)");
      }
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : "Failed to fetch from Last.fm");
    } finally {
      setEnriching(false);
    }
  };

  return (
    <div className="rounded-lg border border-accent-lime/30 bg-surface p-5 mb-6">
      <h2 className="font-display uppercase text-sm text-accent-lime tracking-widest mb-4">
        Edit Artist
      </h2>

      {/* Last.fm enrichment */}
      <div className="mb-5 p-3 rounded-lg border border-border bg-surface-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-mono text-text-muted">Auto-fill from Last.fm</p>
            <p className="text-xs text-text-subtle mt-0.5">Fetches bio, genre, image, and MusicBrainz ID</p>
          </div>
          <button
            type="button"
            onClick={() => void handleEnrichFromLastfm()}
            disabled={enriching}
            className="text-xs font-mono px-3 py-1.5 rounded border border-purple-700 bg-purple-950 text-purple-400 hover:bg-purple-900 transition-colors disabled:opacity-50"
          >
            {enriching ? "Fetching…" : "Fetch from Last.fm"}
          </button>
        </div>
        {enrichError && <p className="text-xs text-accent-pink font-mono mt-2">{enrichError}</p>}
        {enrichSuccess && <p className="text-xs text-accent-lime font-mono mt-2">{enrichSuccess}</p>}
      </div>

      {/* Image section */}
      <div className="mb-5">
        <label className="block text-xs text-text-muted font-mono mb-2">Image</label>
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-lg border border-border bg-surface-2 flex-shrink-0 overflow-hidden relative group">
            {imageUrl ? (
              <>
                <img src={imageUrl} alt={artist.name} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => void handleDeleteImage()}
                  className="absolute top-1 right-1 w-5 h-5 rounded bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  title="Remove image"
                >×</button>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-subtle">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                  <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
            {(imageMutation.isPending || imageUrlImporting) && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <span className="text-xs font-mono text-white animate-pulse">
                  {imageUrlImporting ? "…" : "…"}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex gap-1 flex-wrap">
              <label className="text-xs font-mono text-text-muted hover:text-accent-lime cursor-pointer transition-colors border border-border rounded px-2 py-1">
                {imageUrl ? "Replace" : "Upload"}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={imageMutation.isPending || imageUrlImporting}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) imageMutation.mutate(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => setShowImageUrlInput((v) => !v)}
                disabled={imageMutation.isPending || imageUrlImporting}
                className="text-xs font-mono text-text-muted hover:text-accent-lime transition-colors border border-border rounded px-2 py-1"
              >
                URL
              </button>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => void handleDeleteImage()}
                  disabled={imageMutation.isPending || imageUrlImporting}
                  className="text-xs font-mono text-text-muted hover:text-accent-pink transition-colors border border-border rounded px-2 py-1"
                >
                  Remove
                </button>
              )}
            </div>
            {showImageUrlInput && (
              <div className="flex gap-1">
                <input
                  type="url"
                  placeholder="Paste image URL…"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleImageUrlImport()}
                  disabled={imageUrlImporting}
                  className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
                />
                <button
                  type="button"
                  onClick={() => void handleImageUrlImport()}
                  disabled={imageUrlImporting || !imageUrlInput.trim()}
                  className="text-xs font-mono px-2 py-1 rounded bg-accent-lime text-bg font-bold disabled:opacity-50"
                >
                  {imageUrlImporting ? "…" : "Go"}
                </button>
              </div>
            )}
            {imageError && <p className="text-xs text-accent-pink font-mono">{imageError}</p>}
            <p className="text-xs text-text-subtle">JPEG, PNG or WebP · max 10 MB</p>
          </div>
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
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;
  const [editing, setEditing] = useState(false);
  const [photoLightbox, setPhotoLightbox] = useState<{ photos: ArtistPhoto[]; index: number } | null>(null);

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

  const setlistsQ = useQuery({
    queryKey: ["artists", slug, "setlists"],
    queryFn: () => api.getArtistSetlists(slug!),
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
        <Link to="/artists" className="underline text-text-muted">Back to artists</Link>
      </div>
    );
  }

  const { artist, concerts, stats } = q.data;

  return (
    <div className="max-w-2xl">
      <Link to="/artists" className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors">
        ← Artists
      </Link>

      {/* Artist photo */}
      {!editing && (
        <div className="mt-4 mb-5 rounded-lg border border-border bg-surface overflow-hidden">
          <div className="relative aspect-video bg-surface-2">
            {artist.imageUrl ? (
              <img src={artist.imageUrl} alt={artist.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="font-display uppercase text-4xl text-text-subtle opacity-20 tracking-widest">
                  {artist.name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="font-display uppercase text-3xl mb-1">{artist.name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
              {artist.genre && <span>{artist.genre}</span>}
              {artist.mbid && (
                <a
                  href={`https://musicbrainz.org/artist/${artist.mbid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors"
                >
                  MusicBrainz ↗
                </a>
              )}
            </div>
            {artist.bio && <p className="text-sm text-text-muted mt-2">{artist.bio}</p>}
          </div>
          {isAdmin && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="mt-1 flex-shrink-0 text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors border border-border rounded px-2.5 py-1"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Edit form (admin only) */}
      {isAdmin && editing && (
        <ArtistEditForm
          artist={artist}
          onCancel={() => setEditing(false)}
          onSaved={(newSlug) => {
            setEditing(false);
            if (newSlug !== slug) {
              // Name changed — navigate to new slug
              navigate(`/artists/${newSlug}`, { replace: true });
            }
          }}
        />
      )}

      {/* First/last seen + upcoming show */}
      {(stats.firstSeen || stats.upcomingShow) && (
        <p className="text-xs text-text-subtle font-mono mb-4">
          {stats.firstSeen && (
            <>
              First seen {fmtDate(stats.firstSeen)}
              {stats.lastSeen && stats.lastSeen !== stats.firstSeen && (
                <> · last seen {fmtDate(stats.lastSeen)}</>
              )}
            </>
          )}
          {stats.upcomingShow && (
            <>
              {stats.firstSeen && " · "}
              <span className="text-yellow-400">
                Playing{" "}
                {stats.upcomingShow.eventSeries?.name ?? stats.upcomingShow.venue?.name ?? "TBD"}{" "}
                on {fmtDate(stats.upcomingShow.date)}
              </span>
            </>
          )}
        </p>
      )}

      {/* Concert list */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {concerts.length === 0 ? (
          <p className="py-8 text-center text-xs text-text-subtle font-mono">No shows logged.</p>
        ) : (
          concerts.map((c) => {
            // Link to festival page for festival_day concerts, otherwise to concert page
            const href = c.type === "festival_day" && c.eventSeries?.slug
              ? `/festivals/${c.eventSeries.slug}#set-${slug}`
              : `/shows/${c.id}`;
            return (
              <Link
                key={c.id}
                to={href}
                className="flex items-start gap-4 py-3 px-4 border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors"
              >
                <time className="w-28 shrink-0 text-right font-mono text-sm text-text-muted tabular-nums">
                  {fmtDate(c.date)}
                </time>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-base truncate">
                    {c.type === "festival_day" && c.eventSeries ? (
                      <>
                        {c.eventSeries.name}
                        {c.venue?.city && <span className="text-text-subtle"> · {c.venue.city}</span>}
                      </>
                    ) : (
                      <>
                        {c.venue?.name ?? "Unknown venue"}
                        {c.venue?.city && <span className="text-text-subtle"> · {c.venue.city}</span>}
                      </>
                    )}
                  </div>
                  {c.type !== "festival_day" && c.eventSeries && (
                    <div className="text-xs text-text-subtle font-mono italic">{c.eventSeries.name}</div>
                  )}
                  {c.appearanceNotes && (
                    <div className="text-xs text-text-subtle italic mt-0.5">{c.appearanceNotes}</div>
                  )}
                </div>
                {c.attendance && (
                  <span className={`shrink-0 text-xs font-mono ${(STATUS_CHIP[c.attendance.status] ?? DEFAULT_CHIP).color}`}>
                    {(STATUS_CHIP[c.attendance.status] ?? DEFAULT_CHIP).label}
                  </span>
                )}
              </Link>
            );
          })
        )}
      </div>

      {/* Setlists section */}
      {(setlistsQ.data?.total ?? 0) > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-3">
            Setlists
            <span className="ml-2 text-text-subtle">({setlistsQ.data!.total})</span>
          </h2>

          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            {setlistsQ.data!.setlists.map((setlist) => (
              <div
                key={setlist.id}
                className="border-b border-border last:border-b-0 p-4"
              >
                <div className="flex items-baseline gap-2 mb-2">
                  <Link
                    to={`/shows/${setlist.concertId}`}
                    className="text-xs font-mono text-text-muted hover:text-accent-lime transition-colors"
                  >
                    {fmtDate(setlist.concertDate)}
                    {setlist.venue && (
                      <>
                        <span className="ml-1 text-text-subtle">· {setlist.venue.name}</span>
                        {setlist.venue.city && <span className="text-text-subtle">, {setlist.venue.city}</span>}
                      </>
                    )}
                  </Link>
                  {setlist.setlistfmId && (
                    <a
                      href={`https://www.setlist.fm/setlist/-/${setlist.setlistfmId}.html`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors ml-auto"
                    >
                      setlist.fm ↗
                    </a>
                  )}
                </div>

                {setlist.songs.length > 0 && (
                  <ol className="text-sm text-text-muted space-y-0.5">
                    {setlist.songs.map((song, i) => (
                      <li key={i} className="flex items-baseline gap-2">
                        <span className="text-xs text-text-subtle tabular-nums w-5 text-right">{song.position}.</span>
                        <span className={song.isCover ? "italic" : ""}>
                          {song.name}
                          {song.isCover && <span className="text-text-subtle ml-1">(cover)</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}

                {setlist.songs.length === 0 && (
                  <p className="text-xs text-text-subtle italic">No song data available</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
                    to={`/shows/${concertId}`}
                    className="text-xs font-mono text-text-muted hover:text-accent-lime transition-colors"
                  >
                    {fmtDate(group.date)}
                    {group.venueName && <span className="ml-1 text-text-subtle">· {group.venueName}</span>}
                    {group.venueCity && <span className="text-text-subtle">, {group.venueCity}</span>}
                  </Link>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {group.photos.map((p, pi) => (
                    <button
                      key={p.id}
                      onClick={() => setPhotoLightbox({ photos: group.photos, index: pi })}
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

      {/* Photo carousel lightbox */}
      {photoLightbox && (
        <PhotoCarousel
          items={photoLightbox.photos.map((p) => ({
            id: p.id,
            src: p.urls.medium ?? p.urls.original,
            srcLarge: p.urls.large,
            caption: (
              <Link
                to={`/shows/${p.concert.id}`}
                className="hover:text-accent-lime transition-colors"
              >
                {fmtDate(p.concert.date)}
                {p.concert.venue && ` · ${p.concert.venue.name}`}
              </Link>
            ),
          }))}
          initialIndex={photoLightbox.index}
          onClose={() => setPhotoLightbox(null)}
        />
      )}
    </div>
  );
}
