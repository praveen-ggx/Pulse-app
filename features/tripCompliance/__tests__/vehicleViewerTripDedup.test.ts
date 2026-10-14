/**
 * Vault path after the batch RPC (migration 20261005122431): one
 * get_compliance_vehicle_vault_for_trips call per trip set, authorized for the
 * signed-in viewer org — no per-vehicle get_vehicle_for_trip_viewer, no
 * vehicles.in(), and no plate fallback for trips that already have a vehicle.
 */
type Row = Record<string, unknown>;
type Op = { kind: "from" | "rpc"; name: string; filters: string[]; args?: Record<string, unknown> };

const mockOps: Op[] = [];
let mockVaultRows: Row[] = [];
let mockOrgVehicles: Row[] = [];

function mockQuery(table: string) {
  const op: Op = { kind: "from", name: table, filters: [] };
  mockOps.push(op);
  let rows: Row[] = table === "vehicles" ? [...mockOrgVehicles] : [];
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (col: string, val: unknown) => {
    op.filters.push(`${col}=${String(val)}`);
    rows = rows.filter((r) => r[col] === undefined || r[col] === val);
    return builder;
  };
  builder.in = (col: string, vals: unknown[]) => {
    op.filters.push(`${col} in ${vals.length}`);
    return builder;
  };
  builder.is = () => builder;
  builder.neq = () => builder;
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
  mockOrgVehicles = [];
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
    // t1: no vehicle, no plate → nothing to do. t2: plate fallback by number, regardless of owner_vehicle_id.
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
    mockVaultRows = [{ trip_id: "t1", vehicle_id: "v9", vehicle_number: "MH12XY0001", documents: {} }];
    const trips = [
      trip("t1", { vehicle_id: "v9", vehicle_display_number: "MH12XY0001" }),
      // Same plate, no vehicle link: the RPC already resolved that plate, so still no fallback.
      trip("t2", { vehicle_display_number: "MH12XY0001" }),
    ];
    const byTrip = await fetchVehicleDocumentsForTrips(trips, "viewer-org");
    expect(mockOps.map((op) => op.name).sort()).toEqual(["entity_documents", "get_compliance_vehicle_vault_for_trips"]);
    expect(byTrip.get("t1")?.vehicleDocuments).toEqual([]);
  });

  it("plate fallback: one vehicles read scoped to the viewer org, only for vehicle-less trips", async () => {
    mockOrgVehicles = [{ id: "own-1", organization_id: "viewer-org", vehicle_number: "KA05ZZ9999", documents: RC }];
    const trips = [trip("t1", { vehicle_display_number: "KA05ZZ9999", owner_vehicle_id: "ov-1" })];
    const byTrip = await fetchVehicleDocumentsForTrips(trips, "viewer-org");
    expect(ops("get_compliance_vehicle_vault_for_trips")).toHaveLength(0);
    expect(ops("vehicles")).toHaveLength(1);
    expect(ops("vehicles")[0].filters).toEqual(["organization_id=viewer-org"]);
    expect(mockOps.some((op) => op.filters.some((f) => f.includes("ov-1")))).toBe(false);
    expect(byTrip.get("t1")?.vaultVehicleId).toBe("own-1");
  });
});
