import { createFakePostgrest, fakeUuid } from "@/lib/__tests__/fakePostgrest";

const mockServer = createFakePostgrest();
jest.mock("@/lib/supabase", () => ({ supabase: () => mockServer.client }));

import {
  fetchComplianceTransactions,
  fetchComplianceTripFlags,
  fetchHardCopyReceivedLrNumbers,
  fetchPodChargeWorkflowFlags,
} from "@/features/tripCompliance/services/tripComplianceRead.service";
import { fetchHardCopyIbondTripIds } from "@/features/trips/services/tripDocumentLrPod.service";
import { READ_ALL_ID_CHUNK } from "@/lib/pagination";

const tripIds = Array.from({ length: 250 }, (_, i) => fakeUuid(i, 7));

beforeEach(() => {
  mockServer.requests.length = 0;
});

describe("compliance pipeline id filters", () => {
  it("splits a large trip id list so no .in() filter can 400 on URL length", async () => {
    await fetchComplianceTripFlags(tripIds);
    await fetchHardCopyReceivedLrNumbers(tripIds);
    await fetchPodChargeWorkflowFlags(tripIds);
    await fetchComplianceTransactions(tripIds);
    await fetchHardCopyIbondTripIds(tripIds);

    const idFilters = mockServer.requests.flatMap((req) =>
      (["id", "trip_id"] as const).filter((col) => req.inSizes[col] != null).map((col) => req.inSizes[col]),
    );
    expect(idFilters.length).toBeGreaterThan(0);
    expect(Math.max(...idFilters)).toBeLessThanOrEqual(READ_ALL_ID_CHUNK);
    expect(idFilters.reduce((sum, n) => sum + n, 0)).toBe(tripIds.length * 5);
  });
});
