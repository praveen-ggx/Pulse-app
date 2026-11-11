import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LogIncomingPodsModal } from "@/features/log-pods/components/LogIncomingPodsModal";
import type { LogPodsTripView } from "@/features/log-pods/services/logPods.service";

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/contexts/OrganizationContext", () => ({
  useOrganization: () => ({ currentOrganization: { id: "org-1" }, isLoading: false }),
}));

const mockFetchTrips = jest.fn();

jest.mock("@/features/log-pods/services/logPods.service", () => ({
  fetchTripsForLogPods: (...args: unknown[]) => mockFetchTrips(...args),
  fetchOrgSuppliersForLogPods: async () => ({
    error: null,
    suppliers: [{ id: "s1", name: "Acme" }],
  }),
  fetchOrgDriversForLogPods: async () => ({ error: null, drivers: [] }),
  fetchCourierPartners: async () => ({ error: null, partners: [] }),
  ensureCustomCourierPartner: jest.fn(),
  executeLogIncomingPods: jest.fn(),
  markSelectedTripsHardCopyPodReceived: jest.fn(),
}));

function view(id: string, received: boolean, status = "completed"): LogPodsTripView {
  return {
    id,
    internal_id: id,
    client: "Client",
    supplier_id: "s1",
    supplier_name: "Acme",
    driver_id: "d1",
    driver_name: "Driver",
    lane: "market",
    from: "A",
    to: "B",
    amount: 10,
    status,
    lrNumbers: [],
    receivedLRs: [],
    date: "11 Nov 2026",
    hardCopyReceived: received,
  };
}

function renderModal() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LogIncomingPodsModal visible onClose={jest.fn()} />
    </QueryClientProvider>,
  );
}

describe("POD modal pagination", () => {
  beforeEach(() => {
    mockFetchTrips.mockReset();
  });

  it("keeps pending and received trips on their tabs without duplicating them", async () => {
    mockFetchTrips.mockResolvedValue({
      error: null,
      trips: [view("PENDING-1", false), view("RECEIVED-1", true)],
      nextCursor: null,
    });
    const screen = renderModal();
    fireEvent.press(await screen.findByText("Acme"));
    expect(await screen.findByText("PENDING-1")).toBeTruthy();
    expect(screen.queryByText("RECEIVED-1")).toBeNull();
    expect(screen.queryAllByText("PENDING-1")).toHaveLength(1);

    fireEvent.press(screen.getByLabelText("All, 2"));
    expect(screen.getByText("PENDING-1")).toBeTruthy();
    expect(screen.getByText("RECEIVED-1")).toBeTruthy();
    expect(screen.queryAllByText("PENDING-1")).toHaveLength(1);
    expect(screen.queryAllByText("RECEIVED-1")).toHaveLength(1);
  });

  it("stops automatic loading at 20 pages and still offers the next page", async () => {
    let call = 0;
    mockFetchTrips.mockImplementation(async () => {
      call += 1;
      const pending = call === 22;
      return {
        error: null,
        trips: [view(pending ? "PENDING-LATE" : `RECEIVED-${call}`, !pending)],
        nextCursor: call >= 22 ? null : { createdAt: `2026-11-11T08:00:${String(call).padStart(2, "0")}.000Z`, id: `id-${call}` },
      };
    });
    const screen = renderModal();
    fireEvent.press(await screen.findByText("Acme"));
    await waitFor(() => expect(mockFetchTrips.mock.calls.length).toBeGreaterThanOrEqual(21));
    expect(screen.queryByText("PENDING-LATE")).toBeNull();
    expect(screen.getByText("Load older trips")).toBeTruthy();
    expect(screen.queryByText("Everything from this party is already marked received.")).toBeNull();
    const callsAtCap = mockFetchTrips.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockFetchTrips.mock.calls.length).toBe(callsAtCap);

    fireEvent.press(screen.getByText("Load older trips"));
    expect(await screen.findByText("PENDING-LATE")).toBeTruthy();
  });

  it("does not keep requesting pages after a load failure", async () => {
    mockFetchTrips.mockResolvedValue({
      error: new Error("pod page failed"),
      trips: [],
      nextCursor: null,
    });
    const screen = renderModal();
    expect(await screen.findByText("Could not load")).toBeTruthy();
    expect(screen.getByText("pod page failed")).toBeTruthy();
    expect(screen.queryByText("No pending PODs")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(mockFetchTrips).toHaveBeenCalledTimes(1);
  });
});
