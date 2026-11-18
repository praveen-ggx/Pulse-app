jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: null,
  writeAsStringAsync: jest.fn(async () => undefined),
}));

import { unzipSync } from "fflate";
import * as XLSX from "xlsx-js-style";
import {
  applyTripIndentReportSheetFormatting,
  buildTripIndentReportWorkbook,
} from "../tripIndentReportExport.util";
import type { TripIndentReportRow } from "@/features/trips/utils/tripIndentReport.model";

function sampleRow(overrides: Partial<TripIndentReportRow> = {}): TripIndentReportRow {
  return {
    serial: 1,
    customerName: "Acme Logistics",
    region: "West",
    commercialType: "Adhoc",
    source: "Pune",
    destination: "Mumbai",
    supplierName: "Fleet Co",
    truckNumber: "MH12AB1234",
    truckType: "Open 20 Feet",
    ton: "9 MT",
    driverName: "Ravi",
    driverPhone: "9876543210",
    indentDate: "01 Oct 2026",
    awardedDate: "01 Oct 2026",
    customerPrice: 12500.5,
    supplierPrice: 11000,
    status: "Assigned",
    indentId: "IND000009",
    pulseId: "GGV234ABCIND000009",
    tripId: "TRP-9",
    createdBy: "Ops User",
    ...overrides,
  };
}

describe("tripIndentReportExport.util formatting", () => {
  it("applies Calibri 10, bold headers, money format, and autofilter", () => {
    const wb = buildTripIndentReportWorkbook([sampleRow()], {
      companyName: "GoGo Pulse",
      includeCosts: true,
    });
    const sheet = wb.Sheets["Trip Report"];
    expect(sheet).toBeDefined();

    let headerRow = 0;
    const range = XLSX.utils.decode_range(sheet!["!ref"] ?? "A1");
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      const cell = sheet![`A${r + 1}`] as XLSX.CellObject | undefined;
      if (cell && String(cell.v) === "S.No") {
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

    const commercialHeader = sheet![`D${headerRow}`] as XLSX.CellObject;
    expect(String(commercialHeader.v)).toBe("Adhoc / Contract");

    const indentHeader = sheet![`R${headerRow}`] as XLSX.CellObject;
    expect(String(indentHeader.v)).toBe("Indent ID");
    const pulseHeader = sheet![`S${headerRow}`] as XLSX.CellObject;
    expect(String(pulseHeader.v)).toBe("Pulse ID");
    expect((pulseHeader as { s?: { font?: { bold?: boolean } } }).s?.font?.bold).toBe(true);

    const tripHeader = sheet![`T${headerRow}`] as XLSX.CellObject;
    expect(String(tripHeader.v)).toBe("Trip ID");

    const dataRow = headerRow + 1;
    const dataCell = sheet![`A${dataRow}`] as XLSX.CellObject & {
      s?: { font?: { name?: string; sz?: number; bold?: boolean } };
    };
    expect(dataCell.s?.font?.name).toBe("Calibri");
    expect(dataCell.s?.font?.sz).toBe(10);
    expect(dataCell.s?.font?.bold).toBeFalsy();

    const customerPrice = sheet![`O${dataRow}`] as XLSX.CellObject & {
      s?: { numFmt?: string; alignment?: { horizontal?: string } };
    };
    expect(customerPrice.t).toBe("n");
    expect(customerPrice.v).toBe(12500.5);
    expect(customerPrice.s?.numFmt).toBe("#,##0.00");
    expect(customerPrice.s?.alignment?.horizontal).toBe("right");

    expect(sheet!["!autofilter"]).toBeDefined();
    expect(sheet!["!cols"]?.length).toBe(21);
  });

  it("writes OOXML with Calibri size 10 and bold headers", () => {
    const wb = buildTripIndentReportWorkbook(
      [sampleRow(), sampleRow({ tripId: "", pulseId: "GGV234ABCIND000002", status: "Created" })],
      { companyName: "GoGo Pulse", includeCosts: true },
    );
    const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    // xlsx is a zip; styles live in xl/styles.xml
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
    expect(text).toContain("Indent ID");
    expect(text).toContain("Pulse ID");
    expect(text).toContain("Trip ID");
    expect(text).toContain("Customer (Client Name)");
    expect(text).toContain("Adhoc / Contract");
    expect(sheetXml).toMatch(/autoFilter/i);
  });

  it("keeps Customer Price and Supplier Price when includeCosts is false", () => {
    const wb = buildTripIndentReportWorkbook([sampleRow()], {
      companyName: "GoGo Pulse",
      includeCosts: false,
    });
    const sheet = wb.Sheets["Trip Report"];
    const range = XLSX.utils.decode_range(sheet!["!ref"] ?? "A1");
    let headerRow = 0;
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      const cell = sheet![`A${r + 1}`] as XLSX.CellObject | undefined;
      if (cell && String(cell.v) === "S.No") {
        headerRow = r + 1;
        break;
      }
    }
    const labels: string[] = [];
    for (let c = 0; c <= range.e.c; c += 1) {
      const addr = XLSX.utils.encode_cell({ r: headerRow - 1, c });
      const cell = sheet![addr] as XLSX.CellObject | undefined;
      if (cell?.v != null && String(cell.v).trim()) labels.push(String(cell.v));
    }
    expect(labels).toEqual([
      "S.No",
      "Customer (Client Name)",
      "Region",
      "Adhoc / Contract",
      "Source",
      "Destination",
      "Supplier Name",
      "Truck Number",
      "Truck Type",
      "Ton",
      "Driver Name",
      "Driver Number",
      "Indent Date",
      "Indent Awarded Date",
      "Customer Price",
      "Supplier Price",
      "Status",
      "Indent ID",
      "Pulse ID",
      "Trip ID",
      "Created By",
    ]);
    expect(sheet!["!cols"]?.length).toBe(21);
  });

  it("writes truncation / enrichment notes in the banner", () => {
    const wb = buildTripIndentReportWorkbook([sampleRow()], {
      companyName: "GoGo Pulse",
      notes: ["Export capped at 5,000 trips.", "Vehicle lookup failed."],
    });
    const sheet = wb.Sheets["Trip Report"];
    const range = XLSX.utils.decode_range(sheet!["!ref"] ?? "A1");
    const cells: string[] = [];
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const cell = sheet![XLSX.utils.encode_cell({ r, c })] as
          | XLSX.CellObject
          | undefined;
        if (cell?.v != null) cells.push(String(cell.v));
      }
    }
    expect(cells).toContain("Note");
    expect(cells.some((v) => v.includes("Export capped"))).toBe(true);
    expect(cells.some((v) => v.includes("Vehicle lookup"))).toBe(true);
  });

  it("styles empty sheets without throwing", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["S.No", "Trip ID"]]);
    expect(() => applyTripIndentReportSheetFormatting(sheet)).not.toThrow();
  });
});
