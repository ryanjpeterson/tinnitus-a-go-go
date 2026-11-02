/** Show page: per-artist setlists from setlist.fm (attended shows). */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, type ConcertDetail, type ConcertArtist, type SetlistfmResult, type ConcertSetlistEntry } from "@/lib/api";
import { ROLE_LABEL, ROLE_ORDER } from "./roles";

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

export function SetlistSection({ concert, savedSetlists, isAdmin }: {
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
        <div className="divide-etched">
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
