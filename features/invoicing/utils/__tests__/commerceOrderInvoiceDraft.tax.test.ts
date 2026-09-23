import { buildCommerceOrderInvoiceDraft } from "@/features/invoicing/services/commerceOrderInvoice.service";
import type { CommerceOrderInvoiceBundle } from "@/features/invoicing/services/commerceOrderInvoice.service";
import type { InvoiceIssuerWorkspace } from "@/features/invoicing/services/invoiceIssuerIdentity.service";

const ORG = "5b471ecb-fbfb-470e-95cf-525d789c761a";

function issuer(gstin: string, state: string): InvoiceIssuerWorkspace {
  return {
    id: ORG,
    name: "QA Issuer Pvt Ltd",
    address_line: "Chennai",
    locality: null,
    city: "Chennai",
    state,
    pincode: "600001",
    business_pan: "AAAAA0000A",
    gstin,
    gst_not_applicable: false,
    logo_url: null,
  };
}

function bundle(clientGstin: string, clientState: string): CommerceOrderInvoiceBundle {
  return {
    order: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      order_number: "SO-2026-00001",
      organization_id: ORG,
      customer_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      status: "Fulfilled",
      subtotal: 11000,
      tax_amount: 0,
      total_amount: 11000,
      currency: "INR",
      deleted_at: null,
    },
    customer: {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      display_name: "QA Commerce Client",
      legal_name: "QA Commerce Client",
      gstin: clientGstin,
      pan: null,
      billing_address: "Chennai",
      state: clientState,
      email: null,
    },
    lines: [
      {
        id: "l1",
        quantity: 1,
        unit_price: 10000,
        tax_rate: 18,
        line_total: 10000,
        product: { sku: "SKU-001", hsn_code: "HSN-001", name: "SKU A", description: "SKU A" },
      },
      {
        id: "l2",
        quantity: 2,
        unit_price: 500,
        tax_rate: 18,
        line_total: 1000,
        product: { sku: "SKU-002", hsn_code: "HSN-001", name: "SKU B", description: "SKU B" },
      },
    ],
    invoiceStatus: {
      lifecycle: "NOT_INVOICED",
      action: "create",
      buttonLabel: "Create Invoice",
      reason: null,
      invoiceId: null,
      invoiceNumber: null,
    },
    activeInvoice: null,
  };
}

describe("commerce order invoice tax", () => {
  it("splits intra-state GST into CGST + SGST", () => {
    const model = buildCommerceOrderInvoiceDraft({
      bundle: bundle("33AAAAA0000A1Z5", "Tamil Nadu"),
      issuerWorkspace: issuer("33DXCPA3007Q1Z1", "Tamil Nadu"),
    });
    expect(model.lines).toHaveLength(2);
    expect(model.tax.status).toBe("ok");
    expect(model.tax.taxable_base).toBe(11000);
    expect(model.tax.cgst_amount).toBeGreaterThan(0);
    expect(model.tax.sgst_amount).toBeGreaterThan(0);
    expect(model.tax.igst_amount).toBe(0);
    expect(model.tax.total_amount).toBe(
      model.tax.taxable_base + model.tax.cgst_amount + model.tax.sgst_amount,
    );
  });

  it("uses IGST for inter-state supply", () => {
    const model = buildCommerceOrderInvoiceDraft({
      bundle: bundle("29AAAAA0000A1Z5", "Karnataka"),
      issuerWorkspace: issuer("33DXCPA3007Q1Z1", "Tamil Nadu"),
    });
    expect(model.tax.status).toBe("ok");
    expect(model.tax.igst_amount).toBeGreaterThan(0);
    expect(model.tax.cgst_amount).toBe(0);
    expect(model.tax.sgst_amount).toBe(0);
  });
});
