/**
 * Vault path after the batch RPC (migration 20261005122431): one
 * get_compliance_vehicle_vault_for_trips call per trip set, authorized for the
 * signed-in viewer org — no per-vehicle get_vehicle_for_trip_viewer.
 *
 * Plate fallback (migration 20261112061609): trips without vehicle_id use
 * get_compliance_vehicle_vault_by_plate — a SECURITY DEFINER RPC that matches
 * by normalized plate within the trip's supplier linked org.
 */
type Row = Record<string, unknown>;
type Op = { kind: "from" | "rpc"; name: string; filters: string[]; args?: Record<string, unknown> };

const mockOps: Op[] = [];
let mockVaultRows: Row[] = [];
let mockPlateVaultRows: Row[] = [];

function mockQuery(table: string) {
  const op: Op = { kind: "from", name: table, filters: [] };
  mockOps.push(op);
  const rows: Row[] = [];
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (col: string, val: unknown) => {
    op.filters.push(`${col}=${String(val)}`);
    return builder;
  };
  builder.in = (col: string, vals: unknown[]) => {
    op.filters.push(`${col} in ${vals.length}`);
    return builder;
  };
  builder.is = () => builder;
  builder.neq = () => builder;
  builder.order = () => builder;
  builder.gt = (col: string, val: string) => {
    op.filters.push(`${col}>${val}`);
    return builder;
  };
  builder.limit = () => builder;
  builder.then = (resolve: (v: { data: Row[]; error: null }) => void) => resolve({ data: rows, error: null });
  return builder;
}

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => mockQuery(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      mockOps.push({ kind: "rpc", name, filters: [], args });
      if (name === "get_compliance_vehicle_vault_for_trips") {
        const ids = args.p_trip_ids as string[];
        return Promise.resolve({ data: mockVaultRows.filter((r) => ids.includes(r.trip_id as string)), error: null });
      }
      if (name === "get_compliance_vehicle_vault_by_plate") {
        const ids = args.p_trip_ids as string[];
        return Promise.resolve({ data: mockPlateVaultRows.filter((r) => ids.includes(r.trip_id as string)), error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

import {
  fetchVehicleDocumentsForTrips,
  tripsNeedingVaultPlateFallback,
} from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { TripRow } from "@/features/trips/services/trips.service";

function trip(id: string, over: Partial<TripRow>): TripRow {
  return {
    id,
    organization_id: "trip-owner-org",
    vehicle_id: null,
    owner_vehicle_id: null,
    vehicle_display_number: null,
    ...over,
  } as TripRow;
}

const RC = { rc: { url: "org-x/v2/rc.pdf", verifiedAt: null } };
const ops = (name: string) => mockOps.filter((op) => op.name === name);

beforeEach(() => {
  mockOps.length = 0;
  mockVaultRows = [];
  mockPlateVaultRows = [];
});

describe("tripsNeedingVaultPlateFallback", () => {
  it("only trips without a vehicle_id whose manual plate is not already resolved", () => {
    const trips = [
      trip("t1", { vehicle_id: "veh-a", vehicle_display_number: "KA01AB1234" }),
      trip("t2", { vehicle_display_number: "KA02CD5678" }),
      trip("t3", { vehicle_display_number: "KA01AB1234" }),
      trip("t4", {}),
    ];
    const pending = tripsNeedingVaultPlateFallback(trips, new Set(["KA01AB1234"]));
    expect(pending.map((t) => t.id)).toEqual(["t2"]);
  });

  it("never treats owner_vehicle_id as a vehicles.id", () => {
    const pending = tripsNeedingVaultPlateFallback(
      [trip("t1", { owner_vehicle_id: "ov-1" }), trip("t2", { owner_vehicle_id: "ov-2", vehicle_display_number: "TN01" })],
      new Set(["ov-1", "ov-2"]),
    );
    expect(pending.map((t) => t.id)).toEqual(["t2"]);
  });
});

describe("fetchVehicleDocumentsForTrips — vault RPC", () => {
  it("one vault RPC for many trips sharing trucks, authorized for the viewer org (not the trip org)", async () => {
    mockVaultRows = [
      { trip_id: "t1", vehicle_id: "v1", vehicle_number: "AP16TX3792", documents: null },
      { trip_id: "t2", vehicle_id: "v1", vehicle_number: "AP16TX3792", documents: null },
      { trip_id: "t3", vehicle_id: "v2", vehicle_number: "TN39CQ4399", documents: RC },
    ];
    const trips = [
      trip("t1", { vehicle_id: "v1" }),
      trip("t2", { vehicle_id: "v1" }),
      trip("t3", { vehicle_id: "v2" }),
    ];
    const byTrip = await fetchVehicleDocumentsForTrips(trips, "viewer-org");
    expect(ops("get_compliance_vehicle_vault_for_trips")).toHaveLength(1);
    expect(ops("get_compliance_vehicle_vault_for_trips")[0].args).toEqual({
      p_viewer_org_id: "viewer-org",
      p_trip_ids: ["t1", "t2", "t3"],
    });
    expect(ops("get_vehicle_for_trip_viewer")).toHaveLength(0);
    expect(ops("vehicles")).toHaveLength(0);
    expect(byTrip.get("t3")?.vaultVehicleId).toBe("v2");
    expect(byTrip.get("t3")?.vehicleDocuments.some((d) => d.doc_type === "rc")).toBe(true);
  });

  it("empty vault documents are resolved — no plate fallback, no re-fetch", async () => {
    mockVaultRows = [{ trip_id: "t1", vehicle_id: "00000000-0000-4000-8000-000000000009", vehicle_number: "MH12XY0001", documents: {} }];
    const trips = [
      trip("t1", { vehicle_id: "00000000-0000-4000-8000-000000000009", vehicle_display_number: "MH12XY0001" }),
      trip("t2", { vehicle_display_number: "MH12XY0001" }),
    ];
    const byTrip = await fetchVehicleDocumentsForTrips(trips, "viewer-org");
    const rpcNames = mockOps.filter((op) => op.kind === "rpc").map((op) => op.name).sort();
    expect(rpcNames).toEqual(["get_compliance_vehicle_vault_for_trips"]);
    expect(ops("vehicles")).toHaveLength(0);
    expect(byTrip.get("t1")?.vehicleDocuments).toEqual([]);
  });
});

describe("fetchVehicleDocumentsForTrips — plate fallback via RPC", () => {
  it("calls get_compliance_vehicle_vault_by_plate for vehicle-less trips with a plate", async () => {
    mockPlateVaultRows = [{ trip_id: "t1", vehicle_id: "cross-v1", vehicle_number: "KA05ZZ9999", documents: RC }];
    const trips = [trip("t1", { vehicle_display_number: "KA05ZZ9999", owner_vehicle_id: "ov-1" })];
    const byTrip = await fetchVehicleDocumentsForTrips(trips, "viewer-org");
    expect(ops("get_compliance_vehicle_vault_for_trips")).toHaveLength(0);
    expect(ops("get_compliance_vehicle_vault_by_plate")).toHaveLength(1);
    expect(ops("get_compliance_vehicle_vault_by_plate")[0].args).toEqual({
      p_viewer_org_id: "viewer-org",
      p_trip_ids: ["t1"],
    });
    expect(ops("vehicles")).toHaveLength(0);
    expect(byTrip.get("t1")?.vaultVehicleId).toBe("cross-v1");
    expect(byTrip.get("t1")?.vehicleDocuments.some((d) => d.doc_type === "rc")).toBe(true);
  });

  it("cross-org vehicle found by plate RPC — documents returned", async () => {
    mockPlateVaultRows = [
      { trip_id: "t1", vehicle_id: "supplier-v1", vehicle_number: "TN52AF9048", documents: RC },
    ];
    const trips = [trip("t1", { vehicle_display_number: "TN52AF9048", supplier_id: "sup-1" })];
    const byTrip = await fetchVehicleDocumentsForTrips(trips, "viewer-org");
    expect(ops("get_compliance_vehicle_vault_by_plate")).toHaveLength(1);
    expect(byTrip.get("t1")?.vaultVehicleId).toBe("supplier-v1");
    expect(byTrip.get("t1")?.vehicleDocuments).toHaveLength(1);
    expect(byTrip.get("t1")?.vehicleDocuments[0].doc_type).toBe("rc");
  });

  it("normalized plate match: spaced plate finds compact DB record", async () => {
    mockPlateVaultRows = [
      { trip_id: "t1", vehicle_id: "norm-v1", vehicle_number: "TN 12 BC 5720", documents: RC },
    ];
    const trips = [trip("t1", { vehicle_display_number: "TN12BC5720" })];
    const byTrip = await fetchVehicleDocumentsForTrips(trips, "viewer-org");
    expect(ops("get_compliance_vehicle_vault_by_plate")).toHaveLength(1);
    expect(byTrip.get("t1")?.vaultVehicleId).toBe("norm-v1");
  });

  it("unregistered vehicle: plate RPC returns no rows — trip has empty vehicle docs", async () => {
    mockPlateVaultRows = [];
    const trips = [trip("t1", { vehicle_display_number: "XX99XX0000" })];
    const byTrip = await fetchVehicleDocumentsForTrips(trips, "viewer-org");
    expect(ops("get_compliance_vehicle_vault_by_plate")).toHaveLength(1);
    expect(byTrip.get("t1")?.vehicleDocuments).toEqual([]);
    expect(byTrip.get("t1")?.vaultVehicleId).toBeNull();
  });

  it("mixed: vehicle_id trips use vault RPC, plate-only trips use plate RPC", async () => {
    mockVaultRows = [
      { trip_id: "t1", vehicle_id: "v1", vehicle_number: "AP16TX3792", documents: RC },
    ];
    mockPlateVaultRows = [
      { trip_id: "t2", vehicle_id: "cross-v2", vehicle_number: "TN52AF9048", documents: RC },
    ];
    const trips = [
      trip("t1", { vehicle_id: "v1" }),
      trip("t2", { vehicle_display_number: "TN52AF9048" }),
      trip("t3", { vehicle_display_number: "UNREGISTERED123" }),
    ];
    const byTrip = await fetchVehicleDocumentsForTrips(trips, "viewer-org");
    expect(ops("get_compliance_vehicle_vault_for_trips")).toHaveLength(1);
    expect(ops("get_compliance_vehicle_vault_by_plate")).toHaveLength(1);
    expect(ops("get_compliance_vehicle_vault_by_plate")[0].args?.p_trip_ids).toEqual(["t2", "t3"]);
    expect(byTrip.get("t1")?.vaultVehicleId).toBe("v1");
    expect(byTrip.get("t2")?.vaultVehicleId).toBe("cross-v2");
    expect(byTrip.get("t3")?.vehicleDocuments).toEqual([]);
  });

  it("plate RPC resolves one plate — second trip with same plate is indexed without extra call", async () => {
    mockPlateVaultRows = [
      { trip_id: "t1", vehicle_id: "shared-v", vehicle_number: "KA01AB1234", documents: RC },
      { trip_id: "t2", vehicle_id: "shared-v", vehicle_number: "KA01AB1234", documents: RC },
    ];
    const trips = [
      trip("t1", { vehicle_display_number: "KA01AB1234" }),
      trip("t2", { vehicle_display_number: "KA 01 AB 1234" }),
    ];
    const byTrip = await fetchVehicleDocumentsForTrips(trips, "viewer-org");
    expect(ops("get_compliance_vehicle_vault_by_plate")).toHaveLength(1);
    expect(byTrip.get("t1")?.vaultVehicleId).toBe("shared-v");
    expect(byTrip.get("t2")?.vaultVehicleId).toBe("shared-v");
  });

  it("duplicate normalized plates in same org: only one vehicle per trip (newest wins)", async () => {
    mockPlateVaultRows = [
      { trip_id: "t1", vehicle_id: "newer-v", vehicle_number: "AP24TA5858", documents: RC },
    ];
    const trips = [trip("t1", { vehicle_display_number: "AP 24 TA 5858" })];
    const byTrip = await fetchVehicleDocumentsForTrips(trips, "viewer-org");
    expect(ops("get_compliance_vehicle_vault_by_plate")).toHaveLength(1);
    expect(byTrip.get("t1")?.vaultVehicleId).toBe("newer-v");
    expect(byTrip.get("t1")?.vehicleDocuments).toHaveLength(1);
  });

  it("duplicate plates with equal timestamps: deterministic pick (highest vehicle id)", async () => {
    mockPlateVaultRows = [
      { trip_id: "t1", vehicle_id: "ffffffff-ffff-4000-8000-ffffffffffff", vehicle_number: "TN25AP2178", documents: RC },
    ];
    const trips = [trip("t1", { vehicle_display_number: "TN25AP2178" })];
    const byTrip = await fetchVehicleDocumentsForTrips(trips, "viewer-org");
    expect(byTrip.get("t1")?.vaultVehicleId).toBe("ffffffff-ffff-4000-8000-ffffffffffff");
    expect(byTrip.get("t1")?.vehicleDocuments).toHaveLength(1);
  });

  it("no direct vehicles table read in the plate fallback path", async () => {
    mockPlateVaultRows = [];
    const trips = [trip("t1", { vehicle_display_number: "TN99XX1234" })];
    await fetchVehicleDocumentsForTrips(trips, "viewer-org");
    expect(ops("vehicles")).toHaveLength(0);
  });
});
