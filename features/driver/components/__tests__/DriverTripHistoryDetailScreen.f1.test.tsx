import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";

import {
  DriverTripHistoryDetailScreen,
  forgetMountedDriverDetailTrip,
  peekMountedDriverDetailTrip,
  rememberMountedDriverDetailTrip,
} from "../DriverTripHistoryDetailScreen";
import * as tripsService from "@/features/trips/services/trips.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import { reverseGeocodeCityStateLabel } from "@/lib/reverseGeocodePlace.util";
import { getTripAppLocationsForTimeline } from "@/features/driver/services/driverLocation.service";

jest.mock("react-native", () => jest.requireActual("react-native"));

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { uid: "user-1" } }),
}));
jest.mock("@/contexts/DriverThemeContext", () => ({
  useDriverTheme: () => ({ theme: "light" }),
  useDriverThemeColors: () =>
    new Proxy(
      {},
      {
        get: (_t, prop) => (prop === "emerald" ? "#10b981" : "#111111"),
      },
    ),
}));
jest.mock("@/contexts/DriverTripOpsContext", () => ({
  useRegisterDriverContextTrip: () => undefined,
}));
jest.mock("@/features/trips/verification", () => ({
  useTripVerificationSync: () => undefined,
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");
jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: View };
});
jest.mock("lucide-react-native", () =>
  new Proxy(
    {},
    {
      get: () => "Icon",
    },
  ),
);
jest.mock("react-native-reanimated", () => {
  const { View: RNView } = require("react-native");
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: (C: unknown) => C ?? RNView,
      View: RNView,
    },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    cancelAnimation: jest.fn(),
    withRepeat: (v: unknown) => v,
    withSequence: (v: unknown) => v,
    withTiming: (v: unknown) => v,
  };
});

let latestFocusEffect: (() => void | (() => void)) | null = null;
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    latestFocusEffect = cb;
    require("react").useEffect(() => {
      const cleanup = cb();
      return () => {
        if (typeof cleanup === "function") cleanup();
      };
    }, [cb]);
  },
}));

jest.mock("@/lib/routingService", () => ({ getOptimalRoute: jest.fn() }));
jest.mock("@/lib/reverseGeocodePlace.util", () => ({
  reverseGeocodeCityStateLabel: jest.fn(() => Promise.resolve(null)),
}));
jest.mock("@/features/driver/services/driverLocation.service", () => ({
  getTripAppLocationsForTimeline: jest.fn(() =>
    Promise.resolve({ error: null, points: [] }),
  ),
}));
jest.mock("@/features/trips/services/tripDocuments.service", () => ({
  getDocumentsByTripId: jest.fn(() =>
    Promise.resolve({ documents: [], error: null }),
  ),
  tryGetDocumentViewUrl: jest.fn(),
}));
jest.mock("@/features/trips/services/trip-assignment-audit.service", () => ({
  getLatestAssignmentAuditByTripIds: jest.fn(() =>
    Promise.resolve({ byTripId: new Map(), error: null }),
  ),
}));
jest.mock("@/features/drivers/services/drivers.service", () => ({
  getLinkedDriversForCurrentUser: jest.fn(() =>
    Promise.resolve({ error: null, drivers: [] }),
  ),
  getDriverInvitesReceived: jest.fn(() =>
    Promise.resolve({ error: null, invites: [] }),
  ),
}));
jest.mock("@/features/drivers/services/salaryRequests.service", () => ({
  getSalaryRequestsByDriverIds: jest.fn(() =>
    Promise.resolve({ error: null, requests: [] }),
  ),
}));
jest.mock("@/features/driver/components/TripDetailSettlementPanel", () => ({
  TripDetailSettlementPanel: () => null,
}));
jest.mock("@/features/driver/components/DriverTripOperationsTab", () => ({
  DriverTripOperationsTab: () => null,
}));
jest.mock("@/features/driver/components/DriverDocumentGalleryPreview", () => ({
  DriverDocumentGalleryPreview: () => null,
}));
jest.mock("@/components/LoadingIndicator", () => ({
  LoadingIndicator: () => null,
}));
jest.mock("@/features/trips/utils/driverAssignerDisplay.util", () => ({
  buildAssignerDisplayForTrip: () => "",
}));
jest.mock("@/lib/avatarUpload", () => ({
  useDriverAvatarUri: () => ({ avatarUri: null }),
}));
jest.mock("@/features/trips/services/trips.service", () => {
  const actual = jest.requireActual("@/features/trips/services/trips.service");
  return {
    ...actual,
    getDriverTripById: jest.fn(),
  };
});

const tripRow = {
  id: "trip-1",
  organization_id: "org-1",
  pickup_area: "Chennai",
  drop_location: "Bengaluru",
  status: "in_transit",
  driver_id: "drv-1",
} as TripRow;

const mockGetDriverTripById = tripsService.getDriverTripById as jest.MockedFunction<
  typeof tripsService.getDriverTripById
>;

describe("F1 DriverTripHistoryDetailScreen fetch / spinner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestFocusEffect = null;
    forgetMountedDriverDetailTrip("trip-1");
    mockGetDriverTripById.mockResolvedValue({
      error: null,
      trip: tripRow as never,
    });
  });

  it("issues a single getDriverTripById on first navigation (mount+focus together)", async () => {
    const { queryByText } = render(
      <DriverTripHistoryDetailScreen tripId="trip-1" />,
    );

    expect(queryByText("Loading trip…")).toBeTruthy();

    await waitFor(() => {
      expect(mockGetDriverTripById).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(queryByText("Loading trip…")).toBeNull();
    });
  });

  it("does not geocode or load the timeline map when opened on Settlement", async () => {
    const { queryByText } = render(
      <DriverTripHistoryDetailScreen tripId="trip-1" initialTab="settlement" />,
    );

    await waitFor(() => {
      expect(queryByText("Loading trip…")).toBeNull();
    });

    expect(getTripAppLocationsForTimeline).not.toHaveBeenCalled();
    expect(reverseGeocodeCityStateLabel).not.toHaveBeenCalled();
  });

  it("does not blank an already-loaded trip when focus runs again", async () => {
    const { queryByText } = render(
      <DriverTripHistoryDetailScreen tripId="trip-1" />,
    );

    await waitFor(() => {
      expect(queryByText("Loading trip…")).toBeNull();
    });
    expect(mockGetDriverTripById).toHaveBeenCalledTimes(1);

    await act(async () => {
      const cleanup = latestFocusEffect?.();
      if (typeof cleanup === "function") cleanup();
    });

    expect(queryByText("Loading trip…")).toBeNull();
    await waitFor(() => {
      expect(mockGetDriverTripById).toHaveBeenCalledTimes(2);
    });
    expect(queryByText("Loading trip…")).toBeNull();
  });
});

const tripA = {
  ...tripRow,
  id: "trip-A",
  start_odometer_km: 10,
} as TripRow;

const tripARefreshed = {
  ...tripA,
  start_odometer_km: 20,
  updated_at: "2026-10-05T12:00:00.000Z",
} as TripRow;

const tripB = {
  ...tripRow,
  id: "trip-B",
  pickup_area: "Pune",
  start_odometer_km: 5,
} as TripRow;

describe("mounted driver detail trip cache", () => {
  afterEach(() => {
    forgetMountedDriverDetailTrip("trip-1");
    forgetMountedDriverDetailTrip("trip-A");
    forgetMountedDriverDetailTrip("trip-B");
  });

  it("remembers and peeks the parent trip, then forgets it", () => {
    expect(peekMountedDriverDetailTrip("trip-1")).toBeNull();
    rememberMountedDriverDetailTrip("trip-1", tripRow);
    expect(peekMountedDriverDetailTrip("trip-1")?.id).toBe("trip-1");
    forgetMountedDriverDetailTrip("trip-1");
    expect(peekMountedDriverDetailTrip("trip-1")).toBeNull();
  });

  it("returns only the requested trip id (A cannot be peeked as B)", () => {
    rememberMountedDriverDetailTrip("trip-A", tripA);
    expect(peekMountedDriverDetailTrip("trip-A")?.id).toBe("trip-A");
    expect(peekMountedDriverDetailTrip("trip-B")).toBeNull();
  });

  it("keeps A and B independently and does not overwrite the other key", () => {
    rememberMountedDriverDetailTrip("trip-A", tripA);
    rememberMountedDriverDetailTrip("trip-B", tripB);
    expect(peekMountedDriverDetailTrip("trip-A")?.id).toBe("trip-A");
    expect(peekMountedDriverDetailTrip("trip-B")?.id).toBe("trip-B");
    forgetMountedDriverDetailTrip("trip-A");
    expect(peekMountedDriverDetailTrip("trip-A")).toBeNull();
    expect(peekMountedDriverDetailTrip("trip-B")?.id).toBe("trip-B");
  });

  it("does not store a trip object under a mismatched id", () => {
    rememberMountedDriverDetailTrip("trip-B", tripA);
    expect(peekMountedDriverDetailTrip("trip-B")).toBeNull();
    expect(peekMountedDriverDetailTrip("trip-A")).toBeNull();
  });

  it("replaces the remembered object for the same id with the latest write", () => {
    rememberMountedDriverDetailTrip("trip-A", tripA);
    rememberMountedDriverDetailTrip("trip-A", tripARefreshed);
    expect(peekMountedDriverDetailTrip("trip-A")?.start_odometer_km).toBe(20);
  });

  it("clears the id when remembered as null", () => {
    rememberMountedDriverDetailTrip("trip-A", tripA);
    rememberMountedDriverDetailTrip("trip-A", null);
    expect(peekMountedDriverDetailTrip("trip-A")).toBeNull();
  });

  it("ignores empty trip ids so they cannot leak into the registry", () => {
    rememberMountedDriverDetailTrip("   ", tripA);
    expect(peekMountedDriverDetailTrip("   ")).toBeNull();
    expect(peekMountedDriverDetailTrip("trip-A")).toBeNull();
  });

  it("rapid remember/forget/remember leaves only the last committed state", () => {
    rememberMountedDriverDetailTrip("trip-A", tripA);
    forgetMountedDriverDetailTrip("trip-A");
    rememberMountedDriverDetailTrip("trip-A", tripARefreshed);
    forgetMountedDriverDetailTrip("trip-A");
    expect(peekMountedDriverDetailTrip("trip-A")).toBeNull();
    rememberMountedDriverDetailTrip("trip-A", tripA);
    expect(peekMountedDriverDetailTrip("trip-A")?.id).toBe("trip-A");
  });
});

describe("mounted driver detail trip cache — screen lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestFocusEffect = null;
    forgetMountedDriverDetailTrip("trip-A");
    forgetMountedDriverDetailTrip("trip-B");
    mockGetDriverTripById.mockImplementation(async (id) => ({
      error: null,
      trip: { ...tripRow, id } as never,
    }));
  });

  afterEach(() => {
    forgetMountedDriverDetailTrip("trip-A");
    forgetMountedDriverDetailTrip("trip-B");
  });

  it("remembers Trip A while mounted and forgets it on unmount", async () => {
    const screen = render(<DriverTripHistoryDetailScreen tripId="trip-A" />);
    await waitFor(() => {
      expect(peekMountedDriverDetailTrip("trip-A")?.id).toBe("trip-A");
    });
    screen.unmount();
    expect(peekMountedDriverDetailTrip("trip-A")).toBeNull();
  });

  it("does not return Trip A after unmount + remount until the new instance loads", async () => {
    const first = render(<DriverTripHistoryDetailScreen tripId="trip-A" />);
    await waitFor(() => {
      expect(peekMountedDriverDetailTrip("trip-A")?.id).toBe("trip-A");
    });
    first.unmount();
    expect(peekMountedDriverDetailTrip("trip-A")).toBeNull();

    const second = render(<DriverTripHistoryDetailScreen tripId="trip-A" />);
    expect(peekMountedDriverDetailTrip("trip-A")).toBeNull();
    await waitFor(() => {
      expect(peekMountedDriverDetailTrip("trip-A")?.id).toBe("trip-A");
    });
    second.unmount();
    expect(peekMountedDriverDetailTrip("trip-A")).toBeNull();
  });

  it("keeps Trip A remembered while Trip B is also mounted, then forgets only B", async () => {
    const screenA = render(<DriverTripHistoryDetailScreen tripId="trip-A" />);
    await waitFor(() => {
      expect(peekMountedDriverDetailTrip("trip-A")?.id).toBe("trip-A");
    });

    const screenB = render(<DriverTripHistoryDetailScreen tripId="trip-B" />);
    await waitFor(() => {
      expect(peekMountedDriverDetailTrip("trip-B")?.id).toBe("trip-B");
    });
    expect(peekMountedDriverDetailTrip("trip-A")?.id).toBe("trip-A");

    screenB.unmount();
    expect(peekMountedDriverDetailTrip("trip-B")).toBeNull();
    expect(peekMountedDriverDetailTrip("trip-A")?.id).toBe("trip-A");
    screenA.unmount();
    expect(peekMountedDriverDetailTrip("trip-A")).toBeNull();
  });
});
