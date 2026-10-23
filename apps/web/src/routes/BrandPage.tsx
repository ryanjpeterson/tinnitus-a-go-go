/**
 * Admin brand & theme — /admin/brand
 *
 * Four colours drive the whole UI (lib/theme.ts): accent, highlight,
 * background and logo. Changes preview live across the app while you're on
 * this page and are only kept when saved. Logo and favicon can be replaced
 * with uploads (they otherwise follow the colours).
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { applyTheme, contrast, DEFAULT_THEME, isHex, themeHex, type Theme } from "@/lib/theme";
import { useBrand } from "@/lib/useBrand";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/Wordmark";
import { LinkCard, PageHeader, StatTile, StatusBadge } from "@/components/ui/kit";

const FIELDS: { key: keyof Theme; label: string; hint: string }[] = [
  { key: "accent", label: "Accent", hint: "Buttons, active tabs, “attended”, the logo's second colour" },
  { key: "highlight", label: "Highlight", hint: "Dates, “on this day”, map pins, alerts" },
  { key: "background", label: "Background", hint: "Page colour — cards, borders and text follow it (a light colour switches to dark text)" },
  { key: "logo", label: "Logo", hint: "The logo's main colour and the favicon" },
];

const PRESETS: { name: string; theme: Theme }[] = [
  { name: "Tinnitus", theme: DEFAULT_THEME },
  { name: "Ocean", theme: { accent: "#3DFFE8", highlight: "#FF8C3A", background: "#0E1620", logo: "#3DFFE8" } },
  { name: "Ember", theme: { accent: "#FFB23D", highlight: "#FF3D3D", background: "#17120F", logo: "#FF6B3D" } },
  { name: "Violet", theme: { accent: "#B48CFF", highlight: "#FF5FA2", background: "#13111A", logo: "#FF5FA2" } },
  { name: "Daylight", theme: { accent: "#1F7A4D", highlight: "#D6336C", background: "#F6F4EF", logo: "#D6336C" } },
];

export function BrandPage() {
  const qc = useQueryClient();
  const brand = useBrand();
  const [draft, setDraft] = useState<Theme>(brand.theme);
  const [text, setText] = useState<Theme>(brand.theme);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const dirty = (Object.keys(draft) as (keyof Theme)[]).some((k) => draft[k].toUpperCase() !== brand.theme[k].toUpperCase());

  // Live preview while editing; leaving the page puts the saved theme back.
  useEffect(() => { applyTheme(draft); }, [draft]);
  const saved = useRef(brand.theme);
  saved.current = brand.theme;
  useEffect(() => () => applyTheme(saved.current), []);

  const set = (key: keyof Theme, value: string) => {
    setText((t) => ({ ...t, [key]: value }));
    const v = value.startsWith("#") ? value : `#${value}`;
    if (isHex(v)) setDraft((d) => ({ ...d, [key]: v.toUpperCase() }));
  };
  const load = (t: Theme) => { setDraft(t); setText(t); };

  const refresh = () => qc.invalidateQueries({ queryKey: ["brand"] });
  const save = async () => {
    setSaving(true);
    setNote(null);
    try {
      await api.setTheme(draft);
      await refresh();
      setNote("Saved — everyone sees the new colours.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };
  const resetDefaults = async () => {
    if (!window.confirm("Go back to the default colours for everyone?")) return;
    await api.resetTheme();
    await refresh();
    load(DEFAULT_THEME);
    setNote("Back to the default colours.");
  };

  // Readability checks (WCAG): body text needs 4.5:1; an accent fill or line needs 3:1.
  const hex = themeHex(draft);
  const checks = [
    { label: "Text on background", ratio: contrast(hex.text!, draft.background), min: 4.5 },
    { label: "Accent on background", ratio: contrast(draft.accent, draft.background), min: 3 },
    { label: "Highlight on background", ratio: contrast(draft.highlight, draft.background), min: 3 },
    { label: "Text on accent buttons", ratio: contrast(hex["on-accent"]!, draft.accent), min: 4.5 },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Admin" title="Brand & theme" />

      <section className="card space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="h-section">Colours</h2>
          <p className="meta mt-1">Everything else — cards, borders, text, tints, the map, share images — is worked out from these four.</p>
        </div>
        <div className="space-y-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-3">
              <input type="color" value={draft[f.key]} onChange={(e) => set(f.key, e.target.value)}
                className="h-12 w-12 shrink-0 cursor-pointer rounded-xl border border-border bg-transparent p-1" aria-label={`${f.label} colour`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{f.label}</span>
                <span className="block text-xs text-text-subtle">{f.hint}</span>
              </span>
              <input value={text[f.key]} onChange={(e) => set(f.key, e.target.value.trim())} maxLength={7} spellCheck={false}
                className={`field h-11 w-28 font-mono text-sm uppercase ${isHex(text[f.key].startsWith("#") ? text[f.key] : `#${text[f.key]}`) ? "" : "border-accent-pink"}`} />
            </label>
          ))}
        </div>

        <div>
          <p className="eyebrow mb-2">Presets</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.name} onClick={() => load(p.theme)}
                className="flex h-10 items-center gap-2 rounded-full border border-border bg-surface-2 pl-1.5 pr-3.5 text-sm font-semibold hover:border-accent-lime">
                <span className="flex -space-x-1">
                  {[p.theme.background, p.theme.accent, p.theme.highlight].map((c, i) => (
                    <span key={i} className="h-6 w-6 rounded-full border border-black/30" style={{ background: c }} />
                  ))}
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {checks.map((c) => (
            <p key={c.label} className={`rounded-xl px-3 py-2 text-sm ${c.ratio >= c.min ? "bg-surface-2 text-text-muted" : "bg-rose-950 text-accent-pink"}`}>
              {c.ratio >= c.min ? "✓" : "!"} {c.label} <span className="font-mono">{c.ratio.toFixed(1)}:1</span>
              {c.ratio < c.min && <span className="block text-xs">Hard to read — aim for {c.min}:1 or more.</span>}
            </p>
          ))}
        </div>

        {note && <p className="text-sm font-semibold text-accent-lime">{note}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save colours"}</Button>
          <Button variant="secondary" disabled={!dirty} onClick={() => load(brand.theme)}>Discard changes</Button>
          <Button variant="ghost" onClick={() => void resetDefaults()}>Back to defaults</Button>
        </div>
      </section>

      {/* A slice of the UI in the draft colours */}
      <section className="space-y-3">
        <h2 className="h-section px-0.5">Preview</h2>
        <div className="card space-y-4 p-4 sm:p-5">
          <Wordmark size="md" />
          <p className="eyebrow text-accent-pink">On this day</p>
          <p className="h-page">The damage</p>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Shows attended" value={171} accent="lime" />
            <StatTile label="Artists seen" value={412} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <StatusBadge status="attended" />
            <StatusBadge status="attending" />
          </div>
          <input className="field h-11 w-full" placeholder="A text field" />
        </div>
        <LinkCard to="/admin/style" eyebrow="Reference" title="Style guide" sub="Every component in the current colours" />
      </section>

      <BrandAssets logoUrl={brand.logoUrl} faviconUrl={brand.faviconUrl} onChange={refresh} />
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

  const row = (asset: "logo" | "favicon", label: string, hint: string, url: string | null, preview: React.ReactNode) => (
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
    <section className="card space-y-4 p-4 sm:p-5">
      <div>
        <h2 className="h-section">Logo & favicon</h2>
        <p className="meta mt-1">The built-in ones follow the colours above. Upload SVG, PNG or WebP (under 1 MB) to replace either.</p>
      </div>
      {row("logo", "Logo", "Built-in — logo + accent colours", logoUrl,
        logoUrl ? <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" /> : <Wordmark size="sm" />)}
      {row("favicon", "Favicon", "Built-in — recoloured from the theme", faviconUrl,
        <img src={faviconUrl ?? (document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ?? "/favicon.svg")} alt="" className="h-10 w-10" />)}
      {error && <p className="text-sm text-accent-pink">{error}</p>}
    </section>
  );
}
