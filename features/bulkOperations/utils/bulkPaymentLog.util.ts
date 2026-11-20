import type { BatchStatus } from "@/features/bulkOperations/utils/bulkOperation.model";
import type { StoredBatch } from "@/features/bulkOperations/services/bulkHistory.service";
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";

export type PendingPaymentLog = {
  batch: StoredBatch;
  rows: Array<Record<string, unknown>>;
};

export const PAYMENT_POST_ADAPTER_ID = "compliance-payment-post";

type LogRow = {
  rowIndex: number;
  matchKey: string;
  recordId: string | null;
  status: string;
  message: string;
  before?: Record<string, string>;
  proposed?: Record<string, string>;
};

function batchStatus(applied: number, failed: number): BatchStatus {
  if (failed === 0) return "completed";
  if (applied === 0) return "failed";
  return "partial";
}

function entry(params: {
  id: string;
  adapterId: string;
  fileName: string;
  category: ComplianceLedgerCategory;
  status: BatchStatus;
  selection: string[];
  summary: Record<string, unknown>;
  rows: LogRow[];
}): PendingPaymentLog {
  const now = new Date().toISOString();
  return {
    batch: {
      id: params.id,
      file_name: params.fileName || "Payment file",
      status: params.status,
      created_at: now,
      execution_started_at: now,
      summary: { category: params.category, ...params.summary },
      field_selection: params.selection,
      adapter_id: params.adapterId,
      confirmed_by: null,
      uploaded_by: null,
      file_sha256: null,
      execution_owner: null,
    },
    rows: params.rows.map((row) => ({
      id: `${params.id}:${row.rowIndex}`,
      match_key: row.matchKey,
      record_id: row.recordId,
      status: row.status,
      message: row.message,
      before_values: row.before ?? {},
      proposed_values: row.proposed ?? {},
    })),
  };
}

export function paymentPostLogEntry(params: {
  fileName: string;
  category: ComplianceLedgerCategory;
  rows: Array<{
    rowIndex: number;
    matchKey: string;
    recordId: string | null;
    amount: number | null;
    mode: string;
    date: string;
    utr: string;
    error: string | null;
  }>;
}): PendingPaymentLog {
  const posted = params.rows.filter((row) => !row.error).length;
  const failed = params.rows.length - posted;
  const amount = params.rows.reduce((sum, row) => sum + (row.error ? 0 : row.amount ?? 0), 0);
  const reason = params.rows.find((row) => row.error)?.error;
  return entry({
    id: `local-${Date.now()}`,
    adapterId: PAYMENT_POST_ADAPTER_ID,
    fileName: params.fileName,
    category: params.category,
    status: batchStatus(posted, failed),
    selection: [],
    summary: { kind: "post", posted, failed, amount, ...(reason ? { reason } : {}) },
    rows: params.rows.map((row) => ({
      rowIndex: row.rowIndex,
      matchKey: row.matchKey,
      recordId: row.recordId,
      status: row.error ? "failed" : "applied",
      message: row.error ?? "Posted.",
      proposed: {
        amount: row.amount == null ? "" : String(row.amount),
        mode: row.mode,
        transactionDate: row.date,
        utr: row.utr,
      },
    })),
  });
}

export function fieldUpdateLogEntry(params: {
  fileName: string;
  category: ComplianceLedgerCategory;
  selection: readonly string[];
  status: BatchStatus | null;
  batchId: string | null;
  rows: Array<{
    rowIndex: number;
    matchKey: string;
    recordId: string | null;
    status: string;
    message: string;
    before: Record<string, string>;
    proposed: Record<string, string>;
  }>;
}): PendingPaymentLog {
  const status = params.status ?? "completed";
  return entry({
    id: params.batchId || `local-${Date.now()}`,
    adapterId: "compliance-payment-field-update",
    fileName: params.fileName,
    category: params.category,
    status,
    selection: [...params.selection],
    summary: { kind: "field_update" },
    rows: params.rows.map((row) => ({
      rowIndex: row.rowIndex,
      matchKey: row.matchKey || "Row",
      recordId: row.recordId,
      status: row.status === "ready" ? (status === "failed" ? "failed" : "applied") : row.status,
      message: row.status === "ready" && status !== "failed" ? "Updated." : row.message,
      before: row.before,
      proposed: row.proposed,
    })),
  });
}

function sameConfirmation(local: StoredBatch, server: StoredBatch): boolean {
  if (!local.id.startsWith("local-")) return false;
  if (local.file_name !== server.file_name || local.adapter_id !== server.adapter_id) return false;
  const left = new Date(local.created_at).getTime();
  const right = new Date(server.created_at).getTime();
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 3 * 60 * 1000;
}

export type PostedCompliancePayment = {
  id: string;
  tripLabel: string;
  supplierName?: string;
  supplierAvatarUrl?: string | null;
  supplierAvatarSeed?: string | null;
  supplierOrganizationImageUrl?: string | null;
  supplierOrganizationAvatarSeed?: string | null;
  amount: number;
  mode: string;
  utr: string;
  date: string;
  createdAt: string;
  createdBy: string | null;
};

export type PaymentLogFilters = {
  from: string;
  to: string;
  supplier: string;
};

export function paymentLogDay(value: string): string {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!dmy) return "";
  return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
}

function localDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function batchMatchesLogFilters(
  batch: StoredBatch,
  rows: Array<Record<string, unknown>>,
  filters: PaymentLogFilters,
): boolean {
  const from = paymentLogDay(filters.from);
  const to = paymentLogDay(filters.to);
  const day = localDay(batch.created_at);
  if (from && day < from) return false;
  if (to && day > to) return false;
  const supplier = filters.supplier.trim().toLowerCase();
  if (!supplier) return true;
  const names = [
    String((batch.summary as { supplier?: string }).supplier ?? ""),
    batch.file_name,
    ...rows.map((row) => String((row.proposed_values as { supplier?: string } | undefined)?.supplier ?? "")),
  ];
  return names.some((name) => name.toLowerCase().includes(supplier));
}

export function previewRowMatchesFilters(row: Record<string, unknown>, filters: PaymentLogFilters): boolean {
  const from = paymentLogDay(filters.from);
  const to = paymentLogDay(filters.to);
  const proposed = (row.proposed_values ?? {}) as Record<string, string>;
  const day = paymentLogDay(proposed.transactionDate ?? "") || localDay(String(row.created_at ?? ""));
  if ((from || to) && day) {
    if (from && day < from) return false;
    if (to && day > to) return false;
  }
  const supplier = filters.supplier.trim().toLowerCase();
  if (!supplier) return true;
  const name = `${proposed.supplier ?? ""} ${String(row.match_key ?? "")}`;
  return name.toLowerCase().includes(supplier);
}

/** Payments saved together stay one file. A later payment is its own line. */
export function groupPostedPayments(
  payments: PostedCompliancePayment[],
  category: ComplianceLedgerCategory,
): PendingPaymentLog[] {
  const groups: PostedCompliancePayment[][] = [];
  for (const payment of payments) {
    const current = groups[groups.length - 1];
    const previous = current?.[current.length - 1];
    const samePerson = previous?.createdBy === payment.createdBy;
    const close = previous != null && Math.abs(Date.parse(previous.createdAt) - Date.parse(payment.createdAt)) <= 5000;
    if (current && samePerson && close) current.push(payment);
    else groups.push([payment]);
  }
  return groups.map((rows) => {
    const first = rows[0];
    const amount = rows.reduce((sum, row) => sum + row.amount, 0);
    const title = rows.length === 1 ? first.tripLabel : `${first.tripLabel} · ${rows.length} payments`;
    return entry({
      id: first.id,
      adapterId: PAYMENT_POST_ADAPTER_ID,
      fileName: title,
      category,
      status: "completed",
      selection: [],
      summary: { kind: "post", posted: rows.length, failed: 0, amount, supplier: first.supplierName ?? "" },
      rows: rows.map((row) => ({
        rowIndex: 1,
        matchKey: row.tripLabel,
        recordId: row.id,
        status: "applied",
        message: "Posted.",
        proposed: {
          amount: `₹${row.amount.toLocaleString("en-IN")}`,
          mode: row.mode,
          transactionDate: row.date,
          utr: row.utr,
          supplier: row.supplierName ?? "",
          supplierAvatarUrl: row.supplierAvatarUrl ?? "",
          supplierAvatarSeed: row.supplierAvatarSeed ?? "",
          supplierOrganizationImageUrl: row.supplierOrganizationImageUrl ?? "",
          supplierOrganizationAvatarSeed: row.supplierOrganizationAvatarSeed ?? "",
        },
      })),
    });
  }).map((item, index) => {
    const source = groups[index];
    return {
      ...item,
      batch: {
        ...item.batch,
        created_at: source[0].createdAt,
        execution_started_at: source[0].createdAt,
        confirmed_by: source[0].createdBy,
        uploaded_by: source[0].createdBy,
      },
      rows: item.rows.map((row, rowIndex) => ({ ...row, id: source[rowIndex].id })),
    };
  });
}

function paymentKey(values: Record<string, string>): string {
  const amount = (values.amount ?? "").replace(/[₹,\s]/g, "");
  return `${(values.utr ?? "").replace(/\s/g, "").toUpperCase()}|${amount}`;
}

/** UTR plus amount. Empty when either side is missing, so a blank UTR cannot attach the wrong file. */
export function paymentFileKey(values: Record<string, string> | undefined): string {
  const key = paymentKey(values ?? {});
  const [utr, amount] = key.split("|");
  return utr && amount ? key : "";
}

/** The bulk file that contains every payment in this log entry, newest file first. */
export function findBulkFileForPayments(
  payment: PendingPaymentLog,
  files: PendingPaymentLog[],
): PendingPaymentLog | null {
  const keys = payment.rows
    .map((row) => paymentFileKey(row.proposed_values as Record<string, string>))
    .filter(Boolean);
  if (keys.length === 0) return null;
  const hits = files.filter((file) => {
    if (file.batch.id === payment.batch.id) return false;
    const fileKeys = new Set(file.rows.map((row) => paymentFileKey(row.proposed_values as Record<string, string>)));
    return keys.every((key) => fileKeys.has(key));
  });
  hits.sort((a, b) => b.batch.created_at.localeCompare(a.batch.created_at));
  return hits[0] ?? null;
}

export function withoutLedgerEchoes(pending: PendingPaymentLog[], posted: PendingPaymentLog[]): PendingPaymentLog[] {
  const keys = new Set(posted.flatMap((item) => item.rows.map((row) => paymentKey(row.proposed_values as Record<string, string>))));
  return pending.filter((item) => {
    if (!item.batch.id.startsWith("local-")) return true;
    if ((item.batch.summary as { kind?: string }).kind !== "post") return true;
    return !item.rows.some((row) => keys.has(paymentKey(row.proposed_values as Record<string, string>)));
  });
}

export function mergePaymentLogs(server: StoredBatch[], pending: PendingPaymentLog[]): PendingPaymentLog[] {
  const kept = pending.filter((item) => {
    if (server.some((batch) => batch.id === item.batch.id)) return false;
    return !server.some((batch) => sameConfirmation(item.batch, batch));
  });
  const serverEntries = server.map((batch) => ({ batch, rows: [] as Array<Record<string, unknown>> }));
  return [...kept, ...serverEntries].sort((a, b) => {
    const byTime = b.batch.created_at.localeCompare(a.batch.created_at);
    return byTime === 0 ? b.batch.id.localeCompare(a.batch.id) : byTime;
  });
}

const storageKey = (organizationId: string, category: string) =>
  `pulse.bulkPaymentLog.${organizationId}.${category}`;

function browserStore(kind: "local" | "session"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readStore(store: Storage | null, key: string): PendingPaymentLog[] {
  if (!store) return [];
  try {
    const raw = store.getItem(key);
    const parsed = raw ? JSON.parse(raw) as PendingPaymentLog[] : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Files confirmed in this browser. A newer copy of the same file replaces the older one. */
export function mergeStoredPaymentLogs(saved: PendingPaymentLog[], recent: PendingPaymentLog[]): PendingPaymentLog[] {
  const byId = new Map<string, PendingPaymentLog>();
  for (const item of [...saved, ...recent]) {
    if (!item?.batch?.id) continue;
    const current = byId.get(item.batch.id);
    if (!current || String(item.batch.created_at) > String(current.batch.created_at)) byId.set(item.batch.id, item);
  }
  return [...byId.values()]
    .sort((a, b) => String(b.batch.created_at).localeCompare(String(a.batch.created_at)))
    .slice(0, 30);
}

export function readPendingPaymentLogs(organizationId: string, category: string): PendingPaymentLog[] {
  if (!organizationId) return [];
  const key = storageKey(organizationId, category);
  const saved = readStore(browserStore("local"), key);
  const recent = readStore(browserStore("session"), key);
  const merged = mergeStoredPaymentLogs(saved, recent);
  const local = browserStore("local");
  if (local && merged.length > 0 && JSON.stringify(merged) !== JSON.stringify(saved)) {
    try {
      local.setItem(key, JSON.stringify(merged));
    } catch {
      // The log still renders from memory when the browser refuses storage.
    }
  }
  return merged;
}

export function writePendingPaymentLogs(organizationId: string, category: string, entries: PendingPaymentLog[]): void {
  if (!organizationId) return;
  const kept = entries.filter((item) => item.batch.id.startsWith("local-") || item.rows.length > 0).slice(0, 30);
  const key = storageKey(organizationId, category);
  const payload = JSON.stringify(kept);
  for (const store of [browserStore("local"), browserStore("session")]) {
    if (!store) continue;
    try {
      store.setItem(key, payload);
    } catch {
      // Ignore a full or blocked store. The other copy may still be available.
    }
  }
}
