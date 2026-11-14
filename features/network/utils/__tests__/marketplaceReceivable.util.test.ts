import { marketplaceArBook } from "@/features/network/utils/marketplaceWallet.util";
import type { MyOrgMarketBidRow } from "@/features/network/services/findLoadsForOrg.service";

function bid(patch: Partial<MyOrgMarketBidRow>): MyOrgMarketBidRow {
  return {
    id: "bid",
    indent_id: "indent",
    indent_number: null,
    pickup_area: "Periyapalayam",
    drop_location: "Poonamallee",
    pickup_date: null,
    load_type: null,
    owner_organization_id: null,
    owner_organization_name: "Shipper",
    owner_masked_phone: null,
    owner_phone: null,
    amount: 4233,
    note: null,
    status: "accepted",
    fee_payment_status: "not_required",
    platform_fee_amount: null,
    created_at: "2026-11-11T00:00:00.000Z",
    accepted_at: null,
    ...patch,
  };
}

describe("marketplaceArBook", () => {
  it("keeps only an awarded bid that already has a trip, and bills the supplier rate", () => {
    const book = marketplaceArBook(
      [
        bid({ id: "won", indent_id: "won-indent", amount: 4233 }),
        bid({ id: "lost", indent_id: "lost-indent", status: "rejected", amount: 9000 }),
        bid({ id: "open", indent_id: "open-indent", status: "pending", amount: 1000 }),
      ],
      [
        {
          id: "trip-1",
          indentId: "won-indent",
          organizationId: "shipper-org",
          supplierRate: 5000,
          clientPrice: 8000,
        },
      ],
      [
        { tripId: "trip-1", amountIn: 0, amountOut: 2000, contactType: "supplier" },
      ],
      "bidder-org",
    );
    expect(book.trips).toBe(1);
    expect(book.billed).toBe(5000);
    expect(book.received).toBe(2000);
    expect(book.due).toBe(3000);
    expect(book.lines[0]?.lane).toBe("Periyapalayam → Poonamallee");
  });

  it("uses the won bid amount when the trip has no rate yet", () => {
    const book = marketplaceArBook(
      [bid({ amount: 4233 })],
      [
        {
          id: "trip-1",
          indentId: "indent",
          organizationId: "bidder-org",
          supplierRate: 0,
          clientPrice: 0,
        },
      ],
      [],
      "bidder-org",
    );
    expect(book.billed).toBe(4233);
    expect(book.received).toBe(0);
    expect(book.due).toBe(4233);
  });
});
