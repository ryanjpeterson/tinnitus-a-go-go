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

import { createContext, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/Wordmark";
import { ColorPicker } from "@/components/ColorPicker";
import {
  Autocomplete, Chevron, FloatingBar, LinkChips, ToggleGrid, Badge, BarChart, DateBlock, KeyValue, LayoutSwitch, SwitchRow, EmptyState, EntityRow, EventRow, LinkCard, List, ListGroupLabel, Loading, MediaCard, Pager,
  PillTabs, RankedList, SearchField, Section, SelectField, Sheet, Sparkline, StatGrid, StatTile, StatusBadge, Tabs, ThemeDots, TrendChart, useListLayout, VenueViewSwitch, type Tone,
} from "@/components/ui/kit";
import { DateField, FileDrop, TextArea, TextField } from "@/components/ui/forms";
import { Menu, Popover, Tooltip } from "@/components/ui/overlays";
import { OfflineBanner, ProgressBar, Stepper, toast, UpdateBanner, useConfirm } from "@/components/ui/feedback";
import { Accordion, DataTable, type Column, type TableSort } from "@/components/ui/data";
import { FONTS, MOTIFS, THEME_KEYS, themeHex } from "@/lib/theme";
import { useBrand } from "@/lib/useBrand";
import { useUrlState } from "@/lib/useUrlState";

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
  { name: "accent-700", use: "Accent outline-solid" },
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

const SECTIONS = [
  { value: "brand", label: "Brand and type" },
  { value: "controls", label: "Controls" },
  { value: "forms", label: "Forms" },
  { value: "overlays", label: "Menus and overlays" },
  { value: "feedback", label: "Feedback" },
  { value: "data", label: "Tables and steps" },
  { value: "numbers", label: "Numbers and charts" },
  { value: "lists", label: "Lists" },
  { value: "states", label: "States" },
] as const;
type SectionId = (typeof SECTIONS)[number]["value"];

/** The section on show; a Block outside it renders nothing. */
const Showing = createContext<string>("brand");

function Block({ title, note, section, children }: { title: string; note?: string; section: SectionId; children: React.ReactNode }) {
  if (useContext(Showing) !== section) return null;
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

/** `more`: the app's own sections (its domain components), after the kit's. */
export function StyleGuidePanel({ more = [] }: { more?: { value: string; label: string; content: ReactNode }[] }) {
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
  const [days, setDays] = useState<string[]>(["Mon", "Wed"]);
  const [bar, setBar] = useState(false);
  // The section shown is in the URL (?section=), so a refresh or a shared link opens it.
  const [showing, setShowing] = useUrlState<string>("section", "brand", [...SECTIONS.map((s) => s.value), ...more.map((m) => m.value)]);
  const extra = more.find((m) => m.value === showing);

  return (
    <Showing.Provider value={showing}>
    <div className="space-y-10">
      <div className="space-y-3">
        <p className="meta max-w-xl">The shared building blocks, live in the current theme (including a look you haven't saved yet). The rules are in the jimbo-ui guide.</p>
        <PillTabs value={showing} onChange={setShowing} options={[...SECTIONS, ...more.map(({ value, label }) => ({ value, label }))]} />
      </div>

      <Block section="brand" title="Brand" note="The TINNITUS logo (accent over highlight, unless one is uploaded) and its colours as flat circles — two to four; a faded one is inferred.">
        <div className="card flex flex-wrap items-center gap-6 p-5">
          <Wordmark size="lg" />
          <div className="flex flex-wrap gap-3">
            {THEME_KEYS.map((k) => (
              <div key={k} className="text-center">
                <div className={`mx-auto h-12 w-12 rounded-full ${k === "background" ? "border border-border" : DOT[k]} ${own[k] ? "" : "opacity-55"}`}
                  style={k === "background" ? { background: theme[k] } : undefined} />
                <p className="mt-1.5 text-xs font-semibold capitalize">{k}</p>
                <p className="font-mono text-11 text-text-subtle">{own[k] ? theme[k] : "inferred"}</p>
              </div>
            ))}
          </div>
        </div>
      </Block>

      <Block section="brand" title="Shades and depth" note="Each brand colour comes lighter and darker, as a solid fill and as washes. Use them for depth, never as new colours.">
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

      <Block section="brand" title="Circles" note="Always one flat fill — no gradient, outline, ring, glow or shadow. Side by side, never overlapping. 8 px inline, 10 px status, 16 px swatches, 40–48 px editor swatches and avatars.">
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

      <Block section="brand" title="Motif" note={`ThemeDots in the theme's motif — ${MOTIFS.find((m) => m.key === theme.motif)?.label ?? "Circles"} here; pick another on the Brand tab. Flat shapes side by side at the same fixed sizes as circles; empty states and brand moments only. Status dots and avatars stay circles.`}>
        <div className="card flex flex-wrap items-center gap-6 p-5">
          {[8, 12, 16, 24].map((size) => (
            <span key={size} className="flex items-center gap-2 text-sm"><ThemeDots size={size} /> {size} px</span>
          ))}
        </div>
      </Block>

      <Block section="brand" title="Colour tokens" note="Derived from the brand colours. Use these classes, never raw hex (bg-surface, text-text-muted, bg-accent/15 …).">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TOKENS.map((t) => (
            <div key={t.name} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5">
              <span className="h-9 w-9 shrink-0 rounded-lg border border-border" style={{ background: `rgb(var(--c-${t.name}))` }} />
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs font-semibold">{t.name}</span>
                <span className="block truncate text-11 text-text-subtle">{hex[t.name]} · {t.use}</span>
              </span>
            </div>
          ))}
        </div>
      </Block>

      <Block section="brand" title="Type" note={`Headings in ${FONTS[theme.fonts.headings!]!.label} (${theme.fonts.headingsWeight}), body in ${FONTS[theme.fonts.body!]!.label} (${theme.fonts.bodyWeight}) — the theme picks the fonts, weights and spacing. Tabular figures throughout.`}>
        <div className="card space-y-3 p-5">
          <p className="eyebrow">.eyebrow — label above a title</p>
          <p className="h-page">.h-page — Page title</p>
          <p className="h-section">.h-section — Section title</p>
          <p className="text-15">Body — 15px Inter. Plain sentences, sentence case.</p>
          <p className="meta">.meta — secondary line, 14px muted</p>
          <p className="font-display text-5xl text-accent">128</p>
        </div>
      </Block>

      <Block section="controls" title="Buttons" note="Pill-shaped. One primary action per view; secondary and ghost for the rest.">
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

      <Block section="controls" title="Fields and filters">
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

      <Block section="controls" title="Settings rows" note="KeyValue for read-only facts (inline, or stacked on detail pages); SwitchRow for on/off settings.">
        <div className="card divide-etched overflow-hidden">
          <KeyValue label="KeyValue">Inline — label left, value right</KeyValue>
          <KeyValue label="Stacked" layout="stacked">A small label above the value</KeyValue>
          <SwitchRow label="SwitchRow" hint="The whole row is the switch" checked={on} onChange={setOn} />
        </div>
      </Block>

      <Block section="controls" title="ColorPicker" note="Inline and touch-friendly — never the native colour input.">
        <div className="card max-w-md p-5">
          <ColorPicker value={colour} onChange={setColour} swatches={["#A8FF3E", "#2EF2FF", "#F5FF2E", "#FF8A3D", "#B48CFF", "#3DFFC5", "#F2F2F2", "#FF3D6E"]} />
        </div>
      </Block>

      <Block section="numbers" title="Status" note="One fixed tone per attendance status (jimbo.ui's tones); attended uses the accent.">
        <div className="card flex flex-wrap gap-2 p-5">
          {STATUSES.map((s) => <StatusBadge key={s} status={s} />)}
          <Badge tone="accent" dot>With a dot</Badge>
          <Badge tone="yellow" dot live>Live — pulsing</Badge>
        </div>
      </Block>

      <Block section="numbers" title="Numbers">
        <StatGrid>
          <StatTile label="StatTile · accent" value={128} accent="accent" />
          <StatTile label="StatTile · highlight" value={42} accent="highlight" />
          <StatTile label="StatTile · support" value={17} accent="support" />
          <StatTile label="StatTile · muted" value={6} sub="with a sub line" />
        </StatGrid>
      </Block>

      <Block section="numbers" title="Charts" note="Series take accent, support, highlight in that order, three at most. Tap, hover or arrow-key a chart to read a value; one series has no legend, more get named in the readout.">
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

      <Block section="lists" title="Lists and cards" note={'Lists sit in one card; rows are at least 64px tall for thumbs. The same List shows as tiles with layout="tiles".'}>
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
          <EntityRow to="/jimbo-ui?tab=style" name="EntityRow with avatarText" sub="The avatar shows a code or number instead of initials" avatarText="12" />
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

      <Block section="controls" title="Picks, related links and the floating bar" note="ToggleGrid for several picks from a small set; LinkChips for related things to go to; FloatingBar for a status and its actions above the dock.">
        <Section title="ToggleGrid">
          <ToggleGrid columns={4} smColumns={7} selected={days} onToggle={(d) => setDays((xs) => (xs.includes(d) ? xs.filter((x) => x !== d) : [...xs, d]))}
            options={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => ({ value: d, label: d }))} />
        </Section>
        <Section title="LinkChips">
          <LinkChips items={[
            { to: "/jimbo-ui?tab=style", label: "Main hall", sub: "next door", tone: "highlight" },
            { to: "/jimbo-ui?tab=style", label: "Studio B", sub: "same floor" },
            { to: "/jimbo-ui?tab=style", label: "Rooftop", sub: "3 events", tone: "support" },
          ]} />
        </Section>
        <div className="card flex flex-wrap items-center gap-3 p-5">
          <Button variant="secondary" onClick={() => setBar((b) => !b)}>{bar ? "Hide" : "Show"} a FloatingBar</Button>
          <p className="meta">Floats above the dock; the save bar uses it too.</p>
        </div>
        {bar && <FloatingBar live actions={<Button size="sm" onClick={() => setBar(false)}>Stop</Button>}>Running · 2 of 5</FloatingBar>}
      </Block>

      <Block section="states" title="States and overlays">
        <EmptyState title="EmptyState" body="Says what's missing and what to do about it." action={<Button size="sm">An action</Button>} />
        <div className="card overflow-hidden px-4"><Loading label="Loading — a skeleton shaped like the page" /></div>
        <div className="card flex flex-wrap items-center gap-3 p-5">
          <Button variant="secondary" onClick={() => setSheet(true)}>Open a Sheet</Button>
          <p className="meta">The one modal: a bottom sheet on phones, a dialog on desktop.</p>
        </div>
        <Pager page={page} totalPages={5} total={120} pageSize={24} onPage={setPage} />
      </Block>

      <FormBlocks />
      <OverlayBlocks />
      <FeedbackBlocks />
      <DataBlocks />

      {extra && <section className="space-y-3">{extra.content}</section>}

      {sheet && (
        <Sheet title="Sheet" subtitle="Title, optional subtitle, scrolling body." onClose={() => setSheet(false)}>
          <div className="space-y-3 p-5">
            <p className="text-15">Close with ×, Escape, or a tap outside.</p>
            <Button className="w-full" onClick={() => setSheet(false)}>Done</Button>
          </div>
        </Sheet>
      )}
    </div>
    </Showing.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Forms, overlays, feedback and data (components/ui/forms, overlays, feedback, data)
// ─────────────────────────────────────────────────────────────────────────────

function FormBlocks() {
  const [name, setName] = useState("Studio B");
  const [email, setEmail] = useState("someone@");
  const [amount, setAmount] = useState("24");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("2026-11-14");
  const [time, setTime] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const emailError = email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? "Add the part after the @, like example.com" : undefined;
  return (
    <>
      <Block section="forms" title="Text fields" note="A label above, a hint or an error under. Errors are inline in the highlight colour, say what to do, and keep what was typed.">
        <div className="card grid gap-4 p-5 sm:grid-cols-2">
          <TextField label="TextField" value={name} onChange={setName} hint="A hint under the field" />
          <TextField label="With an error" type="email" value={email} onChange={setEmail} error={emailError} autoComplete="off" />
          <TextField label="Prefix and suffix" value={amount} onChange={setAmount} inputMode="decimal" prefix="$" optional
            suffix={<span className="pr-3 text-sm text-text-subtle">per month</span>} />
          <TextArea label="TextArea" value={notes} onChange={setNotes} maxLength={120} placeholder="Grows as you type; counts down near the limit" className="sm:row-span-2" />
        </div>
      </Block>
      <Block section="forms" title="Dates and times" note="DateField uses the platform's own picker, in the page's light or dark scheme.">
        <div className="card grid gap-4 p-5 sm:grid-cols-2">
          <DateField label="DateField" value={date} onChange={setDate} />
          <DateField label="Time" type="time" value={time} onChange={setTime} optional />
        </div>
      </Block>
      <Block section="forms" title="FileDrop" note="Tap to pick, or drop files on it. Wrong types and files over the limit are turned away with a reason.">
        <div className="card p-5">
          <FileDrop label="Attachments" files={files} onChange={setFiles} multiple accept="image/*,.pdf,.csv" maxSize={5 * 1024 * 1024} hint="Images, PDF or CSV, up to 5 MB each" />
        </div>
      </Block>
    </>
  );
}

const Icon = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

function OverlayBlocks() {
  const [confirm, confirmSheet] = useConfirm();
  const [sizes, setSizes] = useState<string[]>(["M"]);
  const remove = async () => {
    if (await confirm({ title: "Delete this list?", body: "Its items stay in your library; only the list goes.", confirmLabel: "Delete list", danger: true })) {
      toast({ title: "List deleted", action: { label: "Undo", onClick: () => toast("List restored") } });
    }
  };
  return (
    <>
      <Block section="overlays" title="Menu" note="Actions on one thing, from the ⋯ button or any trigger. Arrow keys, Home / End and a letter move; destructive ones go last, in the highlight colour, and confirm.">
        <div className="card divide-etched overflow-hidden">
          <div className="flex min-h-[64px] items-center gap-3 py-2 pl-4 pr-2">
            <div className="min-w-0 flex-1">
              <p className="text-15 font-semibold">A row with a Menu</p>
              <p className="text-sm text-text-muted">The ⋯ MoreButton opens it</p>
            </div>
            <Menu label="List actions" items={[
              { label: "Rename", icon: <Icon d="M4 20h4L19 9l-4-4L4 16v4z" />, onSelect: () => toast("Rename picked") },
              { label: "Duplicate", icon: <Icon d="M8 8h11v11H8zM5 16V5h11" />, hint: "⌘D", onSelect: () => toast("Duplicated") },
              { label: "Archive", icon: <Icon d="M4 7h16M5 7v12h14V7M10 11h4" />, disabled: true, onSelect: () => {} },
              "divider",
              { label: "Delete", icon: <Icon d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />, danger: true, onSelect: () => void remove() },
            ]} />
          </div>
          <div className="flex min-h-[64px] items-center gap-3 px-4 py-2">
            <p className="min-w-0 flex-1 text-15 font-semibold">With its own trigger</p>
            <Menu label="Sort" align="end" trigger={(p) => <button type="button" {...p} className="btn btn-secondary btn-sm">Sort <Chevron dir="down" /></button>}
              items={[{ label: "Newest first", onSelect: () => toast("Newest first") }, { label: "Oldest first", onSelect: () => toast("Oldest first") }, { label: "A to Z", onSelect: () => toast("A to Z") }]} />
          </div>
        </div>
      </Block>
      <Block section="overlays" title="Popover and Tooltip" note="Popover: a few controls by their button, open while you use them. Tooltip: a label for an icon button on hover or keyboard focus — never the only place something's said.">
        <div className="card flex flex-wrap items-center gap-3 p-5">
          <Popover label="Sizes" trigger={(p) => <button type="button" {...p} className="btn btn-secondary">Sizes · {sizes.length || "any"}</button>}>
            {(close) => (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-text-muted">Show sizes</p>
                <ToggleGrid columns={4} options={["S", "M", "L", "XL"].map((v) => ({ value: v, label: v }))} selected={sizes}
                  onToggle={(v) => setSizes((xs) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]))} />
                <Button size="sm" className="w-full" onClick={close}>Done</Button>
              </div>
            )}
          </Popover>
          {[["Share", "M4 12v7h16v-7M12 3v13M7.5 7.5 12 3l4.5 4.5"], ["Download", "M4 15v4h16v-4M12 3v12M7.5 10.5 12 15l4.5-4.5"], ["Pin", "M9 4h6l-1 6 4 4H6l4-4zM12 14v6"]].map(([label, d]) => (
            <Tooltip key={label} text={label!}>
              <button type="button" aria-label={label} onClick={() => toast(`${label} picked`)}
                className="glass flex h-11 w-11 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-base"><Icon d={d!} /></button>
            </Tooltip>
          ))}
          <p className="meta">Hover or tab to the icons.</p>
        </div>
      </Block>
      <Block section="overlays" title="CommandPalette" note="⌘K or Ctrl+K anywhere in the showcase: go to a page or run an action by typing. A top-bar button opens it on phones.">
        <div className="card flex flex-wrap items-center gap-3 p-5">
          <Button variant="secondary" onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}>Open the palette</Button>
          <kbd className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs text-text-subtle">⌘K</kbd>
        </div>
      </Block>
      {confirmSheet}
    </>
  );
}

function FeedbackBlocks() {
  const [confirm, confirmSheet] = useConfirm();
  const [step, setStep] = useState(1);
  const [progress, setProgress] = useState(64);
  return (
    <>
      <Block section="feedback" title="Toasts" note="A short note after an action, above the dock. Done and info go after a few seconds (longer with an action); errors stay until closed. Three at most.">
        <div className="card flex flex-wrap gap-2 p-5">
          <Button variant="secondary" onClick={() => toast("Saved")}>Done</Button>
          <Button variant="secondary" onClick={() => toast({ title: "3 items moved", body: "To the archive.", action: { label: "Undo", onClick: () => toast("Moved back") } })}>With Undo</Button>
          <Button variant="secondary" onClick={() => toast({ title: "Syncing in the background", tone: "info" })}>Info</Button>
          <Button variant="secondary" onClick={() => toast({ title: "Couldn't save", body: "The server didn't answer. Your changes are kept here.", tone: "error", action: { label: "Retry", onClick: () => toast("Saved") } })}>Error</Button>
        </div>
      </Block>
      <Block section="feedback" title="ConfirmSheet" note="Before something destructive or surprising: the question, what survives, and the action in its own words. useConfirm() makes it one await.">
        <div className="card flex flex-wrap gap-2 p-5">
          <Button variant="secondary" onClick={async () => { if (await confirm({ title: "Remove 3 members?", body: "They lose access now. Their past entries stay.", confirmLabel: "Remove members", danger: true })) toast("Members removed"); }}>Destructive</Button>
          <Button variant="secondary" onClick={async () => { if (await confirm({ title: "Publish the schedule?", body: "Everyone in the group gets a notification.", confirmLabel: "Publish" })) toast("Published"); }}>Surprising</Button>
        </div>
      </Block>
      <Block section="feedback" title="ProgressBar" note="How far along a job of known length is; leave out the value while the length is unknown.">
        <div className="card space-y-5 p-5">
          <ProgressBar label="Uploading 12 photos" value={progress} />
          <ProgressBar label="Storage" value={3.2} max={5} tone="support" format={(v, m) => `${v} of ${m} GB`} />
          <ProgressBar label="Importing" />
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setProgress((p) => Math.max(0, p - 16))}>−</Button>
            <Button size="sm" variant="secondary" onClick={() => setProgress((p) => Math.min(100, p + 16))}>+</Button>
          </div>
        </div>
      </Block>
      <Block section="feedback" title="Banners" note="Slim bars that stick under the top bar, first thing on the page: offline (fixed yellow, with changes waiting) or a new version ready.">
        <div className="card space-y-3 overflow-hidden p-5 [&_[role=status]]:static [&_[role=status]]:m-0 [&_[role=status]]:rounded-xl">
          <OfflineBanner forceOffline pending={2} />
          <UpdateBanner onReload={() => toast("Reloading…")} onDismiss={() => toast("Asks again next launch")} />
        </div>
      </Block>
      <Block section="data" title="Stepper" note="Where you are in two to five steps. Done steps can be revisited; phones show the current step's name under the circles.">
        <div className="card space-y-5 p-5">
          <Stepper steps={["Account", "Details", "Invite", "Review"]} current={step} onStep={setStep} />
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
            <Button size="sm" disabled={step === 3} onClick={() => setStep((s) => s + 1)}>Next</Button>
          </div>
        </div>
      </Block>
      {confirmSheet}
    </>
  );
}

type Run = { id: string; name: string; status: Tone; label: string; when: string; minutes: number; items: number };
const RUNS: Run[] = [
  { id: "1", name: "Nightly import", status: "accent", label: "Done", when: "2026-11-02", minutes: 14, items: 1284 },
  { id: "2", name: "Thumbnails", status: "yellow", label: "Running", when: "2026-11-03", minutes: 6, items: 312 },
  { id: "3", name: "Weekly report", status: "accent", label: "Done", when: "2026-10-30", minutes: 3, items: 48 },
  { id: "4", name: "Cleanup", status: "red", label: "Failed", when: "2026-11-01", minutes: 1, items: 0 },
  { id: "5", name: "Backfill", status: "muted", label: "Cancelled", when: "2026-10-28", minutes: 22, items: 5110 },
];
const RUN_COLUMNS: Column<Run>[] = [
  { key: "name", label: "Job", primary: true, cell: (r) => r.name, sortValue: (r) => r.name },
  { key: "status", label: "Status", cell: (r) => <Badge tone={r.status} dot live={r.label === "Running"}>{r.label}</Badge>, sortValue: (r) => r.label },
  { key: "when", label: "Started", cell: (r) => new Date(`${r.when}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }), sortValue: (r) => r.when },
  { key: "minutes", label: "Took", numeric: true, cell: (r) => `${r.minutes} min`, sortValue: (r) => r.minutes, hideOnPhone: true },
  { key: "items", label: "Items", numeric: true, cell: (r) => r.items.toLocaleString(), sortValue: (r) => r.items },
];

function DataBlocks() {
  // The sort is in the URL (?sort=items-desc), like any view state.
  const [rawSort, setRawSort] = useUrlState("sort", "when-desc");
  const [key, dir] = rawSort.split("-") as [string, "asc" | "desc"];
  const sort: TableSort = { key, dir: dir === "asc" ? "asc" : "desc" };
  return (
    <>
      <Block section="data" title="DataTable" note="A sortable table on desktop; a row per record on phones, the primary column as its title. The sort lives in the URL.">
        <DataTable caption="Recent jobs" columns={RUN_COLUMNS} rows={RUNS} rowKey={(r) => r.id} rowTo={() => "/jimbo-ui?tab=style&section=data"}
          sort={sort} onSort={(s) => setRawSort(`${s.key}-${s.dir}`)} />
      </Block>
      <Block section="data" title="Accordion" note="Sections that fold — FAQs, advanced settings. One open at a time unless multiple. Native details, so the keyboard and find-in-page just work.">
        <Accordion defaultOpen="a" items={[
          { id: "a", title: "What does it keep?", sub: "One open at a time", content: "Only what you add. Nothing leaves this device unless you turn on sync." },
          { id: "b", title: "Can I move my data?", content: "Export everything as a file from Settings, and import it in another copy of the app." },
          { id: "c", title: "Advanced", sub: "Most people won't need these", content: "Debug logging, the cache size and the server address." },
        ]} />
      </Block>
    </>
  );
}

