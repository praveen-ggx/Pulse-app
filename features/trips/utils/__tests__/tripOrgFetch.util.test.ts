import { shouldFallbackTripsTableScan } from "@/features/trips/utils/tripOrgFetch.util";

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
