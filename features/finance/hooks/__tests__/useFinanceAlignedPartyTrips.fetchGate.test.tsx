jest.mock("@/lib/queries/useLedgerAggregationQuery", () => ({
  useCustomerLedgerInputsQuery: (...args: unknown[]) =>
    mockUseCustomerLedgerInputsQuery(...args),
  useSupplierLedgerAggregationQuery: (...args: unknown[]) =>
    mockUseSupplierLedgerAggregationQuery(...args),
}));

const mockUseCustomerLedgerInputsQuery = jest.fn();
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
  mockUseCustomerLedgerInputsQuery.mockReturnValue({
    data: undefined,
    isSuccess: false,
  });
  mockUseSupplierLedgerAggregationQuery.mockReturnValue({
    data: [],
    isSuccess: false,
  });
});

describe("party-page ledger fetch gate", () => {
  it("does not start the org-wide customer ledger RPC before the client catalog is ready", () => {
    const { result } = renderHook(() =>
      useFinanceAlignedClientLedger("org-1", "client-1", [], false),
    );

    expect(mockUseCustomerLedgerInputsQuery).toHaveBeenCalledWith(null, true);
    expect(result.current.ready).toBe(false);
  });

  it("starts the customer ledger RPC only after scoped client trips are hydrated", () => {
    mockUseCustomerLedgerInputsQuery.mockReturnValue({
      data: {
        trip_inputs: [
          { client_id: "client-1", trip_id: "trip-1", sales: 100, initial_paid: 40 },
        ],
        unlinked_payments: [],
        ledger_only_parties: [],
        client_ledger_totals: [],
      },
      isSuccess: true,
    });

    const { result } = renderHook(() =>
      useFinanceAlignedClientLedger("org-1", "client-1", [catalogTrip], true),
    );

    expect(mockUseCustomerLedgerInputsQuery).toHaveBeenCalledWith("org-1", true);
    expect(result.current.ready).toBe(true);
    expect(result.current.trips.map((trip) => trip.id)).toEqual(["trip-1"]);
    expect(result.current.billed).toBe(100);
  });

  it("does not start the org-wide supplier ledger RPC before the supplier catalog is ready", () => {
    const { result } = renderHook(() =>
      useFinanceAlignedSupplierLedger("org-1", "supplier-1", [], false),
    );

    expect(mockUseSupplierLedgerAggregationQuery).toHaveBeenCalledWith(null, true);
    expect(result.current.ready).toBe(false);
  });

  it("uses scoped supplier catalog trips after the supplier ledger RPC is allowed", () => {
    mockUseSupplierLedgerAggregationQuery.mockReturnValue({
      data: [{ supplier_id: "supplier-1", trips_count: 1, due: 80, paid: 20, unsettled: 60 }],
      isSuccess: true,
    });

    const { result } = renderHook(() =>
      useFinanceAlignedSupplierLedger("org-1", "supplier-1", [catalogTrip], true),
    );

    expect(mockUseSupplierLedgerAggregationQuery).toHaveBeenCalledWith("org-1", true);
    expect(result.current.ready).toBe(true);
    expect(result.current.trips).toEqual([catalogTrip]);
    expect(result.current.due).toBe(80);
  });
});
