/**
 * Pure derivations for the Compliance table view (Dinesh sir's change set):
 * E-way Bill column, per-group Pending/Approved status, Verify gating and
 * decline state. No I/O — everything comes from the already-loaded summary.
 */
import {
  formatVaultDocDate,
  readStoredInvoiceNumber,
  vaultDocDateToIso,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import { parseEwayFieldEntries } from "@/features/trips/services/ewayBillFields.util";
import { lrNumbersFromDocumentNumber } from "@/features/trips/utils/hardCopyPodLrSelection.util";
import type {
  ComplianceDocumentRow,
  ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";
import {
  deriveComplianceDocumentRows,
  labelForDocType,
  type ComplianceDocRow,
} from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import { complianceRejectQueueDestination } from "@/features/tripCompliance/utils/complianceRejectReason.util";

export type ComplianceEwayBillSummary = {
  number: string | null;
  validTillRaw: string | null;
  validTillIso: string | null;
  validTillLabel: string | null;
  expired: boolean;
  extraCount: number;
  /** Every e-way number on the newest bill row, in stored order. */
  numbers: string[];
};

export type ComplianceGroupStatus = {
  status: "approved" | "pending";
  approved: number;
  total: number;
};

export type ComplianceVerifyEligibility = {
  allowed: boolean;
  reason: string | null;
};

/** Local-date `Date` for `YYYY-MM-DD`, or null when it is not a real calendar date. */
function localDateFromIso(iso: string): Date | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/**
 * Same row Trip Detail shows (`useTripDetail`): newest `eway_bill` row whose
 * `document_number` parses to ≥1 entry. Values are shown as stored; an
 * unparseable validTill is shown raw and never treated as expired.
 */
export function deriveComplianceEwayBill(
  documents: ComplianceDocumentRow[],
  now: Date = new Date(),
): ComplianceEwayBillSummary {
  const empty: ComplianceEwayBillSummary = {
    number: null,
    validTillRaw: null,
    validTillIso: null,
    validTillLabel: null,
    expired: false,
    extraCount: 0,
    numbers: [],
  };
  let entries: ReturnType<typeof parseEwayFieldEntries> = [];
  // Trip Detail loads trip_documents with `order by uploaded_at desc` (Postgres:
  // nulls first); the compliance fetch is unordered, so mirror that here.
  const uploadedMs = (doc: ComplianceDocumentRow): number => {
    const ms = doc.uploaded_at ? Date.parse(doc.uploaded_at) : Number.NaN;
    return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
  };
  const ewayDocs = documents
    .filter((doc) => doc.document_type === "eway_bill")
    .sort((a, b) => {
      const ta = uploadedMs(a);
      const tb = uploadedMs(b);
      return ta === tb ? 0 : tb > ta ? 1 : -1;
    });
  for (const doc of ewayDocs) {
    const parsed = parseEwayFieldEntries(doc.document_number);
    if (parsed.length > 0) {
      entries = parsed;
      break;
    }
  }
  const first = entries[0];
  if (!first) return empty;

  const number = first.ewayNo.trim() || null;
  const validTillRaw = first.validTill.trim() || null;
  let validTillIso: string | null = null;
  let expired = false;
  if (validTillRaw) {
    const iso = vaultDocDateToIso(validTillRaw);
    const endOfDay = iso ? localDateFromIso(iso) : null;
    if (iso && endOfDay) {
      validTillIso = iso;
      expired = endOfDay.getTime() < now.getTime();
    }
  }
  const validTillLabel = validTillRaw
    ? validTillIso
      ? formatVaultDocDate(validTillRaw) || validTillRaw
      : validTillRaw
    : null;

  const numbers = entries
    .map((entry) => entry.ewayNo.trim())
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);

  return {
    number,
    validTillRaw,
    validTillIso,
    validTillLabel,
    expired,
    extraCount: Math.max(0, numbers.length - 1),
    numbers,
  };
}

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Every number ground ops typed for this document type.
 * E-way: each bill on the newest row. LR: each number, including a typed range.
 * Invoice: each uploaded invoice number, oldest first.
 */
export function complianceVaultDocNumbers(
  documents: ComplianceDocumentRow[],
  type: string,
): string[] {
  const kind = type.trim().toLowerCase();
  if (kind === "eway_bill") return deriveComplianceEwayBill(documents).numbers;
  const matches = documents.filter((doc) => (doc.document_type ?? "").toLowerCase() === kind);
  if (kind === "invoice") {
    const ordered = [...matches].sort((a, b) => (a.uploaded_at ?? "").localeCompare(b.uploaded_at ?? ""));
    return uniqueInOrder(ordered.map((doc) => readStoredInvoiceNumber(doc.document_number)));
  }
  if (kind === "lr") {
    return uniqueInOrder(matches.flatMap((doc) => lrNumbersFromDocumentNumber(doc.document_number)));
  }
  return [];
}

/** Single-line form of {@link complianceVaultDocNumbers}. Export uses this with a separator. */
export function complianceVaultDocNumber(
  documents: ComplianceDocumentRow[],
  type: string,
): string {
  return complianceVaultDocNumbers(documents, type).join(", ");
}

/** Approved iff the group has required rows and every one is `verified`. */
export function deriveComplianceGroupStatus(rows: ComplianceDocRow[]): ComplianceGroupStatus {
  const required = rows.filter((row) => row.required);
  const approved = required.filter((row) => row.status === "verified").length;
  const total = required.length;
  return {
    status: total > 0 && approved === total ? "approved" : "pending",
    approved,
    total,
  };
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * Mirrors the `mark_trip_compliance_verified` server gate: required trip docs
 * (LR, E-way Bill, Invoice) verified. Vehicle/driver docs do not block (D2).
 * Finance-declined (Verified Reject) trips may be re-verified even though
 * compliance_verified_at is still set.
 */
export function canVerifyTrip(summary: ComplianceTripSummary): ComplianceVerifyEligibility {
  if (summary.complianceVerifiedAt && !isFinanceDeclinedTrip(summary)) {
    return { allowed: false, reason: "Trip compliance already verified" };
  }
  const pending = deriveComplianceDocumentRows(summary.documents).filter(
    (row) => row.required && row.status !== "verified",
  );
  if (pending.length === 0) return { allowed: true, reason: null };
  return {
    allowed: false,
    reason: `Approve ${joinLabels(pending.map((row) => labelForDocType(row.type)))} first`,
  };
}

/** A decline is shown only while the trip is not yet compliance-verified. */
export function isComplianceDeclineActive(summary: ComplianceTripSummary): boolean {
  return Boolean(summary.complianceDeclinedAt) && !summary.complianceVerifiedAt;
}

/**
 * Finance reject of an already-verified trip. A compliance decline that was
 * later cleared by Verify keeps the old declined_at as history (it is earlier
 * than verified_at) and must not count.
 */
export function isFinanceDeclinedTrip(summary: ComplianceTripSummary): boolean {
  if (!summary.complianceVerifiedAt || !summary.complianceDeclinedAt) return false;
  const verified = Date.parse(summary.complianceVerifiedAt);
  const declined = Date.parse(summary.complianceDeclinedAt);
  if (Number.isNaN(verified) || Number.isNaN(declined)) return false;
  return declined >= verified;
}

/** Verified reject whose reason routes to the Pending Docs → Rejected subtab. */
export function isFinanceDeclinedForPendingDocs(summary: ComplianceTripSummary): boolean {
  return (
    isFinanceDeclinedTrip(summary) &&
    complianceRejectQueueDestination(summary.complianceDeclineReason) === "pending_for_docs"
  );
}

/** Verified reject whose reason routes to Compliance Pending → Declined by finance. */
export function isFinanceDeclinedForCompliancePending(summary: ComplianceTripSummary): boolean {
  return (
    isFinanceDeclinedTrip(summary) &&
    complianceRejectQueueDestination(summary.complianceDeclineReason) === "compliance_pending"
  );
}

/**
 * Pre-verify hold. Shown on Docs Follow Up → Compliance Hold whether the trip
 * is still missing files or already in Ready to Verify. The same trip also
 * stays on Ready to Verify → Compliance Hold.
 */
export function isPendingDocsComplianceHold(summary: ComplianceTripSummary): boolean {
  if (!isComplianceDeclineActive(summary)) return false;
  return summary.stage === "pending_for_docs" || summary.stage === "compliance_pending";
}
