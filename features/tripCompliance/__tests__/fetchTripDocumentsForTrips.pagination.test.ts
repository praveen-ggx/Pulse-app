import { createFakePostgrest, fakeUuid, shuffled, type FakeRow } from "@/lib/__tests__/fakePostgrest";

const mockServer = createFakePostgrest();
jest.mock("@/lib/supabase", () => ({ supabase: () => mockServer.client }));

import { fetchTripDocumentsForTrips } from "@/features/tripCompliance/services/tripComplianceRead.service";
import { READ_ALL_ID_CHUNK } from "@/lib/pagination";

function doc(n: number, tripId: string, over: Partial<FakeRow> = {}): FakeRow {
  return {
    id: fakeUuid(n, 5),
    trip_id: tripId,
    document_type: ["lr", "invoice", "eway_bill"][n % 3],
    file_name: `${n}.pdf`,
    storage_path: `${tripId}/${n}.pdf`,
    uploaded_at: "2026-10-01T00:00:00.000Z",
    status: "pending",
    ...over,
  };
}

beforeEach(() => {
  mockServer.requests.length = 0;
  mockServer.tables.trip_documents = [];
});

describe("fetchTripDocumentsForTrips pagination", () => {
  it("returns every document across more than 1000 rows and chunks trip ids", async () => {
    const tripIds = Array.from({ length: 250 }, (_, i) => fakeUuid(i, 6));
    const rows = tripIds.flatMap((tripId, i) => [doc(i * 2, tripId), doc(i * 2 + 1, tripId)]);
    mockServer.tables.trip_documents = shuffled(rows);

    const byTrip = await fetchTripDocumentsForTrips(tripIds);

    expect([...byTrip.values()].reduce((n, list) => n + list.length, 0)).toBe(500);
    expect(byTrip.size).toBe(250);
    for (const req of mockServer.requests) {
      expect(req.inSizes.trip_id ?? 0).toBeLessThanOrEqual(READ_ALL_ID_CHUNK);
    }
  });

  it("pages a single trip that has more than 1000 documents", async () => {
    const tripId = fakeUuid(1, 6);
    mockServer.tables.trip_documents = shuffled(Array.from({ length: 1205 }, (_, n) => doc(n, tripId)));
    const byTrip = await fetchTripDocumentsForTrips([tripId]);
    expect(byTrip.get(tripId)).toHaveLength(1205);
  });
});
