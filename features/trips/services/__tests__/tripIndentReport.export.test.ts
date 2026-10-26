jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: null,
  writeAsStringAsync: jest.fn(async () => undefined),
}));

import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx-js-style";
import {
  applyTripIndentReportSheetFormatting,
  buildTripIndentReportWorkbook,
} from "../tripIndentReport.export";
import type { TripIndentReportRow } from "@/features/trips/utils/tripIndentReport.model";

function sampleRow(overrides: Partial<TripIndentReportRow> = {}): TripIndentReportRow {
  return {
    customerName: "Acme Logistics",
    indentType: "ADHOC",
    source: "Pune",
    destination: "Mumbai",
    supplierName: "Fleet Co",
    truckNumber: "MH12AB1234",
    truckType: "Open 20 Feet",
    tonnageCapacity: "9 MT",
    driverName: "Ravi",
    driverPhone: "9876543210",
    indentCreatedAt: "01 Oct 2026, 09:00 am",
    confirmedAt: "01 Oct 2026, 11:30 am",
    clientCost: 12500.5,
    supplierCost: 11000,
    status: "assigned",
    createdBy: "Ops User",
    pulseId: "GGV234ABCTRIP000009",
    tripId: "TRP-9",
    ...overrides,
  };
}

describe("tripIndentReport.export formatting", () => {
  it("applies Calibri 10, bold headers, money format, and autofilter", () => {
    const wb = buildTripIndentReportWorkbook([sampleRow()], "GoGo Pulse");
    const sheet = wb.Sheets["Trip Report"];
    expect(sheet).toBeDefined();

    let headerRow = 0;
    const range = XLSX.utils.decode_range(sheet!["!ref"] ?? "A1");
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      const cell = sheet![`A${r + 1}`] as XLSX.CellObject | undefined;
      if (cell && String(cell.v) === "Customer Name") {
        headerRow = r + 1;
        break;
      }
    }
    expect(headerRow).toBeGreaterThan(0);

    const headerCell = sheet![`A${headerRow}`] as XLSX.CellObject & {
      s?: { font?: { name?: string; sz?: number; bold?: boolean } };
    };
    expect(headerCell.s?.font?.name).toBe("Calibri");
    expect(headerCell.s?.font?.sz).toBe(10);
    expect(headerCell.s?.font?.bold).toBe(true);

    const pulseHeader = sheet![`Q${headerRow}`] as XLSX.CellObject;
    expect(String(pulseHeader.v)).toBe("Pulse ID");
    expect((pulseHeader as { s?: { font?: { bold?: boolean } } }).s?.font?.bold).toBe(true);

    const tripHeader = sheet![`R${headerRow}`] as XLSX.CellObject;
    expect(String(tripHeader.v)).toBe("Trip ID");

    const dataRow = headerRow + 1;
    const dataCell = sheet![`A${dataRow}`] as XLSX.CellObject & {
      s?: { font?: { name?: string; sz?: number; bold?: boolean } };
    };
    expect(dataCell.s?.font?.name).toBe("Calibri");
    expect(dataCell.s?.font?.sz).toBe(10);
    expect(dataCell.s?.font?.bold).toBeFalsy();

    const clientCost = sheet![`M${dataRow}`] as XLSX.CellObject & {
      s?: { numFmt?: string; alignment?: { horizontal?: string } };
    };
    expect(clientCost.t).toBe("n");
    expect(clientCost.v).toBe(12500.5);
    expect(clientCost.s?.numFmt).toBe("#,##0.00");
    expect(clientCost.s?.alignment?.horizontal).toBe("right");

    expect(sheet!["!autofilter"]).toBeDefined();
    expect(sheet!["!cols"]?.length).toBe(18);
  });

  it("writes OOXML with Calibri size 10 and bold headers", () => {
    const wb = buildTripIndentReportWorkbook(
      [sampleRow(), sampleRow({ tripId: "", pulseId: "GGV234ABCIND000002", status: "Pending" })],
      "GoGo Pulse",
    );
    const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    const outDir = path.join(process.cwd(), "tmp");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "Pulse_Trip_Report_format_verify.xlsx");
    fs.writeFileSync(outPath, buffer);
    // Sample file left under ./tmp for manual open in Excel (gitignored via tmp/).

    // xlsx is a zip; styles live in xl/styles.xml
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { unzipSync } = require("fflate") as typeof import("fflate");
    const files = unzipSync(new Uint8Array(buffer));
    const decoder = new TextDecoder();
    const stylesXml = decoder.decode(files["xl/styles.xml"]);
    const sheetXml = decoder.decode(files["xl/worksheets/sheet1.xml"]);
    const shared = files["xl/sharedStrings.xml"]
      ? decoder.decode(files["xl/sharedStrings.xml"])
      : "";
    expect(stylesXml).toMatch(/Calibri/);
    expect(stylesXml).toMatch(/sz="10"|val="10"/);
    expect(stylesXml).toMatch(/<b\b|<b\/>|b="1"/);
    const text = `${shared}${sheetXml}`;
    expect(text).toContain("Pulse ID");
    expect(text).toContain("Trip ID");
    expect(text).toContain("Customer Name");
    expect(sheetXml).toMatch(/autoFilter/i);
    expect(fs.existsSync(outPath)).toBe(true);
  });

  it("styles empty sheets without throwing", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["Customer Name", "Trip ID"]]);
    expect(() => applyTripIndentReportSheetFormatting(sheet)).not.toThrow();
  });
});
