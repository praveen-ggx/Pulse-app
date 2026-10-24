/**
 * indents.warehouse_id drives Ground Ops trip visibility. Create and draft
 * edits must link the right client warehouse and never keep a stale one.
 */
import { resolveWarehouseForIndentWrite, updateIndentDraft } from "../indents.service";

type Row = Record<string, unknown>;

const mockWarehouses: Row[] = [
  { id: "wh-peramb", client_id: "apollo", name: "Perambra", address: null, city: "Perambra", state: "Kerala", pincode: null },
  { id: "wh-kalam", client_id: "apollo", name: "Kalamassery", address: null, city: "Kalamassery", state: "Kerala", pincode: "683104" },
];
const PERAMBRA_LINE = "Perambra · Perambra, Kerala";
const KALAM_LINE = "Kalamassery · Kalamassery, Kerala · 683104";

const lanes: Record<string, Row> = {
  "lane-peramb": { client_id: "apollo", origin_warehouse_id: "wh-peramb" },
  "lane-kalam": { client_id: "apollo", origin_warehouse_id: "wh-kalam" },
  "lane-custom": { client_id: "apollo", origin_warehouse_id: null },
  "lane-other-client": { client_id: "berger", origin_warehouse_id: "wh-berger" },
};

let currentIndent: Row | null = null;
const indentUpdates: Row[] = [];
const laneReads: string[] = [];

jest.mock("@/features/clients/services/clientWarehouses.service", () => ({
  getWarehousesByClient: jest.fn(async (_org: string, clientId: string) => ({
    error: null,
    warehouses: clientId === "apollo" ? mockWarehouses : [],
  })),
}));

function mockChain(table: string) {
  const filters: Record<string, unknown> = {};
  let updatePayload: Row | null = null;
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    },
    update: (payload: Row) => {
      updatePayload = payload;
      return builder;
    },
    maybeSingle: async () => {
      if (table === "client_lane_rates") {
        laneReads.push(String(filters.id));
        return { data: lanes[String(filters.id)] ?? null, error: null };
      }
      if (table === "indents" && updatePayload) {
        indentUpdates.push(updatePayload);
        return { data: { ...currentIndent, ...updatePayload, id: filters.id }, error: null };
      }
      return { data: currentIndent, error: null };
    },
  };
  return builder;
}

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ from: (table: string) => mockChain(table) }),
}));

beforeEach(() => {
  indentUpdates.length = 0;
  laneReads.length = 0;
  currentIndent = {
    id: "ind-1",
    organization_id: "org",
    client_id: "apollo",
    lane_id: "lane-peramb",
    pickup_area: "Perambra, Kerala",
    warehouse_id: "wh-peramb",
  };
});

describe("resolveWarehouseForIndentWrite", () => {
  it("links a saved lane's pickup warehouse", async () => {
    await expect(
      resolveWarehouseForIndentWrite("org", { clientId: "apollo", laneId: "lane-peramb", pickup: "Perambra, Kerala" }),
    ).resolves.toBe("wh-peramb");
  });

  it("leaves a Custom lane (no warehouse) with a typed pickup unlinked", async () => {
    await expect(
      resolveWarehouseForIndentWrite("org", { clientId: "apollo", laneId: "lane-custom", pickup: "Perambra, Kerala" }),
    ).resolves.toBeNull();
  });

  it("rejects a lane of another client", async () => {
    await expect(
      resolveWarehouseForIndentWrite("org", { clientId: "apollo", laneId: "lane-other-client", pickup: "x" }),
    ).resolves.toBeNull();
  });

  it("accepts an explicit warehouse of the client and rejects another client's", async () => {
    await expect(resolveWarehouseForIndentWrite("org", { clientId: "apollo", warehouseId: "wh-kalam" })).resolves.toBe("wh-kalam");
    await expect(resolveWarehouseForIndentWrite("org", { clientId: "apollo", warehouseId: "wh-berger" })).resolves.toBeNull();
  });

  it("links a picked warehouse suggestion, not a typed place", async () => {
    await expect(resolveWarehouseForIndentWrite("org", { clientId: "apollo", pickup: KALAM_LINE })).resolves.toBe("wh-kalam");
    await expect(resolveWarehouseForIndentWrite("org", { clientId: "apollo", pickup: "Kalamassery" })).resolves.toBeNull();
  });

  it("returns null for a client with no warehouses or no client", async () => {
    await expect(resolveWarehouseForIndentWrite("org", { clientId: "berger", laneId: "lane-other-client" })).resolves.toBeNull();
    await expect(resolveWarehouseForIndentWrite("org", { clientId: null, laneId: "lane-peramb" })).resolves.toBeNull();
    expect(laneReads).toEqual([]);
  });
});

describe("updateIndentDraft warehouse link", () => {
  const lastUpdate = () => indentUpdates[indentUpdates.length - 1]!;

  it("keeps the link when only unrelated fields change (no lane lookup)", async () => {
    await updateIndentDraft("ind-1", { vehicle_type: "32 Ft MXL", weight: 9000 });
    expect(lastUpdate()).not.toHaveProperty("warehouse_id");
    expect(laneReads).toEqual([]);
  });

  it("keeps the link when route fields are re-sent unchanged", async () => {
    await updateIndentDraft("ind-1", { pickup_area: "Perambra, Kerala", lane_id: "lane-peramb", client_id: "apollo" });
    expect(lastUpdate()).not.toHaveProperty("warehouse_id");
  });

  it("re-links when the lane changes", async () => {
    await updateIndentDraft("ind-1", { lane_id: "lane-kalam", pickup_area: "Kalamassery, Kerala" });
    expect(lastUpdate().warehouse_id).toBe("wh-kalam");
  });

  it("clears the old link when the lane is removed and the pickup is typed", async () => {
    await updateIndentDraft("ind-1", { lane_id: null, pickup_area: "Arupukottai, Tamil Nadu" });
    expect(lastUpdate().warehouse_id).toBeNull();
  });

  it("clears the old link when the new lane has no warehouse", async () => {
    await updateIndentDraft("ind-1", { lane_id: "lane-custom" });
    expect(lastUpdate().warehouse_id).toBeNull();
  });

  it("re-links when the pickup changes to a warehouse suggestion", async () => {
    currentIndent = { ...currentIndent, lane_id: null, warehouse_id: null };
    await updateIndentDraft("ind-1", { pickup_area: PERAMBRA_LINE });
    expect(lastUpdate().warehouse_id).toBe("wh-peramb");
  });

  it("drops the link when the client changes to one the warehouse does not belong to", async () => {
    await updateIndentDraft("ind-1", { client_id: "berger" });
    expect(lastUpdate().warehouse_id).toBeNull();
  });

  it("links an old unlinked draft when it is saved with an unchanged lane", async () => {
    currentIndent = { ...currentIndent, warehouse_id: null };
    await updateIndentDraft("ind-1", { lane_id: "lane-peramb" });
    expect(lastUpdate().warehouse_id).toBe("wh-peramb");
  });
});
