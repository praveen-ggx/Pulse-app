/**
 * Reference adapter for the Bulk Operations engine.
 * Preview stays in the app. Confirmation and correction are database RPCs
 * that may change only UTR, request ID and transaction date.
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

export const PAYMENT_UPDATE_FIELDS = ["utr", "requestId", "transactionDate"] as const;
export type PaymentUpdateField = (typeof PAYMENT_UPDATE_FIELDS)[number];

export const PAYMENT_PRESERVED_FIELDS = ["amount", "mode"] as const;

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
  return matched.map((row) => {
    const before = {
      tripId: row.tripId ?? "",
      utr: row.currentUtr,
      requestId: row.requestId,
      transactionDate: row.currentDate,
      amount: row.amount == null || Number.isNaN(row.amount) ? "" : String(row.amount),
      mode: row.mode,
    };
    const proposed = {
      utr: params.selection.includes("utr") ? row.nextUtr : row.currentUtr,
      requestId: params.selection.includes("requestId") ? (params.records.find((item) => item.rowIndex === row.rowIndex)?.requestId ?? "") : row.requestId,
      transactionDate: params.selection.includes("transactionDate") ? row.nextDate : row.currentDate,
    };
    let status = tagStatus(row.tag);
    let message = row.detail;
    if (!params.selection.includes("utr") && row.transactionId && /utr/i.test(row.detail)) {
      status = "unchanged";
      message = "No selected field differs yet.";
    }
    const patch = buildWritablePatch(params.selection, PAYMENT_PRESERVED_FIELDS, before, proposed);
    for (const [key, value] of Object.entries(patch)) {
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
        message = `Will update ${Object.keys(patch).join(", ")}. Amount and mode stay as posted.`;
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
      preserved: { amount: before.amount, mode: before.mode },
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
