/**
 * Artist detail — shows featuring this artist, plus inline info editor.
 */

import { useState, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ArtistPhoto, type ArtistSetlist, type SetlistfmResult } from "@/lib/api";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { useAuth } from "@/lib/auth-context";
import { fmtDate, plural } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState, EventRow, Hero, List, Loading, Section } from "@/components/ui/kit";

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
      <h2 className="font-display text-sm text-accent-lime tracking-widest mb-4">
        Edit Artist
      </h2>

      {/* Last.fm enrichment */}
      <div className="mb-5 p-3 rounded-lg border border-border bg-surface-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-muted">Auto-fill from Last.fm</p>
            <p className="text-sm text-text-subtle mt-0.5">Fetches bio, genre, image, and MusicBrainz ID</p>
          </div>
          <button
            type="button"
            onClick={() => void handleEnrichFromLastfm()}
            disabled={enriching}
            className="btn btn-sm btn-secondary"
          >
            {enriching ? "Fetching…" : "Fetch from Last.fm"}
          </button>
        </div>
        {enrichError && <p className="text-sm text-accent-pink mt-2">{enrichError}</p>}
        {enrichSuccess && <p className="text-sm text-accent-lime mt-2">{enrichSuccess}</p>}
      </div>

      {/* Image section */}
      <div className="mb-5">
        <label className="block mb-2 label">Image</label>
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
                <span className="text-xs text-white animate-pulse">
                  {imageUrlImporting ? "…" : "…"}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex gap-1 flex-wrap">
              <label className="btn btn-sm btn-secondary">
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
                className="btn btn-sm btn-secondary"
              >
                URL
              </button>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => void handleDeleteImage()}
                  disabled={imageMutation.isPending || imageUrlImporting}
                  className="btn btn-sm btn-danger"
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
                  className="flex-1 field h-11"
                />
                <button
                  type="button"
                  onClick={() => void handleImageUrlImport()}
                  disabled={imageUrlImporting || !imageUrlInput.trim()}
                  className="btn btn-sm btn-primary"
                >
                  {imageUrlImporting ? "…" : "Go"}
                </button>
              </div>
            )}
            {imageError && <p className="text-sm text-accent-pink">{imageError}</p>}
            <p className="text-sm text-text-subtle">JPEG, PNG or WebP · max 10 MB</p>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="grid gap-3">
        <div>
          <label className="block mb-1 label">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full field h-11"
          />
        </div>

        <div>
          <label className="block mb-1 label">Genre</label>
          <input
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="e.g. Post-punk"
            className="w-full field h-11"
          />
        </div>

        <div>
          <label className="block mb-1 label">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Short bio or notes…"
            className="w-full resize-none field py-2.5"
          />
        </div>

        <div>
          <label className="block mb-1 label">
            MusicBrainz ID
            <span className="text-text-subtle ml-1">(UUID)</span>
          </label>
          <input
            value={mbid}
            onChange={(e) => setMbid(e.target.value)}
            placeholder="e.g. 65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab"
            className="w-full field h-11"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4">
        {saveError && <span className="text-sm text-accent-pink">{saveError}</span>}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={patchMutation.isPending}
            className="btn btn-sm btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { setSaveError(null); patchMutation.mutate(); }}
            disabled={patchMutation.isPending || !name.trim()}
            className="btn btn-sm btn-primary"
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
  const [bioOpen, setBioOpen] = useState(false);
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

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) {
    return (
      <EmptyState tone="error" title="Artist not found."
        action={<Link to="/artists"><Button variant="secondary">Back to artists</Button></Link>} />
    );
  }

  const { artist, concerts, stats } = q.data;

  // Photos grouped by show, in the order the API returns them.
  const photoGroups = (() => {
    const map = new Map<string, { date: string; venueName: string | null; venueCity: string | null; photos: ArtistPhoto[] }>();
    for (const photo of photosQ.data?.photos ?? []) {
      const existing = map.get(photo.concert.id);
      if (existing) existing.photos.push(photo);
      else map.set(photo.concert.id, {
        date: photo.concert.date,
        venueName: photo.concert.venue?.name ?? null,
        venueCity: photo.concert.venue?.city ?? null,
        photos: [photo],
      });
    }
    return Array.from(map.entries());
  })();

  return (
    <div className="space-y-6">
      {!editing && (
        <Hero
          back={{ to: "/artists", label: "Artists" }}
          imageUrl={artist.imageUrl}
          square
          eyebrow={artist.genre ? artist.genre.split(",").slice(0, 2).join(" · ") : "Artist"}
          title={artist.name}
          actions={
            <>
              {isAdmin && <Button variant="secondary" className="rounded-full" onClick={() => setEditing(true)}>Edit artist</Button>}
              {artist.mbid && (
                <a href={`https://musicbrainz.org/artist/${artist.mbid}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" className="rounded-full">MusicBrainz ↗</Button>
                </a>
              )}
            </>
          }
        >
          <p className="font-semibold text-text-base">{plural(concerts.length, "show")} logged</p>
          {stats.firstSeen && (
            <p>
              First seen {fmtDate(stats.firstSeen)}
              {stats.lastSeen && stats.lastSeen !== stats.firstSeen && <> · last {fmtDate(stats.lastSeen)}</>}
            </p>
          )}
          {stats.upcomingShow && (
            <p className="text-yellow-400">
              Next: {stats.upcomingShow.eventSeries?.name ?? stats.upcomingShow.venue?.name ?? "TBD"} · {fmtDate(stats.upcomingShow.date)}
            </p>
          )}
        </Hero>
      )}

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

      <section className="space-y-3">
        <h2 className="h-section px-0.5">Shows<span className="ml-2 text-sm font-body font-medium text-text-subtle">{concerts.length}</span></h2>
        {concerts.length === 0 ? (
          <EmptyState title="No shows logged." />
        ) : (
          <List>
            {concerts.map((c) => {
              // Link to festival page for festival_day concerts, otherwise to concert page
              const isFestival = c.type === "festival_day" && !!c.eventSeries;
              const href = isFestival && c.eventSeries?.slug ? `/festivals/${c.eventSeries.slug}#set-${slug}` : `/shows/${c.id}`;
              return (
                <EventRow
                  key={c.id}
                  to={href}
                  date={c.date}
                  title={isFestival ? c.eventSeries!.name : (c.venue?.name ?? "Unknown venue")}
                  subtitle={[isFestival ? c.venue?.name : null, c.venue?.city].filter(Boolean).join(" · ") || undefined}
                  meta={[!isFestival ? c.eventSeries?.name : null, c.appearanceNotes].filter(Boolean).join(" · ") || undefined}
                  status={c.attendance?.status}
                />
              );
            })}
          </List>
        )}
      </section>

      {/* Setlists */}
      {(setlistsQ.data?.total ?? 0) > 0 && (
        <Section title="Setlists" count={setlistsQ.data!.total} flush>
          <div className="divide-y divide-border">
            {setlistsQ.data!.setlists.map((setlist) => (
              <div key={setlist.id} className="p-4 sm:p-5">
                <div className="mb-3 flex items-baseline gap-2">
                  <Link to={`/shows/${setlist.concertId}`} className="min-w-0 truncate text-[15px] font-semibold hover:text-accent-lime">
                    {fmtDate(setlist.concertDate)}
                    {setlist.venue && <span className="font-normal text-text-muted"> · {setlist.venue.name}{setlist.venue.city && `, ${setlist.venue.city}`}</span>}
                  </Link>
                  {setlist.setlistfmId && (
                    <a href={`https://www.setlist.fm/setlist/-/${setlist.setlistfmId}.html`} target="_blank" rel="noopener noreferrer"
                      className="ml-auto shrink-0 text-sm text-text-subtle hover:text-accent-lime">
                      setlist.fm ↗
                    </a>
                  )}
                </div>
                {setlist.songs.length > 0 ? (
                  <ol className="space-y-1 text-[15px] text-text-muted">
                    {setlist.songs.map((song, i) => (
                      <li key={i} className="flex items-baseline gap-3">
                        <span className="w-6 text-right text-sm tabular-nums text-text-subtle">{song.position}</span>
                        <span className={song.isCover ? "italic" : ""}>
                          {song.name}
                          {song.isCover && <span className="ml-1 text-text-subtle">(cover)</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm italic text-text-subtle">No song data available</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Photos, grouped by show */}
      {photoGroups.length > 0 && (
        <Section title="Photos" count={photosQ.data!.total}>
          <div className="space-y-5">
            {photoGroups.map(([concertId, group]) => (
              <div key={concertId}>
                <Link to={`/shows/${concertId}`} className="mb-2 block text-sm font-semibold text-text-muted hover:text-accent-lime">
                  {fmtDate(group.date)}
                  {group.venueName && <span className="font-normal text-text-subtle"> · {group.venueName}{group.venueCity && `, ${group.venueCity}`}</span>}
                </Link>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {group.photos.map((p, pi) => (
                    <button
                      key={p.id}
                      onClick={() => setPhotoLightbox({ photos: group.photos, index: pi })}
                      className="aspect-square overflow-hidden rounded-lg border border-border bg-surface-2 transition-colors hover:border-accent-lime"
                    >
                      <img src={p.urls.thumb ?? p.urls.medium ?? p.urls.original} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {artist.bio && (
        <Section title="About">
          <p className={`text-[15px] leading-relaxed text-text-muted ${bioOpen ? "" : "line-clamp-4"}`}>{artist.bio}</p>
          {artist.bio.length > 280 && (
            <button onClick={() => setBioOpen((v) => !v)} className="mt-2 text-sm font-semibold text-accent-lime">
              {bioOpen ? "Show less" : "Read more"}
            </button>
          )}
        </Section>
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
