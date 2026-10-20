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

      {/* Top padding clears the iOS status bar / notch in standalone mode (black-translucent) */}
      <header className="flex items-center justify-between border-b border-border px-5 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:py-4 sm:pt-[calc(1rem+env(safe-area-inset-top))]">
        <div className="flex items-center gap-6">
          <Link to="/">
            <Wordmark size="sm" svg />
          </Link>
          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `relative px-3 py-1.5 text-sm rounded transition-colors ${
                    isActive
                      ? "text-text-base bg-surface-2"
                      : "text-text-muted hover:text-text-base"
                  }`
                }
              >
                {link.label}
                {link.to === "/shows" && followupCount > 0 && isAdmin && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-accent-pink text-white text-[10px] font-mono font-bold flex items-center justify-center px-1 leading-none">
                    {followupCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Desktop right side */}
        <div className="hidden sm:flex items-center gap-3 text-sm">
          {isAdmin ? (
            <>
              <Link to="/account" className="text-text-muted hover:text-accent-lime transition-colors">
                @<span>{user?.username}</span>
              </Link>
              <Button variant="secondary" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <Link to="/login">
              <Button variant="secondary" size="sm">
                Log in
              </Button>
            </Link>
          )}
        </div>

        {/* Mobile: just show login/account since nav is at bottom */}
        <div className="sm:hidden flex items-center gap-2 text-sm">
          {isAdmin ? (
            <Link to="/account" className="text-text-muted hover:text-accent-lime transition-colors text-xs font-mono">
              @{user?.username}
            </Link>
          ) : (
            <Link to="/login">
              <Button variant="secondary" size="sm">
                Log in
              </Button>
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:pb-8 sm:px-6 sm:py-8">
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
          <Route path="/stats" element={<Navigate to="/" replace />} />
          <Route path="/account" element={user ? <AccountPage /> : <Navigate to="/login" replace />} />

          {/* Fallback for unmatched paths */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-bg border-t border-border px-2 pb-[env(safe-area-inset-bottom)] z-40">
        <div className="flex items-center justify-around py-2">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.to || location.pathname.startsWith(link.to + "/");
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                  isActive ? "text-accent-lime" : "text-text-muted"
                }`}
              >
                <BottomNavIcon name={link.label} />
                <span className="text-[10px] font-mono">{link.label}</span>
                {link.to === "/shows" && followupCount > 0 && isAdmin && (
                  <span className="absolute top-1 right-3 w-2 h-2 rounded-full bg-accent-pink" />
                )}
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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M8 2v4M16 2v4M3 10h18" />
        </svg>
      );
    case "Artists":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case "Venues":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case "Festivals":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case "Map":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      );
    default:
      return null;
  }
}
