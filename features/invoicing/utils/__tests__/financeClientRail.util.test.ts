import {
  buildFinanceClientRailRows,
  financeInvoiceWorkspacePill,
} from "../financeClientRail.util";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";

function trip(
  partial: Partial<InvoicingTripView> & { id: string; client_id: string },
): InvoicingTripView {
  return {
    internal_id: partial.id,
    organization_id: "org",
    client: "Nvidia a",
    supplier_name: "Fleet",
    route: "A → B",
    date: "2026-09-13",
    amount: 50000,
    status: "pending",
    details: "",
    checks: { poMatch: false, idConfirmed: false, podReceived: false },
    physicalPodReceived: false,
    digitalPodPresent: false,
    tripStatus: "completed",
    invoiced: false,
    issuedInvoiceNumber: null,
    inDraft: false,
    draftInvoiceNumber: null,
    ...partial,
  };
}

describe("financeClientRail.util", () => {
  it("builds client rows from summarizeFinanceClientPicture", () => {
    const clientId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const rows = buildFinanceClientRailRows({
      trips: [
        trip({
          id: "t1",
          client_id: clientId,
          invoiced: true,
          amount: 80000,
        }),
        trip({
          id: "t2",
          client_id: clientId,
          invoiced: true,
          amount: 76750,
        }),
        trip({
          id: "t3",
          client_id: clientId,
          tripStatus: "in_transit",
          amount: 40000,
        }),
      ],
      clientSearch: "",
      clientPolicies: { [clientId]: "hard_copy" },
      invoices: [
        {
          id: "inv-1",
          client_id: clientId,
          client_name: "Nvidia a",
          trip_ids: ["t1", "t2"],
          total_amount: 156750,
          status: "sent",
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.clientId).toBe(clientId);
    expect(rows[0]?.picture.listedTripCount).toBe(3);
    expect(rows[0]?.picture.invoicedTripCount).toBe(2);
    expect(rows[0]?.picture.eligibleTripCount).toBe(0);
    expect(rows[0]?.picture.unbilledTripCount).toBe(1);
    expect(rows[0]?.issuedInvoiceValue).toBe(156750);
    expect(rows[0]?.picture.createInvoiceEnabled).toBe(false);
    expect(rows[0]?.podRequiredLabel).toBe("POD Required · ON");
  });

  it("labels NULL policy as unconfigured, not OFF", () => {
    const clientId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const rows = buildFinanceClientRailRows({
      trips: [trip({ id: "t1", client_id: clientId })],
      clientSearch: "",
      clientPolicies: { [clientId]: null },
      invoices: [],
    });
    expect(rows[0]?.podRequiredLabel).toBe("POD policy not configured");
    expect(rows[0]?.picture.createInvoiceEnabled).toBe(false);
  });

  it("maps invoice states to compact pills", () => {
    expect(financeInvoiceWorkspacePill("eligible")).toBe("Eligible");
    expect(financeInvoiceWorkspacePill("blocked_pod")).toBe("POD pending");
    expect(financeInvoiceWorkspacePill("not_completed")).toBe("Not completed");
    expect(financeInvoiceWorkspacePill("issued")).toBe("Invoiced");
    expect(financeInvoiceWorkspacePill("draft")).toBe("Draft");
  });
});
