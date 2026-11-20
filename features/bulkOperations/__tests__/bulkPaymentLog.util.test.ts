import { batchMatchesLogFilters, findBulkFileForPayments, groupPostedPayments, mergePaymentLogs, mergeStoredPaymentLogs, paymentPostLogEntry } from "@/features/bulkOperations/utils/bulkPaymentLog.util";
import type { StoredBatch } from "@/features/bulkOperations/services/bulkHistory.service";

function serverBatch(id: string, fileName: string, createdAt: string): StoredBatch {
  return {
    id,
    file_name: fileName,
    status: "completed",
    created_at: createdAt,
    execution_started_at: createdAt,
    summary: { category: "compliance_advance", kind: "post", posted: 1, failed: 0 },
    field_selection: [],
    adapter_id: "compliance-payment-post",
    confirmed_by: null,
    uploaded_by: null,
    file_sha256: null,
    execution_owner: null,
  };
}

describe("payment post log", () => {
  it("keeps the file amount on the posted row and names a failed row", () => {
    const entry = paymentPostLogEntry({
      fileName: "pasted.csv",
      category: "compliance_advance",
      rows: [
        { rowIndex: 2, matchKey: "LR LR12345", recordId: "trip-1", amount: 9000, mode: "UPI", date: "2026-09-08", utr: "HDFC123456", error: null },
        { rowIndex: 3, matchKey: "LR LR999", recordId: null, amount: 1000, mode: "UPI", date: "", utr: "", error: "No trip matched LR999." },
      ],
    });
    expect(entry.batch.summary).toMatchObject({ kind: "post", posted: 1, failed: 1 });
    expect(entry.batch.status).toBe("partial");
    expect(entry.rows[0]).toMatchObject({ status: "applied", proposed_values: { amount: "9000", utr: "HDFC123456" } });
    expect(entry.rows[1]).toMatchObject({ status: "failed", message: "No trip matched LR999." });
  });

  it("replaces a local confirmation when the workspace history has the same file", () => {
    const local = paymentPostLogEntry({
      fileName: "pasted.csv",
      category: "compliance_advance",
      rows: [{ rowIndex: 2, matchKey: "LR LR12345", recordId: "trip-1", amount: 9000, mode: "UPI", date: "2026-09-08", utr: "HDFC", error: null }],
    });
    local.batch.created_at = "2026-11-18T13:00:00.000Z";
    const saved = serverBatch("batch-1", "pasted.csv", "2026-11-18T13:00:05.000Z");
    const merged = mergePaymentLogs([saved], [local]);
    expect(merged.map((item) => item.batch.id)).toEqual(["batch-1"]);
  });

  it("lists payments saved together as one file and keeps a later payment separate", () => {
    const logs = groupPostedPayments([
      { id: "a", tripLabel: "GOD684GODTRIP000068", amount: 9000, mode: "UPI", utr: "HDFC123456", date: "2026-11-18", createdAt: "2026-11-18T13:10:17.000Z", createdBy: "user-1" },
      { id: "b", tripLabel: "GOD684GODTRIP000069", amount: 1000, mode: "UPI", utr: "HDFC2", date: "2026-11-18", createdAt: "2026-11-18T13:10:18.000Z", createdBy: "user-1" },
      { id: "c", tripLabel: "GOD684GODTRIP000070", amount: 500, mode: "CASH", utr: "", date: "2026-11-17", createdAt: "2026-11-17T09:00:00.000Z", createdBy: "user-1" },
    ], "compliance_advance");
    expect(logs).toHaveLength(2);
    expect(logs[0].rows.map((row) => row.match_key)).toEqual(["GOD684GODTRIP000068", "GOD684GODTRIP000069"]);
    expect(logs[0].batch.summary).toMatchObject({ posted: 2, amount: 10000 });
    expect(logs[1].batch.file_name).toBe("GOD684GODTRIP000070");
  });

  it("keeps a payment when the date and supplier match", () => {
    const [log] = groupPostedPayments([
      { id: "a", tripLabel: "SAT812GOGTRIP002516", supplierName: "AJIO", amount: 28100, mode: "UPI", utr: "U1", date: "2026-11-17", createdAt: "2026-11-17T12:00:00.000Z", createdBy: "user-1" },
    ], "compliance_advance");
    expect(batchMatchesLogFilters(log.batch, log.rows, { from: "2026-11-17", to: "2026-11-17", supplier: "aji" })).toBe(true);
    expect(batchMatchesLogFilters(log.batch, log.rows, { from: "2026-11-18", to: "", supplier: "" })).toBe(false);
  });

  it("links a posted payment to the bulk file with the same UTR and amount", () => {
    const [payment] = groupPostedPayments([
      { id: "a", tripLabel: "SAT812GOGTRIP002516", supplierName: "AJIO", amount: 28100, mode: "BANK", utr: "HSBCN32008277649", date: "2026-11-16", createdAt: "2026-11-17T12:00:00.000Z", createdBy: "user-1" },
    ], "compliance_advance");
    const file = paymentPostLogEntry({
      fileName: "advances.xlsx",
      category: "compliance_advance",
      rows: [{ rowIndex: 2, matchKey: "SAT812GOGTRIP002516", recordId: "trip-1", amount: 28100, mode: "BANK", date: "2026-11-16", utr: "HSBCN32008277649", error: null }],
    });
    expect(findBulkFileForPayments(payment, [file])?.batch.file_name).toBe("advances.xlsx");
    expect(findBulkFileForPayments(payment, [])).toBeNull();
  });

  it("keeps a confirmed file when the server has no batch row", () => {
    const file = paymentPostLogEntry({
      fileName: "advances.xlsx",
      category: "compliance_advance",
      rows: [{ rowIndex: 2, matchKey: "GOD684GODTRIP000068", recordId: "trip-1", amount: 9000, mode: "UPI", date: "2026-11-18", utr: "HDFC123456", error: null }],
    });
    file.batch.created_at = "2026-11-18T13:10:17.000Z";
    expect(mergePaymentLogs([], [file]).map((item) => item.batch.file_name)).toEqual(["advances.xlsx"]);
    expect(mergeStoredPaymentLogs([], [file]).map((item) => item.batch.file_name)).toEqual(["advances.xlsx"]);
  });
});
