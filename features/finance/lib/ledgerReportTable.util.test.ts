import {
  applyLedgerReportView,
  EMPTY_LEDGER_REPORT_VIEW,
  excelReportCell,
  fitReportColumnWidth,
  pickReportStatusFacet,
  toReportIsoDate,
} from "./ledgerReportTable.util";

const keys = ["rowType", "date", "status", "party"];

const rows = [
  { rowType: "TRIP", date: "8 Sep", dateIso: "2026-09-08", status: "IN TRANSIT", party: "Apollo" },
  { rowType: "TXN", date: "7 Sep", dateIso: "2026-09-07", status: "MATCH_FOUND", party: "Luminous" },
  { rowType: "BAL", date: "8 Sep", dateIso: "2026-09-08", status: "STATEMENT", party: "Trip Balance" },
];

describe("ledgerReportTable.util", () => {
  it("parses iso dates from timestamps", () => {
    expect(toReportIsoDate("2026-09-08T10:00:00.000Z")).toBe("2026-09-08");
  });

  it("filters by date range, status, type, and sorts", () => {
    const view = applyLedgerReportView(
      rows,
      {
        ...EMPTY_LEDGER_REPORT_VIEW,
        dateFrom: "2026-09-08",
        dateTo: "2026-09-08",
        typeValues: ["TRIP", "BAL"],
        statusValues: ["IN TRANSIT"],
        sortKey: "party",
        sortDir: "asc",
      },
      keys,
    );
    expect(view.map((r) => r.rowType)).toEqual(["TRIP"]);
  });

  it("filters a status column that is not named status", () => {
    const paymentRows = [
      { STATUS: "Pending", TRIP_ID: "1" },
      { STATUS: "Paid", TRIP_ID: "2" },
      { STATUS: "Paid", TRIP_ID: "3" },
    ];
    const facet = pickReportStatusFacet(
      [
        { key: "TRIP_ID", label: "TRIP ID" },
        { key: "STATUS", label: "STATUS" },
      ],
      paymentRows,
    );
    expect(facet?.key).toBe("STATUS");
    expect(facet?.options).toEqual([
      { value: "Paid", count: 2 },
      { value: "Pending", count: 1 },
    ]);
    const view = applyLedgerReportView(
      paymentRows,
      { ...EMPTY_LEDGER_REPORT_VIEW, statusValues: ["Pending"] },
      ["TRIP_ID", "STATUS"],
      facet?.key,
    );
    expect(view.map((row) => row.TRIP_ID)).toEqual(["1"]);
  });

  it("uses UTR presence when a payment sheet has no status column", () => {
    const rows = [
      { UTR: "HDFC123", AMOUNT: 10 },
      { UTR: "", AMOUNT: 20 },
    ];
    const facet = pickReportStatusFacet(
      [
        { key: "AMOUNT", label: "AMOUNT" },
        { key: "UTR", label: "UTR" },
      ],
      rows,
    );
    expect(facet?.options).toEqual([
      { value: "With UTR", count: 1 },
      { value: "No UTR", count: 1 },
    ]);
    const view = applyLedgerReportView(
      rows,
      { ...EMPTY_LEDGER_REPORT_VIEW, statusValues: ["No UTR"] },
      ["AMOUNT", "UTR"],
      facet?.key,
    );
    expect(view).toHaveLength(1);
    expect(view[0].AMOUNT).toBe(20);
  });

  it("does not turn a high-cardinality column into a status filter", () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      note: `note-${index}`,
    }));
    expect(
      pickReportStatusFacet([{ key: "note", label: "Note" }], rows),
    ).toBeNull();
  });

  it("searches across cells", () => {
    const view = applyLedgerReportView(
      rows,
      { ...EMPTY_LEDGER_REPORT_VIEW, search: "lumi" },
      keys,
    );
    expect(view).toHaveLength(1);
    expect(view[0].party).toBe("Luminous");
  });

  it("writes money cells as numbers so Excel can sum and average them", () => {
    expect(excelReportCell("4725", true)).toBe(4725);
    expect(excelReportCell("₹4,725.50", true)).toBe(4725.5);
    expect(excelReportCell("13.2%", true)).toBe(13.2);
    expect(excelReportCell("—", true)).toBe("");
    expect(excelReportCell("Pending", true)).toBe("Pending");
    expect(excelReportCell("62028153251", false)).toBe("62028153251");
  });

  it("sizes a report column from the longest cell and the header", () => {
    const headerOnly = fitReportColumnWidth("SUPPLIER NAME", []);
    const withName = fitReportColumnWidth("SUPPLIER NAME", ["SRUNGARAPU VENKATESWARA RAO"]);
    const tripId = fitReportColumnWidth("TRIP ID", ["SAT812GOGTRIP002698"]);
    expect(withName).toBeGreaterThan(headerOnly);
    expect(tripId).toBeGreaterThan(headerOnly);
    expect(fitReportColumnWidth("NOTE", ["x".repeat(400)])).toBe(480);
  });
});
