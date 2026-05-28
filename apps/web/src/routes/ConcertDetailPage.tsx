/**
 * Concert detail — full view of one show with flyer, lineup, attendance editor, and photo gallery.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, type ConcertDetail, type ArtistListItem, type VenueListItem, type ConcertArtist } from "@/lib/api";
import type { AttendanceStatus } from "@tagg/shared";
import { VenueMap } from "@/components/VenueMap";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import type { CarouselItem } from "@/components/PhotoCarousel";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS   = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]} ${MONTHS[date.getUTCMonth()]} ${d}, ${y}`;
}

const STATUS_CHIP: Record<AttendanceStatus, { label: string; classes: string }> = {
  attended:  { label: "Attended",  classes: "bg-lime-950 text-accent-lime border-lime-700"    },
  attending: { label: "Attending", classes: "bg-yellow-950 text-yellow-400 border-yellow-700" },
  interested:{ label: "Interested",classes: "bg-purple-950 text-purple-400 border-purple-800" },
  missed:    { label: "Missed",    classes: "bg-red-950 text-red-400 border-red-800"          },
  cancelled: { label: "Cancelled", classes: "bg-surface-2 text-text-subtle border-border"     },
  dismissed: { label: "Dismissed", classes: "bg-surface-2 text-text-subtle border-border"     },
};

const ROLE_LABEL: Record<string, string> = {
  headliner:    "Headliner",
  co_headliner: "Co-headliner",
  support:      "Support",
  // Legacy values — kept for display of old data; new entries only use the three above
  opener:       "Support",
  festival_set: "Support",
};

const ROLE_ORDER: Record<string, number> = {
  headliner: 0, co_headliner: 1, support: 2, opener: 2, festival_set: 2,
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

/**
 * localUid() requires a secure context (HTTPS / localhost) and fails
 * over plain HTTP (e.g. Tailscale IP).  This helper uses crypto.getRandomValues
 * which is available in all contexts and produces a good-enough local row key.
 */
function localUid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Flyer section
// ─────────────────────────────────────────────────────────────────────────────

function FlyerSection({ concert }: { concert: ConcertDetail }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [flyerModal, setFlyerModal] = useState(false);
  const flyerDragCounterRef = useRef(0);

  // Lock body scroll while flyer modal is open
  useEffect(() => {
    if (!flyerModal) return;
    document.body.classList.add("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [flyerModal]);

  const currentUrl = localUrl ?? concert.flyerUrl;

  const handleUpload = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    // Client-side duplicate detection
    if (concert.flyerHash) {
      try {
        const buf = await files[0]!.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buf);
        const hex = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (hex === concert.flyerHash) {
          setError("This image is already the current flyer.");
          setUploading(false);
          return;
        }
      } catch {
        // hash failed — let the server catch it
      }
    }

    try {
      const res = await api.uploadFlyer(concert.id, files[0]!);
      setLocalUrl(res.flyerUrl);
      await qc.invalidateQueries({ queryKey: ["concerts", concert.id] });
      await qc.invalidateQueries({ queryKey: ["concerts"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemove = async (): Promise<void> => {
    if (!window.confirm("Remove the flyer?")) return;
    try {
      await api.deleteFlyer(concert.id);
      setLocalUrl(null);
      await qc.invalidateQueries({ queryKey: ["concerts", concert.id] });
      await qc.invalidateQueries({ queryKey: ["concerts"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed.");
    }
  };

  const handleFlyerDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    flyerDragCounterRef.current += 1;
    if (flyerDragCounterRef.current === 1) setIsDragging(true);
  };
  const handleFlyerDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    flyerDragCounterRef.current -= 1;
    if (flyerDragCounterRef.current === 0) setIsDragging(false);
  };
  const handleFlyerDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault();
    flyerDragCounterRef.current = 0;
    setIsDragging(false);
    if (uploading) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) await handleUpload(files);
  };

  return (
    <div
      className="rounded-lg border border-border bg-surface overflow-hidden relative"
      onDragEnter={handleFlyerDragEnter}
      onDragLeave={handleFlyerDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => void handleFlyerDrop(e)}
    >
      {/* Drag-over overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-10 border-2 border-dashed border-accent-lime bg-accent-lime/5 flex items-center justify-center pointer-events-none rounded-lg">
          <span className="text-sm font-mono text-accent-lime font-bold">Drop flyer</span>
        </div>
      )}
      {/* Image area — square on mobile/tablet, portrait (2:3) on desktop */}
      <div className="relative aspect-square lg:aspect-[2/3] overflow-hidden bg-surface-2">
        {currentUrl ? (
          <button
            className="w-full h-full focus:outline-none"
            title="View full size"
            onClick={() => setFlyerModal(true)}
          >
            <img
              src={currentUrl}
              alt="Flyer"
              className="w-full h-full object-cover lg:object-contain"
            />
            {/* Expand hint */}
            <span className="absolute bottom-2 right-2 bg-black/50 text-white/70 text-[10px] font-mono px-1.5 py-0.5 rounded pointer-events-none">
              ⤢ full
            </span>
          </button>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-text-subtle">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-20">
              <rect x="6" y="4" width="36" height="40" rx="3" stroke="currentColor" strokeWidth="2"/>
              <path d="M14 16h20M14 24h20M14 32h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="34" cy="32" r="4" stroke="currentColor" strokeWidth="2"/>
              <path d="M38 36l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span className="text-xs font-mono opacity-40">No flyer</span>
          </div>
        )}
      </div>

      {/* Full-size flyer modal — portalled to body to escape any parent stacking context */}
      {flyerModal && currentUrl && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setFlyerModal(false)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl font-mono w-10 h-10 flex items-center justify-center"
            onClick={() => setFlyerModal(false)}
          >×</button>
          <img
            src={currentUrl}
            alt="Flyer"
            className="max-h-[90vh] max-w-full object-contain rounded"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}

      {/* Controls below image */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border">
        <label className={clsx(
          "flex-1 text-center text-xs font-mono px-2 py-1.5 rounded border cursor-pointer transition-colors",
          uploading
            ? "border-border text-text-subtle cursor-not-allowed"
            : "border-border text-text-muted hover:border-accent-lime hover:text-accent-lime",
        )}>
          {uploading ? "Uploading…" : currentUrl ? "Replace" : "Set flyer"}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => void handleUpload(e.target.files)}
          />
        </label>
        {currentUrl && !uploading && (
          <button
            onClick={() => void handleRemove()}
            className="text-xs font-mono text-text-subtle hover:text-accent-pink transition-colors px-2 py-1.5"
          >
            Remove
          </button>
        )}
      </div>

      {error && <p className="text-xs text-accent-pink px-3 pb-2 font-mono">{error}</p>}
    </div>
  );
}

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
async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function PhotoGallery({
  concertId,
  concertDate,
  concertArtists,
}: {
  concertId: string;
  concertDate: string;
  concertArtists: ConcertArtist[];
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  // Global upload overlay — also covers ArtistUploadZone uploads
  const [globalUploading, setGlobalUploading] = useState(false);
  const [globalUploadPercent, setGlobalUploadPercent] = useState<number | null>(null);
  const [batchCurrent, setBatchCurrent] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchFileName, setBatchFileName] = useState("");
  const [batchPhase, setBatchPhase] = useState<"uploading" | "processing" | null>(null);
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
    if (isFutureEvent || uploading) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) await handleUpload(files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFutureEvent, uploading]);

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

  const MAX_BATCH = 20;

  // Polls the photo list directly (bypassing TanStack cache) until the given
  // photo's processing flag clears, or until a 2-minute timeout.
  const waitForProcessing = async (photoId: string): Promise<void> => {
    const POLL_MS = 2000;
    const TIMEOUT_MS = 120_000;
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, POLL_MS));
      try {
        const data = await api.listPhotos(concertId);
        const photo = data.photos.find((p) => p.id === photoId);
        if (!photo || !photo.processing) return;
      } catch {
        // network blip — keep polling
      }
    }
    // timed out — move on anyway
  };

  const handleUpload = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;

    const allFiles = Array.from(files);
    if (allFiles.length > MAX_BATCH) {
      setUploadError(
        `Max ${MAX_BATCH} photos per upload. You selected ${allFiles.length} — ` +
        `upload the first ${MAX_BATCH} now, then drag the rest in a second batch.`,
      );
      // Still proceed with the first MAX_BATCH files
    }
    const fileList = allFiles.slice(0, MAX_BATCH);

    // Pre-flight dedup — run before showing the overlay so we know the real count.
    // Duplicates are silently skipped; if a hash fails we let the server catch it.
    const existingHashes = new Set(photos.map((p) => p.contentHash).filter(Boolean));
    const toUpload: File[] = [];
    for (const file of fileList) {
      try {
        const hash = await hashFile(file);
        if (!existingHashes.has(hash)) {
          existingHashes.add(hash);
          toUpload.push(file);
        }
      } catch {
        toUpload.push(file); // hash failed — let server catch it
      }
    }

    // Everything was a duplicate — nothing to do, silently bail
    if (toUpload.length === 0) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);
    setGlobalUploading(true);
    setUploadPercent(0);
    setGlobalUploadPercent(0);
    setBatchCurrent(0);
    setBatchTotal(toUpload.length);
    setBatchFileName("");
    setBatchPhase("uploading");
    setUploadError(null);

    const failed: string[] = [];

    try {
      for (let i = 0; i < toUpload.length; i++) {
        const file = toUpload[i]!;
        setBatchCurrent(i + 1);
        setBatchTotal(toUpload.length);
        setBatchFileName(file.name);
        setBatchPhase("uploading");
        setUploadPercent(0);
        setGlobalUploadPercent(0);

        try {
          const { photoId } = await api.uploadPhoto(concertId, file, (pct) => {
            setUploadPercent(pct);
            setGlobalUploadPercent(pct);
          });
          // Switch to processing phase: poll until the worker finishes this file,
          // then immediately add it to the gallery before starting the next one.
          setBatchPhase("processing");
          setUploadPercent(null);
          setGlobalUploadPercent(null);
          await waitForProcessing(photoId);
          await qc.invalidateQueries({ queryKey: ["concerts", concertId, "photos"] });
        } catch (err) {
          failed.push(file.name);
          // Continue with remaining files
        }
      }

      // Only report actual upload failures; duplicates are silently skipped
      if (failed.length) setUploadError(`${failed.length} failed: ${failed.join(", ")}`);
    } finally {
      setUploading(false);
      setGlobalUploading(false);
      setUploadPercent(null);
      setGlobalUploadPercent(null);
      setBatchCurrent(0);
      setBatchTotal(0);
      setBatchFileName("");
      setBatchPhase(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={(e) => void handleDrop(e)}
    >
      {/* Global upload overlay — blocks all interaction and shows progress */}
      {globalUploading && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex flex-col items-center justify-center gap-4 backdrop-blur-sm">
          <div className="w-72 text-center px-6 py-8 rounded-2xl bg-bg/90 border border-border shadow-2xl">
            <div className="w-12 h-12 border-[3px] border-accent-lime/20 border-t-accent-lime rounded-full animate-spin mx-auto mb-5" />
            <p className="text-sm font-mono text-text-base mb-1">
              {batchTotal > 1
                ? `Photo ${batchCurrent} of ${batchTotal}`
                : (batchPhase === "processing" ? "Processing…" : "Uploading…")}
            </p>
            {batchFileName && (
              <p className="text-xs font-mono text-text-subtle truncate max-w-full mb-1">{batchFileName}</p>
            )}
            <p className="text-xs font-mono text-text-subtle mb-4">
              {batchPhase === "processing"
                ? "Worker processing…"
                : (globalUploadPercent !== null ? `${globalUploadPercent}%` : "Please wait")}
            </p>
            {batchPhase === "uploading" && globalUploadPercent !== null && (
              <div className="w-full bg-surface-2 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-accent-lime rounded-full transition-all duration-150"
                  style={{ width: `${globalUploadPercent}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drag-over overlay */}
      {isDragging && !isFutureEvent && (
        <div className="absolute inset-0 z-20 rounded-lg border-2 border-dashed border-accent-lime bg-accent-lime/5 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="mx-auto text-accent-lime mb-2">
              <path d="M12 2v13m0-13L8 6m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span className="text-sm font-mono text-accent-lime font-bold">Drop to upload</span>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-xs font-mono uppercase tracking-wider text-text-muted">Media</h2>
        <div className="flex items-center gap-2 ml-auto">
          {!reordering && !tagging ? (
            <>
              {photos.length > 0 && concertArtists.length > 0 && (
                <button
                  onClick={() => void enterTagging()}
                  disabled={loadingTags}
                  className="text-xs font-mono text-text-subtle hover:text-accent-lime border border-border rounded px-2.5 py-1.5 transition-colors disabled:opacity-50"
                >
                  {loadingTags ? "Loading…" : "⊕ Tag artists"}
                </button>
              )}
              {photos.length > 1 && (
                <button
                  onClick={enterReorder}
                  className="text-xs font-mono text-text-subtle hover:text-accent-lime border border-border rounded px-2.5 py-1.5 transition-colors"
                >
                  ⇄ Reorder
                </button>
              )}
              {isFutureEvent ? (
                <span
                  className="text-xs font-mono text-text-subtle border border-dashed border-border rounded px-3 py-1.5 cursor-not-allowed"
                  title="Media can be added on or after the event date"
                >
                  + Add media
                </span>
              ) : (
                <label className={clsx(
                  "text-xs font-mono px-3 py-1.5 rounded border cursor-pointer transition-colors",
                  uploading
                    ? "border-border text-text-subtle cursor-not-allowed"
                    : "border-border text-text-muted hover:border-accent-lime hover:text-accent-lime",
                )}>
                  {uploading
                    ? uploadPercent !== null ? `${uploadPercent}%` : "Uploading…"
                    : "+ Add media"}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
                    multiple
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => void handleUpload(e.target.files)}
                  />
                </label>
              )}
            </>
          ) : reordering ? (
            <>
              <button
                onClick={cancelReorder}
                className="text-xs font-mono text-text-subtle hover:text-text-base border border-border rounded px-2.5 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveOrder()}
                disabled={savingOrder}
                className="text-xs font-mono px-3 py-1.5 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {savingOrder ? "Saving…" : "Save order"}
              </button>
            </>
          ) : (
            /* tagging mode header controls */
            <button
              onClick={exitTagging}
              className="text-xs font-mono text-text-subtle hover:text-text-base border border-border rounded px-2.5 py-1.5 transition-colors"
            >
              Done tagging
            </button>
          )}
        </div>
      </div>

      {/* Tagging mode: artist selector + assign controls */}
      {tagging && (
        <div className="mb-4 rounded-lg border border-accent-lime/30 bg-surface-2 p-3 space-y-3">
          <p className="text-xs font-mono text-text-muted uppercase tracking-wider">Tag artists in photos</p>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-text-subtle font-mono block mb-1">Tagging artist</label>
              <select
                value={tagArtistId}
                onChange={(e) => {
                  setTagArtistId(e.target.value);
                  setSelectedForTag(new Set());
                  setTagSaveMsg(null);
                }}
                className="w-full rounded border border-border bg-surface px-2.5 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent-lime"
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
                className="text-xs font-mono px-3 py-1.5 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingTags
                  ? "Saving…"
                  : selectedForTag.size === 0
                    ? "Select photos below"
                    : `Tag ${selectedForTag.size} photo${selectedForTag.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
          {tagSaveMsg && <p className="text-xs font-mono text-accent-lime">{tagSaveMsg}</p>}
          {tagError && <p className="text-xs font-mono text-accent-pink">{tagError}</p>}
          <p className="text-xs text-text-subtle font-mono">
            Tap photos to select • Click "Tag N photos" to assign • Switch artist to tag another pass
          </p>
        </div>
      )}

      {/* Future event notice */}
      {isFutureEvent && (
        <p className="text-xs text-text-subtle font-mono mb-3 italic">
          Media upload opens on the event date ({concertDate}).
        </p>
      )}

      {uploadError && (
        <p className="text-xs text-accent-pink mb-3 font-mono">{uploadError}</p>
      )}

      {displayPhotos.length === 0 ? (
        <p className="text-xs text-text-subtle font-mono py-4 text-center border border-dashed border-border rounded-lg">
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
                    <div className="w-full h-full flex items-center justify-center text-text-subtle text-xs font-mono animate-pulse">…</div>
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
                      <span className="text-bg text-base leading-none font-bold">✓</span>
                    </div>
                  </div>
                )}

                {/* Tagging: artist tag badges at bottom */}
                {tagging && currentPhotoTags.length > 0 && (
                  <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-0.5 p-1 bg-black/60 rounded-b pointer-events-auto">
                    {currentPhotoTags.map((artistId) => {
                      const artist = concertArtists.find((a) => a.id === artistId);
                      if (!artist) return null;
                      const initials = artist.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                      return (
                        <button
                          key={artistId}
                          onClick={(e) => { e.stopPropagation(); void handleRemoveTagFromPhoto(p.id, artistId); }}
                          title={`Remove ${artist.name} tag`}
                          className="text-[9px] font-mono bg-accent-lime/80 text-bg rounded px-0.5 leading-4 hover:bg-accent-pink/80 hover:text-white transition-colors"
                        >
                          {initials}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Confirm-delete overlay */}
                {!tagging && confirmDeleteId === p.id && (
                  <div className="absolute inset-0 rounded bg-black/75 flex flex-col items-center justify-center gap-1.5 z-10">
                    <span className="text-xs text-white font-mono">Delete?</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => void handleDelete(p.id)}
                        disabled={deleting}
                        className="text-xs font-mono px-2 py-0.5 rounded bg-accent-pink text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {deleting ? "…" : "Yes"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs font-mono px-2 py-0.5 rounded border border-border text-white hover:bg-surface-2"
                      >
                        No
                      </button>
                    </div>
                  </div>
                )}

                {/* Hover trash icon (normal mode only) */}
                {!reordering && !tagging && confirmDeleteId !== p.id && !p.processing && (
                  <button
                    onClick={() => setConfirmDeleteId(p.id)}
                    className="absolute top-1 right-1 w-6 h-6 rounded bg-black/60 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent-pink z-10"
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
                      className="text-white text-xs font-mono w-5 h-5 flex items-center justify-center disabled:opacity-20 hover:text-accent-lime transition-colors"
                      title="Move left"
                    >←</button>
                    <span className="text-white text-xs font-mono opacity-50">{idx + 1}</span>
                    <button
                      onClick={() => movePhoto(p.id, 1)}
                      disabled={idx === displayPhotos.length - 1}
                      className="text-white text-xs font-mono w-5 h-5 flex items-center justify-center disabled:opacity-20 hover:text-accent-lime transition-colors"
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
          <p className="text-[10px] font-mono uppercase tracking-widest text-text-subtle mb-2">
            Upload by artist <span className="normal-case opacity-60">— media auto-tagged on upload</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {concertArtists.map((artist) => (
              <ArtistUploadZone
                key={artist.id}
                artist={artist}
                concertId={concertId}
                concertDate={concertDate}
                onUploaded={() => qc.invalidateQueries({ queryKey: ["concerts", concertId, "photos"] })}
                onUploadStart={() => { setGlobalUploading(true); setGlobalUploadPercent(0); }}
                onUploadEnd={() => { setGlobalUploading(false); setGlobalUploadPercent(null); }}
                onProgress={(pct) => setGlobalUploadPercent(pct)}
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
  onUploaded,
  onUploadStart,
  onUploadEnd,
  onProgress,
}: {
  artist: ConcertArtist;
  concertId: string;
  concertDate: string;
  onUploaded: () => void;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  onProgress?: (pct: number) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadCount, setUploadCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const today = new Date().toISOString().slice(0, 10);
  const isFutureEvent = concertDate > today;

  const handleUpload = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0 || isFutureEvent) return;
    setUploading(true);
    onUploadStart?.();
    setError(null);
    let uploaded = 0;
    try {
      const fileList = Array.from(files);
      for (let i = 0; i < fileList.length; i++) {
        onProgress?.(0);
        const res = await api.uploadPhoto(concertId, fileList[i]!, (pct) => onProgress?.(pct));
        // Auto-tag the artist on the freshly uploaded photo
        if (res.photoId) {
          try { await api.tagPhotoArtists(res.photoId, [artist.id]); } catch { /* best-effort */ }
        }
        uploaded++;
      }
      setUploadCount((n) => n + uploaded);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      onUploadEnd?.();
      if (fileRef.current) fileRef.current.value = "";
    }
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
        disabled={isFutureEvent || uploading}
        onChange={(e) => void handleUpload(e.target.files)}
      />
      <p className="text-xs font-mono font-medium text-text-muted truncate leading-tight mb-0.5">{artist.name}</p>
      {uploading ? (
        <p className="text-[10px] font-mono text-accent-lime animate-pulse">Uploading…</p>
      ) : uploadCount > 0 ? (
        <p className="text-[10px] font-mono text-accent-lime">+{uploadCount} tagged</p>
      ) : (
        <p className="text-[10px] font-mono text-text-subtle">Drop or click</p>
      )}
      {error && <p className="text-[10px] font-mono text-accent-pink mt-0.5 truncate">{error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Venue autocomplete input
// ─────────────────────────────────────────────────────────────────────────────

function VenueAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Venue name",
  inputClassName,
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect: (name: string, city: string, region: string) => void;
  placeholder?: string;
  inputClassName?: string;
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
        className={inputClassName ?? "w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"}
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

function ConcertMetaEditor({ concert }: { concert: ConcertDetail }) {
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
        // Event name (concert) or festival name (festival_day)
        eventSeriesName: form.eventSeriesName.trim() || null,
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
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono uppercase tracking-wider text-text-muted">Concert info</span>
        {!editing ? (
          <button
            onClick={enterEdit}
            className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors"
          >
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {saveError && <span className="text-xs text-accent-pink font-mono">{saveError}</span>}
            <button
              onClick={() => setEditing(false)}
              className="text-xs font-mono text-text-subtle hover:text-text-base transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="text-xs font-mono px-3 py-1 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
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
            <dt className="text-xs text-text-subtle font-mono w-16 shrink-0">Date</dt>
            <dd className="text-text-base font-mono">
              {fmtDateLong(concert.date)}
              {concert.dateIsApproximate && (
                <span className="ml-2 text-xs text-text-subtle">(approx.)</span>
              )}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-xs text-text-subtle font-mono w-16 shrink-0">Type</dt>
            <dd>
              <span className="text-xs font-mono px-1.5 py-0.5 rounded border border-border text-text-muted">
                {concert.type === "festival_day" ? "Festival day" : "Concert"}
              </span>
            </dd>
          </div>
          {concert.venue && (
            <div className="flex items-baseline gap-2">
              <dt className="text-xs text-text-subtle font-mono w-16 shrink-0">Venue</dt>
              <dd className="text-text-base">
                {concert.venue.name}
                {concert.venue.city && <span className="text-text-subtle"> · {concert.venue.city}</span>}
                {concert.venue.region && <span className="text-text-subtle">, {concert.venue.region}</span>}
              </dd>
            </div>
          )}
          {concert.eventSeries && (
            <div className="flex items-baseline gap-2">
              <dt className="text-xs text-text-subtle font-mono w-16 shrink-0">
                {concert.type === "festival_day" ? "Festival" : "Event"}
              </dt>
              <dd className="text-text-base">
                {concert.eventSeries.name}
                {concert.eventSeries.year && <span className="text-text-subtle"> {concert.eventSeries.year}</span>}
              </dd>
            </div>
          )}
          {concert.eventNotes && (
            <div className="flex items-baseline gap-2">
              <dt className="text-xs text-text-subtle font-mono w-16 shrink-0">Notes</dt>
              <dd className="text-text-base italic text-sm">{concert.eventNotes}</dd>
            </div>
          )}
          {concert.sourceUrl && (
            <div className="flex items-baseline gap-2">
              <dt className="text-xs text-text-subtle font-mono w-16 shrink-0">Source</dt>
              <dd>
                <a
                  href={concert.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-text-muted hover:text-accent-lime transition-colors truncate block max-w-xs"
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
              <label className="block text-xs text-text-muted font-mono mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
                className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent-lime [color-scheme:dark]"
              />
            </div>
            <label className="flex items-center gap-2 mb-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.dateIsApproximate}
                onChange={(e) => setField("dateIsApproximate", e.target.checked)}
                className="accent-accent-lime"
              />
              <span className="text-xs text-text-muted font-mono">Approximate</span>
            </label>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs text-text-muted font-mono mb-1">Type</label>
            <div className="flex rounded border border-border overflow-hidden w-fit">
              {(["concert", "festival_day"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={clsx(
                    "px-3 py-1.5 text-xs font-mono transition-colors",
                    form.type === t
                      ? "bg-accent-lime text-bg font-bold"
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
              <label className="block text-xs text-text-muted font-mono mb-1">Venue name</label>
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
                value={form.venueCity}
                onChange={(e) => setField("venueCity", e.target.value)}
                placeholder="City"
                className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-text-muted font-mono mb-1">State/province</label>
              <input
                type="text"
                value={form.venueRegion}
                onChange={(e) => setField("venueRegion", e.target.value)}
                placeholder="State / province"
                className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
              />
            </div>
          </div>

          {/* Type-driven: Event name (concert) or Festival name + year (festival_day) */}
          {form.type === "concert" ? (
            <div>
              <label className="block text-xs text-text-muted font-mono mb-1">
                Event name <span className="text-text-subtle">(optional — e.g. The Eras Tour)</span>
              </label>
              <input
                type="text"
                value={form.eventSeriesName}
                onChange={(e) => setField("eventSeriesName", e.target.value)}
                placeholder="Event name…"
                className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
              />
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="flex-[3]">
                <label className="block text-xs text-text-muted font-mono mb-1">
                  Festival name <span className="text-accent-pink">*</span>
                </label>
                <input
                  type="text"
                  value={form.eventSeriesName}
                  onChange={(e) => setField("eventSeriesName", e.target.value)}
                  placeholder="Festival name…"
                  className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs text-text-muted font-mono mb-1">Year</label>
                <input
                  type="number"
                  value={form.eventSeriesYear}
                  onChange={(e) => setField("eventSeriesYear", e.target.value)}
                  placeholder="Year"
                  min={1900}
                  max={2100}
                  className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
                />
              </div>
            </div>
          )}

          {/* Event notes */}
          <div>
            <label className="block text-xs text-text-muted font-mono mb-1">Event notes (shared)</label>
            <textarea
              rows={2}
              value={form.eventNotes}
              onChange={(e) => setField("eventNotes", e.target.value)}
              placeholder="Notes visible to all attendees…"
              className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime resize-none"
            />
          </div>

          {/* Source URL */}
          <div>
            <label className="block text-xs text-text-muted font-mono mb-1">Source URL</label>
            <input
              type="url"
              value={form.sourceUrl}
              onChange={(e) => setField("sourceUrl", e.target.value)}
              placeholder="https://…"
              className="w-full rounded border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text-base placeholder:text-text-subtle focus:outline-none focus:border-accent-lime"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance editor
// ─────────────────────────────────────────────────────────────────────────────

function AttendanceEditor({ concertId, attendance }: { concertId: string; attendance: ConcertDetail["attendance"] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(attendance?.personalNotes ?? "");

  const patch = useMutation({
    mutationFn: (body: Parameters<typeof api.patchConcert>[1]) => api.patchConcert(concertId, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["concerts", concertId] }); qc.invalidateQueries({ queryKey: ["concerts/stats"] }); setEditing(false); },
  });

  if (!attendance) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono uppercase tracking-wider text-text-muted">Your attendance</span>
        <button onClick={() => setEditing((v) => !v)} className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors">
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-muted block mb-1">Status</label>
            <select
              defaultValue={attendance.status}
              onChange={(e) => patch.mutate({ status: e.target.value as AttendanceStatus })}
              className="w-full rounded border border-border bg-surface-2 px-2 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent-lime"
            >
              {(["attended","attending","interested","missed","cancelled","dismissed"] as AttendanceStatus[]).map(
                (s) => <option key={s} value={s}>{STATUS_CHIP[s].label}</option>,
              )}
            </select>
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Personal notes</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded border border-border bg-surface-2 px-2 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent-lime resize-none" />
          </div>
          <button
            onClick={() => patch.mutate({ personalNotes: notes || null })}
            disabled={patch.isPending}
            className="text-xs font-mono px-4 py-1.5 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {patch.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <span className={clsx("inline-block text-xs px-2 py-0.5 rounded border font-mono", STATUS_CHIP[attendance.status].classes)}>
            {STATUS_CHIP[attendance.status].label}
          </span>
          {attendance.personalNotes && (
            <p className="text-sm text-text-base mt-2 italic">{attendance.personalNotes}</p>
          )}
          {attendance.ticketPricePaid != null && (
            <div className="text-xs text-text-subtle font-mono">
              Ticket: {(attendance.ticketPricePaid / 100).toFixed(2)} {attendance.ticketPriceCurrency ?? ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lineup editor
// ─────────────────────────────────────────────────────────────────────────────

type ArtistRole = "headliner" | "co_headliner" | "support";
const ALL_ROLES: ArtistRole[] = ["headliner", "co_headliner", "support"];

/**
 * Enforce top-billing exclusivity: a concert cannot have both a "headliner"
 * and a "co_headliner" at the same time (they reflect different promotional
 * arrangements and are mutually exclusive).
 *
 * Rules:
 *  • If the changed artist is now "headliner"    → demote all co_headliners to "support"
 *  • If the changed artist is now "co_headliner" → convert any headliner to "co_headliner"
 *  • "support" role change → no cascade needed
 */
function enforceTopBilling(artists: LocalArtist[], changedUid: string): LocalArtist[] {
  const changed = artists.find((a) => a.uid === changedUid);
  if (!changed) return artists;

  if (changed.role === "headliner") {
    // One clear headliner → co-headliners lose equal billing, become support
    return artists.map((a) =>
      a.uid !== changedUid && a.role === "co_headliner"
        ? { ...a, role: "support" as ArtistRole }
        : a,
    );
  }

  if (changed.role === "co_headliner") {
    // Equal billing → any existing solo headliner joins as a co-headliner
    return artists.map((a) =>
      a.uid !== changedUid && a.role === "headliner"
        ? { ...a, role: "co_headliner" as ArtistRole }
        : a,
    );
  }

  return artists;
}

interface LocalArtist {
  uid: string;            // local-only unique key (localUid)
  artistId: string | null; // null for name-only (new) artists — server will upsert
  name: string;
  slug: string;
  role: ArtistRole;
  appearanceNotes: string | null;
}

function LineupEditor({ concert }: { concert: ConcertDetail }) {
  const qc = useQueryClient();
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [editing, setEditing] = useState(false);
  const [localArtists, setLocalArtists] = useState<LocalArtist[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Add-artist search state
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<ArtistListItem[]>([]);
  const [addRole, setAddRole] = useState<ArtistRole>("support");
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Explicit selection: user picks from dropdown but hasn't committed yet
  const [addSelectedArtist, setAddSelectedArtist] = useState<ArtistListItem | null>(null);
  // Fuzzy "did you mean?" suggestion
  const [suggestedArtist, setSuggestedArtist] = useState<ArtistListItem | null>(null);

  // Drag-and-drop reorder state
  const dragItemRef = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const enterEdit = () => {
    const sorted = [...concert.artists].sort((a, b) => {
      const rd = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
      return rd !== 0 ? rd : (a.setOrder ?? 99) - (b.setOrder ?? 99);
    });
    setLocalArtists(
      sorted.map((a) => ({
        uid: localUid(),
        artistId: a.id,
        name: a.name,
        slug: a.slug,
        role: a.role as ArtistRole,
        appearanceNotes: a.appearanceNotes,
      })),
    );
    setSaveError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setAddQuery("");
    setAddResults([]);
    setAddSelectedArtist(null);
    setSuggestedArtist(null);
    setSaveError(null);
  };

  const handleSearchChange = (val: string) => {
    setAddQuery(val);
    setAddSelectedArtist(null); // typing always clears any prior selection
    setSuggestedArtist(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!val.trim()) {
      setAddResults([]);
      setShowDropdown(false);
      return;
    }
    setShowDropdown(true);
    searchTimerRef.current = setTimeout(() => {
      setSearching(true);
      api
        .listArtists({ q: val, limit: 8 })
        .then(async (res) => {
          const filtered = res.artists.filter(
            (a) => !localArtists.some((la) => la.artistId === a.id),
          );
          setAddResults(filtered);

          // Fuzzy: if no results returned, try a stem search and compute edit distance
          if (filtered.length === 0 && val.length >= 3) {
            const stem = val.slice(0, Math.max(3, Math.floor(val.length * 0.7)));
            try {
              const stemRes = await api.listArtists({ q: stem, limit: 12 });
              const candidates = stemRes.artists.filter(
                (a) => !localArtists.some((la) => la.artistId === a.id),
              );
              if (candidates.length > 0) {
                const valLower = val.toLowerCase();
                let bestArtist = candidates[0]!;
                let bestDist = levenshtein(valLower, bestArtist.name.toLowerCase());
                for (const c of candidates.slice(1)) {
                  const d = levenshtein(valLower, c.name.toLowerCase());
                  if (d < bestDist) { bestDist = d; bestArtist = c; }
                }
                if (bestDist <= 2) setSuggestedArtist(bestArtist);
              }
            } catch {
              // ignore
            }
          }
        })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
  };

  /** Insert helper — places artist after the last item at or before the same role tier,
   *  then enforces top-billing exclusivity (headliner ↔ co_headliner cannot coexist). */
  const insertArtist = (artist: LocalArtist) => {
    setLocalArtists((prev) => {
      const result = [...prev];
      let insertAfter = -1;
      for (let i = 0; i < result.length; i++) {
        if ((ROLE_ORDER[result[i]!.role] ?? 99) <= (ROLE_ORDER[artist.role] ?? 99)) {
          insertAfter = i;
        }
      }
      result.splice(insertAfter + 1, 0, artist);
      return enforceTopBilling(result, artist.uid);
    });
  };

  const handleAddArtist = (artist: ArtistListItem) => {
    if (localArtists.some((a) => a.artistId === artist.id)) return;
    insertArtist({
      uid: localUid(),
      artistId: artist.id,
      name: artist.name,
      slug: artist.slug,
      role: addRole,
      appearanceNotes: null,
    });
    setAddQuery("");
    setAddResults([]);
    setAddSelectedArtist(null);
    setSuggestedArtist(null);
    setShowDropdown(false);
  };

  /** Commit: either add the selected dropdown item, or add a new artist by typed name. */
  const handleCommitAdd = () => {
    if (addSelectedArtist) {
      handleAddArtist(addSelectedArtist);
    } else if (addQuery.trim()) {
      insertArtist({
        uid: localUid(),
        artistId: null,
        name: addQuery.trim(),
        slug: "",
        role: addRole,
        appearanceNotes: null,
      });
      setAddQuery("");
      setAddResults([]);
      setAddSelectedArtist(null);
      setSuggestedArtist(null);
      setShowDropdown(false);
    }
  };

  const handleChangeRole = (uid: string, newRole: ArtistRole) => {
    setLocalArtists((prev) => {
      const idx = prev.findIndex((a) => a.uid === uid);
      if (idx === -1) return prev;
      const artist = { ...prev[idx]!, role: newRole };
      const without = prev.filter((_, i) => i !== idx);
      // Re-insert at end of the new role tier
      let insertAfter = -1;
      for (let i = 0; i < without.length; i++) {
        if ((ROLE_ORDER[without[i]!.role] ?? 99) <= (ROLE_ORDER[newRole] ?? 99)) {
          insertAfter = i;
        }
      }
      const result = [...without];
      result.splice(insertAfter + 1, 0, artist);
      // Enforce: headliner and co_headliner cannot coexist
      return enforceTopBilling(result, uid);
    });
  };

  const handleMoveUp = (uid: string) => {
    setLocalArtists((prev) => {
      const idx = prev.findIndex((a) => a.uid === uid);
      if (idx <= 0) return prev;
      const role = prev[idx]!.role;
      let prevIdx = -1;
      for (let i = idx - 1; i >= 0; i--) {
        if (prev[i]!.role === role) { prevIdx = i; break; }
      }
      if (prevIdx === -1) return prev;
      const result = [...prev];
      [result[prevIdx], result[idx]] = [result[idx]!, result[prevIdx]!];
      return result;
    });
  };

  const handleMoveDown = (uid: string) => {
    setLocalArtists((prev) => {
      const idx = prev.findIndex((a) => a.uid === uid);
      if (idx === -1) return prev;
      const role = prev[idx]!.role;
      let nextIdx = -1;
      for (let i = idx + 1; i < prev.length; i++) {
        if (prev[i]!.role === role) { nextIdx = i; break; }
      }
      if (nextIdx === -1) return prev;
      const result = [...prev];
      [result[idx], result[nextIdx]] = [result[nextIdx]!, result[idx]!];
      return result;
    });
  };

  const handleRemove = (uid: string) => {
    setLocalArtists((prev) => prev.filter((a) => a.uid !== uid));
  };

  // ── Drag-and-drop handlers ───────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    dragItemRef.current = idx;
    setDraggingIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnterItem = (idx: number) => {
    if (dragItemRef.current === null || dragItemRef.current === idx) return;
    setDragOverIdx(idx);
  };

  const handleDragOverItem = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDropItem = (toIdx: number) => {
    const fromIdx = dragItemRef.current;
    if (fromIdx === null || fromIdx === toIdx) {
      dragItemRef.current = null;
      setDraggingIdx(null);
      setDragOverIdx(null);
      return;
    }
    setLocalArtists((prev) => {
      const result = [...prev];
      const [item] = result.splice(fromIdx, 1);
      // After removing `fromIdx`, items above `toIdx` shift down by 1
      const insertAt = toIdx > fromIdx ? toIdx - 1 : toIdx;
      result.splice(insertAt, 0, item!);
      return result;
    });
    dragItemRef.current = null;
    setDraggingIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEndItem = () => {
    dragItemRef.current = null;
    setDraggingIdx(null);
    setDragOverIdx(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Compute setOrder as 0-indexed position within each role tier
      const roleCounters: Partial<Record<ArtistRole, number>> = {};
      const payload = localArtists.map((a) => {
        const order = roleCounters[a.role] ?? 0;
        roleCounters[a.role] = order + 1;
        if (a.artistId) {
          return { artistId: a.artistId, role: a.role, setOrder: order, appearanceNotes: a.appearanceNotes };
        } else {
          // Name-only artist — server will upsert
          return { artistName: a.name, role: a.role, setOrder: order, appearanceNotes: a.appearanceNotes };
        }
      });
      await api.putConcertArtists(concert.id, payload);
      await qc.invalidateQueries({ queryKey: ["concerts", concert.id] });
      void qc.invalidateQueries({ queryKey: ["concerts"] });
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  // Sorted artists for read mode
  const sortedArtists = [...concert.artists].sort((a, b) => {
    const rd = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
    return rd !== 0 ? rd : (a.setOrder ?? 99) - (b.setOrder ?? 99);
  });

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-mono uppercase tracking-wider text-text-muted">Lineup</h2>
        {!editing ? (
          <button
            onClick={enterEdit}
            className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors"
          >
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {saveError && <span className="text-xs text-accent-pink font-mono">{saveError}</span>}
            <button onClick={cancelEdit} className="text-xs font-mono text-text-subtle hover:text-text-base transition-colors">
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="text-xs font-mono px-3 py-1 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        )}
      </div>

      {!editing ? (
        /* ── Read mode ── */
        <>
          {sortedArtists.length === 0 ? (
            <p className="text-xs text-text-subtle">No artists recorded.</p>
          ) : (
            <ul className="space-y-2">
              {sortedArtists.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2 min-w-0">
                    {(a.role === "headliner" || a.role === "co_headliner") && (
                      <span className="text-accent-lime text-xs font-mono shrink-0">★</span>
                    )}
                    <Link
                      to={`/app/artists/${a.slug}`}
                      className="text-sm text-text-base hover:text-accent-lime transition-colors truncate"
                    >
                      {a.name}
                    </Link>
                  </div>
                  {/* Only show role label for non-support roles — support is implicit */}
                  {a.role !== "support" && a.role !== "opener" && a.role !== "festival_set" && (
                    <span className="text-xs text-text-subtle font-mono shrink-0">
                      {ROLE_LABEL[a.role] ?? a.role}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {concert.eventNotes && (
            <p className="text-xs text-text-subtle mt-3 italic">{concert.eventNotes}</p>
          )}
        </>
      ) : (
        /* ── Edit mode ── */
        <div>
          {localArtists.length === 0 ? (
            <p className="text-xs text-text-subtle mb-3">No artists yet — add one below.</p>
          ) : (
            <ul className="mb-4">
              {localArtists.map((a, idx) => {
                const sameRole = localArtists.filter((x) => x.role === a.role);
                const posInRole = sameRole.findIndex((x) => x.uid === a.uid);
                const canMoveUp   = posInRole > 0;
                const canMoveDown = posInRole < sameRole.length - 1;
                const isDragging  = draggingIdx === idx;
                const isDropTarget = dragOverIdx === idx && draggingIdx !== idx;

                return (
                  <li
                    key={a.uid}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragEnter={() => handleDragEnterItem(idx)}
                    onDragOver={handleDragOverItem}
                    onDrop={() => handleDropItem(idx)}
                    onDragEnd={handleDragEndItem}
                    className={clsx(
                      "flex items-center gap-2 py-1 rounded transition-opacity",
                      isDropTarget && "border-t-2 border-accent-lime",
                      !isDropTarget && "border-t-2 border-transparent",
                      isDragging ? "opacity-30" : "opacity-100",
                    )}
                  >
                    {/* Drag handle — 6-dot grip */}
                    <div
                      title="Drag to reorder"
                      className="cursor-grab active:cursor-grabbing shrink-0 text-text-subtle hover:text-text-muted transition-colors flex items-center justify-center w-4"
                    >
                      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
                        <circle cx="2.5" cy="2"  r="1.4"/>
                        <circle cx="7.5" cy="2"  r="1.4"/>
                        <circle cx="2.5" cy="7"  r="1.4"/>
                        <circle cx="7.5" cy="7"  r="1.4"/>
                        <circle cx="2.5" cy="12" r="1.4"/>
                        <circle cx="7.5" cy="12" r="1.4"/>
                      </svg>
                    </div>

                    <select
                      value={a.role}
                      onChange={(e) => handleChangeRole(a.uid, e.target.value as ArtistRole)}
                      className="text-xs font-mono rounded border border-border bg-surface-2 px-1.5 py-1 text-text-muted focus:outline-none focus:border-accent-lime w-[128px] shrink-0"
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>

                    <span className="flex-1 text-sm text-text-base truncate min-w-0">
                      {(a.role === "headliner" || a.role === "co_headliner") && (
                        <span className="text-accent-lime text-xs mr-1.5">★</span>
                      )}
                      {a.name}
                    </span>

                    <div className="flex items-center shrink-0">
                      <button
                        onClick={() => handleMoveUp(a.uid)}
                        disabled={!canMoveUp}
                        title="Move up within tier"
                        className="w-6 h-6 flex items-center justify-center text-xs font-mono text-text-subtle hover:text-text-base disabled:opacity-20 transition-colors"
                      >↑</button>
                      <button
                        onClick={() => handleMoveDown(a.uid)}
                        disabled={!canMoveDown}
                        title="Move down within tier"
                        className="w-6 h-6 flex items-center justify-center text-xs font-mono text-text-subtle hover:text-text-base disabled:opacity-20 transition-colors"
                      >↓</button>
                      <button
                        onClick={() => handleRemove(a.uid)}
                        title="Remove from lineup"
                        className="w-6 h-6 flex items-center justify-center text-xs font-mono text-text-subtle hover:text-accent-pink transition-colors ml-1"
                      >×</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Add artist */}
          <div className="border-t border-border pt-3">
            <p className="text-xs font-mono uppercase tracking-wider text-text-muted mb-2">Add artist</p>
            <div className="flex gap-2 items-start flex-wrap">
              {/* Search input */}
              <div className="relative flex-1 min-w-[160px]">
                <input
                  type="text"
                  placeholder="Type a name to search or add…"
                  value={addQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => addQuery.trim() && !addSelectedArtist && setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleCommitAdd(); }
                  }}
                  className={clsx(
                    "w-full rounded border bg-surface-2 px-2.5 py-1.5 text-xs text-text-base placeholder:text-text-subtle focus:outline-none transition-colors",
                    addSelectedArtist
                      ? "border-accent-lime text-accent-lime"
                      : "border-border focus:border-accent-lime",
                  )}
                />
                {showDropdown && !addSelectedArtist && (searching || addResults.length > 0) && (
                  <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-surface border border-border rounded-lg shadow-xl py-1 max-h-52 overflow-y-auto">
                    {searching ? (
                      <div className="px-3 py-2 text-xs text-text-subtle font-mono animate-pulse">Searching…</div>
                    ) : (
                      addResults.map((ar) => (
                        <button
                          key={ar.id}
                          onMouseDown={() => {
                            setAddSelectedArtist(ar);
                            setAddQuery(ar.name);
                            setShowDropdown(false);
                            setSuggestedArtist(null);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 transition-colors flex items-center justify-between gap-2"
                        >
                          <span className="text-text-base truncate">{ar.name}</span>
                          <span className="text-xs text-text-subtle font-mono shrink-0">{ar.showCount} shows</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Role selector */}
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as ArtistRole)}
                className="text-xs font-mono rounded border border-border bg-surface-2 px-1.5 py-1.5 text-text-muted focus:outline-none focus:border-accent-lime w-[128px] shrink-0"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>

              {/* Add to lineup button */}
              <button
                type="button"
                onClick={handleCommitAdd}
                disabled={!addSelectedArtist && !addQuery.trim()}
                className="text-xs font-mono px-3 py-1.5 rounded bg-accent-lime text-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                Add to lineup
              </button>
            </div>

            {/* "Did you mean?" fuzzy suggestion */}
            {suggestedArtist && (
              <p className="mt-2 text-xs font-mono text-text-muted">
                Did you mean{" "}
                <button
                  type="button"
                  className="text-accent-lime hover:underline"
                  onMouseDown={() => {
                    setAddSelectedArtist(suggestedArtist);
                    setAddQuery(suggestedArtist.name);
                    setSuggestedArtist(null);
                    setAddResults([]);
                    setShowDropdown(false);
                  }}
                >
                  {suggestedArtist.name}
                </button>
                ?
              </p>
            )}

            {/* Hint text */}
            {addSelectedArtist ? (
              <p className="mt-1.5 text-xs text-text-subtle font-mono">
                ✓ {addSelectedArtist.name} selected — choose a role then click "Add to lineup"
              </p>
            ) : addQuery.trim() && !searching && addResults.length === 0 && !suggestedArtist ? (
              <p className="mt-1.5 text-xs text-text-subtle font-mono">
                No existing artist found — will create <span className="text-text-muted">"{addQuery.trim()}"</span> on save.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function ConcertDetailPage() {
  const { id } = useParams<{ id: string }>();

  const concertQuery = useQuery({
    queryKey: ["concerts", id],
    queryFn: () => api.getConcert(id!),
    enabled: !!id,
  });

  if (concertQuery.isLoading) {
    return <div className="py-16 text-center text-text-subtle font-mono text-sm animate-pulse">Loading…</div>;
  }
  if (concertQuery.isError || !concertQuery.data) {
    return (
      <div className="py-16 text-center font-mono text-sm text-accent-pink">
        Concert not found.{" "}
        <Link to="/app/concerts" className="underline text-text-muted">Back to The Damage</Link>
      </div>
    );
  }

  const { concert } = concertQuery.data;

  // Sort artists: headliner first, then by role order, then by setOrder
  const sortedArtists = [...concert.artists].sort((a, b) => {
    const roleDiff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
    if (roleDiff !== 0) return roleDiff;
    return (a.setOrder ?? 99) - (b.setOrder ?? 99);
  });

  // Title: single headliner name, OR all co-headliners joined with " & "
  const headliner   = sortedArtists.find((a) => a.role === "headliner");
  const coHeadliners = sortedArtists.filter((a) => a.role === "co_headliner");
  const title =
    headliner?.name ??
    (coHeadliners.length > 0 ? coHeadliners.map((a) => a.name).join(" & ") : null) ??
    sortedArtists[0]?.name ??
    concert.headlinerHint ??
    concert.eventSeries?.name ??
    "Unknown show";

  return (
    <div>
      {/* Breadcrumb */}
      <Link to="/app/concerts" className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors">
        ← The Damage
      </Link>

      {/* Two-column layout: flyer left, main content right */}
      <div className="mt-4 grid gap-4 grid-cols-[120px_1fr] sm:grid-cols-[160px_1fr] md:grid-cols-[220px_1fr] lg:gap-6 lg:grid-cols-[320px_1fr]">
        {/* ── Left column: flyer ── */}
        <div className="sticky top-6 self-start">
          <p className="text-xs font-mono uppercase tracking-wider text-text-muted mb-2">Flyer</p>
          <FlyerSection concert={concert} />
        </div>

        {/* ── Right column: details ── */}
        <div className="min-w-0 space-y-4">
          {/* Header */}
          <div>
            <h1 className="font-display uppercase text-3xl mb-1">{title}</h1>
            <div className="text-text-muted text-sm">
              <time dateTime={concert.date} className="font-mono">{fmtDateLong(concert.date)}</time>
              {concert.dateIsApproximate && <span className="ml-2 text-text-subtle text-xs">(approximate)</span>}
            </div>
            {concert.venue && (
              <div className="text-text-muted text-sm mt-0.5">
                <Link to={`/app/venues/${concert.venue.slug}`} className="hover:text-accent-lime transition-colors">
                  {concert.venue.name}
                </Link>
                {concert.venue.city && <span className="text-text-subtle"> · {concert.venue.city}</span>}
              </div>
            )}
            {concert.eventSeries && (
              <Link to={`/app/festivals/${concert.eventSeries.slug}`} className="inline-block text-accent-pink hover:underline font-mono text-xs mt-0.5">
                {concert.eventSeries.name}
              </Link>
            )}
            {/* Compact venue map */}
            {concert.venue?.lat != null && concert.venue.lng != null && (
              <div className="mt-3">
                <VenueMap
                  lat={concert.venue.lat}
                  lng={concert.venue.lng}
                  venueName={concert.venue.name}
                  compact
                />
              </div>
            )}
          </div>

          {/* Concert info */}
          <ConcertMetaEditor concert={concert} />

          {/* Lineup */}
          <LineupEditor concert={concert} />

          {/* Attendance */}
          <AttendanceEditor concertId={concert.id} attendance={concert.attendance} />

          {/* Photo gallery */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <PhotoGallery
              concertId={concert.id}
              concertDate={concert.date}
              concertArtists={concert.artists}
            />
          </div>

          {concert.sourceUrl && (
            <a href={concert.sourceUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs font-mono text-text-subtle hover:text-accent-lime transition-colors">
              → Event source ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
