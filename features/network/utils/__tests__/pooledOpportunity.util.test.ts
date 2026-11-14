import {
  MARKETPLACE_POOL_MAX_OFFSET,
  POOL_BID_MAX_LOADS,
  POOL_TOO_LARGE_MESSAGE,
  canonicalPoolLanes,
  filterPoolLanes,
  findPoolLane,
  groupPoolBidFailures,
  isPoolMember,
  poolBidReadiness,
  poolIdentityGate,
  poolKey,
  poolKeyFromLane,
  poolKeyId,
  poolFieldOptions,
  poolMembers,
  poolSubmissionBlockReason,
  readCompletePool,
  runPoolBidSubmission,
  summarizePool,
  type PoolBidStatus,
} from "@/features/network/utils/pooledOpportunity.util";

const lane = (
  pickup: string,
  drop: string,
  vehicle: string,
  count: number,
) => ({
  pickup_area: pickup,
  drop_location: drop,
  vehicle_type: vehicle,
  load_count: count,
});

const LANES = [
  lane("Periyapalayam", "Poonamallee", "Container 20ft", 4),
  lane("Bhandara", "Bengaluru", "40 FT", 3),
  lane("Bhandara", "Bengaluru", "32 FT", 2),
];

const KEY = poolKey({
  pickup: "Bengaluru",
  drop: "Chennai",
  vehicleType: "20 FT",
});

const bid = (indent_id: string, status: PoolBidStatus) => ({
  indent_id,
  status,
});

const load = (id: string, extra: Partial<Record<string, unknown>> = {}) => ({
  id,
  pickup_area: "Bengaluru",
  drop_location: "Chennai",
  vehicle_type: "20 FT",
  pickup_date: "2026-10-08",
  load_type: "Steel",
  rate_offer: 20000,
  creator_organization_id: "shipper-1",
  is_sponsored: false,
  ...extra,
});

const canBid = () => true;
const summarize = (
  rows: ReturnType<typeof load>[],
  bids: { indent_id: string; status: PoolBidStatus }[] = [],
  extra: { laneLoadCount?: number | null; priorMemberIds?: Set<string> } = {},
) =>
  summarizePool({
    key: KEY,
    rows,
    bids,
    laneLoadCount: extra.laneLoadCount ?? null,
    priorMemberIds: extra.priorMemberIds,
    canBidLoad: canBid,
  });

describe("P0 canonical pool membership", () => {
  it("pickup: 'Bengaluru' does not match 'Bengaluru Rural'", () => {
    expect(
      isPoolMember(load("a", { pickup_area: "Bengaluru Rural" }), KEY),
    ).toBe(false);
  });

  it("vehicle: '20 FT' does not match 'Container 20 FT'", () => {
    expect(
      isPoolMember(load("a", { vehicle_type: "Container 20 FT" }), KEY),
    ).toBe(false);
  });

  it("drop must match exactly after normalization", () => {
    expect(
      isPoolMember(load("a", { drop_location: "Chennai Port" }), KEY),
    ).toBe(false);
    expect(
      isPoolMember(load("a", { drop_location: "North Chennai" }), KEY),
    ).toBe(false);
    expect(isPoolMember(load("a", { drop_location: "  CHENNAI " }), KEY)).toBe(
      true,
    );
  });

  it("' Bengaluru ' matches 'bengaluru' (trim + case-fold on every field)", () => {
    const key = poolKey({
      pickup: " Bengaluru ",
      drop: "Chennai",
      vehicleType: "20 ft",
    });
    expect(
      isPoolMember(
        load("a", { pickup_area: "bengaluru", vehicle_type: " 20 FT" }),
        key,
      ),
    ).toBe(true);
    expect(poolKeyId(key)).toBe(poolKeyId(KEY));
  });

  it("an incomplete key matches nothing", () => {
    expect(
      isPoolMember(
        load("a"),
        poolKey({ pickup: "Bengaluru", drop: "Chennai" }),
      ),
    ).toBe(false);
  });

  it("removes contaminated RPC rows so only exact canonical members remain", () => {
    const rows = [
      load("ok-1"),
      load("rural", { pickup_area: "Bengaluru Rural" }),
      load("container", { vehicle_type: "Container 20 FT" }),
      load("port", { drop_location: "Chennai Port" }),
      load("ok-2", { pickup_area: "BENGALURU ", drop_location: " chennai" }),
      load("ok-1"),
    ];
    expect(poolMembers(rows, KEY).map((r) => r.id)).toEqual(["ok-1", "ok-2"]);
  });

  it("pool counts, selection and biddable ids come from members, not raw RPC rows", () => {
    const rows = [
      load("ok-1"),
      load("rural", { pickup_area: "Bengaluru Rural" }),
      load("container", { vehicle_type: "Container 20 FT" }),
      load("ok-2"),
    ];
    const s = summarize(rows, [], { laneLoadCount: 2 });
    expect(s.members.map((m) => m.id)).toEqual(["ok-1", "ok-2"]);
    expect([...s.memberIds]).toEqual(["ok-1", "ok-2"]);
    expect(s.excludedRowCount).toBe(2);
    expect(s.poolSize).toBe(2);
    expect(s.biddableIds).toEqual(["ok-1", "ok-2"]);
  });

  it("ignores contaminated rows' bids and composition facts", () => {
    const s = summarize(
      [
        load("ok"),
        load("rural", {
          pickup_area: "Bengaluru Rural",
          is_sponsored: true,
          rate_offer: 1,
        }),
      ],
      [bid("rural", "accepted")],
    );
    expect(s.members.map((m) => m.id)).toEqual(["ok"]);
    expect(s.targetRateMin).toBe(20000);
    expect(s.awardedBids).toEqual([]);
    expect(s.bidByIndentId.has("rural")).toBe(false);
  });
});

describe("P0 submission guard", () => {
  const members = new Set(["a", "b"]);

  it("blocks any non-member indent before a single write", async () => {
    const submitOne = jest.fn().mockResolvedValue({ error: null });
    const r = await runPoolBidSubmission({
      indentIds: ["a", "rural"],
      memberIds: members,
      submitOne,
    });
    expect(submitOne).not.toHaveBeenCalled();
    expect(r.blocked).toMatch(/not part of this pool/);
    expect(r).toMatchObject({ attempted: 0, succeeded: [], failed: [] });
  });

  it("blocks empty, duplicate and too-large pools", () => {
    expect(poolSubmissionBlockReason([], members)).toMatch(/No loads/);
    expect(poolSubmissionBlockReason(["a", "a"], members)).toMatch(/twice/);
    const many = Array.from(
      { length: POOL_BID_MAX_LOADS + 1 },
      (_, i) => `l${i}`,
    );
    expect(poolSubmissionBlockReason(many, new Set(many))).toBe(
      POOL_TOO_LARGE_MESSAGE,
    );
    expect(poolSubmissionBlockReason(["a", "b"], members)).toBeNull();
  });

  it("submits the same rate per member in a short burst and reports failures per load", async () => {
    const calls: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const result = await runPoolBidSubmission({
      indentIds: ["a", "b", "c"],
      memberIds: new Set(["a", "b", "c"]),
      submitOne: async (id) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        calls.push(id);
        await Promise.resolve();
        inFlight -= 1;
        if (id === "b") return { error: new Error("indent_not_open") };
        if (id === "c") throw new Error("network");
        return { error: null };
      },
    });
    expect(calls).toEqual(["a", "b", "c"]);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(result).toEqual({
      blocked: null,
      attempted: 3,
      succeeded: ["a"],
      failed: [
        { indentId: "b", message: "indent_not_open" },
        { indentId: "c", message: "network" },
      ],
    });
  });
});

describe("P1 case-duplicate lanes", () => {
  const DUPES = [
    lane("Bengaluru", "Chennai", "20 FT", 3),
    lane("bengaluru", "chennai", "20 ft", 5),
    lane("BENGALURU", "Chennai", "20 FT", 1),
    lane("Bengaluru Rural", "Chennai", "20 FT", 2),
  ];

  it("merges case-only variants into one pool with one key and a summed count", () => {
    const pools = canonicalPoolLanes(DUPES);
    expect(pools).toHaveLength(2);
    const [main, rural] = pools;
    expect(main).toMatchObject({
      load_count: 9,
      pickup_area: "bengaluru",
      poolId: poolKeyId(KEY),
    });
    expect(rural).toMatchObject({
      load_count: 2,
      pickup_area: "Bengaluru Rural",
    });
    expect(new Set(pools.map((p) => p.poolId)).size).toBe(pools.length);
  });

  it("every variant resolves to the same navigation target and pool", () => {
    const targets = DUPES.slice(0, 3).map((l) => poolKeyId(poolKeyFromLane(l)));
    expect(new Set(targets).size).toBe(1);
    expect(findPoolLane(DUPES, KEY)?.load_count).toBe(9);
  });

  it("filters pools on the canonical fields", () => {
    expect(filterPoolLanes(LANES, null)).toHaveLength(3);
    expect(filterPoolLanes(LANES, { pickup: "bhandara" })).toHaveLength(2);
    expect(
      filterPoolLanes(LANES, {
        pickup: "Bhandara",
        drop: "Bengaluru",
        vehicleType: "32 ft",
      }).map((l) => l.vehicle_type),
    ).toEqual(["32 FT"]);
    expect(filterPoolLanes(DUPES, { pickup: "Bengaluru" })).toHaveLength(1);
  });
});

describe("P1 bid state attribution (indent membership only)", () => {
  it("is open with no bids", () => {
    expect(summarize([load("a")]).state).toBe("open");
  });

  it("ignores bids on indents that are not pool members (old route awards)", () => {
    const s = summarize(
      [load("a"), load("b")],
      [bid("old-award", "accepted"), bid("x", "pending")],
    );
    expect(s.state).toBe("open");
    expect(s.stateLabel).toBe("Open for bids");
    expect(s.awardedBids).toEqual([]);
    expect(s.pendingCount).toBe(0);
  });

  it("labels an open pool with some awarded members 'Open · K awarded'", () => {
    const s = summarize(
      [load("a"), load("b"), load("c")],
      [bid("a", "accepted")],
    );
    expect(s.state).toBe("open");
    expect(s.stateLabel).toBe("Open · 1 awarded");
    expect(s.awardedBids.map((b) => b.indent_id)).toEqual(["a"]);
  });

  it("is submitted for pending member bids, keeps them revisable, and drops decided ones", () => {
    const s = summarize(
      [load("a"), load("b"), load("c"), load("d")],
      [bid("a", "pending"), bid("b", "rejected"), bid("d", "accepted")],
    );
    expect(s.state).toBe("submitted");
    expect(s.stateLabel).toBe("Your bid submitted · 1 awarded");
    expect(s.biddableIds).toEqual(["a", "c"]);
  });

  it("is awarded only when no member is still open for a first bid", () => {
    const s = summarize([load("a")], [bid("a", "accepted")]);
    expect(s.state).toBe("awarded");
    expect(s.stateLabel).toBe("Awarded");
  });

  it("keeps members submitted to this session attributable after they leave the open list", () => {
    const s = summarize([], [bid("gone", "accepted")], {
      priorMemberIds: new Set(["gone"]),
    });
    expect(s.state).toBe("awarded");
    expect(s.awardedBids.map((b) => b.indent_id)).toEqual(["gone"]);
  });

  it("is closed with no members, and not selected when only decided member bids remain", () => {
    expect(summarize([]).state).toBe("closed");
    expect(summarize([load("a")], [bid("a", "rejected")]).state).toBe(
      "not_selected",
    );
  });

  it("respects the per-load bid permission", () => {
    const s = summarizePool({
      key: KEY,
      rows: [load("a"), load("b")],
      bids: [],
      laneLoadCount: null,
      canBidLoad: (l) => l.id !== "b",
    });
    expect(s.biddableIds).toEqual(["a"]);
  });

  it("aggregates composition over members: shippers, dates, materials and target range", () => {
    const s = summarize([
      load("a", { pickup_date: "2026-10-09", rate_offer: 21000 }),
      load("b", {
        pickup_date: "2026-10-07",
        creator_organization_id: "shipper-2",
      }),
      load("c", { load_type: "Cement", rate_offer: null }),
    ]);
    expect(s).toMatchObject({
      shipperCount: 2,
      earliestPickup: "2026-10-07",
      latestPickup: "2026-10-09",
      targetRateMin: 20000,
      targetRateMax: 21000,
    });
    expect(s.loadTypes.sort()).toEqual(["Cement", "Steel"]);
  });
});

describe("sponsored Reach loads are never pool members", () => {
  const rows = [
    load("plain"),
    load("flagged", { is_sponsored: true, rate_offer: 1 }),
    load("campaign", { reach_campaign_id: "camp-1", rate_offer: 2 }),
  ];

  it("excludes is_sponsored and reach_campaign_id rows from members, bids and facts", () => {
    const s = summarize(rows, [bid("flagged", "pending"), bid("campaign", "accepted")]);
    expect(s.members.map((m) => m.id)).toEqual(["plain"]);
    expect([...s.memberIds]).toEqual(["plain"]);
    expect(s.excludedRowCount).toBe(2);
    expect(s.biddableIds).toEqual(["plain"]);
    expect(s.bidByIndentId.has("flagged")).toBe(false);
    expect(s.awardedBids).toEqual([]);
    expect(s.pendingCount).toBe(0);
    expect(s.targetRateMin).toBe(20000);
    expect(s).not.toHaveProperty("sponsoredCount");
  });

  it("a pool submission naming a sponsored indent is blocked before any write", () => {
    const s = summarize(rows);
    expect(poolSubmissionBlockReason(["plain", "campaign"], s.memberIds)).not.toBeNull();
    expect(poolSubmissionBlockReason(["plain"], s.memberIds)).toBeNull();
  });

  it("a lane holding only sponsored loads is closed — nothing to bid as a pool", () => {
    const s = summarize([rows[1]!, rows[2]!]);
    expect(s.members).toEqual([]);
    expect(s.state).toBe("closed");
  });
});

describe("automatic pool reading", () => {
  const pager = (total: number) => {
    const offsets: number[] = [];
    const read = async (offset: number) => {
      offsets.push(offset);
      const n = Math.max(0, Math.min(15, total - offset));
      return {
        loads: Array.from({ length: n }, (_, i) => `r${offset + i}`),
        nextOffset: n === 15 ? offset + 15 : undefined,
      };
    };
    return { offsets, read };
  };

  it("reads 15 → 30 → 43 without any user action", async () => {
    const p = pager(43);
    const r = await readCompletePool(p.read);
    expect(p.offsets).toEqual([0, 15, 30]);
    expect(r.rows).toHaveLength(43);
    expect(r.progress).toEqual({ nextOffset: null, complete: true, truncated: false });
  });

  it("reads a 95-load pool to completion", async () => {
    const p = pager(95);
    const r = await readCompletePool(p.read);
    expect(p.offsets).toEqual([0, 15, 30, 45, 60, 75, 90]);
    expect(r.rows).toHaveLength(95);
    expect(r.progress.complete).toBe(true);
  });

  it("stops at the RPC offset cap and reports truncation instead of re-reading", async () => {
    const p = pager(400);
    const r = await readCompletePool(p.read);
    expect(Math.max(...p.offsets)).toBe(MARKETPLACE_POOL_MAX_OFFSET);
    expect(new Set(p.offsets).size).toBe(p.offsets.length);
    expect(r.progress).toEqual({ nextOffset: null, complete: false, truncated: true });
  });

  it("propagates a page error", async () => {
    await expect(
      readCompletePool(async () => {
        throw new Error("timeout");
      }),
    ).rejects.toThrow("timeout");
  });

  it("is ready only for a completely read pool within the processing limit", () => {
    const complete = { nextOffset: null, complete: true, truncated: false };
    expect(poolBidReadiness({ fetch: complete, eligibleCount: 43 })).toEqual({
      ready: true,
      blocked: null,
    });
    expect(
      poolBidReadiness({
        fetch: { nextOffset: 30, complete: false, truncated: false },
        eligibleCount: 30,
      }),
    ).toEqual({ ready: false, blocked: null });
    expect(
      poolBidReadiness({
        fetch: { nextOffset: null, complete: false, truncated: true },
        eligibleCount: 150,
      }),
    ).toEqual({ ready: false, blocked: POOL_TOO_LARGE_MESSAGE });
    expect(
      poolBidReadiness({ fetch: complete, eligibleCount: POOL_BID_MAX_LOADS + 1 }).blocked,
    ).toBe(POOL_TOO_LARGE_MESSAGE);
    expect(poolBidReadiness({ fetch: complete, eligibleCount: 0 }).ready).toBe(false);
  });
});

describe("identity gate", () => {
  it("is hidden with no award", () => {
    expect(poolIdentityGate([])).toEqual({ state: "hidden", awarded: 0, eligible: 0 });
  });

  it("stays locked after award until the fee gate clears", () => {
    expect(
      poolIdentityGate([
        { fee_payment_status: "required" },
        { fee_payment_status: "pending" },
        { fee_payment_status: "failed" },
      ]).state,
    ).toBe("pending_acceptance");
  });

  it("becomes eligible only for awards whose fee is paid or not required", () => {
    expect(
      poolIdentityGate([
        { fee_payment_status: "paid" },
        { fee_payment_status: "not_required" },
        { fee_payment_status: "pending" },
      ]),
    ).toEqual({ state: "eligible", awarded: 3, eligible: 2 });
  });
});

describe("failure grouping", () => {
  it("groups failures by message and drops load identifiers", () => {
    expect(
      groupPoolBidFailures([
        { indentId: "a", message: "indent_not_open" },
        { indentId: "b", message: "indent_not_open" },
        { indentId: "c", message: " " },
      ] as { indentId: string; message: string }[]),
    ).toEqual([
      { message: "indent_not_open", count: 2 },
      { message: "Unknown error", count: 1 },
    ]);
  });
});

describe("pool size", () => {
  it("pool size never drops below loaded members", () => {
    expect(
      summarize([load("a"), load("b")], [], { laneLoadCount: 1 }).poolSize,
    ).toBe(2);
    expect(summarize([load("a")], [], { laneLoadCount: 104 }).poolSize).toBe(
      104,
    );
  });
});

describe("poolFieldOptions — picker counts from canonical pools", () => {
  const PICKER_LANES = [
    lane("Bangalore", "Chennai", "32 FT", 1),
    lane(" bangalore", "CHENNAI ", "32 ft", 2),
    lane("Bengaluru, Bangalore", "Chennai", "32 FT", 1),
    lane("Bangalore", "Chennai", "20 FT", 4),
    lane("Bangalore", "Hosur", "32 FT", 1),
    lane("Chennai", "Pune", "32 FT", 2),
    lane("Chennai warehouse, CHennai, Tamil nadu", "Pune", "32 FT", 1),
  ];

  it("counts each canonical pickup once, merging case and outer whitespace", () => {
    expect(poolFieldOptions(PICKER_LANES, null, "pickup")).toEqual([
      { label: "Bangalore", count: 8 },
      { label: "Chennai", count: 2 },
      { label: "Bengaluru, Bangalore", count: 1 },
      { label: "Chennai warehouse, CHennai, Tamil nadu", count: 1 },
    ]);
  });

  it("narrows drop and vehicle by exact canonical equality, never substring", () => {
    expect(
      poolFieldOptions(PICKER_LANES, { pickup: "BANGALORE " }, "drop"),
    ).toEqual([
      { label: "Chennai", count: 7 },
      { label: "Hosur", count: 1 },
    ]);
    expect(
      poolFieldOptions(
        PICKER_LANES,
        { pickup: "bangalore", drop: "chennai" },
        "vehicle",
      ),
    ).toEqual([
      { label: "20 FT", count: 4 },
      { label: "32 ft", count: 3 },
    ]);
    expect(poolFieldOptions(PICKER_LANES, { pickup: "Bang" }, "drop")).toEqual([]);
  });

  it("narrows any field by whichever other fields are set, in any order", () => {
    expect(poolFieldOptions(PICKER_LANES, { vehicleType: "20 ft" }, "pickup")).toEqual([
      { label: "Bangalore", count: 4 },
    ]);
    expect(poolFieldOptions(PICKER_LANES, { drop: "Pune" }, "pickup")).toEqual([
      { label: "Chennai", count: 2 },
      { label: "Chennai warehouse, CHennai, Tamil nadu", count: 1 },
    ]);
    expect(poolFieldOptions(PICKER_LANES, { drop: "Hosur" }, "vehicle")).toEqual([
      { label: "32 FT", count: 1 },
    ]);
    expect(poolFieldOptions(PICKER_LANES, { vehicleType: "20 FT" }, "drop")).toEqual([
      { label: "Chennai", count: 4 },
    ]);
  });

  it("vehicle option counts equal the pool counts Marketplace resolves", () => {
    for (const opt of poolFieldOptions(
      PICKER_LANES,
      { pickup: "Bangalore", drop: "Chennai" },
      "vehicle",
    )) {
      expect(
        findPoolLane(PICKER_LANES, {
          pickup: "Bangalore",
          drop: "Chennai",
          vehicleType: opt.label,
        })?.load_count,
      ).toBe(opt.count);
    }
  });

  it("the menu search only narrows the visible list", () => {
    expect(
      poolFieldOptions(PICKER_LANES, null, "pickup", "  BENGAL").map((o) => o.label),
    ).toEqual(["Bengaluru, Bangalore"]);
  });
});
