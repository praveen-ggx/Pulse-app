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

  it("lists book collections and skips a ledger copy of the same capture", () => {
    const rows = buildDriverWalletTransactions({
      settlements: [
        ledger({
          id: "s1",
          amount: 20,
          trip_id: "t1",
          reference_type: "dco_capture",
          created_at: "2026-11-24T08:00:00Z",
        }),
        ledger({
          id: "s2",
          amount: 1400,
          trip_id: "t2",
          created_at: "2026-11-18T08:00:00Z",
        }),
      ],
      expenses: [
        {
          id: "e1",
          tripId: "t1",
          kind: "fuel",
          label: "Fuel",
          amount: 2500,
          enteredAt: "2026-11-13T08:00:00Z",
        },
      ],
      collections: [
        {
          id: "indie:c1",
          tripId: "t1",
          amount: 20,
          at: "2026-11-24T08:01:00Z",
          partyName: "raju trx",
        },
        {
          id: "indie:c2",
          tripId: "t9",
          amount: 1400,
          at: "2026-11-18T09:00:00Z",
          partyName: "Madras Logistics",
        },
      ],
      tripsById: { t1: trip("t1"), t2: trip("t2") },
      tripDisplay: (_trip, tripId) => (tripId === "t9" ? "TRP001" : "TRP009"),
      partyNameForTrip: () => "Fleet",
      includeExpenses: true,
    });
    expect(rows.map((row) => row.id)).toEqual(["in:indie:c1", "in:indie:c2", "in:s2", "out:e1"]);
    expect(rows[0]).toMatchObject({ title: "raju trx", amount: 20 });
    expect(rows[1]).toMatchObject({ title: "Madras Logistics", amount: 1400 });
  });

  it("renames older captures to the trip's tagged party name", () => {
    const taggedTrip = {
      id: "t1",
      client_id: "c-amzg",
      client_name: "AMzg",
      notes: "<!--pulse-dco-party:{\"id\":\"c-amzg\",\"name\":\"ADANI GROUPS\"}-->",
      pickup_area: "A",
      drop_location: "B",
    } as TripRow;
    const rows = buildDriverWalletTransactions({
      settlements: [],
      expenses: [],
      collections: [
        {
          id: "self:c1",
          tripId: "t1",
          amount: 1600,
          at: "2026-11-25T10:00:00Z",
          partyName: "AMzg",
        },
        {
          id: "self:c2",
          tripId: "t1",
          amount: 960,
          at: "2026-11-25T11:00:00Z",
          partyName: "ADANI GROUPS",
        },
      ],
      tripsById: { t1: taggedTrip },
      tripDisplay: () => "TRP001",
      partyNameForTrip: () => "ADANI GROUPS",
      includeExpenses: false,
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.title === "ADANI GROUPS")).toBe(true);
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

describe("walletTxnPayerName — who pays the driver", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { walletTxnPayerName } = require("../driverWalletTransactions.util");

  it("company-assigned trip: the assigning company, not its customer", () => {
    const t = { ...trip("t1"), client_name: "Godrej", operating_mode: null, source: "manual" } as TripRow;
    expect(walletTxnPayerName(t, "Party", "nihas logs")).toBe("nihas logs");
  });

  it("driver's own DCO trip: the party the driver tagged", () => {
    const t = { ...trip("t1"), client_name: "JSW Steels", operating_mode: "DCO" } as TripRow;
    expect(walletTxnPayerName(t, "Party", "Driver's own workspace")).toBe("JSW Steels");
  });

  it("marketplace trip: unchanged (listing shipper)", () => {
    const t = { ...trip("t1"), client_name: "Ultratech", source: "market_bid" } as TripRow;
    expect(walletTxnPayerName(t, "Party", "Some org")).toBe("Ultratech");
  });

  it("no assigning company known: falls back as before", () => {
    const t = { ...trip("t1"), client_name: "Godrej" } as TripRow;
    expect(walletTxnPayerName(t, "Party", null)).toBe("Godrej");
  });
});

describe("book receipt names follow the trip, not the first saved label", () => {
  it("uses the assigning company when the trip was assigned by one", () => {
    const rows = buildDriverWalletTransactions({
      settlements: [],
      expenses: [],
      tripsById: { t1: trip("t1") },
      tripDisplay: () => "TRP001",
      partyNameForTrip: () => "Godrej",
      assignerNameForTrip: () => "nihas logs",
      includeExpenses: false,
      collections: [
        { id: "indie:1", tripId: "t1", amount: 1500, at: "2026-11-25T10:00:00Z", partyName: "Godrej" },
      ],
    });
    expect(rows[0]?.title).toBe("nihas logs");
  });

  it("keeps the saved label when the trip is not loaded", () => {
    const rows = buildDriverWalletTransactions({
      settlements: [],
      expenses: [],
      tripsById: {},
      tripDisplay: () => "Trip",
      partyNameForTrip: () => "Party",
      includeExpenses: false,
      collections: [
        { id: "indie:2", tripId: "t9", amount: 2000, at: "2026-11-25T10:00:00Z", partyName: "JSW Steels" },
      ],
    });
    expect(rows[0]?.title).toBe("JSW Steels");
  });
});
