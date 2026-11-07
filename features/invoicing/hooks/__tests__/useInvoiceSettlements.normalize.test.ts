import { normalizeSettlementsPayload } from "@/features/invoicing/hooks/useInvoiceSettlements";

describe("normalizeSettlementsPayload", () => {
  it("reads byId records", () => {
    const row = { received: 10, credited: 1, outstanding: 9, status: "partial" };
    expect(
      normalizeSettlementsPayload({ byId: { inv1: row }, error: null, unavailable: false })
        .byId.inv1,
    ).toEqual(row);
  });

  it("does not crash on a JSON-rehydrated legacy map object", () => {
    const row = { received: 5, credited: 0, outstanding: 5, status: "open" };
    const normalized = normalizeSettlementsPayload({
      map: { inv2: row },
      error: null,
      unavailable: false,
    });
    expect(normalized.byId.inv2).toEqual(row);
    expect(typeof (normalized as { map?: unknown }).map).toBe("undefined");
  });

  it("accepts a live Map", () => {
    const row = { received: 2, credited: 0, outstanding: 2, status: "open" };
    const map = new Map([["inv3", row]]);
    expect(normalizeSettlementsPayload({ map }).byId.inv3).toEqual(row);
  });
});
