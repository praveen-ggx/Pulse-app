import {
  mergeIndentReviewHubOffers,
  shouldFallbackDirectQuotesToTable,
} from "@/features/indents/utils/bidding/indentReviewHubOffers.util";
import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import type { DriverDirectBidRow } from "@/features/network/services/bids.service";
import type { MarketBidForIndentRow } from "@/features/network/services/marketBids.service";

const quote = (id: string): DirectQuoteRow => ({
  id,
  indent_id: "ind-1",
  bidder_organization_id: "org-b",
  bidder_organization_name: "Bond",
  amount: 1000,
  notes: null,
  status: "pending",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

describe("mergeIndentReviewHubOffers", () => {
  it("includes Pulse driver bids and marketplace bids with the org quotes", () => {
    const driver: DriverDirectBidRow = {
      id: "ddb-1",
      post_id: "post-1",
      driver_user_id: "user-1",
      driver_display_name: "Ravi",
      driver_avatar_url: null,
      driver_avatar_seed: null,
      is_fleet_owner: false,
      amount: 900,
      note: null,
      status: "pending",
      counter_amount: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const market = {
      id: "mb-1",
      indent_id: "ind-1",
      bidder_type: "dco",
      bidder_user_id: "user-2",
      bidder_display_name: "Pilot",
      bidder_organization_id: null,
      bidder_organization_name: null,
      bidder_masked_phone: null,
      bidder_phone: null,
      is_fleet_owner: false,
      amount: 950,
      note: null,
      status: "pending",
      fee_payment_status: "not_required",
      platform_fee_amount: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      accepted_at: null,
      vehicle_number: null,
      vehicle_brand: null,
      vehicle_model: null,
      vehicle_body_type: null,
      vehicle_capacity: null,
    } as MarketBidForIndentRow;

    const merged = mergeIndentReviewHubOffers({
      indentId: "ind-1",
      directQuotes: [quote("dq-1")],
      driverBids: [driver],
      marketBids: [market],
    });
    expect(merged.map((q) => q.id)).toEqual(["dq-1", "ddb-1", "mb-1"]);
    expect(merged[1]?.offer_source).toBe("driver_direct_bid");
    expect(merged[2]?.offer_source).toBe("market_bid");
  });
});

describe("shouldFallbackDirectQuotesToTable", () => {
  it("falls back when the RPC errors or returns a non-list", () => {
    expect(shouldFallbackDirectQuotesToTable({ message: "503" }, [])).toBe(true);
    expect(shouldFallbackDirectQuotesToTable(null, { quotes: [] })).toBe(true);
    expect(shouldFallbackDirectQuotesToTable(null, [])).toBe(false);
  });
});
