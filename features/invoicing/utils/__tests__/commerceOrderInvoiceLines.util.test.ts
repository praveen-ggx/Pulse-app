import { buildCommerceOrderInvoiceLines } from "../commerceOrderInvoiceLines.util";

describe("buildCommerceOrderInvoiceLines", () => {
  it("maps order items to one invoice with SKU and HSN per line", () => {
    const lines = buildCommerceOrderInvoiceLines([
      {
        id: "l1",
        quantity: 1,
        unit_price: 10000,
        tax_rate: 18,
        line_total: 10000,
        product: {
          name: "Service Plan",
          sku: "PLAN-A",
          hsn_code: "9983",
          description: "Service Plan",
        },
      },
      {
        id: "l2",
        quantity: 2,
        unit_price: 500,
        tax_rate: 18,
        line_total: 1000,
        product: {
          name: "Add-on",
          sku: "ADD-01",
          hsn_code: "9983",
        },
      },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].sku).toBe("PLAN-A");
    expect(lines[0].hsn_sac).toBe("9983");
    expect(lines[0].taxable_value).toBe(10000);
    expect(lines[1].qty).toBe(2);
    expect(lines[1].taxable_value).toBe(1000);
    expect(lines.every((l) => l.trip_id === null)).toBe(true);
  });
});
