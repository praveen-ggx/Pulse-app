import { readFileSync } from "fs";
import { join } from "path";
import { computeInvoiceTax } from "../../services/invoiceTax.service";
import { buildInvoiceDraftModel } from "../../services/invoicePreviewModel.service";
import { evaluateFinanceWorkflowTrip } from "../financeWorkflowState.util";
import { INVOICE_POD_POLICY_UNCONFIGURED } from "../invoicePodEnforcement.util";
import { effectiveInvoicePodPolicyFromClientRaw } from "../invoicePodEnforcement.util";
import {
  invoiceStatusHoldsTrips,
  invoiceStatusIsDraft,
  invoiceStatusIsIssued,
} from "../invoiceLifecycle.util";
import { FINANCE_INVOICE_READ_STEPS } from "../financeReadPathLoad.util";

const ORG = "5b471ecb-fbfb-470e-95cf-525d789c761a";

describe("Finance Pro hardening contracts", () => {
  it("NULL client policy is unconfigured and not invoiceable", () => {
    expect(
      effectiveInvoicePodPolicyFromClientRaw({
        clientPolicyRaw: null,
        workspacePodRequired: true,
      }),
    ).toEqual({ ok: false, error: INVOICE_POD_POLICY_UNCONFIGURED });
    const state = evaluateFinanceWorkflowTrip({
      tripStatus: "completed",
      policy: null,
      physicalPodReceived: true,
      digitalPodPresent: true,
      invoiced: false,
    });
    expect(state.invoiceable).toBe(false);
    expect(state.invoiceState).toBe("blocked_policy");
  });

  it("cancelling a draft releases the trip; issuing does not", () => {
    expect(invoiceStatusHoldsTrips("draft")).toBe(true);
    expect(invoiceStatusHoldsTrips("cancelled")).toBe(false);
    expect(invoiceStatusIsIssued("draft")).toBe(false);
    expect(invoiceStatusIsDraft("sent")).toBe(false);
    const issued = evaluateFinanceWorkflowTrip({
      tripStatus: "completed",
      policy: "none",
      physicalPodReceived: false,
      digitalPodPresent: false,
      invoiced: true,
      inDraft: true,
    });
    expect(issued.invoiceState).toBe("issued");
    expect(issued.invoiceable).toBe(false);
  });

  it("preview GST totals are the only source for issue payload amounts", () => {
    const intra = computeInvoiceTax({
      issuer: {
        org_id: ORG,
        gstin: "33DXCPA3007Q1Z1",
        gst_not_applicable: false,
        state: "Tamil Nadu",
      },
      clients: [
        {
          client_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          gstin: "33AAAAA0000A1Z5",
          state: "Tamil Nadu",
          organization_id: ORG,
        },
      ],
      includeGst: true,
      gstRate: 18,
      tripAmounts: [10000],
      includeFuel: false,
      fuelRate: 0,
      additionalCharges: [],
      invoiceOrgId: ORG,
      tripOrgIds: [ORG],
    });
    const inter = computeInvoiceTax({
      issuer: {
        org_id: ORG,
        gstin: "33DXCPA3007Q1Z1",
        gst_not_applicable: false,
        state: "Tamil Nadu",
      },
      clients: [
        {
          client_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          gstin: "27AAAAA0000A1Z5",
          state: "Maharashtra",
          organization_id: ORG,
        },
      ],
      includeGst: true,
      gstRate: 18,
      tripAmounts: [10000],
      includeFuel: false,
      fuelRate: 0,
      additionalCharges: [],
      invoiceOrgId: ORG,
      tripOrgIds: [ORG],
    });
    expect(intra.supply_type).toBe("intra");
    expect(intra.cgst_amount).toBe(900);
    expect(intra.sgst_amount).toBe(900);
    expect(intra.igst_amount).toBe(0);
    expect(intra.total_amount).toBe(11800);
    expect(inter.supply_type).toBe("inter");
    expect(inter.igst_amount).toBe(1800);
    expect(inter.cgst_amount).toBe(0);
    expect(inter.total_amount).toBe(11800);

    const panel = readFileSync(
      join(__dirname, "../../components/InvoicePreviewPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("subtotal: draft.tax.taxable_base");
    expect(panel).toContain("sgst: draft.tax.sgst_amount");
    expect(panel).toContain("cgst: draft.tax.cgst_amount");
    expect(panel).toContain("igst: draft.tax.igst_amount");
    expect(panel).toContain("totalAmount: draft.tax.total_amount");
    const previewModel = readFileSync(
      join(__dirname, "../../services/invoicePreviewModel.service.ts"),
      "utf8",
    );
    expect(previewModel).toContain("export function mapInvoiceDraftModelToPdfData");
    expect(previewModel).toContain("grandTotal: model.tax.total_amount");
    expect(typeof buildInvoiceDraftModel).toBe("function");
  });

  it("issue RPC revalidates overlap and is idempotent on the same key", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20270922021844_invoice_issue_draft_idempotency.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("issue_idempotency_key");
    expect(sql).toContain("p_draft_id");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("trip_ids && p_trip_ids");
    expect(sql).toContain("p_draft_id IS NULL OR i.id IS DISTINCT FROM p_draft_id");
    expect(sql).toMatch(/RETURN v_number;/);
    const service = readFileSync(
      join(__dirname, "../../services/invoicing.service.ts"),
      "utf8",
    );
    expect(service).toContain("p_idempotency_key");
    expect(service.indexOf("issue_customer_invoice")).toBeLessThan(
      service.lastIndexOf("recordTripWorkflowEvent({"),
    );
  });

  it("bulk invoice read path stays batched, not per trip", () => {
    expect(FINANCE_INVOICE_READ_STEPS.some((step) => step.includes("batched"))).toBe(
      true,
    );
    expect(FINANCE_INVOICE_READ_STEPS.join(" ")).not.toMatch(/per trip/);
    const fetchSrc = readFileSync(
      join(__dirname, "../../services/invoicing.service.ts"),
      "utf8",
    );
    const fetchStart = fetchSrc.indexOf("export async function fetchInvoicingTrips");
    const next = fetchSrc.indexOf("\nexport async function", fetchStart + 10);
    const body = fetchSrc.slice(fetchStart, next);
    expect(body).not.toContain("for (const trip of");
    expect(body).not.toContain("get_trips_for_pod_org");
  });
});
