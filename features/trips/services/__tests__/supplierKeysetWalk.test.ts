/**
 * Supplier history walks a jsonb keyset. A missing function may use the legacy
 * RPC once, and that result is marked unpaged. A repeated id returns no rows.
 */
const mockRpc = jest.fn();
jest.mock("@/lib/supabase", () => ({ supabase: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }) }));

import { getTripsWhereOrgIsSupplier } from "../trips.service";

type Row = { id: string; created_at: string; status: string };

function rows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(n - i).padStart(12, "0")}`,
    created_at: new Date(Date.UTC(2026, 0, 1) + (n - i) * 60_000).toISOString(),
    status: "in_transit",
  }));
}

beforeEach(() => mockRpc.mockReset());

describe("getTripsWhereOrgIsSupplier", () => {
  it("walks every page and stops when has_more is false", async () => {
    const all = rows(501);
    mockRpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
      expect(fn).toBe("list_trips_where_org_is_supplier_keyset");
      const limit = Number(args.p_limit);
      expect(limit).toBeLessThanOrEqual(250);
      const beforeAt = args.p_before_created_at as string | null;
      const beforeId = args.p_before_id as string | null;
      const rest = all.filter(
        (row) =>
          !beforeId ||
          row.created_at < String(beforeAt) ||
          (row.created_at === beforeAt && row.id < String(beforeId)),
      );
      const page = rest.slice(0, limit);
      return Promise.resolve({
        data: { rows: page, has_more: rest.length > limit },
        error: null,
      });
    });
    const res = await getTripsWhereOrgIsSupplier("org-supplier");
    expect(res.error).toBeNull();
    expect(res.paged).toBe(true);
    expect(res.trips.map((row) => row.id)).toEqual(all.map((row) => row.id));
    expect(mockRpc).toHaveBeenCalledTimes(3);
  });

  it("falls back once when the keyset function is not installed and marks the result unpaged", async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "list_trips_where_org_is_supplier_keyset") {
        return Promise.resolve({
          data: null,
          error: { code: "PGRST202", message: "Could not find the function" },
        });
      }
      return Promise.resolve({ data: rows(2), error: null });
    });
    const res = await getTripsWhereOrgIsSupplier("org-supplier");
    expect(res.error).toBeNull();
    expect(res.paged).toBe(false);
    expect(res.trips).toHaveLength(2);
    expect(mockRpc.mock.calls.map((call) => call[0])).toEqual([
      "list_trips_where_org_is_supplier_keyset",
      "get_trips_where_org_is_supplier",
    ]);
  });

  it("does not treat a full legacy page as the complete supplier history", async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "list_trips_where_org_is_supplier_keyset") {
        return Promise.resolve({
          data: null,
          error: { code: "PGRST202", message: "Could not find the function" },
        });
      }
      return Promise.resolve({ data: rows(1000), error: null });
    });
    const res = await getTripsWhereOrgIsSupplier("org-supplier");
    expect(res.trips).toEqual([]);
    expect(res.paged).toBe(false);
    expect(res.error?.message).toBe("Supplier history hit the legacy row cap and is incomplete.");
  });

  it("returns no rows when a later page repeats a trip", async () => {
    const first = rows(2);
    const repeated = [
      first[0],
      {
        id: "00000000-0000-0000-0000-000000000099",
        created_at: "2020-01-01T00:00:00.000Z",
        status: "in_transit",
      },
    ];
    let calls = 0;
    mockRpc.mockImplementation(() => {
      calls += 1;
      return Promise.resolve({
        data: { rows: calls === 1 ? first : repeated, has_more: true },
        error: null,
      });
    });
    const res = await getTripsWhereOrgIsSupplier("org-supplier");
    expect(res.trips).toEqual([]);
    expect(res.error?.message).toBe("Supplier page cursor repeated a trip.");
  });

  it("returns no rows when a page fails after the first page", async () => {
    const all = rows(300);
    let calls = 0;
    mockRpc.mockImplementation((_fn: string, args: Record<string, unknown>) => {
      calls += 1;
      if (calls > 1) return Promise.resolve({ data: null, error: { message: "timeout" } });
      const limit = Number(args.p_limit);
      const page = all.slice(0, limit);
      return Promise.resolve({ data: { rows: page, has_more: true }, error: null });
    });
    const res = await getTripsWhereOrgIsSupplier("org-supplier");
    expect(res.trips).toEqual([]);
    expect(res.error?.message).toBe("timeout");
  });
});
