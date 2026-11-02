import { applyDcoPartyTagToNotes } from "../dcoTripPartyTag.util";
import {
  MARKETPLACE_PARTY_ID,
  UNTAGGED_PARTY_ID,
  buildDriverPartyReceivables,
  buildDriverPartyReceivablesFromBook,
  isTripTaggedToParty,
  tripNeedsPartyTag,
  partyAvatarLookup,
  summarizeDriverPartyReceivables,
  tripReceivableBilled,
  tripReceivablePartyName,
  tripsForDriverParty,
} from "../driverPartyReceivables.util";
import type { TripRow } from "@/features/trips/services/trips.service";

function trip(partial: Partial<TripRow> & { id: string }): TripRow {
  return {
    organization_id: "org-1",
    trip_number: "TRP001",
    indent_id: null,
    source: "manual",
    pickup_area: "A",
    drop_location: "B",
    distance: null,
    estimated_duration: null,
    client_id: null,
    client_name: "",
    supplier_id: null,
    driver_id: "drv-1",
    vehicle_id: null,
    client_price: 0,
    supplier_rate: 0,
    status: "completed",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...partial,
  } as TripRow;
}

describe("tripReceivableBilled", () => {
  it("does not use driver-agreed earnings (supplier_rate) for DCO Self billed amount", () => {
    expect(
      tripReceivableBilled(
        trip({
          id: "t1",
          operating_mode: "DCO",
          supplier_rate: 12000,
          client_price: 40000,
        }),
        null,
      ),
    ).toBeNull();
  });

  it("does not use trips.client_price for DCO Self billed amount", () => {
    expect(
      tripReceivableBilled(
        trip({
          id: "t2",
          operating_mode: "DCO",
          supplier_rate: 0,
          client_price: 8500,
        }),
        null,
      ),
    ).toBeNull();
  });

  it("does not treat dco_party_billed alone as an issued receivable", () => {
    expect(
      tripReceivableBilled(
        trip({
          id: "t-col",
          operating_mode: "DCO",
          supplier_rate: 12000,
          client_price: 40000,
          dco_party_billed: 18500,
        }),
        null,
      ),
    ).toBeNull();
  });

  it("does not populate billed from notes JSON", () => {
    expect(
      tripReceivableBilled(
        trip({
          id: "t3",
          operating_mode: "DCO",
          supplier_rate: 12000,
          client_price: 40000,
          notes: applyDcoPartyTagToNotes(null, {
            id: "c-2",
            name: "Ajio testing",
            billed: 18500,
          }),
        }),
        null,
      ),
    ).toBeNull();
  });

  it("uses an authoritative receivable over trip column and notes", () => {
    expect(
      tripReceivableBilled(
        trip({
          id: "t4",
          operating_mode: "DCO",
          dco_party_billed: 1000,
          client_price: 40000,
          notes: applyDcoPartyTagToNotes(null, {
            id: "c-2",
            name: "Ajio testing",
            billed: 99999,
          }),
        }),
        { billed_amount: 18500 },
      ),
    ).toBe(18500);
  });

  it("keeps zero and missing distinguishable on the receivable", () => {
    expect(
      tripReceivableBilled(
        trip({ id: "z", operating_mode: "DCO", dco_party_billed: 999 }),
        { billed_amount: 0 },
      ),
    ).toBe(0);
    expect(
      tripReceivableBilled(
        trip({ id: "m", operating_mode: "DCO", dco_party_billed: 999 }),
        null,
      ),
    ).toBeNull();
  });

  it("still allows marketplace listing economics (Exchange, not DCO Self book)", () => {
    expect(
      tripReceivableBilled(
        trip({
          id: "m1",
          source: "market_bid",
          operating_mode: "DCO",
          supplier_rate: 5000,
          client_price: 9000,
        }),
      ),
    ).toBe(5000);
  });

  it("does not invent Independent DRIVER AR from earnings without an issued receivable", () => {
    expect(
      tripReceivableBilled(
        trip({
          id: "indie-1",
          source: "manual",
          operating_mode: "DRIVER",
          supplier_rate: 4500,
          client_price: 8000,
          dco_party_billed: 9999,
        }),
        null,
      ),
    ).toBeNull();
  });

  it("uses an Independent DRIVER issued receivable (not DCO-only path)", () => {
    expect(
      tripReceivableBilled(
        trip({
          id: "indie-2",
          source: "manual",
          operating_mode: "DRIVER",
          supplier_rate: 4500,
        }),
        { billed_amount: 4500 },
      ),
    ).toBe(4500);
  });

  it("does not invent fleet-employee offline AR from earnings or DCO mirrors", () => {
    expect(
      tripReceivableBilled(
        trip({
          id: "fleet-off-1",
          source: "indent",
          operating_mode: "FLEET",
          supplier_rate: 3200,
          client_price: 7000,
          dco_party_billed: 3200,
        }),
        null,
      ),
    ).toBeNull();
  });
});

describe("buildDriverPartyReceivables", () => {
  it("rolls marketplace awards into one party and shippers by client", () => {
    const rows = buildDriverPartyReceivables(
      [
        trip({
          id: "m1",
          source: "market_bid",
          operating_mode: "DCO",
          supplier_rate: 5000,
        }),
        trip({
          id: "m2",
          source: "market_bid",
          operating_mode: "DCO",
          supplier_rate: 3000,
        }),
        trip({
          id: "s1",
          source: "manual",
          operating_mode: "DCO",
          client_id: "c-1",
          client_name: "Mohana Logistics",
          client_price: 10000,
          dco_party_billed: 10000,
        }),
        trip({
          id: "s2",
          source: "manual",
          operating_mode: "DCO",
          client_id: "c-1",
          client_name: "Mohana Logistics",
          client_price: 2000,
          dco_party_billed: 2000,
        }),
        trip({
          id: "fleet-1",
          source: "indent",
          operating_mode: "FLEET",
          client_price: 99999,
        }),
      ],
      { m1: 2000, s1: 4000 },
      (t) => String(t.id) === "fleet-1",
    );

    expect(rows.map((r) => r.id)).toEqual([MARKETPLACE_PARTY_ID, "shipper:c-1"]);
    expect(rows[0]).toMatchObject({
      kind: "marketplace",
      name: "Marketplace",
      trips: 2,
      billed: 8000,
      received: 2000,
      due: 6000,
      billedComplete: true,
    });
    // Trip-list path has no issued receivable → billed unavailable (not client_price / mirror).
    expect(rows[1]).toMatchObject({
      kind: "shipper",
      name: "Mohana Logistics",
      trips: 2,
      billed: 0,
      received: 4000,
      unavailableBilledTrips: 2,
      billedComplete: false,
      due: null,
    });
  });

  it("summarizes outstanding and collection like the Clients scorecard", () => {
    const summary = summarizeDriverPartyReceivables([
      {
        id: MARKETPLACE_PARTY_ID,
        kind: "marketplace",
        name: "Marketplace",
        subtitle: "",
        trips: 1,
        billed: 100,
        received: 40,
        due: 60,
        unavailableBilledTrips: 0,
        billedComplete: true,
      },
      {
        id: "shipper:c-1",
        kind: "shipper",
        name: "Shipper",
        subtitle: "",
        trips: 1,
        billed: 100,
        received: 60,
        due: 40,
        unavailableBilledTrips: 0,
        billedComplete: true,
      },
    ]);
    expect(summary).toEqual({
      billed: 200,
      received: 100,
      due: 100,
      collectionPercent: 50,
      billedComplete: true,
      unavailableBilledTrips: 0,
    });
  });

  it("marks incomplete party totals without inventing outstanding", () => {
    const summary = summarizeDriverPartyReceivables([
      {
        id: "shipper:c-1",
        kind: "shipper",
        name: "Shipper",
        subtitle: "",
        trips: 2,
        billed: 50000,
        received: 10000,
        due: null,
        unavailableBilledTrips: 3,
        billedComplete: false,
      },
    ]);
    expect(summary.billedComplete).toBe(false);
    expect(summary.due).toBeNull();
    expect(summary.collectionPercent).toBeNull();
    expect(summary.unavailableBilledTrips).toBe(3);
  });
});

describe("tripsForDriverParty", () => {
  const fleet = () => false;
  const trips = [
    trip({
      id: "m1",
      source: "market_bid",
      operating_mode: "DCO",
      supplier_rate: 5000,
      pickup_area: "Chennai",
      drop_location: "Madurai",
    }),
    trip({
      id: "s1",
      source: "manual",
      operating_mode: "DCO",
      client_id: "c-1",
      client_name: "Mohana Logistics",
      client_price: 10000,
      dco_party_billed: 10000,
    }),
  ];

  it("lists marketplace trips for the Marketplace party", () => {
    const lines = tripsForDriverParty(trips, { m1: 1000 }, fleet, MARKETPLACE_PARTY_ID);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.trip.id).toBe("m1");
    expect(lines[0]?.due).toBe(4000);
    expect(lines[0]?.billedAvailable).toBe(true);
  });

  it("lists only that shipper's trips without fabricating billed", () => {
    const lines = tripsForDriverParty(trips, { s1: 2500 }, fleet, "shipper:c-1");
    expect(lines.map((l) => l.trip.id)).toEqual(["s1"]);
    expect(lines[0]?.received).toBe(2500);
    expect(lines[0]?.billed).toBeNull();
    expect(lines[0]?.billedAvailable).toBe(false);
    expect(lines[0]?.due).toBe(0);
  });
});

describe("tripReceivablePartyName", () => {
  it("uses client name for shipper trips", () => {
    expect(
      tripReceivablePartyName(
        trip({ id: "s1", client_id: "c-1", client_name: "Godrej India" }),
      ),
    ).toBe("Godrej India");
  });

  it("treats a notes party marker as tagged when client_id is blocked", () => {
    const tagged = trip({
      id: "n1",
      notes: applyDcoPartyTagToNotes(null, { id: "c-ajio", name: "Ajio testing" }),
    });
    expect(isTripTaggedToParty(tagged)).toBe(true);
    expect(tripReceivablePartyName(tagged)).toBe("Ajio testing");
  });

  it("does not treat assigned-by / org name as a tagged party", () => {
    const untagged = trip({
      id: "u1",
      organization_id: "org-godrej",
      organization_name: "Godrej India",
      client_name: "Godrej India",
    });
    expect(isTripTaggedToParty(untagged)).toBe(false);
    expect(tripReceivablePartyName(untagged)).toBe("Untagged");
  });

  it("uses the listing shipper on marketplace trips — never Untagged", () => {
    const market = trip({
      id: "m1",
      source: "market_bid",
      operating_mode: "DCO",
      organization_name: "Pulse Shipper Co",
      client_name: "",
    });
    expect(tripReceivablePartyName(market)).toBe("Pulse Shipper Co");
    expect(tripNeedsPartyTag(market)).toBe(false);
  });
});

describe("tripNeedsPartyTag", () => {
  it("is only true for untagged offline trips", () => {
    expect(
      tripNeedsPartyTag(
        trip({ id: "off", source: "manual", operating_mode: "DCO" }),
      ),
    ).toBe(true);
    expect(
      tripNeedsPartyTag(
        trip({
          id: "m",
          source: "market_bid",
          operating_mode: "DCO",
          client_id: null,
        }),
      ),
    ).toBe(false);
    expect(
      tripNeedsPartyTag(
        trip({
          id: "fleet",
          source: "indent",
          operating_mode: "FLEET",
        }),
        true,
      ),
    ).toBe(false);
  });
});

describe("untagged offline AR", () => {
  it("rolls untagged trips into Untagged, not the assigner name", () => {
    const rows = buildDriverPartyReceivables(
      [
        trip({
          id: "u1",
          source: "manual",
          operating_mode: "DCO",
          organization_name: "Godrej India",
          client_name: "Godrej India",
          client_price: 25000,
        }),
        trip({
          id: "s1",
          source: "manual",
          operating_mode: "DCO",
          client_id: "c-mid",
          client_name: "Middleman Co",
          client_price: 10000,
          dco_party_billed: 10000,
        }),
      ],
      {},
      () => false,
    );
    expect(rows.map((r) => r.id)).toEqual([UNTAGGED_PARTY_ID, "shipper:c-mid"]);
    // No issued receivable on trip-list path — mirrors / client_price must not invent AR.
    expect(rows[0]).toMatchObject({
      name: "Untagged",
      subtitle: "Tag a shipper or middleman",
      trips: 1,
      billed: 0,
      due: null,
      unavailableBilledTrips: 1,
      billedComplete: false,
    });
    expect(rows[1]).toMatchObject({
      name: "Middleman Co",
      trips: 1,
      billed: 0,
      due: null,
      unavailableBilledTrips: 1,
      billedComplete: false,
    });
  });
});

describe("partyAvatarLookup", () => {
  const clientId = "aaaaaaaa-1111-4111-8111-bbbbbbbbbbbb";
  const orgId = "cccccccc-2222-4222-8222-dddddddddddd";

  it("returns no ids for Marketplace", () => {
    expect(partyAvatarLookup(MARKETPLACE_PARTY_ID, [])).toEqual({
      clientId: null,
      orgId: null,
    });
  });

  it("reads client uuid from the shipper party id", () => {
    expect(
      partyAvatarLookup(`shipper:${clientId}`, [
        trip({ id: "s1", client_id: clientId, organization_id: orgId }),
      ]),
    ).toEqual({ clientId, orgId });
  });

  it("reads org uuid from shipper:org parties", () => {
    expect(
      partyAvatarLookup(`shipper:org:${orgId}`, [
        trip({ id: "s1", organization_id: orgId }),
      ]),
    ).toEqual({ clientId: null, orgId });
  });
});

describe("buildDriverPartyReceivablesFromBook", () => {
  it("rolls issued receivables by Party B and ignores drafts", () => {
    const built = buildDriverPartyReceivablesFromBook(
      [
        {
          receivable: {
            id: "r1",
            workspace_id: "ws",
            party_b_id: "p1",
            billed_amount: 55000,
            billed_version: 1,
            status: "issued",
            operational_trip_id: "t1",
            party_a_label: null,
            issued_at: "2026-11-01",
          },
          collected: 20000,
          outstanding: 35000,
        },
        {
          receivable: {
            id: "r2",
            workspace_id: "ws",
            party_b_id: "p1",
            billed_amount: 1000,
            billed_version: 1,
            status: "draft",
            operational_trip_id: null,
            party_a_label: null,
            issued_at: null,
          },
          collected: 0,
          outstanding: 1000,
        },
      ],
      [{ id: "p1", name: "Ajio" }],
    );
    expect(built).toEqual([
      expect.objectContaining({
        id: "p1",
        name: "Ajio",
        billed: 55000,
        received: 20000,
        due: 35000,
        trips: 1,
        billedComplete: true,
        unavailableBilledTrips: 0,
      }),
    ]);
  });
});
