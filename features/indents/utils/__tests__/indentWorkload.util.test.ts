import {
  classifyIndentWorkload,
  indentWorkloadBounds,
  indentWorkloadOrFilter,
  indentWorkloadStatusTag,
  LIVE_INDENT_STATUSES,
} from "@/features/indents/utils/indentWorkload.util";

// 2026-10-28 00:30 IST is still 27 Oct in UTC: bounds must use the IST day.
const NOW = new Date("2026-10-27T19:00:00Z");
const BOUNDS = { today: "2026-10-28", needsTripFrom: "2026-10-21" };

describe("indentWorkloadBounds", () => {
  it("uses the Asia/Kolkata calendar day and a 7-day needs-trip window", () => {
    expect(indentWorkloadBounds(NOW)).toEqual(BOUNDS);
    expect(indentWorkloadBounds(new Date("2026-10-27T18:29:59Z"))).toEqual({
      today: "2026-10-27",
      needsTripFrom: "2026-10-20",
    });
  });

  it("crosses month boundaries", () => {
    expect(indentWorkloadBounds(new Date("2026-11-03T06:00:00Z"))).toEqual({
      today: "2026-11-03",
      needsTripFrom: "2026-10-27",
    });
  });
});

describe("classifyIndentWorkload", () => {
  const live = (pickup_date: string | null, status = "broadcast") =>
    classifyIndentWorkload({ status, pickup_date }, false, BOUNDS);

  it("live: broadcast / open with pickup today or later, or no pickup date", () => {
    expect(live("2026-10-28")).toBe("live");
    expect(live("2026-11-02", "open")).toBe("live");
    expect(live(null)).toBe("live");
    expect(live("")).toBe("live");
    expect(live("2026-10-27")).toBeNull();
  });

  it("needs_trip: awarded with pickup on/after today − 7, or no pickup date", () => {
    const award = (pickup_date: string | null) =>
      classifyIndentWorkload({ status: "awarded", pickup_date }, false, BOUNDS);
    expect(award("2026-10-21")).toBe("needs_trip");
    expect(award("2026-10-30")).toBe("needs_trip");
    expect(award(null)).toBe("needs_trip");
    expect(award("2026-10-20")).toBeNull();
  });

  it("normalises status case / whitespace", () => {
    expect(live("2026-10-28", " Broadcast ")).toBe("live");
    expect(
      classifyIndentWorkload({ status: "AWARDED", pickup_date: null }, false, BOUNDS),
    ).toBe("needs_trip");
  });

  it("excludes indents with a linked trip", () => {
    expect(classifyIndentWorkload({ status: "broadcast", pickup_date: null }, true, BOUNDS)).toBeNull();
    expect(classifyIndentWorkload({ status: "awarded", pickup_date: null }, true, BOUNDS)).toBeNull();
  });

  it("pending / draft / quoted and terminal statuses are not workload", () => {
    for (const status of ["pending", "draft", "quoted", "completed", "cancelled", "expired", "closed"]) {
      expect(classifyIndentWorkload({ status, pickup_date: null }, false, BOUNDS)).toBeNull();
    }
    // Widening the live set must be a deliberate change to this test.
    expect([...LIVE_INDENT_STATUSES]).toEqual(["broadcast", "open"]);
  });
});

describe("indentWorkloadOrFilter", () => {
  it("matches the client rules (status + pickup window, null pickup kept)", () => {
    expect(indentWorkloadOrFilter("live", BOUNDS)).toBe(
      "and(status.in.(broadcast,open),or(pickup_date.gte.2026-10-28,pickup_date.is.null))",
    );
    expect(indentWorkloadOrFilter("needs_trip", BOUNDS)).toBe(
      "and(status.in.(awarded),or(pickup_date.gte.2026-10-21,pickup_date.is.null))",
    );
  });

  it("does not depend on the hub date pill", () => {
    // The only inputs are the IST bounds; a hub date filter has no way in.
    expect(indentWorkloadOrFilter.length).toBe(2);
    expect(classifyIndentWorkload.length).toBe(3);
  });
});

describe("indentWorkloadStatusTag", () => {
  it("keeps needs-trip rows out of the live Pending / Bids tags", () => {
    expect(indentWorkloadStatusTag("needs_trip", 0)).toBe("awarded");
    expect(indentWorkloadStatusTag("needs_trip", 3)).toBe("awarded");
    expect(indentWorkloadStatusTag("live", 0)).toBe("pending");
    expect(indentWorkloadStatusTag("live", 2)).toBe("bids");
  });
});
