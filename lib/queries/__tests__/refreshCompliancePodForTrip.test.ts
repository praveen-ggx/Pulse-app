/**
 * A realtime POD-column change used to invalidate all of ["q","tripCompliance"],
 * so every open Compliance pipeline re-read documents, flags and ledger inputs
 * for every pipeline trip. Now only the changed trip's POD record is read and
 * patched into the pipeline; other Compliance views still refetch.
 */
import { QueryClient } from "@tanstack/react-query";
import { refreshCompliancePodForTrip } from "../invalidateHardCopyPodCaches";

const mockFetchState = jest.fn();
jest.mock("@/features/trips/services/tripDocumentLrPod.service", () => ({
  fetchTripHardCopyPodState: (...args: unknown[]) => mockFetchState(...args),
}));

const PIPELINE = ["q", "tripCompliance", "pipeline", "v2", "org-1"];
const DETAIL = ["q", "tripCompliance", "detail", "v1", "org-1", "trip-1"];
const LIST = ["q", "tripCompliance", "list", "vault-v2", "org-1", 0];

function seed() {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  qc.setQueryData(PIPELINE, [
    { trip: { id: "trip-1", pod_received_at: null }, hardCopyPod: { received: false, courier: null } },
    { trip: { id: "trip-2", pod_received_at: null }, hardCopyPod: { received: false, courier: null } },
  ]);
  qc.setQueryData(DETAIL, { ok: true });
  qc.setQueryData(LIST, []);
  return qc;
}

const isInvalidated = (qc: QueryClient, key: unknown[]) =>
  qc.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated ?? false;

beforeEach(() => mockFetchState.mockReset());

test("patches the changed trip into the pipeline without invalidating it", async () => {
  mockFetchState.mockResolvedValue({
    error: null,
    state: {
      status: "IN_TRANSIT",
      receivedAt: null,
      courier: "DTDC",
      awbNumber: "AWB1",
      receivedBy: null,
      ibond: false,
    },
  });
  const qc = seed();
  const before = qc.getQueryData<Array<Record<string, unknown>>>(PIPELINE)!;
  await refreshCompliancePodForTrip(qc, "trip-1");

  expect(mockFetchState).toHaveBeenCalledWith("trip-1");
  expect(isInvalidated(qc, PIPELINE)).toBe(false);
  const after = qc.getQueryData<Array<Record<string, unknown>>>(PIPELINE)!;
  expect((after[0].hardCopyPod as { courier: string }).courier).toBe("DTDC");
  expect(after[1]).toBe(before[1]);
  expect(isInvalidated(qc, DETAIL)).toBe(true);
  expect(isInvalidated(qc, LIST)).toBe(true);
});

test("falls back to refetching the pipeline when the POD read fails", async () => {
  mockFetchState.mockResolvedValue({ error: new Error("timeout"), state: null });
  const qc = seed();
  await refreshCompliancePodForTrip(qc, "trip-1");
  expect(isInvalidated(qc, PIPELINE)).toBe(true);
});
