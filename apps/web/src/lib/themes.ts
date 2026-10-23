/**
 * Theme templates for the Brand page, grouped Dark / Mid / Light. Every one
 * passes the readability checks (text 4.5:1, accent and highlight 3:1 on the
 * background, button text 4.5:1). The app's own default is added at the front
 * unless it is already one of them.
 *
 * Part of jimbo-ui (foundation — don't edit here; change jimbo-ui and update).
 */

import { BRAND } from "./brand.config";
import type { Theme } from "./theme";

export type Template = { name: string; vibe: string; theme: Theme };
const t = (name: string, vibe: string, accent: string, highlight: string, background: string): Template =>
  ({ name, vibe, theme: { accent, highlight, background } });

const GROUPS: { label: string; templates: Template[] }[] = [
  { label: "Dark", templates: [
    t("Volt", "Lime + hot pink", "#A8FF3E", "#FF3D6E", "#141416"),
    t("Neon night", "Cyan + magenta", "#2EF2FF", "#FF2ED1", "#0A0A12"),
    t("Acid", "Loud yellow", "#F5FF2E", "#FF5A1F", "#0D0D0B"),
    t("Sunset strip", "Orange on plum", "#FF8A3D", "#FF3D7F", "#1A0F1F"),
    t("Deep sea", "Teal + coral", "#3DFFC5", "#FF7A59", "#071A1F"),
    t("Ultraviolet", "Purple haze", "#B48CFF", "#FF5FA2", "#120F1C"),
    t("Ember", "Gold + fire", "#FFB23D", "#FF3D3D", "#17110D"),
    t("Blackout", "Monochrome", "#F2F2F2", "#FF3D3D", "#000000"),
  ] },
  { label: "Mid", templates: [
    t("Slate", "Frost + sand", "#88C0D0", "#EBCB8B", "#2E3440"),
    t("Denim", "Yellow on blue", "#FFD23F", "#EE6C4D", "#23395B"),
    t("Forest", "Gold + clay", "#E9C46A", "#F4A261", "#1F3A2E"),
    t("Burgundy", "Rosé + butter", "#F7B2BD", "#FFD166", "#4A1C2B"),
    t("Dusk", "Peach + mint", "#FFB4A2", "#9DE0AD", "#3D3B6B"),
    t("Concrete", "Grey + lemon", "#FFE066", "#FF8FA3", "#45484D"),
    t("Fog", "Navy + red", "#1E3A8A", "#B91C1C", "#C8CDD4"),
    t("Sage", "Pine + wine", "#1F3D2B", "#8B1E3F", "#B7C9B0"),
    t("Clay", "Plum + teal", "#3B1F5C", "#0F4C5C", "#D9B8A0"),
  ] },
  { label: "Light", templates: [
    t("Daylight", "Green + pink", "#1F7A4D", "#D6336C", "#F6F4EF"),
    t("Gig poster", "Cream + red", "#D7261E", "#1E4FD7", "#F3EAD6"),
    t("Newsprint", "Black + red", "#111111", "#E11D48", "#FFFFFF"),
    t("Mint", "Teal + rust", "#0F766E", "#C2410C", "#E6F4EE"),
    t("Blush", "Raspberry + violet", "#BE185D", "#6D28D9", "#FCE8EE"),
    t("Sky", "Cobalt + pink", "#1D4ED8", "#DB2777", "#E8F0FB"),
    t("Lemonade", "Violet + red", "#7C3AED", "#DC2626", "#FFF7CC"),
    t("Peach", "Rust + teal", "#C2410C", "#0E7490", "#FFE8D6"),
  ] },
];

const same = (a: Theme, b: Theme) =>
  (["accent", "highlight", "background"] as const).every((k) => a[k].toUpperCase() === b[k].toUpperCase());

export const TEMPLATE_GROUPS: { label: string; templates: Template[] }[] =
  GROUPS.some((g) => g.templates.some((x) => same(x.theme, BRAND.defaultTheme)))
    ? GROUPS
    : [{ label: "Yours", templates: [{ name: BRAND.name, vibe: "Default", theme: BRAND.defaultTheme }] }, ...GROUPS];
