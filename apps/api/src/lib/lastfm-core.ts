/**
 * Last.fm response types and parsers — pure, no env or I/O, so the worker can
 * import them too (same arrangement as setlistfm-core.ts).
 */

export interface LastfmArtistImage {
  "#text": string;
  size: "small" | "medium" | "large" | "extralarge" | "mega" | "";
}

export interface LastfmArtistTag {
  name: string;
  url: string;
}

export interface LastfmArtistInfo {
  name: string;
  mbid?: string;
  url: string;
  image: LastfmArtistImage[];
  bio: {
    summary: string;
    content: string;
  };
  tags: {
    tag: LastfmArtistTag[];
  };
  stats: {
    listeners: string;
    playcount: string;
  };
}

/**
 * Extract the best available image URL from Last.fm response
 * Prefers larger sizes: mega > extralarge > large > medium
 */
export function getBestImageUrl(images: LastfmArtistImage[]): string | null {
  const sizeOrder = ["mega", "extralarge", "large", "medium", "small"];

  for (const size of sizeOrder) {
    const img = images.find((i) => i.size === size && i["#text"]);
    if (img && img["#text"]) {
      // Last.fm sometimes returns placeholder images, skip them
      if (img["#text"].includes("2a96cbd8b46e442fc41c2b86b821562f")) {
        continue;
      }
      return img["#text"];
    }
  }

  // Fallback to any image with a URL
  const any = images.find((i) => i["#text"] && !i["#text"].includes("2a96cbd8b46e442fc41c2b86b821562f"));
  return any?.["#text"] ?? null;
}

/**
 * Extract genre from Last.fm tags
 * Returns the first tag as the primary genre
 */
export function getGenreFromTags(tags: LastfmArtistTag[]): string | null {
  if (!tags || tags.length === 0) return null;

  // Take top 2-3 tags and join them
  const topTags = tags.slice(0, 3).map((t) => t.name);
  return topTags.join(", ") || null;
}

/**
 * Clean up bio text from Last.fm
 * Removes HTML tags and "Read more on Last.fm" links
 */
export function cleanBio(bioHtml: string): string | null {
  if (!bioHtml) return null;

  let text = bioHtml
    // Remove "Read more on Last.fm" link and surrounding text
    .replace(/<a href="https:\/\/www\.last\.fm\/.*?>Read more on Last\.fm<\/a>\.?/gi, "")
    // Remove all HTML tags
    .replace(/<[^>]+>/g, "")
    // Decode HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Clean up whitespace
    .replace(/\s+/g, " ")
    .trim();

  // If bio is too short or just whitespace, return null
  if (text.length < 20) return null;

  return text;
}
