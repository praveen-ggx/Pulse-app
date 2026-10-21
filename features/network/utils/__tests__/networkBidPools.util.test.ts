import {
  buildNetworkBidPools,
  describeNetworkBidStates,
  existingNetworkPoolQuoteAmount,
  networkBidMemberState,
  type NetworkBidQuote,
} from "@/features/network/utils/networkBidPools.util";
import { buildNetworkLoadPools } from "@/features/network/utils/networkLoadPools.util";
import { poolKey, poolKeyId } from "@/features/network/utils/pooledOpportunity.util";

type Load = {
  id: string;
  organization_id: string;
  pickup_area: string | null;
  drop_location: string | null;
  vehicle_type: string | null;
  status?: string | null;
  is_sponsored?: boolean;
};

const load = (
  id: string,
  pickup: string | null,
  drop: string | null,
  vehicle: string | null,
  extra: Partial<Load> = {},
): Load => ({
  id,
  organization_id: id.startsWith("s") ? "spacex" : "acme",
  pickup_area: pickup,
  drop_location: drop,
  vehicle_type: vehicle,
  status: "open",
  ...extra,
});

const quotes = (rows: Record<string, NetworkBidQuote>) => new Map(Object.entries(rows));

describe("buildNetworkBidPools", () => {
  it("groups two quotes on the same canonical lane into one pool, across shippers", () => {
    const loads = [load("a1", "Pune", "Mumbai", "32 FT"), load("s1", " pune", "MUMBAI ", "32 ft")];
    const { pools, individual } = buildNetworkBidPools(
      loads,
      quotes({ a1: { status: "pending", amount: 20000 }, s1: { status: "pending", amount: 20000 } }),
    );
    expect(pools).toHaveLength(1);
    expect(pools[0]!.members.map((m) => m.id)).toEqual(["a1", "s1"]);
    expect(pools[0]!.shipperCount).toBe(2);
    expect(individual).toEqual([]);
  });

  it("uses the same pool id as Network Loads and Marketplace (poolKeyId)", () => {
    const loads = [load("a1", "Pune", "Mumbai", "32 FT")];
    const bid = buildNetworkBidPools(loads, quotes({ a1: { status: "pending", amount: 1 } }));
    const open = buildNetworkLoadPools(loads);
    const expected = poolKeyId(poolKey({ pickup: "Pune", drop: "Mumbai", vehicleType: "32 FT" }));
    expect(bid.pools[0]!.id).toBe(expected);
    expect(open.pools[0]!.id).toBe(expected);
  });

  it("a single quoted load is still a pool of one", () => {
    const { pools, individual } = buildNetworkBidPools(
      [load("a1", "Delhi", "Hyderabad", "24 MT")],
      quotes({ a1: { status: "pending", amount: 18000 } }),
    );
    expect(pools).toHaveLength(1);
    expect(pools[0]!.members).toHaveLength(1);
    expect(individual).toEqual([]);
  });

  it("keeps different pickup, drop or vehicle as separate pools", () => {
    const { pools } = buildNetworkBidPools(
      [
        load("a1", "Pune", "Mumbai", "32 FT"),
        load("a2", "Nashik", "Mumbai", "32 FT"),
        load("a3", "Pune", "Goa", "32 FT"),
        load("a4", "Pune", "Mumbai", "20 FT"),
      ],
      quotes({}),
    );
    expect(pools.map((p) => p.members.map((m) => m.id))).toEqual([["a1"], ["a2"], ["a3"], ["a4"]]);
  });

  it("sponsored Reach and incomplete lanes stay individual", () => {
    const sponsored = load("a1", "Pune", "Mumbai", "32 FT", { is_sponsored: true });
    const incomplete = load("a2", "Pune", "Mumbai", null);
    const pooled = load("a3", "Pune", "Mumbai", "32 FT");
    const { pools, individual } = buildNetworkBidPools(
      [sponsored, incomplete, pooled],
      quotes({}),
      (l) => l.is_sponsored !== true,
    );
    expect(pools.map((p) => p.members.map((m) => m.id))).toEqual([["a3"]]);
    expect(individual.map((l) => l.id)).toEqual(["a1", "a2"]);
  });

  it("keeps each member's own status — a mixed pool has no single status", () => {
    const { pools } = buildNetworkBidPools(
      [load("a1", "Pune", "Mumbai", "32 FT"), load("s1", "Pune", "Mumbai", "32 FT")],
      quotes({
        a1: { status: "pending", amount: 19500, counter_amount: 20500 },
        s1: { status: "pending", amount: 19500, counter_amount: null },
      }),
    );
    expect(pools[0]!.stateCounts).toEqual({ countered: 1, pending: 1 });
    expect(pools[0]!.uniformState).toBeNull();
    expect(describeNetworkBidStates(pools[0]!.stateCounts)).toBe("1 countered · 1 pending");
  });

  it("a uniform pool reports that one status", () => {
    const { pools } = buildNetworkBidPools(
      [load("a1", "Pune", "Mumbai", "32 FT"), load("s1", "Pune", "Mumbai", "32 FT")],
      quotes({ a1: { status: "pending", amount: 1 }, s1: { status: "pending", amount: 1 } }),
    );
    expect(pools[0]!.uniformState).toBe("pending");
    expect(describeNetworkBidStates(pools[0]!.stateCounts)).toBe("2 pending");
  });

  it("reports the rate range when an accepted counter split the members' amounts", () => {
    const { pools } = buildNetworkBidPools(
      [load("a1", "Pune", "Mumbai", "32 FT"), load("s1", "Pune", "Mumbai", "32 FT")],
      quotes({
        a1: { status: "pending", amount: "20500.00", counter_amount: "20500.00" },
        s1: { status: "pending", amount: "19500.00" },
      }),
    );
    expect(pools[0]!.rateMin).toBe(19500);
    expect(pools[0]!.rateMax).toBe(20500);
    expect(pools[0]!.stateCounts).toEqual({ agreed: 1, pending: 1 });
    expect(describeNetworkBidStates(pools[0]!.stateCounts)).toBe(
      "1 counter accepted · 1 pending",
    );
  });
});

describe("networkBidMemberState", () => {
  it("maps each quote row on its own", () => {
    const open = { status: "open" };
    expect(networkBidMemberState(open, { status: "pending" })).toBe("pending");
    expect(networkBidMemberState(open, { status: "pending", counter_amount: 100 })).toBe("countered");
    expect(networkBidMemberState(open, { status: "accepted" })).toBe("accepted");
    expect(networkBidMemberState(open, { status: "rejected" })).toBe("rejected");
  });

  it("an accepted counter (amount = counter, still pending) is no longer countered", () => {
    const open = { status: "open" };
    expect(
      networkBidMemberState(open, { status: "pending", amount: 20500, counter_amount: 20500 }),
    ).toBe("agreed");
    expect(
      networkBidMemberState(open, { status: "pending", amount: 19500, counter_amount: 20500 }),
    ).toBe("countered");
  });

  it("an open quote on an ended indent is closed, not pending", () => {
    expect(networkBidMemberState({ status: "closed" }, { status: "pending" })).toBe("closed");
    expect(networkBidMemberState({ status: "awarded" }, { status: "pending" })).toBe("closed");
  });
});

describe("existingNetworkPoolQuoteAmount", () => {
  it("returns null when there is no existing bid (new quote stays empty)", () => {
    expect(existingNetworkPoolQuoteAmount([])).toBeNull();
    expect(existingNetworkPoolQuoteAmount([null, 0, "0"])).toBeNull();
  });

  it("returns the lowest positive existing bid for revise prefill", () => {
    expect(existingNetworkPoolQuoteAmount([56000])).toBe(56000);
    expect(existingNetworkPoolQuoteAmount([56000, 56000])).toBe(56000);
    expect(existingNetworkPoolQuoteAmount([null, 56000, 54000])).toBe(54000);
  });
});
