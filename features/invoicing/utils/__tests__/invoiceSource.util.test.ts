import {
  applySalesOrderNumbers,
  financeInvoiceHistoryFields,
  invoiceSourceLabel,
  invoiceSourceReference,
} from "../invoiceSource.util";

describe("invoiceSource.util", () => {
  it("labels sources", () => {
    expect(invoiceSourceLabel("order")).toBe("Order");
    expect(invoiceSourceLabel("manual")).toBe("Manual");
    expect(invoiceSourceLabel("manual_plan")).toBe("Manual");
    expect(invoiceSourceLabel("trip")).toBe("Trip");
  });

  it("order invoice history uses invoice_source and sales order number", () => {
    const history = financeInvoiceHistoryFields({
      invoice_source: "order",
      sales_order_number: "SO-123",
      trip_ids: ["should-not-infer-trip"],
    });
    expect(history.source).toBe("Order");
    expect(history.reference).toBe("SO-123");
  });

  it("trip invoice history is Trip", () => {
    const history = financeInvoiceHistoryFields({
      invoice_source: "trip",
      sales_order_number: null,
      trip_ids: ["a", "b"],
    });
    expect(history.source).toBe("Trip");
    expect(history.reference).toBe("2 trips");
  });

  it("manual invoice history is Manual", () => {
    const history = financeInvoiceHistoryFields({
      invoice_source: "manual",
    });
    expect(history.source).toBe("Manual");
    expect(history.reference).toBe("Manual Invoice");
  });

  it("legacy trip invoice with no sales_order_id still renders", () => {
    const history = financeInvoiceHistoryFields({
      invoice_source: "trip",
      sales_order_number: null,
      trip_ids: [],
    });
    expect(history.source).toBe("Trip");
    expect(history.reference).toBe("Trip invoice");
  });

  it("order reference uses order number only", () => {
    expect(
      invoiceSourceReference({ source: "order", orderNumber: "ORD-10241" }),
    ).toBe("ORD-10241");
  });

  it("applies batched sales order numbers", () => {
    const rows = applySalesOrderNumbers(
      [
        { sales_order_id: "aaa", sales_order_number: null },
        { sales_order_id: null, sales_order_number: null },
      ],
      { aaa: "SO-2026-00001" },
    );
    expect(rows[0]?.sales_order_number).toBe("SO-2026-00001");
    expect(rows[1]?.sales_order_number).toBeNull();
  });
});
