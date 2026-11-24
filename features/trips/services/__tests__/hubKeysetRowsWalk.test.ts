/**
 * Hub date-range walk: page 1 carries the exact counts, later pages use the
 * rows-only function; a server cap below the requested page size still walks
 * to the end; a backend without the rows function still completes; a trip
 * deleted mid-walk is settled by one fresh count.
 */
const mockRpc = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }),
  getAccessToken: async () => "test-token",
}));

import { getAllTripsForOrg, getHubTripKeysetPage, loadHubTripKeysetRange } from "../trips.service";

type Trip = { id: string; created_at: string };
let mockTrips: Trip[] = [];

function makeTrips(n: number): Trip[] {
  // Newest first, unique (created_at, id) like the server ordering.
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(n - i).padStart(12, "0")}`,
    created_at: new Date(Date.UTC(2026, 0, 1) + (n - i) * 60_000).toISOString(),
  }));
}

function serve(opts: { cap?: number; rowsMissing?: boolean } = {}) {
  mockRpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    if (fn === "list_org_hub_trips_keyset_rows" && opts.rowsMissing) {
      return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    }
    const limit = Math.min(Number(args.p_limit), opts.cap ?? 250);
    const beforeAt = args.p_before_created_at as string | null;
    const beforeId = args.p_before_id as string | null;
    const after = mockTrips.filter((t) =>
      !beforeAt || t.created_at < beforeAt || (t.created_at === beforeAt && t.id < String(beforeId)));
    const counted = fn === "list_org_hub_trips_keyset";
    return Promise.resolve({
      data: { total: counted ? mockTrips.length : null, rows: after.slice(0, limit) },
      error: null,
    });
  });
}

const calls = (fn: string) => mockRpc.mock.calls.filter((c) => c[0] === fn).length;

beforeEach(() => mockRpc.mockReset());

describe("getHubTripKeysetPage", () => {
  it("sends the rail tile and the attribution filter on the first page", async () => {
    mockTrips = makeTrips(1);
    serve();
    const page = await getHubTripKeysetPage("org-1", {
      bucket: "unassigned",
      attributed: "attributed",
      withCounts: true,
    });
    expect(page.error).toBeNull();
    expect(mockRpc.mock.calls[0][0]).toBe("list_org_hub_trips_keyset");
    expect(mockRpc.mock.calls[0][1].p_bucket).toBe("unassigned");
    expect(mockRpc.mock.calls[0][1].p_attributed).toBe("attributed");
    expect(mockRpc.mock.calls[0][1].p_compliance).toBe(false);
  });
});

describe("loadHubTripKeysetRange", () => {
  it("counts once, then walks rows-only pages of 250", async () => {
    mockTrips = makeTrips(1_234);
    serve();
    const res = await loadHubTripKeysetRange("org-1", {});
    expect(res.error).toBeNull();
    expect(res.trips.map((t) => t.id)).toEqual(mockTrips.map((t) => t.id));
    expect(calls("list_org_hub_trips_keyset")).toBe(1);
    expect(calls("list_org_hub_trips_keyset_rows")).toBe(4);
    expect(mockRpc.mock.calls.every((c) => c[1].p_limit === 250)).toBe(true);
  });

  it("still reads every trip when the server caps pages at 100", async () => {
    mockTrips = makeTrips(345);
    serve({ cap: 100 });
    const res = await loadHubTripKeysetRange("org-1", {});
    expect(res.error).toBeNull();
    expect(res.trips).toHaveLength(345);
  });

  it("uses the counting function for every page when the rows function is missing", async () => {
    mockTrips = makeTrips(600);
    serve({ cap: 100, rowsMissing: true });
    // Fresh module: the "rows function missing" flag lasts for the session.
    let fresh!: typeof loadHubTripKeysetRange;
    jest.isolateModules(() => {
      fresh = (jest.requireActual("../trips.service") as { loadHubTripKeysetRange: typeof loadHubTripKeysetRange }).loadHubTripKeysetRange;
    });
    const res = await fresh("org-1", {});
    expect(res.error).toBeNull();
    expect(res.trips).toHaveLength(600);
  });

  it("settles a mid-walk deletion with one fresh count", async () => {
    mockTrips = makeTrips(600);
    serve();
    const base = mockRpc.getMockImplementation()!;
    let n = 0;
    mockRpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
      n += 1;
      if (n === 2) mockTrips = mockTrips.filter((_, i) => i !== 400);
      return base(fn, args);
    });
    const res = await loadHubTripKeysetRange("org-1", {});
    expect(res.error).toBeNull();
    expect(res.trips).toHaveLength(599);
    expect(calls("list_org_hub_trips_keyset")).toBe(2);
  });

  it("reads past the old 20,000-row page ceiling", async () => {
    mockTrips = makeTrips(20_001);
    serve();
    const res = await loadHubTripKeysetRange("org-1", {});
    expect(res.error).toBeNull();
    expect(res.trips).toHaveLength(20_001);
    expect(calls("list_org_hub_trips_keyset")).toBe(1);
    expect(calls("list_org_hub_trips_keyset_rows")).toBe(80);
  });

  it("is an error and returns no rows when a page repeats a trip", async () => {
    mockTrips = makeTrips(300);
    serve();
    const base = mockRpc.getMockImplementation()!;
    mockRpc.mockImplementation((fn: string, args: Record<string, unknown>) =>
      base(fn, { ...args, p_before_created_at: null, p_before_id: null }));
    const res = await loadHubTripKeysetRange("org-1", {});
    expect(res.error?.message).toMatch(/repeated a trip/);
    expect(res.trips).toEqual([]);
  });

  it("is an error when the walk and the fresh count still disagree", async () => {
    mockTrips = makeTrips(300);
    serve();
    const base = mockRpc.getMockImplementation()!;
    mockRpc.mockImplementation((fn: string, args: Record<string, unknown>) =>
      base(fn, args).then((r: { data: { total: number | null; rows: Trip[] } }) =>
        fn === "list_org_hub_trips_keyset" ? { ...r, data: { ...r.data, total: 301 } } : r));
    const res = await loadHubTripKeysetRange("org-1", {});
    expect(res.error?.message).toMatch(/loaded 300 of 301/);
    expect(res.trips).toEqual([]);
  });

  it("loads complete trip history through the keyset, not dated 2,000-row slices", async () => {
    mockTrips = makeTrips(2_500);
    serve();
    const res = await getAllTripsForOrg("org-1");
    expect(res.error).toBeNull();
    expect(res.trips).toHaveLength(2_500);
    expect(calls("get_trips_for_org")).toBe(0);
  });
});
