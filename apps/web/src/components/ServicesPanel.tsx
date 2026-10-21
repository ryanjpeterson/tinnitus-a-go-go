import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

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

export function ServicesPanel() {
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
    <div className="card p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="eyebrow">
          {isDev ? "Dev services" : "Services"}
        </div>
        <div className={`ml-auto flex items-center gap-1.5 text-xs  ${apiUp ? "text-emerald-400" : apiChecking ? "text-text-subtle" : "text-accent-pink"}`}>
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
                  <div className={`text-sm  font-medium ${svc.color} group-hover:underline`}>{svc.name}</div>
                  <div className="text-xs text-text-subtle truncate mt-0.5">{svc.desc}</div>
                  <div className="text-xs text-text-subtle opacity-50 truncate">{svc.url}</div>
                </div>
                <span className="ml-auto text-text-subtle opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0 mt-0.5">↗</span>
              </a>
            ) : (
              <div className="h-full flex items-start gap-3 rounded border border-border bg-surface-2 px-3 py-2.5 opacity-60">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${svc.dot}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-muted">{svc.name}</div>
                  <div className="text-xs text-text-subtle truncate mt-0.5">{svc.desc}</div>
                  <div className="text-xs truncate mt-0.5 invisible">—</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
