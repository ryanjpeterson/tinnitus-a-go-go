import { useState, useEffect } from "react";
import { Link, Routes, Route, NavLink, useLocation, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import { RequireAdmin } from "./RequireAdmin";
import { YearReviewIndex, YearReviewPage } from "./YearReviewPage";

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

  // New root-level nav links
  const navLinks = [
    { to: "/shows", label: "Shows" },
    { to: "/artists",  label: "Artists" },
    { to: "/venues",   label: "Venues" },
    { to: "/festivals",label: "Festivals" },
    { to: "/map",      label: "Map" },
  ];

  return (
    <div className="min-h-full">
      {/* Global "Add show" modal — triggered by N shortcut from any page (admin only) */}
      {isAdmin && globalAddOpen && <AddConcertModal onClose={() => setGlobalAddOpen(false)} />}

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
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `relative flex items-center text-[15px] font-semibold transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-t after:transition-colors ${
                      isActive
                        ? "text-text-base after:bg-accent-lime"
                        : "text-text-muted hover:text-text-base after:bg-transparent"
                    }`
                  }
                >
                  {link.label}
                  {link.to === "/shows" && followupCount > 0 && isAdmin && (
                    <span className="ml-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-pink px-1.5 text-[11px] font-bold leading-none text-white">
                      {followupCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                <Link
                  to="/account"
                  aria-label="Account"
                  className="flex h-10 items-center gap-2 rounded-full border border-border pl-1 pr-1 transition-colors hover:border-accent-lime sm:pr-3.5"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-lime font-display text-sm text-bg">
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
          <Route path="/year" element={<YearReviewIndex />} />
          <Route path="/year/:year" element={<YearReviewPage />} />
          <Route path="/stats" element={<Navigate to="/" replace />} />
          <Route path="/account" element={user ? <AccountPage /> : <Navigate to="/login" replace />} />
          <Route path="/admin/imports" element={<RequireAdmin><ImportsPage /></RequireAdmin>} />

          {/* Fallback for unmatched paths */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden">
        <div className="grid grid-cols-5">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.to || location.pathname.startsWith(link.to + "/");
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={`relative flex h-16 flex-col items-center justify-center gap-1 transition-colors ${
                  isActive ? "text-accent-lime" : "text-text-muted active:text-text-base"
                }`}
              >
                {isActive && <span className="absolute inset-x-5 top-0 h-[3px] rounded-b bg-accent-lime" />}
                <span className="relative">
                  <BottomNavIcon name={link.label} />
                  {link.to === "/shows" && followupCount > 0 && isAdmin && (
                    <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full border-2 border-bg bg-accent-pink" />
                  )}
                </span>
                <span className="text-[11px] font-semibold">{link.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function BottomNavIcon({ name }: { name: string }) {
  switch (name) {
    case "Shows":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M8 2v4M16 2v4M3 10h18" />
        </svg>
      );
    case "Artists":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case "Venues":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case "Festivals":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case "Map":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      );
    default:
      return null;
  }
}
