/**
 * useCopyValue — reads a site-copy key from the public /public/copy cache.
 *
 * Falls back to `fallback` while loading or if the key isn't found.
 * The query is shared across all hooks in the app (same query key),
 * so there's only one network round-trip per page load.
 *
 * Usage:
 *   const tagline = useCopyValue("landing.tagline", "Your ears gave up. We kept notes.");
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useCopyValue(key: string, fallback: string): string {
  const q = useQuery({
    queryKey: ["public/copy"],
    queryFn: () => api.getSiteCopy(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  return q.data?.copy[key] ?? fallback;
}

/**
 * useCopy — returns the full copy map (useful when reading multiple keys at once,
 * avoids multiple hook calls).
 */
export function useCopy(fallbacks: Record<string, string>): Record<string, string> {
  const q = useQuery({
    queryKey: ["public/copy"],
    queryFn: () => api.getSiteCopy(),
    staleTime: 5 * 60 * 1000,
  });
  const copy = q.data?.copy ?? {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(fallbacks)) {
    result[k] = copy[k] ?? v;
  }
  return result;
}
