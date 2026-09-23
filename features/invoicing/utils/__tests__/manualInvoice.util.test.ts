import { buildManualInvoiceLines, emptyManualInvoiceLine } from "../manualInvoice.util";

describe("manualInvoice.util", () => {
  it("builds taxable lines from operator-entered details", () => {
    const lines = buildManualInvoiceLines([
      {
        ...emptyManualInvoiceLine("a"),
        description: "Detention",
        sku: "DET-1",
        hsnSac: "996511",
        qty: "2",
        rate: "1500",
        discount: "0",
        taxRate: "18",
      },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.description).toBe("Detention");
    expect(lines[0]?.trip_ref).toBe("DET-1");
    expect(lines[0]?.hsn_sac).toBe("996511");
    expect(lines[0]?.taxable_value).toBe(3000);
  });

  it("drops incomplete qty/rate rows", () => {
    expect(
      buildManualInvoiceLines([
        { ...emptyManualInvoiceLine("b"), description: "Skip", qty: "", rate: "10" },
      ]),
    ).toEqual([]);
  });
});
