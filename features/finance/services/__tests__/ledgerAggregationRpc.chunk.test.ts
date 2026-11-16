/**
 * getCustomerLedgerInputs commerce lookup: one shared trip walk + one chunked
 * indent lookup, chunks in flight concurrently, results identical to the old
 * two-walk serial path, and any read error falls back to "no commerce rows".
 */
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

const mockSuppress = jest.fn((inputs: unknown, _tripIds: string[]) => inputs);
const mockMerge = jest.fn((inputs: unknown, _orders: unknown[]) => inputs);
jest.mock("@/features/finance/aggregation/commerceSelfFulfillment", () => ({
  suppressCommercePlanFreight: (inputs: unknown, tripIds: string[]) => mockSuppress(inputs, tripIds),
  mergeCommerceProductSales: (inputs: unknown, orders: unknown[]) => mockMerge(inputs, orders),
}));

const db: Record<string, Row[]> = {};
const calls: Array<{ table: string; inSize: number }> = [];
let inFlight = 0;
let maxInFlight = 0;
let failTable: string | null = null;

function mockQuery(table: string) {
  const filters: Filter[] = [];
  let limitN = Infinity;
  let inSize = 0;
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    not: (c: string, _op: string, _v: unknown) => (filters.push((r) => r[c] != null), b),
    in: (c: string, vs: unknown[]) => {
      inSize = Math.max(inSize, vs.length);
      filters.push((r) => vs.includes(r[c]));
      return b;
    },
    gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), b),
    order: () => b,
    limit: (n: number) => ((limitN = n), b),
    then: (resolve: (v: { data: Row[] | null; error: unknown }) => unknown) => {
      calls.push({ table, inSize });
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((r) => setTimeout(r, 1)).then(() => {
        inFlight -= 1;
        if (failTable === table) return resolve({ data: null, error: { message: "boom" } });
        const rows = (db[table] ?? [])
          .filter((r) => filters.every((f) => f(r)))
          .sort((a, b2) => String(a.id).localeCompare(String(b2.id)))
          .slice(0, limitN);
        return resolve({ data: rows, error: null });
      });
    },
  };
  return b;
}

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (t: string) => mockQuery(t),
    rpc: () => Promise.resolve({ data: { trip_inputs: [] }, error: null }),
  }),
}));

import { getCustomerLedgerInputs } from "../ledgerAggregationRpc.service";

const pad = (i: number) => String(i).padStart(5, "0");

function seed(tripCount: number) {
  const trips: Row[] = [];
  const indents: Row[] = [];
  const orders: Row[] = [];
  for (let i = 0; i < tripCount; i += 1) {
    const indentId = `ind-${pad(i)}`;
    const hasPlan = i % 3 === 0;
    trips.push({
      id: `trp-${pad(i)}`,
      organization_id: "org-1",
      deleted_at: i % 50 === 7 ? "2026-01-01" : null,
      indent_id: indentId,
      status: i % 2 === 0 ? "completed" : "in_transit",
    });
    indents.push({ id: indentId, execution_plan_id: hasPlan ? `plan-${pad(i)}` : null });
    if (hasPlan) {
      orders.push({
        id: `so-${pad(i)}`,
        organization_id: "org-1",
        customer_id: `cust-${i % 4}`,
        total_amount: "100",
        execution_plan_id: `plan-${pad(i)}`,
        deleted_at: null,
        status: "Fulfilled",
      });
    }
  }
  // Another org's trip must never appear.
  trips.push({ id: "trp-zzzzz", organization_id: "org-2", deleted_at: null, indent_id: "ind-00000", status: "completed" });
  db.trips = trips;
  db.indents = indents;
  db.sales_orders = orders;
}

/** The pre-change algorithm, computed directly over the fixture. */
function expected() {
  const live = db.trips.filter((t) => t.organization_id === "org-1" && t.deleted_at == null && t.indent_id != null);
  const plan = new Map(db.indents.filter((i) => i.execution_plan_id != null).map((i) => [i.id, i.execution_plan_id]));
  const tripIds = live.filter((t) => plan.has(t.indent_id)).map((t) => t.id);
  const completed = live.filter((t) => t.status === "completed" || t.status === "Completed");
  const tripByPlan = new Map<unknown, unknown>();
  for (const t of completed) if (plan.has(t.indent_id)) tripByPlan.set(plan.get(t.indent_id), t.id);
  const orders = db.sales_orders
    .filter((o) => tripByPlan.has(o.execution_plan_id))
    .map((o) => ({ orderId: o.id, customerId: o.customer_id, tripId: tripByPlan.get(o.execution_plan_id), amount: 100 }));
  return { tripIds, orders };
}

beforeEach(() => {
  calls.length = 0;
  inFlight = 0;
  maxInFlight = 0;
  failTable = null;
  mockSuppress.mockClear();
  mockMerge.mockClear();
});

describe("getCustomerLedgerInputs commerce lookup", () => {
  it("returns the same plan trips and orders as the old two-walk path", async () => {
    seed(1_234);
    await getCustomerLedgerInputs("org-1", true);
    const want = expected();
    expect(mockSuppress.mock.calls[0][1]).toEqual(want.tripIds);
    const got = (mockMerge.mock.calls[0][1] as Array<Record<string, unknown>>).slice().sort((a, b) =>
      String(a.orderId).localeCompare(String(b.orderId)),
    );
    expect(got).toEqual(want.orders.sort((a, b) => String(a.orderId).localeCompare(String(b.orderId))));
    expect(want.tripIds.length).toBeGreaterThan(300);
  });

  it("walks trips once, looks up each indent once, and overlaps the chunk reads", async () => {
    seed(1_234);
    await getCustomerLedgerInputs("org-1", true);
    const tripPages = calls.filter((c) => c.table === "trips").length;
    const indentChunks = calls.filter((c) => c.table === "indents");
    // 1,210 live trips at 500 per page = 3 pages + 1 empty terminator page.
    expect(tripPages).toBe(4);
    expect(indentChunks.length).toBe(Math.ceil(1_210 / 40));
    expect(Math.max(...indentChunks.map((c) => c.inSize))).toBeLessThanOrEqual(40);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(7);
  });

  it("falls back to no commerce rows when the indent lookup fails", async () => {
    seed(200);
    failTable = "indents";
    await getCustomerLedgerInputs("org-1", true);
    expect(mockSuppress.mock.calls[0][1]).toEqual([]);
    expect(mockMerge.mock.calls[0][1]).toEqual([]);
  });

  it("falls back to no orders when the sales order lookup fails", async () => {
    seed(200);
    failTable = "sales_orders";
    await getCustomerLedgerInputs("org-1", true);
    expect(mockSuppress.mock.calls[0][1]).toEqual(expected().tripIds);
    expect(mockMerge.mock.calls[0][1]).toEqual([]);
  });
});
