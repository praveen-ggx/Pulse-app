/**
 * Compliance documents come from list_trip_documents_for_trips when it is
 * deployed: every keyset page is followed, a real error fails the read (no
 * silent fallback, no partial set), and the RLS table read is used only when
 * the function does not exist.
 */
import { createFakePostgrest, fakeUuid, shuffled, type FakeRow } from "@/lib/__tests__/fakePostgrest";

const mockServer = createFakePostgrest();
jest.mock("@/lib/supabase", () => ({ supabase: () => mockServer.client }));

import { fetchTripDocumentsForTrips } from "@/features/tripCompliance/services/tripComplianceRead.service";

const rpcCalls: Array<Record<string, unknown>> = [];

function doc(n: number, tripId: string): FakeRow {
  return { id: fakeUuid(n, 5), trip_id: tripId, document_type: "lr", file_name: `${n}.pdf`,
    storage_path: `${tripId}/${n}.pdf`, uploaded_at: "2026-10-01T00:00:00.000Z", status: "pending" };
}

function serveBatchRpc(failOnCall = -1) {
  mockServer.state.rpc = (name, args) => {
    if (name !== "list_trip_documents_for_trips") return { data: null, error: { message: "unexpected", code: "PGRST202" } };
    rpcCalls.push(args);
    if (rpcCalls.length - 1 === failOnCall) return { data: null, error: { message: "canceling statement due to statement timeout", code: "57014" } };
    const ids = args.p_trip_ids as string[];
    const after = (args.p_after_id as string | null) ?? "";
    const limit = Math.min(Number(args.p_limit), 1000);
    const rows = (mockServer.tables.trip_documents ?? [])
      .filter((r) => ids.includes(String(r.trip_id)) && String(r.id) > after)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .slice(0, limit);
    return { data: rows, error: null };
  };
}

beforeEach(() => {
  rpcCalls.length = 0;
  mockServer.requests.length = 0;
  mockServer.tables.trip_documents = [];
});

describe("Compliance documents via list_trip_documents_for_trips", () => {
  it("follows every page of the function and never touches the table read", async () => {
    serveBatchRpc();
    const tripIds = Array.from({ length: 150 }, (_, i) => fakeUuid(i, 6));
    mockServer.tables.trip_documents = shuffled(tripIds.flatMap((t, i) => Array.from({ length: 9 }, (_, k) => doc(i * 9 + k, t))));
    const byTrip = await fetchTripDocumentsForTrips(tripIds);
    expect([...byTrip.values()].reduce((n, l) => n + l.length, 0)).toBe(1350);
    expect(byTrip.size).toBe(150);
    expect(mockServer.requests.filter((r) => r.table === "trip_documents")).toHaveLength(0);
    expect(rpcCalls.every((a) => (a.p_trip_ids as string[]).length <= 100)).toBe(true);
  });

  it("fails the whole read when a page errors", async () => {
    serveBatchRpc(1);
    const tripId = fakeUuid(1, 6);
    mockServer.tables.trip_documents = Array.from({ length: 1205 }, (_, n) => doc(n, tripId));
    await expect(fetchTripDocumentsForTrips([tripId])).rejects.toThrow(/statement timeout/);
    expect(mockServer.requests.filter((r) => r.table === "trip_documents")).toHaveLength(0);
  });
});
