/**
 * jimbo-ui config › Style guide — /jimbo-ui?tab=style
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
  Autocomplete, Badge, BarChart, DateBlock, KeyValue, LayoutSwitch, SwitchRow, EmptyState, EntityRow, EventRow, LinkCard, List, ListGroupLabel, Loading, MediaCard, PageHeader, Pager,
  PillTabs, RankedList, SearchField, Section, SelectField, Sheet, Sparkline, StatGrid, StatTile, StatusBadge, Tabs, ThemeDots, TrendChart, useListLayout, VenueViewSwitch,
} from "@/components/ui/kit";
import { FONTS, THEME_KEYS, themeHex } from "@/lib/theme";
import { useBrand } from "@/lib/useBrand";

const PLACES = ["Main hall", "Studio B", "Rooftop", "Riverside park", "Workshop room"];

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

const DOT = { accent: "dot-accent", highlight: "dot-highlight", support: "dot-support" } as const;
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

export function StyleGuidePanel() {
  const { theme: own, colors: theme } = useBrand();
  const hex = themeHex(theme);
  const [tab, setTab] = useState<"one" | "two">("one");
  const [pill, setPill] = useState<"a" | "b" | "c">("a");
  const [select, setSelect] = useState<"newest" | "oldest">("newest");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(2);
  const [sheet, setSheet] = useState(false);
  const [layout, setLayout] = useListLayout("style-guide");
  const [picked, setPicked] = useState(false);
  const [colour, setColour] = useState("#A8FF3E");
  const [ac, setAc] = useState("");
  const [on, setOn] = useState(true);

  return (
    <div className="space-y-10">
      <p className="meta max-w-xl">The shared building blocks, live in the current theme (including a look you haven't saved yet). The rules are in the jimbo-ui guide.</p>

      <Block title="Brand" note="The TINNITUS logo (accent over highlight, unless one is uploaded) and its colours as flat circles — two to four; a faded one is inferred.">
        <div className="card flex flex-wrap items-center gap-6 p-5">
          <Wordmark size="lg" />
          <div className="flex flex-wrap gap-3">
            {THEME_KEYS.map((k) => (
              <div key={k} className="text-center">
                <div className={`mx-auto h-12 w-12 rounded-full ${k === "background" ? "border border-border" : DOT[k]} ${own[k] ? "" : "opacity-55"}`}
                  style={k === "background" ? { background: theme[k] } : undefined} />
                <p className="mt-1.5 text-xs font-semibold capitalize">{k}</p>
                <p className="font-mono text-[11px] text-text-subtle">{own[k] ? theme[k] : "inferred"}</p>
              </div>
            ))}
          </div>
        </div>
      </Block>

      <Block title="Shades and depth" note="Each brand colour comes lighter and darker, as a solid fill and as washes. Use them for depth, never as new colours.">
        <div className="card space-y-4 p-5">
          {(["accent", "highlight", "support"] as const).map((k) => (
            <div key={k} className="flex items-center gap-3">
              <p className="w-16 shrink-0 text-xs font-semibold capitalize">{k}</p>
              <div className="flex min-w-0 items-center gap-1">
                {["lighter", "light", "", "dark", "darker"].map((v) => (
                  <span key={v} className="h-6 w-6 shrink-0 rounded-full"
                    style={{ background: `rgb(var(--c-${k}${v ? `-${v}` : ""}))` }} title={`${k}${v ? `-${v}` : ""}`} />
                ))}
              </div>
              <span className={`${LIT[k]} ml-auto shrink-0 whitespace-nowrap rounded-control px-2.5 py-1 text-xs font-bold`}>Fill</span>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Circles" note="Always one flat fill — no gradient, outline, ring, glow or shadow. Side by side, never overlapping. 8 px inline, 10 px status, 16 px swatches, 40–48 px editor swatches and avatars.">
        <div className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-6">
            <span className="flex items-center gap-2 text-sm"><ThemeDots /> ThemeDots (8 px)</span>
            <span className="flex items-center gap-2 text-sm"><span className="dot-support h-2 w-2" /> label dot</span>
            <span className="flex items-center gap-2 text-sm"><span className="h-2.5 w-2.5 rounded-full bg-yellow-400" /> status</span>
          </div>
          <div className="flex items-center gap-1">
            {(["dot-accent", "dot-highlight", "dot-support"] as const).map((d) => <span key={d} className={`${d} h-4 w-4 shrink-0`} />)}
            <span className="h-4 w-4 shrink-0 rounded-full border border-border bg-bg" />
            <span className="ml-2 text-sm text-text-muted">swatches (16 px; the page colour gets a hairline border)</span>
          </div>
          <div className="glass flex items-center gap-3 rounded-2xl p-4">
            <span className="dot-support flex h-10 w-10 items-center justify-center font-display text-on-support">A</span>
            <p className="text-sm font-semibold">An avatar on .glass</p>
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

      <Block title="Type" note={`Headings in ${FONTS[theme.fonts.headings!]!.label} (${theme.fonts.headingsWeight}), body in ${FONTS[theme.fonts.body!]!.label} (${theme.fonts.bodyWeight}) — the theme picks the fonts, weights and spacing. Tabular figures throughout.`}>
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
          <Autocomplete label="Autocomplete" value={ac} onChange={setAc} placeholder="Type a place…"
            options={PLACES.filter((p) => ac.trim() && p.toLowerCase().includes(ac.trim().toLowerCase())).map((p) => ({ id: p, label: p }))}
            onPick={(o) => setAc(o.label)} onCreate={(t) => setAc(t)} />
        </div>
      </Block>

      <Block title="Settings rows" note="KeyValue for read-only facts (inline, or stacked on detail pages); SwitchRow for on/off settings.">
        <div className="card divide-etched overflow-hidden">
          <KeyValue label="KeyValue">Inline — label left, value right</KeyValue>
          <KeyValue label="Stacked" layout="stacked">A small label above the value</KeyValue>
          <SwitchRow label="SwitchRow" hint="The whole row is the switch" checked={on} onChange={setOn} />
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
          <Badge tone="accent" dot>With a dot</Badge>
          <Badge tone="yellow" dot live>Live — pulsing</Badge>
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

      <Block title="Charts" note="Series take accent, support, highlight in that order, three at most. Tap, hover or arrow-key a chart to read a value; one series has no legend, more get named in the readout.">
        <StatGrid>
          <StatTile label="StatTile · trend" value="1.2K" accent="accent" trend={[620, 700, 810, 760, 940, 1100, 1210]} sub="A Sparkline under it" />
          <StatTile label="Sparkline · support" value={38} accent="support" trend={[44, 40, 41, 37, 39, 36, 38]} />
        </StatGrid>
        <Section title="TrendChart · one series">
          <TrendChart labels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]} series={[{ label: "Visits", values: [120, 180, 150, 210, 260, 240, 300] }]} />
        </Section>
        <Section title="TrendChart · two series">
          <TrendChart labels={["Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 5", "Wk 6"]} format={(n) => `${n}m`}
            series={[{ label: "Build", values: [12, 14, 11, 16, 13, 12] }, { label: "Tests", values: [6, 7, 7, 9, 8, 6] }]} />
        </Section>
        <div className="grid gap-6 sm:grid-cols-2">
          <Section title="BarChart · horizontal">
            <BarChart items={[
              { id: "a", label: "Main hall", value: 42, to: "/jimbo-ui?tab=style" },
              { id: "b", label: "Studio B", value: 27 },
              { id: "c", label: "Rooftop", value: 9 },
            ]} />
          </Section>
          <Section title="BarChart · vertical">
            <BarChart direction="vertical" tone="support" height={120}
              items={["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map((m, i) => ({ id: String(i), label: m, value: [3, 5, 2, 6, 8, 4, 9, 7, 5, 6, 3, 4][i]! }))} />
          </Section>
        </div>
        <div className="card flex items-center gap-4 p-4">
          <Sparkline values={[3, 4, 2, 5, 6, 5, 8]} className="w-28" />
          <p className="meta">Sparkline on its own — beside a row or in a card.</p>
        </div>
      </Block>

      <Block title="Lists and cards" note={'Lists sit in one card; rows are at least 64px tall for thumbs. The same List shows as tiles with layout="tiles".'}>
        <Section title="List · rows or tiles" action={<LayoutSwitch value={layout} onChange={setLayout} />} plain>
          <List layout={layout}>
            <EventRow onOpen={() => setSheet(true)} date="2026-05-04" title="The same item" subtitle="As a row, or as a tile" status="attended" />
            <EventRow onOpen={() => setSheet(true)} date="2026-05-11" title="Another item" subtitle="LayoutSwitch picks; useListLayout remembers" />
            <EventRow onOpen={() => setSheet(true)} date="2026-05-18" title="A third" subtitle="One column on phones" status="attending" />
          </List>
        </Section>
        <List>
          <ListGroupLabel>ListGroupLabel</ListGroupLabel>
          <EventRow to="/jimbo-ui?tab=style" date="2026-03-22" title="EventRow — a show" subtitle="A venue" status="attended" />
          <EventRow onOpen={() => setSheet(true)} date="2026-04-02" title="EventRow that opens a sheet" subtitle="onOpen instead of a link" status="attending" />
          <EventRow to="/jimbo-ui?tab=style" date="2026-07-12" title="EventRow in select mode" subtitle="Tap to tick" selected={picked} onSelect={() => setPicked((p) => !p)} />
          <EntityRow to="/jimbo-ui?tab=style" name="EntityRow — a person or place" sub="4 items" round />
        </List>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MediaCard to="/jimbo-ui?tab=style" name="MediaCard" sub="Image card" meta="3 items" />
          <MediaCard to="/jimbo-ui?tab=style" name="Portrait" sub="For posters" aspect="portrait" />
        </div>
        <LinkCard to="/jimbo-ui?tab=style" eyebrow="LinkCard" title="A card that goes somewhere" sub="Eyebrow, title, sub line" accent />
        <Section title="Section" count={3}>
          <p className="p-4 text-sm text-text-muted">A titled card for a block of related content.</p>
        </Section>
        <Section title="RankedList" flush>
          <RankedList items={[
            { id: "1", name: "Main hall", sub: "2021–2026", count: 12, href: "/jimbo-ui?tab=style" },
            { id: "2", name: "Studio B", count: 7, href: "/jimbo-ui?tab=style" },
            { id: "3", name: "Rooftop", count: 3, href: "/jimbo-ui?tab=style" },
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
