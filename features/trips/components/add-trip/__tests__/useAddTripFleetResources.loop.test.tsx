/**
 * Guards the empty-phone / non-aggregate cleanup path that previously called
 * setState([]) and phone setters every effect tick → Maximum update depth and
 * a supplier-fetch storm after remounts.
 */
import { renderHook, act, waitFor } from "@testing-library/react-native";

const mockGetSuppliersByOrganization = jest.fn(async () => ({
  error: null,
  suppliers: [],
}));

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn" }),
}));

jest.mock("@/features/drivers/services/drivers.service", () => ({
  getDriversByOrganization: jest.fn(async () => ({ error: null, drivers: [] })),
}));

jest.mock("@/features/vehicles/services/vehicles.service", () => ({
  getVehiclesByOrganization: jest.fn(async () => ({ error: null, vehicles: [] })),
}));

jest.mock("@/features/trips/services/trips.service", () => ({
  getTripsByOrganization: jest.fn(async () => ({ error: null, trips: [] })),
  getDriverAvailabilityByPhoneGlobal: jest.fn(),
}));

jest.mock("@/features/suppliers/services/suppliers.service", () => ({
  getSuppliersByOrganization: (...args: unknown[]) =>
    mockGetSuppliersByOrganization(...args),
}));

jest.mock("@/features/marketplace/utils/marketplaceParty.util", () => ({
  manuallySelectableSuppliers: (rows: unknown[]) => rows,
}));

jest.mock("@/features/trips/utils/driverPhoneLookup.util", () => ({
  lookupDriversByPhoneVariants: jest.fn(),
  normalizeIndianMobileLast10: (v: string) => v.replace(/\D/g, "").slice(-10),
  enrichDriverMatchesWithFleetAvatars: (m: unknown) => m,
}));

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === "function" ? cleanup : undefined;
      }, [cb]);
    },
  };
});

import { useAddTripForm } from "../useAddTripForm";
import { useAddTripFleetResources } from "../useAddTripFleetResources";

describe("useAddTripFleetResources update-depth guards", () => {
  beforeEach(() => {
    mockGetSuppliersByOrganization.mockClear();
  });

  it("does not enter an infinite update loop on asset supply with empty phone", async () => {
    const { result } = renderHook(() => {
      const form = useAddTripForm({ initialSupplySource: "asset" });
      const fleet = useAddTripFleetResources("org-1", form.state, form.setters);
      return { form, fleet };
    });

    await waitFor(() => {
      expect(result.current.fleet.fleetLoading).toBe(false);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.form.state.supplySource).toBe("asset");
    expect(result.current.form.state.driverPhoneName).toBeNull();
  });

  it("does not loop when aggregate phone is short / empty", async () => {
    const { result } = renderHook(() => {
      const form = useAddTripForm({ initialSupplySource: "aggregate" });
      const fleet = useAddTripFleetResources("org-1", form.state, form.setters);
      return { form, fleet };
    });

    await waitFor(() => {
      expect(result.current.fleet.suppliersLoading).toBe(false);
    });

    await act(async () => {
      result.current.form.setters.setDriverPhone("98");
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.form.state.driverPhoneConfirmed).toBe(false);
    expect(result.current.form.state.driverPhoneName).toBeNull();
  });

  it("fetches suppliers once per org for aggregate until focus clears the de-dupe", async () => {
    const { result, rerender } = renderHook(() => {
      const form = useAddTripForm({ initialSupplySource: "aggregate" });
      const fleet = useAddTripFleetResources("org-1", form.state, form.setters);
      return { form, fleet };
    });

    await waitFor(() => {
      expect(mockGetSuppliersByOrganization.mock.calls.length).toBeGreaterThan(0);
    });
    const afterFirst = mockGetSuppliersByOrganization.mock.calls.length;

    rerender();
    rerender();
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetSuppliersByOrganization.mock.calls.length).toBe(afterFirst);
    expect(result.current.fleet.suppliers).toEqual([]);
  });
});
