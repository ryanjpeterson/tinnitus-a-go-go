import { describe, expect, it } from "vitest";
import { cleanBio, getBestImageUrl, getGenreFromTags, type LastfmArtistImage } from "../src/lib/lastfm-core";

const PLACEHOLDER = "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png";
const img = (size: LastfmArtistImage["size"], url: string): LastfmArtistImage => ({ size, "#text": url });

describe("Last.fm parsers (API enrich route and worker job)", () => {
  it("picks the largest real image", () => {
    expect(getBestImageUrl([img("small", "s.jpg"), img("mega", "m.jpg"), img("large", "l.jpg")])).toBe("m.jpg");
  });

  it("skips Last.fm's placeholder star image", () => {
    expect(getBestImageUrl([img("mega", PLACEHOLDER), img("large", "l.jpg")])).toBe("l.jpg");
    expect(getBestImageUrl([img("mega", PLACEHOLDER), img("large", PLACEHOLDER)])).toBeNull();
    expect(getBestImageUrl([])).toBeNull();
  });

  it("strips HTML and the read-more link from bios", () => {
    const bio = 'A <b>great</b> band from Toronto &amp; Montreal. <a href="https://www.last.fm/music/X">Read more on Last.fm</a>.';
    expect(cleanBio(bio)).toBe("A great band from Toronto & Montreal.");
    expect(cleanBio("too short")).toBeNull();
    expect(cleanBio("")).toBeNull();
  });

  it("joins the top three tags as the genre", () => {
    expect(getGenreFromTags([{ name: "punk", url: "" }, { name: "rock", url: "" }, { name: "ska", url: "" }, { name: "pop", url: "" }]))
      .toBe("punk, rock, ska");
    expect(getGenreFromTags([])).toBeNull();
  });
});
