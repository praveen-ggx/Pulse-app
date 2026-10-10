import Theme from "@/constants/Theme";
import type {
    ComplianceChecklistTone,
    ComplianceStage,
    ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";
import { isFinanceDeclinedTrip } from "@/features/tripCompliance/utils/complianceTableStatus.util";

export type ComplianceTone = {
  fg: string;
  bg: string;
};

export const COMPLIANCE_STAGE_TONE: Record<ComplianceStage, ComplianceTone> = {
  pending_for_docs: { fg: Theme.complianceStageDocsFg, bg: Theme.complianceStageDocsBg },
  compliance_pending: { fg: Theme.complianceStagePendingFg, bg: Theme.complianceStagePendingBg },
  compliance_verified: { fg: Theme.complianceStageSuccessFg, bg: Theme.complianceStageSuccessBg },
  advance_payment_processed: { fg: Theme.complianceStageSuccessFg, bg: Theme.complianceStageSuccessBg },
  hard_copy_pod_received: { fg: Theme.complianceStagePendingFg, bg: Theme.complianceStagePendingBg },
  balance_pending: { fg: Theme.complianceStageBalanceFg, bg: Theme.complianceStageBalanceBg },
  payment_settled: { fg: Theme.complianceStageSuccessFg, bg: Theme.complianceStageSuccessBg },
};

export const COMPLIANCE_FILTER_COUNT_TONE: Record<ComplianceStage | "all", string> = {
  all: Theme.textPrimaryDark,
  pending_for_docs: Theme.complianceStageDocsFg,
  compliance_pending: Theme.complianceStagePendingFg,
  compliance_verified: Theme.complianceStageSuccessFg,
  advance_payment_processed: Theme.textMuted,
  hard_copy_pod_received: Theme.complianceStageInfoFg,
  balance_pending: Theme.complianceStageBalanceFg,
  payment_settled: Theme.textMuted,
};

export const COMPLIANCE_GROUP_TONE: Record<ComplianceChecklistTone, { bg: string; fg: string; dot: string; emptyDot: string }> = {
  success: {
    bg: Theme.complianceGroupSuccessBg,
    fg: Theme.complianceGroupSuccessFg,
    dot: Theme.complianceGroupSuccessFg,
    emptyDot: Theme.complianceGroupSuccessDot,
  },
  warning: {
    bg: Theme.complianceGroupWarningBg,
    fg: Theme.complianceGroupWarningFg,
    dot: Theme.complianceGroupWarningFg,
    emptyDot: Theme.complianceGroupWarningDot,
  },
  danger: {
    bg: Theme.complianceGroupDangerBg,
    fg: Theme.complianceGroupDangerFg,
    dot: Theme.complianceGroupDangerFg,
    emptyDot: Theme.complianceGroupDangerDot,
  },
};

export function groupToneVisual(tone: ComplianceChecklistTone | null | undefined) {
  return COMPLIANCE_GROUP_TONE[tone ?? "warning"] ?? COMPLIANCE_GROUP_TONE.warning;
}

export function stageToneVisual(stage: ComplianceStage | null | undefined) {
  return (stage && COMPLIANCE_STAGE_TONE[stage]) ?? COMPLIANCE_STAGE_TONE.compliance_pending;
}

export type CompliancePaymentStatusVisual = {
  label: string;
  tone: ComplianceTone;
};

export function paymentStatusVisual(summary: ComplianceTripSummary): CompliancePaymentStatusVisual {
  if (summary.balance || summary.stage === "payment_settled") {
    return { label: "Settled", tone: COMPLIANCE_STAGE_TONE.payment_settled };
  }
  if (summary.stage === "balance_pending") {
    return { label: "Balance Pending", tone: COMPLIANCE_STAGE_TONE.balance_pending };
  }
  if (summary.stage === "hard_copy_pod_received") {
    return { label: "Awaiting POD", tone: COMPLIANCE_STAGE_TONE.hard_copy_pod_received };
  }
  if (summary.advance || summary.stage === "advance_payment_processed") {
    return { label: "Advance Processed", tone: COMPLIANCE_STAGE_TONE.advance_payment_processed };
  }
  return {
    label: "Pending",
    tone: COMPLIANCE_STAGE_TONE.pending_for_docs,
  };
}

/**
 * Header verification pill. Prefer derived compliance stage so payment-progress
 * trips (advance / awaiting POD) are not mislabeled as Pending Docs just
 * because LR/E-way/Invoice are still missing.
 */
export type ComplianceVerificationStatusVisual = {
  label: string;
  tone: ComplianceTone;
  kind: "pending_docs" | "compliance_pending" | "verified" | "exception";
};

/**
 * Verified trip rejected by finance (decline at/after verify) — stays in Verified,
 * shown as Rejected (red). Same rule as isFinanceDeclinedTrip; drives the card pill,
 * Export counts and report status.
 */
export function isComplianceVerifiedRejected(
  summary: Pick<ComplianceTripSummary, "complianceVerifiedAt" | "complianceDeclinedAt">,
): boolean {
  return isFinanceDeclinedTrip(summary as ComplianceTripSummary);
}

export function verificationStatusVisual(
  summary: ComplianceTripSummary,
): ComplianceVerificationStatusVisual {
  // Finance reject after verify: stay in Verified stage, show Rejected (red).
  // A compliance decline that was later verified is history, not a reject.
  if (isComplianceVerifiedRejected(summary)) {
    return {
      label: "Rejected",
      tone: COMPLIANCE_STAGE_TONE.pending_for_docs,
      kind: "verified",
    };
  }
  if (summary.complianceVerifiedAt) {
    if (summary.complianceDecision === "approved_with_exception") {
      return {
        label: "Exception",
        tone: COMPLIANCE_STAGE_TONE.hard_copy_pod_received,
        kind: "exception",
      };
    }
    return {
      label: "Verified",
      tone: COMPLIANCE_STAGE_TONE.compliance_verified,
      kind: "verified",
    };
  }
  // Decline before verify: same kind of status tag as finance Rejected.
  if (summary.complianceDeclinedAt) {
    const stillPendingDocs =
      summary.stage === "pending_for_docs" || summary.documentCounts.total === 0;
    return {
      label: "Compliance Hold",
      tone: COMPLIANCE_STAGE_TONE.pending_for_docs,
      kind: stillPendingDocs ? "pending_docs" : "compliance_pending",
    };
  }
  if (summary.stage === "hard_copy_pod_received") {
    return {
      label: "Awaiting POD",
      tone: COMPLIANCE_STAGE_TONE.hard_copy_pod_received,
      kind: "compliance_pending",
    };
  }
  if (summary.stage === "advance_payment_processed") {
    return {
      label: "Advance Processed",
      tone: COMPLIANCE_STAGE_TONE.advance_payment_processed,
      kind: "compliance_pending",
    };
  }
  if (summary.stage === "balance_pending") {
    return {
      label: "Balance Pending",
      tone: COMPLIANCE_STAGE_TONE.balance_pending,
      kind: "compliance_pending",
    };
  }
  if (summary.stage === "payment_settled") {
    return {
      label: "Settled",
      tone: COMPLIANCE_STAGE_TONE.payment_settled,
      kind: "verified",
    };
  }
  if (summary.stage === "pending_for_docs" || summary.documentCounts.total === 0) {
    return {
      label: "Docs Follow Up",
      tone: COMPLIANCE_STAGE_TONE.pending_for_docs,
      kind: "pending_docs",
    };
  }
  return {
    label: "Ready to Verify",
    tone: COMPLIANCE_STAGE_TONE.compliance_pending,
    kind: "compliance_pending",
  };
}

/** Trip Operations status on a Compliance Pending card — not the compliance stage. */
export function tripOpsStatusBadge(
  status: string | null | undefined,
): { label: string; tone: ComplianceTone } | null {
  const raw = (status ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "in_progress" || raw === "loading") {
    return { label: "Loading", tone: COMPLIANCE_STAGE_TONE.compliance_pending };
  }
  if (raw === "in_transit" || raw === "in transit") {
    return {
      label: "In Transit",
      tone: { fg: Theme.complianceStageInfoFg, bg: Theme.complianceStageInfoBg },
    };
  }
  if (raw === "at_destination" || raw === "at_drop") {
    return { label: "At Destination", tone: COMPLIANCE_STAGE_TONE.balance_pending };
  }
  if (raw === "completed" || raw === "delivered" || raw === "done") {
    return { label: "Completed", tone: COMPLIANCE_STAGE_TONE.compliance_verified };
  }
  if (raw === "cancelled" || raw === "canceled") {
    return { label: "Cancelled", tone: COMPLIANCE_STAGE_TONE.pending_for_docs };
  }
  const label = raw
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return { label, tone: COMPLIANCE_STAGE_TONE.compliance_pending };
}

/** True when payment/pipeline progressed past verification — show both pills. */
export function shouldShowPaymentStatusPill(summary: ComplianceTripSummary): boolean {
  if (summary.advance || summary.balance) return true;
  return (
    summary.stage === "advance_payment_processed" ||
    summary.stage === "hard_copy_pod_received" ||
    summary.stage === "balance_pending" ||
    summary.stage === "payment_settled"
  );
}

export function splitPlace(value: string | null | undefined): { city: string; region: string } {
  const raw = (value ?? "").trim();
  if (!raw) return { city: "—", region: "" };
  const comma = raw.indexOf(",");
  if (comma === -1) return { city: raw, region: "" };
  return {
    city: raw.slice(0, comma).trim() || raw,
    region: raw.slice(comma + 1).trim(),
  };
}

export function pendingDocumentsCopy(pendingCount: number, verified: number, total: number): string {
  if (total === 0) return "No documents uploaded yet";
  if (pendingCount === 0) return "All documents verified";
  if (verified === 0) {
    return `${pendingCount} document${pendingCount === 1 ? "" : "s"} need verification`;
  }
  return `${pendingCount} document${pendingCount === 1 ? "" : "s"} pending`;
}

export function matchesComplianceTripSearch(
  summary: ComplianceTripSummary,
  query: string,
  extraHaystacks: Array<string | null | undefined> = [],
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const compactNeedle = needle.replace(/[\s-]/g, "");
  const looseNeedle = collapseRepeatedLetters(compactNeedle);
  const trip = summary.trip;
  const haystacks = [
    complianceTripDisplayId(trip),
    trip.display_trip_id,
    trip.trip_number,
    trip.booking_ref,
    trip.client_name,
    trip.supplier_name,
    trip.vehicle_display_number,
    trip.driver_display_name,
    trip.pickup_area,
    trip.drop_location,
    trip.id,
    ...extraHaystacks,
  ]
    .map((value) => (value ?? "").trim().toLowerCase())
    .filter((value) => value.length > 0);
  if (haystacks.length === 0) return false;

  const joined = haystacks.join(" ");
  const joinedCompact = joined.replace(/[\s-]/g, "");
  const joinedLoose = collapseRepeatedLetters(joinedCompact);

  if (
    joined.includes(needle) ||
    joinedCompact.includes(compactNeedle) ||
    (looseNeedle.length >= 4 && joinedLoose.includes(looseNeedle))
  ) {
    return true;
  }

  // Multi-word queries: every token must appear somewhere (order-independent).
  const tokens = needle.split(/\s+/).filter((token) => token.length >= 2);
  if (tokens.length <= 1) return false;
  return tokens.every((token) => {
    const compactToken = token.replace(/[\s-]/g, "");
    const looseToken = collapseRepeatedLetters(compactToken);
    return (
      joined.includes(token) ||
      joinedCompact.includes(compactToken) ||
      (looseToken.length >= 4 && joinedLoose.includes(looseToken))
    );
  });
}

/** Collapse aa→a so slight spelling variants still match (e.g. Venkateswaraa / Venkateswara). */
function collapseRepeatedLetters(value: string): string {
  return value.replace(/(.)\1+/g, "$1");
}

/** Searchable supplier labels for Compliance queue (name + company + contact). */
export function supplierComplianceSearchLabels(supplier: {
  name?: string | null;
  company_name?: string | null;
  contact_person?: string | null;
} | null | undefined): string {
  if (!supplier) return "";
  return [supplier.name, supplier.company_name, supplier.contact_person]
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(" ");
}

export function complianceTripDisplayId(trip: {
  display_trip_id?: string | null;
  trip_number?: string | null;
  booking_ref?: string | null;
  id: string;
}): string {
  return trip.display_trip_id?.trim() || trip.trip_number?.trim() || trip.booking_ref?.trim() || trip.id.slice(0, 8);
}

export function formatComplianceTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${day} ${month} ${year}, ${String(hours).padStart(2, "0")}:${minutes} ${suffix}`;
}

export function complianceEventAt(trip: {
  pickup_date?: string | null;
  started_at?: string | null;
  created_at?: string | null;
}): string | null {
  return trip.pickup_date || trip.started_at || trip.created_at || null;
}

function complianceEventSortKey(summary: ComplianceTripSummary): number | null {
  const raw = complianceEventAt(summary.trip);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/** Date order for the Compliance table and its export. Trips with no date stay last. */
export function compareComplianceSummariesByEvent(
  a: ComplianceTripSummary,
  b: ComplianceTripSummary,
  direction: "asc" | "desc",
): number {
  const da = complianceEventSortKey(a);
  const db = complianceEventSortKey(b);
  if (da == null && db == null) return 0;
  if (da == null) return 1;
  if (db == null) return -1;
  return direction === "asc" ? da - db : db - da;
}
