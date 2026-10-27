/**
 * fetchTripDocumentsForTrips must return every trip_documents row, not the first
 * 1000. Prod (2026-10-27): 391 Compliance trips → 1445 rows, one unpaged request
 * got 1000 (HTTP 206) and 103 trips showed no documents.
 */
import { createFakePostgrest, fakeUuid, shuffled, type FakeRow } from "@/lib/__tests__/fakePostgrest";

const mockServer = createFakePostgrest();
jest.mock("@/lib/supabase", () => ({ supabase: () => mockServer.client }));

import { fetchTripDocumentsForTrips } from "@/features/tripCompliance/services/tripComplianceRead.service";
import { READ_ALL_ID_CHUNK } from "@/lib/pagination";

const TYPES = ["lr", "eway_bill", "invoice", "memo", "pod"];

/** `perTrip[i]` documents for trip i; doc ids interleave across trips. */
function seed(perTrip: number[]): string[] {
  const tripIds = perTrip.map((_, i) => fakeUuid(i, 1));
  const rows: FakeRow[] = [];
  let n = 0;
  perTrip.forEach((count, i) => {
    for (let d = 0; d < count; d += 1) {
      rows.push({
        id: fakeUuid((n * 7919) % 1_000_003, 2),
        trip_id: tripIds[i],
        document_type: TYPES[d % TYPES.length],
        file_name: `${n}.pdf`,
        storage_path: `${tripIds[i]}/${TYPES[d % TYPES.length]}/${n}.pdf`,
        uploaded_at: "2026-10-27T00:00:00Z",
        status: "verified",
      });
      n += 1;
    }
  });
  mockServer.tables.trip_documents = shuffled(rows);
  return tripIds;
}

const total = (map: Map<string, unknown[]>) => Array.from(map.values()).reduce((s, l) => s + l.length, 0);

beforeEach(() => {
  mockServer.requests.length = 0;
  mockServer.state.beforeResponse = null;
  mockServer.state.failRequest = null;
  mockServer.tables.trip_documents = [];
});

describe("fetchTripDocumentsForTrips (keyset + id chunks)", () => {
  it("reproduces the prod shape: 391 trips, 1445 rows — every row, mapped to its trip", async () => {
    const perTrip = Array.from({ length: 391 }, (_, i) => (i < 337 ? (i < 97 ? 5 : 4) : 0));
    perTrip[0] += 1445 - perTrip.reduce((a, b) => a + b, 0);
    const ids = seed(perTrip);

    const byTrip = await fetchTripDocumentsForTrips(ids);
    expect(total(byTrip)).toBe(1445);
    perTrip.forEach((count, i) => expect(byTrip.get(ids[i])?.length ?? 0).toBe(count));
    for (const [tripId, docs] of byTrip) expect(docs.every((d) => d.trip_id === tripId)).toBe(true);
    const docIds = Array.from(byTrip.values()).flat().map((d) => d.id);
    expect(new Set(docIds).size).toBe(1445);
    expect(mockServer.requests.every((r) => (r.inSizes.trip_id ?? 0) <= READ_ALL_ID_CHUNK)).toBe(true);
  });

  it("one chunk with more than the 1000-row server cap is fully paged", async () => {
    const ids = seed([1200, 900, 3]);
    const byTrip = await fetchTripDocumentsForTrips(ids);
    expect(byTrip.get(ids[0])).toHaveLength(1200);
    expect(byTrip.get(ids[1])).toHaveLength(900);
    expect(byTrip.get(ids[2])).toHaveLength(3);
  });

  it("trips with no documents are absent, not errors", async () => {
    const ids = seed([0, 2, 0]);
    const byTrip = await fetchTripDocumentsForTrips(ids);
    expect(byTrip.has(ids[0])).toBe(false);
    expect(byTrip.get(ids[1])).toHaveLength(2);
  });

  it("fails the whole read when any page errors — never a partial set", async () => {
    const ids = seed(Array.from({ length: 250 }, () => 4));
    mockServer.state.failRequest = (_req, n) => n === 2;
    await expect(fetchTripDocumentsForTrips(ids)).rejects.toThrow("fake page failure");
  });

  it("issues no request for an empty or blank id list", async () => {
    expect((await fetchTripDocumentsForTrips([])).size).toBe(0);
    expect((await fetchTripDocumentsForTrips([""])).size).toBe(0);
    expect(mockServer.requests).toHaveLength(0);
  });
});
