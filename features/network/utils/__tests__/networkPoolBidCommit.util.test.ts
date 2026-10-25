import {
  clampPoolVehicleCommit,
  isNetworkPoolCommitLive,
  remainingPoolCommitSlots,
  shipperCanSeePendingPoolQuote,
} from "@/features/network/utils/networkPoolBidCommit.util";

const live = {
  status: "active",
  awarded_count: 3,
  vehicle_limit: 10,
  valid_until: "2026-12-01T23:59:59.000Z",
};

describe("networkPoolBidCommit", () => {
  it("hides a pending quote after the committed vehicles are awarded", () => {
    const exhausted = { ...live, awarded_count: 10 };
    expect(remainingPoolCommitSlots(exhausted)).toBe(0);
    expect(isNetworkPoolCommitLive(exhausted, new Date("2026-10-25T00:00:00Z"))).toBe(
      false,
    );
    expect(
      shipperCanSeePendingPoolQuote(
        { status: "pending", pool_commit_id: "c1" },
        exhausted,
        new Date("2026-10-25T00:00:00Z"),
      ),
    ).toBe(false);
  });

  it("hides a pending quote after valid-until", () => {
    expect(
      isNetworkPoolCommitLive(live, new Date("2026-12-02T00:00:00Z")),
    ).toBe(false);
  });

  it("keeps a live pending quote visible and lets the supplier bid again later", () => {
    expect(remainingPoolCommitSlots(live)).toBe(7);
    expect(isNetworkPoolCommitLive(live, new Date("2026-10-25T00:00:00Z"))).toBe(true);
    expect(
      shipperCanSeePendingPoolQuote(
        { status: "pending", pool_commit_id: "c1" },
        live,
        new Date("2026-10-25T00:00:00Z"),
      ),
    ).toBe(true);
  });

  it("lets the operator commit above current pool size, up to 10", () => {
    expect(clampPoolVehicleCommit(10, 1, 2)).toBe(10);
    expect(clampPoolVehicleCommit(0, 33, 8)).toBe(1);
    expect(clampPoolVehicleCommit(8, 12, null)).toBe(8);
    expect(clampPoolVehicleCommit(11, 12, null)).toBe(10);
  });
});
