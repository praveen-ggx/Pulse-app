import { sumTripOtherIncome } from "../driverTripSettlement.util";
import type { DriverLedgerRow } from "@/features/drivers/services/drivers.service";

function row(partial: Partial<DriverLedgerRow>): DriverLedgerRow {
  return {
    id: Math.random().toString(36).slice(2),
    organization_id: "org-1",
    driver_id: "drv-1",
    trip_id: "trip-1",
    type: "adjustment",
    amount: 0,
    currency: "INR",
    description: null,
    created_at: "2026-11-17T00:00:00Z",
    created_by: null,
    ...partial,
  };
}

describe("sumTripOtherIncome", () => {
  it("counts bonuses and plain positive adjustments", () => {
    const entries = [
      row({ type: "bonus", amount: 500, description: "Diwali bonus" }),
      row({ type: "adjustment", amount: 200, description: "Night halt allowance" }),
    ];
    expect(sumTripOtherIncome(entries, "trip-1")).toBe(700);
  });

  it("does not count the fleet-payout mirror row as extra income", () => {
    const entries = [
      row({ type: "adjustment", amount: 12000, description: "Trip payment | Sync: FLEET_PAID_PENDING" }),
      row({ type: "bonus", amount: 300 }),
    ];
    expect(sumTripOtherIncome(entries, "trip-1")).toBe(300);
  });

  it("ignores other trips", () => {
    expect(sumTripOtherIncome([row({ type: "bonus", amount: 100, trip_id: "trip-2" })], "trip-1")).toBe(0);
  });
});
