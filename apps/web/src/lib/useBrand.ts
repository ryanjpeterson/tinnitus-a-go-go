/**
 * The brand theme from the server (colours, logo, favicon), applied to the
 * page as it changes. Starts from the copy cached in localStorage so there's
 * no flash of the default colours, and works offline from that copy.
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { applyFavicon, applyTheme, DEFAULT_THEME, THEME_STORAGE_KEY, type Theme } from "./theme";

const BRAND_CACHE_KEY = "tagg.brand";

export interface Brand { theme: Theme; logoUrl: string | null; faviconUrl: string | null }

function cached(): Brand | undefined {
  try {
    const raw = localStorage.getItem(BRAND_CACHE_KEY);
    if (!raw) return undefined;
    const b = JSON.parse(raw) as Brand;
    // Re-shape through the defaults so a copy cached by an older version (extra or missing colours) can't leak through.
    return { ...b, theme: withDefaults(b.theme ?? {}) };
  } catch {
    return undefined;
  }
}

/** Server values over the defaults (unset colours fall back). */
export function withDefaults(t: Partial<Record<keyof Theme, string | null>>): Theme {
  return {
    accent: t.accent || DEFAULT_THEME.accent,
    highlight: t.highlight || DEFAULT_THEME.highlight,
    background: t.background || DEFAULT_THEME.background,
  };
}

export function useBrand(): Brand {
  const q = useQuery({
    queryKey: ["brand"],
    queryFn: async (): Promise<Brand> => {
      const r = await api.getTheme();
      return { theme: withDefaults(r.theme), logoUrl: r.logoUrl, faviconUrl: r.faviconUrl };
    },
    initialData: cached,
    staleTime: 5 * 60_000,
  });
  return q.data ?? { theme: DEFAULT_THEME, logoUrl: null, faviconUrl: null };
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
