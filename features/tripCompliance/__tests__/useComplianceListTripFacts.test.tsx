/**
 * Hook-level request counts for Compliance list facts. Supabase is faked at
 * `rpc()` / `from()`, so every count is a real database call the screen makes.
 * Before the batch RPC, 300 trips issued ~450 vehicle + ~120 supplier calls.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import React from "react";

let mockSessionAttached = true;
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ sessionAttached: mockSessionAttached }),
}));

const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import { useComplianceListTripFacts } from "@/features/tripCompliance/hooks/useComplianceListTripFacts";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import type { TripRow } from "@/features/trips/services/trips.service";

function summaries(n: number): ComplianceTripSummary[] {
  return Array.from({ length: n }, (_, i) => ({
    trip: {
      id: `t${i}`,
      organization_id: "org-1",
      vehicle_id: `v${i % 7}`,
      supplier_id: i % 2 ? `s${i % 5}` : null,
      execution_type: i % 2 ? null : "ASSET",
    } as TripRow,
  })) as ComplianceTripSummary[];
}

function render(list: ComplianceTripSummary[], retry = 3) {
  // Default retry > 0 proves the hook itself opts out of retries.
  const qc = new QueryClient({ defaultOptions: { queries: { retry, retryDelay: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(({ items }) => useComplianceListTripFacts(items, "viewer-org"), {
    wrapper,
    initialProps: { items: list },
  });
}

beforeEach(() => {
  mockSessionAttached = true;
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockRpc.mockImplementation(async (_name: string, args: { p_trip_ids: string[] }) => ({
    data: args.p_trip_ids.map((id) => {
      const i = Number(id.slice(1));
      return { trip_id: id, vehicle_id: `v${i % 7}`, truck_type: "32 ft", supplier_name: i % 2 ? `Supplier ${i % 5}` : null };
    }),
    error: null,
  }));
});

it("300 trips → exactly one facts RPC, no per-trip vehicle/supplier calls", async () => {
  const hook = render(summaries(300));
  await waitFor(() => expect(Object.keys(hook.result.current.supplierNameByTripId)).toHaveLength(300));
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc.mock.calls[0][0]).toBe("get_compliance_list_trip_facts");
  expect(mockRpc.mock.calls[0][1].p_viewer_org_id).toBe("viewer-org");
  expect(mockRpc.mock.calls[0][1].p_trip_ids).toHaveLength(300);
  expect(mockFrom).not.toHaveBeenCalled();
  expect(hook.result.current.truckTypeByVehicleId.v3).toBe("32 ft");
  expect(hook.result.current.supplierNameByTripId.t0).toBe("Own fleet");
  expect(hook.result.current.supplierNameByTripId.t1).toBe("Supplier 1");
});

it("re-render with an equal trip set (new array) does not refetch", async () => {
  const hook = render(summaries(50));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
  hook.rerender({ items: summaries(50) });
  await waitFor(() => expect(Object.keys(hook.result.current.supplierNameByTripId)).toHaveLength(50));
  expect(mockRpc).toHaveBeenCalledTimes(1);
});

it("no call before the user session is attached", async () => {
  mockSessionAttached = false;
  const hook = render(summaries(10));
  await new Promise((r) => setTimeout(r, 20));
  expect(mockRpc).not.toHaveBeenCalled();
  expect(hook.result.current).toEqual({ truckTypeByVehicleId: {}, supplierNameByTripId: {} });
});

it("a failed batch is not retried", async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: "canceling statement due to statement timeout" } });
  render(summaries(10));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 50));
  expect(mockRpc).toHaveBeenCalledTimes(1);
});
