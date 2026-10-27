import {
  formatCalendarPeriodRangeLabel,
  formatFromToDateLabel,
  formatIsoDayLabel,
  getCalendarPeriodBounds,
  hubDateFilterIsoBounds,
  minMaxIsoDays,
} from "../dateRangePresets";

const NOW = new Date(2026, 7, 17); // Monday 17 Aug 2026

describe("formatCalendarPeriodRangeLabel", () => {
  it("prints From and To dates for each finance period", () => {
    expect(formatCalendarPeriodRangeLabel("TODAY", undefined, NOW)).toBe(
      "From 17 Aug 2026  To 17 Aug 2026",
    );
    expect(formatCalendarPeriodRangeLabel("YESTERDAY", undefined, NOW)).toBe(
      "From 16 Aug 2026  To 16 Aug 2026",
    );
    expect(formatCalendarPeriodRangeLabel("WEEK", undefined, NOW)).toBe(
      "From 17 Aug 2026  To 23 Aug 2026",
    );
    expect(formatCalendarPeriodRangeLabel("MONTH", undefined, NOW)).toBe(
      "From 1 Aug 2026  To 31 Aug 2026",
    );
    expect(formatCalendarPeriodRangeLabel("RANGE", undefined, NOW)).toBeNull();
    expect(
      formatCalendarPeriodRangeLabel(
        "CUSTOM",
        { customFrom: "2026-04-01", customTo: "2026-04-15" },
        NOW,
      ),
    ).toBe("From 1 Apr 2026  To 15 Apr 2026");
  });

  it("maps hub pills to the same inclusive day bounds the list filter uses", () => {
    expect(hubDateFilterIsoBounds("all", undefined, NOW)).toBeNull();
    expect(hubDateFilterIsoBounds("today", undefined, NOW)).toEqual({
      from: "2026-08-17",
      to: "2026-08-17",
    });
    expect(hubDateFilterIsoBounds("this_month", undefined, NOW)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(hubDateFilterIsoBounds("tomorrow", undefined, NOW)).toEqual({
      from: "2026-08-18",
      to: "2026-08-18",
    });
    expect(
      hubDateFilterIsoBounds(
        "custom",
        { customFrom: "2026-09-01", customTo: "2026-09-30" },
        NOW,
      ),
    ).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("returns null bounds for all-time RANGE and min/max from actual days", () => {
    expect(getCalendarPeriodBounds("RANGE", undefined, NOW)).toBeNull();
    expect(formatIsoDayLabel("2026-08-01")).toBe("1 Aug 2026");
    expect(
      formatFromToDateLabel("2026-01-03", "2026-08-17"),
    ).toBe("From 3 Jan 2026  To 17 Aug 2026");
    expect(
      minMaxIsoDays(["2026-08-17", "2026-01-03", "bad", "2026-04-01"]),
    ).toEqual({ from: "2026-01-03", to: "2026-08-17" });
  });
});
