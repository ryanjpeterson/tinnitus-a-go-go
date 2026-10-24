/**
 * The brand theme from the server (colours, fonts, logo, favicon), applied to the
 * page as it changes. Starts from the copy cached in localStorage so there's
 * no flash of the default colours, and works offline from that copy.
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { applyFavicon, applyTheme, DEFAULT_THEME, fullTheme, ownColours, THEME_STORAGE_KEY, type FullTheme, type SavedTheme, type Theme } from "./theme";
import { BRAND } from "./brand.config";

// The app's API client provides getTheme(): { theme: { accent, highlight,
// background, support, fonts } (null = default), logoUrl, faviconUrl } — see the
// guide. Tinnitus adds logoUrl: its own logo can be replaced by an upload.
// Highlight and support may be missing (left to inference, or saved before 0.5).
const BRAND_CACHE_KEY = `${BRAND.storagePrefix}.brand`;

export interface Brand {
  /** The colours as set — highlight and support may be missing (inferred). Save this. */
  theme: Theme;
  /** All four colours, missing ones inferred. Read this when you need a colour. */
  colors: FullTheme;
  logoUrl: string | null;
  faviconUrl: string | null;
}

function cached(): Brand | undefined {
  try {
    const raw = localStorage.getItem(BRAND_CACHE_KEY);
    if (!raw) return undefined;
    const b = JSON.parse(raw) as Brand;
    // Re-shape through the defaults so a copy cached by an older version (extra or missing colours) can't leak through.
    const theme = withDefaults(b.theme ?? {});
    return { theme, colors: fullTheme(theme), logoUrl: b.logoUrl ?? null, faviconUrl: b.faviconUrl ?? null };
  } catch {
    return undefined;
  }
}

/**
 * Server values over the defaults. Nothing saved → the default theme. A saved
 * theme keeps its own optional colours: a missing highlight or support stays
 * missing, so the engine infers it to suit the saved accent and background.
 */
export function withDefaults(t: SavedTheme): Theme {
  if (!t.accent && !t.background) return t.fonts ? ownColours({ ...DEFAULT_THEME, fonts: t.fonts }) : DEFAULT_THEME;
  return ownColours({
    accent: t.accent || DEFAULT_THEME.accent,
    background: t.background || DEFAULT_THEME.background,
    ...(t.highlight ? { highlight: t.highlight } : {}),
    ...(t.support ? { support: t.support } : {}),
    ...(t.fonts ? { fonts: t.fonts } : {}),
    ...(t.infer ? { infer: t.infer } : {}),
  });
}

export function useBrand(): Brand {
  const q = useQuery({
    queryKey: ["brand"],
    queryFn: async (): Promise<Brand> => {
      const r = await api.getTheme();
      const theme = withDefaults(r.theme ?? {});
      return { theme, colors: fullTheme(theme), logoUrl: r.logoUrl, faviconUrl: r.faviconUrl };
    },
    initialData: cached,
    // The cached copy paints at once but counts as old, so the server's theme is
    // fetched straight away — otherwise a changed theme shows up to 5 min late.
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000,
  });
  return q.data ?? { theme: DEFAULT_THEME, colors: fullTheme(DEFAULT_THEME), logoUrl: null, faviconUrl: null };
}

/** Mount once (App): keeps the page's colours, favicon and cached copy in step with the theme. */
export function useApplyBrand(): void {
  const brand = useBrand();
  useEffect(() => {
    applyTheme(brand.theme);
    void applyFavicon(brand.theme, brand.faviconUrl);
    try { localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(brand)); } catch { /* storage unavailable */ }
  }, [brand]);
}

export { THEME_STORAGE_KEY };
