jest.mock("@/lib/queries/useLedgerAggregationQuery", () => ({
  useFinanceCustomerLedgerInputs: (...args: unknown[]) =>
    mockUseFinanceCustomerLedgerInputs(...args),
  useSupplierLedgerAggregationQuery: (...args: unknown[]) =>
    mockUseSupplierLedgerAggregationQuery(...args),
}));

const mockUseFinanceCustomerLedgerInputs = jest.fn();
const mockUseSupplierLedgerAggregationQuery = jest.fn();

import { renderHook } from "@testing-library/react-native";
import {
  useFinanceAlignedClientLedger,
  useFinanceAlignedSupplierLedger,
} from "../useFinanceAlignedPartyTrips";
import type { TripRow } from "@/features/trips/services/trips.service";

const catalogTrip = { id: "trip-1" } as TripRow;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseFinanceCustomerLedgerInputs.mockReturnValue({
    data: undefined,
    isSuccess: false,
    isPending: true,
    isError: false,
    refetch: jest.fn(),
  });
  mockUseSupplierLedgerAggregationQuery.mockReturnValue({
    data: [],
    isSuccess: false,
  });
});

describe("party-page ledger fetch gate", () => {
  it("reuses the shared Finance Customers ledger query instead of a second contract", () => {
    const { result } = renderHook(() =>
      useFinanceAlignedClientLedger("org-1", "client-1", [catalogTrip]),
    );

    expect(mockUseFinanceCustomerLedgerInputs).toHaveBeenCalledWith("org-1");
    expect(result.current.ready).toBe(false);
    expect(result.current.loadState).toBe("pending");
  });

  it("derives detail totals from the cached customer ledger inputs", () => {
    mockUseFinanceCustomerLedgerInputs.mockReturnValue({
      data: {
        trip_inputs: [
          { client_id: "client-1", trip_id: "trip-1", sales: 100, initial_paid: 40 },
        ],
        unlinked_payments: [],
        ledger_only_parties: [],
        client_ledger_totals: [],
      },
      isSuccess: true,
      isPending: false,
      isError: false,
      refetch: jest.fn(),
    });

    const { result } = renderHook(() =>
      useFinanceAlignedClientLedger("org-1", "client-1", [catalogTrip]),
    );

    expect(result.current.ready).toBe(true);
    expect(result.current.billed).toBe(100);
    expect(result.current.received).toBe(40);
    expect(result.current.pending).toBe(60);
    expect(result.current.trips.map((trip) => trip.id)).toEqual(["trip-1"]);
    expect(result.current.loadState).toBe("success");
  });

  it("surfaces a ledger query error instead of treating it as pending success", () => {
    mockUseFinanceCustomerLedgerInputs.mockReturnValue({
      data: undefined,
      isSuccess: false,
      isPending: false,
      isError: true,
      refetch: jest.fn(),
    });

    const { result } = renderHook(() =>
      useFinanceAlignedClientLedger("org-1", "client-1", [catalogTrip]),
    );

    expect(result.current.ready).toBe(false);
    expect(result.current.loadState).toBe("error");
  });

  it("does not start the org-wide supplier ledger RPC on the supplier party page", () => {
    const { result } = renderHook(() =>
      useFinanceAlignedSupplierLedger("org-1", "supplier-1", [catalogTrip]),
    );

    expect(mockUseSupplierLedgerAggregationQuery).toHaveBeenCalledWith(null, true);
    expect(result.current.ready).toBe(false);
  });
});
