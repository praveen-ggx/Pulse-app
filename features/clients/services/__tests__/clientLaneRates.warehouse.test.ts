/**
 * Every saved lane needs one of its client's warehouses as pickup (indents from
 * the lane link to it; Ground Ops visibility depends on that link).
 */
import { createClientLaneRate, updateClientLaneRate } from "../clientLaneRates.service";

type Row = Record<string, unknown>;

const mockState = {
  warehouses: [
    { id: "wh-a1", organization_id: "org", client_id: "apollo" },
    { id: "wh-a2", organization_id: "org", client_id: "apollo" },
    { id: "wh-b1", organization_id: "org", client_id: "berger" },
  ] as Row[],
  lanes: {
    "lane-ok": { organization_id: "org", client_id: "apollo", origin_warehouse_id: "wh-a1" },
    "lane-custom": { organization_id: "org", client_id: "apollo", origin_warehouse_id: null },
  } as Record<string, Row>,
  writes: [] as { op: "insert" | "update"; payload: Row }[],
};

function mockChain(table: string) {
  const filters: Record<string, unknown> = {};
  let op: "select" | "insert" | "update" = "select";
  let payload: Row = {};
  const run = () => {
    if (table === "client_warehouses") {
      return mockState.warehouses.filter(
        (w) => w.organization_id === filters.organization_id && w.client_id === filters.client_id,
      );
    }
    return mockState.lanes[String(filters.id)] ?? null;
  };
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: (p: Row) => {
      op = "insert";
      payload = p;
      mockState.writes.push({ op, payload: p });
      return builder;
    },
    update: (p: Row) => {
      op = "update";
      payload = p;
      mockState.writes.push({ op, payload: p });
      return builder;
    },
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    },
    is: () => builder,
    single: async () => ({ data: { id: "new", ...payload }, error: null }),
    maybeSingle: async () => ({ data: run(), error: null }),
    then: (resolve: (v: unknown) => void) =>
      resolve(op === "update" ? { error: null } : { data: run(), error: null }),
  };
  return builder;
}

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ from: (table: string) => mockChain(table) }),
}));

const base = { origin_label: "Perambra · Perambra, Kerala", destination_label: "Nagpur, Maharashtra" };

beforeEach(() => {
  mockState.writes.length = 0;
});

describe("createClientLaneRate pickup warehouse", () => {
  it("saves a lane with one of the client's warehouses", async () => {
    const res = await createClientLaneRate("org", "apollo", { ...base, origin_warehouse_id: "wh-a1" });
    expect(res.error).toBeNull();
    expect(mockState.writes).toEqual([{ op: "insert", payload: expect.objectContaining({ origin_warehouse_id: "wh-a1" }) }]);
  });

  it("blocks a Custom lane with no warehouse", async () => {
    const res = await createClientLaneRate("org", "apollo", { ...base, origin_warehouse_id: null });
    expect(res.error?.message).toMatch(/Choose the pickup warehouse/);
    expect(mockState.writes).toEqual([]);
  });

  it("blocks another client's warehouse and an unknown id", async () => {
    expect((await createClientLaneRate("org", "apollo", { ...base, origin_warehouse_id: "wh-b1" })).error?.message).toMatch(
      /not one of this client's warehouses/,
    );
    expect((await createClientLaneRate("org", "apollo", { ...base, origin_warehouse_id: "nope" })).error?.message).toMatch(
      /not one of this client's warehouses/,
    );
    expect(mockState.writes).toEqual([]);
  });

  it("asks for a warehouse first when the client has none", async () => {
    const res = await createClientLaneRate("org", "shakthi", { ...base, origin_warehouse_id: null });
    expect(res.error?.message).toMatch(/Add a warehouse for this client first/);
    expect(mockState.writes).toEqual([]);
  });
});

describe("updateClientLaneRate pickup warehouse", () => {
  it("keeps editing a valid lane (rate-only change keeps its warehouse)", async () => {
    const res = await updateClientLaneRate("lane-ok", { rate: 52000 });
    expect(res.error).toBeNull();
    expect(mockState.writes).toHaveLength(1);
  });

  it("allows moving a lane to another warehouse of the same client", async () => {
    expect((await updateClientLaneRate("lane-ok", { origin_warehouse_id: "wh-a2" })).error).toBeNull();
  });

  it("blocks clearing the warehouse or moving it to another client's", async () => {
    expect((await updateClientLaneRate("lane-ok", { origin_warehouse_id: null })).error?.message).toMatch(/Choose the pickup warehouse/);
    expect((await updateClientLaneRate("lane-ok", { origin_warehouse_id: "wh-b1" })).error?.message).toMatch(/not one of this client's/);
    expect(mockState.writes).toEqual([]);
  });

  it("does not save an old Custom lane again until a warehouse is chosen", async () => {
    expect((await updateClientLaneRate("lane-custom", { rate: 1 })).error?.message).toMatch(/Choose the pickup warehouse/);
    expect(mockState.writes).toEqual([]);
    expect((await updateClientLaneRate("lane-custom", { origin_warehouse_id: "wh-a2" })).error).toBeNull();
  });

  it("reports a missing lane", async () => {
    expect((await updateClientLaneRate("gone", { rate: 1 })).error?.message).toBe("Lane not found.");
  });
});
