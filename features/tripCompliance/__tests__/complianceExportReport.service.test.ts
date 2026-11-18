/**
 * Advance Verification Confirm must export the trips already counted in the
 * dialog. A fresh catalog read is the fallback, and that read is what returns
 * "Bad Request" once the org backlog is large.
 */
jest.mock("expo-sharing", () => ({
  shareAsync: jest.fn(),
  isAvailableAsync: jest.fn(async () => false),
}));

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "/tmp/",
  writeAsStringAsync: jest.fn(),
}));

import { Platform } from "react-native";

jest.mock("@/features/tripCompliance/services/complianceTripCatalog.service", () => ({
  loadComplianceTripCatalog: jest.fn(),
}));

jest.mock("@/features/drivers/services/drivers.service", () => ({
  getDriverPhonesByIds: jest.fn(async () => ({ error: null, phoneByDriverId: new Map() })),
  getDriverDetailBundle: jest.fn(async () => ({ driver: null })),
}));

jest.mock("@/features/organization/services/documentCharges.service", () => ({
  getDocumentChargeConfig: jest.fn(async () => ({ data: null })),
}));

jest.mock("@/features/suppliers/services/supplierVendorOnboarding.service", () => ({
  getSupplierBankAccount: jest.fn(async () => ({ error: null, account: null })),
  getVendorOnboardingProfile: jest.fn(async () => ({ error: null, profile: null })),
  listSupplierTdsRates: jest.fn(async () => ({ error: null, rates: [] })),
}));

jest.mock("@/features/suppliers/services/suppliers.service", () => ({
  getSupplierById: jest.fn(async () => ({ error: null, supplier: null })),
  getSupplierDetails: jest.fn(async () => ({ error: null, supplier: null })),
}));

jest.mock("@/features/vehicles/services/vehicles.service", () => ({
  getVehicleById: jest.fn(async () => ({ error: null, vehicle: null })),
  getVehicleForTripViewer: jest.fn(async () => ({ error: null, vehicle: null })),
}));

import { exportVerifiedStageComplianceReport } from "@/features/tripCompliance/services/complianceExportReport.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { loadComplianceTripCatalog } from "@/features/tripCompliance/services/complianceTripCatalog.service";

const loadCatalogMock = loadComplianceTripCatalog as jest.Mock;

function verifiedTrip(id: string): ComplianceTripSummary {
  return {
    stage: "compliance_verified",
    financeVerifiedAt: null,
    documents: [],
    hardCopyPod: { lrNumbers: [] },
    trip: {
      id,
      organization_id: "org-1",
      trip_number: `TRP-${id}`,
      supplier_name: "Megha Engineering",
    },
  } as unknown as ComplianceTripSummary;
}

describe("exportVerifiedStageComplianceReport", () => {
  const click = jest.fn();
  const originalOs = Platform.OS;

  beforeEach(() => {
    loadCatalogMock.mockReset();
    click.mockReset();
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "web" });
    const anchor = { href: "", download: "", rel: "", click };
    Object.defineProperty(global, "document", {
      configurable: true,
      value: {
        createElement: () => anchor,
        body: { appendChild: jest.fn(), removeChild: jest.fn() },
      },
    });
    Object.defineProperty(global, "URL", {
      configurable: true,
      value: {
        createObjectURL: jest.fn(() => "blob:report"),
        revokeObjectURL: jest.fn(),
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => originalOs });
  });

  it("downloads the trips already on screen and does not reread the catalog", async () => {
    const count = await exportVerifiedStageComplianceReport("org-1", "all", [
      verifiedTrip("a"),
      verifiedTrip("b"),
    ]);

    expect(count).toBe(2);
    expect(loadCatalogMock).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("reports a catalog failure only when the screen has no rows to export", async () => {
    loadCatalogMock.mockResolvedValue({ error: new Error("Bad Request"), trips: [] });

    await expect(exportVerifiedStageComplianceReport("org-1", "all")).rejects.toThrow("Bad Request");
    expect(click).not.toHaveBeenCalled();
  });
});
