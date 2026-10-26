jest.mock("react-native", () => jest.requireActual("react-native"));

jest.mock("@expo/vector-icons/Feather", () => "Feather");

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LogHardCopyPodModal } from "@/features/trips/components/trip-detail/LogHardCopyPodModal";
import {
  fetchTripHardCopyPodState,
  loadLrPodIndexByTripIds,
  logTripHardCopyPodCourier,
} from "@/features/trips/services/tripDocumentLrPod.service";

jest.mock("@/features/trips/components/trip-detail/HardCopyPodPhotoUpload", () => {
  const { useEffect } = require("react");
  return {
    HardCopyPodPhotoUpload: ({
      onUploadedChange,
    }: {
      onUploadedChange?: (uploaded: boolean) => void;
    }) => {
      useEffect(() => {
        onUploadedChange?.(true);
      }, [onUploadedChange]);
      return null;
    },
  };
});

jest.mock("lucide-react-native", () => ({
  Calendar: () => null,
  Clock: () => null,
}));

jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");

jest.mock("react-native-calendars", () => ({
  Calendar: () => null,
}));

jest.mock("@/features/trips/services/tripDocumentLrPod.service", () => {
  const actual = jest.requireActual("@/features/trips/services/tripDocumentLrPod.service");
  return {
    ...actual,
    fetchTripHardCopyPodState: jest.fn(),
    loadLrPodIndexByTripIds: jest.fn(),
    logTripHardCopyPodCourier: jest.fn(),
  };
});

const fetchState = fetchTripHardCopyPodState as jest.MockedFunction<typeof fetchTripHardCopyPodState>;
const loadLrs = loadLrPodIndexByTripIds as jest.MockedFunction<typeof loadLrPodIndexByTripIds>;
const logCourier = logTripHardCopyPodCourier as jest.MockedFunction<typeof logTripHardCopyPodCourier>;

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(
    <LogHardCopyPodModal
      visible
      inline
      canManage
      tripId="trip-1"
      onClose={jest.fn()}
      summary={{
        manifestId: "M1",
        clientName: "Client",
        pickup: "A",
        delivery: "B",
        driverName: "Driver",
        vehicleLabel: "Truck",
      }}
    />,
    { wrapper },
  );
}

describe("LogHardCopyPodModal dispatch date", () => {
  beforeEach(() => {
    fetchState.mockReset();
    logCourier.mockReset();
    loadLrs.mockReset();
    loadLrs.mockResolvedValue(new Map());
    fetchState.mockResolvedValue({
      error: null,
      state: {
        status: "IN_TRANSIT",
        receiptMethod: "courier",
        receivedAt: null,
        receivedBy: null,
        courier: "DHL",
        awbNumber: "AWB99",
        dispatchDate: null,
        expectedDeliveryDate: "2026-09-25",
        courierContact: null,
        remarks: null,
        receivedDate: null,
        receivedTime: null,
        actorId: null,
        ibond: false,
        ibondDeductibleCost: null,
        ibondVendorCostBefore: null,
        ibondVendorCostAfter: null,
      },
    });
  });

  it("blocks save when the dispatch date is absent", async () => {
    const screen = renderModal();
    await screen.findByText("Upload the hard-copy POD");
    fireEvent.press(screen.getByText("Next"));
    fireEvent.press(screen.getByText("Next"));
    await screen.findByText("DHL");
    fireEvent.press(screen.getByText("Save"));
    expect(await screen.findByText("Dispatch date is required.")).toBeTruthy();
    expect(logCourier).not.toHaveBeenCalled();
  });
});
