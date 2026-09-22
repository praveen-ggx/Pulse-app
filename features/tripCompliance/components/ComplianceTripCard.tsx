/**
 * Compliance Verification card — ticket layout aligned with Trips hub cards
 * (client head, horizontal route, party chips), plus docs checklist + Verify Docs.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import {
  HUB_CARD_HEAD_AVATAR,
  HUB_CARD_HEAD_LEFT_GAP,
  HUB_CARD_PARTY_CHIP_AVATAR,
} from "@/components/hub/hubGridCardLayout";
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
  verificationStatusVisual,
} from "@/features/tripCompliance/utils/complianceCardVisual.util";
import { checklistTone, ensureComplianceChecklist } from "@/features/tripCompliance/utils/complianceChecklist.util";
import {
  deriveComplianceQueueReadiness,
  paymentReadinessLabel,
} from "@/features/tripCompliance/utils/complianceReadiness.util";
import { splitHubRouteLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import { formatIndianVehicleNumber } from "@/lib/format";
import { Check, Eye } from "lucide-react-native";
import React, { useMemo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

const REF = HUB_MOBILE_TICKET_REF;
const ROUTE_PIN_SIZE = 8;
const CHIP_AVATAR = HUB_CARD_PARTY_CHIP_AVATAR;

export type ComplianceTripCardProps = {
  summary: ComplianceTripSummary;
  onReviewDocuments: (group: ComplianceChecklistGroup["key"]) => void;
  onViewTrip: () => void;
  onOpenDetails?: () => void;
  onPay?: () => void;
  canManageFinance?: boolean;
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
          <Text
            style={[styles.legCity, end && styles.textEnd]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {asLabel(city)}
          </Text>
          <Text
            style={[
              styles.legState,
              end && styles.textEnd,
              !state && styles.legStatePlaceholder,
            ]}
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
}: {
  name: string;
  entityType: "vehicle" | "driver";
  avatarSeed: string;
  alignEnd?: boolean;
}) {
  const label = formatPartyName(name);
  return (
    <View style={[styles.chip, alignEnd && styles.chipEnd]}>
      <PartyAvatar
        name={label}
        initialsColorSeed={avatarSeed}
        entityType={entityType}
        size={CHIP_AVATAR}
      />
      <View style={[styles.chipCopy, alignEnd && styles.chipCopyEnd]}>
        <Text
          style={[styles.chipName, alignEnd && styles.chipNameEnd]}
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
}: {
  group: ComplianceChecklistGroup;
  countLabel: string;
  onPress?: () => void;
}) {
  const tone = groupToneVisual(group.tone);
  const content = (
    <>
      <View style={styles.groupHeader}>
        <Text style={[styles.groupLabel, { color: tone.fg }]} numberOfLines={1}>
          {group.label}
        </Text>
        <Eye size={11} color={tone.fg} strokeWidth={2.2} />
      </View>
      <View style={styles.groupDots}>
        {group.slots.map((slot) => (
          <View
            key={slot.type}
            style={[styles.groupDot, { backgroundColor: slot.verified ? tone.dot : tone.emptyDot }]}
          />
        ))}
      </View>
      <Text style={[styles.groupCount, { color: tone.fg }]}>{countLabel}</Text>
    </>
  );

  if (!onPress) {
    return <View style={[styles.groupTile, { backgroundColor: tone.bg }]}>{content}</View>;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${group.label} documents, ${countLabel}`}
      style={[styles.groupTile, { backgroundColor: tone.bg }]}
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
  canManageFinance = false,
}: ComplianceTripCardProps) {
  const trip = summary.trip;
  const checklist = ensureComplianceChecklist(summary);
  const readiness = useMemo(() => deriveComplianceQueueReadiness(summary), [summary]);
  const required = readiness.requiredDocs;
  const verifiedTripTypes = new Set(
    summary.documents.filter((doc) => doc.status === "verified").map((doc) => doc.document_type),
  );
  const displayGroups = checklist.groups.map((group) => {
    if (group.key !== "trip") return group;
    const slots = group.slots.map((slot) => ({ ...slot, verified: verifiedTripTypes.has(slot.type) }));
    return {
      ...group,
      slots,
      verified: required.verified,
      total: required.total,
      tone: checklistTone(required.verified, required.total),
    };
  });
  const verification = verificationStatusVisual(summary);
  const payment = paymentStatusVisual(summary);
  const showPaymentPill = shouldShowPaymentStatusPill(summary);
  /** Pending-docs cards already show status in the header — hide the duplicate footer pill + Verify Docs. */
  const isPendingDocsCard = verification.kind === "pending_docs";
  const showVerificationPill = !isPendingDocsCard;
  const showVerifyDocsAction = !isPendingDocsCard;
  const showPayAction = Boolean(canManageFinance && readiness.paymentReady && onPay);
  const showCardFooter =
    showVerificationPill || showPaymentPill || showVerifyDocsAction || showPayAction;
  const requiredTone = groupToneVisual(checklistTone(required.verified, required.total));
  const tripId = complianceTripDisplayId(trip);
  const when = formatComplianceTimestamp(complianceEventAt(trip));
  const fullyVerified = Boolean(summary.complianceVerifiedAt);
  const payLabel = paymentReadinessLabel(readiness);

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
                size={HUB_CARD_HEAD_AVATAR}
              />
              <View style={styles.headText}>
                <Text style={styles.brand} numberOfLines={1}>
                  {formatPartyName(clientName)}
                </Text>
                <Text style={styles.partnerSubline} numberOfLines={1}>
                  {tripId}
                </Text>
              </View>
            </View>
            <View style={styles.headMetaCol}>
              <Text style={styles.headMeta} numberOfLines={1}>
                {headStatusUpper}
              </Text>
              {showPaymentPill ? (
                <Text style={styles.headMetaMuted} numberOfLines={1}>
                  {verification.label}
                </Text>
              ) : null}
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
            <PartyChip
              name={driverLabel}
              entityType="driver"
              avatarSeed={driverFb}
              alignEnd
            />
          </View>
        </Pressable>

        <View style={styles.complianceBody}>
          <View style={styles.checklistHeader}>
            <Text style={styles.checklistTitle}>REQUIRED DOCUMENTS</Text>
            <Text style={[styles.checklistProgress, { color: requiredTone.fg }]}>
              {required.verified}/{required.total} verified
            </Text>
          </View>
          <View style={styles.groupRow}>
            {displayGroups.map((group) => (
              <ChecklistGroupTile
                key={group.key}
                group={group}
                countLabel={
                  group.key === "trip"
                    ? `${required.verified}/${required.total} Verified`
                    : `${group.verified}/${group.total} On file`
                }
                onPress={() => onReviewDocuments(group.key)}
              />
            ))}
          </View>

          <View style={styles.blockerBox}>
            <Text
              style={[
                styles.payLabel,
                readiness.paymentReady ? styles.payReady : styles.payBlocked,
              ]}
            >
              {payLabel.label}
            </Text>
            {fullyVerified ? (
              <Text style={styles.blockerLine}>Compliance Verified ✓</Text>
            ) : null}
            <Text style={styles.blockerLine}>Next: {readiness.nextAction}</Text>
            {readiness.blockerLines.slice(0, 3).map((line) => (
              <Text key={line} style={styles.blockerLine}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        {showCardFooter ? (
          <View style={styles.cardFooter}>
            {showVerificationPill || showPaymentPill ? (
              <View style={styles.pillRow}>
                {showVerificationPill ? (
                  <View
                    style={[
                      styles.stagePill,
                      styles.stagePillWide,
                      { backgroundColor: verification.tone.bg },
                    ]}
                    accessibilityLabel={`Verification: ${verification.label}`}
                  >
                    {verification.kind === "verified" ? (
                      <Check size={10} color={verification.tone.fg} strokeWidth={2.6} />
                    ) : (
                      <View style={[styles.stageDot, { backgroundColor: verification.tone.fg }]} />
                    )}
                    <Text
                      style={[styles.stagePillText, { color: verification.tone.fg }]}
                      numberOfLines={1}
                    >
                      {verification.label}
                    </Text>
                  </View>
                ) : null}
                {showPaymentPill ? (
                  <View
                    style={[
                      styles.stagePill,
                      styles.stagePillWide,
                      { backgroundColor: payment.tone.bg },
                    ]}
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
                ) : null}
              </View>
            ) : (
              <View />
            )}
            {showVerifyDocsAction || showPayAction ? (
              <View style={styles.footerActions}>
                {showVerifyDocsAction ? (
                  fullyVerified ? (
                    <TouchableOpacity
                      style={styles.verifiedBtn}
                      onPress={() => onReviewDocuments("trip")}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Documents verified"
                    >
                      <Check
                        size={12}
                        color={Theme.complianceVerifiedPillFg}
                        strokeWidth={2.4}
                      />
                      <Text style={styles.verifiedBtnText}>Verified</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.verifyBtn}
                      onPress={() => onReviewDocuments("trip")}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Verify documents"
                    >
                      <Check size={12} color={Theme.buttonPrimaryText} strokeWidth={2.4} />
                      <Text style={styles.verifyBtnText}>Verify Docs</Text>
                    </TouchableOpacity>
                  )
                ) : null}
                {showPayAction ? (
                  <TouchableOpacity
                    style={styles.verifyBtn}
                    onPress={onPay}
                    accessibilityRole="button"
                  >
                    <Text style={styles.verifyBtnText}>Pay</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    width: "100%",
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
      } as ViewStyle,
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
    paddingBottom: 12,
  },
  bodyPressed: {
    opacity: 0.98,
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  headLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: HUB_CARD_HEAD_LEFT_GAP,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    minHeight: HUB_CARD_HEAD_AVATAR,
    justifyContent: "center",
    gap: 2,
  },
  brand: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: -0.1,
    fontWeight: "500",
  },
  partnerSubline: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    color: REF.accent,
    letterSpacing: 0.2,
  },
  headMetaCol: {
    flexShrink: 0,
    maxWidth: "42%",
    alignItems: "flex-end",
    gap: 3,
    paddingTop: 1,
  },
  headMeta: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
    color: REF.muted,
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: 0.25,
  },
  headMetaMuted: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "400",
    color: REF.muted,
    textAlign: "right",
  },
  route: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  leg: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: "48%",
    overflow: "hidden",
  },
  legEnd: {
    alignItems: "flex-end",
  },
  legRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    minWidth: 0,
  },
  legRowEnd: {
    justifyContent: "flex-end",
  },
  legText: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    ...Platform.select({
      web: { width: "100%" } as ViewStyle,
      default: {},
    }),
  },
  legTextEnd: {
    alignItems: "flex-end",
  },
  routePin: {
    width: ROUTE_PIN_SIZE,
    height: ROUTE_PIN_SIZE,
    borderRadius: ROUTE_PIN_SIZE / 2,
    marginTop: 2,
    flexShrink: 0,
  },
  routePinOrigin: {
    backgroundColor: REF.accent,
  },
  routePinDest: {
    backgroundColor: Theme.positive,
  },
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
  legStatePlaceholder: {
    opacity: 0,
  },
  textEnd: {
    textAlign: "right",
  },
  routeMid: {
    width: 24,
    paddingTop: 2,
    alignItems: "center",
    justifyContent: "flex-start",
    flexShrink: 0,
  },
  routeArrow: {
    fontSize: 16,
    fontWeight: "300",
    color: REF.muted,
    lineHeight: 18,
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
  chip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chipEnd: {
    justifyContent: "flex-end",
  },
  chipCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  chipCopyEnd: {
    alignItems: "flex-end",
  },
  chipName: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: REF.ink,
    letterSpacing: -0.1,
  },
  chipNameEnd: {
    textAlign: "right",
  },
  complianceBody: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  checklistHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  checklistTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: REF.muted,
    letterSpacing: 0.4,
  },
  checklistProgress: {
    fontSize: 9,
    fontWeight: "700",
  },
  groupRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  groupTile: {
    width: "48%",
    flexGrow: 1,
    flexBasis: "47%",
    maxWidth: "100%",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 5,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 3,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    flex: 1,
    minWidth: 0,
  },
  groupDots: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 3,
  },
  groupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  groupCount: {
    fontSize: 10,
    fontWeight: "700",
  },
  blockerBox: {
    gap: 2,
    paddingTop: 4,
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderRadius: 10,
    backgroundColor: Theme.compliancePageBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: REF.hairline,
  },
  payLabel: {
    fontSize: 11,
    fontWeight: "800",
  },
  payReady: {
    color: Theme.complianceStageSuccessFg,
  },
  payBlocked: {
    color: Theme.complianceStageDocsFg,
  },
  blockerLine: {
    fontSize: 10,
    color: Theme.textMuted,
    lineHeight: 14,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: REF.hairline,
  },
  pillRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  stagePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    flexShrink: 1,
    minWidth: 0,
  },
  stagePillWide: {
    flex: 1,
  },
  stageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stagePillText: {
    fontSize: 11,
    fontWeight: "700",
    flexShrink: 1,
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  verifyBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: Theme.buttonPrimaryRadius,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  verifyBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  verifiedBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Theme.complianceVerifiedPillBg,
    borderWidth: 1,
    borderColor: Theme.complianceVerifiedPillBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  verifiedBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.complianceVerifiedPillFg,
  },
});
