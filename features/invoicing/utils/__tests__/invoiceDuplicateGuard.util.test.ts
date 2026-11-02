import {
  alreadyInvoicedGuidance,
  planDraftSave,
} from "../invoiceDuplicateGuard.util";

const DRAFT = {
  id: "draft-1",
  invoiceNumber: "DRAFT/1",
  tripIds: ["trip-a", "trip-b"],
};

describe("planDraftSave", () => {
  it("inserts when the trips are not on a draft", () => {
    expect(
      planDraftSave({ tripIds: ["trip-c"], drafts: [DRAFT], activeDraftId: null }),
    ).toEqual({ action: "insert" });
  });

  it("updates the existing draft instead of creating another", () => {
    expect(
      planDraftSave({
        tripIds: ["trip-a", "trip-b"],
        drafts: [DRAFT],
        activeDraftId: null,
      }),
    ).toEqual({ action: "update", draftId: "draft-1", invoiceNumber: "DRAFT/1" });
  });

  it("blocks when the trips are split across drafts", () => {
    const plan = planDraftSave({
      tripIds: ["trip-a", "trip-c"],
      drafts: [DRAFT, { id: "draft-2", invoiceNumber: "DRAFT/2", tripIds: ["trip-c"] }],
      activeDraftId: null,
    });
    expect(plan.action).toBe("blocked");
    if (plan.action === "blocked") {
      expect(plan.message).toContain("DRAFT/1");
      expect(plan.message).toContain("DRAFT/2");
    }
  });
});

describe("alreadyInvoicedGuidance", () => {
  it("asks to cancel a single-trip invoice", () => {
    const message = alreadyInvoicedGuidance({
      tripIds: ["trip-a"],
      invoices: [{ id: "inv-1", invoiceNumber: "INV-9", tripIds: ["trip-a"] }],
      labelForTrip: () => "LR AI1025",
    });
    expect(message).toContain("Remove LR AI1025");
    expect(message).toContain("Cancel invoice INV-9");
  });

  it("asks to remove the trip from a bulk invoice", () => {
    const message = alreadyInvoicedGuidance({
      tripIds: ["trip-a"],
      invoices: [
        { id: "inv-1", invoiceNumber: "INV-9", tripIds: ["trip-a", "trip-b"] },
      ],
      labelForTrip: () => "LR AI1025",
    });
    expect(message).toContain("bulk invoice");
    expect(message).toContain("Remove LR AI1025 from invoice INV-9");
  });
});
