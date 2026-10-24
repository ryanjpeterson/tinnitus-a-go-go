/**
 * Admin brand & theme — /admin/brand
 *
 * Pick a look from the categories — Everyday (dark, mid, light), Holidays, Countries, Provinces
 * and Sports (league and city tabs) — or search them all (each card is
 * a miniature of the app in that theme, with its colours as circles), then fine-tune the
 * colours with the inline picker. Accent and background are always set; highlight and
 * support can be left to the engine, which infers them from the others. Type: a sans, mono or
 * serif style for headings and for body text.
 * Everything previews live across the app; the save bar appears when there's
 * something unsaved, and leaving the page without saving puts the saved
 * theme back. The logo and favicon can be replaced with uploads.
 *
 * Tinnitus's copy of jimbo.ui's reference Brand page. Its own parts: the
 * TINNITUS / a-go-go logo in the theme previews and logo uploads (jimbo.ui
 * apps use header text and only a favicon upload).
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { applyTheme, BACKDROP_BASES, BACKDROPS, backdropCss, brandConfigLine, contrast, exportTheme, FONT_GROUPS, FONTS, fullTheme, importTheme, loadFonts, ownColours, themeHex, tokensCss, type Theme, THEME_KEYS } from "@/lib/theme";
import { ALL_TEMPLATES, sameTheme, TEMPLATE_SETS, type Template, type TemplateGroup } from "@/lib/themes";
import { useBrand } from "@/lib/useBrand";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ColorPicker";
import { Wordmark } from "@/components/Wordmark";
import { PageHeader, PillTabs, RangeField, SearchField, Sheet, Tabs } from "@/components/ui/kit";

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

const same = sameTheme;
/** Same colours *and* the same ones left to inference — what decides whether there's anything to save. */
const sameOwn = (a: Theme, b: Theme) => JSON.stringify(ownColours(a)).toUpperCase() === JSON.stringify(ownColours(b)).toUpperCase();

/** A flat circle of one colour with a slight outline in its darker shade — the circle motif, from hex shades. */
const orb = (c: Record<string, string>, k: string): React.CSSProperties =>
  ({ background: c[k], boxShadow: `inset 0 0 0 1px ${c[`${k}-darker`]}8c` });

/** A miniature of the app in a theme: top bar with the app's name, a label, a card, buttons, a date, an avatar. */
function ThemeCard({ name, vibe, theme: input, selected, onPick }: { name: string; vibe: string; theme: Theme; selected: boolean; onPick: () => void }) {
  const theme = fullTheme(input);
  const c = themeHex(theme);
  return (
    <button type="button" onClick={onPick} aria-pressed={selected}
      className={`group block w-full overflow-hidden rounded-2xl text-left transition-transform active:scale-[0.97] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-text-base ${selected ? "ring-[3px] ring-offset-2 ring-offset-bg" : "ring-1 ring-border hover:ring-text-subtle"}`}
      style={selected ? { ["--tw-ring-color" as string]: theme.accent } : undefined}>
      <div className="space-y-2.5 p-3" style={{ background: theme.background, color: c.text }}>
        <div className="flex items-center justify-between">
          <span className="font-display text-[15px] leading-none" style={{ color: theme.accent }}>
            TINNITUS<span className="block text-[10px]" style={{ color: theme.highlight }}>a-go-go</span>
          </span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold" style={{ ...orb(c, "support"), color: c["on-support"] }}>A</span>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: theme.support }}>On this day</p>
        <div className="rounded-lg p-2" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
          <div className="flex items-center gap-2">
            <span className="w-6 text-center leading-none">
              <span className="block text-[7px] font-bold" style={{ color: theme.highlight }}>JUL</span>
              <span className="block font-display text-sm">12</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block h-1.5 w-4/5 rounded-full" style={{ background: c.text }} />
              <span className="mt-1 block h-1.5 w-1/2 rounded-full" style={{ background: c["text-subtle"] }} />
            </span>
          </div>
        </div>
        <div className="flex gap-1.5">
          <span className="rounded-md px-2.5 py-1 text-[9px] font-bold" style={{ background: c.accent, boxShadow: `inset 0 0 0 1px ${c["accent-darker"]}8c`, color: c["on-accent"] }}>Save</span>
          <span className="rounded-md px-2.5 py-1 text-[9px] font-bold" style={{ background: c["surface-2"], color: c.text }}>Cancel</span>
        </div>
      </div>
      <div className="space-y-1.5 border-t border-border bg-surface px-3 py-2">
        {/* Every colour the theme uses, as circles; inferred ones have a dashed ring. */}
        <span className="flex items-center gap-1" aria-label={`Colours: ${(["accent", "highlight", "support", "background"] as const).map((k) => theme[k]).join(", ")}`}>
          {(["accent", "highlight", "support"] as const).map((k) => (
            <span key={k} title={input[k] ? k : `${k} (inferred)`}
              className={`h-4 w-4 rounded-full ${input[k] ? "" : "outline-dashed outline-1 outline-offset-1 outline-text-subtle"}`}
              style={orb(c, k)} />
          ))}
          <span title="background" className="h-4 w-4 rounded-full ring-1 ring-text-subtle/60" style={{ background: theme.background }} />
          {selected && <span className="ml-auto text-xs font-bold text-accent">✓</span>}
        </span>
        <span className="block min-w-0">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="block truncate text-[11px] text-text-subtle">{vibe}</span>
        </span>
      </div>
    </button>
  );
}

/** A labelled grid of theme tiles (two across on phones, three from sm). */
function TemplateGrid({ label, templates, draft, pick }: { label?: string; templates: Template[]; draft: Theme; pick: (t: Template) => void }) {
  return (
    <div className="space-y-2 pt-1">
      {label && <p className="eyebrow px-0.5">{label}</p>}
      {templates.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {templates.map((tpl) => (
            <ThemeCard key={`${tpl.name}|${tpl.vibe}`} {...tpl} selected={same(draft, tpl.theme)} onPick={() => pick(tpl)} />
          ))}
        </div>
      ) : (
        <p className="meta px-0.5">No looks match. Try a team, a place or a colour.</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type ColourKey = (typeof THEME_KEYS)[number];

const FIELDS: { key: ColourKey; label: string; short?: string; hint: string; swatches: string[] }[] = [
  { key: "accent", label: "Accent", hint: "Buttons, active tabs, “done” states, big numbers, the dot in the name",
    swatches: ["#A8FF3E", "#2EF2FF", "#F5FF2E", "#FF8A3D", "#B48CFF", "#3DFFC5", "#F2F2F2", "#1F7A4D"] },
  { key: "highlight", label: "Highlight", hint: "Dates, badges, map pins, warnings. Leave it out and it's inferred from the accent.",
    swatches: ["#FF3D6E", "#FF2ED1", "#FF5A1F", "#FF3D3D", "#FF7A59", "#FF5FA2", "#1E4FD7", "#FFC23D"] },
  { key: "support", label: "Support", hint: "Page labels, avatars, third place — the third voice. Leave it out and it's inferred from the others.",
    swatches: ["#2EC5FF", "#FFE53D", "#B98CFF", "#3DDCC8", "#5CF2B8", "#8CFF4F", "#1D4ED8", "#0F766E"] },
  { key: "background", label: "Background", short: "Page", hint: "The page — cards, borders and text follow it",
    swatches: ["#141416", "#000000", "#0A0A12", "#1A0F1F", "#071A1F", "#17110D", "#F6F4EF", "#F3EAD6"] },
];

export function BrandPage() {
  const qc = useQueryClient();
  const brand = useBrand();
  // The colours as set: highlight and support may be missing (inferred). `shown` fills them in.
  const [draft, setDraft] = useState<Theme>(ownColours(brand.theme));
  const shown = fullTheme(draft);
  const [editing, setEditing] = useState<ColourKey>("accent");
  // Open on the category (and sub-tab) holding the saved theme.
  const home = (() => {
    for (const s of TEMPLATE_SETS) for (const g of s.groups) if (g.templates.some((x) => same(x.theme, brand.theme))) return { set: s.label, group: g.label };
    return { set: TEMPLATE_SETS[0]!.label, group: "" };
  })();
  const [set, setSet] = useState(home.set);
  const [subTab, setSubTab] = useState(home.group);
  const [kit, setKit] = useState<"home" | "away" | "retro">("home");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const dirty = !sameOwn(draft, brand.theme);

  // Live preview while editing; leaving the page puts the saved theme back.
  useEffect(() => { applyTheme(draft); }, [draft]);
  // The type pickers show each style in its own face.
  useEffect(() => { loadFonts(Object.keys(FONTS)); }, []);
  const [fontTab, setFontTab] = useState<Partial<Record<"headings" | "body", string>>>({});
  const setBackdrop = (patch: NonNullable<Theme["backdrop"]>) => setDraft((d) => ownColours({ ...d, backdrop: { ...d.backdrop, ...patch } }));
  const setFonts = (patch: NonNullable<Theme["fonts"]>) => setDraft((d) => ownColours({ ...d, fonts: { ...d.fonts, ...patch } }));
  const saved = useRef(brand.theme);
  saved.current = brand.theme;
  useEffect(() => () => applyTheme(saved.current), []);

  const refresh = () => qc.invalidateQueries({ queryKey: ["brand"] });
  const save = async () => {
    setSaving(true);
    setNote(null);
    try {
      await api.setTheme(ownColours(draft));
      await refresh();
      setNote("Saved — everyone sees the new look.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  // Readability (WCAG): body text 4.5:1; accent / highlight 3:1 on the page; support 4.5:1 on cards; text on buttons 4.5:1.
  const hex = themeHex(draft);
  const warnings = [
    contrast(hex.text!, shown.background) < 4.5 && "Body text is hard to read on this background.",
    contrast(shown.accent, shown.background) < 3 && "The accent blends into the background.",
    contrast(shown.highlight, shown.background) < 3 && "The highlight blends into the background.",
    contrast(shown.support, hex.surface!) < 4.5 && "Support text is hard to read on cards.",
    contrast(hex["on-accent"]!, shown.accent) < 4.5 && "Button text is hard to read on the accent.",
  ].filter((w): w is string => !!w);

  const field = FIELDS.find((f) => f.key === editing)!;
  const current = TEMPLATE_SETS.find((s) => s.label === set)!;
  const group: TemplateGroup | undefined = current.groups.find((g) => g.label === subTab) ?? current.groups[0];
  // Sports tabs offer the kits their teams have: Home, Away and (some Toronto and Ottawa teams) Retro.
  const kits = (["home", "away", "retro"] as const).filter((k) => (current.tabs ? [group!] : current.groups).some((g) => g.templates.some((x) => x.kit === k)));
  // A template sets the colours; the type and backdrop you've chosen stay.
  const pick = (tpl: Template) => setDraft(ownColours({ ...tpl.theme, fonts: draft.fonts, backdrop: draft.backdrop }));
  // Lower-case and without accents, so "quebec" finds Québec.
  const plain = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const words = plain(query.trim()).split(/\s+/).filter(Boolean);
  // Search matches a look's name and vibe, and the category and tab it's in (so "nhl" or "toronto" works).
  const results = words.length
    ? ALL_TEMPLATES.filter((tpl) => {
        const where = TEMPLATE_SETS.flatMap((s) => s.groups.filter((g) => g.templates.includes(tpl)).map((g) => `${s.label} ${g.label}`)).join(" ");
        const hay = plain(`${tpl.name} ${tpl.vibe} ${tpl.kit ?? ""} ${where}`);
        return words.every((w) => hay.includes(w));
      })
    : [];
  const optional = editing === "highlight" || editing === "support";
  const inferred = optional && !draft[editing];

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-24">
      <PageHeader eyebrow="Admin" title="Brand & theme" />

      {/* 1. Templates */}
      <section className="space-y-3">
        <div className="px-0.5">
          <h2 className="h-section">Pick a look</h2>
          <p className="meta mt-1">Tap one to try it — the whole app changes. Nothing's saved until you say so.</p>
        </div>
        <SearchField value={query} onChange={setQuery} placeholder="Search — team, place, colour" />
        {query.trim() ? (
          <TemplateGrid label={`${results.length} ${results.length === 1 ? "look" : "looks"}`} templates={results} draft={draft} pick={pick} />
        ) : (
          <>
            <PillTabs value={set} onChange={(v) => { setSet(v); setSubTab(""); }}
              options={TEMPLATE_SETS.map((s) => ({ value: s.label, label: s.label }))} />
            {current.tabs && (
              <div className="rounded-xl border border-border bg-surface-2/60 p-2">
                <PillTabs value={group!.label} onChange={setSubTab} options={current.groups.map((g) => ({ value: g.label, label: g.label }))} />
              </div>
            )}
            {kits.length > 1 && (
              <Tabs value={kits.includes(kit) ? kit : "home"} onChange={setKit}
                options={kits.map((k) => ({ value: k, label: { home: "Home", away: "Away", retro: "Retro" }[k] }))} />
            )}
            {(current.tabs ? [group!] : current.groups).map((g) => (
              <TemplateGrid key={g.label} label={g.label !== set ? g.label : undefined} draft={draft} pick={pick}
                templates={kits.length > 1 ? g.templates.filter((x) => x.kit === (kits.includes(kit) ? kit : "home")) : g.templates} />
            ))}
          </>
        )}
      </section>

      {/* 2. Fine-tune */}
      <section className="space-y-3">
        <div className="px-0.5">
          <h2 className="h-section">Make it yours</h2>
          <p className="meta mt-1">Pick a colour to change, then drag. Two is enough: set the accent and background, and the rest is inferred.</p>
        </div>
        <div className="card space-y-5 p-4 sm:p-5">
          <div className="grid grid-cols-4 gap-2" role="tablist">
            {FIELDS.map((f) => {
              const active = f.key === editing;
              return (
                <button key={f.key} type="button" role="tab" aria-selected={active} onClick={() => setEditing(f.key)}
                  className={`flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border p-2 transition-colors ${active ? "border-text-base bg-surface-2" : "border-border hover:border-text-subtle"}`}>
                  <span className={`h-10 w-10 rounded-full sm:h-12 sm:w-12 ${draft[f.key] ? "" : "outline-dashed outline-2 outline-offset-2 outline-text-subtle"}`}
                    style={f.key === "background" ? { background: shown.background, boxShadow: `inset 0 0 0 1px ${hex.border}` } : orb(hex, f.key)} />
                  <span className="max-w-full truncate text-xs font-semibold">
                    {f.short ? <><span className="sm:hidden">{f.short}</span><span className="hidden sm:inline">{f.label}</span></> : f.label}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-text-muted">{field.hint}</p>
            {optional && (
              <button type="button" role="switch" aria-checked={inferred}
                onClick={() => setDraft((d) => (inferred ? { ...d, [editing]: shown[editing] } : ownColours({ ...d, [editing]: undefined })))}
                className={`chip shrink-0 ${inferred ? "border-support-700 bg-support-950 text-support" : ""}`}>
                {inferred ? "Inferred" : "Infer it"}
              </button>
            )}
          </div>
          {(!draft.highlight || !draft.support) && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-text-muted">Inferred colours</p>
              <Tabs value={draft.infer ?? "contrast"} onChange={(v) => setDraft((d) => ownColours({ ...d, infer: v }))}
                options={[{ value: "contrast", label: "Contrasting" }, { value: "tonal", label: "Tonal" }]} />
            </div>
          )}
          <ColorPicker
            value={shown[editing]}
            swatches={field.swatches}
            onChange={(hexValue) => setDraft((d) => ({ ...d, [editing]: hexValue }))}
          />
          <div className="grid gap-x-4 border-t border-border pt-3 sm:grid-cols-2">
            <RangeField label="Vibrancy" min={0.4} max={1.5} step={0.05} value={shown.vibrancy!}
              onChange={(v) => setDraft((d) => ownColours({ ...d, vibrancy: v }))} format={(v) => `${Math.round(v * 100)}%`} />
            <RangeField label="Contrast" min={0.8} max={1.6} step={0.05} value={shown.contrast!}
              onChange={(v) => setDraft((d) => ownColours({ ...d, contrast: v }))} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
          {warnings.length > 0 && (
            <div className="rounded-xl bg-highlight-950 px-3 py-2 text-sm text-highlight">
              {warnings.map((w) => <p key={w}>! {w}</p>)}
            </div>
          )}
        </div>
      </section>

      {/* 3. Backdrop */}
      <section className="space-y-3">
        <div className="px-0.5">
          <h2 className="h-section">Backdrop</h2>
          <p className="meta mt-1">An abstract pattern behind every page, in your colours. Cards stay solid on top, so text stays readable.</p>
        </div>
        <div className="card space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Backdrop pattern">
            {BACKDROPS.map((b) => {
              const active = shown.backdrop.pattern === b.key;
              const look = backdropCss({ ...draft, backdrop: { ...draft.backdrop, pattern: b.key } });
              return (
                <button key={b.key} type="button" role="radio" aria-checked={active} title={b.hint}
                  onClick={() => setBackdrop({ pattern: b.key })}
                  className={`overflow-hidden rounded-xl border text-left transition-colors ${active ? "border-accent ring-1 ring-accent" : "border-border hover:border-text-subtle"}`}>
                  <span className="block h-16" style={{ backgroundColor: shown.background, backgroundImage: look.image, backgroundSize: look.size, backgroundPosition: look.position, backgroundRepeat: look.repeat }} />
                  <span className={`block truncate border-t border-border bg-surface px-2 py-1.5 text-[11px] font-semibold ${active ? "text-accent" : "text-text-muted"}`}>{b.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-text-muted">Base</p>
            <Tabs value={shown.backdrop.base!} onChange={(v) => setBackdrop({ base: v })}
              options={BACKDROP_BASES.map((v) => ({ value: v, label: { solid: "Solid", gradient: "Gradient", glow: "Glow" }[v] }))} />
          </div>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <RangeField label="Strength" min={0} max={1} step={0.05} value={shown.backdrop.intensity!}
              onChange={(v) => setBackdrop({ intensity: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <RangeField label="Size" min={0.5} max={2} step={0.05} value={shown.backdrop.scale!}
              onChange={(v) => setBackdrop({ scale: v })} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </div>
      </section>

      {/* 4. Type */}
      <section className="space-y-3">
        <div className="px-0.5">
          <h2 className="h-section">Type</h2>
          <p className="meta mt-1">A font for headings and one for body text, each with its own weight and spacing. Decorative faces are for headings only.</p>
        </div>
        <div className="card space-y-5 p-4 sm:p-5">
          {(["headings", "body"] as const).map((part) => {
            const key = shown.fonts[part]!;
            const def = FONTS[key]!;
            const weightKey = part === "headings" ? "headingsWeight" : "bodyWeight";
            const trackKey = part === "headings" ? "headingsTracking" : "bodyTracking";
            const groups = FONT_GROUPS.filter((g) => part === "headings" || g !== "Decorative");
            const group = fontTab[part] ?? def.group;
            return (
              <div key={part} className="space-y-3">
                <p className="label">{part === "headings" ? "Headings" : "Body text"}</p>
                <PillTabs value={group} onChange={(g) => setFontTab((t) => ({ ...t, [part]: g }))} options={groups.map((g) => ({ value: g, label: g }))} />
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={part === "headings" ? "Headings font" : "Body font"}>
                  {Object.entries(FONTS).filter(([, f]) => f.group === group && (part === "headings" || f.body !== false)).map(([k, f]) => {
                    const active = key === k;
                    return (
                      <button key={k} type="button" role="radio" aria-checked={active} onClick={() => setFonts({ [part]: k })}
                        className={`flex min-w-0 flex-col items-center gap-1 rounded-xl border p-2.5 transition-colors ${active ? "border-accent bg-accent-950" : "border-border bg-surface-2 hover:border-text-subtle"}`}>
                        <span className="text-[24px] leading-none" style={{ fontFamily: f.css, fontWeight: part === "headings" ? Math.min(f.weights[1], 800) : 400 }}>Aa</span>
                        <span className={`max-w-full truncate text-[11px] font-semibold ${active ? "text-accent" : "text-text-muted"}`}>{f.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <RangeField label="Weight" min={def.weights[0] === def.weights[1] ? 300 : def.weights[0]} max={def.weights[0] === def.weights[1] ? 900 : def.weights[1]} step={50}
                    value={shown.fonts[weightKey]!} onChange={(v) => setFonts({ [weightKey]: v })} />
                  <RangeField label="Letter spacing" min={-0.05} max={0.15} step={0.005}
                    value={shown.fonts[trackKey]!} onChange={(v) => setFonts({ [trackKey]: v })}
                    format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(3)} em`} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <ShareTheme draft={draft} onImport={(t) => setDraft(ownColours(t))} />

      <BrandAssets logoUrl={brand.logoUrl} faviconUrl={brand.faviconUrl} onChange={refresh} />

      <Link to="/admin/style" className="card flex items-center justify-between gap-3 p-4 hover:border-accent">
        <span>
          <span className="eyebrow block">Reference</span>
          <span className="mt-0.5 block text-[15px] font-semibold">Style guide — every component in these colours</span>
        </span>
        <span className="text-text-subtle">›</span>
      </Link>

      {/* Save bar — floats above the tab bar while there's something unsaved */}
      {(dirty || note) && (
        <div className="fixed inset-x-0 z-40 flex justify-center px-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] sm:bottom-6">
          <div className="flex w-full max-w-md items-center gap-2 rounded-2xl border border-border bg-surface/95 p-2 pl-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{dirty ? "Unsaved look" : note}</p>
            {dirty ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => setDraft(ownColours(brand.theme))}>Undo</Button>
                <Button size="sm" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setNote(null)}>OK</Button>
            )}
          </div>
        </div>
      )}
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
        {error && <p className="text-sm text-accent-pink">{error}</p>}
      </div>
    </section>
  );
}

/**
 * Share this look: export the theme being edited (a theme file, the
 * brand.config.ts line, or tokens.css) and import one — so any jimbo.ui app's
 * Brand page, or the showcase used as a playground, can design a theme for
 * another app.
 */
function ShareTheme({ draft, onImport }: { draft: Theme; onImport: (t: Theme) => void }) {
  const [open, setOpen] = useState<"export" | "import" | null>(null);
  const [format, setFormat] = useState<"file" | "config" | "tokens">("file");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const out = format === "file" ? exportTheme(draft) : format === "config" ? brandConfigLine(draft) : tokensCss(draft);
  const fileName = { file: "theme.json", config: "brand.config.ts.txt", tokens: "tokens.css" }[format];

  const copy = async () => {
    try { await navigator.clipboard.writeText(out); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setError("Couldn't copy — select the text and copy it yourself."); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([out], { type: format === "file" ? "application/json" : "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const apply = (value: string) => {
    try { onImport(importTheme(value).theme); setOpen(null); setText(""); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Couldn't read that theme."); }
  };

  return (
    <section className="space-y-3">
      <div className="px-0.5">
        <h2 className="h-section">Share this look</h2>
        <p className="meta mt-1">Take this theme to another app, or bring one in. Importing previews it — save to keep it.</p>
      </div>
      <div className="card flex flex-wrap gap-2 p-4 sm:p-5">
        <button type="button" className="btn btn-secondary" onClick={() => { setError(null); setOpen("export"); }}>Export…</button>
        <button type="button" className="btn btn-secondary" onClick={() => { setError(null); setOpen("import"); }}>Import…</button>
      </div>

      {open === "export" && (
        <Sheet title="Export this look" subtitle="A theme file for another Brand page, or the lines for an app's code." onClose={() => setOpen(null)}>
          <div className="space-y-3 p-5">
            <Tabs value={format} onChange={setFormat}
              options={[{ value: "file", label: "Theme file" }, { value: "config", label: "brand.config" }, { value: "tokens", label: "tokens.css" }]} />
            <p className="meta">
              {format === "file" && "Import it on any jimbo.ui Brand page."}
              {format === "config" && "Replace the defaultTheme line in the app's src/lib/brand.config.ts."}
              {format === "tokens" && "Replace the app's src/styles/tokens.css, so its first paint matches."}
            </p>
            <textarea readOnly value={out} rows={10} onFocus={(e) => e.currentTarget.select()}
              className="field block w-full resize-y py-3 font-mono text-xs leading-relaxed" aria-label="Exported theme" />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button>
              <button type="button" className="btn btn-secondary" onClick={download}>Download {fileName}</button>
            </div>
            {error && <p className="text-sm text-highlight">{error}</p>}
          </div>
        </Sheet>
      )}

      {open === "import" && (
        <Sheet title="Import a look" subtitle="Paste a theme file, or choose one. It previews across the app until you save or leave." onClose={() => setOpen(null)}>
          <div className="space-y-3 p-5">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder='{ "kind": "jimbo-ui/theme", "theme": { "accent": "#…", "background": "#…" } }'
              className="field block w-full resize-y py-3 font-mono text-xs leading-relaxed" aria-label="Theme to import" />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => apply(text)}>Preview it</button>
              <label className="btn btn-secondary cursor-pointer">
                Choose a file…
                <input type="file" accept="application/json,.json,text/plain" className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void f.text().then(apply); }} />
              </label>
            </div>
            {error && <p className="text-sm text-highlight">{error}</p>}
          </div>
        </Sheet>
      )}
    </section>
  );
}
