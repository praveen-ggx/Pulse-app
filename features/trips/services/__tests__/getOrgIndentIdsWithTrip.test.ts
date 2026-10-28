/**
 * The hub only needs "which indents already have a trip". This replaced a source
 * that paged every trip and indent and read trip_documents in chunks.
 */
import { getOrgIndentIdsWithTrip } from "../trips.service";

const MAX_ROWS = 1000;
let mockTrips: { id: string; indent_id: string | null }[] = [];
const mockCalls: { table: string; select: string; filters: string[] }[] = [];

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ from: (table: string) => mockBuilder(table) }),
}));

function mockBuilder(table: string) {
  const call = { table, select: "", filters: [] as string[] };
  mockCalls.push(call);
  let afterId: string | null = null;
  let limit = MAX_ROWS;
  let notNullIndent = false;
  const run = () => {
    let rows = mockTrips;
    if (notNullIndent) rows = rows.filter((r) => r.indent_id != null);
    if (afterId) rows = rows.filter((r) => r.id > afterId!);
    rows = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, Math.min(limit, MAX_ROWS));
    return { data: rows, error: null };
  };
  const b: Record<string, unknown> = {
    select: (cols: string) => {
      call.select = cols;
      return b;
    },
    eq: (col: string) => {
      call.filters.push(`eq:${col}`);
      return b;
    },
    is: (col: string) => {
      call.filters.push(`is:${col}`);
      return b;
    },
    not: (col: string, op: string) => {
      call.filters.push(`not:${col}:${op}`);
      if (col === "indent_id") notNullIndent = true;
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
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return b;
}

const pad = (n: number) => String(n).padStart(6, "0");

beforeEach(() => {
  mockCalls.length = 0;
  mockTrips = [];
});

test("reads only trips with an indent, two columns, from the trips table", async () => {
  mockTrips = [
    { id: "t-1", indent_id: "i-1" },
    { id: "t-2", indent_id: null },
    { id: "t-3", indent_id: "i-1" },
    { id: "t-4", indent_id: "i-2" },
  ];
  const res = await getOrgIndentIdsWithTrip("org-1");
  expect(res.error).toBeNull();
  expect(res.indentIds.sort()).toEqual(["i-1", "i-2"]);
  expect(new Set(mockCalls.map((c) => c.table))).toEqual(new Set(["trips"]));
  expect(mockCalls[0].select).toBe("id, indent_id");
  expect(mockCalls[0].filters).toEqual(
    expect.arrayContaining(["eq:organization_id", "is:deleted_at", "not:indent_id:is"]),
  );
});

test("pages past max_rows instead of stopping at the first 1000", async () => {
  mockTrips = Array.from({ length: 1250 }, (_, i) => ({ id: `t-${pad(i)}`, indent_id: `i-${pad(i)}` }));
  const res = await getOrgIndentIdsWithTrip("org-1");
  expect(res.indentIds).toHaveLength(1250);
});

test("no org means no request", async () => {
  const res = await getOrgIndentIdsWithTrip("");
  expect(res).toEqual({ error: null, indentIds: [] });
  expect(mockCalls).toHaveLength(0);
});
