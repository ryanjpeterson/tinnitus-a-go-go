# Brand & UI standards

A living guide to how this app looks, reads and behaves — written so the same
layout can be reused for other apps with different colours.

- **Living picture:** the **Style guide** page (`/admin/style`) renders every
  shared component with the real code, in the current theme.
- **Living rules:** this document. Update it in the same commit as any change
  to the UI kit, tokens or patterns, and add a line to the
  [log](#change-log-of-this-guide) at the bottom.
- **Theme:** four colours set in **Account → Brand & theme** (`/admin/brand`)
  drive everything else.

---

## 1. Reusing this for another app

The look is portable: a theme engine, a token-based Tailwind config, one CSS
file of component classes and one UI kit file. To start a new app from it:

1. **Copy the foundation** (from `apps/web`):

   | File | What it is |
   | --- | --- |
   | `tailwind.config.js` | Colour tokens (`tok()`), fonts, radii |
   | `src/styles/globals.css` | Default token values, type scale, `.card`, `.btn`, `.field`, `.chip`, `.eyebrow`… |
   | `src/lib/theme.ts` | Theme engine: four colours → every token; map style; favicon recolouring |
   | `src/lib/useBrand.ts` | Loads the theme from the API, applies it, caches it |
   | `src/components/ui/kit.tsx`, `ui/button.tsx` | The component kit (section 6) |
   | `src/routes/BrandPage.tsx`, `StyleGuidePage.tsx` | Admin theme editor and living style guide |
   | `src/lib/gestures.ts`, `components/PhotoCarousel.tsx`, `components/UploadIndicator.tsx` | Optional: pull to refresh/swipes, photo viewer, background task ring |
   | `index.html` | The pre-paint theme script (keep it) |
   | API: `routes/theme.ts` + the `site_copy` table | Theme storage (or hard-code `DEFAULT_THEME` and skip the API) |

2. **Set the brand:** change `DEFAULT_THEME` in `theme.ts` *and* the
   `:root` defaults in `globals.css` (generate them from the engine so they
   match), or just set the colours in admin.
3. **Replace the identity:** app name (`index.html` title, `vite.config.ts`
   manifest, `apple-mobile-web-app-title`), `Wordmark.tsx` (or upload a logo),
   `public/favicon.svg` (keep its two colours `#0B0B0C` background and
   `#f87171` mark if you want it recoloured automatically), `public/icons/*`
   (192/512 app icons, Apple touch icons, splash screens).
4. **Keep the shell:** `AppShell.tsx`'s top bar + tab dock + `<main>` frame;
   change the tabs (keep five or fewer).
5. **Check** `/admin/style` in a dark and a light theme.

---

## 2. Brand

### Voice
- Plain, short, a little wry. Say what something is and what happens next
  ("Take this show out of Bluesfest 2025? It goes back to being its own show.").
- **Sentence case** everywhere — titles, buttons, tabs. No Title Case, no ALL CAPS
  (except `.eyebrow` labels, which are styled caps).
- Buttons are verbs: *Save colours*, *Add to festival…* (an ellipsis means a
  sheet or choice follows).
- Name things the way the user does: "show", "set", "festival", "venue".
  No internal names (no "event series", "concert_id") in the UI.

### Logo
- The wordmark is two colours: the **logo** colour (main word) and the
  **accent** (second line). Both follow the theme; an uploaded logo replaces it.
- Minimum height 40 px (`size="sm"`), always on the page background or a card —
  never on a photo without the banner's dark fade.

### Colour — the four source colours

| Colour | Default | Used for |
| --- | --- | --- |
| **Accent** | `#A8FF3E` | Primary buttons, active tab/pill, focus rings, links on hover, "attended", the logo's second line, numbers that matter |
| **Highlight** | `#FF3D6E` | Dates (month on date blocks), "on this day", map pins, warnings, destructive hover |
| **Background** | `#141416` | The page. Surfaces, borders and all text are derived from it |
| **Logo** | `#F87171` | The wordmark and favicon |

Status colours are **fixed** (not themed), because they carry meaning:
attending = yellow, interested = purple, missed = red, cancelled = grey;
attended uses the accent.

---

## 3. Colour tokens

Never write a hex value in a component. Use token classes; Tailwind opacity
modifiers work on all of them (`bg-accent-lime/15`, `border-border/60`).

| Token (CSS var `--c-…`) | Tailwind | Derived from | Use |
| --- | --- | --- | --- |
| `bg` | `bg-bg` | background | Page |
| `bg-deep` | `bg-bg-deep` | bg, nudged | End of the card gradient |
| `surface` | `bg-surface` | bg + 3.4% white (or black on light) | Cards, sheets, the dock |
| `surface-2` | `bg-surface-2` | bg + 7% | Fields, chips, hover rows |
| `border` | `border-border` | bg + 12% | Lines, outlines |
| `text` | `text-text-base` | near-white, or near-black on a light bg | Body text |
| `text-muted` | `text-text-muted` | text → bg 38% | Secondary lines |
| `text-subtle` | `text-text-subtle` | text → bg 58% | Labels, hints, counts |
| `accent` | `*-accent-lime` | accent | See above |
| `accent-hover` | `*-accent-lime-hover` | accent lightened (darkened on light bg) | Hover |
| `on-accent` | `text-on-accent` | dark or white, whichever reads | Text/icons on accent fills |
| `accent-950/900/700` | `*-lime-950/900/700` | bg → accent 10/28/50% | Accent washes: attended chip, banner glow |
| `highlight` | `*-accent-pink` | highlight | See above |
| `highlight-hover` | `*-accent-pink-hover` | | Hover |
| `on-highlight` | `text-on-highlight` | | Text on highlight fills |
| `highlight-950/900/800` | `*-rose-950/900/800` | bg → highlight | Warning washes |
| `logo` | `*-logo` | logo | Wordmark, favicon |

(The `lime` / `pink` names are historical — they mean *accent* / *highlight*
whatever colours the theme sets.)

**Light backgrounds:** if the background's luminance is over 0.4, surfaces step
*darker* instead of lighter, text flips to near-black, and `color-scheme`
becomes `light`. Photo viewers, banners over flyers and map pins stay dark/vivid
on purpose.

**Readability (checked on the Brand page):** body text ≥ 4.5:1 on the
background; accent and highlight ≥ 3:1 on the background; text on accent
buttons ≥ 4.5:1.

---

## 4. Typography

| Class | Size | Font | Use |
| --- | --- | --- | --- |
| `.h-page` | 30 → 36 px | Archivo 800 | One per page, in `PageHeader` |
| `.h-section` | 20 → 22 px | Archivo 800 | Section titles |
| body | 15 px | Inter | Default text, row titles (semibold) |
| `.meta` | 14 px | Inter, muted | Second lines, helper text |
| `.eyebrow` | 11 px caps, tracked | Inter semibold, subtle | Label above a title |
| `font-display` + size | any | Archivo 800 | Big numbers, the year in Year in review |

- Numbers use tabular figures (set on `body`) so counts and dates line up.
- Long titles: `line-clamp-2` in rows, `truncate` for single-line subtitles.

---

## 5. Layout

- **Phone first.** Design at 375 px wide, then let `sm:` (≥ 640 px) relax it.
- **App shell:** sticky top bar (56 px; 64 px on desktop) with the logo, search,
  + add, account. Content in `max-w-5xl`, `px-4` (`sm:px-6`).
- **Tab dock (phones):** floating, frosted, rounded 28 px, five tabs max,
  icon + label, active tab = accent pill + filled icon. Tapping the active tab
  scrolls to top. Content gets bottom padding so nothing hides under it;
  anything pinned to the bottom (action bars, the upload ring) sits above it:
  `bottom-[calc(5.75rem+env(safe-area-inset-bottom))]`.
- **Safe areas:** the top bar pads `env(safe-area-inset-top)`; full-screen
  overlays pad top and bottom insets.
- **Page anatomy:** `PageHeader` (eyebrow, title, count, actions) → filters →
  content. Detail pages start with a full-width `Hero`/`Banner` (blurred image,
  back button top-left, status top-right, actions below).
- **Spacing:** `space-y-6` between sections, `space-y-3` inside one,
  `gap-3` in grids, `p-4 sm:p-5` inside cards.
- **Radii:** cards 18 px (`rounded-2xl`), fields 14 px (`rounded-xl`),
  buttons/pills/badges fully round.
- **No horizontal scroll strips.** Wrap, use a select on phones, or a sheet.
- **Touch targets ≥ 44 px** (`h-11`/`h-12` on phones), rows ≥ 64 px.

---

## 6. Components (`components/ui/kit.tsx`)

| Component | Use it for |
| --- | --- |
| `PageHeader` | Every index page's title row |
| `Hero` / `Banner` | Detail page header over a blurred image |
| `Section` | A titled card holding one block of content |
| `List` + `ListGroupLabel` | A card of rows, optionally grouped (by month) |
| `EventRow` | A dated thing (show). `DateBlock` on the left; `selected`/`onSelect` for select mode |
| `EntityRow` | A named thing with an avatar (artist, venue) |
| `MediaCard` | Image-led grid card (venues, festivals, flyers: `aspect="portrait"`) |
| `LinkCard` | A card that navigates (eyebrow / title / sub); `accent` for the one to notice |
| `StatTile` / `StatGrid` | Headline numbers |
| `RankedList` | Top-N lists with counts |
| `SearchField`, `SelectField` | Search and single-choice filters (select on phones) |
| `Tabs` | 2–4 mutually exclusive views (segmented) |
| `PillTabs` | Filters on desktop |
| `Pager` | Paging long lists |
| `Sheet` | **The** modal: bottom sheet on phones, dialog on desktop |
| `ImageViewer`, `PhotoCarousel` | Full-screen images / photos (swipe, swipe down to close) |
| `StatusBadge` / `STATUS` | Attendance status, same colours everywhere |
| `EmptyState` | No data — say what's missing and offer the next step |
| `Loading` | Skeleton shaped like a page (never a bare spinner) |
| `ShareButton` | Story-sized share image |
| `VenueViewSwitch` | List ⇄ map switch |
| `ColorPicker` (`components/ColorPicker.tsx`) | Inline colour picker: colour field, hue slider, 8 quick swatches, hex. Never the native `<input type=color>` — it opens a different dialog on every platform |
| `Button` (`ui/button.tsx`) | `primary` (one per view), `secondary`, `ghost`, `danger`; `sm`/`md`/`lg` |

CSS classes for plain elements: `.card`, `.field`, `.btn …`, `.chip`,
`.link-action`, `.eyebrow`, `.meta`, `.label`.

Adding a component: build it from tokens, put it in the kit, add it to the
Style guide page, and list it here.

---

## 7. Patterns

- **Select mode:** a *Select* button turns rows into toggles (`EventRow
  onSelect`); a floating action bar above the dock shows the count and the action.
- **Sheets for choices**, not new pages, when the user comes straight back
  (pickers, add-shows, search).
- **Confirm before destructive or surprising actions**, in plain words; say
  what survives ("Its shows stay as ordinary shows").
- **Background work** shows in the corner ring (uploads): never block the
  screen; allow pause/cancel; warn before closing with work pending.
- **Gestures:** pull to refresh at the top of a page; horizontal swipe between
  siblings (festival days); swipe down to close full-screen media. Mark
  carousels/maps `data-no-swipe`.
- **Lists:** newest first for the past, soonest first for the future; group by
  month; status as a quiet dot in rows, a badge on detail pages.
- **Errors:** inline, near what failed, in the highlight colour; keep the
  user's input.
- **Offline / pending:** a slim banner under the top bar.
- **Unsaved changes:** a floating save bar above the dock (*Undo* / *Save*) appears only while there is something to save; editors preview live.
- **Choosing a look:** show choices as miniatures of the real thing (theme templates), not names in a list.

---

## 8. Icons

- Inline SVG, `stroke="currentColor"`, stroke width 2–2.25, round caps/joins,
  24 px in the dock and top bar, 16–20 px inline.
- Active dock icons get a 22% fill (`fill="currentColor" fillOpacity={0.22}`).
- Icon-only buttons need `aria-label` (and `title` for shortcuts).

---

## 9. Accessibility checklist

- Contrast targets in section 3 (the Brand page warns when they're missed).
- Focus is visible (`focus:ring-2 ring-accent-lime/20` on fields; browser focus
  on buttons is kept).
- Every interactive element is a real `button`/`a`; toggles use
  `aria-pressed`/`role="switch"`; tabs use `role="tab"`/`aria-selected`.
- Images: meaningful ones get `alt`; decorative ones `alt=""`.
- Nothing is hover-only — touch screens show controls (`[@media(hover:none)]`).

---

## 10. Don'ts

- No raw hex, no Tailwind palette colours for brand surfaces (`bg-zinc-900`,
  `text-white` on cards) — use tokens.
- No second modal style, no full-screen blocking spinners.
- No horizontal scrolling rows, no hover-only actions.
- No new font sizes outside the scale in section 4.

---

## Change log of this guide

- **2026-10-23** — First version: theme engine (four colours → tokens), light
  backgrounds, admin Brand & theme page, Style guide page, reuse checklist.
- **2026-10-23** — Brand page rebuilt: template gallery (10 themes shown as
  app miniatures), `ColorPicker` component, floating save bar pattern.
