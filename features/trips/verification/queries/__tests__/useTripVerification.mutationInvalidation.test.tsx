import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useSaveTripVerification } from "../useTripVerification";
import { queryKeys } from "@/lib/queryKeys";

jest.mock("@/contexts/NetworkContext", () => ({
  useIsOnline: () => true,
}));
jest.mock("@/features/trips/services/tripDocuments.service", () => ({
  getDocumentsByTripId: jest.fn(),
}));
jest.mock("@/features/trips/services/trips.service", () => ({
  getAccessibleTripById: jest.fn(),
}));
jest.mock("../../verification.service", () => ({
  saveTripVerification: jest.fn(async () => ({ error: null })),
  saveTripVerificationBoth: jest.fn(),
}));
jest.mock("../../uploads/odometerUploads", () => ({
  uploadVerificationPhoto: jest.fn(),
}));
jest.mock("../../offline/outbox", () => ({
  enqueueVerificationMetadata: jest.fn(),
  enqueueVerificationPhoto: jest.fn(),
}));
jest.mock("@/features/ocr/services/ocrJob.service", () => ({
  linkTripDocumentOcrJob: jest.fn(),
}));

describe("F3 mutation-driven verification invalidation", () => {
  it("invalidates verification queries after a successful odometer save", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
    });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSaveTripVerification(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        tripId: "trip-1",
        side: "start",
        odometerKm: 12,
        updatedBy: "user-1",
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalled();
    });

    const keys = invalidateSpy.mock.calls.map((call) =>
      JSON.stringify(call[0]?.queryKey),
    );
    expect(keys).toContain(JSON.stringify(queryKeys.trips.verification("trip-1")));
    expect(keys).toContain(JSON.stringify(queryKeys.trips.detail("trip-1")));
  });
});
