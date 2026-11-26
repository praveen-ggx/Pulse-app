import {
  clampPoolVehicleCommit,
  isNetworkPoolCommitLive,
  poolVehicleCommitCap,
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

  it("caps the commit at the pool load count and never above 10", () => {
    expect(clampPoolVehicleCommit(10, 1)).toBe(1);
    expect(clampPoolVehicleCommit(3, 2)).toBe(2);
    expect(clampPoolVehicleCommit(0, 33)).toBe(1);
    expect(clampPoolVehicleCommit(8, 12)).toBe(8);
    expect(clampPoolVehicleCommit(11, 12)).toBe(10);
  });

  it("returns null when pool size is unknown so UI can block the 400 path", () => {
    expect(poolVehicleCommitCap(undefined)).toBeNull();
    expect(poolVehicleCommitCap(null)).toBeNull();
    expect(poolVehicleCommitCap(0)).toBeNull();
    expect(poolVehicleCommitCap(NaN)).toBeNull();
    expect(poolVehicleCommitCap(-3)).toBeNull();
    expect(clampPoolVehicleCommit(5, undefined)).toBeNull();
    expect(clampPoolVehicleCommit(5, 0)).toBeNull();
    expect(clampPoolVehicleCommit(5, NaN)).toBeNull();
    expect(clampPoolVehicleCommit(5, -1)).toBeNull();
  });

  it("floors fractional pool size for the cap", () => {
    expect(poolVehicleCommitCap(2.7)).toBe(2);
    expect(clampPoolVehicleCommit(5, 2.7)).toBe(2);
  });
});
