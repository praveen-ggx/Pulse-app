import React from "react";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("react-native", () => jest.requireActual("react-native"));

import { TripDetailSettlementPanel } from "../TripDetailSettlementPanel";
import { queryKeys } from "@/lib/queryKeys";
import type { TripRow } from "@/features/trips/services/trips.service";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/contexts/DriverThemeContext", () => ({
  useDriverTheme: () => ({ theme: "light" }),
  useDriverThemeColors: () =>
    new Proxy(
      {},
      {
        get: () => "#000000",
      },
    ),
}));
jest.mock("@/features/driver/hooks/useDriverTripSettlement", () => ({
  useDriverTripSettlement: () => ({
    settlementView: {
      tone: "neutral",
      headline: "Settlement",
      body: "",
      netAmount: 0,
      rows: [],
    },
    loading: false,
    requestPaymentLoading: false,
    requestPayment: jest.fn(),
  }),
}));
jest.mock("@/features/trips/operations/queries/useTripOperations", () => ({
  useTripOperationsSummary: () => ({
    data: {
      costEvents: [],
      financialSnapshot: { payableOutstandingInr: 0 },
      mileage: { distanceKm: null },
    },
  }),
}));
jest.mock("@/features/driver/components/DriverTripExpenseLogSection", () => ({
  DriverTripExpenseLogSection: () => null,
}));
jest.mock("@/features/marketplace/hooks/useExchangeTripPayments", () => ({
  useExchangeTripSummaryQuery: () => ({ data: null }),
}));
jest.mock("@/features/marketplace/components/ExchangePaymentsPanel", () => ({
  ExchangePaymentsPanel: () => null,
}));
jest.mock("@/features/driver/components/TripPaymentAmountGrid", () => ({
  TripPaymentAmountGrid: () => null,
}));
jest.mock("@/features/trips/verification/selectors/verificationSelectors", () => ({
  formatKm: (v: unknown) => String(v ?? "—"),
  toVerificationSnapshot: () => ({
    startOdometerKm: null,
    endOdometerKm: null,
    odometerDistanceKm: null,
  }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy(
    {},
    {
      get: () => "Icon",
    },
  ),
);
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => {
    require("react").useEffect(cb, [cb]);
  },
}));

const trip = {
  id: "trip-1",
  organization_id: "org-1",
  pickup_area: "A",
  drop_location: "B",
} as TripRow;

describe("F3 TripDetailSettlementPanel focus invalidation", () => {
  it("does not invalidate operations summary merely because the panel is focused", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");

    render(
      <QueryClientProvider client={client}>
        <TripDetailSettlementPanel trip={trip} />
      </QueryClientProvider>,
    );

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(
      invalidateSpy.mock.calls.some(
        (call) =>
          JSON.stringify(call[0]?.queryKey) ===
          JSON.stringify(queryKeys.trips.operationsSummary("trip-1")),
      ),
    ).toBe(false);
  });
});
