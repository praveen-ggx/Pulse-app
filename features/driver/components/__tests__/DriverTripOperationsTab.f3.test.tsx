import React from "react";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("react-native", () => jest.requireActual("react-native"));

import { DriverTripOperationsTab } from "../DriverTripOperationsTab";
import { queryKeys } from "@/lib/queryKeys";
import type { TripRow } from "@/features/trips/services/trips.service";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/contexts/DriverThemeContext", () => ({
  useDriverThemeColors: () =>
    new Proxy(
      {},
      {
        get: () => "#000000",
      },
    ),
}));
jest.mock("@/features/trips/verification/queries/useTripVerification", () => ({
  useTripVerification: () => ({ data: undefined }),
}));
jest.mock("@/features/trips/verification/GPSDistanceHook", () => ({
  useGPSDistanceEstimate: () => null,
}));
jest.mock("@/features/trips/verification/components/VerificationStatusChip", () => ({
  VerificationStatusChip: () => null,
}));
jest.mock("@/features/trips/verification/verification.service", () => ({
  computeDistanceDiscrepancy: () => null,
}));
jest.mock("@/features/trips/verification/selectors/verificationSelectors", () => ({
  buildOdometerGpsComparisonHint: () => "",
  formatKm: (v: unknown) => String(v ?? "—"),
  toVerificationSnapshot: () => ({
    startOdometerKm: null,
    endOdometerKm: null,
    odometerDistanceKm: null,
    gpsDistanceKm: null,
    distanceDiscrepancyKm: null,
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

describe("F3 DriverTripOperationsTab focus invalidation", () => {
  it("does not invalidate verification merely because the tab is focused", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");

    render(
      <QueryClientProvider client={client}>
        <DriverTripOperationsTab trip={trip} />
      </QueryClientProvider>,
    );

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(
      invalidateSpy.mock.calls.some(
        (call) =>
          JSON.stringify(call[0]?.queryKey) ===
          JSON.stringify(queryKeys.trips.verification("trip-1")),
      ),
    ).toBe(false);
  });
});
