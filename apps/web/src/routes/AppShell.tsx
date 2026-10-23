import { useState, useEffect, useCallback } from "react";
import { Link, Routes, Route, NavLink, useLocation, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePullToRefresh } from "@/lib/gestures";
import { onOutboxChange, outboxCount } from "@/lib/outbox";
import { UploadIndicator } from "@/components/UploadIndicator";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/Wordmark";
import { api } from "@/lib/api";
import { ConcertsPage } from "./ConcertsPage";
import { ConcertDetailPage } from "./ConcertDetailPage";
import { AddConcertModal } from "./AddConcertModal";
import { AccountPage } from "./AccountPage";
import { ArtistsPage } from "./ArtistsPage";
import { ArtistPage } from "./ArtistPage";
import { VenuesPage } from "./VenuesPage";
import { VenuePage } from "./VenuePage";
import { FestivalsPage } from "./FestivalsPage";
import { FestivalDetailPage } from "./FestivalDetailPage";
import { FollowUpPrompt } from "./FollowUpPrompt";
import { StatsPage } from "./StatsPage";
import { MapPage } from "./MapPage";
import { ImportsPage } from "./ImportsPage";
import { DataCleanupPage } from "./DataCleanupPage";
import { RequireAdmin } from "./RequireAdmin";
import { RequireAuth } from "./RequireAuth";
import { YearReviewIndex, YearReviewPage } from "./YearReviewPage";
import { SearchSheet } from "./SearchSheet";
import { TicketsPage } from "./TicketsPage";
import { BrandPage } from "./BrandPage";
import { StyleGuidePage } from "./StyleGuidePage";

// ─────────────────────────────────────────────────────────────────────────────
// AppShell — main layout for public content with optional auth
// ─────────────────────────────────────────────────────────────────────────────

export function AppShell() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [globalAddOpen, setGlobalAddOpen] = useState(false);

  const isAdmin = user?.isAdmin ?? false;

  // "n" anywhere outside an input opens the Add Show modal (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement).isContentEditable) return;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setGlobalAddOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isAdmin]);

  // Followup query - only for admin
  const followupQuery = useQuery({
    queryKey: ["concerts/followup"],
    queryFn: () => api.listFollowup(),
    staleTime: 60_000,
    enabled: isAdmin,
  });
  const followupCount = followupQuery.data?.total ?? 0;

  // Tabs. Home is the stats page; Map lives inside Venues (List | Map switch).
  // `also` are other paths that belong to the tab.
  const navLinks = [
    { to: "/",          label: "Home",      also: ["/year", "/tickets"] },
    { to: "/shows",     label: "Shows",     also: [] },
    { to: "/artists",   label: "Artists",   also: [] },
    { to: "/festivals", label: "Festivals", also: [] },
    { to: "/venues",    label: "Venues",    also: ["/map"] },
  ];
  const inTab = (link: (typeof navLinks)[number]): boolean => {
    const p = location.pathname;
    const under = (base: string) => p === base || p.startsWith(base + "/");
    return link.to === "/" ? p === "/" || link.also.some(under) : under(link.to) || link.also.some(under);
  };
  const [searchOpen, setSearchOpen] = useState(false);

  // Pull down at the top of any page to refresh what's on screen.
  const qc = useQueryClient();
  const refresh = useCallback(() => qc.refetchQueries({ type: "active" }), [qc]);
  const { pull, refreshing } = usePullToRefresh(refresh);

  // "/" opens search from anywhere (outside inputs), like most web apps.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="min-h-full overflow-x-clip">
      {/* Global "Add show" modal — triggered by N shortcut from any page (admin only) */}
      {isAdmin && globalAddOpen && <AddConcertModal onClose={() => setGlobalAddOpen(false)} />}

      {searchOpen && <SearchSheet onClose={() => setSearchOpen(false)} />}

      {/* Daily follow-up prompt — floats over all pages, shown once per day (admin only) */}
      {isAdmin && <FollowUpPrompt />}

      {/* Sticky app bar. Top padding clears the iOS status bar / notch in
          standalone mode (black-translucent). */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          <div className="flex h-full items-center gap-8">
            <Link to="/" aria-label="Home">
              <Wordmark size="sm" svg />
            </Link>
            {/* Desktop nav — bold links with an accent underline on the active one */}
            <nav className="hidden h-full items-stretch gap-6 sm:flex">
              {navLinks.filter((l) => l.to !== "/").map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={() =>
                    `relative flex items-center text-[15px] font-semibold transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-t after:transition-colors ${
                      inTab(link)
                        ? "text-text-base after:bg-accent-lime"
                        : "text-text-muted hover:text-text-base after:bg-transparent"
                    }`
                  }
                >
                  {link.label}
                  {link.to === "/shows" && followupCount > 0 && isAdmin && (
                    <span className="ml-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-pink px-1.5 text-[11px] font-bold leading-none text-on-highlight">
                      {followupCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              title="Search ( / )"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:border-accent-lime hover:text-text-base active:scale-95"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
            </button>
            {isAdmin && (
              <button
                onClick={() => setGlobalAddOpen(true)}
                aria-label="Add show"
                title="Add show ( N )"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-lime text-on-accent transition-transform hover:brightness-110 active:scale-95"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
            {isAdmin ? (
              <>
                <Link
                  to="/account"
                  aria-label="Account"
                  className="flex h-10 items-center gap-2 rounded-full border border-border pl-1 pr-1 transition-colors hover:border-accent-lime sm:pr-3.5"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-lime font-display text-sm text-on-accent">
                    {(user?.username ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden text-sm font-semibold sm:inline">{user?.username}</span>
                </Link>
                <Button variant="ghost" size="sm" onClick={signOut} className="hidden sm:inline-flex">
                  Sign out
                </Button>
              </>
            ) : (
              <Link to="/login">
                <Button variant="secondary" size="sm" className="h-10 rounded-full px-4">
                  Log in
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <OfflineBanner />

      {/* Background uploads — a progress ring in the corner while files send */}
      <UploadIndicator />

      {/* Pull-to-refresh indicator, sliding down from under the app bar */}
      {(pull > 0 || refreshing) && (
        <div aria-hidden className="pointer-events-none fixed inset-x-0 z-30 flex justify-center"
          style={{ top: `calc(3.5rem + env(safe-area-inset-top) + ${Math.round(Math.min(pull, 1) * 56)}px - 40px)` }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface shadow-xl"
            style={{ opacity: Math.min(pull, 1) }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              className={refreshing ? "animate-spin text-accent-lime" : pull >= 1 ? "text-accent-lime" : "text-text-muted"}
              style={refreshing ? undefined : { transform: `rotate(${pull * 270}deg)` }}>
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
            </svg>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
        <Routes>
          {/* Handle legacy /app/* and /concerts routes with redirects */}
          <Route path="/app/concerts" element={<Navigate to="/shows" replace />} />
          <Route path="/app/concerts/:id" element={<Navigate to={location.pathname.replace("/app/concerts", "/shows")} replace />} />
          <Route path="/concerts" element={<Navigate to="/shows" replace />} />
          <Route path="/concerts/:id" element={<Navigate to={location.pathname.replace("/concerts", "/shows")} replace />} />
          <Route path="/app/artists" element={<Navigate to="/artists" replace />} />
          <Route path="/app/artists/:slug" element={<Navigate to={location.pathname.replace("/app", "")} replace />} />
          <Route path="/app/venues" element={<Navigate to="/venues" replace />} />
          <Route path="/app/venues/:slug" element={<Navigate to={location.pathname.replace("/app", "")} replace />} />
          <Route path="/app/festivals" element={<Navigate to="/festivals" replace />} />
          <Route path="/app/festivals/:slug" element={<Navigate to={location.pathname.replace("/app", "")} replace />} />
          <Route path="/app/stats" element={<Navigate to="/" replace />} />
          <Route path="/app/account" element={<Navigate to="/account" replace />} />
          <Route path="/app/*" element={<Navigate to="/shows" replace />} />

          {/* Main content routes */}
          <Route path="/" element={<StatsPage />} />
          <Route path="/shows" element={<ConcertsPage />} />
          <Route path="/shows/:id" element={<ConcertDetailPage />} />
          <Route path="/artists" element={<ArtistsPage />} />
          <Route path="/artists/:slug" element={<ArtistPage />} />
          <Route path="/venues" element={<VenuesPage />} />
          <Route path="/venues/:slug" element={<VenuePage />} />
          <Route path="/festivals" element={<FestivalsPage />} />
          <Route path="/festivals/:slug" element={<FestivalDetailPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/year" element={<YearReviewIndex />} />
          <Route path="/year/:year" element={<YearReviewPage />} />
          <Route path="/stats" element={<Navigate to="/" replace />} />
          {/* Waits for the session check, so opening /account directly doesn't bounce to sign-in */}
          <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
          <Route path="/admin/imports" element={<RequireAdmin><ImportsPage /></RequireAdmin>} />
          <Route path="/admin/data" element={<RequireAdmin><DataCleanupPage /></RequireAdmin>} />
          <Route path="/admin/brand" element={<RequireAdmin><BrandPage /></RequireAdmin>} />
          <Route path="/admin/style" element={<RequireAdmin><StyleGuidePage /></RequireAdmin>} />

          {/* Fallback for unmatched paths */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Mobile tab bar — a floating, frosted dock above the home indicator.
          Content scrolls under it (and fades out behind it). */}
      {location.pathname !== "/map" && (
        <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-[calc(6rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-bg via-bg/70 to-transparent sm:hidden" />
      )}
      <nav
        aria-label="Main"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 select-none px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:hidden"
      >
        <div className="pointer-events-auto mx-auto grid max-w-md grid-cols-5 gap-1 rounded-[28px] border border-white/10 bg-surface/75 p-1.5 shadow-[0_10px_40px_-8px_rgba(0,0,0,0.75)] ring-1 ring-black/40 backdrop-blur-2xl backdrop-saturate-150">
          {navLinks.map((link) => {
            const isActive = inTab(link);
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                aria-current={isActive ? "page" : undefined}
                onClick={(e) => {
                  // Tapping the tab you're on scrolls back to the top, like a native app.
                  if (location.pathname === link.to) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                className={`relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-[22px] transition-[background-color,color,transform] duration-200 active:scale-[0.92] ${
                  isActive ? "bg-accent-lime/15 text-accent-lime" : "text-text-muted active:bg-white/5"
                }`}
              >
                <span className="relative">
                  <BottomNavIcon name={link.label} active={isActive} />
                  {link.to === "/shows" && followupCount > 0 && isAdmin && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-pink px-1 text-[10px] font-bold leading-none text-on-highlight ring-2 ring-surface">
                      {followupCount > 9 ? "9+" : followupCount}
                    </span>
                  )}
                </span>
                <span className={`text-[10.5px] tracking-wide ${isActive ? "font-bold" : "font-semibold"}`}>{link.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function BottomNavIcon({ name, active = false }: { name: string; active?: boolean }) {
  // Active icons get a soft fill, like the filled SF Symbols in iOS tab bars.
  const fill = active ? "currentColor" : "none";
  const fillOpacity = active ? 0.22 : undefined;
  switch (name) {
    case "Home":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill={fill} fillOpacity={fillOpacity} stroke="currentColor" strokeWidth={active ? 2.2 : 1.9} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "Shows":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill={fill} fillOpacity={fillOpacity} stroke="currentColor" strokeWidth={active ? 2.2 : 1.9} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M8 2v4M16 2v4M3 10h18" />
        </svg>
      );
    case "Artists":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill={fill} fillOpacity={fillOpacity} stroke="currentColor" strokeWidth={active ? 2.2 : 1.9} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case "Venues":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill={fill} fillOpacity={fillOpacity} stroke="currentColor" strokeWidth={active ? 2.2 : 1.9} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case "Festivals":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill={fill} fillOpacity={fillOpacity} stroke="currentColor" strokeWidth={active ? 2.2 : 1.9} strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case "Map":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill={fill} fillOpacity={fillOpacity} stroke="currentColor" strokeWidth={active ? 2.2 : 1.9} strokeLinecap="round" strokeLinejoin="round">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      );
    default:
      return null;
  }
}

/** Shown while the device is offline, and while edits made offline are waiting to be sent. */
function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [waiting, setWaiting] = useState(() => outboxCount());
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const unsub = onOutboxChange(setWaiting);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); unsub(); };
  }, []);
  if (!offline && waiting === 0) return null;
  const changes = `${waiting} change${waiting === 1 ? "" : "s"}`;
  return (
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 border-b border-yellow-800/60 bg-yellow-950/95 px-4 py-2 text-center text-sm font-semibold text-yellow-200 backdrop-blur sm:top-[calc(4rem+env(safe-area-inset-top))]">
      {offline
        ? <>Offline — showing what's saved on this device.{waiting > 0 ? ` ${changes} will sync when you're back online.` : " Attendance changes will sync later."}</>
        : <>Syncing {changes} made offline…</>}
    </div>
  );
}
