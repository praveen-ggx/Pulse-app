/**
 * Reference adapter for the Bulk Operations engine.
 * Preview stays in the app. Confirmation and correction are database RPCs
 * that may change UTR, request ID, transaction date, the paid amount and the payment mode.
 * Amount and mode writes need 20271118174500 and 20271118191000 on the database.
 */
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import { previewComplianceBulkUpdate } from "@/features/tripCompliance/services/complianceBulkUpdate.service";
import {
  validateComplianceRequestId,
  validateComplianceUtr,
} from "@/features/tripCompliance/utils/compliancePaymentReference.util";
import { validateComplianceTransactionDate } from "@/features/tripCompliance/utils/compliancePaymentDate.util";
import type { BulkPermissions, BulkPreviewRow, BulkTemplate } from "@/features/bulkOperations/utils/bulkOperation.model";
import { buildWritablePatch } from "@/features/bulkOperations/utils/bulkOperation.engine.util";
import { parseBulkPaymentDate, type BulkSheetRow } from "@/features/tripCompliance/utils/complianceBulkUpdate.util";

export const PAYMENT_UPDATE_FIELDS = ["utr", "requestId", "transactionDate", "amount", "mode"] as const;
export type PaymentUpdateField = (typeof PAYMENT_UPDATE_FIELDS)[number];

/** Fields left off the selection stay on the posted payment. */
export function preservedPaymentFields(selection: readonly PaymentUpdateField[]): Array<"amount" | "mode"> {
  return (["amount", "mode"] as const).filter((field) => !selection.includes(field));
}

/** Digits the database stores for a paid amount. Trailing zeros are dropped. */
export function formatPaidAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

export function parsePaidAmount(raw: string): { text: string } | { error: string } {
  const cleaned = raw.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { error: "Paid amount must be a number greater than zero, with up to 2 decimals." };
  }
  const value = Number(cleaned);
  if (!(value > 0)) {
    return { error: "Paid amount must be a number greater than zero, with up to 2 decimals." };
  }
  return { text: formatPaidAmount(value) };
}

const PAYMENT_MODE_IDS = ["CASH", "UPI", "BANK", "CHEQUE", "FUEL_CARD", "FASTAG", "CREDIT"] as const;

/** Canonical mode id. Accepts the id or the posted label (Bank Transfer, Cash, FASTag). */
export function parsePaymentMode(raw: string): { text: string } | { error: string } {
  const key = raw.trim().toUpperCase().replace(/[^A-Z]+/g, "_").replace(/^_|_$/g, "");
  const aliases: Record<string, (typeof PAYMENT_MODE_IDS)[number]> = {
    CASH: "CASH",
    UPI: "UPI",
    BANK: "BANK",
    BANK_TRANSFER: "BANK",
    CHEQUE: "CHEQUE",
    CHECK: "CHEQUE",
    FUEL_CARD: "FUEL_CARD",
    FUELCARD: "FUEL_CARD",
    FASTAG: "FASTAG",
    FAS_TAG: "FASTAG",
    CREDIT: "CREDIT",
  };
  const id = aliases[key];
  if (!id) {
    return { error: `Mode must be ${PAYMENT_MODE_IDS.join(", ")}.` };
  }
  return { text: id };
}

const PERMISSIONS: BulkPermissions = {
  upload: "trip_compliance.finance.view",
  review: "trip_compliance.finance.view",
  execute: "trip_compliance.finance.manage",
  correct: "trip_compliance.finance.manage",
};

const FIELD_COPY: Record<PaymentUpdateField, { label: string; aliases: string[]; example: string; format: string }> = {
  utr: {
    label: "UTR",
    aliases: ["utr", "reference", "payment reference"],
    example: "HDFC123456",
    format: "6–40 letters, numbers, - or /",
  },
  requestId: {
    label: "Request ID",
    aliases: ["request id", "request"],
    example: "REQ-1001",
    format: "3–40 letters, numbers, -, / or _",
  },
  transactionDate: {
    label: "Transaction date",
    aliases: ["date", "transaction date", "txn date", "paid at"],
    example: "2026-09-08",
    format: "YYYY-MM-DD or 08 Sep 2026",
  },
  amount: {
    label: "Amount",
    aliases: ["amount", "paid amount", "value", "paid value"],
    example: "9000",
    format: "Paid value, up to 2 decimals",
  },
  mode: {
    label: "Mode",
    aliases: ["mode", "payment mode"],
    example: "UPI",
    format: "UPI, BANK, CASH, CHEQUE, FUEL_CARD, FASTAG or CREDIT",
  },
};

export function paymentFieldTemplate(selection: readonly PaymentUpdateField[]): BulkTemplate {
  const chosen = PAYMENT_UPDATE_FIELDS.filter((field) => selection.includes(field));
  return {
    id: "compliance-payment-field-update",
    version: "1",
    title: "Compliance payment field update",
    operation: "field_update",
    matchField: "tripId",
    fields: [
      {
        key: "tripId",
        label: "Trip ID",
        required: true,
        aliases: ["trip id", "trip", "trip no"],
        example: "TRP-1001",
        format: "Trip code from the export, or the internal id",
        editable: false,
      },
      ...chosen.map((field) => ({
        key: field,
        label: FIELD_COPY[field].label,
        required: true,
        aliases: FIELD_COPY[field].aliases,
        example: FIELD_COPY[field].example,
        format: FIELD_COPY[field].format,
        editable: true,
      })),
    ],
  };
}

function tagStatus(tag: string): BulkPreviewRow["status"] {
  if (tag === "ready") return "ready";
  if (tag === "unchanged") return "unchanged";
  if (tag === "duplicate") return "duplicate";
  if (tag === "no_payment" || tag === "cash") return "blocked";
  return "invalid";
}

export async function previewPaymentFieldUpdate(params: {
  organizationId: string;
  category: ComplianceLedgerCategory;
  selection: readonly PaymentUpdateField[];
  records: Array<Record<string, string> & { rowIndex: number }>;
}): Promise<BulkPreviewRow[]> {
  const sheet: BulkSheetRow[] = params.records.map((record) => ({
    rowIndex: record.rowIndex,
    tripKey: record.tripId ?? "",
    amount: null,
    mode: "",
    date: parseBulkPaymentDate(record.transactionDate),
    utr: record.utr ?? "",
    remarks: "",
  }));
  const matched = await previewComplianceBulkUpdate({
    organizationId: params.organizationId,
    category: params.category,
    rows: sheet,
  });
  const preserved = preservedPaymentFields(params.selection);
  const keptNames = preserved.map((field) => (field === "amount" ? "Amount" : "Mode"));
  const kept = keptNames.length === 0 ? "" : `${keptNames.join(" and ")} stay as posted.`;
  return matched.map((row) => {
    const source = params.records.find((item) => item.rowIndex === row.rowIndex);
    const postedText = row.postedAmount == null || Number.isNaN(row.postedAmount) ? "" : formatPaidAmount(row.postedAmount);
    const parsedAmount = params.selection.includes("amount") ? parsePaidAmount(source?.amount ?? "") : null;
    const postedMode = parsePaymentMode(row.mode);
    const parsedMode = params.selection.includes("mode") ? parsePaymentMode(source?.mode ?? "") : null;
    const beforeMode = "text" in postedMode ? postedMode.text : row.mode;
    const before = {
      tripId: row.tripId ?? "",
      utr: row.currentUtr,
      requestId: row.requestId,
      transactionDate: row.currentDate,
      amount: postedText,
      mode: beforeMode,
    };
    const proposed = {
      utr: params.selection.includes("utr") ? row.nextUtr : row.currentUtr,
      requestId: params.selection.includes("requestId") ? (source?.requestId ?? "") : row.requestId,
      transactionDate: params.selection.includes("transactionDate") ? row.nextDate : row.currentDate,
      amount: parsedAmount && "text" in parsedAmount ? parsedAmount.text : postedText,
      mode: parsedMode && "text" in parsedMode ? parsedMode.text : beforeMode,
    };
    let status = tagStatus(row.tag);
    let message = row.detail;
    if (row.transactionId && row.tripId) {
      const cashWithoutUtr = row.tag === "cash" && !params.selection.includes("utr");
      const amountOnly = row.tag === "invalid"
        && /add a utr or a transaction date/i.test(row.detail)
        && !params.selection.includes("utr")
        && !params.selection.includes("transactionDate");
      const leavesCash = row.tag === "cash" && parsedMode && "text" in parsedMode && parsedMode.text !== "CASH";
      if (leavesCash || cashWithoutUtr || amountOnly || (!params.selection.includes("utr") && /utr/i.test(row.detail))) {
        status = "unchanged";
        message = "No selected field differs yet.";
      }
    }
    const patch = buildWritablePatch(params.selection, preserved, before, proposed);
    const nextMode = proposed.mode;
    const carriesUtr = params.selection.includes("utr") ? proposed.utr.trim() !== "" : before.utr.trim() !== "";
    if (params.selection.includes("mode") && nextMode === "CASH" && carriesUtr) {
      status = "invalid";
      message = "Cash payments don't carry a UTR.";
    }
    if (parsedMode && "error" in parsedMode) {
      status = "invalid";
      message = parsedMode.error;
    }
    if (parsedAmount && "error" in parsedAmount) {
      status = "invalid";
      message = parsedAmount.error;
    } else if (
      parsedAmount &&
      "text" in parsedAmount &&
      row.clientPrice != null &&
      row.clientPrice > 0 &&
      Number(parsedAmount.text) > row.clientPrice
    ) {
      status = "invalid";
      message = `Amount ₹${Number(parsedAmount.text).toLocaleString("en-IN")} exceeds the trip value ₹${row.clientPrice.toLocaleString("en-IN")}.`;
    }
    for (const [key, value] of Object.entries(patch)) {
      if (key === "amount" || key === "mode") continue;
      const invalid = key === "utr"
        ? validateComplianceUtr(value)
        : key === "requestId"
          ? validateComplianceRequestId(value)
          : validateComplianceTransactionDate(value);
      if (invalid) {
        status = "invalid";
        message = invalid;
      }
    }
    if ((status === "ready" || status === "unchanged") && row.tripId && row.transactionId) {
      if (Object.keys(patch).length === 0) {
        status = "unchanged";
        message = "Already matches the posted payment.";
      } else {
        status = "ready";
        message = `Will update ${Object.keys(patch).join(", ")}.${kept ? ` ${kept}` : ""}`;
      }
    }
    return {
      rowIndex: row.rowIndex,
      matchKey: row.tripLabel,
      recordId: row.transactionId,
      status,
      message,
      before,
      proposed,
      preserved: {
        ...(preserved.includes("amount") ? { amount: before.amount } : {}),
        ...(preserved.includes("mode") ? { mode: before.mode } : {}),
      },
      included: status === "ready",
    };
  });
}

export function revalidatePaymentFields(): never {
  throw new Error("Payment revalidation runs inside the bulk execution RPC.");
}

export function applyPaymentFieldPatch(): never {
  throw new Error("Payment updates run inside the bulk execution RPC.");
}

export const compliancePaymentBulkPermissions = PERMISSIONS;
