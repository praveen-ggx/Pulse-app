import { readFileSync } from "fs";
import { join } from "path";
import {
  FINANCE_INVOICE_READ_STEPS,
  FINANCE_POD_READ_STEPS,
  financeReadPathsAreSeparate,
} from "../financeReadPathLoad.util";

describe("Finance Pro read-path measurement (do not merge yet)", () => {
  it("keeps POD and Invoice as separate bounded loaders", () => {
    expect(financeReadPathsAreSeparate()).toBe(true);
    expect(FINANCE_POD_READ_STEPS).toContain("rpc:get_trips_for_pod_org");
    expect(FINANCE_INVOICE_READ_STEPS).not.toContain(
      "rpc:get_trips_for_pod_org" as never,
    );
  });

  it("Invoice fetch does not call get_trips_for_pod_org", () => {
    const src = readFileSync(
      join(__dirname, "../../services/invoicing.service.ts"),
      "utf8",
    );
    const fetchStart = src.indexOf("export async function fetchInvoicingTrips");
    const nextExport = src.indexOf("\nexport async function", fetchStart + 10);
    const body = src.slice(fetchStart, nextExport === -1 ? undefined : nextExport);
    expect(body).not.toContain("get_trips_for_pod_org");
  });

  it("POD loader still uses get_trips_for_pod_org", () => {
    const src = readFileSync(
      join(
        __dirname,
        "../../../pod-reconciliation/services/podReconciliationService.ts",
      ),
      "utf8",
    );
    expect(src).toContain("get_trips_for_pod_org");
  });
});
