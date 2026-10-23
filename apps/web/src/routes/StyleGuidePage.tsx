/**
 * Style guide — /admin/style
 *
 * Every shared building block, rendered with the real code in the current
 * theme. The written rules live in the jimbo-ui guide; this page is the living
 * picture of them, so it changes whenever the kit does.
 *
 * Tinnitus's copy of jimbo.ui's reference Style guide, with its own pieces:
 * the TINNITUS logo, attendance statuses and the Venues list/map switch.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/Wordmark";
import { ColorPicker } from "@/components/ColorPicker";
import {
  DateBlock, EmptyState, EntityRow, EventRow, LinkCard, List, ListGroupLabel, Loading, MediaCard, PageHeader, Pager,
  PillTabs, RankedList, SearchField, Section, SelectField, Sheet, StatGrid, StatTile, StatusBadge, Tabs, ThemeDots, VenueViewSwitch,
} from "@/components/ui/kit";
import { FONT_STYLES, THEME_KEYS, themeHex } from "@/lib/theme";
import { useBrand } from "@/lib/useBrand";

const TOKENS: { name: string; use: string }[] = [
  { name: "bg", use: "Page" },
  { name: "bg-deep", use: "Card gradient end" },
  { name: "surface", use: "Cards, sheets" },
  { name: "surface-2", use: "Fields, chips, hover" },
  { name: "border", use: "Lines and outlines" },
  { name: "text", use: "Body text" },
  { name: "text-muted", use: "Secondary text" },
  { name: "text-subtle", use: "Labels, hints" },
  { name: "accent", use: "Primary actions, active state" },
  { name: "accent-hover", use: "Accent on hover" },
  { name: "accent-light", use: "Lighter shade (depth, glows)" },
  { name: "accent-dark", use: "Darker shade (depth, shadows)" },
  { name: "on-accent", use: "Text on accent fills" },
  { name: "accent-950", use: "Accent wash (done chip)" },
  { name: "accent-700", use: "Accent outline" },
  { name: "highlight", use: "Dates, badges, alerts" },
  { name: "on-highlight", use: "Text on highlight fills" },
  { name: "highlight-dark", use: "Darker highlight" },
  { name: "highlight-950", use: "Highlight wash (warnings)" },
  { name: "support", use: "Page labels, avatars, third place" },
  { name: "on-support", use: "Text on support fills" },
  { name: "support-900", use: "Support wash (avatars)" },
];

const ORB = { accent: "orb-accent", highlight: "orb-highlight", support: "orb-support" } as const;
const LIT = { accent: "lit-accent", highlight: "lit-highlight", support: "lit-support" } as const;

const STATUSES = ["attended", "attending", "interested", "missed", "cancelled"] as const;

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="px-0.5">
        <h2 className="h-section">{title}</h2>
        {note && <p className="meta mt-1">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export function StyleGuidePage() {
  const { theme: own, colors: theme } = useBrand();
  const hex = themeHex(theme);
  const [tab, setTab] = useState<"one" | "two">("one");
  const [pill, setPill] = useState<"a" | "b" | "c">("a");
  const [select, setSelect] = useState<"newest" | "oldest">("newest");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(2);
  const [sheet, setSheet] = useState(false);
  const [picked, setPicked] = useState(false);
  const [colour, setColour] = useState("#A8FF3E");

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Admin · reference" title="Style guide" />
      <p className="meta -mt-6 max-w-xl">The shared building blocks, live in the current theme. The rules are in the jimbo-ui guide.</p>

      <Block title="Brand" note="The TINNITUS logo (accent over highlight, unless one is uploaded) and its colours as circles — two to four; a dashed ring means inferred.">
        <div className="card flex flex-wrap items-center gap-6 p-5">
          <Wordmark size="lg" />
          <div className="flex flex-wrap gap-3">
            {THEME_KEYS.map((k) => (
              <div key={k} className="text-center">
                <div className={`mx-auto h-14 w-14 rounded-full ${k === "background" ? "border border-border" : ORB[k]} ${own[k] ? "" : "outline-dashed outline-2 outline-offset-2 outline-text-subtle"}`}
                  style={k === "background" ? { background: theme[k] } : undefined} />
                <p className="mt-1.5 text-xs font-semibold capitalize">{k}</p>
                <p className="font-mono text-[11px] text-text-subtle">{own[k] ? theme[k] : "inferred"}</p>
              </div>
            ))}
          </div>
        </div>
      </Block>

      <Block title="Shades and depth" note="Each brand colour comes lighter and darker, as a solid fill with a slight outline, and as washes. Use them for depth, never as new colours.">
        <div className="card space-y-4 p-5">
          {(["accent", "highlight", "support"] as const).map((k) => (
            <div key={k} className="flex items-center gap-3">
              <p className="w-20 shrink-0 text-xs font-semibold capitalize">{k}</p>
              <div className="flex items-center">
                {["lighter", "light", "", "dark", "darker"].map((v) => (
                  <span key={v} className="-ml-1.5 h-8 w-8 rounded-full ring-2 ring-surface first:ml-0"
                    style={{ background: `rgb(var(--c-${k}${v ? `-${v}` : ""}))` }} title={`${k}${v ? `-${v}` : ""}`} />
                ))}
              </div>
              <span className={`${LIT[k]} ml-auto whitespace-nowrap rounded-control px-3 py-1 text-xs font-bold`}>Solid fill</span>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Glass and orbs" note="Frosted .glass over the page's colour orbs; .orb-* circles and ThemeDots are the motif — use them here and there, not everywhere.">
        <div className="relative overflow-hidden rounded-2xl p-5">
          <span className="orb-accent absolute -left-6 -top-8 h-32 w-32" />
          <span className="orb-highlight absolute right-6 top-6 h-20 w-20" />
          <span className="orb-support absolute -bottom-10 left-1/3 h-28 w-28" />
          <div className="card-glass relative flex items-center gap-3 p-4">
            <ThemeDots size={14} />
            <p className="text-sm font-semibold">.card-glass over orbs</p>
          </div>
        </div>
      </Block>

      <Block title="Colour tokens" note="Derived from the brand colours. Use these classes, never raw hex (bg-surface, text-text-muted, bg-accent/15 …).">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TOKENS.map((t) => (
            <div key={t.name} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5">
              <span className="h-9 w-9 shrink-0 rounded-lg border border-border" style={{ background: `rgb(var(--c-${t.name}))` }} />
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs font-semibold">{t.name}</span>
                <span className="block truncate text-[11px] text-text-subtle">{hex[t.name]} · {t.use}</span>
              </span>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Type" note={`Headings in ${FONT_STYLES[theme.fonts.headings!].label.toLowerCase()}, body in ${FONT_STYLES[theme.fonts.body!].label.toLowerCase()} — the theme picks sans, mono or serif for each. Tabular figures throughout.`}>
        <div className="card space-y-3 p-5">
          <p className="eyebrow">.eyebrow — label above a title</p>
          <p className="h-page">.h-page — Page title</p>
          <p className="h-section">.h-section — Section title</p>
          <p className="text-[15px]">Body — 15px Inter. Plain sentences, sentence case.</p>
          <p className="meta">.meta — secondary line, 14px muted</p>
          <p className="font-display text-5xl text-accent">128</p>
        </div>
      </Block>

      <Block title="Buttons" note="Pill-shaped. One primary action per view; secondary and ghost for the rest.">
        <div className="card flex flex-wrap items-center gap-2 p-5">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
          <a className="link-action">.link-action</a>
        </div>
      </Block>

      <Block title="Fields and filters">
        <div className="card space-y-3 p-5">
          <SearchField value={q} onChange={setQ} placeholder="SearchField" />
          <input className="field h-12 w-full sm:h-11" placeholder=".field text input" />
          <SelectField label="SelectField" value={select} onChange={setSelect}
            options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }]} />
          <Tabs value={tab} onChange={setTab} options={[{ value: "one", label: "Tabs" }, { value: "two", label: "Segmented" }]} />
          <PillTabs value={pill} onChange={setPill} options={[{ value: "a", label: "PillTabs" }, { value: "b", label: "Filter" }, { value: "c", label: "Chips" }]} />
          <VenueViewSwitch view="list" />
        </div>
      </Block>

      <Block title="ColorPicker" note="Inline and touch-friendly — never the native colour input.">
        <div className="card max-w-md p-5">
          <ColorPicker value={colour} onChange={setColour} swatches={["#A8FF3E", "#2EF2FF", "#F5FF2E", "#FF8A3D", "#B48CFF", "#3DFFC5", "#F2F2F2", "#FF3D6E"]} />
        </div>
      </Block>

      <Block title="Status" note="One fixed tone per attendance status (jimbo.ui's tones); attended uses the accent.">
        <div className="card flex flex-wrap gap-2 p-5">
          {STATUSES.map((s) => <StatusBadge key={s} status={s} />)}
        </div>
      </Block>

      <Block title="Numbers">
        <StatGrid>
          <StatTile label="StatTile · accent" value={128} accent="accent" />
          <StatTile label="StatTile · highlight" value={42} accent="highlight" />
          <StatTile label="StatTile · support" value={17} accent="support" />
          <StatTile label="StatTile · muted" value={6} sub="with a sub line" />
        </StatGrid>
      </Block>

      <Block title="Lists and cards" note="Lists sit in one card; rows are at least 64px tall for thumbs.">
        <List>
          <ListGroupLabel>ListGroupLabel</ListGroupLabel>
          <EventRow to="/admin/style" date="2026-03-22" title="EventRow — a show" subtitle="A venue" status="attended" />
          <EventRow to="/admin/style" date="2026-07-12" title="EventRow in select mode" subtitle="Tap to tick" selected={picked} onSelect={() => setPicked((p) => !p)} />
          <EntityRow to="/admin/style" name="EntityRow — a person or place" sub="4 items" round />
        </List>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MediaCard to="/admin/style" name="MediaCard" sub="Image card" meta="3 items" />
          <MediaCard to="/admin/style" name="Portrait" sub="For posters" aspect="portrait" />
        </div>
        <LinkCard to="/admin/style" eyebrow="LinkCard" title="A card that goes somewhere" sub="Eyebrow, title, sub line" accent />
        <Section title="Section" count={3}>
          <p className="p-4 text-sm text-text-muted">A titled card for a block of related content.</p>
        </Section>
        <Section title="RankedList" flush>
          <RankedList items={[
            { id: "1", name: "Main hall", sub: "2021–2026", count: 12, href: "/admin/style" },
            { id: "2", name: "Studio B", count: 7, href: "/admin/style" },
            { id: "3", name: "Rooftop", count: 3, href: "/admin/style" },
          ]} />
        </Section>
        <div className="card flex items-center gap-4 p-4">
          <DateBlock date="2026-10-23" showYear />
          <p className="meta">DateBlock — the ticket-style date on every dated row.</p>
        </div>
      </Block>

      <Block title="States and overlays">
        <EmptyState title="EmptyState" body="Says what's missing and what to do about it." action={<Button size="sm">An action</Button>} />
        <div className="card overflow-hidden px-4"><Loading label="Loading — a skeleton shaped like the page" /></div>
        <div className="card flex flex-wrap items-center gap-3 p-5">
          <Button variant="secondary" onClick={() => setSheet(true)}>Open a Sheet</Button>
          <p className="meta">The one modal: a bottom sheet on phones, a dialog on desktop.</p>
        </div>
        <Pager page={page} totalPages={5} total={120} pageSize={24} onPage={setPage} />
      </Block>

      {sheet && (
        <Sheet title="Sheet" subtitle="Title, optional subtitle, scrolling body." onClose={() => setSheet(false)}>
          <div className="space-y-3 p-5">
            <p className="text-[15px]">Close with ×, Escape, or a tap outside.</p>
            <Button className="w-full" onClick={() => setSheet(false)}>Done</Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
