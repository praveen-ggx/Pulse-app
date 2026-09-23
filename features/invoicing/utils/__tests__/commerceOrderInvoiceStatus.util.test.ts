import {
  resolveCommerceOrderInvoiceStatus,
  isCommerceOrderBillableStatus,
  isSalesOrderInvoiceable,
} from "../commerceOrderInvoiceStatus.util";

describe("commerceOrderInvoiceStatus — Fulfilled only", () => {
  it("offers Create Invoice only for Fulfilled orders", () => {
    expect(isCommerceOrderBillableStatus("Fulfilled")).toBe(true);
    expect(isCommerceOrderBillableStatus("Draft")).toBe(false);
    expect(isCommerceOrderBillableStatus("Pending Consolidation")).toBe(false);
    expect(isCommerceOrderBillableStatus("Planned")).toBe(false);
    expect(isCommerceOrderBillableStatus("Cancelled")).toBe(false);
    expect(isSalesOrderInvoiceable({ status: "Fulfilled" })).toBe(true);
    expect(isSalesOrderInvoiceable({ status: "Planned" })).toBe(false);
    expect(
      isSalesOrderInvoiceable({ status: "Fulfilled", deleted_at: "2026-01-01" }),
    ).toBe(false);

    const status = resolveCommerceOrderInvoiceStatus({
      orderStatus: "Fulfilled",
      activeInvoice: null,
    });
    expect(status.action).toBe("create");
    expect(status.buttonLabel).toBe("Create Invoice");
  });

  it("blocks cancelled, draft, planned, and consolidating orders", () => {
    expect(
      resolveCommerceOrderInvoiceStatus({ orderStatus: "Cancelled" }).action,
    ).toBe("unavailable");
    expect(
      resolveCommerceOrderInvoiceStatus({ orderStatus: "Draft" }).action,
    ).toBe("unavailable");
    expect(
      resolveCommerceOrderInvoiceStatus({ orderStatus: "Planned" }).action,
    ).toBe("unavailable");
    expect(
      resolveCommerceOrderInvoiceStatus({
        orderStatus: "Pending Consolidation",
      }).action,
    ).toBe("unavailable");
  });

  it("returns View Invoice when issued", () => {
    const status = resolveCommerceOrderInvoiceStatus({
      orderStatus: "Fulfilled",
      activeInvoice: {
        id: "inv-1",
        status: "sent",
        invoice_number: "INV/2026/00123",
      },
    });
    expect(status.action).toBe("view_invoice");
    expect(status.invoiceNumber).toBe("INV/2026/00123");
  });

  it("returns Open Draft for leftover drafts without treating the order as invoiceable", () => {
    const status = resolveCommerceOrderInvoiceStatus({
      orderStatus: "Planned",
      activeInvoice: { id: "d1", status: "draft", invoice_number: "DRAFT-1" },
    });
    expect(status.action).toBe("view_draft");
    expect(status.buttonLabel).toBe("Open Draft");
    expect(isSalesOrderInvoiceable({ status: "Planned" })).toBe(false);
    expect(isCommerceOrderBillableStatus("Planned")).toBe(false);
  });
});
