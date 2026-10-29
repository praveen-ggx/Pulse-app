/**
 * Compliance Verification card — Trips-hub ticket layout (client head,
 * route, party chips, docs checklist). Same summary data and callbacks.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { HUB_CARD_HEAD_AVATAR, HUB_CARD_PARTY_CHIP_AVATAR } from "@/components/hub/hubGridCardLayout";
import { HUB_MOBILE_TICKET_REF } from "@/components/hub/hubMobileTicketTokens";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";
import {
  type ComplianceChecklistGroup,
  type ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";
import {
  complianceEventAt,
  complianceTripDisplayId,
  formatComplianceTimestamp,
  groupToneVisual,
  paymentStatusVisual,
  shouldShowPaymentStatusPill,
  podDebitStatusVisual,
  verificationStatusVisual,
} from "@/features/tripCompliance/utils/complianceCardVisual.util";
import {
  complianceGroupOnFileCount,
  ensureComplianceChecklist,
} from "@/features/tripCompliance/utils/complianceChecklist.util";
import {
  deriveComplianceQueueReadiness,
  paymentReadinessLabel,
} from "@/features/tripCompliance/utils/complianceReadiness.util";
import { splitHubRouteLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import { formatIndianVehicleNumber } from "@/lib/format";
import { ComplianceActivityLogButton } from "@/features/tripCompliance/components/ComplianceTripActivityLog";
import { Check, Eye } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

const REF = HUB_MOBILE_TICKET_REF;
const ROUTE_PIN_SIZE = 6;
const HEAD_AVATAR = 34;
const CHIP_AVATAR = 22;

type HoverPressState = { pressed: boolean; hovered?: boolean };

const WEB_POINTER: ViewStyle | null =
  Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

const WEB_TRANSITION: ViewStyle | null =
  Platform.OS === "web"
    ? ({
        transitionDuration: "140ms",
        transitionProperty: "background-color, border-color, box-shadow, transform",
        transitionTimingFunction: "ease",
      } as ViewStyle)
    : null;

function isHovered(state: HoverPressState): boolean {
  return Boolean(state.hovered) || state.pressed;
}

export type ComplianceTripCardProps = {
  summary: ComplianceTripSummary;
  onReviewDocuments: (group: ComplianceChecklistGroup["key"]) => void;
  onViewTrip: () => void;
  onOpenDetails?: () => void;
  onPay?: () => void;
  /** When every required trip document is approved, Verify Docs marks the trip compliance verified. */
  onMarkComplianceVerified?: () => Promise<boolean | void>;
  canManageFinance?: boolean;
  /** Details screen renders its own full decline section. */
  hideDeclineNotice?: boolean;
  onOpenActivityLog?: () => void;
  /** Trips-hub ticket density (mobile list). */
  compact?: boolean;
  selected?: boolean;
};

function asLabel(value: unknown): string {
  if (value == null) return "—";
  const s = String(value).trim();
  return s || "—";
}

/** Trip ops status for the route-arrow caption (In Transit, Loading, …). */
function tripOpsStatusLabel(status: string | null | undefined): string {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return "";
  if (s === "in_progress") return "Loading";
  if (s === "in_transit" || s === "in transit") return "In Transit";
  if (s === "at_destination" || s === "at_drop") return "At Destination";
  if (s === "completed" || s === "delivered" || s === "done") return "Completed";
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatPartyName(value: string): string {
  return asLabel(value).toUpperCase();
}

function RoutePin({ variant }: { variant: "origin" | "dest" }) {
  return (
    <View
      style={[
        styles.routePin,
        variant === "origin" ? styles.routePinOrigin : styles.routePinDest,
      ]}
    />
  );
}

function RouteLeg({
  location,
  variant,
  align,
}: {
  location: string;
  variant: "origin" | "dest";
  align: "left" | "right";
}) {
  const { city, state } = splitHubRouteLocationDisplay(location);
  const end = align === "right";
  return (
    <View style={[styles.leg, end && styles.legEnd]}>
      <View style={[styles.legRow, end && styles.legRowEnd]}>
        {!end ? <RoutePin variant={variant} /> : null}
        <View style={[styles.legText, end && styles.legTextEnd]}>
          <Text style={[styles.legCity, end && styles.textEnd]} numberOfLines={1} ellipsizeMode="tail">
            {asLabel(city)}
          </Text>
          <Text
            style={[styles.legState, end && styles.textEnd, !state && styles.legStatePlaceholder]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {state || "\u00a0"}
          </Text>
        </View>
        {end ? <RoutePin variant={variant} /> : null}
      </View>
    </View>
  );
}

function PartyChip({
  name,
  entityType,
  avatarSeed,
  alignEnd,
  showAvatar = true,
  compact = false,
}: {
  name: string;
  entityType: "vehicle" | "driver";
  avatarSeed: string;
  alignEnd?: boolean;
  showAvatar?: boolean;
  compact?: boolean;
}) {
  const label = formatPartyName(name);
  return (
    <View style={[styles.chip, alignEnd && styles.chipEnd]}>
      {showAvatar ? (
        <PartyAvatar
          name={label}
          initialsColorSeed={avatarSeed}
          entityType={entityType}
          size={compact ? HUB_CARD_PARTY_CHIP_AVATAR : CHIP_AVATAR}
        />
      ) : null}
      <View style={[styles.chipCopy, alignEnd && styles.chipCopyEnd]}>
        <Text
          style={[styles.chipName, compact && styles.chipNameCompact, alignEnd && styles.chipNameEnd]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

function ChecklistGroupTile({
  group,
  countLabel,
  onPress,
  compact = false,
  align = "center",
}: {
  group: ComplianceChecklistGroup;
  countLabel: string;
  onPress?: () => void;
  compact?: boolean;
  align?: "start" | "center" | "end";
}) {
  const tone = groupToneVisual(group.tone);
  const requiredComplete = group.tone === "success";
  const content = (
    <>
      <View style={styles.groupHeader}>
        <Text style={styles.groupLabel} numberOfLines={1}>
          {group.label}
        </Text>
        <Eye size={11} color={Theme.textRouteCard} strokeWidth={2.2} />
      </View>
      <View style={styles.groupDots}>
        {group.slots.map((slot) => (
          <View
            key={slot.type}
            style={[
              styles.groupDot,
              { backgroundColor: slot.verified ? tone.dot : Theme.complianceCardBorder },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.groupCount, requiredComplete && { color: tone.fg }]} numberOfLines={1}>
        {countLabel}
      </Text>
    </>
  );

  const tileStyle = compact
    ? [
        styles.groupMetric,
        align === "start" && styles.groupMetricStart,
        align === "end" && styles.groupMetricEnd,
      ]
    : [
        styles.groupTile,
        requiredComplete && { backgroundColor: tone.bg, borderColor: tone.fg },
      ];
  const compactContent = (
    <View style={styles.groupMetricInner}>
      <Text style={styles.groupMetricLabel} numberOfLines={1}>
        {group.label}
      </Text>
      <Text
        style={[styles.groupMetricCount, requiredComplete && { color: tone.fg }]}
        numberOfLines={1}
      >
        {countLabel}
      </Text>
    </View>
  );

  if (!onPress) {
    return <View style={tileStyle}>{compact ? compactContent : content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${group.label} documents, ${countLabel}`}
      style={(state: HoverPressState) => [
        tileStyle,
        WEB_POINTER,
        WEB_TRANSITION,
        isHovered(state) && styles.groupTileHover,
      ]}
    >
      {compact ? compactContent : content}
    </Pressable>
  );
}

export function ComplianceTripCard({
  summary,
  onReviewDocuments,
  onViewTrip,
  onOpenDetails,
  onPay,
  onMarkComplianceVerified,
  canManageFinance = false,
  hideDeclineNotice = false,
  onOpenActivityLog,
  compact = false,
  selected = false,
}: ComplianceTripCardProps) {
  const [hovered, setHovered] = useState(false);
  const trip = summary.trip;
  const checklist = ensureComplianceChecklist(summary);
  const readiness = useMemo(() => deriveComplianceQueueReadiness(summary), [summary]);
  const verification = verificationStatusVisual(summary);
  const payment = paymentStatusVisual(summary);
  const debitStatus = podDebitStatusVisual(summary);
  const showPaymentPill = shouldShowPaymentStatusPill(summary);
  const fullyVerified = Boolean(summary.complianceVerifiedAt);
  /** Pending-docs cards already show status in the header — no Verify Docs action. */
  const showVerifyDocsAction = verification.kind !== "pending_docs" && !fullyVerified;
  const readyToMarkTrip =
    readiness.requiredDocs.markVerifiedReady && !fullyVerified && Boolean(onMarkComplianceVerified);
  const [markingTrip, setMarkingTrip] = useState(false);
  const showPayAction = Boolean(canManageFinance && readiness.paymentReady && onPay);
  const showCardFooter =
    showPaymentPill &&
    payment.label !== "Awaiting POD" &&
    payment.label !== "Advance Processed";
  const tripId = complianceTripDisplayId(trip);
  const when = formatComplianceTimestamp(complianceEventAt(trip));
  const payLabel = paymentReadinessLabel(readiness);
  /** Decline is active only while the trip is not compliance verified. */
  const declinedAt = !fullyVerified && !hideDeclineNotice ? summary.complianceDeclinedAt : null;
  const declineReason = summary.complianceDeclineReason?.trim() || "No reason recorded";
  const resubmitNote =
    summary.complianceResubmitNote?.trim() &&
    summary.complianceResubmittedAt &&
    summary.complianceDeclinedAt &&
    Date.parse(summary.complianceResubmittedAt) >= Date.parse(summary.complianceDeclinedAt)
      ? summary.complianceResubmitNote.trim()
      : "";

  const clientName = asLabel(trip.client_name);
  const clientFb = trip.client_id
    ? `client-entity:${String(trip.client_id).trim()}`
    : `client-trip:${trip.id}`;
  const vehicleRaw = trip.vehicle_display_number?.trim() || "";
  const vehicleLabel =
    formatIndianVehicleNumber(vehicleRaw).trim() || vehicleRaw || "Unassigned";
  const driverLabel = trip.driver_display_name?.trim() || "Unassigned";
  const vehicleFb = trip.vehicle_id
    ? `vehicle-entity:${String(trip.vehicle_id).trim()}`
    : `vehicle-trip:${trip.id}`;
  const driverFb = trip.driver_id
    ? `driver-entity:${String(trip.driver_id).trim()}`
    : `driver-trip:${trip.id}`;
  const headStatusUpper = asLabel(
    showPaymentPill ? payment.label : verification.label,
  ).toUpperCase();
  const origin = trip.pickup_area ?? "";
  const dest = trip.drop_location ?? "";
  const tripStatusLabel = tripOpsStatusLabel(trip.status);
  const openDetails = onOpenDetails ?? onViewTrip;

  const pressVerifyDocs = () => {
    if (markingTrip) return;
    if (!readyToMarkTrip || !onMarkComplianceVerified) {
      onReviewDocuments("trip");
      return;
    }
    setMarkingTrip(true);
    void onMarkComplianceVerified().finally(() => setMarkingTrip(false));
  };

  const nextLine = readiness.nextAction?.trim() || "";
  const _blockerLines = readiness.blockerLines
    .filter((line) => {
      const n = line.replace(/\.+$/, "").trim().toLowerCase();
      const next = nextLine.replace(/\.+$/, "").trim().toLowerCase();
      if (!n) return false;
      if (n.startsWith("pending verification:")) return false;
      if (next && (n === next || n === `next: ${next}`)) return false;
      return true;
    })
    .slice(0, 2);

  const webHover =
    Platform.OS === "web"
      ? {
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
        }
      : null;

  return (
    <View style={styles.cardWrapCompact} {...webHover}>
      <Pressable
        onPress={openDetails}
        style={(state: HoverPressState) => [
          styles.cardCompact,
          WEB_TRANSITION,
          WEB_POINTER,
          (hovered || selected || isHovered(state)) && styles.cardHover,
          selected && styles.cardSelected,
        ]}
        accessibilityRole="none"
        accessibilityLabel={`${tripId} ${clientName}, ${asLabel(origin)} to ${asLabel(dest)}`}
      >
        <View style={[styles.body, compact && styles.bodyCompact]}>
          <View style={styles.head}>
            <View style={styles.headLeft}>
              <PartyAvatar
                name={clientName}
                initialsColorSeed={clientFb}
                entityType="client"
                size={compact ? HUB_CARD_HEAD_AVATAR : HEAD_AVATAR}
              />
              <View style={styles.headText}>
                <Text style={[styles.brand, compact && styles.brandCompact]} numberOfLines={2}>
                  {formatPartyName(clientName)}
                </Text>
                <Text style={[styles.tripIdLink, compact && styles.tripIdLinkCompact]} numberOfLines={1}>
                  {tripId}
                </Text>
              </View>
            </View>
            <View style={styles.headMetaCol}>
              <View style={styles.headStatusRow}>
                <View
                  style={[
                    styles.headStatusPill,
                    { backgroundColor: showPaymentPill ? payment.tone.bg : verification.tone.bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.headStatusPillText,
                      { color: showPaymentPill ? payment.tone.fg : verification.tone.fg },
                    ]}
                    numberOfLines={1}
                  >
                    {headStatusUpper}
                  </Text>
                </View>
                {onOpenActivityLog ? (
                  <ComplianceActivityLogButton
                    inline
                    compact
                    onPress={() => {
                      onOpenActivityLog();
                    }}
                  />
                ) : null}
              </View>
              <Text style={styles.headMetaMuted} numberOfLines={1}>
                {when}
              </Text>
            </View>
          </View>

          <View style={styles.route}>
            <RouteLeg location={origin} variant="origin" align="left" />
            <View style={[styles.routeMid, tripStatusLabel ? styles.routeMidWithStatus : null]}>
              <Text style={styles.routeArrow}>→</Text>
              {tripStatusLabel ? (
                <Text style={styles.routeTripStatus} numberOfLines={2}>
                  {tripStatusLabel}
                </Text>
              ) : null}
            </View>
            <RouteLeg location={dest} variant="dest" align="right" />
          </View>

          <View style={styles.divider} />

          <View style={[styles.partyRow, compact && styles.partyRowCompact]}>
            <PartyChip
              name={vehicleLabel}
              entityType="vehicle"
              avatarSeed={vehicleFb}
              showAvatar
              compact={compact}
            />
            <PartyChip
              name={driverLabel}
              entityType="driver"
              avatarSeed={driverFb}
              alignEnd
              showAvatar={false}
              compact={compact}
            />
          </View>
        </View>

        <View style={[styles.complianceBody, compact && styles.complianceBodyCompact]}>
          <View style={[styles.groupRow, styles.groupRowCompact]}>
            {checklist.groups.map((group, index) => {
              const onFile = complianceGroupOnFileCount(group, summary.documents);
              return (
                <ChecklistGroupTile
                  key={group.key}
                  group={group}
                  compact
                  align={
                    index === 0
                      ? "start"
                      : index === checklist.groups.length - 1
                        ? "end"
                        : "center"
                  }
                  countLabel={`${onFile.onFile}/${onFile.total}`}
                  onPress={() => onReviewDocuments(group.key)}
                />
              );
            })}
          </View>

          {declinedAt ? (
            <View
              style={styles.expiryAlertBox}
              testID={`compliance-card-declined-${trip.id}`}
              accessible
              accessibilityLabel={`Compliance declined ${formatComplianceTimestamp(declinedAt)}. Reason: ${declineReason}`}
            >
              <Text style={styles.expiryAlertTitle} numberOfLines={1}>
                Declined · {formatComplianceTimestamp(declinedAt)}
              </Text>
              <Text style={styles.expiryAlertBody} numberOfLines={2}>
                {declineReason}
              </Text>
            </View>
          ) : null}

          {resubmitNote ? (
            <View
              style={styles.resubmitNoteBox}
              testID={`compliance-card-resubmit-note-${trip.id}`}
              accessible
              accessibilityLabel={`Ground Ops resubmit note. ${resubmitNote}`}
            >
              <Text style={styles.resubmitNoteTitle} numberOfLines={1}>
                Resubmitted · Ground Ops
              </Text>
              <Text style={styles.resubmitNoteBody}>{resubmitNote}</Text>
            </View>
          ) : null}

          {readiness.expiredVehicleDocs.length > 0 ? (
            <View
              style={styles.expiryAlertBox}
              accessibilityRole="alert"
              accessibilityLabel={`Expired vehicle documents: ${readiness.expiredVehicleDocs.join(", ")}`}
            >
              <Text style={styles.expiryAlertTitle}>Vehicle docs expired</Text>
              <Text style={styles.expiryAlertBody}>
                {readiness.expiredVehicleDocs.join(", ")} — renew and re-upload. Trip moved to Pending Docs.
              </Text>
            </View>
          ) : readiness.expiringSoonVehicleDocs.length > 0 ? (
            <View
              style={styles.expiryWarnBox}
              accessibilityRole="alert"
              accessibilityLabel={`Vehicle documents expiring soon: ${readiness.expiringSoonVehicleDocs.join(", ")}`}
            >
              <Text style={styles.expiryWarnTitle}>Expiring soon</Text>
              <Text style={styles.expiryWarnBody}>
                {readiness.expiringSoonVehicleDocs.join(", ")} — renew before expiry.
              </Text>
            </View>
          ) : null}

          <View
            style={[
              styles.blockerBox,
              compact && styles.blockerBoxCompact,
              readiness.paymentReady ? styles.blockerBoxReady : styles.blockerBoxBlocked,
              styles.blockerBoxWithAction,
            ]}
          >
            <View style={styles.blockerCopy}>
              <Text
                style={[
                  styles.payLabel,
                  compact && styles.payLabelCompact,
                  readiness.paymentReady ? styles.payReady : styles.payBlocked,
                ]}
                numberOfLines={1}
              >
                {payLabel.label}
                {nextLine ? ` · Next: ${nextLine}` : ""}
              </Text>
              {fullyVerified && !nextLine ? (
                <Text style={styles.blockerLine} numberOfLines={1}>
                  Compliance Verified ✓
                </Text>
              ) : null}
            </View>
            {showVerifyDocsAction || showPayAction ? (
              <View style={styles.blockerActions}>
                {showVerifyDocsAction ? (
                  <Pressable
                    style={styles.payBtn}
                    onPress={(event) => {
                      event.stopPropagation();
                      pressVerifyDocs();
                    }}
                    disabled={markingTrip}
                    hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel="Verify documents"
                  >
                    {markingTrip ? (
                      <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
                    ) : (
                      <Text style={styles.payBtnText}>Verify Docs</Text>
                    )}
                  </Pressable>
                ) : null}
                {showPayAction ? (
                  <Pressable
                    style={styles.payBtn}
                    onPress={(event) => {
                      event.stopPropagation();
                      onPay?.();
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel="Pay"
                  >
                    <Text style={styles.payBtnText}>Pay</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {false && showCardFooter ? (
          <View style={styles.cardFooter}>
            <View style={styles.pillRow}>
              <View
                style={[styles.stagePill, { backgroundColor: payment.tone.bg }]}
                accessibilityLabel={`Payment: ${payment.label}`}
              >
                {summary.stage === "payment_settled" ? (
                  <Check size={10} color={payment.tone.fg} strokeWidth={2.6} />
                ) : (
                  <View style={[styles.stageDot, { backgroundColor: payment.tone.fg }]} />
                )}
                <Text
                  style={[styles.stagePillText, { color: payment.tone.fg }]}
                  numberOfLines={1}
                >
                  {payment.label}
                </Text>
              </View>
              {debitStatus ? (
                <View
                  style={[styles.stagePill, { backgroundColor: debitStatus?.tone.bg }]}
                  accessibilityLabel={debitStatus?.label}
                >
                  <Text
                    style={[styles.stagePillText, { color: debitStatus?.tone.fg }]}
                    numberOfLines={1}
                  >
                    {debitStatus?.label}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: { width: "100%", height: "100%", minWidth: 0 },
  cardWrapCompact: { width: "100%", minWidth: 0 },
  card: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    height: "100%",
    flexDirection: "column",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)" } as ViewStyle,
      default: {
        shadowColor: Theme.textPrimaryDark,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
      },
    }),
  },
  cardHover: {
    backgroundColor: Theme.complianceSelectedWash,
    borderColor: Theme.complianceHoverBorder,
  },
  cardSelected: {
    borderColor: Theme.actionBtnInk,
  },
  cardCompact: {
    width: "100%",
    minWidth: 0,
    flexDirection: "column",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    position: "relative",
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)" } as ViewStyle,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
      },
    }),
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  bodyCompact: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  bodyPressed: { opacity: 0.98 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
  },
  headLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 1,
  },
  brand: {
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: -0.1,
    fontWeight: "600",
    fontStyle: "normal",
    color: REF.ink,
    textTransform: "uppercase",
  },
  brandCompact: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    fontStyle: "normal",
    letterSpacing: -0.1,
    color: REF.ink,
    textTransform: "uppercase",
  },
  tripIdLink: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    color: REF.inkMid,
    letterSpacing: 0.15,
    fontVariant: ["tabular-nums"],
  },
  tripIdLinkCompact: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    color: REF.inkMid,
    letterSpacing: 0.15,
    fontVariant: ["tabular-nums"],
  },
  headMetaCol: {
    flexShrink: 1,
    flexGrow: 0,
    maxWidth: "42%",
    minWidth: 0,
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 3,
  },
  headStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "nowrap",
    gap: 6,
    maxWidth: "100%",
    minWidth: 0,
  },
  blockerBoxWithAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  blockerCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 8,
  },
  blockerActions: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  payBtn: {
    minHeight: 22,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  payBtnText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.2,
  },
  headStatusPill: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  headStatusPillText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "700",
    textAlign: "right",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  headMetaMuted: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "500",
    color: REF.muted,
    textAlign: "right",
    letterSpacing: 0.15,
  },
  route: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    width: "100%",
  },
  leg: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: "48%",
  },
  legEnd: { alignItems: "flex-end" },
  legRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    minWidth: 0,
  },
  legRowEnd: { justifyContent: "flex-end" },
  legText: {
    flex: 1,
    minWidth: 0,
    ...Platform.select({
      web: { width: "100%" } as ViewStyle,
      default: {},
    }),
  },
  legTextEnd: { alignItems: "flex-end" },
  routePin: {
    width: ROUTE_PIN_SIZE,
    height: ROUTE_PIN_SIZE,
    borderRadius: ROUTE_PIN_SIZE / 2,
    marginTop: 2,
    flexShrink: 0,
  },
  routePinOrigin: { backgroundColor: REF.accent },
  routePinDest: { backgroundColor: Theme.positive },
  legCity: {
    fontSize: 12,
    fontWeight: "600",
    color: REF.ink,
    letterSpacing: -0.1,
    lineHeight: 15,
    textTransform: "uppercase",
    width: "100%",
  },
  legState: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "400",
    color: REF.muted,
    lineHeight: 12,
    width: "100%",
  },
  legStatePlaceholder: { opacity: 0 },
  textEnd: { textAlign: "right" },
  routeMid: {
    width: 24,
    paddingTop: 2,
    alignItems: "center",
    flexShrink: 0,
  },
  routeMidWithStatus: {
    width: 64,
    paddingTop: 0,
  },
  routeArrow: {
    fontSize: 16,
    fontWeight: "300",
    color: REF.muted,
    lineHeight: 18,
  },
  routeTripStatus: {
    marginTop: 1,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "600",
    color: REF.muted,
    letterSpacing: 0.15,
    textAlign: "center",
    textTransform: "uppercase",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: REF.hairline,
    marginTop: 12,
    marginBottom: 10,
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: CHIP_AVATAR,
  },
  partyRowCompact: {
    alignItems: "flex-start",
    minHeight: HUB_CARD_PARTY_CHIP_AVATAR,
    marginTop: 6,
  },
  chip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipEnd: { justifyContent: "flex-end" },
  chipCopy: { flex: 1, minWidth: 0, justifyContent: "center" },
  chipCopyEnd: { alignItems: "flex-end" },
  chipName: {
    ...FinanceTxnTypography.partyTitle,
    minWidth: 0,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: -0.1,
    fontWeight: "500",
  },
  chipNameCompact: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
    color: REF.ink,
  },
  chipNameEnd: { textAlign: "right" },
  complianceBody: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 12,
  },
  complianceBodyCompact: {
    flexGrow: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "stretch",
    flexWrap: "nowrap",
    gap: 8,
  },
  groupRowCompact: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 2,
    minHeight: 22,
  },
  groupMetric: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  groupMetricStart: { justifyContent: "flex-start" },
  groupMetricEnd: { justifyContent: "flex-end" },
  groupTileHover: {
    opacity: 0.72,
  },
  groupMetricInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 22,
    minWidth: 0,
  },
  groupMetricLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "400",
    color: REF.muted,
    flexShrink: 1,
  },
  groupMetricCount: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: REF.inkMid,
    fontVariant: ["tabular-nums"],
  },
  groupTile: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    alignSelf: "stretch",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 5,
    backgroundColor: Theme.compliancePageBg,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
    minWidth: 0,
    color: Theme.textPrimary,
  },
  groupDots: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 3,
  },
  groupDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  groupCount: {
    marginTop: "auto",
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textRouteCard,
  },
  blockerBox: {
    width: "100%",
    gap: 4,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
  },
  blockerBoxCompact: {
    gap: 2,
    paddingTop: 8,
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderRadius: 8,
  },
  blockerBoxBlocked: {
    backgroundColor: Theme.complianceStageDocsBg,
    borderColor: Theme.complianceStageDocsBg,
    borderLeftColor: Theme.complianceGroupDangerDot,
  },
  blockerBoxReady: {
    backgroundColor: Theme.complianceStageSuccessBg,
    borderColor: Theme.complianceStageSuccessBg,
    borderLeftColor: Theme.complianceGroupSuccessDot,
  },
  payLabel: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
  },
  payLabelCompact: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
  },
  payReady: { color: Theme.complianceStageSuccessFg },
  payBlocked: { color: Theme.complianceStageDocsFg },
  nextLine: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "500",
    color: REF.inkMid,
    lineHeight: 13,
  },
  blockerLine: {
    fontSize: 10,
    color: REF.muted,
    lineHeight: 13,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
    marginTop: "auto",
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceCardBorder,
  },
  pillRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  stagePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    flexShrink: 1,
    minWidth: 0,
  },
  stageDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  stagePillText: {
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
  },
  expiryAlertBox: {
    gap: 2,
    paddingTop: 6,
    paddingHorizontal: 8,
    paddingBottom: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    backgroundColor: Theme.complianceDocNeedBg,
    borderColor: Theme.complianceDocNeedBg,
    borderLeftColor: Theme.teslaRed,
  },
  expiryAlertTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.teslaRed,
    lineHeight: 14,
  },
  expiryAlertBody: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 13,
  },
  resubmitNoteBox: {
    gap: 2,
    paddingTop: 6,
    paddingHorizontal: 8,
    paddingBottom: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMuted,
    borderLeftColor: Theme.positive,
  },
  resubmitNoteTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.positive,
    lineHeight: 14,
  },
  resubmitNoteBody: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 13,
  },
  expiryWarnBox: {
    gap: 2,
    paddingTop: 6,
    paddingHorizontal: 8,
    paddingBottom: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    backgroundColor: Theme.complianceStagePendingBg,
    borderColor: Theme.complianceStagePendingBg,
    borderLeftColor: Theme.complianceStagePendingFg,
  },
  expiryWarnTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.complianceStagePendingFg,
    lineHeight: 14,
  },
  expiryWarnBody: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 13,
  },
});
