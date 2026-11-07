import {
  reportIndentsAlreadyBootstrapped,
  reportTripsAlreadyBootstrapped,
} from "@/features/trips/utils/tripIndentReportCatalog.util";

describe("report catalog bootstrap", () => {
  it("reuses the hub trip list only when all-time and under the cap", () => {
    expect(
      reportTripsAlreadyBootstrapped({ completeness: "exact", allTime: true }),
    ).toBe(true);
    expect(
      reportTripsAlreadyBootstrapped({ completeness: "exact", allTime: false }),
    ).toBe(false);
    expect(
      reportTripsAlreadyBootstrapped({ completeness: "capped", allTime: true }),
    ).toBe(false);
    expect(
      reportTripsAlreadyBootstrapped({ completeness: "loading", allTime: true }),
    ).toBe(false);
  });

  it("reuses indents only while the loaded list is under the cap", () => {
    expect(reportIndentsAlreadyBootstrapped(0, 500)).toBe(true);
    expect(reportIndentsAlreadyBootstrapped(499, 500)).toBe(true);
    expect(reportIndentsAlreadyBootstrapped(500, 500)).toBe(false);
  });
});