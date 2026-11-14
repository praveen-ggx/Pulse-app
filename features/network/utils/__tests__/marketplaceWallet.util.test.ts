import { marketplaceWalletFigures } from "@/features/network/utils/marketplaceWallet.util";
import type { MyOrgMarketBidRow } from "@/features/network/services/findLoadsForOrg.service";

function bid(partial: Partial<MyOrgMarketBidRow>): MyOrgMarketBidRow {
  return {
    id: "b",
    indent_id: "i",
    indent_number: null,
    pickup_area: "Pune",
    drop_location: "Bengaluru",
    pickup_date: null,
    load_type: null,
    owner_organization_id: null,
    owner_organization_name: null,
    owner_masked_phone: null,
    owner_phone: null,
    amount: 1000,
    note: null,
    status: "pending",
    fee_payment_status: "not_required",
    platform_fee_amount: null,
    created_at: "2026-11-01T00:00:00.000Z",
    accepted_at: null,
    ...partial,
  };
}

describe("marketplace wallet figures", () => {
  it("counts only unpaid awarded fees in the wallet", () => {
    const figures = marketplaceWalletFigures([
      bid({ id: "due", status: "accepted", fee_payment_status: "required", platform_fee_amount: 500 }),
      bid({ id: "paid", status: "accepted", fee_payment_status: "paid", platform_fee_amount: 900 }),
      bid({ id: "open", status: "pending", platform_fee_amount: 100 }),
    ]);
    expect(figures.due).toBe(500);
    expect(figures.transactions).toBe(3);
    expect(figures.awarded).toBe(2);
  });
});
