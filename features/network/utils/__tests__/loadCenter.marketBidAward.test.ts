import {
  acceptedMarketBidAmountByIndentId,
  resolveGetLoadTicketCommerce,
} from "@/features/network/utils/loadCenter.model";

const load = {
  id: "indent-1",
  status: "awarded",
  supplier_target: 35700,
  supplier_rate_basis: "per_trip",
  weight: 20000,
};

describe("acceptedMarketBidAmountByIndentId", () => {
  it("keeps only accepted bids with a positive amount", () => {
    const map = acceptedMarketBidAmountByIndentId([
      { indent_id: "indent-1", amount: 48000, status: "accepted" },
      { indent_id: "indent-2", amount: 50000, status: "pending" },
      { indent_id: "indent-3", amount: 0, status: "accepted" },
    ]);
    expect(map.get("indent-1")).toBe(48000);
    expect(map.has("indent-2")).toBe(false);
    expect(map.has("indent-3")).toBe(false);
  });
});

describe("resolveGetLoadTicketCommerce with a Marketplace award", () => {
  it("shows the accepted bid as BIDS WON when there is no direct quote", () => {
    const result = resolveGetLoadTicketCommerce(
      "AWARDED",
      "ALL" as never,
      load,
      undefined,
      new Set(),
      true,
      48000,
    );
    expect(result.kicker).toBe("BIDS WON");
    expect(result.amountInr).toBe(48000);
  });

  it("falls back to the target rate when no accepted bid amount is supplied", () => {
    const result = resolveGetLoadTicketCommerce(
      "AWARDED",
      "ALL" as never,
      load,
      undefined,
      new Set(),
      true,
      null,
    );
    expect(result.kicker).not.toBe("BIDS WON");
    expect(result.amountInr).toBe(35700);
  });
});
