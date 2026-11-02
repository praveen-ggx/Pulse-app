import {
  buildDriverWalletTransactions,
  filterDriverWalletTransactions,
  groupDriverWalletTransactions,
} from "../driverWalletTransactions.util";
import type { DriverLedgerRow } from "@/features/drivers/services/drivers.service";
import type { TripRow } from "@/features/trips/services/trips.service";

function ledger(partial: Partial<DriverLedgerRow> & { id: string }): DriverLedgerRow {
  return {
    organization_id: "org",
    driver_id: "drv",
    trip_id: "t1",
    type: "settlement",
    amount: 12500,
    currency: "INR",
    description: "Trip TRP008",
    created_at: "2026-09-13T10:00:00Z",
    created_by: null,
    ...partial,
  };
}

function trip(id: string): TripRow {
  return {
    id,
    client_id: "c1",
    client_name: "Godrej India",
    pickup_area: "A",
    drop_location: "B",
  } as TripRow;
}

describe("buildDriverWalletTransactions", () => {
  it("lists every capture and DCO expenses with the trip", () => {
    const rows = buildDriverWalletTransactions({
      settlements: [
        ledger({ id: "s1", amount: 12500, created_at: "2026-09-13T12:00:00Z" }),
        ledger({ id: "s2", amount: 3000, created_at: "2026-09-13T13:00:00Z" }),
      ],
      expenses: [
        {
          id: "e1",
          tripId: "t1",
          kind: "fuel",
          label: "Fuel · diesel",
          amount: 2000,
          enteredAt: "2026-09-13T11:00:00Z",
        },
      ],
      tripsById: { t1: trip("t1") },
      tripDisplay: () => "TRP008",
      partyNameForTrip: () => "Godrej India",
      includeExpenses: true,
    });
    expect(rows.map((r) => r.id)).toEqual(["in:s2", "in:s1", "out:e1"]);
    expect(rows[2]).toMatchObject({
      kind: "out",
      title: "Fuel · diesel",
      subtitle: "TRP008",
      amount: 2000,
    });
  });

  it("hides expenses when not DCO", () => {
    const rows = buildDriverWalletTransactions({
      settlements: [ledger({ id: "s1" })],
      expenses: [
        {
          id: "e1",
          tripId: "t1",
          kind: "other",
          label: "Parking",
          amount: 100,
          enteredAt: "2026-09-13T11:00:00Z",
        },
      ],
      tripsById: { t1: trip("t1") },
      tripDisplay: () => "TRP008",
      partyNameForTrip: () => "Godrej India",
      includeExpenses: false,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("in");
  });
});

describe("filter and group wallet transactions", () => {
  it("filters by party or trip and groups by day label", () => {
    const rows = [
      { id: "1", title: "Godrej India", subtitle: "TRP008", tripRef: "TRP008", at: "2026-09-13" },
      { id: "2", title: "Fuel", subtitle: "TRP001", tripRef: "TRP001", at: "2026-09-12" },
    ];
    expect(filterDriverWalletTransactions(rows as never, "trp008")).toHaveLength(1);
    expect(
      groupDriverWalletTransactions(rows, (iso) => (iso.startsWith("2026-09-13") ? "13 Sept" : "12 Sept")),
    ).toEqual([
      { sectionLabel: "13 Sept", rows: [rows[0]] },
      { sectionLabel: "12 Sept", rows: [rows[1]] },
    ]);
  });
});
