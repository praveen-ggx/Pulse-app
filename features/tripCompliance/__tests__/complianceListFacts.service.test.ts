/**
 * Compliance list facts: ONE get_compliance_list_trip_facts call per list
 * (replacing per-trip vehicle/supplier chains), and the card-label rules
 * ("Own fleet", "—") applied to its rows.
 */
const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import {
  buildComplianceListTripFacts,
  COMPLIANCE_BATCH_MAX_TRIP_IDS,
  fetchComplianceListTripFacts,
  type ComplianceListTripFactRow,
} from "@/features/tripCompliance/services/complianceListFacts.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import type { TripRow } from "@/features/trips/services/trips.service";

function summary(over: Partial<TripRow>): ComplianceTripSummary {
  return { trip: { organization_id: "org-1", ...over } as TripRow } as ComplianceTripSummary;
}

function fact(over: Partial<ComplianceListTripFactRow> & { trip_id: string }): ComplianceListTripFactRow {
  return { vehicle_id: null, truck_type: null, supplier_name: null, ...over };
}

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockRpc.mockResolvedValue({ data: [], error: null });
});

describe("fetchComplianceListTripFacts", () => {
  it("one RPC for a 400-trip list, viewer org + every unique trip id", async () => {
    const ids = Array.from({ length: 400 }, (_, i) => `t${i}`);
    await fetchComplianceListTripFacts("viewer-org", [...ids, "t0", " t1 "]);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("get_compliance_list_trip_facts", {
      p_viewer_org_id: "viewer-org",
      p_trip_ids: ids,
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("splits only above the server cap", async () => {
    const ids = Array.from({ length: COMPLIANCE_BATCH_MAX_TRIP_IDS + 1 }, (_, i) => `t${i}`);
    await fetchComplianceListTripFacts("viewer-org", ids);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc.mock.calls[0][1].p_trip_ids).toHaveLength(COMPLIANCE_BATCH_MAX_TRIP_IDS);
    expect(mockRpc.mock.calls[1][1].p_trip_ids).toEqual([`t${COMPLIANCE_BATCH_MAX_TRIP_IDS}`]);
  });

  it("no call without a viewer org or trips", async () => {
    await fetchComplianceListTripFacts("", ["t1"]);
    await fetchComplianceListTripFacts("viewer-org", []);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("surfaces RPC errors", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(fetchComplianceListTripFacts("viewer-org", ["t1"])).rejects.toThrow("boom");
  });
});

describe("buildComplianceListTripFacts", () => {
  it("maps truck type by vehicle and supplier label by trip", () => {
    const summaries = [
      summary({ id: "t1", vehicle_id: "v1", supplier_id: "s1" }),
      summary({ id: "t2", vehicle_id: "v1", supplier_id: "s2" }),
      summary({ id: "t3", vehicle_id: "v2", supplier_id: "s3" }),
      summary({ id: "t4", vehicle_id: null, supplier_id: "s4" }),
    ];
    const facts = buildComplianceListTripFacts(summaries, [
      fact({ trip_id: "t1", vehicle_id: "v1", truck_type: "32 ft", supplier_name: "Acme" }),
      fact({ trip_id: "t2", vehicle_id: "v1", truck_type: "32 ft", supplier_name: "" }),
      fact({ trip_id: "t3", vehicle_id: "v2", truck_type: null, supplier_name: null }),
      // t4: no row (not visible to the viewer)
    ]);
    expect(facts.truckTypeByVehicleId).toEqual({ v1: "32 ft" });
    expect(facts.supplierNameByTripId).toEqual({ t1: "Acme", t2: "—", t3: "—", t4: "—" });
  });

  it('asset trip without a supplier is "Own fleet"; other supplier-less trips are "—"', () => {
    const facts = buildComplianceListTripFacts(
      [
        summary({ id: "a1", execution_type: "ASSET", supplier_id: null }),
        summary({ id: "g1", execution_type: "AGGREGATE", supplier_id: null }),
      ],
      [fact({ trip_id: "a1" }), fact({ trip_id: "g1" })],
    );
    expect(facts.supplierNameByTripId).toEqual({ a1: "Own fleet", g1: "—" });
  });
});
