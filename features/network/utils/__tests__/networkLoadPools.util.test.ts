import {
  buildNetworkLoadPools,
  describeQuoteFailure,
  filterNetworkLoadPools,
  poolQuoteFailureLines,
} from "@/features/network/utils/networkLoadPools.util";

describe("quote failure wording", () => {
  it("humanizes indent_not_open", () => {
    expect(describeQuoteFailure("indent_not_open")).toBe(
      "This indent is no longer open for quoting.",
    );
    expect(describeQuoteFailure("ERROR: indent_not_open (P0001)")).toBe(
      "This indent is no longer open for quoting.",
    );
  });

  it("keeps unknown reasons as the raw backend text", () => {
    expect(describeQuoteFailure("duplicate key value")).toBe("duplicate key value");
    expect(describeQuoteFailure("  ")).toBe("Unknown error");
  });

  it("groups known and unknown failures into one sentence each", () => {
    expect(
      poolQuoteFailureLines([
        { message: "indent_not_open" },
        { message: "ERROR: indent_not_open" },
        { message: "timeout" },
      ]),
    ).toEqual([
      "2 loads could not be quoted because the indent is no longer open.",
      "1 load could not be quoted: timeout",
    ]);
  });
});
import { poolKeyId } from "@/features/network/utils/pooledOpportunity.util";
import { shipperPoolLanes } from "@/features/network/utils/shipperPoolIndents.util";

const load = (
  id: string,
  org: string,
  pickup: string | null,
  drop: string | null,
  vehicle: string | null,
  extra: Record<string, unknown> = {},
) => ({
  id,
  organization_id: org,
  creator_organization_name: org === "acme" ? "Acme Steel" : "Bolt Logistics",
  pickup_area: pickup,
  drop_location: drop,
  vehicle_type: vehicle,
  pickup_date: "2026-10-08",
  supplier_target: 20000,
  ...extra,
});

describe("buildNetworkLoadPools — canonical lane only", () => {
  it("keeps each vehicle's capacity instead of multiplying by the indent count", () => {
    const { pools } = buildNetworkLoadPools([
      load("a", "acme", "Bhandara", "Bengaluru", "20 MT", { weight: 20000 }),
      load("b", "bolt", "Bhandara", "Bengaluru", "20 MT", { weight: 20000 }),
      load("c", "acme", "Bhandara", "Bengaluru", "20 MT", { weight: 20000 }),
    ]);
    expect(pools).toHaveLength(1);
    expect(pools[0]!.members).toHaveLength(3);
    expect(pools[0]!.weightKgMin).toBe(20000);
    expect(pools[0]!.weightKgMax).toBe(20000);
  });

  it("one load is a pool of one", () => {
    const { pools, unpooled } = buildNetworkLoadPools([
      load("a", "acme", "Delhi", "Hyderabad", "24 MT"),
    ]);
    expect(unpooled).toEqual([]);
    expect(pools).toHaveLength(1);
    expect(pools[0]!.shipperCount).toBe(1);
    expect(pools[0]!.members.map((m) => m.id)).toEqual(["a"]);
  });

  it("carries no shipper identity on the pool", () => {
    const { pools } = buildNetworkLoadPools([
      load("a", "acme", "Pune", "Mumbai", "32 FT"),
      load("b", "bolt", "Pune", "Mumbai", "32 FT"),
    ]);
    expect(pools[0]).not.toHaveProperty("shipperOrgId");
    expect(pools[0]).not.toHaveProperty("shipperLabel");
    expect(JSON.stringify({ ...pools[0], members: [] })).not.toMatch(
      /acme|bolt|Acme Steel|Bolt Logistics/,
    );
  });

  it("merges case and outer-whitespace variants from the same shipper", () => {
    const { pools } = buildNetworkLoadPools([
      load("a", "acme", "Bangalore", "Chennai", "32 FT"),
      load("b", "acme", " bangalore ", "CHENNAI", "32 ft"),
      load("c", "acme", "BANGALORE", "Chennai ", " 32 Ft"),
    ]);
    expect(pools).toHaveLength(1);
    expect(pools[0]!.members.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("two shippers on the same canonical lane form one pool", () => {
    const { pools } = buildNetworkLoadPools([
      load("a", "acme", "Pune", "Mumbai", "32 FT"),
      load("b", "bolt", "Pune", "Mumbai", "32 FT"),
      load("c", "acme", "pune", "mumbai", "32 ft"),
    ]);
    expect(pools).toHaveLength(1);
    expect(pools[0]!.members.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(pools[0]!.shipperCount).toBe(2);
  });

  it("the same shippers on a different vehicle form a separate pool", () => {
    const { pools } = buildNetworkLoadPools([
      load("a", "acme", "Pune", "Mumbai", "32 FT"),
      load("b", "bolt", "Pune", "Mumbai", "20 FT"),
    ]);
    expect(pools.map((p) => p.members.map((m) => m.id))).toEqual([["a"], ["b"]]);
  });

  it("keeps similar but different lanes separate — no substring grouping", () => {
    const { pools } = buildNetworkLoadPools([
      load("a", "acme", "Bangalore", "Chennai", "32 FT"),
      load("b", "acme", "Bengaluru, Bangalore", "Chennai", "32 FT"),
      load("c", "acme", "Bangalore", "Chennai Port", "32 FT"),
      load("d", "acme", "Bangalore", "Chennai", "32 FT HQ"),
      load("e", "acme", "Navi  Mumbai", "Pune", "32 FT"),
      load("f", "acme", "Navi Mumbai", "Pune", "32 FT"),
    ]);
    expect(pools).toHaveLength(6);
  });

  it("leaves loads missing pickup, drop or vehicle unpooled", () => {
    const { pools, unpooled } = buildNetworkLoadPools([
      load("a", "acme", "Pune", "Mumbai", null),
      load("b", "acme", "Pune", " ", "32 FT"),
      load("c", "acme", "Pune", "Mumbai", "32 FT"),
    ]);
    expect(pools.map((p) => p.members.map((m) => m.id))).toEqual([["c"]]);
    expect(unpooled.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("never lists a load twice", () => {
    const a = load("a", "acme", "Pune", "Mumbai", "32 FT");
    const { pools } = buildNetworkLoadPools([a, a]);
    expect(pools[0]!.members).toHaveLength(1);
  });

  it("summarises the pickup window and target range", () => {
    const { pools } = buildNetworkLoadPools([
      load("a", "acme", "Pune", "Mumbai", "32 FT", { pickup_date: "2026-10-09", supplier_target: 21000 }),
      load("b", "acme", "Pune", "Mumbai", "32 FT", { pickup_date: "2026-10-07", supplier_target: 19000 }),
    ]);
    expect(pools[0]).toMatchObject({
      earliestPickup: "2026-10-07",
      latestPickup: "2026-10-09",
      targetRateMin: 19000,
      targetRateMax: 21000,
    });
  });
});

describe("shared pool identity", () => {
  it("the Network pool id is exactly the Marketplace / Indent Pool id", () => {
    const rows = [
      load("a", "acme", " pune", "MUMBAI", "32 ft "),
      load("b", "bolt", "Pune", "Mumbai", "32 FT"),
    ];
    const { pools } = buildNetworkLoadPools(rows);
    const marketId = poolKeyId({ pickup: "Pune", drop: "Mumbai", vehicleType: "32 FT" });
    expect(pools).toHaveLength(1);
    expect(pools[0]!.id).toBe(marketId);
    expect(shipperPoolLanes(rows)[0]!.poolId).toBe(marketId);
    expect(pools[0]!.id).not.toMatch(/acme|bolt|#/);
  });
});

describe("filterNetworkLoadPools", () => {
  const { pools } = buildNetworkLoadPools([
    load("a", "acme", "Bangalore", "Chennai", "32 FT"),
    load("b", "bolt", "Bangalore", "Chennai", "20 FT"),
    load("c", "acme", "Bengaluru, Bangalore", "Chennai", "32 FT"),
  ]);

  it("narrows by exact canonical pickup / drop / vehicle", () => {
    expect(filterNetworkLoadPools(pools, { pickup: " BANGALORE" })).toHaveLength(2);
    expect(
      filterNetworkLoadPools(pools, { pickup: "bangalore", drop: "chennai", vehicleType: "32 ft" }),
    ).toHaveLength(1);
    expect(filterNetworkLoadPools(pools, { pickup: "Bang" })).toHaveLength(0);
    expect(filterNetworkLoadPools(pools, null)).toHaveLength(3);
  });
});
