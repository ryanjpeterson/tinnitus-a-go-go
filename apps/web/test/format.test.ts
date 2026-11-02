import { describe, expect, it } from "vitest";
import { dateParts, fmtDate, fmtDateLong, monthLabel, plural } from "@/lib/format";
import { initials } from "@/components/ui/jimbo-kit";

describe("date formatting", () => {
  it("formats YYYY-MM-DD in UTC, so no day shifts", () => {
    expect(fmtDate("2023-10-14")).toBe("Oct 14, 2023");
    expect(fmtDate("2024-01-01")).toBe("Jan 1, 2024");
    expect(fmtDateLong("2023-10-14")).toBe("Saturday, October 14, 2023");
    expect(monthLabel("2023-10-14")).toBe("October 2023");
    expect(dateParts("2023-10-14")).toEqual({ month: "OCT", day: "14", year: "2023", weekday: "Sat" });
  });

  it("shows a dash for missing dates and passes unparseable ones through", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("unknown")).toBe("unknown");
  });
});

describe("plural", () => {
  it("picks the word form and groups thousands", () => {
    expect(plural(1, "show")).toBe("1 show");
    expect(plural(2, "show")).toBe("2 shows");
    expect(plural(0, "day")).toBe("0 days");
    expect(plural(1200, "photo")).toBe("1,200 photos");
    expect(plural(3, "city", "cities")).toBe("3 cities");
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Godspeed You! Black Emperor")).toBe("GY");
    expect(initials("  the   national ")).toBe("TN");
    expect(initials("Björk")).toBe("B");
  });
});
