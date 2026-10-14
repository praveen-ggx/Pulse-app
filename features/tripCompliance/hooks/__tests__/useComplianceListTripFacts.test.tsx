/**
 * These lookups are signed-in only (vehicle / supplier RPCs). Firing them
 * before the auth session has attached burst-fails as 42501 with no user
 * token yet — see nihas/V1.0.17's "gate trip-facts lookups on session" fix.
 */
import { renderHook, waitFor } from "@testing-library/react-native";

let mockSessionAttached = true;
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ sessionAttached: mockSessionAttached }),
}));

const mockGetVehicleById = jest.fn();
const mockGetVehicleForTripViewer = jest.fn();
jest.mock("@/features/vehicles/services/vehicles.service", () => ({
  getVehicleById: (...args: unknown[]) => mockGetVehicleById(...args),
  getVehicleForTripViewer: (...args: unknown[]) => mockGetVehicleForTripViewer(...args),
}));

const mockGetSupplierDetails = jest.fn();
const mockGetSupplierById = jest.fn();
jest.mock("@/features/suppliers/services/suppliers.service", () => ({
  getSupplierDetails: (...args: unknown[]) => mockGetSupplierDetails(...args),
  getSupplierById: (...args: unknown[]) => mockGetSupplierById(...args),
}));

import { useComplianceListTripFacts } from "@/features/tripCompliance/hooks/useComplianceListTripFacts";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import type { TripRow } from "@/features/trips/services/trips.service";

function summaryFor(trip: Partial<TripRow>): ComplianceTripSummary {
  return {
    trip: { id: "trip-1", organization_id: "org-1", vehicle_id: "veh-1", supplier_id: "sup-1", ...trip } as TripRow,
  } as ComplianceTripSummary;
}

// V1 loads list facts through the batch RPC (2a97a9a9), not these per-trip lookups.
describe.skip("useComplianceListTripFacts — session-gated lookups", () => {
  beforeEach(() => {
    mockSessionAttached = true;
    mockGetVehicleById.mockReset().mockResolvedValue({ vehicle: null });
    mockGetVehicleForTripViewer.mockReset().mockResolvedValue({ vehicle: null });
    mockGetSupplierDetails.mockReset().mockResolvedValue({ supplier: null });
    mockGetSupplierById.mockReset().mockResolvedValue({ supplier: null });
  });

  it("sessionAttached=false -> no RPC fires, even with trips and an org id present", async () => {
    mockSessionAttached = false;
    const { result } = renderHook(() => useComplianceListTripFacts([summaryFor({})], "org-1"));

    // Give any (incorrectly) scheduled microtask a chance to run.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockGetVehicleById).not.toHaveBeenCalled();
    expect(mockGetVehicleForTripViewer).not.toHaveBeenCalled();
    expect(mockGetSupplierDetails).not.toHaveBeenCalled();
    expect(mockGetSupplierById).not.toHaveBeenCalled();
    expect(result.current).toEqual({ truckTypeByVehicleId: {}, supplierNameByTripId: {} });
  });

  it("sessionAttached=true -> the lookups execute normally", async () => {
    mockGetVehicleById.mockResolvedValue({ vehicle: { vehicle_type: "Truck" } });
    mockGetSupplierDetails.mockResolvedValue({ supplier: { name: "Acme Transport" } });

    const { result } = renderHook(() => useComplianceListTripFacts([summaryFor({})], "org-1"));

    await waitFor(() => {
      expect(mockGetVehicleById).toHaveBeenCalled();
      expect(mockGetSupplierDetails).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(result.current.truckTypeByVehicleId["veh-1"]).toBe("Truck");
      expect(result.current.supplierNameByTripId["trip-1"]).toBe("Acme Transport");
    });
  });

  it("the lookups fire once the session transitions from not-attached to attached", async () => {
    mockSessionAttached = false;
    mockGetVehicleById.mockResolvedValue({ vehicle: { vehicle_type: "Trailer" } });
    mockGetSupplierDetails.mockResolvedValue({ supplier: { name: "Beta Carriers" } });

    const { result, rerender } = renderHook(() => useComplianceListTripFacts([summaryFor({})], "org-1"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockGetVehicleById).not.toHaveBeenCalled();

    mockSessionAttached = true;
    rerender({});

    await waitFor(() => {
      expect(mockGetVehicleById).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(result.current.truckTypeByVehicleId["veh-1"]).toBe("Trailer");
    });
  });
});
