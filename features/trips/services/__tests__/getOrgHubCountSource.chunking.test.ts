/**
 * getOrgHubCountSource sent every trip id in one `trip_documents` `.in()` —
 * 871 ids made a ~34 KB URL that prod PostgREST rejected (400), so the hub
 * count source never loaded. Ids are now chunked and each chunk is paged.
 */
import { getOrgHubCountSource } from "../trips.service";

const MAX_ROWS = 1000;
const mockInSizes: number[] = [];
let mockTrips: { id: string }[] = [];
let mockDocs: { id: string; trip_id: string }[] = [];

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ from: (table: string) => mockBuilder(table) }),
}));

function mockBuilder(table: string) {
  let inIds: Set<string> | null = null;
  let afterId: string | null = null;
  let limit = MAX_ROWS;
  let range: [number, number] | null = null;
  const run = () => {
    let rows: { id: string; trip_id?: string }[] =
      table === "trips" ? mockTrips : table === "trip_documents" ? mockDocs : [];
    if (inIds) rows = rows.filter((r) => inIds!.has(String(r.trip_id)));
    if (afterId) rows = rows.filter((r) => r.id > afterId!);
    rows = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
    rows = range ? rows.slice(range[0], range[1] + 1) : rows.slice(0, limit);
    return { data: rows.slice(0, MAX_ROWS), error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    is: () => b,
    in: (_col: string, ids: string[]) => {
      mockInSizes.push(ids.length);
      inIds = new Set(ids);
      return b;
    },
    gt: (_col: string, v: string) => {
      afterId = v;
      return b;
    },
    order: () => b,
    limit: (n: number) => {
      limit = n;
      return b;
    },
    range: (from: number, to: number) => {
      range = [from, to];
      return b;
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return b;
}

const pad = (n: number) => String(n).padStart(6, "0");

beforeEach(() => {
  mockInSizes.length = 0;
  mockTrips = Array.from({ length: 871 }, (_, i) => ({ id: `t-${pad(i)}` }));
  mockDocs = [];
});

test("chunks trip ids so no trip_documents request carries more than 100 ids", async () => {
  mockDocs = mockTrips.map((t, i) => ({ id: `d-${pad(i)}`, trip_id: t.id }));
  const res = await getOrgHubCountSource("org-1");
  expect(res.error).toBeNull();
  expect(Math.max(...mockInSizes)).toBeLessThanOrEqual(100);
  expect(res.source.documentTripIds).toHaveLength(871);
});

test("pages a chunk whose documents exceed max_rows instead of dropping trips", async () => {
  // First 100 trips carry 12 docs each = 1200 rows in one chunk; the last trip's docs sort last.
  let n = 0;
  for (const t of mockTrips.slice(0, 100)) {
    for (let k = 0; k < 12; k += 1) mockDocs.push({ id: `d-${pad(n++)}`, trip_id: t.id });
  }
  const res = await getOrgHubCountSource("org-1");
  expect(res.error).toBeNull();
  expect(res.source.documentTripIds).toHaveLength(100);
  expect(res.source.documentTripIds).toContain("t-000099");
});
