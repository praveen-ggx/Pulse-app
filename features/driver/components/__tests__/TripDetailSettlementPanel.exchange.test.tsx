import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("react-native", () => jest.requireActual("react-native"));

import { TripDetailSettlementPanel } from "../TripDetailSettlementPanel";
import type { TripRow } from "@/features/trips/services/trips.service";

const mockSummaryQuery = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/queries/useDriverOperatingModeQuery", () => ({
  useDriverOperatingModeQuery: () => ({ canTagOfflineParty: true }),
}));
jest.mock("@/contexts/DriverThemeContext", () => ({
  useDriverTheme: () => ({ theme: "light" }),
  useDriverThemeColors: () => new Proxy({}, { get: () => "#000000" }),
}));
jest.mock("@/features/driver/hooks/useDriverTripSettlement", () => ({
  useDriverTripSettlement: () => ({
    settlementView: {
      status: "pending",
      statusTone: "neutral",
      statusLabel: "Pending",
      isSalary: false,
      isFleetLinked: true,
      isEstimated: false,
      commissionApplies: true,
      showEstimatedEarning: true,
      expectedAmount: 15000,
      amount: 15000,
      outstandingAmount: 15000,
      writeOffAmount: 0,
      hasPaymentShortfall: false,
      otherIncomeAmount: 0,
      deductionsAmount: 0,
      fleetName: "Shipper A",
      canMarkAsPaid: true,
    },
    loading: false,
    requestPaymentLoading: false,
    requestPayment: jest.fn(),
  }),
}));
jest.mock("@/features/trips/operations/queries/useTripOperations", () => ({
  useTripOperationsSummary: () => ({
    data: { costEvents: [], financialSnapshot: { payableOutstandingInr: 0 }, mileage: { distanceKm: null } },
  }),
}));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: () => {} }));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useQuery: () => ({ data: null, isLoading: false }),
}));
jest.mock("@/features/dco-self/services/dcoSelfReceivable.service", () => ({
  getDcoSelfReceivableForTrip: jest.fn(async () => ({ receivable: null })),
}));
jest.mock("@/features/driver-indie/services/driverIndieReceivable.service", () => ({
  getDriverIndieReceivableForTrip: jest.fn(async () => ({ receivable: null })),
}));
jest.mock("@/features/marketplace/hooks/useExchangeTripPayments", () => ({
  useExchangeTripSummaryQuery: (tripId: string | null) => mockSummaryQuery(tripId),
}));
jest.mock("@/features/marketplace/components/ExchangePaymentsPanel", () => {
  const { Text } = jest.requireActual("react-native");
  return { ExchangePaymentsPanel: ({ tripId }: { tripId: string }) => <Text>{`exchange:${tripId}`}</Text> };
});
jest.mock("@/features/driver/components/DriverTripExpenseLogSection", () => ({
  DriverTripExpenseLogSection: () => null,
}));
jest.mock("@/features/driver/components/TripPaymentAmountGrid", () => ({
  TripPaymentAmountGrid: () => null,
}));
jest.mock("@/features/trips/verification/selectors/verificationSelectors", () => ({
  formatKm: (v: unknown) => String(v ?? "—"),
  toVerificationSnapshot: () => ({ startOdometerKm: null, endOdometerKm: null, odometerDistanceKm: null }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => "Icon" }));

const base = { id: "trip-1", organization_id: "org-1", pickup_area: "A", drop_location: "B" };

describe("TripDetailSettlementPanel — Marketplace DCO on Pulse Exchange", () => {
  beforeEach(() => mockSummaryQuery.mockReset());

  it("shows the Exchange receivable instead of a fleet payout on a Marketplace DCO trip", () => {
    mockSummaryQuery.mockReturnValue({ data: { trip_id: "trip-1", viewer_side: "payee", payee_kind: "dco" } });
    const trip = { ...base, operating_mode: "DCO", source: "market_bid" } as TripRow;
    const screen = render(<TripDetailSettlementPanel trip={trip} />);

    expect(mockSummaryQuery).toHaveBeenCalledWith("trip-1");
    expect(screen.getByText("exchange:trip-1")).toBeTruthy();
    expect(screen.queryByText("Expected payout")).toBeNull();
    expect(screen.queryByText("Request from fleet owner")).toBeNull();
  });

  it("keeps the fleet settlement view and skips the Exchange read on other trips", () => {
    mockSummaryQuery.mockReturnValue({ data: undefined });
    const trip = { ...base, operating_mode: "DCO", source: "direct_bid" } as TripRow;
    const screen = render(<TripDetailSettlementPanel trip={trip} />);

    expect(mockSummaryQuery).toHaveBeenCalledWith(null);
    expect(screen.queryByText("exchange:trip-1")).toBeNull();
    expect(screen.getByText("Expected payout")).toBeTruthy();
    expect(screen.getByText("Request from fleet owner")).toBeTruthy();
    expect(screen.getByText(/Revenue from/)).toBeTruthy();
    expect(screen.getByText(/Shipper A/)).toBeTruthy();
    expect(screen.getByText(/settle offline with fleet/i)).toBeTruthy();
    expect(screen.queryByText("Capture commission")).toBeNull();
  });
});
