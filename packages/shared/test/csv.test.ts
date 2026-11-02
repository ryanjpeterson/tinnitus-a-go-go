import { describe, expect, it } from "vitest";
import { parseCity, parseEventSeries, parseShowsCsv, parseShowsDate, statusForDate } from "../src/csv/parse";

describe("statusForDate", () => {
  it("marks past and same-day shows attended, future ones attending", () => {
    expect(statusForDate("2024-05-01", "2024-05-02")).toBe("attended");
    expect(statusForDate("2024-05-02", "2024-05-02")).toBe("attended");
    expect(statusForDate("2024-05-03", "2024-05-02")).toBe("attending");
  });

  it("defaults to today", () => {
    expect(statusForDate("2000-01-01")).toBe("attended");
    expect(statusForDate("2999-01-01")).toBe("attending");
  });
});

describe("CSV field parsers", () => {
  it("reads the spreadsheet's date format", () => {
    expect(parseShowsDate("Saturday,  March 22, 2008")).toBe("2008-03-22");
    expect(parseShowsDate("not a date")).toBeNull();
  });

  it("splits city and region", () => {
    expect(parseCity("Toronto, ON")).toEqual({ city: "Toronto", region: "ON" });
  });

  it("reads a festival name and its year", () => {
    expect(parseEventSeries("Bluesfest 2025")).toEqual({ name: "Bluesfest 2025", year: 2025 });
    expect(parseEventSeries("null")).toBeNull();
  });
});

describe("parseShowsCsv", () => {
  it("groups one row per artist into one show per date and venue", () => {
    const csv = [
      "type,eventName,date,artist,venue,city,lat,lng,cost,notes",
      'Concert,null,"Saturday,  March 22, 2008",Headliner,The Venue,"Toronto, ON",,,,',
      'Concert,null,"Saturday,  March 22, 2008",Opener,The Venue,"Toronto, ON",,,,great',
      'Festival,Bluesfest 2025,"Friday,  July 4, 2025",Band,LeBreton Flats,"Ottawa, ON",,,,',
    ].join("\n");
    const { shows, totalRows } = parseShowsCsv(csv);
    expect(totalRows).toBe(3);
    expect(shows).toHaveLength(2);
    expect(shows[0]).toMatchObject({
      date: "2008-03-22",
      type: "concert",
      venue: { name: "The Venue", city: "Toronto", region: "ON" },
      artists: [{ name: "Headliner" }, { name: "Opener", appearanceNotes: "great" }],
    });
    expect(shows[1]).toMatchObject({ type: "festival_day", eventSeries: { name: "Bluesfest 2025", year: 2025 } });
  });
});
