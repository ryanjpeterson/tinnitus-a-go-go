/**
 * Theme templates for the Brand page, in three sets: Everyday (Dark / Mid /
 * Light), Flags and Holidays. Every one passes the readability checks (text
 * 4.5:1, accent and highlight 3:1 and support 4.5:1 on the background, button
 * text 4.5:1) and keeps its colours clearly apart. The app's own default is
 * added at the front unless it is already one of them.
 *
 * A template may leave out support (`t(…)` with three colours); the engine
 * then derives one.
 *
 * Part of jimbo-ui (foundation — don't edit here; change jimbo-ui and update).
 */

import { BRAND } from "./brand.config";
import { fullTheme, THEME_KEYS, type Theme } from "./theme";

export type Template = { name: string; vibe: string; theme: Theme };
export type TemplateGroup = { label: string; templates: Template[] };
export type TemplateSet = { label: string; groups: TemplateGroup[] };

/** name, vibe, then accent, highlight, background and (optional) support. */
const t = (name: string, vibe: string, accent: string, highlight: string, background: string, support?: string): Template =>
  ({ name, vibe, theme: { accent, highlight, background, ...(support ? { support } : {}) } });

const SETS: TemplateSet[] = [
  { label: "Everyday", groups: [
    { label: "Dark", templates: [
      t("Volt", "Lime, hot pink, sky", "#A8FF3E", "#FF3D6E", "#141416", "#2EC5FF"),
      t("Neon night", "Cyan, magenta, lemon", "#2EF2FF", "#FF2ED1", "#0A0A12", "#FFE53D"),
      t("Acid", "Yellow, orange, violet", "#F5FF2E", "#FF5A1F", "#0D0D0B", "#B98CFF"),
      t("Sunset strip", "Orange, pink, teal", "#FF8A3D", "#FF3D7F", "#1A0F1F", "#3DDCC8"),
      t("Deep sea", "Teal, coral, periwinkle", "#3DFFC5", "#FF7A59", "#071A1F", "#9BB0FF"),
      t("Ultraviolet", "Purple, pink, mint", "#B48CFF", "#FF5FA2", "#120F1C", "#5CF2B8"),
      t("Ember", "Gold, fire, ice", "#FFB23D", "#FF3D3D", "#17110D", "#7FD4FF"),
      t("Blackout", "White, red, blue", "#F2F2F2", "#FF3D3D", "#000000", "#4D94FF"),
    ] },
    { label: "Mid", templates: [
      t("Slate", "Frost, sand, heather", "#88C0D0", "#EBCB8B", "#2E3440", "#D3AECB"),
      t("Denim", "Yellow, coral, aqua", "#FFD23F", "#EE6C4D", "#23395B", "#8EE6DC"),
      t("Forest", "Gold, clay, sky", "#E9C46A", "#F4A261", "#1F3A2E", "#AEDBF5"),
      t("Burgundy", "Rosé, butter, mint", "#F7B2BD", "#FFD166", "#4A1C2B", "#A6EBCF"),
      t("Dusk", "Peach, mint, butter", "#FFB4A2", "#9DE0AD", "#3D3B6B", "#FFE38A"),
      t("Concrete", "Lemon, pink, sky", "#FFE066", "#FF8FA3", "#45484D", "#9AD8FF"),
      t("Fog", "Navy, red, pine", "#1E3A8A", "#B91C1C", "#C8CDD4", "#14532D"),
      t("Sage", "Pine, wine, navy", "#1F3D2B", "#8B1E3F", "#B7C9B0", "#1E2F6B"),
      t("Clay", "Plum, teal, rust", "#3B1F5C", "#0F4C5C", "#D9B8A0", "#6B260B"),
    ] },
    { label: "Light", templates: [
      t("Daylight", "Green, pink, violet", "#1F7A4D", "#D6336C", "#F6F4EF", "#5B3FD1"),
      t("Gig poster", "Red, blue, green", "#D7261E", "#1E4FD7", "#F3EAD6", "#0F6B4F"),
      t("Newsprint", "Black, red, blue", "#111111", "#E11D48", "#FFFFFF", "#1D4ED8"),
      t("Mint", "Teal, rust, purple", "#0F766E", "#C2410C", "#E6F4EE", "#6D28D9"),
      t("Blush", "Raspberry, violet, teal", "#BE185D", "#6D28D9", "#FCE8EE", "#0B5E57"),
      t("Sky", "Cobalt, pink, green", "#1D4ED8", "#DB2777", "#E8F0FB", "#116632"),
      t("Lemonade", "Violet, red, teal", "#7C3AED", "#DC2626", "#FFF7CC", "#0B5C73"),
      t("Peach", "Rust, teal, plum", "#C2410C", "#0E7490", "#FFE8D6", "#86198F"),
    ] },
  ] },
  { label: "Flags", groups: [
    { label: "Flags", templates: [
      t("USA", "Red, white and blue", "#E0283F", "#F2F2F2", "#0B1B3D", "#6FA8FF"),
      t("Italy", "Green, white and red", "#007A3D", "#CD212A", "#FAFAF5", "#1F4E8C"),
      t("Germany", "Black, red and gold", "#FFCE00", "#FF4B3E", "#0E0E0E", "#F2F2F2"),
      t("Ireland", "Green, white and orange", "#3DDC84", "#FF9F43", "#0C2418", "#F5F5F0"),
      t("Sweden", "Blue and yellow", "#FECC02", "#FFFFFF", "#004B87", "#8FD0FF"),
      t("Jamaica", "Black, gold and green", "#FED100", "#2BB24C", "#0A0A0A", "#FF7A45"),
      t("Brazil", "Green, yellow and blue", "#FFDF00", "#9DBBFF", "#004D26", "#FFFFFF"),
      t("Mexico", "Green, white and red", "#006847", "#CE1126", "#FFFFFF", "#7A4A12"),
      t("India", "Saffron, white and green", "#FF9933", "#46C35A", "#0A0F3D", "#F2F2F2"),
      t("South Africa", "Green, gold, red and blue", "#1FC77A", "#FFB612", "#0B0B0B", "#6E9BFF"),
    ] },
  ] },
  { label: "Holidays", groups: [
    { label: "Through the year", templates: [
      t("Lunar new year", "Gold and jade on red", "#FFD24A", "#FF9A7A", "#5A0A0A", "#5FE0B4"),
      t("Valentine's", "Red, pink and purple", "#C9184A", "#D63384", "#FFF0F3", "#6A23B0"),
      t("St Patrick's", "Shamrock, gold and sky", "#4ADE80", "#FFD54A", "#0B2016", "#8CC4FF"),
      t("Easter", "Violet, pink and green", "#6D28D9", "#BE185D", "#F4EEFF", "#0F6630"),
      t("Pride", "Yellow, red and blue", "#FFD93D", "#FF4D6D", "#121212", "#4DA3FF"),
      t("Halloween", "Pumpkin, purple and slime", "#FF7A1A", "#B266FF", "#120D17", "#8CFF4F"),
      t("Diwali", "Marigold, magenta and teal", "#FFB020", "#FF3DA5", "#1A0B2E", "#2DD4BF"),
      t("Harvest", "Pumpkin, mustard and sage", "#FF9A3C", "#E8C04A", "#1E140C", "#A7CC94"),
      t("Hanukkah", "Blue, silver and gold", "#5AA9FF", "#DDE3EA", "#0A1838", "#FFC94D"),
      t("Christmas", "Red, gold and green", "#DC1F2A", "#FFC94D", "#0B1A12", "#3FBF6F"),
      t("Christmas morning", "Red and green on snow", "#C8102E", "#146B3A", "#FFF9F5", "#6F5000"),
      t("New year's eve", "Champagne, fuchsia and ice", "#F2C14E", "#FF3DA5", "#0A0A0F", "#5BC0FF"),
    ] },
  ] },
];

const same = (a: Theme, b: Theme) => {
  const [x, y] = [fullTheme(a), fullTheme(b)];
  return THEME_KEYS.every((k) => x[k].toUpperCase() === y[k].toUpperCase());
};
const isTemplate = (theme: Theme) => SETS.some((s) => s.groups.some((g) => g.templates.some((x) => same(x.theme, theme))));

/** The sets the Brand page shows (Everyday, Flags, Holidays); the app's default leads Everyday when it isn't a template. */
export const TEMPLATE_SETS: TemplateSet[] = isTemplate(BRAND.defaultTheme)
  ? SETS
  : SETS.map((s, i) => i > 0 ? s : { ...s, groups: [{ label: "Yours", templates: [{ name: BRAND.name, vibe: "Default", theme: BRAND.defaultTheme }] }, ...s.groups] });

/** Every group in one list (for apps whose Brand page predates sets, and the contrast report). */
export const TEMPLATE_GROUPS: TemplateGroup[] = TEMPLATE_SETS.flatMap((s) => s.groups);

/** True when two themes have the same colours (a missing support counts as its derived one). */
export const sameTheme = same;
