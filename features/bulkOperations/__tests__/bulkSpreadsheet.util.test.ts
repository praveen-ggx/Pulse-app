import * as XLSX from "xlsx";
import { spreadsheetToCsv } from "@/features/bulkOperations/utils/bulkSpreadsheet.util";

describe("spreadsheetToCsv", () => {
  it("reads an Excel sheet as CSV and leaves a CSV file as text", async () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Trip ID", "LR number", "UTR"],
      ["TRP-1", "LR-9", "HDFC123456"],
    ]);
    XLSX.utils.book_append_sheet(book, sheet, "Payments");
    const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as Uint8Array;
    const csv = await spreadsheetToCsv("payments.xlsx", bytes, "array");
    expect(csv).toContain("Trip ID,LR number,UTR");
    expect(csv).toContain("TRP-1,LR-9,HDFC123456");

    const plain = new TextEncoder().encode("Trip ID,UTR\nTRP-1,HDFC123456\n");
    expect(await spreadsheetToCsv("payments.csv", plain, "array")).toContain("Trip ID,UTR");
  });
});
