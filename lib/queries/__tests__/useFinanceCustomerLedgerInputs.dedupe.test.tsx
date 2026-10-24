const mockGetCustomerLedgerInputs = jest.fn();

jest.mock("@/features/finance/services/ledgerAggregationRpc.service", () => ({
  getCustomerLedgerInputs: (...args: unknown[]) => mockGetCustomerLedgerInputs(...args),
  getDriverLedgerAggregation: jest.fn(),
  getSupplierLedgerAggregation: jest.fn(),
  getDcoLedgerAggregation: jest.fn(),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { useFinanceCustomerLedgerInputs } from "../useLedgerAggregationQuery";
import { CUSTOMER_LEDGER_APPLY_ADJUSTMENTS } from "@/features/finance/utils/customerLedgerContract.util";

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("Finance Customers ledger query contract", () => {
  beforeEach(() => {
    mockGetCustomerLedgerInputs.mockReset();
    mockGetCustomerLedgerInputs.mockResolvedValue({
      trip_inputs: [],
      unlinked_payments: [],
      ledger_only_parties: [],
      client_ledger_totals: [],
    });
  });

  it("header, table, and detail share one applyAdjustments=true request per org", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => {
        const header = useFinanceCustomerLedgerInputs("org-1");
        const table = useFinanceCustomerLedgerInputs("org-1");
        const detail = useFinanceCustomerLedgerInputs("org-1");
        return { header, table, detail };
      },
      { wrapper: wrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.header.isSuccess).toBe(true));
    expect(mockGetCustomerLedgerInputs).toHaveBeenCalledTimes(1);
    expect(mockGetCustomerLedgerInputs).toHaveBeenCalledWith(
      "org-1",
      CUSTOMER_LEDGER_APPLY_ADJUSTMENTS,
    );
    expect(result.current.table.data).toBe(result.current.header.data);
    expect(result.current.detail.data).toBe(result.current.header.data);
  });
});
