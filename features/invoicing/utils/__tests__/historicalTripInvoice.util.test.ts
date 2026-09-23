import { invoiceSourceLabel, invoiceSourceReference } from "../invoiceSource.util";

describe("historical trip invoices", () => {
  it("still render as Trip source with trip_ids count", () => {
    const row = {
      invoice_source: "trip",
      trip_ids: ["a", "b"],
      invoice_number: "INV/2025/00001",
    };
    expect(invoiceSourceLabel(row.invoice_source)).toBe("Trip");
    expect(
      invoiceSourceReference({
        source: row.invoice_source,
        tripCount: row.trip_ids.length,
      }),
    ).toBe("2 trips");
  });
});
