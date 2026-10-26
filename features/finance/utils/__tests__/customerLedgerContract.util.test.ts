import type { CustomerLedgerInputs } from "@/features/finance/services/ledgerAggregationRpc.service";
import {
  CUSTOMER_LEDGER_APPLY_ADJUSTMENTS,
  customerLedgerLoadState,
  deriveCustomerPartyLedger,
  emptyCustomerLedgerInputs,
  filterCustomerRowsByDue,
  formatCustomerLedgerFigure,
  shouldPublishCustomerTabTotals,
  sliceCustomerLedgerInputs,
} from "../customerLedgerContract.util";

const inputs: CustomerLedgerInputs = {
  trip_inputs: [
    { client_id: "client-a", trip_id: "trip-1", sales: 1000, initial_paid: 400 },
    { client_id: "client-b", trip_id: "trip-2", sales: 50, initial_paid: 0 },
  ],
  unlinked_payments: [
    { client_id: "client-a", transaction_id: "tx-1", amount_in: 100 },
  ],
  ledger_only_parties: [{ party_name: "Ghost", received: 1, pending: 2 }],
  client_ledger_totals: [],
};

describe("customer ledger contract", () => {
  it("applies revenue adjustments on the shared Finance Customers query", () => {
    expect(CUSTOMER_LEDGER_APPLY_ADJUSTMENTS).toBe(true);
  });

  it("treats unknown amounts as placeholders, and genuine zero as ₹0", () => {
    expect(formatCustomerLedgerFigure(undefined, "pending")).toBe("—");
    expect(formatCustomerLedgerFigure(0, "pending")).toBe("—");
    expect(formatCustomerLedgerFigure(0, "error")).toBe("—");
    expect(formatCustomerLedgerFigure(0, "success")).toBe("₹0");
    expect(formatCustomerLedgerFigure(1200, "success")).toBe("₹1,200");
  });

  it("does not publish totals or apply due filters until the ledger succeeds", () => {
    expect(shouldPublishCustomerTabTotals("pending")).toBe(false);
    expect(shouldPublishCustomerTabTotals("error")).toBe(false);
    expect(shouldPublishCustomerTabTotals("success")).toBe(true);
    const rows = [{ pending: 0 }, { pending: 10 }];
    expect(filterCustomerRowsByDue(rows, "no_due", "pending")).toHaveLength(2);
    expect(filterCustomerRowsByDue(rows, "no_due", "success")).toHaveLength(1);
    expect(filterCustomerRowsByDue(rows, "has_due", "success")).toHaveLength(1);
  });

  it("uses query success/error, not an empty payload, as the load state", () => {
    expect(
      customerLedgerLoadState({ isPending: false, isSuccess: false, isError: true }),
    ).toBe("error");
    expect(
      customerLedgerLoadState({ isPending: true, isSuccess: false, isError: false }),
    ).toBe("pending");
    expect(
      customerLedgerLoadState({ isPending: false, isSuccess: true, isError: false }),
    ).toBe("success");
  });

  it("derives list and detail totals from the same sliced inputs", () => {
    const scoped = sliceCustomerLedgerInputs(inputs, "client-a");
    expect(scoped.trip_inputs).toHaveLength(1);
    expect(scoped.ledger_only_parties).toEqual([]);
    const totals = deriveCustomerPartyLedger("client-a", inputs, [{ id: "trip-1" }]);
    expect(totals.billed).toBe(1000);
    expect(totals.pending).toBe(500);
    expect(totals.received).toBe(500);
    expect(totals.tripIds).toEqual(["trip-1"]);
    expect(emptyCustomerLedgerInputs().trip_inputs).toEqual([]);
  });
});
