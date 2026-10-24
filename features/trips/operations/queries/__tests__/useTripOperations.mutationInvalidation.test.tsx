import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useSaveTripOtherExpense, useSetTripOtherReimbursementState } from "../useTripOperations";
import { queryKeys } from "@/lib/queryKeys";
import * as operationalInvalidation from "@/lib/queries/operationalInvalidation";
import { updateOtherReimbursementState } from "../../reimbursement/reimbursement.service";

jest.mock("@/contexts/NetworkContext", () => ({
  useIsOnline: () => true,
}));
jest.mock("@/features/ledger/vehicle", () => ({
  evaluateAndPostFuelEntry: jest.fn(),
  evaluateAndPostOtherExpenseEntry: jest.fn(),
  evaluateAndPostTollEntry: jest.fn(),
}));
jest.mock("@/features/ledger/vehicle/postingMessages.util", () => ({
  describeVehiclePostingFailure: jest.fn(),
  isVehiclePostingSuccess: jest.fn(),
}));
jest.mock("@/features/finance/projections/syncOperationalFinanceProjection", () => ({
  syncOperationalFinanceProjection: jest.fn(),
}));
jest.mock("@/features/trips/services/trips.service", () => ({
  getTripRowByIdLight: jest.fn(),
}));
jest.mock("../../other/otherExpense.service", () => ({
  createTripOtherExpense: jest.fn(async () => ({ error: null, entry: { id: "exp-1" } })),
  getTripOtherExpenses: jest.fn(),
  updateTripOtherExpense: jest.fn(),
  updateTripOtherExpenseApprovalState: jest.fn(),
  uploadOtherExpenseReceiptPhoto: jest.fn(),
}));
jest.mock("../../fuel/fuel.service", () => ({
  createTripFuelEntry: jest.fn(),
  getTripFuelEntries: jest.fn(),
  updateTripFuelApprovalState: jest.fn(),
  updateTripFuelEntry: jest.fn(),
  uploadFuelBillPhoto: jest.fn(),
}));
jest.mock("../../toll/toll.service", () => ({
  createTripTollEntry: jest.fn(),
  getTripTollEntries: jest.fn(),
  updateTripTollApprovalState: jest.fn(),
  updateTripTollEntry: jest.fn(),
  uploadTollReceiptPhoto: jest.fn(),
}));
jest.mock("../../uploads/photoUploads", () => ({
  compressOperationsPhoto: jest.fn(),
}));
jest.mock("../../timeline/timelineEvents.service", () => ({
  getTripOperationalTimelineEvents: jest.fn(),
}));
jest.mock("../../maintenance/maintenance.service", () => ({
  getVehicleMaintenanceEntries: jest.fn(),
}));
jest.mock("../../reimbursement/reimbursement.service", () => ({
  updateFuelReimbursementState: jest.fn(),
  updateOtherReimbursementState: jest.fn(),
  updateTollReimbursementState: jest.fn(),
}));
jest.mock("../../reimbursement/driverExpenseRequest.service", () => ({
  cancelDriverExpenseRequest: jest.fn(),
  parseDriverExpenseEventId: jest.fn(),
  remindDriverExpenseRequest: jest.fn(),
}));

describe("F3 mutation-driven operations-summary invalidation", () => {
  it("invalidates operations summary after a successful expense save", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
    });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSaveTripOtherExpense(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        tripId: "trip-1",
        expenseCategory: "misc",
        amountInr: 100,
        enteredBy: "user-1",
      });
    });

    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map((call) =>
        JSON.stringify(call[0]?.queryKey),
      );
      expect(keys).toContain(
        JSON.stringify(queryKeys.trips.operationsSummary("trip-1")),
      );
    });
  });

  it("refreshes ledger state from the settlement-scoped summary cache", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
    });
    client.setQueryData(
      [...queryKeys.trips.operationsSummary("trip-1"), "settlement"],
      { trip: { organization_id: "org-1", vehicle_id: "veh-1" } },
    );
    (updateOtherReimbursementState as jest.Mock).mockResolvedValue({
      error: null,
      entry: { id: "exp-1" },
    });
    const ledgerSpy = jest.spyOn(operationalInvalidation, "invalidateLedgerState");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSetTripOtherReimbursementState(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        tripId: "trip-1",
        otherEntryId: "exp-1",
        nextState: "approved",
        actorUserId: "user-1",
      });
    });

    await waitFor(() => {
      expect(ledgerSpy).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1", tripId: "trip-1" }),
      );
    });
  });
});
