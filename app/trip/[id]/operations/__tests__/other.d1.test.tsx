import React from "react";
import { render, waitFor } from "@testing-library/react-native";

import TripOtherExpenseEntryRoute from "../other";

jest.mock("react-native", () => jest.requireActual("react-native"));
import * as driverOwnedTrip from "@/features/driver/services/driverOwnedTrip.service";
import * as tripsService from "@/features/trips/services/trips.service";
import type { TripRow } from "@/features/trips/services/trips.service";

const fetchedTrip = {
  id: "trip-1",
  organization_id: "org-1",
  pickup_area: "Fetched Origin",
  drop_location: "Bengaluru",
} as TripRow;

let mockRole: string | undefined = "driver";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "trip-1" }),
  Redirect: () => null,
}));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: mockRole ? { role: mockRole, uid: "user-1" } : null }),
}));
jest.mock("@/features/trips/operations/shared/useLeaveTripExpenseEntry", () => ({
  useLeaveTripExpenseEntry: () => jest.fn(),
}));
jest.mock("@/features/trips/operations/shared/DriverUnifiedExpenseEntryScreen", () => ({
  DriverUnifiedExpenseEntryScreen: ({ trip }: { trip: TripRow }) => {
    const { Text } = require("react-native");
    return <Text>{`expense-trip:${trip.id}:${trip.pickup_area}`}</Text>;
  },
}));
jest.mock("@/features/trips/operations/other/OtherExpenseEntryScreen", () => ({
  OtherExpenseEntryScreen: ({ trip }: { trip: TripRow }) => {
    const { Text } = require("react-native");
    return <Text>{`office-expense-trip:${trip.id}:${trip.pickup_area}`}</Text>;
  },
}));
jest.mock("@/components/CenteredLoadingView", () => ({
  CenteredLoadingView: ({ message }: { message?: string }) => {
    const { Text } = require("react-native");
    return <Text>{message ?? "loading"}</Text>;
  },
}));
jest.mock("@/features/driver/components/DriverTripHistoryDetailScreen", () => ({
  peekMountedDriverDetailTrip: jest.fn(() => null),
}));
jest.mock("@/features/driver/services/driverOwnedTrip.service", () => ({
  getDriverOwnedTrip: jest.fn(),
}));
jest.mock("@/features/trips/services/trips.service", () => ({
  getAccessibleTripById: jest.fn(),
}));
jest.mock("@/features/trips/operations/shared/driverExpenseCategoryNav.util", () => ({
  parseDriverExpenseCategoryParam: () => undefined,
  parseDriverExpenseKindParam: () => undefined,
}));
jest.mock("@/lib/routes", () => ({
  ROUTES: {
    tripFuelEntry: () => "/fuel",
    tripTollEntry: () => "/toll",
  },
}));

const mockGetOwned = driverOwnedTrip.getDriverOwnedTrip as jest.MockedFunction<
  typeof driverOwnedTrip.getDriverOwnedTrip
>;
const mockGetAccessible = tripsService.getAccessibleTripById as jest.MockedFunction<
  typeof tripsService.getAccessibleTripById
>;

describe("D1 expense driver-owned trip RPC", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole = "driver";
    mockGetOwned.mockResolvedValue({ error: null, trip: fetchedTrip });
    mockGetAccessible.mockResolvedValue({ error: null, trip: fetchedTrip });
  });

  it("loads via getDriverOwnedTrip for the driver cold path", async () => {
    const { getByText } = render(<TripOtherExpenseEntryRoute />);

    await waitFor(() => {
      expect(mockGetOwned).toHaveBeenCalledTimes(1);
      expect(mockGetOwned).toHaveBeenCalledWith("trip-1");
    });
    expect(mockGetAccessible).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(getByText("expense-trip:trip-1:Fetched Origin")).toBeTruthy();
    });
  });

  it("does not call get_driver_owned_trip for office / dispatcher", async () => {
    mockRole = "user";
    const { getByText } = render(<TripOtherExpenseEntryRoute />);

    await waitFor(() => {
      expect(mockGetAccessible).toHaveBeenCalledTimes(1);
    });
    expect(mockGetOwned).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(getByText("office-expense-trip:trip-1:Fetched Origin")).toBeTruthy();
    });
  });
});
