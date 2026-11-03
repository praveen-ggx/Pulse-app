import { listWorkspaceNotes, openNoteDeltaByTrip } from "../workspaceFinance.util";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";

const trip = { id: "show", internal_id: "trip-1", lr_number: "1600", issuedInvoiceNumber: "INV-1" } as InvoicingTripView;

function note(overrides: Partial<TripAdjustment>): TripAdjustment {
  return {
    id: "n1",
    trip_id: "trip-1",
    type: "revenue",
    impact: "minus",
    amount: 500,
    reason: "Damages / Missing",
    created_at: "2026-11-01",
    ...overrides,
  };
}

describe("workspace finance notes", () => {
  it("lists a customer credit on the trip and its invoice", () => {
    const rows = listWorkspaceNotes([note({})], [trip]);
    expect(rows[0]).toMatchObject({ kind: "credit", side: "customer", tripLabel: "1600", invoiceNumber: "INV-1", amount: 500 });
  });

  it("does not reduce receivables for a note already on an issued trip", () => {
    const rows = listWorkspaceNotes([note({}), note({ id: "n2", trip_id: "open", impact: "minus", amount: 200 })], [trip]);
    const deltas = openNoteDeltaByTrip(rows, new Set(["trip-1"]));
    expect(deltas.get("trip-1")).toBeUndefined();
    expect(deltas.get("open")).toBe(-200);
  });
});
