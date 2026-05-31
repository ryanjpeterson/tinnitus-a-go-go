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
import { TimelinePage } from "./TimelinePage";

// ─────────────────────────────────────────────────────────────────────────────
// Services panel — shown to admin users in all environments.
// URLs are driven by VITE_ env vars so dev and prod each show the right links.
// ─────────────────────────────────────────────────────────────────────────────

type ServiceEntry = {
  name: string;
  url: string | null;
  desc: string;
  color: string;
  dot: string;
};

function buildServices(isDev: boolean): ServiceEntry[] {
  const minoConsoleUrl = import.meta.env.VITE_MINIO_CONSOLE_URL as string | undefined;
  const mailpitUrl     = import.meta.env.VITE_MAILPIT_URL as string | undefined;

  const services: ServiceEntry[] = [
    // API health — always shown via relative proxy path (works in dev + prod)
    {
      name:  "API",
      url:   "/api/health",
      desc:  "Fastify · health check",
      color: "text-emerald-400",
      dot:   "bg-emerald-400",
    },
  ];

  // MinIO console — shown when VITE_MINIO_CONSOLE_URL is set
  if (minoConsoleUrl) {
    services.push({
      name:  "MinIO",
      url:   minoConsoleUrl,
      desc:  "Object storage console",
      color: "text-sky-400",
      dot:   "bg-sky-400",
    });
  }

  // Mailpit — shown when VITE_MAILPIT_URL is set (dev only in practice)
  if (mailpitUrl) {
    services.push({
      name:  "Mailpit",
      url:   mailpitUrl,
      desc:  "Catches all outbound email",
      color: "text-violet-400",
      dot:   "bg-violet-400",
    });
  }

  // Dev-only info items (no URL)
  if (isDev) {
    services.push(
      { name: "Postgres", url: null, desc: "localhost:5432 · user: tagg", color: "text-text-muted", dot: "bg-text-subtle" },
      { name: "Redis",    url: null, desc: "localhost:6379 · no auth",    color: "text-text-muted", dot: "bg-text-subtle" },
    );
  }

  return services;
}

function ServicesPanel() {
  const isDev = import.meta.env.DEV;

  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn:  () => api.health(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const apiUp       = healthQuery.data?.ok === true;
  const apiChecking = healthQuery.isLoading;
  const services    = buildServices(isDev);

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="text-xs uppercase tracking-wider text-text-muted font-mono">
          {isDev ? "Dev services" : "Services"}
        </div>
        <div className={`ml-auto flex items-center gap-1.5 text-xs font-mono ${apiUp ? "text-emerald-400" : apiChecking ? "text-text-subtle" : "text-accent-pink"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${apiUp ? "bg-emerald-400" : apiChecking ? "bg-text-subtle animate-pulse" : "bg-accent-pink"}`} />
          {apiUp ? "API up" : apiChecking ? "checking…" : "API down"}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((svc) => (
          <div key={svc.name} className="h-full">
            {svc.url ? (
              <a
                href={svc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group h-full flex items-start gap-3 rounded border border-border bg-surface-2 px-3 py-2.5 hover:border-accent-lime transition-colors"
              >
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${svc.dot} opacity-70 group-hover:opacity-100`} />
                <div className="min-w-0">
                  <div className={`text-sm font-mono font-medium ${svc.color} group-hover:underline`}>{svc.name}</div>
                  <div className="text-xs text-text-subtle truncate mt-0.5">{svc.desc}</div>
                  <div className="text-xs text-text-subtle opacity-50 font-mono truncate">{svc.url}</div>
                </div>
                <span className="ml-auto text-text-subtle opacity-0 group-hover:opacity-100 transition-opacity text-xs font-mono shrink-0 mt-0.5">↗</span>
              </a>
            ) : (
              <div className="h-full flex items-start gap-3 rounded border border-border bg-surface-2 px-3 py-2.5 opacity-60">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${svc.dot}`} />
                <div className="min-w-0">
                  <div className="text-sm font-mono font-medium text-text-muted">{svc.name}</div>
                  <div className="text-xs text-text-subtle truncate mt-0.5">{svc.desc}</div>
                  <div className="text-xs font-mono truncate mt-0.5 invisible">—</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile nav overlay
// ─────────────────────────────────────────────────────────────────────────────

function MobileMenu({
  open,
  onClose,
  navLinks,
  followupCount,
  username,
  isAdmin,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  navLinks: { to: string; label: string }[];
  followupCount: number;
  username: string | null;
  isAdmin: boolean;
  onSignOut: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg sm:hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <Link to="/" onClick={onClose}>
          <Wordmark size="sm" svg />
        </Link>
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="p-2 -mr-1 text-text-muted hover:text-text-base transition-colors"
        >
          {/* X icon */}
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="4" x2="18" y2="18"/>
            <line x1="18" y1="4" x2="4" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Nav links — large tap targets */}
      <nav className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-1">
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            onClick={onClose}
            className={({ isActive }) =>
              `relative flex items-center justify-between px-4 py-4 rounded-lg text-xl font-display uppercase tracking-wide transition-colors ${
                isActive
                  ? "bg-surface-2 text-accent-lime"
                  : "text-text-muted hover:bg-surface hover:text-text-base"
              }`
            }
          >
            {link.label}
            {link.to === "/shows" && followupCount > 0 && isAdmin && (
              <span className="min-w-[22px] h-5 rounded-full bg-accent-pink text-white text-[11px] font-mono font-bold flex items-center justify-center px-1.5 leading-none">
                {followupCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-5 border-t border-border flex items-center justify-between gap-3">
        {isAdmin && username ? (
          <>
            <Link
              to="/account"
              onClick={onClose}
              className="text-sm text-text-muted hover:text-accent-lime transition-colors font-mono"
            >
              @<span>{username}</span>
            </Link>
            <Button variant="secondary" size="sm" onClick={() => { onSignOut(); onClose(); }}>
              Sign out
            </Button>
          </>
        ) : (
          <Link to="/login" onClick={onClose} className="ml-auto">
            <Button variant="secondary" size="sm">
              Log in
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AppShell — main layout for public content with optional auth
// ─────────────────────────────────────────────────────────────────────────────

export function AppShell() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
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

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Stats query - only fetch if logged in (for dashboard)
  const statsQuery = useQuery({
    queryKey: ["concerts/stats"],
    queryFn: () => api.concertStats(),
    staleTime: 60_000,
    enabled: !!user,
  });

  const stats = statsQuery.data;
  const totalShows = stats?.total ?? 0;
  const attended = stats?.stats.attended ?? 0;

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
    { to: "/timeline", label: "Timeline" },
  ];

  return (
    <div className="min-h-full">
      {/* Global "Add show" modal — triggered by N shortcut from any page (admin only) */}
      {isAdmin && globalAddOpen && <AddConcertModal onClose={() => setGlobalAddOpen(false)} />}

      {/* Daily follow-up prompt — floats over all pages, shown once per day (admin only) */}
      {isAdmin && <FollowUpPrompt />}

      {/* Mobile full-screen nav overlay */}
      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        navLinks={navLinks}
        followupCount={followupCount}
        username={user?.username ?? null}
        isAdmin={isAdmin}
        onSignOut={signOut}
      />

      <header className="flex items-center justify-between border-b border-border px-5 py-3 sm:px-6 sm:py-4">
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

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="sm:hidden relative p-2 -mr-1 text-text-muted hover:text-text-base transition-colors"
        >
          {/* Hamburger icon */}
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="19" y2="6"/>
            <line x1="3" y1="11" x2="19" y2="11"/>
            <line x1="3" y1="16" x2="19" y2="16"/>
          </svg>
          {/* Follow-up dot badge on hamburger (admin only) */}
          {followupCount > 0 && isAdmin && (
            <span className="absolute top-1.5 right-1 w-2 h-2 rounded-full bg-accent-pink" />
          )}
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
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
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/stats" element={<Navigate to="/" replace />} />
          <Route path="/account" element={user ? <AccountPage /> : <Navigate to="/login" replace />} />

          {/* Fallback for unmatched paths */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard (admin-only)
// ─────────────────────────────────────────────────────────────────────────────

function Dashboard({
  username,
  isAdmin,
  totalShows,
  attended,
  upcoming,
  interested,
}: {
  username: string;
  isAdmin: boolean;
  totalShows: number;
  attended: number;
  upcoming: number;
  interested: number;
}) {
  return (
    <div>
      <h1 className="font-display uppercase text-4xl mb-1">The damage</h1>
      <p className="text-text-muted text-sm mb-8">
        Your show log, {username ? `@${username}` : "loading…"}
      </p>

      <div className="grid gap-4 sm:grid-cols-3 mb-10">
        <Link to="/shows?status=attended" className="group">
          <Tile title="Attended" value={String(attended)} sub={`${totalShows} logged total`} accent="lime" />
        </Link>
        <Link to="/shows?status=attending" className="group">
          <Tile title="Upcoming" value={String(upcoming)} sub="on the books" accent="yellow" />
        </Link>
        <Link to="/shows?status=interested" className="group">
          <Tile title="Watchlist" value={String(interested)} sub="interested · not committed" accent="purple" />
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6 mb-6">
        <div className="text-xs uppercase tracking-wider text-text-muted mb-3 font-mono">Quick actions</div>
        <div className="flex flex-wrap gap-3">
          <Link to="/shows" className="text-sm text-accent-lime hover:underline font-mono">
            → Browse Shows
          </Link>
          <Link to="/shows?sort=date_asc&status=attending" className="text-sm text-text-muted hover:text-text-base font-mono">
            → Upcoming shows
          </Link>
          <Link to="/stats" className="text-sm text-text-muted hover:text-text-base font-mono">
            → Stats
          </Link>
        </div>
      </div>

      {isAdmin && (
        <div className="rounded-lg border border-border bg-surface p-6 mb-6">
          <div className="text-xs uppercase tracking-wider text-text-muted mb-3 font-mono">Admin</div>
          <div className="flex flex-wrap gap-3">
            <Link to="/admin/imports" className="text-accent-lime hover:underline font-mono text-sm">
              → CSV imports
            </Link>
            <Link to="/admin/copy" className="text-accent-lime hover:underline font-mono text-sm">
              → Copy editor
            </Link>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="mb-6">
          <ServicesPanel />
        </div>
      )}

      <p className="mt-8 text-xs text-text-subtle font-mono">
        v2026.05.31 · show log active
      </p>
    </div>
  );
}

function Tile({
  title,
  value,
  sub,
  accent,
}: {
  title: string;
  value: string;
  sub: string;
  accent: "lime" | "yellow" | "purple" | "pink" | "muted";
}) {
  const accentClass =
    accent === "lime"   ? "group-hover:border-accent-lime"  :
    accent === "yellow" ? "group-hover:border-yellow-500"   :
    accent === "purple" ? "group-hover:border-purple-500"   :
    accent === "pink"   ? "group-hover:border-accent-pink"  :
    "";

  const valueClass =
    accent === "lime"   ? "text-accent-lime"  :
    accent === "yellow" ? "text-yellow-400"   :
    accent === "purple" ? "text-purple-400"   :
    "text-text-base";

  return (
    <div className={`rounded-lg border border-border bg-surface p-6 transition-colors ${accentClass}`}>
      <div className="text-xs uppercase tracking-wider text-text-muted font-mono">{title}</div>
      <div className={`mt-2 font-mono text-4xl ${valueClass}`}>{value}</div>
      <div className="mt-1 text-xs text-text-subtle">{sub}</div>
    </div>
  );
}
