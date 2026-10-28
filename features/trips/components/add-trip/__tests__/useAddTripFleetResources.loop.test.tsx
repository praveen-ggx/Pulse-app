/**
 * Guards Create Trip update-depth / supplier-fetch storms after client pick.
 * Several cases fail if the no-op array cleanup or supplier de-dupe is reverted.
 */
import { renderHook, act, waitFor } from "@testing-library/react-native";

const mockGetSuppliersByOrganization = jest.fn(async () => ({
  error: null as Error | null,
  suppliers: [] as { id: string; name?: string }[],
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
    mockGetSuppliersByOrganization.mockReset();
    mockGetSuppliersByOrganization.mockResolvedValue({ error: null, suppliers: [] });
  });

  it("stays under a render budget when empty-phone cleanup re-runs with fresh setter identities", async () => {
    // Reproducing the old crash: parent remount / new setters object each render
    // used to call setDriverPhoneMatches([]) every tick → Maximum update depth.
    let renders = 0;
    const { rerender } = renderHook(() => {
      renders += 1;
      const form = useAddTripForm({ initialSupplySource: "asset" });
      const unstableSetters = { ...form.setters };
      useAddTripFleetResources("org-1", form.state, unstableSetters);
      return form;
    });

    await act(async () => {
      for (let i = 0; i < 12; i += 1) {
        rerender();
        await Promise.resolve();
      }
    });

    expect(renders).toBeLessThan(40);
  });

  it("does not loop when aggregate phone is short / empty", async () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      const form = useAddTripForm({ initialSupplySource: "aggregate" });
      const fleet = useAddTripFleetResources("org-1", form.state, form.setters);
      return { form, fleet };
    });

    await waitFor(() => {
      expect(result.current.fleet.suppliersLoading).toBe(false);
    });

    const before = renders;
    await act(async () => {
      result.current.form.setters.setDriverPhone("98");
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renders - before).toBeLessThan(15);
    expect(result.current.form.state.driverPhoneConfirmed).toBe(false);
    expect(result.current.form.state.driverPhoneName).toBeNull();
  });

  it("fetches suppliers once on aggregate mount (focus + effect share one in-flight request)", async () => {
    renderHook(() => {
      const form = useAddTripForm({ initialSupplySource: "aggregate" });
      return useAddTripFleetResources("org-1", form.state, form.setters);
    });

    await waitFor(() => {
      expect(mockGetSuppliersByOrganization).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetSuppliersByOrganization.mock.calls.length).toBe(1);
    expect(mockGetSuppliersByOrganization).toHaveBeenCalledWith("org-1");
  });

  it("does not fetch suppliers on focus for asset-only supply", async () => {
    renderHook(() => {
      const form = useAddTripForm({ initialSupplySource: "asset" });
      return useAddTripFleetResources("org-1", form.state, form.setters);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetSuppliersByOrganization).not.toHaveBeenCalled();
  });

  it("ignores a late supplier response from a previous org", async () => {
    let resolveA: ((value: { error: null; suppliers: { id: string }[] }) => void) | null = null;
    mockGetSuppliersByOrganization.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve;
        }),
    );
    mockGetSuppliersByOrganization.mockResolvedValueOnce({
      error: null,
      suppliers: [{ id: "b-supplier" }],
    });

    const { result, rerender } = renderHook(
      ({ orgId }: { orgId: string }) => {
        const form = useAddTripForm({ initialSupplySource: "aggregate" });
        const fleet = useAddTripFleetResources(orgId, form.state, form.setters);
        return fleet;
      },
      { initialProps: { orgId: "org-a" } },
    );

    await waitFor(() => {
      expect(mockGetSuppliersByOrganization).toHaveBeenCalledWith("org-a");
    });

    rerender({ orgId: "org-b" });
    await waitFor(() => {
      expect(mockGetSuppliersByOrganization).toHaveBeenCalledWith("org-b");
    });
    await waitFor(() => {
      expect(result.current.suppliers).toEqual([{ id: "b-supplier" }]);
    });

    await act(async () => {
      resolveA?.({ error: null, suppliers: [{ id: "a-supplier" }] });
      await Promise.resolve();
    });

    expect(result.current.suppliers).toEqual([{ id: "b-supplier" }]);
  });

  it("retries supplier fetch after a failed load (failed org is not cached)", async () => {
    mockGetSuppliersByOrganization
      .mockResolvedValueOnce({ error: new Error("network"), suppliers: [] })
      .mockResolvedValueOnce({ error: null, suppliers: [{ id: "s1" }] });

    const { result, rerender } = renderHook(() => {
      const form = useAddTripForm({ initialSupplySource: "aggregate" });
      const fleet = useAddTripFleetResources("org-1", form.state, form.setters);
      return { form, fleet };
    });

    await waitFor(() => {
      expect(mockGetSuppliersByOrganization).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(result.current.fleet.suppliersLoading).toBe(false);
    });

    await act(async () => {
      result.current.form.setters.setSupplySource("asset");
    });
    await act(async () => {
      result.current.form.setters.setSupplySource("aggregate");
    });
    rerender();

    await waitFor(() => {
      expect(mockGetSuppliersByOrganization.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    await waitFor(() => {
      expect(result.current.fleet.suppliers).toEqual([{ id: "s1" }]);
    });
  });
});
