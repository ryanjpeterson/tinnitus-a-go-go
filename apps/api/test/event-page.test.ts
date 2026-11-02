import { describe, expect, it } from "vitest";
import { extractJsonLd, parseJsonLd, parseMetaTags } from "../src/lib/event-page";

const jsonLdPage = `<html><head>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "MusicEvent",
  name: "Big Band Live",
  startDate: "2025-09-12T20:00:00-04:00",
  location: { "@type": "Place", name: "Massey Hall", address: { addressLocality: "Toronto" } },
  performer: [{ "@type": "MusicGroup", name: "Big Band" }, { "@type": "MusicGroup", name: "Small Band" }],
})}</script>
</head><body></body></html>`;

describe("event page parsing (POST /concerts/parse-url)", () => {
  it("reads a JSON-LD MusicEvent", () => {
    const blocks = extractJsonLd(jsonLdPage);
    expect(blocks).toHaveLength(1);
    const ev = parseJsonLd(blocks);
    expect(ev).toMatchObject({
      date: "2025-09-12",
      venueName: "Massey Hall",
      venueCity: "Toronto",
      artists: ["Big Band", "Small Band"],
    });
  });

  it("ignores broken JSON-LD blocks", () => {
    expect(extractJsonLd(`<script type="application/ld+json">{nope</script>`)).toEqual([]);
  });

  it("falls back to Open Graph tags", () => {
    const html = `<meta property="og:title" content="Night Out" />
      <meta property="og:description" content="Live at The Horseshoe, Toronto." />`;
    expect(parseMetaTags(html)).toMatchObject({ eventName: "Night Out", venueName: "The Horseshoe", confidence: "low" });
  });
});
