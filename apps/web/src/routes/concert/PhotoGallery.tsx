/** Show page: the photo and video gallery, with per-artist upload zones. */
import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, type ConcertArtist } from "@/lib/api";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import type { CarouselItem } from "@/components/PhotoCarousel";
import { initials } from "@/components/ui/kit";
import { enqueueUploads, isActive, useUploads } from "@/lib/uploads";

// ─────────────────────────────────────────────────────────────────────────────
// Photo gallery
// ─────────────────────────────────────────────────────────────────────────────

interface Photo {
  id: string;
  kind: string;
  width: number | null;
  height: number | null;
  processing: boolean;
  setOrder: number | null;
  contentHash: string | null;
  urls: { original: string; thumb: string | null; medium: string | null; large: string | null; video: string | null };
}

/** SHA-256 hex of a File using the Web Crypto API (no library needed). */

export function PhotoGallery({
  concertId,
  concertDate,
  concertArtists,
  label,
  isAdmin = false,
}: {
  concertId: string;
  concertDate: string;
  concertArtists: ConcertArtist[];
  /** Show name, for the background upload list. */
  label: string;
  isAdmin?: boolean;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  // Uploads run in the background queue (lib/uploads.ts); this show's share of it:
  const { jobs: uploadJobs } = useUploads();
  const pendingHere = uploadJobs.filter((j) => j.concertId === concertId && isActive(j)).length;
  const uploading = pendingHere > 0;
  const [uploadError, setUploadError] = useState<string | null>(null);
  // lightboxIndex: index into `photos` of the slide to open; null = closed
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Delete: track which photo ID is awaiting confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Reorder mode
  const [reordering, setReordering] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  // Drag-and-drop
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0); // track nested dragenter/dragleave events

  // Tagging mode
  const [tagging, setTagging] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  // photoTags: photoId → array of artistIds currently tagged
  const [photoTags, setPhotoTags] = useState<Map<string, string[]>>(new Map());
  // Which artist the user is currently tagging
  const [tagArtistId, setTagArtistId] = useState<string>("");
  // Photos selected for this tagging pass
  const [selectedForTag, setSelectedForTag] = useState<Set<string>>(new Set());
  const [savingTags, setSavingTags] = useState(false);
  const [tagSaveMsg, setTagSaveMsg] = useState<string | null>(null);

  // Disable photo upload until the event date has passed
  const today = new Date().toISOString().slice(0, 10);
  const isFutureEvent = concertDate > today;

  const photosQuery = useQuery({
    queryKey: ["concerts", concertId, "photos"],
    queryFn: () => api.listPhotos(concertId),
    staleTime: 30_000,
    // Suppress the processing-state poll while an upload is in progress —
    // it stacks against the rate limit alongside the upload requests.
    // When idle, poll every 8 s (down from 3 s) to reduce request volume.
    refetchInterval: (q) => {
      if (uploading) return false;
      return q.state.data?.photos.some((p) => p.processing) ? 8000 : false;
    },
  });

  // Filter out flyers — they're shown in their own section
  const photos: Photo[] = (photosQuery.data?.photos ?? []).filter((p) => p.kind !== "flyer");

  // In reorder mode, display photos in localOrder sequence
  const displayPhotos = reordering
    ? localOrder.map((id) => photos.find((p) => p.id === id)).filter(Boolean) as Photo[]
    : photos;

  const enterReorder = () => {
    setLocalOrder(photos.map((p) => p.id));
    setConfirmDeleteId(null);
    setReordering(true);
  };

  const cancelReorder = () => {
    setReordering(false);
    setLocalOrder([]);
  };

  const movePhoto = (id: string, dir: -1 | 1) => {
    setLocalOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx]!, next[idx]!];
      return next;
    });
  };

  const saveOrder = async (): Promise<void> => {
    setSavingOrder(true);
    try {
      await api.putPhotoOrder(concertId, localOrder);
      await qc.invalidateQueries({ queryKey: ["concerts", concertId, "photos"] });
      setReordering(false);
      setLocalOrder([]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to save order.");
    } finally {
      setSavingOrder(false);
    }
  };

  // ── Drag-and-drop handlers ───────────────────────────────────────────────────

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent): Promise<void> => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (isFutureEvent) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) await handleUpload(files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFutureEvent]);

  // ── Tagging helpers ──────────────────────────────────────────────────────────

  const enterTagging = async (): Promise<void> => {
    setLoadingTags(true);
    setTagError(null);
    setTagSaveMsg(null);
    try {
      // Fetch current artist tags for all non-flyer photos in parallel
      const results = await Promise.all(
        photos.map(async (p) => {
          const res = await api.getPhotoArtists(p.id);
          return [p.id, res.artists.map((a) => a.id)] as const;
        }),
      );
      setPhotoTags(new Map(results));
      // Default to first concert artist if available
      const firstArtist = concertArtists[0];
      setTagArtistId(firstArtist?.id ?? "");
      setSelectedForTag(new Set());
      setTagging(true);
    } catch {
      setTagError("Failed to load existing tags.");
    } finally {
      setLoadingTags(false);
    }
  };

  const exitTagging = (): void => {
    setTagging(false);
    setSelectedForTag(new Set());
    setTagArtistId("");
    setTagError(null);
    setTagSaveMsg(null);
  };

  const togglePhotoForTag = (photoId: string): void => {
    setSelectedForTag((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  const handleAssignTags = async (): Promise<void> => {
    if (!tagArtistId || selectedForTag.size === 0) return;
    setSavingTags(true);
    setTagError(null);
    setTagSaveMsg(null);
    try {
      // For each selected photo: union current tags with the new artist
      const updates = Array.from(selectedForTag).map(async (photoId) => {
        const current = photoTags.get(photoId) ?? [];
        const newIds = Array.from(new Set([...current, tagArtistId]));
        await api.tagPhotoArtists(photoId, newIds);
        return [photoId, newIds] as const;
      });
      const results = await Promise.all(updates);
      // Update local map
      setPhotoTags((prev) => {
        const next = new Map(prev);
        for (const [id, ids] of results) next.set(id, ids);
        return next;
      });
      const artistName = concertArtists.find((a) => a.id === tagArtistId)?.name ?? "Artist";
      setTagSaveMsg(`✓ Tagged ${artistName} in ${selectedForTag.size} photo${selectedForTag.size !== 1 ? "s" : ""}`);
      setSelectedForTag(new Set());
    } catch {
      setTagError("Failed to save tags — try again.");
    } finally {
      setSavingTags(false);
    }
  };

  const handleRemoveTagFromPhoto = async (photoId: string, artistId: string): Promise<void> => {
    const current = photoTags.get(photoId) ?? [];
    const newIds = current.filter((id) => id !== artistId);
    try {
      await api.tagPhotoArtists(photoId, newIds);
      setPhotoTags((prev) => {
        const next = new Map(prev);
        next.set(photoId, newIds);
        return next;
      });
    } catch {
      setTagError("Failed to remove tag.");
    }
  };

  const handleToggleTicket = async (photoId: string, kind: "photo" | "ticket"): Promise<void> => {
    try {
      await api.setPhotoKind(photoId, kind);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["concerts", concertId, "photos"] }),
        qc.invalidateQueries({ queryKey: ["tickets"] }),
      ]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Couldn't update the photo.");
    }
  };

  const handleDelete = async (photoId: string): Promise<void> => {
    setDeleting(true);
    try {
      await api.deletePhoto(photoId);
      await qc.invalidateQueries({ queryKey: ["concerts", concertId, "photos"] });
      setConfirmDeleteId(null);
      if (reordering) setLocalOrder((prev) => prev.filter((id) => id !== photoId));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  /** Hand the files to the background queue — uploading carries on while you use the app. */
  const handleUpload = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    enqueueUploads(concertId, label, Array.from(files));
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={(e) => void handleDrop(e)}
    >
      {/* Drag-over overlay */}
      {isDragging && !isFutureEvent && (
        <div className="absolute inset-0 z-20 rounded-lg border-2 border-dashed border-accent-lime bg-accent-lime/5 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="mx-auto text-accent-lime mb-2">
              <path d="M12 2v13m0-13L8 6m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span className="text-sm text-accent-lime font-bold">Drop to upload</span>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="h-section">Media</h2>
        {isAdmin && (
          <div className="flex items-center gap-2 ml-auto">
            {!reordering && !tagging ? (
              <>
                {photos.length > 0 && concertArtists.length > 0 && (
                  <button
                    onClick={() => void enterTagging()}
                    disabled={loadingTags}
                    className="btn btn-sm btn-secondary"
                  >
                    {loadingTags ? "Loading…" : "⊕ Tag artists"}
                  </button>
                )}
                {photos.length > 1 && (
                  <button
                    onClick={enterReorder}
                    className="btn btn-sm btn-secondary"
                  >
                    ⇄ Reorder
                  </button>
                )}
                {isFutureEvent ? (
                  <span
                    className="text-sm text-text-subtle border border-dashed border-border rounded px-3 py-1.5 cursor-not-allowed"
                    title="Media can be added on or after the event date"
                  >
                    + Add media
                  </span>
                ) : (
                  <label className="cursor-pointer rounded border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-accent-lime hover:text-accent-lime">
                    {uploading ? `+ Add media · ${pendingHere} uploading` : "+ Add media"}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
                      multiple
                      className="sr-only"
                      onChange={(e) => void handleUpload(e.target.files)}
                    />
                  </label>
                )}
              </>
            ) : reordering ? (
              <>
                <button
                  onClick={cancelReorder}
                  className="btn btn-sm btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void saveOrder()}
                  disabled={savingOrder}
                  className="btn btn-sm btn-primary"
                >
                  {savingOrder ? "Saving…" : "Save order"}
                </button>
              </>
            ) : (
              /* tagging mode header controls */
              <button
                onClick={exitTagging}
                className="btn btn-sm btn-secondary"
              >
                Done tagging
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tagging mode: artist selector + assign controls (admin only) */}
      {isAdmin && tagging && (
        <div className="mb-4 rounded-lg border border-accent-lime/30 bg-surface-2 p-3 space-y-3">
          <p className="eyebrow">Tag artists in photos</p>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-text-subtle block mb-1">Tagging artist</label>
              <select
                value={tagArtistId}
                onChange={(e) => {
                  setTagArtistId(e.target.value);
                  setSelectedForTag(new Set());
                  setTagSaveMsg(null);
                }}
                className="w-full field h-11"
              >
                {concertArtists.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="self-end">
              <button
                onClick={() => void handleAssignTags()}
                disabled={savingTags || selectedForTag.size === 0 || !tagArtistId}
                className="btn btn-sm btn-primary"
              >
                {savingTags
                  ? "Saving…"
                  : selectedForTag.size === 0
                    ? "Select photos below"
                    : `Tag ${selectedForTag.size} photo${selectedForTag.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
          {tagSaveMsg && <p className="text-sm text-accent-lime">{tagSaveMsg}</p>}
          {tagError && <p className="text-sm text-accent-pink">{tagError}</p>}
          <p className="text-sm text-text-subtle">
            Tap photos to select • Click "Tag N photos" to assign • Switch artist to tag another pass
          </p>
        </div>
      )}

      {/* Future event notice */}
      {isFutureEvent && (
        <p className="text-sm text-text-subtle mb-3 italic">
          Media upload opens on the event date ({concertDate}).
        </p>
      )}

      {uploadError && (
        <p className="text-sm text-accent-pink mb-3">{uploadError}</p>
      )}

      {displayPhotos.length === 0 ? (
        <p className="text-sm text-text-subtle py-4 text-center border border-dashed border-border rounded-lg">
          No media yet{isFutureEvent ? " — add it after the show." : " — drop a photo or video to get started."}
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {displayPhotos.map((p, idx) => {
            const isSelected = tagging && selectedForTag.has(p.id);
            const currentPhotoTags = tagging ? (photoTags.get(p.id) ?? []) : [];
            return (
              <div key={p.id} className="relative group aspect-square">
                {/* Thumbnail */}
                <button
                  onClick={() => {
                    if (tagging) { togglePhotoForTag(p.id); return; }
                    if (reordering || confirmDeleteId === p.id) return;
                    setLightboxIndex(photos.findIndex((ph) => ph.id === p.id));
                  }}
                  className={clsx(
                    "w-full h-full rounded overflow-hidden bg-surface border transition-colors",
                    confirmDeleteId === p.id
                      ? "border-accent-pink"
                      : tagging
                        ? isSelected
                          ? "border-accent-lime ring-2 ring-accent-lime/50 cursor-pointer"
                          : "border-border hover:border-accent-lime/50 cursor-pointer"
                        : reordering
                          ? "border-border cursor-default"
                          : "border-border hover:border-accent-lime cursor-pointer",
                  )}
                >
                  {p.processing ? (
                    <div className="w-full h-full flex items-center justify-center text-text-subtle text-sm animate-pulse">…</div>
                  ) : p.kind === "video" ? (
                    <>
                      {p.urls.thumb ? (
                        <img src={p.urls.thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-text-subtle text-2xl">▶</div>
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/60 rounded text-white text-xs px-1">▶</div>
                    </>
                  ) : (
                    <img
                      src={p.urls.thumb ?? p.urls.medium ?? p.urls.original}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                </button>

                {/* Tagging: checkmark overlay when selected */}
                {tagging && isSelected && (
                  <div className="absolute inset-0 rounded bg-accent-lime/20 pointer-events-none flex items-center justify-center">
                    <div className="w-7 h-7 rounded-full bg-accent-lime flex items-center justify-center shadow-lg">
                      <span className="text-on-accent text-base leading-none font-bold">✓</span>
                    </div>
                  </div>
                )}

                {/* Tagging: artist tag badges at bottom */}
                {tagging && currentPhotoTags.length > 0 && (
                  <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-0.5 p-1 bg-black/60 rounded-b pointer-events-auto">
                    {currentPhotoTags.map((artistId) => {
                      const artist = concertArtists.find((a) => a.id === artistId);
                      if (!artist) return null;
                      return (
                        <button
                          key={artistId}
                          onClick={(e) => { e.stopPropagation(); void handleRemoveTagFromPhoto(p.id, artistId); }}
                          title={`Remove ${artist.name} tag`}
                          className="text-xs bg-accent-lime/80 text-on-accent rounded px-0.5 leading-4 hover:bg-accent-pink/80 hover:text-white transition-colors"
                        >
                          {initials(artist.name)}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Confirm-delete overlay */}
                {!tagging && confirmDeleteId === p.id && (
                  <div className="absolute inset-0 rounded bg-black/75 flex flex-col items-center justify-center gap-1.5 z-10">
                    <span className="text-xs text-white">Delete?</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => void handleDelete(p.id)}
                        disabled={deleting}
                        className="text-xs px-2 py-0.5 rounded bg-accent-pink text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {deleting ? "…" : "Yes"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="btn btn-sm btn-secondary"
                      >
                        No
                      </button>
                    </div>
                  </div>
                )}

                {/* Ticket stub: a badge for everyone; admins tap it to toggle */}
                {p.kind !== "video" && !p.processing && !reordering && !tagging && (isAdmin || p.kind === "ticket") && (
                  <button
                    onClick={isAdmin ? () => void handleToggleTicket(p.id, p.kind === "ticket" ? "photo" : "ticket") : undefined}
                    disabled={!isAdmin}
                    className={clsx(
                      "absolute bottom-1 left-1 z-10 flex h-7 items-center rounded-control px-1.5 text-sm transition-opacity",
                      p.kind === "ticket"
                        ? "bg-accent-lime text-on-accent opacity-100"
                        : "bg-black/60 text-white opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-70",
                    )}
                    title={p.kind === "ticket" ? (isAdmin ? "Ticket stub — tap to make it a photo" : "Ticket stub") : "Mark as ticket stub"}
                    aria-label={p.kind === "ticket" ? "Ticket stub" : "Mark as ticket stub"}
                  >
                    🎟
                  </button>
                )}

                {/* Hover trash icon (normal mode, admin only) */}
                {isAdmin && !reordering && !tagging && confirmDeleteId !== p.id && !p.processing && (
                  <button
                    onClick={() => setConfirmDeleteId(p.id)}
                    className="absolute top-1 right-1 w-6 h-6 rounded bg-black/60 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-70 transition-opacity hover:bg-accent-pink z-10"
                    title="Delete photo"
                  >
                    ✕
                  </button>
                )}

                {/* Reorder controls */}
                {reordering && (
                  <div className="absolute inset-x-0 bottom-0 flex justify-between items-center px-1 py-0.5 bg-black/60 rounded-b">
                    <button
                      onClick={() => movePhoto(p.id, -1)}
                      disabled={idx === 0}
                      className="w-5 h-5 link-action"
                      title="Move left"
                    >←</button>
                    <span className="text-white text-xs opacity-50">{idx + 1}</span>
                    <button
                      onClick={() => movePhoto(p.id, 1)}
                      disabled={idx === displayPhotos.length - 1}
                      className="w-5 h-5 link-action"
                      title="Move right"
                    >→</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Per-artist upload zones — only when concert has artists and event has passed */}
      {!isFutureEvent && concertArtists.length > 0 && !tagging && !reordering && (
        <div className="mt-4 pt-3 border-t border-border">
          <p className="mb-2 eyebrow">
            Upload by artist <span className="normal-case opacity-60">— media auto-tagged on upload</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {concertArtists.map((artist) => (
              <ArtistUploadZone
                key={artist.id}
                artist={artist}
                concertId={concertId}
                concertDate={concertDate}
                label={label}
              />
            ))}
          </div>
        </div>
      )}

      {/* Photo carousel lightbox */}
      {lightboxIndex !== null && (
        <PhotoCarousel
          items={photos.map((p): CarouselItem => ({
            id: p.id,
            src: p.urls.medium ?? p.urls.original,
            srcLarge: p.urls.large,
            poster: p.urls.thumb,
            isVideo: p.kind === "video",
          }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-artist upload zone
// ─────────────────────────────────────────────────────────────────────────────

function ArtistUploadZone({
  artist,
  concertId,
  concertDate,
  label,
}: {
  artist: ConcertArtist;
  concertId: string;
  concertDate: string;
  label: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  // This artist's files in the background queue.
  const { jobs } = useUploads();
  const mine = jobs.filter((j) => j.concertId === concertId && j.artistId === artist.id);
  const pending = mine.filter(isActive).length;
  const added = mine.filter((j) => j.status === "done").length;

  const today = new Date().toISOString().slice(0, 10);
  const isFutureEvent = concertDate > today;

  /** Queue the files, tagged with this artist once uploaded. */
  const handleUpload = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0 || isFutureEvent) return;
    enqueueUploads(concertId, label, Array.from(files), { artistId: artist.id });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div
      className={clsx(
        "relative rounded-lg border-2 border-dashed p-3 text-center transition-colors cursor-pointer",
        isDragging
          ? "border-accent-lime bg-accent-lime/5"
          : "border-border hover:border-accent-lime/50",
        isFutureEvent && "opacity-40 cursor-not-allowed",
      )}
      onDragEnter={(e) => { e.preventDefault(); dragCounterRef.current++; if (dragCounterRef.current === 1) setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); dragCounterRef.current--; if (dragCounterRef.current === 0) setIsDragging(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        e.preventDefault();
        dragCounterRef.current = 0;
        setIsDragging(false);
        await handleUpload(e.dataTransfer.files);
      }}
      onClick={() => !isFutureEvent && fileRef.current?.click()}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
        multiple
        className="sr-only"
        disabled={isFutureEvent}
        onChange={(e) => void handleUpload(e.target.files)}
      />
      <p className="text-sm font-medium text-text-muted truncate leading-tight mb-0.5">{artist.name}</p>
      {pending > 0 ? (
        <p className="text-sm text-accent-lime animate-pulse">{pending} uploading…</p>
      ) : added > 0 ? (
        <p className="text-sm text-accent-lime">+{added} tagged</p>
      ) : (
        <p className="text-sm text-text-subtle">Drop or click</p>
      )}
    </div>
  );
}
