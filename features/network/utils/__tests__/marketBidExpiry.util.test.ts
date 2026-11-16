import {
  formatMarketBidExpiry,
  isMarketBidActionable,
  isMarketBidExpired,
  isMarketBidExpiredError,
  marketBidExpiryView,
  nextMarketBidExpiryMs,
} from "@/features/network/utils/marketBidExpiry.util";

const local = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(y, mo, d, h, mi).toISOString();

const EXPIRES = local(2026, 10, 18, 10, 30);
const EXPIRES_MS = Date.parse(EXPIRES);

describe("marketBidExpiry", () => {
  it("formats the bid's own expiry in the device time zone", () => {
    expect(formatMarketBidExpiry(EXPIRES)).toBe("18 Nov, 10:30 AM");
    expect(formatMarketBidExpiry(local(2026, 10, 18, 0, 5))).toBe("18 Nov, 12:05 AM");
    expect(formatMarketBidExpiry(local(2026, 10, 18, 15, 0))).toBe("18 Nov, 3:00 PM");
    expect(formatMarketBidExpiry(null)).toBeNull();
    expect(formatMarketBidExpiry("not a date")).toBeNull();
  });

  it("shows an active pending bid as valid until its expiry", () => {
    const bid = { status: "pending", expires_at: EXPIRES };
    expect(marketBidExpiryView(bid, EXPIRES_MS - 1)).toEqual({
      kind: "active",
      label: "Valid until 18 Nov, 10:30 AM",
    });
    expect(isMarketBidActionable(bid, EXPIRES_MS - 1)).toBe(true);
  });

  it("treats a pending bid as expired from the exact expiry instant", () => {
    const bid = { status: "pending", expires_at: EXPIRES };
    expect(isMarketBidExpired(bid, EXPIRES_MS)).toBe(true);
    expect(isMarketBidActionable(bid, EXPIRES_MS)).toBe(false);
    expect(marketBidExpiryView(bid, EXPIRES_MS)).toEqual({ kind: "expired", label: "Bid expired" });
  });

  it("never marks a decided bid expired, even long after its clock", () => {
    for (const status of ["accepted", "rejected", "withdrawn", "superseded"]) {
      const bid = { status, expires_at: EXPIRES };
      expect(isMarketBidExpired(bid, EXPIRES_MS + 86_400_000)).toBe(false);
      expect(marketBidExpiryView(bid, EXPIRES_MS + 86_400_000)).toEqual({ kind: "none" });
    }
  });

  it("leaves a row without expires_at actionable so the server decides", () => {
    const bid = { status: "pending", expires_at: null };
    expect(isMarketBidActionable(bid, EXPIRES_MS)).toBe(true);
    expect(marketBidExpiryView(bid, EXPIRES_MS)).toEqual({ kind: "none" });
  });

  it("recognises the award RPC's bid_expired refusal only", () => {
    expect(isMarketBidExpiredError("bid_expired: bid abc is no longer acceptable")).toBe(true);
    expect(isMarketBidExpiredError("bid_locked: bid already decided")).toBe(false);
    expect(isMarketBidExpiredError(null)).toBe(false);
  });

  it("finds the next boundary among pending bids that are still valid", () => {
    const bids = [
      { status: "pending", expires_at: local(2026, 10, 18, 12, 0) },
      { status: "pending", expires_at: EXPIRES },
      { status: "accepted", expires_at: local(2026, 10, 18, 9, 0) },
      { status: "pending", expires_at: local(2026, 10, 17, 9, 0) },
    ];
    expect(nextMarketBidExpiryMs(bids, Date.parse(local(2026, 10, 18, 8, 0)))).toBe(EXPIRES_MS);
    expect(nextMarketBidExpiryMs(bids, Date.parse(local(2026, 10, 18, 12, 0)))).toBeNull();
  });
});
