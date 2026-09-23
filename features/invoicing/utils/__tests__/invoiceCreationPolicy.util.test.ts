import { invoiceStatusIsIssued } from "@/features/invoicing/utils/invoiceLifecycle.util";
import { resolveClientPlanInvoiceAvailability } from "@/features/invoicing/utils/clientPlanInvoice.util";
import {
  invoiceSourceLabel,
  invoiceSourceReference,
  isFinanceProTripInvoiceCreationEnabled,
  isLegacyTripBulkInvoiceCreationEnabled,
} from "@/features/invoicing/utils/invoiceCreationPolicy.util";

describe("invoice creation policy", () => {
  it("keeps Finance Pro trip multi-select create retired", () => {
    expect(isFinanceProTripInvoiceCreationEnabled()).toBe(false);
    expect(isLegacyTripBulkInvoiceCreationEnabled()).toBe(false);
  });

  it("labels order and manual sources for Finance history", () => {
    expect(invoiceSourceLabel("order")).toBe("Order");
    expect(invoiceSourceLabel("manual")).toBe("Manual");
    expect(
      invoiceSourceReference({
        source: "order",
        orderNumber: "SO-2026-00001",
      }),
    ).toBe("SO-2026-00001");
  });

  it("keeps trip invoices renderable", () => {
    expect(invoiceStatusIsIssued("sent")).toBe(true);
    expect(
      invoiceSourceReference({ source: "trip", tripCount: 2 }),
    ).toBe("2 trips");
  });

  it("keeps Manual / Client Plan invoice blocked", () => {
    const block = resolveClientPlanInvoiceAvailability();
    expect(block.available).toBe(false);
    expect(block.reason).toMatch(/Client Plan|not configured/i);
    expect(block.reason).not.toMatch(/client_contracts/i);
  });
});
