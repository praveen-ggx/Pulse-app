import {
  salesReportDayBounds,
  salesReportIndentInWindow,
  salesReportIndentOrFilter,
} from "../salesReportWindow.util";

const novemberWeek = { from: "2026-11-01", to: "2026-11-07" };

describe("salesReportWindow", () => {
  it("includes an indent created in the range even when pickup is in another month", () => {
    expect(
      salesReportIndentInWindow(
        {
          created_at: "2026-11-03T04:30:00.000Z",
          pickup_date: "2026-12-20",
          status: "broadcast",
        },
        novemberWeek,
      ),
    ).toBe(true);
  });

  it("excludes an October indent whose pickup falls inside the selected range", () => {
    expect(
      salesReportIndentInWindow(
        {
          created_at: "2026-10-20T04:30:00.000Z",
          pickup_date: "2026-11-03",
          status: "awarded",
          updated_at: "2026-11-03T10:00:00.000Z",
        },
        novemberWeek,
      ),
    ).toBe(false);
  });

  it("excludes a September indent that was cancelled inside the selected range", () => {
    expect(
      salesReportIndentInWindow(
        {
          created_at: "2026-09-12T04:30:00.000Z",
          pickup_date: "2026-09-15",
          status: "cancelled",
          updated_at: "2026-11-04T10:00:00.000Z",
        },
        novemberWeek,
      ),
    ).toBe(false);
  });

  it("filters on indent created_at only", () => {
    const filter = salesReportIndentOrFilter(novemberWeek);
    expect(filter).toContain("created_at.gte.");
    expect(filter).toContain("2026-11-01T00:00:00+05:30");
    expect(filter).toContain("2026-11-08T00:00:00+05:30");
    expect(filter).not.toContain("pickup_date");
    expect(filter).not.toContain("updated_at");
    expect(filter).not.toContain("status.in.");
    expect(salesReportDayBounds("2026-11-07", "2026-11-01")).toEqual(novemberWeek);
  });
});
