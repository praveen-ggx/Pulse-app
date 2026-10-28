import {
  GET_TRIPS_FOR_ORG_DATED_SAFETY_CAP,
  GET_TRIPS_FOR_ORG_DEFAULT_CAP,
  datedGetTripsForOrgCapNote,
  isDatedGetTripsForOrgCapped,
  shouldFallbackTripsTableScan,
  shouldTableScanTripsForOrg,
  tripsForOrgRpcArgs,
} from "@/features/trips/utils/tripOrgFetch.util";

describe("tripsForOrgRpcArgs", () => {
  it("sends only the org for the newest-400 list", () => {
    expect(tripsForOrgRpcArgs("org-1")).toEqual({ p_org_id: "org-1" });
  });

  it("omits date args for the live two-argument / p_org_id-only call", () => {
    expect(tripsForOrgRpcArgs("org-1", { includeComplianceBacklog: true })).toEqual({
      p_org_id: "org-1",
      p_include_compliance_backlog: true,
    });
    expect(Object.keys(tripsForOrgRpcArgs("org-1"))).toEqual(["p_org_id"]);
  });

  it("adds a calendar range so the hub can load older months", () => {
    expect(
      tripsForOrgRpcArgs("org-1", { from: "2026-09-01", to: "2026-09-30" }),
    ).toEqual({
      p_org_id: "org-1",
      p_from: "2026-09-01",
      p_to: "2026-09-30",
    });
  });
});

describe("shouldFallbackTripsTableScan", () => {
  it("allows fallback only when the RPC is missing", () => {
    expect(
      shouldFallbackTripsTableScan({ message: "function get_trips_for_org does not exist" }),
    ).toBe(true);
    expect(shouldFallbackTripsTableScan({ code: "42883", message: "undefined function" })).toBe(
      true,
    );
  });

  it("does not table-scan after pool/timeout failures", () => {
    expect(shouldFallbackTripsTableScan({ message: "JSON could not be generated (544)" })).toBe(
      false,
    );
    expect(shouldFallbackTripsTableScan({ message: "Timed out acquiring connection" })).toBe(
      false,
    );
    expect(shouldFallbackTripsTableScan({ message: "canceling statement due to statement timeout" })).toBe(
      false,
    );
    expect(shouldFallbackTripsTableScan({ code: "PGRST003", message: "connection" })).toBe(false);
  });
});

describe("shouldTableScanTripsForOrg", () => {
  it("never table-scans a dated hub request even when the RPC is missing", () => {
    expect(
      shouldTableScanTripsForOrg(
        { code: "PGRST202", message: "could not find the function" },
        { from: "2026-09-01", to: "2026-09-30" },
      ),
    ).toBe(false);
  });

  it("still allows a missing-RPC table scan for the newest-400 list", () => {
    expect(
      shouldTableScanTripsForOrg({ message: "function get_trips_for_org does not exist" }),
    ).toBe(true);
  });
});

describe("dated get_trips_for_org cap", () => {
  it("keeps the agreed 400 / 2000 limits and labels a full dated page as truncated", () => {
    expect(GET_TRIPS_FOR_ORG_DEFAULT_CAP).toBe(400);
    expect(GET_TRIPS_FOR_ORG_DATED_SAFETY_CAP).toBe(2000);
    expect(isDatedGetTripsForOrgCapped(1999)).toBe(false);
    expect(isDatedGetTripsForOrgCapped(2000)).toBe(true);
    expect(datedGetTripsForOrgCapNote(2000)).toBe(
      "Results may be incomplete (newest 2000 matching trips)",
    );
    expect(datedGetTripsForOrgCapNote(20)).toBeNull();
  });
});
