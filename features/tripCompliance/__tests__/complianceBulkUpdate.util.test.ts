import {
  classifyBulkUpdateRows,
  parseBulkPaymentDate,
  parseBulkUpdateCsv,
  reviseBulkUpdateUtr,
} from "@/features/tripCompliance/utils/complianceBulkUpdate.util";

const trip = { id: "trip-1", label: "TRP-1042", keys: ["trip-1", "TRP-1042"] };
const payment = {
  tripId: "trip-1",
  transactionId: "txn-1",
  utr: "HDFC001",
  date: "2026-09-01",
  mode: "UPI",
  cash: false,
};

describe("complianceBulkUpdate.util", () => {
  it("reads an export-shaped sheet and a quoted remark", () => {
    const csv = [
      "TRIP ID,LR NO,AMOUNT,MODE,TRANSACTION DATE,UTR,Remarks",
      'TRP-1042,LR-9,"1,200",UPI,08 Sep 2026,hdfc998877,ok',
      '"TRP-2","note, with comma",500,NEFT,08/09/2026,ICIC123456,"paid, late"',
    ].join("\n");
    const rows = parseBulkUpdateCsv(csv);
    expect(rows[0]).toMatchObject({
      tripKey: "TRP-1042",
      amount: 1200,
      mode: "UPI",
      date: "2026-09-08",
      utr: "hdfc998877",
    });
    expect(rows[0].lrKey).toBe("LR-9");
    expect(rows[1].tripKey).toBe("TRP-2");
    expect(rows[1].lrKey).toBe("note, with comma");
    expect(rows[1].remarks).toBe("paid, late");
    expect(parseBulkPaymentDate("08 Sep 2026")).toBe("2026-09-08");
    expect(parseBulkPaymentDate("08/09/26")).toBe("2026-09-08");
  });

  it("marks a changed UTR ready and leaves a matching UTR unchanged", () => {
    const [changed, same] = classifyBulkUpdateRows({
      rows: [
        { rowIndex: 2, tripKey: "TRP-1042", amount: null, mode: "", date: "", utr: "HDFC998877", remarks: "" },
        { rowIndex: 3, tripKey: "TRP-1042", amount: null, mode: "", date: "2026-09-01", utr: "HDFC001", remarks: "" },
      ],
      trips: [trip],
      payments: [payment],
    });
    expect(changed.tag).toBe("ready");
    expect(changed.included).toBe(true);
    expect(changed.nextUtr).toBe("HDFC998877");
    expect(same.tag).toBe("unchanged");
  });

  it("tags a missing payment, a duplicate UTR, and a short reference", () => {
    const rows = classifyBulkUpdateRows({
      rows: [
        { rowIndex: 2, tripKey: "TRP-9", amount: null, mode: "", date: "", utr: "HDFC998877", remarks: "" },
        { rowIndex: 3, tripKey: "TRP-1042", amount: null, mode: "", date: "", utr: "HDFC998877", remarks: "" },
        { rowIndex: 4, tripKey: "TRP-1042", amount: null, mode: "", date: "", utr: "HDFC998877", remarks: "" },
        { rowIndex: 5, tripKey: "TRP-1042", amount: null, mode: "", date: "", utr: "12", remarks: "" },
      ],
      trips: [trip],
      payments: [payment],
    });
    expect(rows.map((row) => row.tag)).toEqual(["invalid", "ready", "duplicate", "invalid"]);
  });

  it("matches a row by LR number when Trip ID is blank", () => {
    const [matched] = classifyBulkUpdateRows({
      rows: [{ rowIndex: 2, tripKey: "", lrKey: "LR-9", amount: null, mode: "", date: "", utr: "HDFC998877", remarks: "" }],
      trips: [{ ...trip, keys: ["trip-1", "TRP-1042", "LR-9"], lrKeys: ["LR-9"] }],
      payments: [payment],
    });
    expect(matched.tag).toBe("ready");
    expect(matched.tripId).toBe("trip-1");
  });

  it("rechecks an edited UTR before anything is saved", () => {
    const preview = classifyBulkUpdateRows({
      rows: [{ rowIndex: 2, tripKey: "TRP-1042", amount: null, mode: "", date: "", utr: "HDFC998877", remarks: "" }],
      trips: [trip],
      payments: [payment],
    });
    const revised = reviseBulkUpdateUtr(preview, 2, "HDFC001");
    expect(revised[0].tag).toBe("unchanged");
    expect(revised[0].included).toBe(false);
  });
});
