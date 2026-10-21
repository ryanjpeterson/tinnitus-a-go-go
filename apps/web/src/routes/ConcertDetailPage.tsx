/**
 * Concert detail — full view of one show with flyer, lineup, attendance editor, and photo gallery.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, type ConcertDetail, type ArtistListItem, type VenueListItem, type ConcertArtist, type SetlistfmResult, type ConcertSetlistEntry } from "@/lib/api";
import type { AttendanceStatus } from "@tagg/shared";
import { VenueMap } from "@/components/VenueMap";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import type { CarouselItem } from "@/components/PhotoCarousel";
import { useAuth } from "@/lib/auth-context";
import { Chevron, EmptyState, EventRow, Hero, List, Loading, StatusBadge } from "@/components/ui/kit";
import { billLine } from "@/lib/showTitle";
import { initials } from "@/lib/format";
import { Button } from "@/components/ui/button";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
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

/**
 * Admin flyer controls, shown with the show banner's actions: upload, import
 * from a URL, remove. The flyer itself is the banner image (tap for full size).
 */
function FlyerControls({ concert }: { concert: ConcertDetail }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [flyerModal, setFlyerModal] = useState(false);
  const flyerDragCounterRef = useRef(0);

  // URL import state
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlImporting, setUrlImporting] = useState(false);

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

  const handleUrlImport = async (): Promise<void> => {
    if (!urlInput.trim()) return;
    setUrlImporting(true);
    setError(null);
    try {
      const res = await api.uploadFlyerFromUrl(concert.id, urlInput.trim());
      setLocalUrl(res.flyerUrl);
      await qc.invalidateQueries({ queryKey: ["concerts", concert.id] });
      await qc.invalidateQueries({ queryKey: ["concerts"] });
      setUrlInput("");
      setShowUrlInput(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import image from URL.");
    } finally {
      setUrlImporting(false);
    }
  };

  const busy = uploading || urlImporting;
  const hasFlyer = !!currentUrl && !concert.flyerInherited;

  return (
    <>
      <label className={`btn btn-secondary cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
        {uploading ? "Uploading…" : hasFlyer ? "Replace flyer" : "Upload flyer"}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only"
          onChange={(e) => void handleUpload(e.target.files)} disabled={busy} />
      </label>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setShowUrlInput((v) => !v)}>
        Flyer URL
      </button>
      {hasFlyer && (
        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void handleRemove()}>
          Remove flyer
        </button>
      )}
      {showUrlInput && (
        <div className="flex w-full gap-2">
          <input type="url" placeholder="Paste image URL" value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleUrlImport()} disabled={urlImporting} className="field h-11 flex-1" />
          <button type="button" className="btn btn-primary" disabled={urlImporting || !urlInput.trim()} onClick={() => void handleUrlImport()}>
            {urlImporting ? "Importing…" : "Import"}
          </button>
        </div>
      )}
      {error && <p className="w-full text-sm text-accent-pink">{error}</p>}
    </>
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
  isAdmin = false,
}: {
  concertId: string;
  concertDate: string;
  concertArtists: ConcertArtist[];
  isAdmin?: boolean;
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
            <p className="text-sm text-text-base mb-1">
              {batchTotal > 1
                ? `Photo ${batchCurrent} of ${batchTotal}`
                : (batchPhase === "processing" ? "Processing…" : "Uploading…")}
            </p>
            {batchFileName && (
              <p className="text-sm text-text-subtle truncate max-w-full mb-1">{batchFileName}</p>
            )}
            <p className="text-sm text-text-subtle mb-4">
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
                  <label className={clsx(
                    "text-xs  px-3 py-1.5 rounded border cursor-pointer transition-colors",
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
                          className="text-xs bg-accent-lime/80 text-bg rounded px-0.5 leading-4 hover:bg-accent-pink/80 hover:text-white transition-colors"
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
      <p className="text-sm font-medium text-text-muted truncate leading-tight mb-0.5">{artist.name}</p>
      {uploading ? (
        <p className="text-sm text-accent-lime animate-pulse">Uploading…</p>
      ) : uploadCount > 0 ? (
        <p className="text-sm text-accent-lime">+{uploadCount} tagged</p>
      ) : (
        <p className="text-sm text-text-subtle">Drop or click</p>
      )}
      {error && <p className="text-sm text-accent-pink mt-0.5 truncate">{error}</p>}
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
        className={inputClassName ?? "field h-11 w-full"}
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
              <span className="text-sm text-text-subtle shrink-0">
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
              {fmtDateLong(concert.date)}
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

          {/* Type-driven: Event name (concert) or Festival name + year (festival_day) */}
          {form.type === "concert" ? (
            <div>
              <label className="block mb-1 label">
                Event name <span className="text-text-subtle">(optional — e.g. The Eras Tour)</span>
              </label>
              <input
                type="text"
                value={form.eventSeriesName}
                onChange={(e) => setField("eventSeriesName", e.target.value)}
                placeholder="Event name…"
                className="w-full field h-11"
              />
            </div>
          ) : (
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

// ─────────────────────────────────────────────────────────────────────────────
// Attendance editor
// ─────────────────────────────────────────────────────────────────────────────

function AttendanceEditor({ concertId, attendance }: { concertId: string; attendance: ConcertDetail["attendance"] }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(attendance?.personalNotes ?? "");
  // "" = not logged yet. Starts on the saved status so the picker shows the real value.
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus | "">(attendance?.status ?? "");

  // Derived from the saved values, so reverting an edit by hand turns the
  // button back off instead of leaving a "Save changes" that does nothing.
  const updates: Parameters<typeof api.patchConcert>[1] = {};
  if (selectedStatus !== "" && selectedStatus !== attendance?.status) updates.status = selectedStatus;
  if (notes !== (attendance?.personalNotes ?? "")) updates.personalNotes = notes || null;
  // A show with no attendance yet needs a status before anything can be saved.
  const hasChanges = Object.keys(updates).length > 0 && selectedStatus !== "";

  const patch = useMutation({
    mutationFn: (body: Parameters<typeof api.patchConcert>[1]) => api.patchConcert(concertId, body),
    // Returning the detail refetch keeps the button in "Saving…" until the new
    // attendance arrives, rather than flashing "Save changes" against stale props.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["concerts/stats"] });
      qc.invalidateQueries({ queryKey: ["concerts"] });
      return qc.invalidateQueries({ queryKey: ["concerts", concertId] });
    },
  });

  const handleSave = () => {
    if (hasChanges) patch.mutate(updates);
  };

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="h-section">Attendance</span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block mb-1 label">Status</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as AttendanceStatus | "")}
            className="w-full field h-11"
          >
            {!attendance && <option value="" disabled>Not logged — pick a status</option>}
            {/* Dismissed isn't offered any more; it only appears for shows that already have it. */}
            {([..."attending,interested,attended,missed,cancelled".split(","), ...(attendance?.status === "dismissed" ? ["dismissed"] : [])] as AttendanceStatus[]).map(
              (s) => <option key={s} value={s}>{STATUS_CHIP[s].label}</option>,
            )}
          </select>
        </div>

        <div>
          <label className="block mb-1 label">Personal notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add your notes about this show..."
            className="w-full resize-none field py-2.5"
          />
        </div>

        {attendance?.ticketPricePaid != null && (
          <div className="text-sm text-text-subtle">
            Ticket: {(attendance.ticketPricePaid / 100).toFixed(2)} {attendance.ticketPriceCurrency ?? ""}
          </div>
        )}

        {patch.isError && (
          <p className="text-sm text-accent-pink">
            {patch.error instanceof Error ? patch.error.message : "Failed to save."}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={patch.isPending || !hasChanges}
          className={clsx(
            "text-xs  px-4 py-1.5 rounded font-bold transition-opacity disabled:opacity-50",
            hasChanges
              ? "bg-accent-lime text-bg hover:opacity-90"
              : "bg-surface-2 text-text-muted"
          )}
        >
          {patch.isPending ? "Saving…" : hasChanges ? "Save changes" : "No changes"}
        </button>
      </div>
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

function LineupEditor({ concert, isAdmin = false }: { concert: ConcertDetail; isAdmin?: boolean }) {
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
    <div className="card p-4 sm:p-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="h-section">Lineup</h2>
        {isAdmin && (
          !editing ? (
            <button
              onClick={enterEdit}
              className="link-action"
            >
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {saveError && <span className="text-sm text-accent-pink">{saveError}</span>}
              <button onClick={cancelEdit} className="btn btn-sm btn-ghost">
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="btn btn-sm btn-primary"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )
        )}
      </div>

      {!editing ? (
        /* ── Read mode ── */
        <>
          {sortedArtists.length === 0 ? (
            <p className="text-sm text-text-subtle">No artists recorded.</p>
          ) : (
            // Billing order: top-billed artists get a lime avatar and a label, support sits quieter below.
            <ul className="-mx-2 space-y-1">
              {sortedArtists.map((a) => {
                const top = a.role === "headliner" || a.role === "co_headliner";
                return (
                  <li key={a.id}>
                    <Link to={`/artists/${a.slug}`}
                      className="group flex min-h-[56px] items-center gap-3 rounded-xl px-2 transition-colors hover:bg-white/[0.04]">
                      <span className={clsx(
                        "flex shrink-0 items-center justify-center rounded-full font-display",
                        top
                          ? "h-11 w-11 bg-accent-lime/15 text-base text-accent-lime ring-1 ring-accent-lime/40"
                          : "h-9 w-9 bg-surface-2 text-sm text-text-subtle ring-1 ring-white/5",
                      )}>
                        {initials(a.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={clsx("block truncate", top ? "text-base font-semibold" : "text-[15px] text-text-muted")}>{a.name}</span>
                        {top && <span className="block text-xs font-semibold uppercase tracking-wider text-accent-lime/80">{ROLE_LABEL[a.role] ?? "Headliner"}</span>}
                      </span>
                      <Chevron className="text-text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent-lime" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {concert.eventNotes && (
            <p className="meta mt-3">{concert.eventNotes}</p>
          )}
        </>
      ) : (
        /* ── Edit mode (admin only, but this branch only reached when editing is true) ── */
        <div>
          {localArtists.length === 0 ? (
            <p className="text-sm text-text-subtle mb-3">No artists yet — add one below.</p>
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
                      className="w-[128px] shrink-0 field h-11"
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>

                    <span className="flex-1 text-sm text-text-base truncate min-w-0">
                      {(a.role === "headliner" || a.role === "co_headliner") && (
                        <span className="text-accent-lime text-sm mr-1.5">★</span>
                      )}
                      {a.name}
                    </span>

                    <div className="flex items-center shrink-0">
                      <button
                        onClick={() => handleMoveUp(a.uid)}
                        disabled={!canMoveUp}
                        title="Move up within tier"
                        className="w-6 h-6 flex items-center justify-center text-xs text-text-subtle hover:text-text-base disabled:opacity-20 transition-colors"
                      >↑</button>
                      <button
                        onClick={() => handleMoveDown(a.uid)}
                        disabled={!canMoveDown}
                        title="Move down within tier"
                        className="w-6 h-6 flex items-center justify-center text-xs text-text-subtle hover:text-text-base disabled:opacity-20 transition-colors"
                      >↓</button>
                      <button
                        onClick={() => handleRemove(a.uid)}
                        title="Remove from lineup"
                        className="w-6 h-6 ml-1 link-action hover:text-accent-pink"
                      >×</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Add artist */}
          <div className="border-t border-border pt-3">
            <p className="mb-2 eyebrow">Add artist</p>
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
                    "field h-11 w-full",
                    addSelectedArtist && "border-accent-lime text-accent-lime",
                  )}
                />
                {showDropdown && !addSelectedArtist && (searching || addResults.length > 0) && (
                  <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-surface border border-border rounded-lg shadow-xl py-1 max-h-52 overflow-y-auto">
                    {searching ? (
                      <div className="px-3 py-2 text-sm text-text-subtle animate-pulse">Searching…</div>
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
                          <span className="text-sm text-text-subtle shrink-0">{ar.showCount} shows</span>
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
                className="w-[128px] shrink-0 field h-11"
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
                className="shrink-0 btn btn-sm btn-primary"
              >
                Add to lineup
              </button>
            </div>

            {/* "Did you mean?" fuzzy suggestion */}
            {suggestedArtist && (
              <p className="mt-2 text-sm text-text-muted">
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
              <p className="mt-1.5 text-sm text-text-subtle">
                ✓ {addSelectedArtist.name} selected — choose a role then click "Add to lineup"
              </p>
            ) : addQuery.trim() && !searching && addResults.length === 0 && !suggestedArtist ? (
              <p className="mt-1.5 text-sm text-text-subtle">
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
// Setlist section (attended shows only) — per-artist setlist lookups
// ─────────────────────────────────────────────────────────────────────────────

interface ArtistSetlistState {
  loaded: boolean;
  loading: boolean;
  result: SetlistfmResult | null;
  error: string | null;
  expanded: boolean;
  showUrlInput: boolean;
  urlInput: string;
  manualUrl: string | null; // For when API doesn't work - just store the link
}

/** Link to a setlist on setlist.fm from a stored bare id (or an older full URL). */
function setlistfmUrl(idOrUrl: string): string {
  return idOrUrl.includes("/") ? idOrUrl : `https://www.setlist.fm/setlist/x/${idOrUrl}.html`;
}

function SetlistSection({ concert, savedSetlists, isAdmin }: {
  concert: ConcertDetail;
  savedSetlists: Record<string, ConcertSetlistEntry>;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [unavailable, setUnavailable] = useState(false);
  const [artistStates, setArtistStates] = useState<Record<string, ArtistSetlistState>>(() => {
    // Saved setlists render straight from the songs cached in the database —
    // no setlist.fm call on page view.
    const initial: Record<string, ArtistSetlistState> = {};
    for (const [artistId, entry] of Object.entries(savedSetlists)) {
      if (entry.setlistfmId) {
        const bareId = entry.setlistfmId.match(/([a-z0-9]+)(?:\.html)?$/i)?.[1] ?? entry.setlistfmId;
        initial[artistId] = {
          loaded: true,
          loading: false,
          result: entry.sets.length > 0
            ? { id: bareId, artist: "", artistMbid: null, venue: "", city: "", country: "", date: concert.date, sets: entry.sets }
            : null,
          error: null,
          expanded: true,
          showUrlInput: false,
          urlInput: "",
          manualUrl: setlistfmUrl(entry.setlistfmId),
        };
      }
    }
    return initial;
  });

  const billed = [...concert.artists].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99),
  );
  // Visitors only see artists that have a cached setlist; admins see everyone to link more.
  const sortedArtists = isAdmin ? billed : billed.filter((a) => artistStates[a.id]?.result);

  if (sortedArtists.length === 0) return null;

  const getState = (artistId: string): ArtistSetlistState =>
    artistStates[artistId] ?? {
      loaded: false,
      loading: false,
      result: null,
      error: null,
      expanded: false,
      showUrlInput: false,
      urlInput: "",
      manualUrl: null,
    };

  const updateState = (artistId: string, update: Partial<ArtistSetlistState>) => {
    setArtistStates((prev) => ({
      ...prev,
      [artistId]: { ...getState(artistId), ...update },
    }));
  };

  const handleLoad = async (artist: ConcertArtist): Promise<void> => {
    updateState(artist.id, { loading: true, error: null });
    try {
      const res = await api.searchSetlistfm({ artist: artist.name, date: concert.date });
      if (!res.available) {
        setUnavailable(true);
        updateState(artist.id, { loaded: true, loading: false });
        return;
      }
      if (res.error) {
        updateState(artist.id, {
          loaded: true,
          loading: false,
          error: res.error === "rate_limited"
            ? "Rate limited — try again in a moment."
            : "Could not load setlist.",
        });
        return;
      }
      const found = res.results[0] ?? null;
      // Save the match straight away: the server links it to this show and
      // caches its songs, so it's still there after a refresh.
      if (found) {
        try {
          await api.saveSetlistLink(concert.id, artist.id, found.id);
          await qc.invalidateQueries({ queryKey: ["concerts", concert.id] });
        } catch {
          updateState(artist.id, { loaded: true, loading: false, result: found, expanded: true, error: "Found, but couldn't save it." });
          return;
        }
      }
      updateState(artist.id, {
        loaded: true,
        loading: false,
        result: found,
        expanded: true,
        manualUrl: found ? `https://www.setlist.fm/setlist/x/${found.id}.html` : null,
      });
    } catch {
      updateState(artist.id, { loading: false, error: "Could not reach setlist.fm." });
    }
  };

  const handleLoadFromUrl = async (artistId: string, url: string): Promise<void> => {
    if (!url.trim()) return;
    const trimmedUrl = url.trim();

    // Validate it looks like a setlist.fm URL
    if (!trimmedUrl.includes("setlist.fm")) {
      updateState(artistId, { error: "Please paste a setlist.fm URL" });
      return;
    }

    updateState(artistId, { loading: true, error: null });
    try {
      const res = await api.getSetlistfmById(trimmedUrl);

      // If API works and we got data, use it
      if (res.available && !res.error && res.result) {
        // Save full URL to backend
        await api.saveSetlistLink(concert.id, artistId, trimmedUrl);
        await qc.invalidateQueries({ queryKey: ["concerts", concert.id] });

        updateState(artistId, {
          loaded: true,
          loading: false,
          result: res.result,
          expanded: true,
          showUrlInput: false,
          urlInput: "",
          manualUrl: trimmedUrl, // linked — keeps Edit / Remove available
        });
        return;
      }

      // API didn't work (auth error, not configured, etc.) - fall back to link-only mode
      // Save full URL to backend anyway
      await api.saveSetlistLink(concert.id, artistId, trimmedUrl);
      await qc.invalidateQueries({ queryKey: ["concerts", concert.id] });

      updateState(artistId, {
        loaded: true,
        loading: false,
        result: null,
        manualUrl: trimmedUrl,
        showUrlInput: false,
        urlInput: "",
        error: null,
      });
    } catch {
      // Network error - still try to save the link
      try {
        await api.saveSetlistLink(concert.id, artistId, trimmedUrl);
        await qc.invalidateQueries({ queryKey: ["concerts", concert.id] });
      } catch {
        // Ignore save error
      }

      updateState(artistId, {
        loaded: true,
        loading: false,
        result: null,
        manualUrl: trimmedUrl,
        showUrlInput: false,
        urlInput: "",
        error: null,
      });
    }
  };

  const toggleExpanded = (artistId: string) => {
    updateState(artistId, { expanded: !getState(artistId).expanded });
  };

  const toggleUrlInput = (artistId: string) => {
    const state = getState(artistId);
    updateState(artistId, { showUrlInput: !state.showUrlInput, error: null });
  };

  const handleRemoveSetlist = async (artistId: string): Promise<void> => {
    if (!window.confirm("Remove this setlist link?")) return;
    try {
      await api.deleteSetlistLink(concert.id, artistId);
      await qc.invalidateQueries({ queryKey: ["concerts", concert.id] });
      updateState(artistId, {
        loaded: false,
        loading: false,
        result: null,
        error: null,
        expanded: false,
        showUrlInput: false,
        urlInput: "",
        manualUrl: null,
      });
    } catch {
      // Ignore errors
    }
  };

  const handleEditSetlist = (artistId: string) => {
    const state = getState(artistId);
    // Pre-fill the input with the current URL
    updateState(artistId, {
      showUrlInput: true,
      urlInput: state.manualUrl ?? "",
      error: null,
    });
  };

  // Check if any artist has been loaded
  const anyLoaded = Object.values(artistStates).some((s) => s.loaded);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="h-section">Setlists</h2>
      </div>

      {unavailable && (
        <p className="px-4 py-3 text-sm text-text-subtle italic">
          Setlist.fm not configured on this server.
        </p>
      )}

      {!unavailable && (
        <div className="divide-y divide-border">
          {sortedArtists.map((artist) => {
            const state = getState(artist.id);
            const setlistUrl = state.result
              ? `https://www.setlist.fm/setlist/x/${state.result.id}.html`
              : state.manualUrl;

            return (
              <div key={artist.id} className="px-4 py-3">
                {/* Artist row header */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {state.loaded && state.result && (
                      <button
                        onClick={() => toggleExpanded(artist.id)}
                        className="text-text-subtle hover:text-accent-lime transition-colors shrink-0"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          className={clsx("transition-transform", state.expanded && "rotate-90")}
                        >
                          <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                    <Link
                      to={`/artists/${artist.slug}`}
                      className="text-sm text-text-base hover:text-accent-lime transition-colors truncate"
                    >
                      {artist.name}
                    </Link>
                    <span className="text-sm text-text-subtle shrink-0">
                      {ROLE_LABEL[artist.role] ?? artist.role}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isAdmin && !state.loaded && !state.loading && !state.showUrlInput && (
                      <>
                        <button
                          onClick={() => void handleLoad(artist)}
                          className="link-action"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => toggleUrlInput(artist.id)}
                          className="link-action"
                          title="Paste setlist.fm URL"
                        >
                          URL
                        </button>
                      </>
                    )}
                    {state.loading && (
                      <span className="text-sm text-text-subtle animate-pulse">Loading…</span>
                    )}
                    {state.loaded && !state.result && !state.error && !state.showUrlInput && !state.manualUrl && (
                      <>
                        <span className="text-sm text-text-subtle italic">Not found</span>
                        <button
                          onClick={() => toggleUrlInput(artist.id)}
                          className="link-action"
                          title="Paste setlist.fm URL"
                        >
                          URL
                        </button>
                      </>
                    )}
                    {state.error && !state.showUrlInput && (
                      <>
                        <span className="text-sm text-accent-pink">{state.error}</span>
                        <button
                          onClick={() => toggleUrlInput(artist.id)}
                          className="link-action"
                          title="Paste setlist.fm URL"
                        >
                          URL
                        </button>
                      </>
                    )}
                    {state.showUrlInput && (
                      <button
                        onClick={() => toggleUrlInput(artist.id)}
                        className="text-xs text-accent-lime transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                    {setlistUrl && (
                      <a
                        href={setlistUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-action"
                        title={state.manualUrl && !state.result ? "Linked (click to view on setlist.fm)" : undefined}
                      >
                        setlist.fm ↗
                      </a>
                    )}
                    {isAdmin && state.manualUrl && !state.showUrlInput && (
                      <>
                        <button
                          onClick={() => handleEditSetlist(artist.id)}
                          className="link-action"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void handleRemoveSetlist(artist.id)}
                          className="link-action hover:text-accent-pink"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* URL input row */}
                {state.showUrlInput && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={state.urlInput}
                      onChange={(e) => updateState(artist.id, { urlInput: e.target.value })}
                      placeholder="Paste setlist.fm URL..."
                      className="flex-1 field h-11"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void handleLoadFromUrl(artist.id, state.urlInput);
                        }
                      }}
                    />
                    <button
                      onClick={() => void handleLoadFromUrl(artist.id, state.urlInput)}
                      disabled={!state.urlInput.trim() || state.loading}
                      className="btn btn-sm btn-primary"
                    >
                      {state.loading ? "Loading…" : "Load"}
                    </button>
                  </div>
                )}

                {/* Expanded setlist content */}
                {state.expanded && state.result && (
                  <div className="mt-3 pl-5">
                    {state.result.sets.length === 0 ? (
                      <p className="text-sm text-text-subtle italic">Setlist not recorded yet.</p>
                    ) : (
                      <div className="space-y-4">
                        {state.result.sets.map((set, i) => (
                          <div key={i}>
                            {(set.name ?? set.encore) && (
                              <p className="mb-1.5 eyebrow">
                                {set.encore ? `Encore${(set.encore ?? 1) > 1 ? ` ${set.encore}` : ""}` : set.name}
                              </p>
                            )}
                            <ol className="space-y-0.5">
                              {set.songs.map((song, j) => (
                                <li key={j} className="flex items-baseline gap-2">
                                  <span className="text-sm text-text-subtle w-4 text-right tabular-nums shrink-0">
                                    {j + 1}
                                  </span>
                                  <span className="text-sm text-text-muted">{song}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Hint when nothing loaded yet */}
      {isAdmin && !anyLoaded && !unavailable && (
        <p className="px-4 pb-3 text-sm text-text-subtle">
          Click "Load" to search setlist.fm, or "URL" to paste a link directly.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function ConcertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;

  const concertQuery = useQuery({
    queryKey: ["concerts", id],
    queryFn: () => api.getConcert(id!),
    enabled: !!id,
  });

  if (concertQuery.isLoading) return <Loading />;
  if (concertQuery.isError || !concertQuery.data) {
    return (
      <EmptyState tone="error" title="Show not found."
        action={<Link to="/shows"><Button variant="secondary">Back to Shows</Button></Link>} />
    );
  }

  const { concert, setlists: savedSetlists, festivalDays = [] } = concertQuery.data;

  // Sort artists: headliner first, then by role order, then by setOrder
  const sortedArtists = [...concert.artists].sort((a, b) => {
    const roleDiff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
    if (roleDiff !== 0) return roleDiff;
    return (a.setOrder ?? 99) - (b.setOrder ?? 99);
  });

  const isFestivalDay = concert.type === "festival_day" && !!concert.eventSeries;
  const attended = concert.status === "attended";
  const thisDay = festivalDays.find((d) => d.concertId === concert.id);
  const multiDay = festivalDays.length > 1;

  // Title: a festival day is named for its festival; a concert for its whole
  // bill in billing order ("Foo Fighters / Against Me!").
  const title =
    (isFestivalDay ? concert.eventSeries!.name : null) ??
    (billLine(sortedArtists.map((a) => a.name)) || null) ??
    concert.headlinerHint ??
    concert.eventSeries?.name ??
    "Unknown show";

  return (
    <div>
      <Hero
        back={{ to: "/shows", label: "Shows" }}
        imageUrl={concert.flyerUrl}
        eyebrow={
          isFestivalDay
            ? (thisDay && multiDay ? `Festival · Day ${thisDay.number} of ${festivalDays.length}` : "Festival")
            : (concert.eventSeries ? concert.eventSeries.name : "Concert")
        }
        title={title}
        accent={isFestivalDay ? "yellow" : "lime"}
        badge={(concert.attendance?.status ?? concert.status) && (
          <StatusBadge status={(concert.attendance?.status ?? concert.status)!} className="h-9 px-4 text-sm" />
        )}
        actions={
          <>
            {concert.eventSeries && (
              <Link to={`/festivals/${concert.eventSeries.slug}`}>
                <Button variant="secondary" className="rounded-full">{isFestivalDay ? "Festival lineup" : "Tour page"}</Button>
              </Link>
            )}
            {concert.sourceUrl && (
              <a href={concert.sourceUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" className="rounded-full">Event page ↗</Button>
              </a>
            )}
            {isAdmin && <FlyerControls key={concert.id} concert={concert} />}
          </>
        }
      >
        <p className="font-semibold text-text-base">
          <time dateTime={concert.date}>{fmtDateLong(concert.date)}</time>
          {concert.dateIsApproximate && <span className="ml-2 text-sm font-normal text-text-subtle">(approximate)</span>}
        </p>
        {concert.venue && (
          <p>
            <Link to={`/venues/${concert.venue.slug}`} className="hover:text-accent-lime">{concert.venue.name}</Link>
            {concert.venue.city && <span className="text-text-subtle"> · {concert.venue.city}</span>}
          </p>
        )}
      </Hero>

      {/* One column: the flyer lives in the banner above */}
      <div>
        <div className="min-w-0 space-y-6">
          {/* Concert info (admin only) */}
          {isAdmin && <ConcertMetaEditor key={concert.id} concert={concert} />}

          {/* Lineup */}
          <LineupEditor concert={concert} isAdmin={isAdmin} />

          {/* Festival days — jump between days, or out to the whole festival */}
          {isFestivalDay && multiDay && (
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3 px-0.5">
                <h2 className="h-section">Festival days</h2>
                <Link to={`/festivals/${concert.eventSeries!.slug}`} className="text-sm font-semibold text-text-muted hover:text-accent-lime">
                  Full lineup ›
                </Link>
              </div>
              <List>
                {festivalDays.map((d) => (
                  <div key={d.concertId} className={d.concertId === concert.id ? "bg-lime-950/30" : undefined}>
                    <EventRow
                      to={`/shows/${d.concertId}`}
                      date={d.date}
                      showYear={false}
                      title={d.concertId === concert.id ? `Day ${d.number} · you're here` : `Day ${d.number}`}
                      subtitle={billLine(d.lineup, 4, ", ") || "No lineup yet"}
                    />
                  </div>
                ))}
              </List>
            </section>
          )}

          {/* Attendance (admin only) */}
          {isAdmin && <AttendanceEditor key={concert.id} concertId={concert.id} attendance={concert.attendance} />}

          {/* Venue map */}
          {concert.venue?.lat != null && concert.venue.lng != null && (
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3 px-0.5">
                <h2 className="h-section">Location</h2>
                <Link to={`/venues/${concert.venue.slug}`} className="truncate text-sm font-semibold text-text-muted hover:text-accent-lime">
                  {concert.venue.name} ›
                </Link>
              </div>
              <VenueMap lat={concert.venue.lat} lng={concert.venue.lng} venueName={concert.venue.name} />
            </section>
          )}

          {/* Setlists and media only make sense for a show you were at. */}
          {attended ? (
            <>
              {/* Setlists: cached songs for everyone; linking tools for admins */}
              <SetlistSection key={concert.id} concert={concert} savedSetlists={savedSetlists} isAdmin={isAdmin} />

              {/* Photo gallery */}
              <div className="card p-4 sm:p-5">
                <PhotoGallery
                  concertId={concert.id}
                  concertDate={concert.date}
                  concertArtists={concert.artists}
                  isAdmin={isAdmin}
                />
              </div>
            </>
          ) : isAdmin ? (
            <p className="card p-4 text-sm text-text-muted sm:p-5">
              Setlists and media open up once this show is marked <span className="font-semibold text-accent-lime">Attended</span>.
            </p>
          ) : null}

          {/* Delete show (admin only) */}
          {isAdmin && (
            <div className="pt-4 border-t border-border">
              <button
                disabled={deleting}
                onClick={async () => {
                  if (!window.confirm("Delete this show permanently? This can't be undone.")) return;
                  setDeleting(true);
                  try {
                    await api.deleteConcert(concert.id);
                    navigate("/shows");
                  } catch {
                    setDeleting(false);
                  }
                }}
                className="text-sm font-semibold text-text-subtle hover:text-accent-pink transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete show"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
