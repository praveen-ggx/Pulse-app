import { buildMarketplaceBidPools } from "@/features/network/utils/marketplaceBidPools.util";
import type { MyOrgMarketBidRow } from "@/features/network/services/findLoadsForOrg.service";

function bid(
  overrides: Partial<MyOrgMarketBidRow> & Pick<MyOrgMarketBidRow, "id">,
): MyOrgMarketBidRow {
  return {
    indent_id: `indent-${overrides.id}`,
    indent_number: "IND000001",
    pickup_area: "Periyapalayam, Tamil Nadu",
    drop_location: "Poonamallee, Tamil Nadu",
    pickup_date: "2026-11-07",
    load_type: "Machinery Parts",
    owner_organization_id: "org-shipper",
    owner_organization_name: "Gogovan India Pvt Ltd",
    owner_masked_phone: "****1234",
    owner_phone: null,
    amount: 4233,
    note: null,
    status: "pending",
    fee_payment_status: "not_required",
    platform_fee_amount: null,
    created_at: "2026-11-11T07:48:00Z",
    accepted_at: null,
    ...overrides,
  };
}

describe("buildMarketplaceBidPools", () => {
  it("groups same-lane pending bids into one anonymous pool", () => {
    const pools = buildMarketplaceBidPools([
      bid({ id: "a", amount: 4000 }),
      bid({ id: "b", amount: 4500 }),
      bid({
        id: "c",
        pickup_area: "Bengaluru",
        drop_location: "Chennai",
        load_type: "Steel",
        amount: 10000,
      }),
    ]);
    expect(pools).toHaveLength(2);
    expect(pools[0]!.members).toHaveLength(2);
    expect(pools[0]!.rateMin).toBe(4000);
    expect(pools[0]!.rateMax).toBe(4500);
    expect(pools[0]!.uniformStatus).toBe("pending");
    expect(pools[1]!.members).toHaveLength(1);
  });

  it("keeps lane facts only on the pool summary (shipper stays on members)", () => {
    const [pool] = buildMarketplaceBidPools([bid({ id: "a" })]);
    expect(pool).toMatchObject({
      pickup: "Periyapalayam, Tamil Nadu",
      drop: "Poonamallee, Tamil Nadu",
      loadType: "Machinery Parts",
      uniformStatus: "pending",
    });
    expect(pool).not.toHaveProperty("owner_organization_name");
    expect(pool).not.toHaveProperty("indent_number");
  });
});
