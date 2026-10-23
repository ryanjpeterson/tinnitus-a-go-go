# Brand & UI standards

How this app looks, reads and behaves, written as a recipe: with this document
you can build another app that looks and feels like it, with different
colours, whether or not you copy the code.

- **Living picture:** the **Style guide** page (`/admin/style`) renders every
  shared component with the real code, in the current theme.
- **Living rules:** this document. Update it in the same commit as any change
  to the UI kit, tokens, theme options or patterns, and add a line to the
  [log](#change-log-of-this-guide) at the bottom.
- **Theme:** three colours set in **Account → Brand & theme** (`/admin/brand`)
  drive everything else.

**Contents:** 1 Reusing this · 2 Brand · 3 Theme engine · 4 Theme templates ·
5 Typography · 6 Layout and shell · 7 Surfaces, depth and motion ·
8 Components · 9 Patterns · 10 Icons · 11 Accessibility · 12 Don'ts

---

## 1. Reusing this for another app

The look is portable: a theme engine, a token-based Tailwind config, one CSS
file of component classes, one UI kit file and an app shell.

### Copy the foundation (from `apps/web`)

| File | What it is |
| --- | --- |
| `tailwind.config.js` | Colour tokens (`tok()`), fonts, radii |
| `src/styles/globals.css` | Default token values, page background, type scale, `.card`, `.btn`, `.field`, `.chip`, `.eyebrow`… |
| `src/lib/theme.ts` | Theme engine: three colours → every token; contrast maths; map style; map pin; favicon recolouring |
| `src/lib/useBrand.ts` | Loads the theme from the API, applies it, caches it |
| `index.html` | The pre-paint theme script, fonts, PWA meta tags (keep all three) |
| `src/routes/AppShell.tsx` | Top bar, floating tab dock, `<main>` frame, pull to refresh |
| `src/components/ui/kit.tsx`, `ui/button.tsx` | The component kit (section 8) |
| `src/components/Wordmark.tsx` | The two-colour logo (replace the paths, keep the colour rules) |
| `src/components/ColorPicker.tsx` | Inline colour picker |
| `src/routes/BrandPage.tsx`, `StyleGuidePage.tsx` | Admin theme editor (templates + fine-tune) and living style guide |
| `src/lib/gestures.ts`, `components/PhotoCarousel.tsx`, `components/UploadIndicator.tsx` | Optional: pull to refresh and swipes, photo viewer, background-task ring |
| `src/lib/shareCard.ts` | Optional: story-sized share images in the theme |
| API: `routes/theme.ts` + the `site_copy` table | Theme storage (or hard-code `DEFAULT_THEME` and skip the API) |

### Then

1. **Set the brand:** change `DEFAULT_THEME` in `theme.ts` *and* the `:root`
   defaults in `globals.css` (generate them with `themeHex(DEFAULT_THEME)` so
   they match), or pick a template in admin.
2. **Replace the identity:** app name (`index.html` title,
   `apple-mobile-web-app-title`, `vite.config.ts` manifest `name`/`short_name`),
   `Wordmark.tsx` (keep: main word = accent, second line = highlight, outline =
   text colour), `public/favicon.svg` (keep `#0B0B0C` for its background and
   `#A8FF3E` for its mark so it recolours automatically), `public/icons/*`
   (192/512 app icons, Apple touch icons, splash screens).
3. **Keep the shell:** top bar + floating tab dock + `<main>` frame; change the
   tabs (five or fewer, icon + one-word label).
4. **Keep the templates** (section 4) or write your own; each must pass the
   readability checks.
5. **Check** `/admin/style` in a dark, a mid and a light template.

### Building it without this code

Everything below is specified in values, so another stack can reproduce it:
the three colours and the derivation formulas (section 3), type scale
(section 5), shell sizes (section 6), surface recipes (section 7), and the
component and pattern rules (sections 8–9).

---

## 2. Brand

### Voice
- Plain, short, a little wry. Say what something is and what happens next
  ("Take this show out of Bluesfest 2025? It goes back to being its own show.").
- **Sentence case** everywhere — titles, buttons, tabs. No Title Case, no ALL
  CAPS (except `.eyebrow` labels, which are styled caps).
- Buttons are verbs: *Save*, *Add to festival…* (an ellipsis means a sheet or
  choice follows).
- Name things the way the user does ("show", "set", "festival", "venue"),
  never internal names ("event series", "concert_id").
- Empty states and confirmations say what survives or what to do next.

### Logo
- A two-line wordmark: **TINNITUS** in the **accent** (primary) colour with an
  outline in the text colour (white on dark themes, near-black on light), and
  **a-go-go** below it in the **highlight** (secondary) colour.
- It follows the theme everywhere it appears: top bar, sign-in, Brand page
  miniatures, favicon (the mark in the accent on the background colour).
- An uploaded logo (SVG/PNG/WebP/JPEG ≤ 1 MB) replaces the wordmark; an
  uploaded favicon replaces the recoloured one. Both can be reset to built-in.
- Minimum height 40 px (`size="sm"`), always on the page background or a card —
  never on a photo without a dark fade.

### Colour — the three source colours

| Colour | Default | Used for |
| --- | --- | --- |
| **Accent** (primary) | `#A8FF3E` | Logo main word, primary buttons, active tab/pill, focus rings, links on hover, "attended", text selection, numbers that matter, the favicon mark |
| **Highlight** (secondary) | `#FF3D6E` | Logo second line, dates (month on date blocks), "on this day", map pins, count badges, warnings and errors, destructive hover |
| **Background** | `#141416` | The page. Surfaces, borders and every text colour are derived from it |

Status colours are **fixed**, not themed, because they carry meaning:

| Status | Colour (Tailwind) | Chip |
| --- | --- | --- |
| Attended | the accent | `bg-lime-950 text-accent-lime border-lime-700` |
| Attending | yellow-400 | `bg-yellow-950 text-yellow-400 border-yellow-700` |
| Interested | purple-400 | `bg-purple-950 text-purple-400 border-purple-800` |
| Missed | red-400 | `bg-red-950 text-red-400 border-red-800` |
| Cancelled | text-subtle | `bg-surface-2 text-text-subtle border-border` |

The offline banner is fixed yellow (`bg-yellow-950/95 text-yellow-200`).

---

## 3. Theme engine

Three colours in, every token out (`deriveColors()` in `src/lib/theme.ts`).
Tokens are CSS variables holding `R G B` channels (`--c-surface: 28 28 30`),
and Tailwind colours are `rgb(var(--c-name) / <alpha-value>)`, so opacity
modifiers work on every token (`bg-accent-lime/15`, `border-border/60`).

**Never write a hex value in a component.** Use the token classes.

### Derivation

`mix(a, b, t)` = a → b by t (0 = a, 1 = b), per RGB channel.
`light` = WCAG luminance of the background > 0.4.
`away` = black on a light background, white on a dark one.
`text` = `#141416` on light, `#F4F1EB` on dark.
`on(c)` = `#141416` if luminance(c) > 0.35, else `#FFFFFF`.

| Token (`--c-…`) | Tailwind | Formula | Use |
| --- | --- | --- | --- |
| `bg` | `bg-bg` | background | Page |
| `bg-deep` | `bg-bg-deep` | mix(bg, away, 0.017) | End of the card gradient |
| `surface` | `bg-surface` | mix(bg, away, light ? 0.04 : 0.034) | Cards, sheets, the dock |
| `surface-2` | `bg-surface-2` | mix(bg, away, light ? 0.075 : 0.072) | Fields, chips, hover rows |
| `border` | `border-border` | mix(bg, away, light ? 0.14 : 0.119) | Lines, outlines |
| `text` | `text-text-base` | text | Body text, logo outline |
| `text-muted` | `text-text-muted` | mix(text, bg, 0.38) | Secondary lines |
| `text-subtle` | `text-text-subtle` | mix(text, bg, 0.58) | Labels, hints, counts |
| `accent` | `*-accent-lime` | accent | See section 2 |
| `accent-hover` | `*-accent-lime-hover` | mix(accent, light ? black : white, 0.22) | Hover |
| `on-accent` | `text-on-accent` | on(accent) | Text/icons on accent fills |
| `accent-950/900/700` | `*-lime-950/900/700` | mix(bg, accent, 0.10 / 0.28 / 0.50) | Accent washes: attended chip, banner glow |
| `highlight` | `*-accent-pink` | highlight | See section 2 |
| `highlight-hover` | `*-accent-pink-hover` | mix(highlight, light ? black : white, 0.20) | Hover |
| `on-highlight` | `text-on-highlight` | on(highlight) | Text on highlight fills (count badges) |
| `highlight-950/900/800` | `*-rose-950/900/800` | mix(bg, highlight, 0.10 / 0.28 / 0.40) | Warning washes |

(The `lime` / `pink` class names are historical — they mean *accent* /
*highlight* whatever colours the theme sets.)

### Where else the theme goes
- **Page background:** `bg` plus two soft glows — accent at 6% from the top,
  highlight at 4% from the bottom (`radial-gradient(ellipse at top/bottom …)`,
  fixed).
- **Browser chrome:** `<meta name="theme-color">` = background;
  `color-scheme` = light or dark to match.
- **Text selection:** accent fill, on-accent text.
- **Maps:** `mapStyles(theme)` tints the map from bg → accent; pins are round,
  highlight-filled with a lighter ring (`markerIcon`).
- **Favicon:** `applyFavicon` swaps the template's `#0B0B0C` → background and
  `#A8FF3E` → accent.
- **Share images:** background, accent, highlight, text and the accent-900
  wash from the cached theme.

### Applying it
- `applyTheme(theme)` sets every variable on `<html>`, the theme-colour meta
  and `color-scheme`, and caches the theme (`tagg.theme`) and computed
  variables (`tagg.themeVars`) in localStorage.
- A small inline script in `index.html` applies the cached variables **before
  first paint**, so there is never a flash of the default colours.
- Light backgrounds: surfaces step *darker*, text flips to near-black. Photo
  viewers, banners over flyers and map pins stay dark/vivid on purpose.

### Readability (checked live on the Brand page; WCAG)
- Body text ≥ 4.5:1 on the background.
- Accent and highlight ≥ 3:1 on the background.
- Text on an accent button ≥ 4.5:1.

---

## 4. Theme templates

The Brand page offers these, grouped Dark / Mid / Light, each drawn as a
miniature of the app. Every one passes the readability checks.

**Dark**

| Name | Vibe | Accent | Highlight | Background |
| --- | --- | --- | --- | --- |
| Tinnitus (default) | The original | `#A8FF3E` | `#FF3D6E` | `#141416` |
| Neon night | Cyan + magenta | `#2EF2FF` | `#FF2ED1` | `#0A0A12` |
| Acid | Loud yellow | `#F5FF2E` | `#FF5A1F` | `#0D0D0B` |
| Sunset strip | Orange on plum | `#FF8A3D` | `#FF3D7F` | `#1A0F1F` |
| Deep sea | Teal + coral | `#3DFFC5` | `#FF7A59` | `#071A1F` |
| Ultraviolet | Purple haze | `#B48CFF` | `#FF5FA2` | `#120F1C` |
| Ember | Gold + fire | `#FFB23D` | `#FF3D3D` | `#17110D` |
| Blackout | Monochrome | `#F2F2F2` | `#FF3D3D` | `#000000` |

**Mid** (coloured darks and mid-light greys/earths)

| Name | Vibe | Accent | Highlight | Background |
| --- | --- | --- | --- | --- |
| Slate | Frost + sand | `#88C0D0` | `#EBCB8B` | `#2E3440` |
| Denim | Yellow on blue | `#FFD23F` | `#EE6C4D` | `#23395B` |
| Forest | Gold + clay | `#E9C46A` | `#F4A261` | `#1F3A2E` |
| Burgundy | Rosé + butter | `#F7B2BD` | `#FFD166` | `#4A1C2B` |
| Dusk | Peach + mint | `#FFB4A2` | `#9DE0AD` | `#3D3B6B` |
| Concrete | Grey + lemon | `#FFE066` | `#FF8FA3` | `#55585E` |
| Fog | Navy + red | `#1E3A8A` | `#B91C1C` | `#C8CDD4` |
| Sage | Pine + wine | `#1F3D2B` | `#8B1E3F` | `#B7C9B0` |
| Clay | Plum + teal | `#3B1F5C` | `#0F4C5C` | `#D9B8A0` |

**Light**

| Name | Vibe | Accent | Highlight | Background |
| --- | --- | --- | --- | --- |
| Daylight | Green + pink | `#1F7A4D` | `#D6336C` | `#F6F4EF` |
| Gig poster | Cream + red | `#D7261E` | `#1E4FD7` | `#F3EAD6` |
| Newsprint | Black + red | `#111111` | `#E11D48` | `#FFFFFF` |
| Mint | Teal + rust | `#0F766E` | `#C2410C` | `#E6F4EE` |
| Blush | Raspberry + violet | `#BE185D` | `#6D28D9` | `#FCE8EE` |
| Sky | Cobalt + pink | `#1D4ED8` | `#DB2777` | `#E8F0FB` |
| Lemonade | Violet + red | `#7C3AED` | `#DC2626` | `#FFF7CC` |
| Peach | Rust + teal | `#C2410C` | `#0E7490` | `#FFE8D6` |

**Writing a new template:** on dark and mid-dark backgrounds use bright,
saturated accents; on light and mid-light ones use deep accents (luminance
roughly under 0.2). Accent and highlight should differ in hue, since they
sit side by side in the logo. Check all three readability ratios.

---

## 5. Typography

Fonts (Google Fonts): **Archivo** 500–900 for display, **Inter** 400–700 for
everything else, **JetBrains Mono** 400/600 for codes and hex values.

| Class | Size | Font | Use |
| --- | --- | --- | --- |
| `.h-page` | 30 → 36 px, line-height 1.05 | Archivo 800, tracking −0.015em | One per page, in `PageHeader` |
| `.h-section` | 20 → 22 px | Archivo 800 | Section titles |
| body | 15 px | Inter | Default text; row titles semibold |
| `.meta` | 14 px | Inter, text-muted | Second lines, helper text |
| `.label` | 14 px semibold | Inter, text-muted | Form label above a field |
| `.eyebrow` | 11 px caps, tracking 0.12em | Inter semibold, text-subtle | Label above a title, group labels |
| `font-display` + size | any | Archivo 800 | Big numbers, the year in Year in review |
| small UI | 10.5–12 px | Inter semibold/bold | Dock labels, badges, chips |

- The `→` in a size means phone → ≥ 640 px.
- Numbers use tabular figures (set on `body`) so counts and dates line up.
- Long titles: `line-clamp-2` in rows, `truncate` for single-line subtitles.
- Inputs are 16 px on phones so iOS doesn't zoom into them.

---

## 6. Layout and shell

- **Phone first.** Design at 375 px wide, then relax at `sm:` (≥ 640 px).
- **Installed-app feel:** `apple-mobile-web-app-capable`, translucent status
  bar, no tap highlight, `overscroll-behavior-y: contain` (own pull to
  refresh), smooth scrolling, pinch-zoom allowed.
- **Top bar:** sticky, 56 px (64 px on desktop) plus the top safe area,
  `bg-bg/90` frosted (`backdrop-blur-xl`), bottom border. Left: logo (and text
  tabs on desktop). Right: 40 px round buttons — search (outlined), **+ add**
  (accent fill), account (avatar initial in an accent circle).
- **Content:** `max-w-5xl`, `px-4` (`sm:px-6`), `pt-6`; bottom padding of
  6.5 rem + the bottom safe area on phones so nothing hides under the dock.
- **Tab dock (phones):** floats 12 px above the bottom safe area, `max-w-md`,
  a 5-column grid in a 28 px-radius pill: `bg-surface/75`, `border-white/10`,
  `ring-1 ring-black/40`, `backdrop-blur-2xl backdrop-saturate-150`, deep
  shadow. Each tab is 56 px tall with a 22 px-radius active pill, icon above a
  10.5 px label; active = accent pill, filled icon, bold label. Presses scale
  to 0.92. Tapping the active tab scrolls to the top. A gradient fade from
  `bg` sits behind it so content dissolves under the dock.
- **Things pinned to the bottom** (save bar, select-mode action bar, upload
  ring) sit above the dock: `bottom-[calc(5.75rem+env(safe-area-inset-bottom))]`,
  `sm:bottom-6`.
- **Page anatomy:** `PageHeader` (eyebrow, title, count, actions) → filters →
  content. Detail pages start with a full-width `Hero`/`Banner` (blurred
  image, back button top-left, status top-right, actions below).
- **Spacing:** `space-y-6`–`8` between sections, `space-y-3` inside one,
  `gap-3` in grids, `p-4 sm:p-5` inside cards; grids are 2 columns on phones,
  3 from `sm:`.
- **No horizontal scroll strips.** Wrap, use a select on phones, or a sheet.
- **Touch targets ≥ 44 px** (`h-11`/`h-12` on phones), rows ≥ 64 px.

### Layers (z-index)

| z | What |
| --- | --- |
| 30 | Pull-to-refresh spinner, dock fade, sticky sub-bars (offline banner) |
| 40 | Top bar, tab dock, floating save/action bars |
| 50 | Sheets (with a `bg-black/70` blurred backdrop) |
| 100 | Full-screen image viewer (`bg-black/90`) |

---

## 7. Surfaces, depth and motion

| Thing | Recipe |
| --- | --- |
| `.card` | 18 px radius, `border-border/60`, gradient `surface → bg-deep` top to bottom, inner top highlight `inset 0 1px 0 rgba(255,255,255,.05)`, soft drop `0 12px 32px -16px rgba(0,0,0,.7)` |
| `.field` | 14 px radius, `bg-surface-2`, `border-border`, 15 px text, `px-4`; focus = accent border + 2 px accent ring at 20% |
| `.btn` | Fully round, 44 px tall on phones (40 px desktop), `px-5`, 15 px semibold; `.btn-sm` 36 px (32 px desktop); `lg` 48 px |
| `.btn-primary` | Accent fill, on-accent text, accent-hover on hover |
| `.btn-secondary` | `bg-surface-2`, border, border lightens on hover |
| `.btn-ghost` | Muted text, `surface-2` on hover |
| `.btn-danger` | Muted text, red wash and highlight text on hover |
| `.chip` | Fully round, `bg-surface-2`, border, 14 px medium, muted |
| Floating bars and the dock | `bg-surface/75–95`, `backdrop-blur-xl/2xl`, `border-white/10` or `border-border`, `shadow-2xl shadow-black/50` |
| Sheet | Bottom sheet on phones (top corners 24 px, grab handle 40×6 px, max 92 dvh), centred dialog on desktop (24 px radius, `max-w-lg` / `max-w-xl`) |
| Radii scale | 6 · 8 · 10 · 14 (`xl`) · 18 (`2xl`) · 22/28 (dock) · full (buttons, pills, badges, avatars) |

**Motion:** quick and physical, never decorative.
- Presses: `active:scale-95` on buttons, `0.92` on dock tabs, `0.97` on cards.
- Colour changes: `transition-colors` (≈150 ms); dock tabs 200 ms.
- Loading: skeletons pulse; spinners only inside small round buttons
  (pull to refresh, uploads).
- No page transitions, no parallax, no bouncing.

---

## 8. Components (`components/ui/kit.tsx` unless noted)

| Component | Use it for |
| --- | --- |
| `PageHeader` | Every index page's title row |
| `Hero` / `Banner` | Detail page header over a blurred image |
| `Section` | A titled card holding one block of content |
| `List` + `ListGroupLabel` | A card of rows, optionally grouped (by month) |
| `EventRow` | A dated thing (show). `DateBlock` on the left; `selected`/`onSelect` for select mode |
| `EntityRow` | A named thing with an avatar (artist, venue) |
| `DateBlock` | Ticket-style date: highlight month over a big display-font day |
| `MediaCard` | Image-led grid card (venues, festivals, flyers: `aspect="portrait"`) |
| `LinkCard` | A card that navigates (eyebrow / title / sub); `accent` for the one to notice |
| `StatTile` / `StatGrid` | Headline numbers (`accent="lime"` / `"pink"` for emphasis) |
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
| `Wordmark` (`components/Wordmark.tsx`) | The logo, `sm`/`md`/`lg`/`xl` (40/60/88/120 px tall) |
| `ColorPicker` (`components/ColorPicker.tsx`) | Inline colour picker: saturation/brightness field, hue slider (28–36 px thumbs, drag anywhere), one row of 8 quick swatches, hex box with a preview chip. Never the native `<input type=color>` — it opens a different dialog on every platform |
| `ThemeCard` (`routes/BrandPage.tsx`) | A theme shown as a miniature of the app: logo, eyebrow, a date-row card, a primary and a secondary button, then name and vibe |
| `Button` (`ui/button.tsx`) | `primary` (one per view), `secondary`, `ghost`, `danger`; `sm`/`md`/`lg` |

CSS classes for plain elements: `.card`, `.field`, `.btn …`, `.chip`,
`.link-action`, `.eyebrow`, `.meta`, `.label`, `.h-page`, `.h-section`.

Adding a component: build it from tokens, put it in the kit, add it to the
Style guide page, and list it here.

---

## 9. Patterns

- **Theme editor:** templates first (tap to try; the whole app changes live),
  then *Make it yours* — tap which colour to change (round swatch tabs), drag
  in the picker. Readability warnings appear inline. Nothing is saved until
  *Save*; leaving the page restores the saved theme.
- **Unsaved changes:** a floating save bar above the dock (*Undo* / *Save*)
  appears only while there is something to save; editors preview live.
- **Choosing a look:** show choices as miniatures of the real thing, not
  names in a list.
- **Select mode:** a *Select* button turns rows into toggles (`EventRow
  onSelect`); a floating action bar above the dock shows the count and action.
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
- **Counts on tabs:** a small highlight badge with on-highlight text.
- **Errors:** inline, near what failed, in the highlight colour; keep the
  user's input.
- **Offline / pending:** a slim yellow banner under the top bar.

---

## 10. Icons

- Inline SVG, `stroke="currentColor"`, stroke width 2–2.25, round caps and
  joins, 24 px in the dock and top bar, 16–20 px inline.
- Active dock icons get a 22% fill (`fill="currentColor" fillOpacity={0.22}`).
- Icon-only buttons need `aria-label` (and `title` for shortcuts).

---

## 11. Accessibility checklist

- Readability targets in section 3 (the Brand page warns when they're missed;
  every template passes).
- Focus is visible (`focus:ring-2 ring-accent-lime/20` on fields,
  `focus-visible:ring-accent-lime/50` on buttons).
- Every interactive element is a real `button`/`a`; toggles use
  `aria-pressed`/`role="switch"`; tabs use `role="tab"`/`aria-selected`;
  the picker's field and hue bar are `role="slider"`.
- Images: meaningful ones get `alt`; decorative ones `alt=""`.
- Nothing is hover-only — touch screens show controls (`[@media(hover:none)]`).

---

## 12. Don'ts

- No raw hex, no Tailwind palette colours for brand surfaces (`bg-zinc-900`,
  `text-white` on cards or on accent/highlight fills) — use tokens and the
  `on-*` colours.
- No second modal style, no full-screen blocking spinners.
- No horizontal scrolling rows, no hover-only actions.
- No native colour inputs, and no browser alerts except as a last-resort
  error.
- No new font sizes outside the scale in section 5.

---

## Change log of this guide

- **2026-10-23** — First version: theme engine (four colours → tokens), light
  backgrounds, admin Brand & theme page, Style guide page, reuse checklist.
- **2026-10-23** — Brand page rebuilt: template gallery (10 themes shown as
  app miniatures), `ColorPicker` component, floating save bar pattern.
- **2026-10-23** — Three colours, not four: the logo is accent (TINNITUS) +
  highlight (a-go-go), outlined in the text colour; the favicon mark uses the
  accent. 25 templates in Dark / Mid / Light groups, all listed with values.
  Rewritten as a full recipe: derivation formulas, shell sizes, layers,
  surface recipes, motion, fonts, where else the theme goes.
