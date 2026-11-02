type Call = { method: string; args: unknown[] };

const mockCalls: Call[][] = [];
let mockNextResults: { data?: unknown; count?: number | null; error?: { message: string } | null }[] = [];

function mockBuilder() {
  const log: Call[] = [];
  mockCalls.push(log);
  const result = mockNextResults.shift() ?? { data: [], count: 0, error: null };
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "select", "eq", "is", "or", "order", "range"]) {
    chain[method] = (...args: unknown[]) => {
      log.push({ method, args });
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: result.data ?? null, count: result.count ?? null, error: result.error ?? null });
  return chain;
}

jest.mock("@/lib/supabase", () => ({ supabase: () => mockBuilder() }));
jest.mock("@/features/indents/services/indents.service", () => ({
  normalizeIndentRow: (row: unknown) => row,
}));

import {
  countIndentWorkload,
  INDENT_WORKLOAD_MAX_PAGES,
  INDENT_WORKLOAD_PAGE_SIZE,
  listIndentWorkload,
} from "@/features/indents/services/indentWorkload.service";

const BOUNDS = { today: "2026-10-28", needsTripFrom: "2026-10-21" };
const DEFAULT_LIVE =
  "and(status.in.(broadcast,open),or(pickup_date.gte.2026-10-28,pickup_date.is.null))";
const DEFAULT_NEEDS_TRIP =
  "and(status.in.(awarded),or(pickup_date.gte.2026-10-21,pickup_date.is.null))";

beforeEach(() => {
  mockCalls.length = 0;
  mockNextResults = [];
});

describe("countIndentWorkload", () => {
  it("issues exact HEAD counts with the linked-trip anti-join and org scope", async () => {
    mockNextResults = [{ count: 2 }, { count: 42 }];
    const res = await countIndentWorkload("org-1", BOUNDS);
    expect(res).toEqual({ error: null, counts: { live: 2, needs_trip: 42 } });
    expect(mockCalls).toHaveLength(2);
    for (const log of mockCalls) {
      expect(log).toEqual(
        expect.arrayContaining([
          { method: "from", args: ["indents"] },
          { method: "select", args: ["id, trips!trips_indent_id_fkey(id)", { count: "exact", head: true }] },
          { method: "eq", args: ["organization_id", "org-1"] },
          { method: "is", args: ["deleted_at", null] },
          { method: "is", args: ["trips.deleted_at", null] },
          { method: "is", args: ["trips", null] },
        ]),
      );
      // No date-pill input and no row download.
      expect(log.some((c) => c.method === "range")).toBe(false);
    }
    expect(mockCalls[0]).toContainEqual({
      method: "or",
      args: [DEFAULT_LIVE],
    });
    expect(mockCalls[1]).toContainEqual({
      method: "or",
      args: [DEFAULT_NEEDS_TRIP],
    });
  });

  it("fails clearly instead of returning a guessed count", async () => {
    mockNextResults = [{ count: 2 }, { error: { message: "permission denied" } }];
    const res = await countIndentWorkload("org-1", BOUNDS);
    expect(res.counts).toBeNull();
    expect(res.error?.message).toBe("permission denied");
  });
});

describe("hub date range", () => {
  const WEEK = { from: "2026-10-26", to: "2026-11-01" };
  const DATED_LIVE =
    "and(status.in.(broadcast,open),or(" +
    "and(pickup_date.gte.2026-10-26,pickup_date.lte.2026-11-01)," +
    'and(pickup_date.is.null,created_at.gte."2026-10-26T00:00:00+05:30",' +
    'created_at.lt."2026-11-02T00:00:00+05:30")))';
  const DATED_NEEDS_TRIP =
    "and(status.in.(awarded),or(" +
    "and(pickup_date.gte.2026-10-26,pickup_date.lte.2026-11-01)," +
    'and(pickup_date.is.null,created_at.gte."2026-10-26T00:00:00+05:30",' +
    'created_at.lt."2026-11-02T00:00:00+05:30")))';
  // "All" keeps the rolling needs_trip window — not every awarded indent.
  const ALL_NEEDS_TRIP =
    "and(status.in.(awarded),or(pickup_date.gte.2026-10-21,pickup_date.is.null))";

  it("counts dated live and needs_trip server-side; scoping kept", async () => {
    mockNextResults = [{ count: 7 }, { count: 31 }];
    const res = await countIndentWorkload("org-1", BOUNDS, WEEK);
    expect(res.counts).toEqual({ live: 7, needs_trip: 31 });
    expect(mockCalls[0]).toContainEqual({ method: "or", args: [DATED_LIVE] });
    expect(mockCalls[1]).toContainEqual({ method: "or", args: [DATED_NEEDS_TRIP] });
    for (const log of mockCalls) {
      expect(log).toEqual(
        expect.arrayContaining([
          { method: "eq", args: ["organization_id", "org-1"] },
          { method: "is", args: ["deleted_at", null] },
          { method: "is", args: ["trips", null] },
        ]),
      );
    }
  });

  it('"All" counts every broadcast / open; needs_trip stays on the 7-day window', async () => {
    mockNextResults = [{ count: 320 }, { count: 31 }];
    const res = await countIndentWorkload("org-1", BOUNDS, "all");
    expect(res.counts).toEqual({ live: 320, needs_trip: 31 });
    expect(mockCalls[0]).toContainEqual({ method: "or", args: ["status.in.(broadcast,open)"] });
    expect(mockCalls[0]).toContainEqual({ method: "is", args: ["trips", null] });
    expect(mockCalls[1]).toContainEqual({ method: "or", args: [ALL_NEEDS_TRIP] });
  });

  it("lists dated live and needs_trip rows from the server (not a client filter)", async () => {
    mockNextResults = [{ data: [{ id: "a" }] }];
    await listIndentWorkload("org-1", BOUNDS, WEEK);
    expect(mockCalls[0]).toContainEqual({
      method: "or",
      args: [`${DATED_LIVE},${DATED_NEEDS_TRIP}`],
    });
  });
});

describe("listIndentWorkload", () => {
  it("pages both workload sets and strips the trips embed", async () => {
    const page = (n: number, prefix: string) =>
      Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, trips: [] }));
    mockNextResults = [{ data: page(INDENT_WORKLOAD_PAGE_SIZE, "a") }, { data: page(3, "b") }];
    const res = await listIndentWorkload("org-1", BOUNDS);
    expect(res.error).toBeNull();
    expect(res.truncated).toBe(false);
    expect(res.indents).toHaveLength(INDENT_WORKLOAD_PAGE_SIZE + 3);
    expect(res.indents.every((row) => !("trips" in (row as object)))).toBe(true);
    expect(mockCalls[0]).toContainEqual({ method: "range", args: [0, INDENT_WORKLOAD_PAGE_SIZE - 1] });
    expect(mockCalls[1]).toContainEqual({
      method: "range",
      args: [INDENT_WORKLOAD_PAGE_SIZE, 2 * INDENT_WORKLOAD_PAGE_SIZE - 1],
    });
    expect(mockCalls[0]).toContainEqual({
      method: "or",
      args: [`${DEFAULT_LIVE},${DEFAULT_NEEDS_TRIP}`],
    });
  });

  it("stops at the page limit and reports truncation", async () => {
    mockNextResults = Array.from({ length: INDENT_WORKLOAD_MAX_PAGES }, (_, p) => ({
      data: Array.from({ length: INDENT_WORKLOAD_PAGE_SIZE }, (_, i) => ({ id: `${p}-${i}` })),
    }));
    const res = await listIndentWorkload("org-1", BOUNDS);
    expect(res.truncated).toBe(true);
    expect(mockCalls).toHaveLength(INDENT_WORKLOAD_MAX_PAGES);
  });
});
