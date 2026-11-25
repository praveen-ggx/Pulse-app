const mockRequests: Array<{ ids: string[]; release: (failed: boolean) => void }> = [];
let mockActive = 0;
let mockMaxActive = 0;

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: () => {
      const builder: {
        select: () => typeof builder;
        in: (_column: string, ids: string[]) => Promise<{ data: unknown[]; error: { message: string } | null }>;
      } = {
        select: () => builder,
        in: (_column, ids) => {
          mockActive += 1;
          mockMaxActive = Math.max(mockMaxActive, mockActive);
          return new Promise((resolve) => {
            mockRequests.push({
              ids,
              release: (failed) => {
                mockActive -= 1;
                resolve(failed ? { data: null, error: { message: "statement timeout" } } : { data: [], error: null });
              },
            });
          });
        },
      };
      return builder;
    },
  }),
}));

import { fetchComplianceTripFlags } from "@/features/tripCompliance/services/tripComplianceRead.service";
import { READ_ALL_ID_CHUNK } from "@/lib/pagination";

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
}

beforeEach(() => {
  mockRequests.length = 0;
  mockActive = 0;
  mockMaxActive = 0;
});

describe("fetchComplianceTripFlags concurrency", () => {
  it("reads more than 100 ids in chunks of 100 with at most four requests at once", async () => {
    const tripIds = [...ids(READ_ALL_ID_CHUNK * 4 + 1), ids(1)[0]];
    const pending = fetchComplianceTripFlags(tripIds);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockActive).toBe(4);
    expect(mockMaxActive).toBe(4);
    expect(Math.max(...mockRequests.map((request) => request.ids.length))).toBeLessThanOrEqual(READ_ALL_ID_CHUNK);

    const seen = new Set<string>();
    for (let guard = 0; guard < 12 && (mockRequests.length > 0 || mockActive > 0); guard += 1) {
      const batch = mockRequests.splice(0, mockRequests.length);
      for (const request of batch) {
        for (const id of request.ids) {
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
        request.release(false);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await pending;

    expect(mockMaxActive).toBe(4);
    expect(seen.size).toBe(new Set(tripIds).size);
  });

  it("fails the whole read when one chunk fails", async () => {
    const pending = fetchComplianceTripFlags(ids(READ_ALL_ID_CHUNK + 1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockRequests).toHaveLength(2);
    mockRequests[0].release(true);
    mockRequests[1].release(false);
    await expect(pending).rejects.toThrow(/timeout/);
  });
});
