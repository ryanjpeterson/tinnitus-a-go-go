/** Show page: the flyer — upload, replace from a URL, remove. */
import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type ConcertDetail } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Flyer section
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin flyer controls, shown with the show banner's actions: upload, import
 * from a URL, remove. The flyer itself is the banner image (tap for full size).
 */
export function FlyerControls({ concert }: { concert: ConcertDetail }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  // URL import state
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlImporting, setUrlImporting] = useState(false);

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
      {error && <p className="w-full text-sm text-highlight">{error}</p>}
    </>
  );
}
