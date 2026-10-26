import {
  buildVerifiedExportCsvRow,
  buildVerifiedExportWorkbook,
  exportLrNumber,
  formatExportPhone,
  latestDocNumber,
  verifiedExportRowsToCsv,
  VERIFIED_EXPORT_CSV_HEADERS,
  verifiedAdvanceColumnLabel,
} from "@/features/tripCompliance/utils/complianceVerifiedExport.util";
import * as XLSX from "xlsx";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";

function summary(overrides: {
  trip?: Partial<ComplianceTripSummary["trip"]>;
  documents?: ComplianceTripSummary["documents"];
  complianceVerifiedAt?: string | null;
  complianceDeclinedAt?: string | null;
}): ComplianceTripSummary {
  return {
    stage: "compliance_verified",
    trip: {
      id: "trip-1",
      organization_id: "org-1",
      client_name: "Sunflag",
      supplier_name: "Gogox Logistics",
      supplier_id: "sup-1",
      pickup_area: "Durgapur, West Bengal",
      drop_location: "Kolkata, West Bengal",
      vehicle_display_number: "WB11C8919",
      driver_display_name: "Ravi",
      driver_id: "drv-1",
      vehicle_id: "veh-1",
      pickup_date: "2026-09-23",
      started_at: "2026-09-23T09:24:00",
      client_price: 100000,
      supplier_rate: 80000,
      margin: 20000,
      load_tons: null,
      supplier_rate_basis: null,
      ...overrides.trip,
    } as ComplianceTripSummary["trip"],
    documents: overrides.documents ?? [
      {
        id: "d1",
        trip_id: "trip-1",
        document_type: "lr",
        file_name: "lr.pdf",
        storage_path: "p",
        uploaded_at: "2026-09-23T10:00:00Z",
        status: "verified",
        verified_by: null,
        verified_at: "2026-09-23T11:00:00Z",
        rejection_reason: null,
        document_number: "3277",
      },
      {
        id: "d2",
        trip_id: "trip-1",
        document_type: "invoice",
        file_name: "inv.pdf",
        storage_path: "p2",
        uploaded_at: "2026-09-23T10:00:00Z",
        status: "verified",
        verified_by: null,
        verified_at: "2026-09-23T11:00:00Z",
        rejection_reason: null,
        document_number: "INV-901",
      },
    ],
    documentCounts: { total: 2, verified: 2, rejected: 0, pending: 0 },
    complianceVerifiedAt: overrides.complianceVerifiedAt ?? null,
    complianceDeclinedAt: overrides.complianceDeclinedAt ?? null,
  } as ComplianceTripSummary;
}

describe("complianceVerifiedExport.util", () => {
  it("emits the payment-sheet header columns in order", () => {
    expect([...VERIFIED_EXPORT_CSV_HEADERS]).toEqual([
      "TRIP ID",
      "Verification status",
      "Loading date",
      "Intransit date",
      "Client sales invoice No",
      "Account No",
      "Beneficiary Name",
      "IFSC No",
      "Branch Name",
      "LR No",
      "Customer",
      "Supplier",
      "Source",
      "Destination",
      "Truck No",
      "Truck Type",
      "Driver name",
      "Driver No.",
      "C Price",
      "S Price",
      "Advance",
      "Documentation charges",
      "TDS",
      "Final Advance",
      "Margin",
      "Margin %",
    ]);
  });

  it("uses the Banking beneficiary for Beneficiary Name and leaves Supplier unchanged", () => {
    const base = {
      supplierName: "Gogox Logistics",
      accountNumber: "123456789012",
      ifsc: "HDFC0001234",
      branchName: "Salt Lake",
      advancePercent: 90,
      tdsRatePercent: 2,
    };
    const withBeneficiary = buildVerifiedExportCsvRow(summary({}), { ...base, beneficiaryName: "Pravupa Das" });
    const without = buildVerifiedExportCsvRow(summary({}), base);
    expect(withBeneficiary["Beneficiary Name"]).toBe("Pravupa Das");
    expect(withBeneficiary.Supplier).toBe("Gogox Logistics");
    // No account holder name → blank (never the supplier's company name).
    expect(without["Beneficiary Name"]).toBe("");
    const { ["Beneficiary Name"]: _a, ...restWith } = withBeneficiary;
    const { ["Beneficiary Name"]: _b, ...restWithout } = without;
    expect(restWith).toEqual(restWithout);
  });

  it("maps trip + enrichment into aligned CSV cells", () => {
    const row = buildVerifiedExportCsvRow(summary({}), {
      supplierName: "Gogox Logistics",
      truckType: "32 FT",
      driverPhone: "9876543210",
      accountNumber: "123456789012",
      ifsc: "HDFC0001234",
      branchName: "Salt Lake",
      advancePercent: 90,
      tdsRatePercent: 2,
    });

    expect(row["Verification status"]).toBe("Advance Verification");
    expect(row["Loading date"]).toBe("23 Sep 2026");
    expect(row["Client sales invoice No"]).toBe("INV-901");
    expect(row["LR No"]).toBe("3277");
    expect(row["Account No"]).toBe("123456789012");
    expect(row["Beneficiary Name"]).toBe("");
    expect(row["IFSC No"]).toBe("HDFC0001234");
    expect(row["Branch Name"]).toBe("Salt Lake");
    expect(row.Customer).toBe("Sunflag");
    expect(row.Supplier).toBe("Gogox Logistics");
    expect(row.Source).toContain("Durgapur");
    expect(row.Destination).toContain("Kolkata");
    expect(row["Truck Type"]).toBe("32 FT");
    expect(row["Driver No."]).toBe("+919876543210");
    expect(row["C Price"]).toBe("100000");
    expect(row["S Price"]).toBe("80000");
    expect(row.Advance).toBe("72000");
    expect(row["Documentation charges"]).toBe("0");
    expect(row.TDS).toBe("1600");
    expect(row["Final Advance"]).toBe("70400");
    expect(row.Margin).toBe("20000");
    expect(row["Margin %"]).toBe("20");
  });

  it("deducts the org slab charge for S Price from Final Advance", () => {
    const row = buildVerifiedExportCsvRow(summary({}), {
      advancePercent: 90,
      tdsRatePercent: 2,
      documentChargeConfig: {
        enabled: true,
        slabs: [
          { id: "a", from: 25001, to: 60000, charge: 500 },
          { id: "b", from: 60001, to: 100000, charge: 600 },
        ],
      },
    });
    expect(row["Documentation charges"]).toBe("600");
    expect(row["Final Advance"]).toBe("69800");
  });

  it("labels a verified trip with a Reject remark as Rejected", () => {
    const row = buildVerifiedExportCsvRow(
      summary({
        complianceVerifiedAt: "2026-09-28T10:00:00Z",
        complianceDeclinedAt: "2026-09-29T10:00:00Z",
      }),
    );
    expect(row["Verification status"]).toBe("Rejected");
  });

  it("writes Excel cells so account numbers keep every digit and leading zero", () => {
    const row = buildVerifiedExportCsvRow(summary({}), {
      accountNumber: "0012345678901234",
      ifsc: "HDFC0001234",
      driverPhone: "+919876543210",
      advancePercent: 90,
      tdsRatePercent: 2,
    });
    const workbook = buildVerifiedExportWorkbook([row]);
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const sheet = XLSX.read(bytes, { type: "array" }).Sheets["Verified Report"];

    const col = (header: (typeof VERIFIED_EXPORT_CSV_HEADERS)[number]) =>
      XLSX.utils.encode_col(VERIFIED_EXPORT_CSV_HEADERS.indexOf(header));

    expect(sheet[`${col("Account No")}1`].v).toBe("Account No");
    expect(sheet[`${col("Account No")}2`]).toMatchObject({ t: "s", v: "0012345678901234" });
    expect(sheet[`${col("IFSC No")}2`]).toMatchObject({ t: "s", v: "HDFC0001234" });
    expect(sheet[`${col("Driver No.")}2`]).toMatchObject({ t: "s", v: "+919876543210" });
    expect(sheet[`${col("LR No")}2`]).toMatchObject({ t: "s", v: "3277" });
    expect(sheet[`${col("Final Advance")}2`]).toMatchObject({ t: "n", v: 70400 });
    expect(sheet["!ref"]).toBe(`A1:${col("Margin %")}2`);
  });

  it("writes driver numbers in the Driver Profile format", () => {
    expect(formatExportPhone("+919876567000")).toBe("+919876567000");
    expect(formatExportPhone("9876567000")).toBe("+919876567000");
    expect(formatExportPhone("91 98765 67000")).toBe("+919876567000");
    expect(formatExportPhone("09876567000")).toBe("+919876567000");
    expect(formatExportPhone("")).toBe("");
    expect(formatExportPhone("+1 415 555 0100")).toBe("+1 415 555 0100");
    const row = buildVerifiedExportCsvRow(summary({}), { driverPhone: "9876567000" });
    expect(row["Driver No."]).toBe("+919876567000");
  });

  it("serializes CSV with escaped commas", () => {
    const row = buildVerifiedExportCsvRow(
      summary({
        trip: { pickup_area: "Durgapur, West Bengal", drop_location: "Kolkata, West Bengal" },
      }),
      { supplierName: "Acme, Logistics" },
    );
    const csv = verifiedExportRowsToCsv([row]);
    const lines = csv.split("\n");
    expect(lines[0].startsWith("TRIP ID,Verification status,Loading date")).toBe(true);
    expect(lines[1]).toContain('"Acme, Logistics"');
    expect(lines[1]).toContain('"Durgapur, West Bengal"');
  });
});

describe("latestDocNumber / exportLrNumber", () => {
  it("keeps the LR number when a later file has no number", () => {
    const docs = [
      {
        id: "old",
        trip_id: "trip-1",
        document_type: "lr",
        document_number: "AH1387",
        uploaded_at: "2026-10-01T00:00:00Z",
      },
      {
        id: "new",
        trip_id: "trip-1",
        document_type: "lr",
        document_number: "",
        uploaded_at: "2026-10-20T00:00:00Z",
      },
    ] as ComplianceTripSummary["documents"];
    expect(latestDocNumber(docs, "lr")).toBe("AH1387");
  });

  it("reads lorry_receipt types and POD snapshot when vault has no number", () => {
    const docs = [
      {
        id: "lr1",
        trip_id: "trip-1",
        document_type: "lorry_receipt",
        document_number: "BHD-4026",
        uploaded_at: "2026-10-01T00:00:00Z",
      },
    ] as ComplianceTripSummary["documents"];
    expect(latestDocNumber(docs, "lr")).toBe("BHD-4026");
    const empty = summary({ documents: [] });
    (empty as { hardCopyPod: { lrNumbers: string[] } }).hardCopyPod = { lrNumbers: ["  LR-99  "] };
    expect(exportLrNumber(empty)).toBe("LR-99");
  });
});

describe("verifiedAdvanceColumnLabel", () => {
  it("names the shared advance % in the heading", () => {
    expect(verifiedAdvanceColumnLabel([90, 90])).toBe("90% Advance");
    expect(verifiedAdvanceColumnLabel([90, 80])).toBe("Advance");
    expect(verifiedAdvanceColumnLabel([])).toBe("Advance");
  });

  it("puts the heading in the CSV header line", () => {
    const csv = verifiedExportRowsToCsv([], [90]);
    expect(csv.split(",")).toContain("90% Advance");
  });
});
