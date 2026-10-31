/**
 * jimbo-ui config — /jimbo-ui
 *
 * The one place for every brand, theme and style guide option, the same in
 * every app: Theme, Brand, Style guide, About, and an optional App tab for the
 * app's own additions. Reached from the app's settings or admin area, never a
 * dock tab. The app passes `canConfigure`: its admin check when it has auth
 * (the server checks admin on every save too), or `true` when it has none.
 * Without it the section redirects home and its link doesn't render.
 *
 * All panels stay mounted so an unsaved look follows you from Theme into the
 * Style guide; the save bar floats over every tab.
 *
 * Tinnitus's copy of jimbo.ui's reference. Its own part: the Brand tab shows
 * the TINNITUS / a-go-go logo and takes a logo upload as well as a favicon.
 */

import { useState, type ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BRAND } from "@/lib/brand.config";
import { JIMBO_APP, JIMBO_UI } from "@/lib/jimbo";
import { useBrand } from "@/lib/useBrand";
import { Wordmark } from "@/components/Wordmark";
import { Badge, LinkCard, PageHeader, PillTabs } from "@/components/ui/kit";
import { ThemePanel } from "./config/ThemePanel";
import { StyleGuidePanel } from "./config/StyleGuidePanel";
import { JimboUpdates, useJimboUpdates } from "./config/UpdatesPanel";

type Tab = "theme" | "brand" | "style" | "about" | "app";

export function JimboConfigPage({ canConfigure, app }: { canConfigure: boolean; app?: { label?: string; content: ReactNode } }) {
  const [params, setParams] = useSearchParams();
  if (!canConfigure) return <Navigate to="/" replace />;
  const tabs: { value: Tab; label: string }[] = [
    { value: "theme", label: "Theme" }, { value: "brand", label: "Brand" }, { value: "style", label: "Style guide" }, { value: "about", label: "About" },
    ...(app ? [{ value: "app" as const, label: app.label ?? "App" }] : []),
  ];
  const tab = (tabs.find((t) => t.value === params.get("tab"))?.value ?? "theme") as Tab;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Settings" title="jimbo-ui config" />
      <PillTabs value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} options={tabs} />
      <div hidden={tab !== "theme"}><ThemePanel /></div>
      <div hidden={tab !== "brand"}><BrandPanel /></div>
      <div hidden={tab !== "style"}><StyleGuidePanel /></div>
      <div hidden={tab !== "about"}><AboutPanel /></div>
      {app && <div hidden={tab !== "app"}>{app.content}</div>}
    </div>
  );
}

/**
 * The entry in the app's settings or admin area; renders nothing for people
 * who can't configure. Says so when a newer jimbo-ui release is out.
 */
export function JimboConfigLink({ canConfigure }: { canConfigure: boolean }) {
  const { updates } = useJimboUpdates(canConfigure);
  if (!canConfigure) return null;
  return (
    <LinkCard to={updates ? "/jimbo-ui?tab=about" : "/jimbo-ui"} eyebrow="Look" title="jimbo-ui config"
      sub={updates ? <Badge tone="yellow" dot>jimbo-ui {updates.latest} is out</Badge> : "Theme, brand and style guide"} />
  );
}

function BrandPanel() {
  const brand = useBrand();
  const qc = useQueryClient();
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="px-0.5">
          <h2 className="h-section">Name</h2>
          <p className="meta mt-1">The TINNITUS / a-go-go logo in the accent and highlight, or your upload below.</p>
        </div>
        <div className="card space-y-4 p-5">
          {(["sm", "md", "lg"] as const).map((s) => <div key={s}><Wordmark size={s} /></div>)}
          <p className="meta">{BRAND.name}</p>
        </div>
      </section>
      <BrandAssets logoUrl={brand.logoUrl} faviconUrl={brand.faviconUrl} onChange={() => qc.invalidateQueries({ queryKey: ["brand"] })} />
    </div>
  );
}

function AboutPanel() {
  const { releases } = useJimboUpdates();
  const a = JIMBO_APP;
  const behind = a?.version && a.version !== JIMBO_UI.version;
  const local = a?.components?.local ?? [];
  const rows: [string, ReactNode][] = [
    ["jimbo-ui", `${JIMBO_UI.version}${behind ? ` (jimbo-ui.json says ${a!.version})` : ""}`],
    ["Access", a?.auth === "admin" ? "Admins only" : a?.auth === "none" ? "Anyone using the app" : "—"],
    ["Registered", a?.registry?.registered ?? "Not in the registry yet"],
    ["Last audited", a?.registry?.audited ?? "—"],
    ["Kit components used", a?.components?.uses?.length ?? "—"],
    ["Own components", a ? `${local.filter((l) => l.kind === "domain").length} domain, ${local.filter((l) => l.kind === "candidate").length} candidates` : "—"],
  ];
  return (
    <div className="space-y-4">
      <JimboUpdates releases={releases} />
      <div className="card divide-y divide-border">
        {rows.map(([k, v]) => (
          <p key={k} className="flex min-h-[56px] items-center justify-between gap-4 px-4 py-3">
            <span className="text-[15px] font-semibold">{k}</span><span className="text-right text-sm text-text-muted">{v}</span>
          </p>
        ))}
      </div>
      <a href={JIMBO_UI.showcase} target="_blank" rel="noreferrer" className="card flex items-center justify-between gap-3 p-4 hover:border-accent">
        <span><span className="eyebrow block">Showcase</span><span className="mt-0.5 block text-[15px] font-semibold">See this release in action</span></span>
        <span className="text-text-subtle">›</span>
      </a>
    </div>
  );
}

/** Upload or remove a custom logo and favicon. */
function BrandAssets({ logoUrl, faviconUrl, onChange }: { logoUrl: string | null; faviconUrl: string | null; onChange: () => Promise<unknown> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (asset: "logo" | "favicon", file: File | undefined) => {
    if (!file) return;
    setBusy(asset);
    setError(null);
    try { await api.uploadBrandAsset(asset, file); await onChange(); }
    catch (err) { setError(err instanceof Error ? err.message : "Upload failed."); }
    finally { setBusy(null); }
  };
  const remove = async (asset: "logo" | "favicon") => {
    setBusy(asset);
    try { await api.removeBrandAsset(asset); await onChange(); }
    finally { setBusy(null); }
  };

  const row = (asset: "logo" | "favicon", label: string, hint: string, url: string | null, preview: ReactNode) => (
    <div className="flex items-center gap-4">
      <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2 p-2">{preview}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{label}</p>
        <p className="text-xs text-text-subtle">{url ? "Custom upload" : hint}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className={`btn btn-sm btn-secondary cursor-pointer ${busy === asset ? "pointer-events-none opacity-50" : ""}`}>
            {busy === asset ? "Uploading…" : url ? "Replace" : "Upload"}
            <input type="file" accept="image/svg+xml,image/png,image/webp,image/jpeg" className="sr-only"
              onChange={(e) => { void upload(asset, e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {url && <button onClick={() => void remove(asset)} className="btn btn-sm btn-ghost">Use built-in</button>}
        </div>
      </div>
    </div>
  );

  return (
    <section className="space-y-3">
      <div className="px-0.5">
        <h2 className="h-section">Logo & favicon</h2>
        <p className="meta mt-1">The built-in ones follow your colours. Upload SVG, PNG or WebP (under 1 MB) to replace either.</p>
      </div>
      <div className="card space-y-4 p-4 sm:p-5">
        {row("logo", "Logo", "Built-in — accent + highlight colours", logoUrl,
          logoUrl ? <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" /> : <Wordmark size="sm" />)}
        {row("favicon", "Favicon", "Built-in — recoloured from the theme", faviconUrl,
          <img src={faviconUrl ?? (document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ?? "/favicon.svg")} alt="" className="h-10 w-10" />)}
        {error && <p className="text-sm text-highlight">{error}</p>}
      </div>
    </section>
  );
}
