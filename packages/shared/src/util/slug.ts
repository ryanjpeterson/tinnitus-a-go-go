/**
 * Slug helper used by importers and the API to derive canonical lookup keys
 * for venues / artists / event series. Pure; safe to use anywhere.
 *
 * Examples:
 *   "Air Canada Centre" → "air-canada-centre"
 *   "Saint-Jean-sur-Richelieu" → "saint-jean-sur-richelieu"
 *   "Warped Tour 2011" → "warped-tour-2011"
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}
