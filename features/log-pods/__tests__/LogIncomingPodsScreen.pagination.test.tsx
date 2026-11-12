import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { LogIncomingPodsScreen } from "@/features/log-pods/LogIncomingPodsScreen";

const mockTripsQuery = {
  data: [] as Array<{
    id: string;
    internal_id: string;
    supplier_name: string;
    lrNumbers: string[];
    receivedLRs: string[];
    from: string;
    to: string;
    date: string;
    client: string;
    amount: number | null;
    status: string;
    hardCopyReceived: boolean;
    lane: "market";
    supplier_id: string;
    driver_id: string;
    driver_name: string;
  }>,
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetch: jest.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn(),
};

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");
jest.mock("@shopify/flash-list", () => ({ FlashList: () => null }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn() }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/layoutInsets", () => ({
  useLayoutInsets: () => ({ scrollBottomPadding: () => 0 }),
}));
jest.mock("@/contexts/DemoTabBarScrollContext", () => ({
  useTabBarAwareScrollProps: () => ({}),
}));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { role: "owner" } }),
}));
jest.mock("@/lib/useCapabilities", () => ({
  useCapabilities: () => ["dispatch"],
}));
jest.mock("@/contexts/OrganizationContext", () => ({
  useOrganization: () => ({
    currentOrganization: { id: "org-1" },
    isLoading: false,
  }),
}));
jest.mock("@/lib/queries/useLogIncomingPodsQueries", () => ({
  useLogIncomingPodsTripsQuery: () => mockTripsQuery,
  useCourierPartnersQuery: () => ({ data: [], isLoading: false }),
  useLogIncomingPodsMutation: () => ({ isPending: false, mutate: jest.fn() }),
  useAddCourierPartnerMutation: () => ({ mutateAsync: jest.fn() }),
}));

function trip(id: string) {
  return {
    id,
    internal_id: id,
    supplier_name: "Acme",
    supplier_id: "s1",
    driver_id: "d1",
    driver_name: "Driver",
    lane: "market" as const,
    lrNumbers: ["LR-1"],
    receivedLRs: [],
    from: "A",
    to: "B",
    date: "11 Nov 2026",
    client: "Client",
    amount: 100,
    status: "completed",
    hardCopyReceived: false,
  };
}

describe("POD screen pagination", () => {
  beforeEach(() => {
    mockTripsQuery.data = [];
    mockTripsQuery.isLoading = false;
    mockTripsQuery.isError = false;
    mockTripsQuery.error = null;
    mockTripsQuery.hasNextPage = false;
    mockTripsQuery.isFetchingNextPage = false;
    mockTripsQuery.fetchNextPage.mockClear();
  });

  it("does not treat an empty page with a cursor as the end of pending trips", () => {
    mockTripsQuery.hasNextPage = true;
    const view = render(<LogIncomingPodsScreen />);
    expect(view.getByText("Older trips are still on the server")).toBeTruthy();
    expect(view.getByText("Load older trips")).toBeTruthy();
    expect(view.queryByText("No trips found")).toBeNull();
    fireEvent.press(view.getByText("Load older trips"));
    expect(mockTripsQuery.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("keeps the trips already loaded while the next page is loading", () => {
    mockTripsQuery.data = [trip("TRIP-1")];
    mockTripsQuery.hasNextPage = true;
    mockTripsQuery.isFetchingNextPage = true;
    const view = render(<LogIncomingPodsScreen />);
    expect(view.getByText("TRIP-1")).toBeTruthy();
    expect(view.getByText("Loading older trips…")).toBeTruthy();
  });

  it("shows loading and errors before any empty-state copy", () => {
    mockTripsQuery.isLoading = true;
    const loading = render(<LogIncomingPodsScreen />);
    expect(loading.getByText("Loading trips and couriers…")).toBeTruthy();
    expect(loading.queryByText("No trips found")).toBeNull();
    loading.unmount();

    mockTripsQuery.isLoading = false;
    mockTripsQuery.isError = true;
    mockTripsQuery.error = new Error("pod unavailable");
    const failed = render(<LogIncomingPodsScreen />);
    expect(failed.getByText("Could not load data")).toBeTruthy();
    expect(failed.getByText("pod unavailable")).toBeTruthy();
    expect(failed.queryByText("No trips found")).toBeNull();
    expect(failed.queryByText("Older trips are still on the server")).toBeNull();
  });
});
