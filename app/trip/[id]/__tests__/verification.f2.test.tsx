import React from "react";
import { render, waitFor } from "@testing-library/react-native";

import TripVerificationRoute from "../verification";

jest.mock("react-native", () => jest.requireActual("react-native"));
import { peekMountedDriverDetailTrip } from "@/features/driver/components/DriverTripHistoryDetailScreen";
import * as driverOwnedTrip from "@/features/driver/services/driverOwnedTrip.service";
import * as tripsService from "@/features/trips/services/trips.service";
import type { TripRow } from "@/features/trips/services/trips.service";

const parentTrip = {
  id: "trip-1",
  organization_id: "org-1",
  pickup_area: "Chennai",
  drop_location: "Bengaluru",
  start_odometer_km: 10,
} as TripRow;

const fetchedTrip = {
  ...parentTrip,
  start_odometer_km: 99,
} as TripRow;

let mockRole: string | undefined = "driver";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "trip-1", side: "both" }),
}));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: mockRole ? { role: mockRole, uid: "user-1" } : null }),
}));
jest.mock("@/features/driver/components/DriverTripHistoryDetailScreen", () => ({
  peekMountedDriverDetailTrip: jest.fn(() => null),
}));
jest.mock("@/features/trips/verification", () => ({
  OdometerStartEndScreen: ({ trip }: { trip: TripRow }) => {
    const { Text } = require("react-native");
    return <Text>{`odometer-trip:${trip.id}:${trip.start_odometer_km}`}</Text>;
  },
  OdometerEntryScreen: () => null,
}));
jest.mock("@/components/CenteredLoadingView", () => ({
  CenteredLoadingView: ({ message }: { message?: string }) => {
    const { Text } = require("react-native");
    return <Text>{message ?? "loading"}</Text>;
  },
}));
jest.mock("@/features/driver/services/driverOwnedTrip.service", () => ({
  getDriverOwnedTrip: jest.fn(),
}));
jest.mock("@/features/trips/services/trips.service", () => ({
  getAccessibleTripById: jest.fn(),
}));

const mockPeek = peekMountedDriverDetailTrip as jest.MockedFunction<
  typeof peekMountedDriverDetailTrip
>;
const mockGetOwned = driverOwnedTrip.getDriverOwnedTrip as jest.MockedFunction<
  typeof driverOwnedTrip.getDriverOwnedTrip
>;
const mockGetAccessible = tripsService.getAccessibleTripById as jest.MockedFunction<
  typeof tripsService.getAccessibleTripById
>;

describe("F2 verification parent-trip reuse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole = "driver";
    mockPeek.mockReturnValue(null);
    mockGetOwned.mockResolvedValue({ error: null, trip: fetchedTrip });
    mockGetAccessible.mockResolvedValue({ error: null, trip: fetchedTrip });
  });

  it("reuses the mounted parent trip and does not fetch", async () => {
    mockPeek.mockReturnValue(parentTrip);
    const { getByText, queryByText } = render(<TripVerificationRoute />);

    expect(queryByText("Loading verification...")).toBeNull();
    expect(getByText("odometer-trip:trip-1:10")).toBeTruthy();
    expect(mockGetOwned).not.toHaveBeenCalled();
    expect(mockGetAccessible).not.toHaveBeenCalled();
  });

  it("loads via getDriverOwnedTrip when Trip Detail was never opened", async () => {
    const { getByText } = render(<TripVerificationRoute />);

    await waitFor(() => {
      expect(mockGetOwned).toHaveBeenCalledTimes(1);
      expect(mockGetOwned).toHaveBeenCalledWith("trip-1");
    });
    expect(mockGetAccessible).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(getByText("odometer-trip:trip-1:99")).toBeTruthy();
    });
  });

  it("does not call get_driver_owned_trip for office / dispatcher miss path", async () => {
    mockRole = "user";
    render(<TripVerificationRoute />);

    await waitFor(() => {
      expect(mockGetAccessible).toHaveBeenCalledTimes(1);
    });
    expect(mockGetOwned).not.toHaveBeenCalled();
  });
});
