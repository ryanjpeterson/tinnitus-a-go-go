import { describe, expect, it } from "vitest";
import { closestByName, levenshtein, searchStem } from "@/lib/fuzzy";

describe("levenshtein", () => {
  it("counts edits", () => {
    expect(levenshtein("radiohead", "radiohead")).toBe(0);
    expect(levenshtein("radiohed", "radiohead")).toBe(1);
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("searchStem", () => {
  it("keeps 70% of the text, at least three characters", () => {
    expect(searchStem("radiohed")).toBe("radio");
    expect(searchStem("abcd")).toBe("abc");
  });
});

describe("closestByName ('did you mean …?')", () => {
  const artists = [{ name: "Radiohead" }, { name: "Radio Dept." }, { name: "Rancid" }];

  it("suggests the closest name within two edits, ignoring case", () => {
    expect(closestByName("radiohed", artists)).toEqual({ name: "Radiohead" });
    expect(closestByName("RADIOHEAD", artists)).toEqual({ name: "Radiohead" });
  });

  it("suggests nothing when every name is too far off", () => {
    expect(closestByName("metallica", artists)).toBeNull();
    expect(closestByName("radiohed", [])).toBeNull();
  });

  it("keeps the first candidate on a tie", () => {
    expect(closestByName("ab", [{ name: "ac" }, { name: "ad" }])).toEqual({ name: "ac" });
  });
});
