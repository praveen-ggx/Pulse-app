/**
 * Table workbench for the Compliance workbench — trip is the primary row,
 * expandable to reveal its documents inline. Same already-fetched
 * `ComplianceTripSummary[]`, no extra query. Trip/Vehicle/Driver cells show a
 * single Pending/Approved status that opens the card view on that tab (no review
 * approve/reject wiring). E-way Bill column + Verify/Decline actions per
 * docs/compliance/dinesh/CONTRACT.md.
 */
import Theme from "@/constants/Theme";
import {
    COMPLIANCE_DECLINE_ACTION_LABEL,
    HIGHLIGHT_EXPIRED_EWAY_BILL,
} from "@/features/tripCompliance/complianceDecisionConfig";
import { ComplianceDeclineModal } from "@/features/tripCompliance/components/ComplianceDeclineModal";
import { ComplianceNumberStack } from "@/features/tripCompliance/components/ComplianceNumberStack";
import { COMPLIANCE_STATUS_META, ComplianceStatusChip } from "@/features/tripCompliance/components/ComplianceStatusIcon";
import { tripAppearsInAwaitingPod } from "@/features/tripCompliance/services/tripComplianceRead.service";
import {
    REQUIRED_DRIVER_DOCUMENT_TYPES,
    REQUIRED_VEHICLE_DOCUMENT_TYPES,
    type ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";
import {
    compareComplianceSummariesByEvent,
    complianceEventAt,
    formatComplianceTimestamp,
    paymentStatusVisual,
    shouldShowPaymentStatusPill,
    tripOpsStatusBadge,
    verificationStatusVisual,
} from "@/features/tripCompliance/utils/complianceCardVisual.util";
import {
    deriveComplianceDocumentRows,
    deriveEntityComplianceRows,
    labelForDocType,
    requirementScopeLabel,
    type ComplianceDocRow,
} from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import { deriveComplianceQueueReadiness, paymentReadinessLabel } from "@/features/tripCompliance/utils/complianceReadiness.util";
import {
    canVerifyTrip,
    complianceVaultDocNumbers,
    deriveComplianceEwayBill,
    deriveComplianceGroupStatus,
    isComplianceDeclineActive,
    isFinanceDeclinedTrip,
} from "@/features/tripCompliance/utils/complianceTableStatus.util";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import { lrReceiptForTrip } from "@/features/trips/utils/lrReceiptStatus.util";
import { formatIndianVehicleNumber } from "@/lib/format";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type ComplianceTripsTableProps = {
  summaries: ComplianceTripSummary[];
  onOpenTrip: (tripId: string) => void;
  onOpenDetails?: (tripId: string) => void;
  /** Opens the review sheet; documentKey null opens straight to the document list. */
  onReview: (tripId: string, documentKey: string | null, scope?: "trip" | "vehicle" | "driver") => void;
  /** Verify action; runs once LR, E-way Bill and Invoice are approved, otherwise opens the trip documents. Resolves; the page shows errors. */
  onMarkComplianceVerified?: (tripId: string) => Promise<boolean | void>;
  /** Verify on a not-ready trip: open its documents in the Cards workspace. Falls back to the review sheet when absent. */
  onVerifyDocs?: (tripId: string) => void;
  /** Decline action; rejects with an Error whose message is user-facing (shown in the modal). */
  onDeclineCompliance?: (tripId: string, reason: string) => Promise<void>;
  onPay?: (tripId: string) => void;
  canManageFinance?: boolean;
  /** Compliance Pending table: trip status column, invoice number, no Payment/Advance/Balance. */
  compliancePendingLayout?: boolean;
  /** Date column sort. The page owns this so pagination and export follow it. */
  dateSort?: RequiredDateSort;
  onDateSortChange?: (sort: RequiredDateSort) => void;
  /**
   * When false, Date is a plain header and row order is left to the parent
   * (e.g. Advance Processed newest-posted sort while search uses this table).
   */
  dateSortEnabled?: boolean;
  /** POD Received stage only: IBond column. */
  showIbondColumn?: boolean;
};

type RequiredDateSort = "asc" | "desc";

function tripFromLocation(summary: ComplianceTripSummary): string {
  return summary.trip.pickup_area?.trim() || "—";
}

function tripToLocation(summary: ComplianceTripSummary): string {
  return summary.trip.drop_location?.trim() || summary.trip.drop_area?.trim() || "—";
}

function truckNumber(summary: ComplianceTripSummary): string {
  const raw = summary.trip.vehicle_display_number?.trim() || "";
  return formatIndianVehicleNumber(raw).trim() || raw || "—";
}

function formatRequiredDate(summary: ComplianceTripSummary): string {
  const raw = complianceEventAt(summary.trip);
  if (!raw) return "—";
  const formatted = formatComplianceTimestamp(raw);
  return formatted || "—";
}

type DocScope = "trip" | "vehicle" | "driver";

const SCOPE_LABEL: Record<DocScope, string> = {
  trip: "Trip",
  vehicle: "Vehicle",
  driver: "Driver",
};

function GroupStatusPill({
  tripId,
  scope,
  rows,
  onPress,
}: {
  tripId: string;
  scope: DocScope;
  rows: ComplianceDocRow[];
  onPress: () => void;
}) {
  const group = deriveComplianceGroupStatus(rows);
  const approved = group.status === "approved";
  const label = approved ? "Approved" : "Pending";
  return (
    <TouchableOpacity
      testID={`compliance-status-${scope}-${tripId}`}
      style={styles.statusTouch}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={`${SCOPE_LABEL[scope]} documents ${label}, ${group.approved} of ${group.total} approved. Open verification`}
    >
      <View style={[styles.statusPill, approved ? styles.statusPillApproved : styles.statusPillPending]}>
        <Text style={[styles.statusPillText, approved ? styles.successText : styles.dangerText]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function EwayBillCell({ summary }: { summary: ComplianceTripSummary }) {
  const eway = useMemo(() => deriveComplianceEwayBill(summary.documents), [summary.documents]);
  const tripId = summary.trip.id;
  if (!eway.number && !eway.validTillLabel) {
    return (
      <View style={styles.colEway} testID={`compliance-eway-${tripId}`}>
        <Text style={styles.cell}>—</Text>
      </View>
    );
  }
  const showExpired = HIGHLIGHT_EXPIRED_EWAY_BILL && eway.expired;
  return (
    <View
      style={styles.colEway}
      testID={`compliance-eway-${tripId}`}
      accessibilityLabel={`E-way Bill ${eway.number ?? "—"}, valid till ${eway.validTillLabel ?? "—"}${
        showExpired ? ", expired" : ""
      }${eway.extraCount > 0 ? `, ${eway.extraCount} more` : ""}`}
    >
      <ComplianceNumberStack numbers={eway.numbers} variant="table" />
      <View style={styles.ewayLine}>
        <Text style={[styles.muted, styles.ewayDate, showExpired && styles.dangerText]} numberOfLines={1}>
          {`Valid till ${eway.validTillLabel ?? "—"}`}
        </Text>
        {showExpired ? (
          <View style={[styles.miniPill, styles.statusPillPending]}>
            <Text style={[styles.miniPillText, styles.dangerText]}>Expired</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SortHeader({
  label,
  sort,
  onToggle,
  style,
}: {
  label: string;
  sort: RequiredDateSort;
  onToggle: () => void;
  style?: object;
}) {
  const Icon = sort === "asc" ? ArrowUp : ArrowDown;
  return (
    <TouchableOpacity
      style={[styles.colRequiredDate, style]}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`Sort by ${label}, currently ${sort === "asc" ? "ascending" : "descending"}`}
    >
      <Text style={[styles.cell, styles.headerText]} numberOfLines={1}>
        {label}
      </Text>
      <Icon size={12} color={Theme.textPrimary} strokeWidth={2.4} />
    </TouchableOpacity>
  );
}

function TripRowContent({
  summary,
  onOpenTrip,
  onOpenDetails,
  onReview,
  onMarkComplianceVerified,
  onVerifyDocs,
  onDeclineCompliance,
  onPay,
  canManageFinance = false,
  compliancePendingLayout = false,
  showIbondColumn = false,
}: {
  summary: ComplianceTripSummary;
  onOpenTrip: (tripId: string) => void;
  onOpenDetails?: (tripId: string) => void;
  onReview: (tripId: string, documentKey: string | null, scope?: "trip" | "vehicle" | "driver") => void;
  onMarkComplianceVerified?: (tripId: string) => Promise<boolean | void>;
  onVerifyDocs?: (tripId: string) => void;
  onDeclineCompliance?: (tripId: string, reason: string) => Promise<void>;
  onPay?: (tripId: string) => void;
  canManageFinance?: boolean;
  compliancePendingLayout?: boolean;
  showIbondColumn?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [markingTrip, setMarkingTrip] = useState(false);
  const markingRef = useRef(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const rows = useMemo(() => deriveComplianceDocumentRows(summary.documents), [summary.documents]);
  const vehicleRows = useMemo(
    () =>
      deriveEntityComplianceRows(REQUIRED_VEHICLE_DOCUMENT_TYPES, summary.vehicleDocuments).filter((row) => row.required),
    [summary.vehicleDocuments],
  );
  const driverRows = useMemo(
    () =>
      deriveEntityComplianceRows(REQUIRED_DRIVER_DOCUMENT_TYPES, summary.driverDocuments).filter((row) => row.required),
    [summary.driverDocuments],
  );
  const tripMandatoryRows = useMemo(() => rows.filter((row) => row.required), [rows]);
  const readiness = useMemo(() => deriveComplianceQueueReadiness(summary), [summary]);
  const payLabel = paymentReadinessLabel(readiness);
  const verification = verificationStatusVisual(summary);
  const tripStatus = compliancePendingLayout ? tripOpsStatusBadge(summary.trip.status) : null;
  const payment = paymentStatusVisual(summary);
  const showPaymentPill = shouldShowPaymentStatusPill(summary);
  const tripIdLabel = getTripDisplayNumber(summary.trip);
  const lrReceipt = lrReceiptForTrip(
    summary.hardCopyPod.lrNumbers ?? [],
    summary.hardCopyPod.receivedLrNumbers ?? [],
  );
  const showLrReceipt =
    (summary.hardCopyPod.lrNumbers?.length ?? 0) > 0 &&
    (tripAppearsInAwaitingPod(summary) || lrReceipt.kind !== "none");
  const tripId = summary.trip.id;
  const isFinanceDeclined = isFinanceDeclinedTrip(summary);
  const isVerified = Boolean(summary.complianceVerifiedAt) && !isFinanceDeclined;
  const verifyEligibility = useMemo(() => canVerifyTrip(summary), [summary]);
  const declineActive = isComplianceDeclineActive(summary);
  const declineReason = summary.complianceDeclineReason?.trim() || "";

  const handleVerify = () => {
    if (markingRef.current || !onMarkComplianceVerified) return;
    if (!verifyEligibility.allowed) {
      // Not ready: open the trip documents to approve (as V1's "Verify Docs" did).
      if (onVerifyDocs) onVerifyDocs(tripId);
      else onReview(tripId, null, "trip");
      return;
    }
    markingRef.current = true;
    setMarkingTrip(true);
    void onMarkComplianceVerified(tripId).finally(() => {
      markingRef.current = false;
      setMarkingTrip(false);
    });
  };

  const handleDeclineSubmit = async (reason: string) => {
    if (!onDeclineCompliance) return;
    await onDeclineCompliance(tripId, reason);
    setDeclineOpen(false);
  };

  const verifyDisabled = markingTrip;

  return (
    <View>
      <View style={styles.row}>
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.expandToggle}>
          {expanded ? (
            <ChevronDown size={14} color={Theme.textMuted} strokeWidth={2.2} />
          ) : (
            <ChevronRight size={14} color={Theme.textMuted} strokeWidth={2.2} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.colTripId}
          onPress={() => (onOpenDetails ?? onOpenTrip)(summary.trip.id)}
        >
          <Text style={styles.cell} selectable numberOfLines={1}>
            {tripIdLabel}
          </Text>
          <Text style={[styles.cell, styles.muted]} numberOfLines={1}>
            {summary.trip.client_name || "—"}
          </Text>
          {showLrReceipt ? (
            <>
              <Text style={[styles.cell, styles.lrReceipt]} numberOfLines={1}>
                Received LRs {lrReceipt.received.join(", ") || "—"}
              </Text>
              <Text style={[styles.cell, styles.lrReceipt]} numberOfLines={1}>
                Pending LRs {lrReceipt.pending.join(", ") || "—"}
              </Text>
            </>
          ) : null}
        </TouchableOpacity>
        <Text style={[styles.cell, styles.colDate]} numberOfLines={1}>
          {formatRequiredDate(summary)}
        </Text>
        <Text style={[styles.cell, styles.colLoc]} numberOfLines={1}>
          {tripFromLocation(summary)}
        </Text>
        <Text style={[styles.cell, styles.colLoc]} numberOfLines={1}>
          {tripToLocation(summary)}
        </Text>
        <EwayBillCell summary={summary} />
        {compliancePendingLayout ? (
          <View style={styles.colInvoice}>
            <ComplianceNumberStack
              numbers={complianceVaultDocNumbers(summary.documents, "invoice")}
              variant="table"
            />
          </View>
        ) : null}
        <View style={styles.colInvoice}>
          <ComplianceNumberStack
            numbers={complianceVaultDocNumbers(summary.documents, "lr")}
            variant="table"
          />
        </View>
        <Text style={[styles.cell, styles.colInvoice]} numberOfLines={1}>
          {truckNumber(summary)}
        </Text>
        <View style={styles.colDocs}>
          <GroupStatusPill
            tripId={tripId}
            scope="trip"
            rows={tripMandatoryRows}
            onPress={() => onReview(tripId, null, "trip")}
          />
        </View>
        <View style={styles.colDocs}>
          <GroupStatusPill
            tripId={tripId}
            scope="vehicle"
            rows={vehicleRows}
            onPress={() => onReview(tripId, null, "vehicle")}
          />
        </View>
        <View style={styles.colDocs}>
          <GroupStatusPill
            tripId={tripId}
            scope="driver"
            rows={driverRows}
            onPress={() => onReview(tripId, null, "driver")}
          />
        </View>
        {compliancePendingLayout ? (
          <View style={styles.colTripStatus}>
            {tripStatus ? (
              <View
                style={[styles.stagePill, { backgroundColor: tripStatus.tone.bg }]}
                accessibilityLabel={`Trip status ${tripStatus.label}`}
              >
                <Text style={[styles.stagePillText, { color: tripStatus.tone.fg }]} numberOfLines={1}>
                  {tripStatus.label}
                </Text>
              </View>
            ) : (
              <Text style={styles.cell}>—</Text>
            )}
          </View>
        ) : null}
        <View style={styles.colStage}>
          <View style={[styles.stagePill, { backgroundColor: verification.tone.bg }]}>
            <Text style={[styles.stagePillText, { color: verification.tone.fg }]} numberOfLines={1}>
              {verification.label}
            </Text>
          </View>
          {declineActive ? (
            <View
              testID={`compliance-declined-${tripId}`}
              accessible
              accessibilityLabel={`Declined${declineReason ? `: ${declineReason}` : ""}`}
            >
              <View style={[styles.stagePill, styles.statusPillPending]}>
                <Text style={[styles.stagePillText, styles.dangerText]} numberOfLines={1}>
                  Declined
                </Text>
              </View>
              {declineReason ? (
                <Text style={styles.muted} numberOfLines={1}>
                  {declineReason}
                </Text>
              ) : null}
            </View>
          ) : null}
          {showPaymentPill ? (
            <View style={[styles.stagePill, styles.stagePillSpaced, { backgroundColor: payment.tone.bg }]}>
              <Text style={[styles.stagePillText, { color: payment.tone.fg }]} numberOfLines={1}>
                {payment.label}
              </Text>
            </View>
          ) : null}
        </View>
        {compliancePendingLayout ? null : (
          <View style={styles.colBlockers}>
            <Text style={[styles.cell, readiness.paymentReady ? styles.readyText : styles.blockedText]} numberOfLines={1}>
              {payLabel.label}
            </Text>
            <Text style={styles.muted} numberOfLines={1}>
              {readiness.nextAction}
            </Text>
          </View>
        )}
        {compliancePendingLayout ? null : (
          <>
            <Text style={[styles.cell, styles.colMoney]} numberOfLines={1}>
              {summary.advance ? `₹${summary.advance.amount.toLocaleString("en-IN")}` : "—"}
            </Text>
            <Text style={[styles.cell, styles.colMoney]} numberOfLines={1}>
              {summary.balance ? `₹${summary.balance.amount.toLocaleString("en-IN")}` : "—"}
            </Text>
          </>
        )}
        {showIbondColumn ? (
          <Text style={[styles.cell, styles.colIbond]} numberOfLines={1}>
            {summary.hardCopyPod.ibond ? "Yes" : "—"}
          </Text>
        ) : null}
        <View style={styles.colAction}>
          {isVerified ? (
            <Text style={[styles.actionLink, styles.successText]} numberOfLines={1}>
              Verified
            </Text>
          ) : null}
          {!isVerified && onMarkComplianceVerified ? (
            <TouchableOpacity
              testID={`compliance-verify-${tripId}`}
              style={[styles.actionButton, styles.actionItem]}
              disabled={verifyDisabled}
              hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
              onPress={handleVerify}
              accessibilityRole="button"
              accessibilityLabel="Verify trip compliance"
              accessibilityHint={
                verifyEligibility.reason ? `${verifyEligibility.reason}. Opens trip documents.` : undefined
              }
              accessibilityState={{ disabled: verifyDisabled, busy: markingTrip }}
            >
              <Text style={[styles.actionLink, !verifyEligibility.allowed && styles.disabledLink]} numberOfLines={1}>
                {markingTrip ? "Verifying…" : "Verify"}
              </Text>
            </TouchableOpacity>
          ) : null}
          {!isVerified && !isFinanceDeclined && onDeclineCompliance ? (
            <TouchableOpacity
              testID={`compliance-decline-${tripId}`}
              style={[styles.actionButton, styles.actionItem]}
              hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
              onPress={() => setDeclineOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`${COMPLIANCE_DECLINE_ACTION_LABEL} trip compliance`}
            >
              <Text style={[styles.actionLink, styles.dangerText]} numberOfLines={1}>
                {COMPLIANCE_DECLINE_ACTION_LABEL}
              </Text>
            </TouchableOpacity>
          ) : null}
          {canManageFinance && readiness.paymentReady && onPay ? (
            <TouchableOpacity onPress={() => onPay(summary.trip.id)}>
              <Text style={styles.actionLink}>Pay</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {onDeclineCompliance ? (
        <ComplianceDeclineModal
          visible={declineOpen}
          tripLabel={`${tripIdLabel}${summary.trip.client_name ? ` · ${summary.trip.client_name}` : ""}`}
          onCancel={() => setDeclineOpen(false)}
          onSubmit={handleDeclineSubmit}
        />
      ) : null}

      {expanded ? (
        <View style={styles.expandedWrap}>
          {rows.map((row) => (
            <View key={row.key} style={styles.expandedRow}>
              <Text style={styles.expandedDocLabel}>
                {labelForDocType(row.type)} · {requirementScopeLabel(row.required)}
              </Text>
              <ComplianceStatusChip status={row.status} label={COMPLIANCE_STATUS_META[row.status].label} compact />
              <View style={styles.expandedActions}>
                {row.status === "missing" ? (
                  <TouchableOpacity onPress={() => onReview(summary.trip.id, row.key)}>
                    <Text style={styles.actionLink}>Add</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity onPress={() => onReview(summary.trip.id, row.key)}>
                      <Text style={styles.actionLink}>Preview</Text>
                    </TouchableOpacity>
                    {row.status !== "verified" ? (
                      <TouchableOpacity onPress={() => onReview(summary.trip.id, row.key)}>
                        <Text style={styles.actionLink}> · Approve</Text>
                      </TouchableOpacity>
                    ) : null}
                    {row.status !== "rejected" ? (
                      <TouchableOpacity onPress={() => onReview(summary.trip.id, row.key)}>
                        <Text style={[styles.actionLink, styles.rejectLink]}> · Reject</Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                )}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ComplianceTripsTable({
  summaries,
  onOpenTrip,
  onOpenDetails,
  onReview,
  onMarkComplianceVerified,
  onVerifyDocs,
  onDeclineCompliance,
  onPay,
  canManageFinance,
  compliancePendingLayout = false,
  dateSort,
  onDateSortChange,
  dateSortEnabled = true,
  showIbondColumn = false,
}: ComplianceTripsTableProps) {
  const [internalDateSort, setInternalDateSort] = useState<RequiredDateSort>("desc");
  const requiredDateSort = dateSort ?? internalDateSort;
  const toggleDateSort = () => {
    const next: RequiredDateSort = requiredDateSort === "asc" ? "desc" : "asc";
    if (onDateSortChange) onDateSortChange(next);
    else setInternalDateSort(next);
  };

  const sortedSummaries = useMemo(() => {
    if (!dateSortEnabled) return summaries;
    const copy = [...summaries];
    copy.sort((a, b) => compareComplianceSummariesByEvent(a, b, requiredDateSort));
    return copy;
  }, [summaries, requiredDateSort, dateSortEnabled]);

  return (
    <View style={styles.tableScroll}>
      <View style={styles.table}>
        <View style={[styles.row, styles.headerRow]}>
          <View style={styles.expandToggle} />
          <Text style={[styles.cell, styles.colTripId, styles.headerText]} numberOfLines={1}>
            Trip ID
          </Text>
          {dateSortEnabled ? (
            <SortHeader label="Date" sort={requiredDateSort} onToggle={toggleDateSort} />
          ) : (
            <View style={styles.colRequiredDate}>
              <Text style={[styles.cell, styles.headerText]} numberOfLines={1}>
                Date
              </Text>
            </View>
          )}
          <Text style={[styles.cell, styles.colLoc, styles.headerText]} numberOfLines={1}>
            From
          </Text>
          <Text style={[styles.cell, styles.colLoc, styles.headerText]} numberOfLines={1}>
            To
          </Text>
          <Text style={[styles.cell, styles.colEway, styles.headerText]} numberOfLines={1}>
            E-way Bill
          </Text>
          {compliancePendingLayout ? (
            <Text style={[styles.cell, styles.colInvoice, styles.headerText]} numberOfLines={1}>
              Invoice
            </Text>
          ) : null}
          <Text style={[styles.cell, styles.colInvoice, styles.headerText]} numberOfLines={1}>
            LR
          </Text>
          <Text style={[styles.cell, styles.colInvoice, styles.headerText]} numberOfLines={1}>
            Truck No
          </Text>
          <Text style={[styles.cell, styles.colDocs, styles.headerText]} numberOfLines={1}>
            Trip
          </Text>
          <Text style={[styles.cell, styles.colDocs, styles.headerText]} numberOfLines={1}>
            Vehicle
          </Text>
          <Text style={[styles.cell, styles.colDocs, styles.headerText]} numberOfLines={1}>
            Driver
          </Text>
          {compliancePendingLayout ? (
            <Text style={[styles.cell, styles.colTripStatus, styles.headerText]} numberOfLines={1}>
              Trip Status
            </Text>
          ) : null}
          <Text style={[styles.cell, styles.colStage, styles.headerText]} numberOfLines={1}>
            Stage
          </Text>
          {compliancePendingLayout ? null : (
            <Text style={[styles.cell, styles.colBlockers, styles.headerText]} numberOfLines={1}>
              Payment
            </Text>
          )}
          {compliancePendingLayout ? null : (
            <>
              <Text style={[styles.cell, styles.colMoney, styles.headerText]} numberOfLines={1}>
                Advance
              </Text>
              <Text style={[styles.cell, styles.colMoney, styles.headerText]} numberOfLines={1}>
                Balance
              </Text>
            </>
          )}
          {showIbondColumn ? (
            <Text style={[styles.cell, styles.colIbond, styles.headerText]} numberOfLines={1}>
              IBond
            </Text>
          ) : null}
          <Text style={[styles.cell, styles.headerText, styles.colActionLabel]} numberOfLines={1}>
            Action
          </Text>
        </View>

        {sortedSummaries.map((s) => (
          <TripRowContent
            key={s.trip.id}
            summary={s}
            onOpenTrip={onOpenTrip}
            onOpenDetails={onOpenDetails}
            onReview={onReview}
            onMarkComplianceVerified={onMarkComplianceVerified}
            onVerifyDocs={onVerifyDocs}
            onDeclineCompliance={onDeclineCompliance}
            onPay={onPay}
            canManageFinance={canManageFinance}
            compliancePendingLayout={compliancePendingLayout}
            showIbondColumn={showIbondColumn}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tableScroll: { width: "100%", minWidth: 0 },
  table: {
    width: "100%",
    minWidth: 0,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    paddingVertical: 2,
    paddingHorizontal: 4,
    gap: 3,
  },
  headerRow: {
    borderTopWidth: 0,
    backgroundColor: Theme.compliancePageBg,
    paddingVertical: 4,
    alignItems: "center",
  },
  headerText: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13,
    color: Theme.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  expandToggle: { width: 16, alignItems: "center", justifyContent: "center" },
  cell: { fontSize: 11, lineHeight: 14, color: Theme.textPrimary, fontWeight: "500" },
  muted: { color: Theme.textMuted, fontSize: 9, lineHeight: 11 },
  lrReceipt: { color: Theme.textPrimaryDark, fontSize: 9, lineHeight: 11, fontWeight: "600" },
  colTripId: { width: 138, maxWidth: 138, flexGrow: 0, flexShrink: 1, minWidth: 0 },
  colDate: { flex: 0.72, minWidth: 68 },
  colLoc: { flex: 1, minWidth: 0 },
  colEway: { flex: 1.05, minWidth: 0, justifyContent: "center", gap: 0 },
  colInvoice: { flex: 0.82, minWidth: 0, justifyContent: "center" },
  ewayLine: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
  ewayDate: { flexShrink: 1 },
  colDocs: { flex: 0.68, minWidth: 52, justifyContent: "center" },
  statusTouch: { justifyContent: "center", alignSelf: "flex-start", minHeight: 44 },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  statusPillPending: { backgroundColor: Theme.complianceStageDocsBg },
  statusPillApproved: { backgroundColor: Theme.complianceStageSuccessBg },
  statusPillText: { fontSize: 10, lineHeight: 13, fontWeight: "700" },
  successText: { color: Theme.complianceStageSuccessFg },
  dangerText: { color: Theme.complianceStageDocsFg },
  miniPill: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999 },
  miniPillText: { fontSize: 9, fontWeight: "700" },
  colRequiredDate: {
    flex: 0.72,
    minWidth: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  colTripStatus: { flex: 0.7, minWidth: 0, justifyContent: "center" },
  colStage: { flex: 0.95, minWidth: 76, justifyContent: "center", gap: 1 },
  stagePill: {
    alignSelf: "flex-start",
    paddingHorizontal: 5,
    paddingVertical: 0,
    borderRadius: 999,
    maxWidth: "100%",
  },
  stagePillSpaced: { marginTop: 0 },
  stagePillText: { fontSize: 10, lineHeight: 13, fontWeight: "700" },
  colBlockers: { flex: 1, minWidth: 88 },
  readyText: { color: Theme.complianceStageSuccessFg, fontWeight: "700" },
  blockedText: { color: Theme.complianceStageDocsFg, fontWeight: "700" },
  colMoney: { width: 72, minWidth: 72, flexGrow: 0, flexShrink: 0 },
  colIbond: { width: 72, flexGrow: 0, flexShrink: 0 },
  colAction: {
    width: 108,
    minWidth: 108,
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 6,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  colActionLabel: { width: 108, minWidth: 108, flexGrow: 0, flexShrink: 0 },
  actionItem: { flexGrow: 0, flexShrink: 0 },
  actionButton: { justifyContent: "center" },
  actionLink: { fontSize: 11, lineHeight: 14, fontWeight: "700", color: Theme.complianceBulk },
  disabledLink: { color: Theme.textMuted },
  rejectLink: { color: Theme.teslaRed },
  expandedWrap: { backgroundColor: Theme.compliancePageBg, paddingLeft: 28, paddingRight: 8 },
  expandedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
  },
  expandedDocLabel: { width: 120, fontSize: 12, fontWeight: "600", color: Theme.textPrimary },
  expandedActions: { flexDirection: "row", flexWrap: "wrap", marginLeft: "auto" },
});
