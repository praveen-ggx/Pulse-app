import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvoicingExecuteScreen, TripListContent } from "@/features/invoicing/InvoicingExecuteScreen";

const mockTripsQuery = {
  data: [] as { id: string }[],
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetch: jest.fn(),
  isRefetching: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn(),
};

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@expo/vector-icons", () => ({
  FontAwesome: "FontAwesome",
  Ionicons: "Ionicons",
  MaterialIcons: "MaterialIcons",
}));
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/invoicing-execute",
  useLocalSearchParams: () => ({}),
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
  useAuth: () => ({ profile: { role: "owner" }, user: { id: "user-1" } }),
}));
jest.mock("@/lib/useCapabilities", () => ({
  useCapabilities: () => ["finance_view"],
}));
jest.mock("@/contexts/OrganizationContext", () => ({
  useOrganization: () => ({
    currentOrganization: { id: "org-1" },
    isLoading: false,
    refreshOrganization: jest.fn(),
  }),
}));
jest.mock("@/contexts/ActiveWorkspaceContext", () => ({
  useActiveWorkspace: () => ({
    activeWorkspace: null,
    isLoading: false,
    refresh: jest.fn(),
    error: null,
  }),
}));
jest.mock("@/features/product-shell/PulseProductShell", () => ({
  usePulseProductShell: () => null,
}));
jest.mock("@/lib/queries/useInvoicingExecuteQueries", () => ({
  useInvoicingExecuteTripsQuery: () => mockTripsQuery,
  useIssuedInvoicesQuery: () => ({ data: [], isRefetching: false, refetch: jest.fn() }),
  useDraftInvoicesQuery: () => ({ data: [] }),
  useInvoiceClientPodPoliciesQuery: () => ({ data: {} }),
  useInvoiceDigitalPodTripIdsQuery: () => ({ data: new Set() }),
  useExecuteInvoiceMutation: () => ({ isPending: false, mutate: jest.fn() }),
}));

function sheet(overrides: Partial<React.ComponentProps<typeof TripListContent>> = {}) {
  return render(
    <TripListContent
      tabBarScrollProps={{}}
      isDesktopTripTable={false}
      clientTrips={[]}
      activeClient="Client"
      selectedTripIds={[]}
      allSelected={false}
      onSelectAll={jest.fn()}
      onToggleTrip={jest.fn()}
      onClearSelection={jest.fn()}
      onResetInvoiceDraft={jest.fn()}
      onExportFiltered={jest.fn()}
      bulkDisabledMessage={null}
      isTripInvoiceable={() => false}
      searchQuery=""
      setSearchQuery={jest.fn()}
      isRefetching={false}
      refetch={jest.fn()}
      startDate=""
      setStartDate={jest.fn()}
      endDate=""
      setEndDate={jest.fn()}
      podRequired={false}
      tripInvoiceBlockedHint={() => ""}
      completionFilter="all"
      onCompletionFilterChange={jest.fn()}
      completedTripCount={0}
      notCompletedTripCount={0}
      {...overrides}
    />,
  );
}

describe("invoice trip sheet pagination", () => {
  it("does not call an empty page finished while older trips remain", () => {
    const view = sheet({ hasOlderTrips: true, onLoadOlderTrips: jest.fn() });
    expect(view.getByText("Older trips are still on the server")).toBeTruthy();
    expect(view.queryByText("No Active Transactions")).toBeNull();
    expect(view.queryByText("Select any trips to include on the invoice.")).toBeNull();
  });

  it("shows the finished empty state only when there is no further page", () => {
    const view = sheet({ hasOlderTrips: false });
    expect(view.getByText("No Active Transactions")).toBeTruthy();
    expect(view.getByText("Select any trips to include on the invoice.")).toBeTruthy();
    expect(view.queryByText("Load older trips")).toBeNull();
  });

  it("asks for the next page from the trip sheet", () => {
    const onLoadOlderTrips = jest.fn();
    const view = sheet({ hasOlderTrips: true, onLoadOlderTrips });
    fireEvent.press(view.getByText("Load older trips"));
    expect(onLoadOlderTrips).toHaveBeenCalledTimes(1);
  });
});

describe("invoice execute screen load gates", () => {
  beforeEach(() => {
    mockTripsQuery.isLoading = false;
    mockTripsQuery.isError = false;
    mockTripsQuery.error = null;
    mockTripsQuery.hasNextPage = false;
  });

  function renderScreen() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <InvoicingExecuteScreen />
      </QueryClientProvider>,
    );
  }

  it("shows a loading state instead of an empty trip list", () => {
    mockTripsQuery.isLoading = true;
    const view = renderScreen();
    expect(view.getByText("Syncing with Supabase...")).toBeTruthy();
    expect(view.queryByText("No Active Transactions")).toBeNull();
  });

  it("shows the load error instead of an empty trip list", () => {
    mockTripsQuery.isError = true;
    mockTripsQuery.error = new Error("trips unavailable");
    const view = renderScreen();
    expect(view.getByText("Could not load data")).toBeTruthy();
    expect(view.getByText("trips unavailable")).toBeTruthy();
    expect(view.queryByText("No Active Transactions")).toBeNull();
    expect(view.queryByText("Older trips are still on the server")).toBeNull();
  });
});
