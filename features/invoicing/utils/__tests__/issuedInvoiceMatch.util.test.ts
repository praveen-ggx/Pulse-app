import { issuedInvoicesForClient } from "../issuedInvoiceMatch.util";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";

function row(
  partial: Partial<IssuedInvoiceListRow> & Pick<IssuedInvoiceListRow, "id">,
): IssuedInvoiceListRow {
  return {
    invoice_number: "INV/1",
    invoice_date: "2026-09-11",
    due_date: null,
    client_id: null,
    client_name: null,
    total_amount: 0,
    status: "sent",
    trip_ids: [],
    ...partial,
  };
}

describe("issuedInvoicesForClient", () => {
  const invoices = [
    row({
      id: "a",
      client_id: "client-1",
      client_name: "Nvidia a",
      total_amount: 156750,
      trip_ids: ["t1", "t2"],
    }),
    row({
      id: "b",
      client_id: "client-2",
      client_name: "Apple",
      total_amount: 10,
    }),
  ];

  it("matches by client_id even when listed trip count differs from invoice trip_ids", () => {
    expect(
      issuedInvoicesForClient(invoices, {
        clientId: "client-1",
        clientName: "Nvidia a",
      }),
    ).toEqual([invoices[0]]);
  });

  it("never mixes two clients that share the same display name", () => {
    const twins = [
      row({
        id: "n1",
        client_id: "nvidia-a",
        client_name: "Nvidia",
        total_amount: 100,
      }),
      row({
        id: "n2",
        client_id: "nvidia-b",
        client_name: "Nvidia",
        total_amount: 200,
      }),
    ];
    expect(
      issuedInvoicesForClient(twins, {
        clientId: "nvidia-a",
        clientName: "Nvidia",
      }).map((row) => row.id),
    ).toEqual(["n1"]);
  });

  it("falls back to normalized name when client_id is absent on the invoice", () => {
    const nameless = [
      row({ id: "c", client_id: null, client_name: "Nvidia A", total_amount: 1 }),
    ];
    expect(
      issuedInvoicesForClient(nameless, {
        clientId: "client-1",
        clientName: "Nvidia a",
      }),
    ).toEqual(nameless);
  });
});
