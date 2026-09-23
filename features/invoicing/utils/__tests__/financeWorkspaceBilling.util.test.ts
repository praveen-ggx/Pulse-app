import { evaluateFinanceWorkflowTrip } from "../financeWorkflowState.util";
import { summarizeInvoiceWorkspaceSelection } from "../financeInvoicePodAction.util";
import { financeInvoiceHistoryFields } from "../invoiceSource.util";
import { buildManualInvoiceLines, emptyManualInvoiceLine } from "../manualInvoice.util";
import { buildInvoiceDraftModelFromManualLines } from "../../services/invoicePreviewModel.service";

function tripState(partial: {
  invoiceable?: boolean;
  invoiceState?:
    | "eligible"
    | "issued"
    | "draft"
    | "blocked_pod"
    | "blocked_policy"
    | "not_completed";
}) {
  return evaluateFinanceWorkflowTrip({
    tripStatus: partial.invoiceState === "not_completed" ? "in_transit" : "completed",
    policy: "none",
    physicalPodReceived: partial.invoiceState !== "blocked_pod",
    digitalPodPresent: true,
    invoiced: partial.invoiceState === "issued",
    inDraft: partial.invoiceState === "draft",
  });
}

describe("finance workspace billing", () => {
  it("lets one eligible trip create an invoice", () => {
    const a = tripState({ invoiceState: "eligible" });
    expect(a.invoiceable).toBe(true);
    const summary = summarizeInvoiceWorkspaceSelection([
      { selected: true, state: a, policy: "none", physicalPodReceived: true },
    ]);
    expect(summary.invoiceableCount).toBe(1);
  });

  it("lets multiple eligible trips create one invoice", () => {
    const a = tripState({ invoiceState: "eligible" });
    const b = tripState({ invoiceState: "eligible" });
    const summary = summarizeInvoiceWorkspaceSelection([
      { selected: true, state: a, policy: "none", physicalPodReceived: true },
      { selected: true, state: b, policy: "none", physicalPodReceived: true },
    ]);
    expect(summary.invoiceableCount).toBe(2);
  });

  it("blocks POD pending and invoiced trips", () => {
    const pending = evaluateFinanceWorkflowTrip({
      tripStatus: "completed",
      policy: "hard_copy",
      physicalPodReceived: false,
      digitalPodPresent: false,
      invoiced: false,
      inDraft: false,
    });
    const issued = tripState({ invoiceState: "issued" });
    expect(pending.invoiceable).toBe(false);
    expect(pending.invoiceState).toBe("blocked_pod");
    expect(issued.invoiceable).toBe(false);
    expect(issued.invoiceState).toBe("issued");
  });

  it("labels history sources Order / Trip / Manual", () => {
    expect(
      financeInvoiceHistoryFields({
        invoice_source: "order",
        sales_order_number: "SO-12345",
      }),
    ).toEqual({ source: "Order", reference: "SO-12345" });
    expect(
      financeInvoiceHistoryFields({
        invoice_source: "trip",
        trip_ids: ["a", "b"],
      }),
    ).toEqual({ source: "Trip", reference: "2 trips" });
    expect(
      financeInvoiceHistoryFields({ invoice_source: "manual" }),
    ).toEqual({ source: "Manual", reference: "Manual Invoice" });
  });

  it("builds a manual invoice draft with shared tax engine", () => {
    const lines = buildManualInvoiceLines([
      {
        ...emptyManualInvoiceLine("1"),
        sku: "MAN-001",
        hsnSac: "9983",
        description: "Consulting Service",
        qty: "1",
        rate: "25000",
      },
      {
        ...emptyManualInvoiceLine("2"),
        sku: "MAN-002",
        hsnSac: "9983",
        description: "Support",
        qty: "2",
        rate: "5000",
      },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.taxable_value).toBe(25000);
    expect(lines[1]?.taxable_value).toBe(10000);
    const draft = buildInvoiceDraftModelFromManualLines({
      issuer: {
        orgId: "org",
        businessName: "Issuer",
        addressLines: [],
        city: null,
        state: "KA",
        pincode: null,
        pan: null,
        gstin: "29AAAAA0000A1Z5",
        gstNotApplicable: false,
        logoUrl: null,
      },
      client: {
        client_id: "client",
        legal_name: "Nvidia a",
        display_name: "Nvidia a",
        gstin: "29BBBBB0000B1Z5",
        pan: null,
        billing_address: null,
        state: "KA",
        email: null,
      },
      lines,
      previewDate: "2026-09-22",
      paymentTerms: "Net 30",
      notes: null,
      includeGst: true,
      gstRate: 18,
    });
    expect(draft.document_kind).toBe("draft");
    expect(draft.invoice_number_label).toBe("DRAFT");
    expect(draft.tax.taxable_base).toBe(35000);
    expect(draft.tax.cgst_amount + draft.tax.sgst_amount + draft.tax.igst_amount).toBeGreaterThan(0);
  });
});
