/**
 * Compliance Verification card — Trips-hub ticket layout (client head,
 * route, party chips, docs checklist). Same summary data and callbacks.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { HUB_MOBILE_TICKET_REF } from "@/components/hub/hubMobileTicketTokens";
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
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

const REF = HUB_MOBILE_TICKET_REF;
const ROUTE_PIN_SIZE = 6;
const HEAD_AVATAR = 34;
const CHIP_AVATAR = 22;

export type ComplianceTripCardProps = {
  summary: ComplianceTripSummary;
  onReviewDocuments: (group: ComplianceChecklistGroup["key"]) => void;
  onViewTrip: () => void;
  onOpenDetails?: () => void;
  onPay?: () => void;
  /** When every required trip document is approved, Verify Docs marks the trip compliance verified. */
  onMarkComplianceVerified?: () => Promise<void>;
  canManageFinance?: boolean;
  /** Details screen renders its own full decline section. */
  hideDeclineNotice?: boolean;
  onOpenActivityLog?: () => void;
};

function asLabel(value: unknown): string {
  if (value == null) return "—";
  const s = String(value).trim();
  return s || "—";
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
}: {
  name: string;
  entityType: "vehicle" | "driver";
  avatarSeed: string;
  alignEnd?: boolean;
  showAvatar?: boolean;
}) {
  const label = formatPartyName(name);
  return (
    <View style={[styles.chip, alignEnd && styles.chipEnd]}>
      {showAvatar ? (
        <PartyAvatar name={label} initialsColorSeed={avatarSeed} entityType={entityType} size={CHIP_AVATAR} />
      ) : null}
      <View style={[styles.chipCopy, alignEnd && styles.chipCopyEnd]}>
        <Text style={[styles.chipName, alignEnd && styles.chipNameEnd]} numberOfLines={1}>
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
}: {
  group: ComplianceChecklistGroup;
  countLabel: string;
  onPress?: () => void;
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

  const tileStyle = [
    styles.groupTile,
    requiredComplete && { backgroundColor: tone.bg, borderColor: tone.fg },
  ];

  if (!onPress) {
    return <View style={tileStyle}>{content}</View>;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${group.label} documents, ${countLabel}`}
      style={tileStyle}
    >
      {content}
    </TouchableOpacity>
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
}: ComplianceTripCardProps) {
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
  const blockerLines = readiness.blockerLines
    .filter((line) => {
      const n = line.replace(/\.+$/, "").trim().toLowerCase();
      const next = nextLine.replace(/\.+$/, "").trim().toLowerCase();
      if (!n) return false;
      if (n.startsWith("pending verification:")) return false;
      if (next && (n === next || n === `next: ${next}`)) return false;
      return true;
    })
    .slice(0, 2);

  return (
    <View style={styles.cardWrap}>
      <View style={styles.card}>
        <Pressable
          onPress={openDetails}
          style={({ pressed }) => [styles.body, pressed && styles.bodyPressed]}
          accessibilityRole="button"
          accessibilityLabel={`${tripId} ${clientName}, ${asLabel(origin)} to ${asLabel(dest)}`}
        >
          <View style={styles.head}>
            <View style={styles.headLeft}>
              <PartyAvatar
                name={clientName}
                initialsColorSeed={clientFb}
                entityType="client"
                size={HEAD_AVATAR}
              />
              <View style={styles.headText}>
                <Text style={styles.brand} numberOfLines={1}>
                  {formatPartyName(clientName)}
                </Text>
                <Text style={styles.tripIdLink} numberOfLines={1}>
                  {tripId}
                </Text>
              </View>
            </View>
            <View style={styles.headMetaCol}>
              <View style={styles.headStatusRow}>
                {onOpenActivityLog ? (
                  <ComplianceActivityLogButton
                    compact
                    onPress={() => {
                      onOpenActivityLog();
                    }}
                  />
                ) : null}
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
              <Text style={styles.headMetaMuted} numberOfLines={1}>
                {when}
              </Text>
            </View>
          </View>

          <View style={styles.route}>
            <RouteLeg location={origin} variant="origin" align="left" />
            <View style={styles.routeMid}>
              <Text style={styles.routeArrow}>→</Text>
            </View>
            <RouteLeg location={dest} variant="dest" align="right" />
          </View>

          <View style={styles.divider} />

          <View style={styles.partyRow}>
            <PartyChip name={vehicleLabel} entityType="vehicle" avatarSeed={vehicleFb} />
            <PartyChip name={driverLabel} entityType="driver" avatarSeed={driverFb} alignEnd showAvatar={false} />
          </View>
        </Pressable>

        <View style={styles.complianceBody}>
          <View style={styles.groupRow}>
            {checklist.groups.map((group) => {
              const onFile = complianceGroupOnFileCount(group, summary.documents);
              return (
                <ChecklistGroupTile
                  key={group.key}
                  group={group}
                  countLabel={`${onFile.onFile}/${onFile.total} On file`}
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
              readiness.paymentReady ? styles.blockerBoxReady : styles.blockerBoxBlocked,
            ]}
          >
            <Text
              style={[
                styles.payLabel,
                readiness.paymentReady ? styles.payReady : styles.payBlocked,
              ]}
              numberOfLines={1}
            >
              {payLabel.label}
            </Text>
            {fullyVerified ? (
              <Text style={styles.blockerLine} numberOfLines={1}>
                Compliance Verified ✓
              </Text>
            ) : null}
            {nextLine ? (
              <Text style={styles.nextLine} numberOfLines={1}>
                Next: {nextLine}
              </Text>
            ) : null}
            {blockerLines.map((line) => (
              <Text key={line} style={styles.blockerLine} numberOfLines={1}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        {showCardFooter ? (
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
                  style={[styles.stagePill, { backgroundColor: debitStatus.tone.bg }]}
                  accessibilityLabel={debitStatus.label}
                >
                  <Text
                    style={[styles.stagePillText, { color: debitStatus.tone.fg }]}
                    numberOfLines={1}
                  >
                    {debitStatus.label}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: { width: "100%", height: "100%", minWidth: 0 },
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
  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  bodyPressed: { opacity: 0.98 },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  headLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  brand: {
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.1,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  tripIdLink: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    color: Theme.complianceBulk,
  },
  headMetaCol: {
    flexShrink: 0,
    alignItems: "flex-end",
    gap: 4,
  },
  headStatusRow: {
    flexDirection: "row",
    alignItems: "center",
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
    maxWidth: "100%",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  headStatusPillText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    textAlign: "right",
    letterSpacing: 0.2,
  },
  headMetaMuted: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "400",
    color: Theme.textRouteCard,
    textAlign: "right",
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
    marginTop: 4,
    flexShrink: 0,
  },
  routePinOrigin: { backgroundColor: REF.accent },
  routePinDest: { backgroundColor: Theme.positive },
  legCity: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimary,
    letterSpacing: -0.1,
    lineHeight: 15,
    textTransform: "uppercase",
    width: "100%",
  },
  legState: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textRouteCard,
    lineHeight: 13,
    width: "100%",
  },
  legStatePlaceholder: { opacity: 0 },
  textEnd: { textAlign: "right" },
  routeMid: {
    width: 18,
    paddingTop: 2,
    alignItems: "center",
    flexShrink: 0,
  },
  routeArrow: {
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textRouteCard,
    lineHeight: 15,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.complianceCardBorder,
    marginTop: 10,
    marginBottom: 10,
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: CHIP_AVATAR,
  },
  chip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  chipEnd: { justifyContent: "flex-end" },
  chipCopy: { flex: 1, minWidth: 0, justifyContent: "center" },
  chipCopyEnd: { alignItems: "flex-end" },
  chipName: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: Theme.textPrimary,
    letterSpacing: -0.1,
  },
  chipNameEnd: { textAlign: "right" },
  complianceBody: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 12,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "stretch",
    flexWrap: "nowrap",
    gap: 8,
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
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  payReady: { color: Theme.complianceStageSuccessFg },
  payBlocked: { color: Theme.complianceStageDocsFg },
  nextLine: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.complianceBulk,
    lineHeight: 15,
  },
  blockerLine: {
    fontSize: 11,
    color: Theme.textRouteCard,
    lineHeight: 15,
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
