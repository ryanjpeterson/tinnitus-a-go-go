/**
 * Name comparison for spotting duplicate venues and artists.
 *
 * Works on words rather than raw strings so "The Bronson Centre",
 * "Bronson Centre" and "bronson centre" compare equal, and generic venue words
 * ("Theatre", "Centre", "Hall"…) can be ignored for a looser match.
 */

// Words that differ between listings of the same room and shouldn't decide a match.
const VENUE_NOISE = new Set([
  "the", "theatre", "theater", "centre", "center", "hall", "club", "bar", "pub", "arena",
  "stadium", "park", "grounds", "venue", "music", "live", "room", "lounge", "tavern",
]);

function words(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** "The Bronson Centre" → "bronsoncentre"; "Damned, The" → "damned". */
export function normalizeName(name: string): string {
  const w = words(name);
  if (w[0] === "the" && w.length > 1) w.shift();
  if (w[w.length - 1] === "the" && w.length > 1 && /,\s*the\s*$/i.test(name)) w.pop();
  return w.join("");
}

/** Venue name without generic words: "Bronson Theatre" and "The Bronson Centre" → "bronson". */
export function venueCore(name: string): string {
  return words(name).filter((w) => !VENUE_NOISE.has(w)).join("");
}

/** City for comparison: accents, case and punctuation ignored ("Montréal" = "montreal"). */
export function cityKey(city: string | null | undefined): string {
  return city ? words(city).join("") : "";
}

/** 0–1 similarity by edit distance (1 = identical). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return 0;
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    for (let j = 1; j <= lb; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[lb]! / Math.max(la, lb);
}
