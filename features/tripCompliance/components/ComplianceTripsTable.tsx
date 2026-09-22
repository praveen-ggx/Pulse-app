/**
 * Table workbench for the Compliance workbench — trip is the primary row,
 * expandable to reveal its documents inline. Same already-fetched
 * `ComplianceTripSummary[]`, no extra query. Inline document actions open
 * the same ComplianceDocumentReviewSheet used by the card view's "Review
 * Documents" — no duplicate approve/reject wiring.
 */
import Theme from "@/constants/Theme";
import { COMPLIANCE_STATUS_META, ComplianceStatusChip } from "@/features/tripCompliance/components/ComplianceStatusIcon";
import {
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  REQUIRED_VEHICLE_DOCUMENT_TYPES,
  type ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";
import {
  complianceEventAt,
  formatComplianceTimestamp,
  paymentStatusVisual,
  shouldShowPaymentStatusPill,
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
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type ComplianceTripsTableProps = {
  summaries: ComplianceTripSummary[];
  onOpenTrip: (tripId: string) => void;
  onOpenDetails?: (tripId: string) => void;
  /** Opens the review sheet; documentKey null opens straight to the document list. */
  onReview: (tripId: string, documentKey: string | null, scope?: "trip" | "vehicle" | "driver") => void;
  onPay?: (tripId: string) => void;
  canManageFinance?: boolean;
};

type RequiredDateSort = "asc" | "desc";

function tripFromLocation(summary: ComplianceTripSummary): string {
  return summary.trip.pickup_area?.trim() || "—";
}

function tripToLocation(summary: ComplianceTripSummary): string {
  return summary.trip.drop_location?.trim() || summary.trip.drop_area?.trim() || "—";
}

function formatRequiredDate(summary: ComplianceTripSummary): string {
  const raw = complianceEventAt(summary.trip);
  if (!raw) return "—";
  const formatted = formatComplianceTimestamp(raw);
  return formatted || "—";
}

function requiredDateSortKey(summary: ComplianceTripSummary): number | null {
  const raw = complianceEventAt(summary.trip);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

function MandatoryDocChips({
  rows,
  onPressDoc,
}: {
  rows: ComplianceDocRow[];
  onPressDoc: (documentKey: string) => void;
}) {
  const mandatory = rows.filter((row) => row.required);
  return (
    <View style={styles.docChips}>
      {mandatory.map((row) => (
        <TouchableOpacity key={row.key} onPress={() => onPressDoc(row.key)} hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}>
          <ComplianceStatusChip status={row.status} label={labelForDocType(row.type)} compact />
        </TouchableOpacity>
      ))}
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
      <Text style={[styles.cell, styles.headerText]}>{label}</Text>
      <Icon size={12} color={Theme.textMuted} strokeWidth={2.4} />
    </TouchableOpacity>
  );
}

function TripRowContent({
  summary,
  onOpenTrip,
  onOpenDetails,
  onReview,
  onPay,
  canManageFinance = false,
}: {
  summary: ComplianceTripSummary;
  onOpenTrip: (tripId: string) => void;
  onOpenDetails?: (tripId: string) => void;
  onReview: (tripId: string, documentKey: string | null, scope?: "trip" | "vehicle" | "driver") => void;
  onPay?: (tripId: string) => void;
  canManageFinance?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
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
  const payment = paymentStatusVisual(summary);
  const showPaymentPill = shouldShowPaymentStatusPill(summary);
  const tripIdLabel = getTripDisplayNumber(summary.trip);

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
          <Text style={styles.cell} selectable>
            {tripIdLabel}
          </Text>
          <Text style={[styles.cell, styles.muted]} numberOfLines={1}>
            {summary.trip.client_name || "—"}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.cell, styles.colDate]} numberOfLines={1}>
          {formatRequiredDate(summary)}
        </Text>
        <Text style={[styles.cell, styles.colLoc]} numberOfLines={2}>
          {tripFromLocation(summary)}
        </Text>
        <Text style={[styles.cell, styles.colLoc]} numberOfLines={2}>
          {tripToLocation(summary)}
        </Text>
        <View style={styles.colDocs}>
          <MandatoryDocChips
            rows={tripMandatoryRows}
            onPressDoc={(key) => onReview(summary.trip.id, key, "trip")}
          />
        </View>
        <View style={styles.colDocs}>
          <MandatoryDocChips
            rows={vehicleRows}
            onPressDoc={(key) => onReview(summary.trip.id, key, "vehicle")}
          />
        </View>
        <View style={styles.colDocs}>
          <MandatoryDocChips
            rows={driverRows}
            onPressDoc={(key) => onReview(summary.trip.id, key, "driver")}
          />
        </View>
        <View style={styles.colStage}>
          <View style={[styles.stagePill, { backgroundColor: verification.tone.bg }]}>
            <Text style={[styles.stagePillText, { color: verification.tone.fg }]} numberOfLines={1}>
              {verification.label}
            </Text>
          </View>
          {showPaymentPill ? (
            <View style={[styles.stagePill, styles.stagePillSpaced, { backgroundColor: payment.tone.bg }]}>
              <Text style={[styles.stagePillText, { color: payment.tone.fg }]} numberOfLines={1}>
                {payment.label}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.colBlockers}>
          <Text style={[styles.cell, readiness.paymentReady ? styles.readyText : styles.blockedText]} numberOfLines={1}>
            {payLabel.label}
          </Text>
          <Text style={styles.muted} numberOfLines={2}>
            {readiness.nextAction}
          </Text>
        </View>
        <Text style={[styles.cell, styles.colMoney]}>
          {summary.advance ? `₹${summary.advance.amount.toLocaleString("en-IN")}` : "—"}
        </Text>
        <Text style={[styles.cell, styles.colMoney]}>
          {summary.balance ? `₹${summary.balance.amount.toLocaleString("en-IN")}` : "—"}
        </Text>
        <View style={styles.colAction}>
          <TouchableOpacity onPress={() => onReview(summary.trip.id, null)}>
            <Text style={styles.actionLink}>Verify Docs</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onOpenTrip(summary.trip.id)}>
            <Text style={[styles.actionLink, styles.viewTripLink]}>View Trip</Text>
          </TouchableOpacity>
          {canManageFinance && readiness.paymentReady && onPay ? (
            <TouchableOpacity onPress={() => onPay(summary.trip.id)}>
              <Text style={styles.actionLink}>Pay</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

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
  onPay,
  canManageFinance,
}: ComplianceTripsTableProps) {
  const [requiredDateSort, setRequiredDateSort] = useState<RequiredDateSort>("desc");

  const sortedSummaries = useMemo(() => {
    const copy = [...summaries];
    copy.sort((a, b) => {
      const da = requiredDateSortKey(a);
      const db = requiredDateSortKey(b);
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return requiredDateSort === "asc" ? da - db : db - da;
    });
    return copy;
  }, [summaries, requiredDateSort]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
      <View style={styles.table}>
        <View style={[styles.row, styles.headerRow]}>
          <View style={styles.expandToggle} />
          <Text style={[styles.cell, styles.colTripId, styles.headerText]}>Trip ID</Text>
          <SortHeader
            label="Date"
            sort={requiredDateSort}
            onToggle={() => setRequiredDateSort((s) => (s === "asc" ? "desc" : "asc"))}
          />
          <Text style={[styles.cell, styles.colLoc, styles.headerText]}>From</Text>
          <Text style={[styles.cell, styles.colLoc, styles.headerText]}>To</Text>
          <Text style={[styles.cell, styles.colDocs, styles.headerText]}>Trip</Text>
          <Text style={[styles.cell, styles.colDocs, styles.headerText]}>Vehicle</Text>
          <Text style={[styles.cell, styles.colDocs, styles.headerText]}>Driver</Text>
          <Text style={[styles.cell, styles.colStage, styles.headerText]}>Stage</Text>
          <Text style={[styles.cell, styles.colBlockers, styles.headerText]}>Payment</Text>
          <Text style={[styles.cell, styles.colMoney, styles.headerText]}>Advance</Text>
          <Text style={[styles.cell, styles.colMoney, styles.headerText]}>Balance</Text>
          <Text style={[styles.cell, styles.colAction, styles.headerText]}>Action</Text>
        </View>

        {sortedSummaries.map((s) => (
          <TripRowContent
            key={s.trip.id}
            summary={s}
            onOpenTrip={onOpenTrip}
            onOpenDetails={onOpenDetails}
            onReview={onReview}
            onPay={onPay}
            canManageFinance={canManageFinance}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tableScroll: { flexGrow: 0 },
  table: {
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 12,
    overflow: "hidden",
    minWidth: 1400,
    backgroundColor: Theme.cardWhite,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 8,
  },
  headerRow: { borderTopWidth: 0, backgroundColor: Theme.compliancePageBg, paddingVertical: 10 },
  headerText: { fontSize: 10, fontWeight: "700", color: Theme.textMuted, textTransform: "uppercase", letterSpacing: 0.3 },
  expandToggle: { width: 28, minHeight: 40, alignItems: "center", justifyContent: "flex-start", paddingTop: 4 },
  cell: { fontSize: 13, color: Theme.textPrimary, fontWeight: "500" },
  muted: { color: Theme.textMuted, fontSize: 11 },
  colTripId: { flex: 1.8, minWidth: 220 },
  colDate: { flex: 1.1, minWidth: 110 },
  colLoc: { flex: 1.1, minWidth: 90 },
  colDocs: { flex: 1.2, minWidth: 110, justifyContent: "flex-start", paddingTop: 2 },
  docChips: { flexDirection: "column", alignItems: "flex-start", gap: 4 },
  colRequiredDate: {
    flex: 1.1,
    minWidth: 110,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  colStage: { flex: 1.1, minWidth: 120, justifyContent: "center", gap: 4 },
  stagePill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: "100%",
  },
  stagePillSpaced: { marginTop: 0 },
  stagePillText: { fontSize: 11, fontWeight: "700" },
  colBlockers: { flex: 1.2, minWidth: 130 },
  readyText: { color: Theme.complianceStageSuccessFg, fontWeight: "700" },
  blockedText: { color: Theme.complianceStageDocsFg, fontWeight: "700" },
  colMoney: { flex: 0.7, minWidth: 70 },
  colAction: { flex: 1.1, minWidth: 120, flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  actionLink: { fontSize: 12, fontWeight: "700", color: Theme.complianceBulk },
  viewTripLink: { color: Theme.textMuted },
  rejectLink: { color: Theme.teslaRed },
  expandedWrap: { backgroundColor: Theme.compliancePageBg, paddingLeft: 38, paddingRight: 10 },
  expandedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
  },
  expandedDocLabel: { width: 120, fontSize: 13, fontWeight: "600", color: Theme.textPrimary },
  expandedActions: { flexDirection: "row", flexWrap: "wrap", marginLeft: "auto" },
});
