import {
  formatCalendarPeriodRangeLabel,
  formatFromToDateLabel,
  formatIsoDayLabel,
  getCalendarPeriodBounds,
  hubDateFilterIsoBounds,
  isoStringToKolkataDayIso,
  minMaxIsoDays,
  tripDayMatchesHubDateFilter,
} from "../dateRangePresets";

const NOW = new Date(2026, 7, 17); // Monday 17 Aug 2026 (device local, finance labels)
const IST_NOON_17 = new Date("2026-08-17T06:30:00.000Z"); // 12:00 Asia/Kolkata, Monday

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
    expect(hubDateFilterIsoBounds("all", undefined, IST_NOON_17)).toBeNull();
    expect(hubDateFilterIsoBounds("today", undefined, IST_NOON_17)).toEqual({
      from: "2026-08-17",
      to: "2026-08-17",
    });
    expect(hubDateFilterIsoBounds("this_month", undefined, IST_NOON_17)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(hubDateFilterIsoBounds("tomorrow", undefined, IST_NOON_17)).toEqual({
      from: "2026-08-18",
      to: "2026-08-18",
    });
    expect(
      hubDateFilterIsoBounds(
        "custom",
        { customFrom: "2026-09-01", customTo: "2026-09-30" },
        IST_NOON_17,
      ),
    ).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("uses Asia/Kolkata today/week/month even when the device day is still the previous UTC day", () => {
    const istNextDay = new Date("2026-08-16T20:30:00.000Z");
    expect(hubDateFilterIsoBounds("today", undefined, istNextDay)).toEqual({
      from: "2026-08-17",
      to: "2026-08-17",
    });
    expect(hubDateFilterIsoBounds("yesterday", undefined, istNextDay)).toEqual({
      from: "2026-08-16",
      to: "2026-08-16",
    });
    expect(hubDateFilterIsoBounds("tomorrow", undefined, istNextDay)).toEqual({
      from: "2026-08-18",
      to: "2026-08-18",
    });
    expect(hubDateFilterIsoBounds("this_week", undefined, istNextDay)).toEqual({
      from: "2026-08-17",
      to: "2026-08-23",
    });
    expect(hubDateFilterIsoBounds("this_month", undefined, istNextDay)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
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

describe("tripDayMatchesHubDateFilter", () => {
  const custom = { customFrom: "2026-08-17", customTo: "2026-08-17" };

  it("includes a trip when pickup day is in range even if created is not", () => {
    expect(
      tripDayMatchesHubDateFilter(
        { pickup_date: "2026-08-17", created_at: "2026-01-01T10:00:00.000Z" },
        "custom",
        custom,
      ),
    ).toBe(true);
  });

  it("includes a trip when Asia/Kolkata created day is in range even if pickup is not", () => {
    expect(
      tripDayMatchesHubDateFilter(
        { pickup_date: "2026-01-01", created_at: "2026-08-16T18:30:00.000Z" },
        "custom",
        custom,
      ),
    ).toBe(true);
  });

  it("uses inclusive Asia/Kolkata start and end boundaries", () => {
    expect(isoStringToKolkataDayIso("2026-08-16T18:30:00.000Z")).toBe("2026-08-17");
    expect(isoStringToKolkataDayIso("2026-08-17T18:29:59.000Z")).toBe("2026-08-17");
    expect(
      tripDayMatchesHubDateFilter(
        { pickup_date: null, created_at: "2026-08-16T18:30:00.000Z" },
        "custom",
        custom,
      ),
    ).toBe(true);
    expect(
      tripDayMatchesHubDateFilter(
        { pickup_date: null, created_at: "2026-08-17T18:29:59.000Z" },
        "custom",
        custom,
      ),
    ).toBe(true);
  });

  it("excludes timestamps just outside Asia/Kolkata midnight even if the device day differs", () => {
    expect(isoStringToKolkataDayIso("2026-08-16T18:29:59.000Z")).toBe("2026-08-16");
    expect(isoStringToKolkataDayIso("2026-08-17T18:30:00.000Z")).toBe("2026-08-18");
    expect(isoStringToKolkataDayIso("2026-08-16T20:30:00.000Z")).toBe("2026-08-17");
    expect(
      tripDayMatchesHubDateFilter(
        { pickup_date: "2026-08-16", created_at: "2026-08-16T18:29:59.000Z" },
        "custom",
        custom,
      ),
    ).toBe(false);
    expect(
      tripDayMatchesHubDateFilter(
        { pickup_date: null, created_at: "2026-08-16T20:30:00.000Z" },
        "custom",
        custom,
      ),
    ).toBe(true);
  });

  it("applies the same Asia/Kolkata today bounds to list matching and the RPC range", () => {
    const now = new Date("2026-08-16T20:30:00.000Z");
    expect(
      tripDayMatchesHubDateFilter(
        { pickup_date: "2026-08-17", created_at: null },
        "today",
        undefined,
        now,
      ),
    ).toBe(true);
    expect(
      tripDayMatchesHubDateFilter(
        { pickup_date: "2026-08-16", created_at: "2026-08-16T18:29:59.000Z" },
        "today",
        undefined,
        now,
      ),
    ).toBe(false);
  });
});
