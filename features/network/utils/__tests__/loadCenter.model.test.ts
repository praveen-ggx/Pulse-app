import {
  STATUS_TABS,
  isGetLoadMarketCirculation,
  isIndentStageDone,
  isIndentUnallocated,
  loadCenterShowsStandaloneChrome,
  resolveGetLoadDoneOutcome,
  resolveGetLoadMobileCardLabels,
  resolveGetLoadTicketCommerce,
  resolveGiveLoadTicketCommerce,
  restrictIndentsToIds,
  statusMatchesFilter,
} from "@/features/network/utils/loadCenter.model";

/**
 * Regression cover for the Open-tab status set.
 *
 * A DB trigger (set_indent_quoted_on_direct_quote) flips an indent from
 * broadcast -> quoted on the FIRST bid from ANY org. `status` is a single
 * shared field, not per-viewer, so excluding `quoted` from Open removed a
 * still-biddable load from every other supplier's Open tab after one bid —
 * suppressing exactly the competing bids a broadcast (or paid Reach campaign)
 * exists to attract.
 */
describe("loadCenter status tabs", () => {
  it("keeps a quoted load in Open so other suppliers can still bid", () => {
    expect(statusMatchesFilter("quoted", "OPEN")).toBe(true);
  });

  it("no longer lists quoted under the Quoted tab", () => {
    // `status='quoted'` is a deprecated DB value, not an active business state:
    // no new indents enter it after migration 20270128103100 (trigger dropped +
    // backfill). It is kept in OPEN only so a residual legacy row still shows as
    // open-for-bidding, and deliberately dropped from QUOTED — that tab now means
    // "Receiving Bids", which is derived from bid_count, not from this status.
    expect(statusMatchesFilter("quoted", "QUOTED")).toBe(false);
  });

  it("does not leak terminal or awarded loads into Open", () => {
    for (const s of ["awarded", "completed", "cancelled", "closed", "expired"]) {
      expect(statusMatchesFilter(s, "OPEN")).toBe(false);
    }
  });

  it("keeps pre-bid statuses in Open", () => {
    for (const s of ["open", "pending", "broadcast", "draft"]) {
      expect(statusMatchesFilter(s, "OPEN")).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(statusMatchesFilter("QUOTED", "OPEN")).toBe(true);
  });

  it("treats marketplace circulation as Get Load / Open Market visible", () => {
    expect(isGetLoadMarketCirculation(null)).toBe(true);
    expect(isGetLoadMarketCirculation("integrated_supplier")).toBe(true);
    expect(isGetLoadMarketCirculation("both")).toBe(true);
    expect(isGetLoadMarketCirculation("marketplace")).toBe(true);
    expect(isGetLoadMarketCirculation("offline")).toBe(false);
  });

  it("Open and Awarded remain disjoint", () => {
    const open = STATUS_TABS.find((t) => t.id === "OPEN")!.statuses;
    const awarded = STATUS_TABS.find((t) => t.id === "AWARDED")!.statuses;
    expect(open.filter((s) => awarded.includes(s))).toEqual([]);
  });
});

/**
 * Give Load cards previously received no `ticketCommerce` prop, so the card fell
 * back to plain text and printed "2 bids" where the money block belongs — both
 * client_price and supplier_target were populated but never rendered.
 */
describe("give load ticket commerce", () => {
  const base = { client_price: 50000, supplier_target: 45000 };
  const opts = {
    isDone: false,
    isDraft: false,
    awardedAmountInr: null as number | null,
    isAwarded: false,
    bidCount: 0,
    loadTypeDetail: "GENERAL",
  };

  it("leads with the target rate and shows the client rate underneath", () => {
    const c = resolveGiveLoadTicketCommerce("OPEN", base, opts);
    expect(c.kicker).toBe("TARGET RATE");
    expect(c.amountInr).toBe(45000);
    expect(c.targetRateInr).toBe(50000);
    expect(c.referenceLabel).toBe("Client rate");
  });

  it("leads with the awarded amount once a supplier is picked", () => {
    const c = resolveGiveLoadTicketCommerce("AWARDED", base, {
      ...opts,
      isAwarded: true,
      awardedAmountInr: 30000,
      awardedByName: "Acme Logistics",
    });
    expect(c.kicker).toBe("AWARDED");
    expect(c.amountInr).toBe(30000);
    expect(c.targetRateInr).toBe(50000);
    expect(c.awardedByName).toBe("Acme Logistics");
  });

  it("keeps the bid count as a caption instead of replacing the rate", () => {
    const c = resolveGiveLoadTicketCommerce("OPEN", base, { ...opts, bidCount: 2 });
    expect(c.amountInr).toBe(45000);
    expect(c.rightCaption).toBe("2 bids");
  });

  it("falls back to the client rate when no target is set", () => {
    const c = resolveGiveLoadTicketCommerce(
      "OPEN",
      { client_price: 50000, supplier_target: null },
      opts,
    );
    expect(c.kicker).toBe("CLIENT RATE");
    expect(c.amountInr).toBe(50000);
  });

  it("shows no hero amount when both rates are missing or zero", () => {
    const c = resolveGiveLoadTicketCommerce(
      "OPEN",
      { client_price: 0, supplier_target: null },
      opts,
    );
    expect(c.amountInr).toBeNull();
    expect(c.rightCaption).toBe("GENERAL");
  });

  it("drops the money block on done loads", () => {
    const c = resolveGiveLoadTicketCommerce("DONE", base, { ...opts, isDone: true });
    expect(c.amountInr).toBeNull();
    expect(c.rightCaption).toBe("On books");
  });
});

describe("resolveGetLoadDoneOutcome", () => {
  it("marks cancelled indents as CANCELLED and non-interactive", () => {
    const o = resolveGetLoadDoneOutcome(
      { status: "cancelled" },
      { status: "rejected" },
      false,
    );
    expect(o.kind).toBe("cancelled");
    expect(o.kicker).toBe("CANCELLED");
    expect(o.statusLabel).toBe("cancelled");
    expect(o.channelLabel).toBe("Indent cancelled");
    expect(o.interactive).toBe(false);
  });

  it("marks completed/closed as LOST when we did not win", () => {
    for (const status of ["completed", "closed", "awarded"]) {
      const o = resolveGetLoadDoneOutcome(
        { status },
        { status: "rejected" },
        false,
        false,
      );
      expect(o.kind).toBe("lost");
      expect(o.kicker).toBe("LOST");
      expect(o.footerLabel).toBe("Allocated to another bidder");
      expect(o.interactive).toBe(false);
    }
  });

  it("prefers LOST over REJECTED when indent is terminal and we lost", () => {
    const o = resolveGetLoadDoneOutcome(
      { status: "completed" },
      { status: "rejected" },
      false,
      false,
    );
    expect(o.kind).toBe("lost");
    expect(o.statusLabel).toBe("lost");
  });

  it("marks won + completed as CONVERTED even without a trip row yet", () => {
    const o = resolveGetLoadDoneOutcome(
      { status: "completed" },
      { status: "accepted" },
      false,
      true,
    );
    expect(o.kind).toBe("converted");
    expect(o.kicker).toBe("CONVERTED");
    expect(o.statusLabel).toBe("converted");
    expect(o.channelLabel).toBe("Won · converted to trip");
  });

  it("marks linked trips as CONVERTED", () => {
    const o = resolveGetLoadDoneOutcome(
      { status: "completed" },
      { status: "accepted" },
      true,
      true,
    );
    expect(o.kind).toBe("converted");
    expect(o.kicker).toBe("CONVERTED");
  });

  it("marks quote rejected as REJECTED when indent is not terminal-awarded", () => {
    const o = resolveGetLoadDoneOutcome(
      { status: "open" },
      { status: "rejected" },
      false,
    );
    expect(o.kind).toBe("declined");
    expect(o.kicker).toBe("REJECTED");
    expect(o.statusLabel).toBe("rejected");
  });

  it("marks expired indents as EXPIRED", () => {
    const o = resolveGetLoadDoneOutcome({ status: "expired" }, null, false);
    expect(o.kind).toBe("expired");
    expect(o.kicker).toBe("EXPIRED");
  });
});

describe("resolveGetLoadMobileCardLabels Done tab", () => {
  it("surfaces LOST labels for completed indents without a win", () => {
    const labels = resolveGetLoadMobileCardLabels(
      "DONE",
      "REJECTED",
      { id: "i1", status: "completed", load_type: "General" },
      { status: "rejected", amount: 1000 },
      new Set(),
      false,
    );
    expect(labels.statusLabel).toBe("lost");
    expect(labels.rightFooter).toBe("Allocated to another bidder");
  });

  it("surfaces CONVERTED when we won", () => {
    const labels = resolveGetLoadMobileCardLabels(
      "DONE",
      "CONVERTED",
      { id: "i1", status: "completed", load_type: "General" },
      { status: "accepted", amount: 1000 },
      new Set(["i1"]),
      true,
    );
    expect(labels.statusLabel).toBe("converted");
    expect(labels.rightFooter).toBe("On books");
  });
});

/**
 * Get Load cards read supplier_target, which may be a ₹/MT unit rate rather
 * than a trip total. IND197 (Bhandara → Hosur) printed "TARGET RATE ₹3,200"
 * on a trip actually worth ₹1,24,256, so suppliers were bidding against a
 * number ~39x too small. The card must show the tonnage-expanded total.
 */
describe("get load ticket commerce — per-MT targets", () => {
  const noTrips = new Set<string>();

  it("expands a per-MT target to the trip total (IND197)", () => {
    const c = resolveGetLoadTicketCommerce(
      "OPEN",
      "ALL",
      {
        id: "i1",
        status: "broadcast",
        supplier_target: 3200,
        supplier_rate_basis: "per_mt",
        weight: 38830,
      },
      undefined,
      noTrips,
    );
    expect(c.kicker).toBe("TARGET RATE");
    expect(c.amountInr).toBe(124_256);
  });

  it("leaves a per_trip target alone", () => {
    const c = resolveGetLoadTicketCommerce(
      "OPEN",
      "ALL",
      {
        id: "i2",
        status: "broadcast",
        supplier_target: 89_578,
        supplier_rate_basis: "per_trip",
        weight: 30_000,
      },
      undefined,
      noTrips,
    );
    expect(c.amountInr).toBe(89_578);
  });

  it("treats an untagged target as a trip total (existing rows)", () => {
    const c = resolveGetLoadTicketCommerce(
      "OPEN",
      "ALL",
      { id: "i3", status: "broadcast", supplier_target: 77_500, weight: 25_000 },
      undefined,
      noTrips,
    );
    expect(c.amountInr).toBe(77_500);
  });

  it("shows the unit rate when a per-MT row has no usable weight", () => {
    const c = resolveGetLoadTicketCommerce(
      "OPEN",
      "ALL",
      {
        id: "i4",
        status: "broadcast",
        supplier_target: 3200,
        supplier_rate_basis: "per_mt",
        weight: null,
      },
      undefined,
      noTrips,
    );
    expect(c.amountInr).toBe(3200);
  });

  it("still reports open freight when there is no target at all", () => {
    const c = resolveGetLoadTicketCommerce(
      "OPEN",
      "ALL",
      { id: "i5", status: "broadcast", supplier_target: null, weight: 30_000 },
      undefined,
      noTrips,
    );
    expect(c.amountInr).toBeNull();
    expect(c.rightCaption).toBe("Open freight");
  });

  it("compares your pending bid against the expanded target", () => {
    const c = resolveGetLoadTicketCommerce(
      "OPEN",
      "ALL",
      {
        id: "i6",
        status: "quoted",
        supplier_target: 3100,
        supplier_rate_basis: "per_mt",
        weight: 41_000,
      },
      { status: "pending", amount: 127_100 },
      noTrips,
    );
    expect(c.kicker).toBe("YOUR BID");
    expect(c.amountInr).toBe(127_100);
    expect(c.targetRateInr).toBe(127_100);
  });
});

describe("give load ticket commerce — per-MT targets", () => {
  const opts = {
    isDone: false,
    isDraft: false,
    awardedAmountInr: null,
    isAwarded: false,
    bidCount: 0,
    loadTypeDetail: "Steel",
  };

  it("expands a per-MT target on your own indent card", () => {
    const c = resolveGiveLoadTicketCommerce(
      "OPEN",
      {
        client_price: 130_469,
        supplier_target: 3200,
        supplier_rate_basis: "per_mt",
        weight: 38830,
      },
      opts,
    );
    expect(c.kicker).toBe("TARGET RATE");
    expect(c.amountInr).toBe(124_256);
    expect(c.targetRateInr).toBe(130_469);
    expect(c.referenceLabel).toBe("Client rate");
  });

  it("leaves an untagged target as the total it already is", () => {
    const c = resolveGiveLoadTicketCommerce(
      "OPEN",
      { client_price: 99_000, supplier_target: 89_578, weight: 30_000 },
      opts,
    );
    expect(c.amountInr).toBe(89_578);
  });
});

describe("isIndentStageDone", () => {
  it("flags completed/cancelled/closed/expired as done", () => {
    for (const s of ["completed", "cancelled", "closed", "expired"]) {
      expect(isIndentStageDone(s)).toBe(true);
    }
  });

  it("does not flag pre-trip statuses as done", () => {
    for (const s of ["open", "broadcast", "draft", "quoted", "awarded"]) {
      expect(isIndentStageDone(s)).toBe(false);
    }
  });
});

/**
 * Trips → INDENT stage boundary. Allocation (not driver assignment) is what
 * moves an indent out of this bucket — reuses the existing trips.indent_id
 * relationship via a caller-supplied set, no new status/column.
 */
describe("isIndentUnallocated — Trips INDENT stage boundary", () => {
  const indentIdsWithTrip = new Set(["ind-allocated"]);

  it("an unallocated, non-terminal indent counts as INDENT", () => {
    expect(isIndentUnallocated({ id: "ind-open", status: "open" }, indentIdsWithTrip)).toBe(true);
    // Legacy pre-migration-20270128103100 status — still active, still unallocated.
    expect(isIndentUnallocated({ id: "ind-quoted", status: "quoted" }, indentIdsWithTrip)).toBe(true);
    expect(isIndentUnallocated({ id: "ind-broadcast", status: "broadcast" }, indentIdsWithTrip)).toBe(true);
    // Bidding status (receiving bids) is a bid-count concern, not a stage boundary.
    expect(isIndentUnallocated({ id: "ind-pending", status: "pending" }, indentIdsWithTrip)).toBe(true);
    // Awarded-but-not-yet-converted: allocation boundary is trips.indent_id, not award status.
    expect(isIndentUnallocated({ id: "ind-awarded", status: "awarded" }, indentIdsWithTrip)).toBe(true);
  });

  it("an indent with a trip already allocated is not an INDENT, regardless of status", () => {
    expect(
      isIndentUnallocated({ id: "ind-allocated", status: "open" }, indentIdsWithTrip),
    ).toBe(false);
    expect(
      isIndentUnallocated({ id: "ind-allocated", status: "awarded" }, indentIdsWithTrip),
    ).toBe(false);
  });

  it("a terminal (done) indent is not an INDENT even if unallocated", () => {
    for (const status of ["completed", "cancelled", "closed", "expired"]) {
      expect(isIndentUnallocated({ id: "ind-terminal", status }, indentIdsWithTrip)).toBe(false);
    }
  });
});

/**
 * `restrictIndentsToIds` is what LoadCenterView uses (via `restrictToIndentIds`)
 * to render exactly the caller-derived membership set instead of re-deriving
 * membership with its own independent OPEN/QUOTED/AWARDED/DONE status filter.
 * Pinning this proves the ALL/INDENT rendered set and the count can never
 * disagree — both are built from the same `unallocatedIndents` id set.
 */
describe("restrictIndentsToIds — one source of truth for INDENT rendering", () => {
  const allIndents = [
    { id: "ind-open", status: "open" },
    { id: "ind-awarded-unallocated", status: "awarded" },
    { id: "ind-allocated", status: "awarded" },
    { id: "ind-terminal", status: "completed" },
  ];

  it("returns exactly the set the count is derived from, including an awarded-but-unallocated indent", () => {
    const indentIdsWithTrip = new Set(["ind-allocated"]);
    const unallocatedIds = new Set(
      allIndents
        .filter((i) => isIndentUnallocated(i, indentIdsWithTrip))
        .map((i) => i.id),
    );

    const rendered = restrictIndentsToIds(allIndents, unallocatedIds);

    expect(rendered.map((i) => i.id).sort()).toEqual([
      "ind-awarded-unallocated",
      "ind-open",
    ]);
    expect(rendered.length).toBe(unallocatedIds.size);
    // Once allocated, it disappears from the rendered set — same boundary as the count.
    expect(rendered.some((i) => i.id === "ind-allocated")).toBe(false);
  });

  it("returns nothing when the id set is empty", () => {
    expect(restrictIndentsToIds(allIndents, new Set())).toEqual([]);
  });
});

describe("loadCenterShowsStandaloneChrome — Trips vs /pulse-loads", () => {
  it("keeps standalone Load Center chrome by default", () => {
    expect(loadCenterShowsStandaloneChrome(undefined)).toBe(true);
    expect(loadCenterShowsStandaloneChrome("standalone")).toBe(true);
  });

  it("suppresses Load Center chrome in Trips-embedded presentation", () => {
    expect(loadCenterShowsStandaloneChrome("trips")).toBe(false);
  });

  it("restrictToIndentIds membership is independent of presentation", () => {
    const rows = [
      { id: "a", status: "open" },
      { id: "b", status: "awarded" },
    ];
    const ids = new Set(["b"]);
    expect(restrictIndentsToIds(rows, ids).map((r) => r.id)).toEqual(["b"]);
    expect(loadCenterShowsStandaloneChrome("trips")).toBe(false);
  });
});
