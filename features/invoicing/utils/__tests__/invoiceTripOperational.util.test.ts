jest.mock("@/features/trips/services/tripDocumentLrPod.service", () => ({
  loadLrPodIndexByTripIds: jest.fn(async (ids: string[]) => {
    const map = new Map();
    if (ids.includes("t-missing")) {
      map.set("t-missing", { lrNumbers: ["LR-DOC-9"] });
    }
    return map;
  }),
}));

import { loadLrPodIndexByTripIds } from "@/features/trips/services/tripDocumentLrPod.service";
import {
  displayOperationalField,
  fillMissingInvoiceTripLrNumbers,
  invoiceTripOperationalSeedFromView,
  resolveInvoiceTripDriverName,
  resolveInvoiceTripLrNumber,
  resolveInvoiceTripSupplierName,
} from "../invoiceTripOperational.util";

describe("invoiceTripOperational.util", () => {
  it("uses Core driver display name when present", () => {
    expect(
      resolveInvoiceTripDriverName({
        displayName: "Vincent",
        lookupName: null,
      }),
    ).toBe("Vincent");
  });

  it("falls back to batched driver lookup, never Unknown Driver", () => {
    expect(
      resolveInvoiceTripDriverName({
        displayName: "",
        lookupName: "Kumar",
      }),
    ).toBe("Kumar");
    expect(
      resolveInvoiceTripDriverName({
        displayName: "Unknown Driver",
        lookupName: "",
      }),
    ).toBeNull();
  });

  it("prefers document LR, then booking_ref, else null", () => {
    expect(
      resolveInvoiceTripLrNumber({
        bookingRef: "BR-1",
        documentLrNumbers: ["LR23134"],
      }),
    ).toBe("LR23134");
    expect(
      resolveInvoiceTripLrNumber({
        bookingRef: "LR23134",
        documentLrNumbers: [],
      }),
    ).toBe("LR23134");
    expect(
      resolveInvoiceTripLrNumber({
        bookingRef: "",
        documentLrNumbers: [],
      }),
    ).toBeNull();
  });

  it("does not fabricate supplier names", () => {
    expect(resolveInvoiceTripSupplierName({ lookupName: "Fleet Co" })).toBe(
      "Fleet Co",
    );
    expect(
      resolveInvoiceTripSupplierName({ lookupName: "Unknown Supplier" }),
    ).toBeNull();
  });

  it("maps Invoice trip rows into Log POD seed data", () => {
    const seed = invoiceTripOperationalSeedFromView({
      internal_id: "t1",
      id: "GOD-1",
      client: "Nvidia a",
      client_id: "c1",
      supplier_name: "Vincent Fleet",
      driver_name: "Vincent",
      lr_number: "LR23134",
      route: "Chennai ➔ Hyderabad",
    });
    expect(seed).toMatchObject({
      driver_name: "Vincent",
      lr_number: "LR23134",
      from: "Chennai",
      to: "Hyderabad",
    });
  });

  it("shows em dash when a field is missing", () => {
    expect(displayOperationalField(null)).toBe("—");
    expect(displayOperationalField("  ")).toBe("—");
    expect(displayOperationalField("LR23134")).toBe("LR23134");
  });

  it("fills missing LR with one batched document read, not the POD list", async () => {
    const next = await fillMissingInvoiceTripLrNumbers([
      {
        internal_id: "t-has",
        id: "GOD-1",
        client: "Nvidia a",
        supplier_name: "Fleet",
        lr_number: "LR23134",
      },
      {
        internal_id: "t-missing",
        id: "GOD-2",
        client: "Nvidia a",
        supplier_name: "Fleet",
        lr_number: null,
      },
    ]);
    expect(loadLrPodIndexByTripIds).toHaveBeenCalledWith(["t-missing"]);
    expect(next[0]?.lr_number).toBe("LR23134");
    expect(next[1]?.lr_number).toBe("LR-DOC-9");
  });
});
