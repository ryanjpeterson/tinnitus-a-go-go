/**
 * "Did you mean …?" matching for name inputs: when a search finds nothing, the
 * page searches again with a shorter stem and suggests the closest name.
 */

/** Levenshtein edit distance (case-insensitive inputs expected). */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!;
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j - 1]!, row[j]!);
      prev = tmp;
    }
  }
  return row[n]!;
}

/** The fallback search text: the first 70% of what was typed, at least 3 characters. */
export function searchStem(value: string): string {
  return value.slice(0, Math.max(3, Math.floor(value.length * 0.7)));
}

/** The candidate closest to `value` by name, if within `maxDistance` edits (first wins ties). */
export function closestByName<T extends { name: string }>(value: string, candidates: T[], maxDistance = 2): T | null {
  const target = value.toLowerCase();
  let best: T | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(target, c.name.toLowerCase());
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return bestDist <= maxDistance ? best : null;
}
