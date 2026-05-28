import { useState, useEffect } from "react";
import { Link, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/Wordmark";
import { api } from "@/lib/api";
import { ConcertsPage } from "./ConcertsPage";
import { ConcertDetailPage } from "./ConcertDetailPage";
import { ConcertGridPage } from "./ConcertGridPage";
import { ArtistsPage } from "./ArtistsPage";
import { ArtistPage } from "./ArtistPage";
import { VenuesPage } from "./VenuesPage";
import { VenuePage } from "./VenuePage";
import { FestivalsPage } from "./FestivalsPage";
import { SeriesPage } from "./SeriesPage";
import { FollowUpPrompt } from "./FollowUpPrompt";
import { StatsPage } from "./StatsPage";

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
// AppShell
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Mobile nav overlay
// ─────────────────────────────────────────────────────────────────────────────

function MobileMenu({
  open,
  onClose,
  navLinks,
  followupCount,
  username,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  navLinks: { to: string; label: string }[];
  followupCount: number;
  username: string;
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
        <Link to="/app" onClick={onClose}>
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
            {link.to === "/app/concerts" && followupCount > 0 && (
              <span className="min-w-[22px] h-5 rounded-full bg-accent-pink text-white text-[11px] font-mono font-bold flex items-center justify-center px-1.5 leading-none">
                {followupCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer — username + sign out */}
      <div className="px-5 py-5 border-t border-border flex items-center justify-between">
        <span className="text-sm text-text-muted font-mono">
          @<span className="text-text-base">{username}</span>
        </span>
        <Button variant="secondary" size="sm" onClick={() => { onSignOut(); onClose(); }}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AppShell
// ─────────────────────────────────────────────────────────────────────────────

export function AppShell() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const statsQuery = useQuery({
    queryKey: ["concerts/stats"],
    queryFn: () => api.concertStats(),
    staleTime: 60_000,
  });

  const stats = statsQuery.data;
  const totalShows = stats?.total ?? 0;
  const attended = stats?.stats.attended ?? 0;

  const followupQuery = useQuery({
    queryKey: ["concerts/followup"],
    queryFn: () => api.listFollowup(),
    staleTime: 60_000,
  });
  const followupCount = followupQuery.data?.total ?? 0;

  const navLinks = [
    { to: "/app/concerts", label: "The Damage" },
    { to: "/app/artists",  label: "Artists" },
    { to: "/app/venues",   label: "Venues" },
    { to: "/app/festivals",label: "Festivals" },
    { to: "/app/stats",    label: "Stats" },
  ];

  return (
    <div className="min-h-full">
      {/* Daily follow-up prompt — floats over all pages, shown once per day */}
      <FollowUpPrompt />

      {/* Mobile full-screen nav overlay */}
      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        navLinks={navLinks}
        followupCount={followupCount}
        username={user?.username ?? ""}
        onSignOut={signOut}
      />

      <header className="flex items-center justify-between border-b border-border px-5 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-6">
          <Link to="/app">
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
                {link.to === "/app/concerts" && followupCount > 0 && (
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
          <span className="text-text-muted">
            @<span className="text-text-base">{user?.username}</span>
          </span>
          <Button variant="secondary" size="sm" onClick={signOut}>
            Sign out
          </Button>
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
          {/* Follow-up dot badge on hamburger */}
          {followupCount > 0 && (
            <span className="absolute top-1.5 right-1 w-2 h-2 rounded-full bg-accent-pink" />
          )}
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Routes>
          <Route path="concerts" element={<ConcertsPage />} />
          <Route path="concerts/grid" element={<ConcertGridPage />} />
          <Route path="concerts/:id" element={<ConcertDetailPage />} />
          <Route path="artists" element={<ArtistsPage />} />
          <Route path="artists/:slug" element={<ArtistPage />} />
          <Route path="venues" element={<VenuesPage />} />
          <Route path="venues/:slug" element={<VenuePage />} />
          <Route path="festivals" element={<FestivalsPage />} />
          <Route path="festivals/:slug" element={<SeriesPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route
            path="*"
            element={
              <Dashboard
                username={user?.username ?? ""}
                isAdmin={user?.isAdmin ?? false}
                totalShows={totalShows}
                attended={attended}
                upcoming={stats?.stats.attending ?? 0}
                interested={stats?.stats.interested ?? 0}
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
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
        Your concert log, {username ? `@${username}` : "loading…"}
      </p>

      <div className="grid gap-4 sm:grid-cols-3 mb-10">
        <Link to="/app/concerts?status=attended" className="group">
          <Tile title="Attended" value={String(attended)} sub={`${totalShows} logged total`} accent="lime" />
        </Link>
        <Link to="/app/concerts?status=attending" className="group">
          <Tile title="Upcoming" value={String(upcoming)} sub="on the books" accent="yellow" />
        </Link>
        <Link to="/app/concerts?status=interested" className="group">
          <Tile title="Watchlist" value={String(interested)} sub="interested · not committed" accent="purple" />
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6 mb-6">
        <div className="text-xs uppercase tracking-wider text-text-muted mb-3 font-mono">Quick actions</div>
        <div className="flex flex-wrap gap-3">
          <Link to="/app/concerts" className="text-sm text-accent-lime hover:underline font-mono">
            → Browse The Damage
          </Link>
          <Link to="/app/concerts?sort=date_asc&status=attending" className="text-sm text-text-muted hover:text-text-base font-mono">
            → Upcoming shows
          </Link>
          <Link to="/app/stats" className="text-sm text-text-muted hover:text-text-base font-mono">
            → Stats
          </Link>
        </div>
      </div>

      {isAdmin && (
        <div className="rounded-lg border border-border bg-surface p-6 mb-6">
          <div className="text-xs uppercase tracking-wider text-text-muted mb-3 font-mono">Admin</div>
          <div className="flex flex-wrap gap-3">
            <Link to="/app/admin/imports" className="text-accent-lime hover:underline font-mono text-sm">
              → CSV imports
            </Link>
            <Link to="/app/admin/copy" className="text-accent-lime hover:underline font-mono text-sm">
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
        v2026.05.28 · concert log active
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
