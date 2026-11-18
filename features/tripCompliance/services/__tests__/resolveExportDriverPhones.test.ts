import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  buildVerifiedExportCsvRow,
  buildVerifiedExportWorkbook,
} from "@/features/tripCompliance/utils/complianceVerifiedExport.util";
import { resolveExportDriverPhones } from "@/features/tripCompliance/utils/resolveExportDriverPhones.util";
import * as XLSX from "xlsx";

function summary(driverId: string, tripId = driverId): ComplianceTripSummary {
  return {
    trip: { id: tripId, driver_id: driverId, organization_id: "org-1" },
  } as ComplianceTripSummary;
}

describe("resolveExportDriverPhones", () => {
  it("keeps phones from a successful bulk lookup and does not call the fallback", async () => {
    const loadOne = jest.fn();
    const phones = await resolveExportDriverPhones(
      [summary("d1", "t1"), summary("d2", "t2")],
      "org-1",
      { error: null, phoneByDriverId: new Map([["d1", "9000000001"], ["d2", "9000000002"]]) },
      loadOne,
    );
    expect(loadOne).not.toHaveBeenCalled();
    expect(phones.get("d1")).toBe("9000000001");
    expect(phones.get("d2")).toBe("9000000002");
  });

  it("stops the export when the bulk lookup fails and makes no individual requests", async () => {
    const loadOne = jest.fn();
    const summaries = Array.from({ length: 120 }, (_, i) => summary(`d${i}`, `t${i}`));
    await expect(
      resolveExportDriverPhones(
        summaries,
        "org-1",
        { error: new Error("Bad Request"), phoneByDriverId: new Map() },
        loadOne,
      ),
    ).rejects.toThrow(/report was not created/);
    expect(loadOne).not.toHaveBeenCalled();
  });

  it("fills only the phones the bulk read missed, a few at a time", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const loadOne = jest.fn(async (_org: string, driverId: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { error: null, phone: `9${driverId}` };
    });
    const summaries = Array.from({ length: 12 }, (_, i) => summary(`d${i}`, `t${i}`));
    const phones = await resolveExportDriverPhones(
      summaries,
      "org-1",
      { error: null, phoneByDriverId: new Map([["d0", "already"]]) },
      loadOne,
    );
    expect(loadOne).toHaveBeenCalledTimes(11);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(phones.get("d0")).toBe("already");
    expect(phones.get("d11")).toBe("9d11");
  });

  it("stops the export when a fallback lookup fails and does not keep a partial phone set", async () => {
    const loadOne = jest.fn(async (_org: string, driverId: string) => {
      if (driverId === "d2") return { error: new Error("profile down"), phone: "" };
      return { error: null, phone: "9111111111" };
    });
    await expect(
      resolveExportDriverPhones(
        [summary("d1", "t1"), summary("d2", "t2"), summary("d3", "t3")],
        "org-1",
        { error: null, phoneByDriverId: new Map() },
        loadOne,
      ),
    ).rejects.toThrow(/report was not created/);
  });

  it("writes the resolved phone into the XLSX driver column", async () => {
    const trip = {
      ...summary("drv-1", "trip-1"),
      documents: [],
      documentCounts: { total: 0, verified: 0, rejected: 0, pending: 0 },
      hardCopyPod: { lrNumbers: [] },
      stage: "compliance_verified",
      trip: {
        ...summary("drv-1", "trip-1").trip,
        client_price: 100000,
        supplier_rate: 80000,
        margin: 20000,
      },
    } as ComplianceTripSummary;
    const phones = await resolveExportDriverPhones(
      [trip],
      "org-1",
      { error: null, phoneByDriverId: new Map([["drv-1", "9876543210"]]) },
      jest.fn(),
    );
    const row = buildVerifiedExportCsvRow(trip, { driverPhone: phones.get("drv-1") });
    const book = buildVerifiedExportWorkbook([row]);
    const sheet = book.Sheets["Verified Report"];
    const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    const headers = grid[0] ?? [];
    const phoneCol = headers.indexOf("Driver No.");
    expect(phoneCol).toBeGreaterThanOrEqual(0);
    expect(grid[1]?.[phoneCol]).toBe("+919876543210");
  });
});
