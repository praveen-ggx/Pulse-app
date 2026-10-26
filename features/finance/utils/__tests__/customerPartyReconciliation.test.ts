import { aggregateCustomersFromRpc } from "@/features/finance/aggregation/aggregateCustomersFromRpc";
import type { CustomerLedgerInputs } from "@/features/finance/services/ledgerAggregationRpc.service";
import { deriveCustomerPartyLedger } from "../customerLedgerContract.util";

function inputs(overrides: Partial<CustomerLedgerInputs> = {}): CustomerLedgerInputs {
  return {
    trip_inputs: [],
    unlinked_payments: [],
    ledger_only_parties: [],
    client_ledger_totals: [],
    ...overrides,
  };
}

function listRow(clientId: string, data: CustomerLedgerInputs) {
  return aggregateCustomersFromRpc([{ id: clientId, name: "Acme" }], data).rows[0];
}

describe("list vs detail vs authoritative ledger", () => {
  it.each([
    ["empty", inputs(), { billed: 0, received: 0, pending: 0 }],
    [
      "unpaid",
      inputs({
        trip_inputs: [{ client_id: "c1", trip_id: "t1", sales: 800, initial_paid: 0 }],
      }),
      { billed: 800, received: 0, pending: 800 },
    ],
    [
      "fully paid",
      inputs({
        trip_inputs: [{ client_id: "c1", trip_id: "t1", sales: 800, initial_paid: 800 }],
      }),
      { billed: 800, received: 800, pending: 0 },
    ],
    [
      "partial + extra receipt",
      inputs({
        trip_inputs: [{ client_id: "c1", trip_id: "t1", sales: 800, initial_paid: 200 }],
        unlinked_payments: [{ client_id: "c1", transaction_id: "p1", amount_in: 100 }],
      }),
      { billed: 800, received: 300, pending: 500 },
    ],
    [
      "name-matched or ledger-linked trip already in trip_inputs",
      inputs({
        trip_inputs: [{ client_id: "c1", trip_id: "name-or-ledger", sales: 250, initial_paid: 0 }],
      }),
      { billed: 250, received: 0, pending: 250 },
    ],
    [
      "exchange / commerce sale already merged into trip_inputs",
      inputs({
        trip_inputs: [{ client_id: "c1", trip_id: "exchange-1", sales: 90, initial_paid: 0 }],
      }),
      { billed: 90, received: 0, pending: 90 },
    ],
  ] as const)("%s", (_name, data, expected) => {
    const list = listRow("c1", data);
    const detail = deriveCustomerPartyLedger("c1", data, [{ id: data.trip_inputs[0]?.trip_id ?? "t1" }]);
    expect(list.billed).toBe(expected.billed);
    expect(list.received).toBe(expected.received);
    expect(list.pending).toBe(expected.pending);
    expect(detail.billed).toBe(list.billed);
    expect(detail.received).toBe(list.received);
    expect(detail.pending).toBe(list.pending);
  });
});
