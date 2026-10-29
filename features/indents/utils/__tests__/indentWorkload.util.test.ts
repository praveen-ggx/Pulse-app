import {
  classifyIndentWorkload,
  indentWorkloadBounds,
  indentWorkloadOrFilter,
  indentWorkloadRangeDay,
  indentWorkloadStatusTag,
  isIndentPickupPassed,
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

  it("is the current workload when no hub date pill is set", () => {
    expect(indentWorkloadOrFilter("live", BOUNDS, null)).toBe(indentWorkloadOrFilter("live", BOUNDS));
    expect(
      classifyIndentWorkload({ status: "broadcast", pickup_date: "2026-10-27" }, false, BOUNDS, null),
    ).toBeNull();
  });

  it("dated live: pickup in range, else IST created day when pickup is empty", () => {
    expect(indentWorkloadOrFilter("live", BOUNDS, WEEK)).toBe(
      "and(status.in.(broadcast,open),or(" +
        "and(pickup_date.gte.2026-10-26,pickup_date.lte.2026-11-01)," +
        'and(pickup_date.is.null,created_at.gte."2026-10-26T00:00:00+05:30",' +
        'created_at.lt."2026-11-02T00:00:00+05:30")))',
    );
  });

  it("dated filter never changes needs_trip", () => {
    expect(indentWorkloadOrFilter("needs_trip", BOUNDS, WEEK)).toBe(
      indentWorkloadOrFilter("needs_trip", BOUNDS),
    );
  });
});

// "This week" on Thu 29 Oct 2026 (IST, Monday start).
const WEEK = { from: "2026-10-26", to: "2026-11-01" };
const TODAY_29 = { today: "2026-10-29", needsTripFrom: "2026-10-22" };

describe("classifyIndentWorkload with a hub date range", () => {
  const dated = (indent: { status?: string; pickup_date?: string | null; created_at?: string | null }) =>
    classifyIndentWorkload({ status: "broadcast", ...indent }, false, TODAY_29, WEEK);

  it("no date pill: overdue historical indents stay out", () => {
    expect(
      classifyIndentWorkload({ status: "broadcast", pickup_date: "2026-10-28" }, false, TODAY_29),
    ).toBeNull();
    expect(
      classifyIndentWorkload({ status: "broadcast", pickup_date: "2026-09-19" }, false, TODAY_29),
    ).toBeNull();
  });

  it("this week: earlier-this-week pickups appear (the 28 Oct indents)", () => {
    expect(dated({ pickup_date: "2026-10-28", created_at: "2026-10-28T13:30:00Z" })).toBe("live");
    expect(dated({ pickup_date: "2026-10-26", status: "open" })).toBe("live");
    expect(dated({ pickup_date: "2026-11-01" })).toBe("live");
  });

  it("missing pickup: IST created day decides", () => {
    // 25 Oct 19:00Z = 26 Oct 00:30 IST → in range.
    expect(dated({ pickup_date: null, created_at: "2026-10-25T19:00:00Z" })).toBe("live");
    // 25 Oct 18:29Z = 25 Oct 23:59 IST → out.
    expect(dated({ pickup_date: null, created_at: "2026-10-25T18:29:00Z" })).toBeNull();
    // The September no-pickup indents now drop out of "This week".
    expect(dated({ pickup_date: null, created_at: "2026-09-23T17:59:00Z" })).toBeNull();
    expect(dated({ pickup_date: null, created_at: null })).toBeNull();
  });

  it("out-of-range pickup excluded even if created in range", () => {
    expect(dated({ pickup_date: "2026-09-19", created_at: "2026-10-27T07:54:00Z" })).toBeNull();
    expect(dated({ pickup_date: "2026-11-02" })).toBeNull();
  });

  it("linked trips, non-live and needs-trip rules are unchanged", () => {
    expect(
      classifyIndentWorkload({ status: "broadcast", pickup_date: "2026-10-28" }, true, TODAY_29, WEEK),
    ).toBeNull();
    for (const status of ["pending", "draft", "cancelled", "expired", "completed"]) {
      expect(dated({ status, pickup_date: "2026-10-28" })).toBeNull();
    }
    const award = (pickup_date: string | null) =>
      classifyIndentWorkload({ status: "awarded", pickup_date }, false, TODAY_29, WEEK);
    expect(award("2026-10-22")).toBe("needs_trip");
    expect(award("2026-10-21")).toBeNull();
    expect(award("2026-11-15")).toBe("needs_trip");
  });
});

describe('hub date "All"', () => {
  it("live = every broadcast / open indent, any pickup date", () => {
    expect(indentWorkloadOrFilter("live", TODAY_29, "all")).toBe("status.in.(broadcast,open)");
    const all = (status: string, pickup_date: string | null) =>
      classifyIndentWorkload({ status, pickup_date }, false, TODAY_29, "all");
    expect(all("broadcast", "2026-09-19")).toBe("live");
    expect(all("open", "2026-10-28")).toBe("live");
    expect(all("broadcast", null)).toBe("live");
    expect(all("expired", "2026-10-28")).toBeNull();
    expect(all("pending", null)).toBeNull();
    expect(
      classifyIndentWorkload({ status: "broadcast", pickup_date: null }, true, TODAY_29, "all"),
    ).toBeNull();
  });

  it("needs_trip keeps its 7-day window", () => {
    expect(indentWorkloadOrFilter("needs_trip", TODAY_29, "all")).toBe(
      indentWorkloadOrFilter("needs_trip", TODAY_29),
    );
    expect(
      classifyIndentWorkload({ status: "awarded", pickup_date: "2026-10-21" }, false, TODAY_29, "all"),
    ).toBeNull();
  });
});

describe("indentWorkloadRangeDay", () => {
  it("pickup first, else IST created day", () => {
    expect(indentWorkloadRangeDay({ pickup_date: "2026-10-28", created_at: "2026-09-01T00:00:00Z" })).toBe(
      "2026-10-28",
    );
    expect(indentWorkloadRangeDay({ pickup_date: null, created_at: "2026-10-25T19:00:00Z" })).toBe(
      "2026-10-26",
    );
  });
});

describe("isIndentPickupPassed", () => {
  const AT = new Date("2026-10-29T06:00:00Z");
  it("flags live indents whose pickup day is before today (IST)", () => {
    expect(isIndentPickupPassed({ status: "broadcast", pickup_date: "2026-10-28" }, AT)).toBe(true);
    expect(isIndentPickupPassed({ status: "open", pickup_date: "2026-09-19" }, AT)).toBe(true);
  });
  it("not for today/future, missing pickup, or non-live statuses", () => {
    expect(isIndentPickupPassed({ status: "broadcast", pickup_date: "2026-10-29" }, AT)).toBe(false);
    expect(isIndentPickupPassed({ status: "broadcast", pickup_date: null }, AT)).toBe(false);
    expect(isIndentPickupPassed({ status: "awarded", pickup_date: "2026-10-20" }, AT)).toBe(false);
    expect(isIndentPickupPassed({ status: "expired", pickup_date: "2026-10-20" }, AT)).toBe(false);
  });
  it("uses the IST day, not UTC", () => {
    // 28 Oct 18:45Z is already 29 Oct 00:15 IST.
    expect(
      isIndentPickupPassed({ status: "broadcast", pickup_date: "2026-10-28" }, new Date("2026-10-28T18:45:00Z")),
    ).toBe(true);
    expect(
      isIndentPickupPassed({ status: "broadcast", pickup_date: "2026-10-28" }, new Date("2026-10-28T18:15:00Z")),
    ).toBe(false);
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
