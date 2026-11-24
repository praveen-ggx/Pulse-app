/**
 * "Assignment updated" popup on Trip Detail. It must show once for the trip
 * that was just updated and close on Done. A cached copy of the paint used to
 * keep `confirm: true` for 30 minutes, so after updating a second trip the first
 * trip's page showed the popup again and Done could not close it.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import React from "react";

import { useAssignmentPaint } from "@/features/trips/hooks/useAssignmentPaint";
import { patchAssignmentCaches } from "@/features/trips/utils/assignmentCachePatch.util";
import {
  dismissAssignmentConfirm,
  publishAssignmentPaint,
} from "@/features/trips/utils/assignmentPaint.util";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

function updateAssignment(qc: QueryClient, tripId: string, driverName: string, vehicleLabel: string) {
  // What TripAssignmentBlock does after a driver / truck update.
  patchAssignmentCaches(qc, {
    organizationId: "org-1",
    tripId,
    patch: { driverDisplayName: driverName, vehicleDisplayNumber: vehicleLabel, focus: "driver" },
  });
  publishAssignmentPaint({ tripId, driverName, vehicleLabel, focus: "driver", confirm: true });
}

describe("useAssignmentPaint — Assignment updated popup", () => {
  it("shows for the updated trip and closes on Done", () => {
    const { qc, wrapper } = setup();
    updateAssignment(qc, "trip-a", "AABID", "NL01N7439");

    const hook = renderHook(() => useAssignmentPaint("trip-a"), { wrapper });
    expect(hook.result.current?.confirm).toBe(true);
    expect(hook.result.current?.driverName).toBe("AABID");

    act(() => dismissAssignmentConfirm());
    expect(hook.result.current?.confirm).toBe(false);
    expect(hook.result.current?.driverName).toBe("AABID");
  });

  it("does not bring the popup back on trip A after another trip was updated", () => {
    const { qc, wrapper } = setup();
    updateAssignment(qc, "trip-a", "AABID", "NL01N7439");
    const first = renderHook(() => useAssignmentPaint("trip-a"), { wrapper });
    act(() => dismissAssignmentConfirm());
    first.unmount();

    // Ops update the next trip, then reopen trip A.
    updateAssignment(qc, "trip-b", "RAVI", "TN09AB1234");
    const reopened = renderHook(() => useAssignmentPaint("trip-a"), { wrapper });

    expect(reopened.result.current?.confirm).toBeFalsy();
    // The painted names still show, so the page is not stale.
    expect(reopened.result.current?.driverName).toBe("AABID");
    expect(reopened.result.current?.vehicleLabel).toBe("NL01N7439");
  });

  it("does not show trip A's popup when its page is opened while trip B is the latest update", () => {
    const { qc, wrapper } = setup();
    updateAssignment(qc, "trip-a", "AABID", "NL01N7439");
    updateAssignment(qc, "trip-b", "RAVI", "TN09AB1234");

    const hook = renderHook(() => useAssignmentPaint("trip-a"), { wrapper });
    expect(hook.result.current?.confirm).toBeFalsy();

    const other = renderHook(() => useAssignmentPaint("trip-b"), { wrapper });
    expect(other.result.current?.confirm).toBe(true);
    act(() => dismissAssignmentConfirm());
    expect(other.result.current?.confirm).toBe(false);
  });
});
