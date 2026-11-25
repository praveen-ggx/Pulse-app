/**
 * Job Request Card — trip assignment offer for drivers.
 * Haulr-inspired white sheet: progress kicker, single route hero, tag pills,
 * circular map shortcuts, note strip, lime primary CTA.
 */
import {
  HeroAssignerBlock,
  RouteInlineRow,
  compactRoutePlace,
  TRIP_SHEET_TOP_RADIUS,
} from "@/components/driver/DriverTripSheetLayout";
import { GpsOdometerCompareTags } from "@/components/GpsOdometerCompareTags";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { GpsOdometerCompareModel } from "@/features/drivers/utils/driverDisplayDistance.util";
import type { JobCardAssignerPayload } from "@/features/trips/utils/driverAssignerDisplay.util";
import {
  ArrowRight,
  Bell,
  Map as MapIcon,
  Navigation,
  Route,
  Sparkles,
} from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from "react-native";

const OTP_LENGTH = 6;
/** App green for job-card CTAs (chat notifications keep Theme.driverLime). */
const LIME = Theme.driverPrimary;
const LIME_INK = Theme.textOnPrimary;
const EMERALD = Theme.driverEmerald;

export interface JobRequestCardProps {
  pickup: string;
  dropoff: string;
  /** Planned / single distance label for offers (never mix with odo/GPS). */
  distance: string;
  /**
   * When both odometer + GPS exist (active/completed), show labeled compare
   * instead of one conflated distance number.
   */
  distanceCompare?: GpsOdometerCompareModel | null;
  eta: string;
  earnings: string;
  /** Defaults to EST. EARNINGS; use PAY N/A when amount is not applicable. */
  earningsLabel?: string;
  onAccept: () => void;
  onDecline: () => void;
  onToggleCollapse?: () => void;
  collapsed?: boolean;
  requireOtp?: boolean;
  disabled?: boolean;
  accentColor?: string;
  earningsAmountColor?: string;
  primaryTextColor?: string;
  mutedTextColor?: string;
  errorMessage?: string | null;
  otpMode?: boolean;
  otpValue?: string;
  onOtpChange?: (value: string) => void;
  onOtpSubmit?: () => void;
  otpSubmitting?: boolean;
  otpError?: string | null;
  onOtpCancel?: () => void;
  edgeToEdge?: boolean;
  variant?: "card" | "page";
  /**
   * Extra top pad when the card sits under a floating DriverHeader (map home).
   * Keeps the route hero fully visible below avatar / pulsepilot / actions.
   */
  contentTopInset?: number;
  /** Extra bottom pad so Accept/Decline clear the floating tab dock. */
  contentBottomInset?: number;
  assignmentId?: string;
  assignedBy?: JobCardAssignerPayload | null;
  assignedByLine?: string | null;
  onAssignerPress?: () => void;
  OtpInputComponent?: ComponentType<TextInputProps>;
  onOtpFocus?: () => void;
  otpKeyboardInset?: number;
  onViewTripPlan?: () => void;
  tripPlanAvailable?: boolean;
  onNavigateToPickup?: () => void;
  onSeeRoute?: () => void;
}

/** Haulr offer sheet — keep this name stable for callers; bump when Fast Refresh sticks. */
export function JobRequestCard({
  pickup,
  dropoff,
  distance,
  distanceCompare = null,
  eta,
  earnings,
  earningsLabel = "EST. EARNINGS",
  onAccept,
  onDecline,
  onToggleCollapse,
  collapsed = false,
  requireOtp = false,
  disabled = false,
  accentColor = EMERALD,
  primaryTextColor = Theme.textPrimaryDark,
  mutedTextColor = Theme.textMuted,
  errorMessage = null,
  otpMode = false,
  otpValue = "",
  onOtpChange,
  onOtpSubmit,
  otpSubmitting = false,
  otpError = null,
  onOtpCancel,
  edgeToEdge = false,
  variant = "card",
  contentTopInset = 0,
  contentBottomInset = 0,
  assignmentId,
  assignedBy = null,
  assignedByLine = null,
  OtpInputComponent: OtpInput = TextInput,
  onOtpFocus,
  otpKeyboardInset = 0,
  onViewTripPlan,
  tripPlanAvailable = false,
  onNavigateToPickup,
  onSeeRoute,
}: JobRequestCardProps) {
  const [isAccepted, setIsAccepted] = useState(false);
  const acceptedOnceRef = useRef(false);
  const otpInputRef = useRef<TextInput | null>(null);
  const isPage = variant === "page" || edgeToEdge;

  const assignmentResetKey = useMemo(
    () =>
      assignmentId != null && String(assignmentId).length > 0
        ? `id:${String(assignmentId)}`
        : `route:${pickup}\u0001${dropoff}`,
    [assignmentId, pickup, dropoff],
  );

  useEffect(() => {
    setIsAccepted(false);
    acceptedOnceRef.current = false;
  }, [assignmentResetKey]);

  useEffect(() => {
    if (!otpMode) setIsAccepted(false);
  }, [otpMode]);

  const completeAccept = useCallback(() => {
    if (acceptedOnceRef.current || disabled) return;
    acceptedOnceRef.current = true;
    setIsAccepted(true);
    onAccept();
  }, [disabled, onAccept]);

  const requestAcceptConfirm = useCallback(() => {
    if (disabled || isAccepted) return;
    const title = "You're up — accept this trip?";
    const message = `${pickup} → ${dropoff}\n\nAccept to open your job card and head to pickup.`;
    if (Platform.OS === "web") {
      const w =
        typeof globalThis !== "undefined"
          ? (globalThis as { confirm?: (msg: string) => boolean }).confirm
          : undefined;
      if (typeof w === "function" && w(`${title}\n\n${message}`)) {
        completeAccept();
      }
      return;
    }
    Alert.alert(title, message, [
      { text: "Not now", style: "cancel" },
      { text: "Accept & go", onPress: () => completeAccept() },
    ]);
  }, [completeAccept, disabled, dropoff, isAccepted, pickup]);

  const shellStyle = isPage
    ? [styles.sheet, styles.sheetEdgeToEdge, styles.sheetFullPage]
    : [styles.sheet, styles.sheetInset];

  const showHeroAssigner =
    assignedBy != null
      ? Boolean(assignedBy.linePrimary.trim() || assignedBy.lineSecondary.trim())
      : Boolean(assignedByLine?.trim());

  const showShortcuts =
    Boolean(onViewTripPlan) || Boolean(onSeeRoute) || Boolean(onNavigateToPickup);

  const pickupShort = compactRoutePlace(pickup);
  const dropoffShort = compactRoutePlace(dropoff);
  const hasBothStops = pickupShort !== "—" && dropoffShort !== "—";
  /** Single hero line — no stacked drop-city + route (they overlapped). */
  const titleLine = hasBothStops
    ? `${pickupShort} → ${dropoffShort}`
    : pickupShort !== "—"
      ? pickupShort
      : dropoffShort;

  const assignerNote =
    assignedByLine?.trim() ||
    (assignedBy?.linePrimary?.trim()
      ? [assignedBy.linePrimary, assignedBy.lineSecondary].filter(Boolean).join(" · ")
      : "");
  const noteText =
    assignerNote || "Ready when you are — accept to open your job card.";

  const earningsTrim = (earnings ?? "").trim();
  const showEarningsTag =
    earningsTrim.length > 0 &&
    earningsTrim !== "—" &&
    earningsTrim !== "-" &&
    !/^pay\s*n\/?a$/i.test(earningsTrim);

  return (
    <View style={shellStyle}>
      {onToggleCollapse ? (
        <TouchableOpacity
          onPress={onToggleCollapse}
          style={styles.collapseHandle}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? "Expand" : "Collapse"}
          hitSlop={12}
        >
          <View style={styles.collapseBar} />
        </TouchableOpacity>
      ) : (
        <View style={styles.sheetGrabRow}>
          <View style={styles.collapseBar} />
        </View>
      )}

      {otpMode ? (
        <View
          style={[
            styles.body,
            otpKeyboardInset > 0 && { paddingBottom: otpKeyboardInset },
          ]}
        >
          <View style={styles.topMetaRow}>
            <Text style={styles.progressKicker}>VERIFY TRIP</Text>
            {assignedBy ? <LightKindBadge label={assignedBy.kindLabel} /> : null}
          </View>
          <Text style={[styles.routeTitle, { color: primaryTextColor }]}>
            Enter trip OTP
          </Text>
          <Text style={[styles.routeSupport, { color: mutedTextColor }]}>
            Enter the 6-digit OTP shared by your dispatcher to claim this trip.
          </Text>

          {showHeroAssigner ? (
            <View style={styles.assignerInline}>
              <HeroAssignerBlock
                assigner={assignedBy}
                assignedByLine={assignedByLine}
              />
            </View>
          ) : null}

          <View style={styles.addressCard}>
            <RouteInlineRow
              pickup={pickup}
              dropoff={dropoff}
              primaryTextColor={primaryTextColor}
              mutedTextColor={mutedTextColor}
            />
          </View>

          <TouchableOpacity
            style={styles.otpBoxRow}
            onPress={() => otpInputRef.current?.focus()}
            activeOpacity={1}
          >
            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.otpBox,
                  {
                    borderColor:
                      otpValue.length === i ? accentColor : Theme.border,
                  },
                ]}
              >
                <Text style={[styles.otpBoxDigit, { color: primaryTextColor }]}>
                  {otpValue[i] ?? ""}
                </Text>
              </View>
            ))}
          </TouchableOpacity>
          <OtpInput
            value={otpValue}
            onChangeText={(value) =>
              onOtpChange?.(value.replace(/\D/g, "").slice(0, OTP_LENGTH))
            }
            onFocus={onOtpFocus}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            style={styles.otpHiddenInput}
            caretHidden
            autoFocus
          />
          {otpError ? (
            <Text style={[styles.errorText, { color: Theme.negative }]}>
              {otpError}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={onOtpSubmit}
            style={[
              styles.primaryCta,
              (otpSubmitting || otpValue.length !== OTP_LENGTH) &&
                styles.btnDisabled,
            ]}
            disabled={otpSubmitting || otpValue.length !== OTP_LENGTH}
            activeOpacity={0.9}
          >
            <View style={styles.primaryCtaIcon}>
              <ArrowRight size={16} color={LIME_INK} strokeWidth={2.6} />
            </View>
            <Text style={styles.primaryCtaLabel}>
              {otpSubmitting ? "Verifying…" : "Verify OTP"}
            </Text>
          </TouchableOpacity>
          {onOtpCancel ? (
            <TouchableOpacity
              onPress={onOtpCancel}
              style={styles.declineLinkWrap}
              activeOpacity={0.7}
            >
              <Text style={[styles.declineLink, { color: mutedTextColor }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <>
          <View
            style={[
              styles.body,
              isPage && styles.bodyPage,
              contentTopInset > 0 && { paddingTop: 8 + contentTopInset },
              contentBottomInset > 0 && {
                paddingBottom: (isPage ? 18 : 16) + contentBottomInset,
              },
            ]}
          >
            <View style={styles.heroBlock}>
              <View style={styles.topMetaRow}>
                <View style={styles.progressRow}>
                  <Sparkles size={11} color={EMERALD} strokeWidth={2.5} />
                  <Text style={styles.progressKicker}>NEW TRIP FOR YOU</Text>
                </View>
                <View style={styles.topMetaActions}>
                  {onDecline != null && !isAccepted ? (
                    <TouchableOpacity
                      onPress={onDecline}
                      style={styles.declineChip}
                      disabled={disabled}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel="Decline trip"
                      hitSlop={8}
                    >
                      <Text
                        style={[
                          styles.declineChipText,
                          { color: mutedTextColor },
                        ]}
                        numberOfLines={1}
                      >
                        Decline
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {assignedBy ? (
                    <LightKindBadge label={assignedBy.kindLabel} />
                  ) : null}
                </View>
              </View>

              <Text
                style={[styles.routeTitle, { color: primaryTextColor }]}
                numberOfLines={2}
              >
                {titleLine}
              </Text>

              <View style={styles.tagRow}>
                {eta && eta !== "—" ? (
                  <View style={[styles.tag, styles.tagEta]}>
                    <Text style={styles.tagEtaText} numberOfLines={1}>
                      ETA {eta}
                    </Text>
                  </View>
                ) : null}
                {distanceCompare?.canCompare ? (
                  <GpsOdometerCompareTags
                    model={distanceCompare}
                    plannedLabel={distance}
                  />
                ) : distance && distance !== "—" ? (
                  <View style={[styles.tag, styles.tagMuted]}>
                    <Text style={styles.tagMutedText} numberOfLines={1}>
                      {distance}
                    </Text>
                  </View>
                ) : null}
                {showEarningsTag ? (
                  <View style={[styles.tag, styles.tagWarn]}>
                    <Text style={styles.tagWarnText} numberOfLines={1}>
                      {earningsTrim}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {!collapsed ? (
              <>
                <View style={styles.detailsBlock}>
                  {showShortcuts ? (
                    <View style={styles.previewRail}>
                      <View style={styles.previewRailHeader}>
                        <Text style={styles.previewRailKicker}>
                          PLAN PREVIEW
                        </Text>
                        <Text
                          style={[
                            styles.previewRailHint,
                            { color: mutedTextColor },
                          ]}
                          numberOfLines={1}
                        >
                          {tripPlanAvailable
                            ? "Map + corridor on stage"
                            : "Peek map to preview"}
                        </Text>
                      </View>
                      <View style={styles.previewRailRow}>
                        {onViewTripPlan ? (
                          <PreviewTile
                            label="Map"
                            caption={
                              tripPlanAvailable ? "Stops on map" : "Open map"
                            }
                            onPress={onViewTripPlan}
                            disabled={disabled}
                            tone="map"
                            icon={
                              <MapIcon
                                size={18}
                                color={Theme.driverPrimary}
                                strokeWidth={2.35}
                              />
                            }
                          />
                        ) : null}
                        {onSeeRoute ? (
                          <PreviewTile
                            label="Route"
                            caption="Pickup → drop"
                            onPress={onSeeRoute}
                            disabled={disabled}
                            tone="route"
                            icon={
                              <Route
                                size={18}
                                color={Theme.driverPrimary}
                                strokeWidth={2.35}
                              />
                            }
                          />
                        ) : null}
                        {onNavigateToPickup ? (
                          <PreviewTile
                            label="Navigate"
                            caption="Turn-by-turn"
                            onPress={onNavigateToPickup}
                            disabled={disabled}
                            tone="nav"
                            icon={
                              <Navigation
                                size={18}
                                color={LIME_INK}
                                strokeWidth={2.35}
                              />
                            }
                          />
                        ) : null}
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.noteCard}>
                    <View style={styles.noteIconPlate}>
                      <Bell size={14} color={EMERALD} strokeWidth={2.3} />
                    </View>
                    <View style={styles.noteCopy}>
                      <Text style={styles.noteLabel}>TRIP NOTE</Text>
                      <Text
                        style={[styles.noteBody, { color: primaryTextColor }]}
                        numberOfLines={2}
                      >
                        {noteText}
                      </Text>
                      {showEarningsTag ? (
                        <Text
                          style={[styles.noteMeta, { color: mutedTextColor }]}
                        >
                          {earningsLabel}: {earningsTrim}
                        </Text>
                      ) : earningsLabel ? (
                        <Text
                          style={[styles.noteMeta, { color: mutedTextColor }]}
                        >
                          {earningsLabel}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {showHeroAssigner ? (
                    <View style={styles.assignerRow}>
                      <HeroAssignerBlock
                        assigner={assignedBy}
                        assignedByLine={assignedByLine}
                      />
                    </View>
                  ) : null}

                  <Text
                    style={[styles.missionKicker, { color: mutedTextColor }]}
                  >
                    Full stop addresses
                  </Text>
                  <View style={styles.addressCard}>
                    <RouteInlineRow
                      pickup={pickup}
                      dropoff={dropoff}
                      primaryTextColor={primaryTextColor}
                      mutedTextColor={mutedTextColor}
                      useFullPlace
                      dense
                    />
                  </View>

                  {errorMessage ? (
                    <Text style={[styles.errorText, { color: Theme.negative }]}>
                      {errorMessage}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.ctaBlock}>
                  <TouchableOpacity
                    onPress={requestAcceptConfirm}
                    style={[styles.primaryCta, disabled && styles.btnDisabled]}
                    disabled={disabled || isAccepted}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel="Accept trip"
                  >
                    <View style={styles.primaryCtaIcon}>
                      <ArrowRight size={16} color={LIME_INK} strokeWidth={2.6} />
                    </View>
                    <Text style={styles.primaryCtaLabel} numberOfLines={1}>
                      {isAccepted
                        ? requireOtp
                          ? "Accepted! Enter OTP"
                          : "Opening job card…"
                        : "Accept & go"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

function LightKindBadge({ label }: { label: string }) {
  return (
    <View style={styles.kindPill}>
      <Text style={styles.kindPillText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function PreviewTile({
  label,
  caption,
  icon,
  onPress,
  disabled,
  tone,
}: {
  label: string;
  caption: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  tone: "map" | "route" | "nav";
}) {
  const isNav = tone === "nav";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${caption}`}
      style={({ pressed }) => [
        styles.previewTile,
        isNav ? styles.previewTileNav : styles.previewTileMap,
        { opacity: disabled ? 0.5 : pressed ? 0.88 : 1 },
      ]}
    >
      <View
        style={[
          styles.previewIconWell,
          isNav ? styles.previewIconWellNav : styles.previewIconWellMap,
        ]}
      >
        {icon}
      </View>
      <Text
        style={[
          styles.previewTileLabel,
          isNav && styles.previewTileLabelNav,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.previewTileCaption,
          isNav && styles.previewTileCaptionNav,
        ]}
        numberOfLines={1}
      >
        {caption}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Theme.surface,
    borderTopLeftRadius: TRIP_SHEET_TOP_RADIUS,
    borderTopRightRadius: TRIP_SHEET_TOP_RADIUS,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.driverJobCardBorder,
  },
  sheetInset: {
    marginHorizontal: 14,
    marginBottom: 8,
  },
  sheetEdgeToEdge: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  sheetFullPage: {
    minHeight: "100%",
  },
  sheetGrabRow: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 2,
  },
  collapseHandle: {
    alignSelf: "center",
    paddingTop: 10,
    paddingBottom: 4,
    paddingHorizontal: 24,
    zIndex: 3,
  },
  collapseBar: {
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(22,28,36,0.14)",
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 14,
  },
  bodyPage: {
    paddingBottom: 18,
    flexGrow: 1,
    justifyContent: "space-between",
  },
  heroBlock: {
    gap: 10,
  },
  detailsBlock: {
    gap: 12,
    flexShrink: 1,
  },
  ctaBlock: {
    gap: 4,
    paddingTop: 8,
  },
  topMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  topMetaActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    maxWidth: "58%",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  progressKicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.85,
    color: EMERALD,
    textTransform: "uppercase",
  },
  declineChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.driverJobCardBorder,
    minHeight: 28,
    justifyContent: "center",
    flexShrink: 1,
  },
  declineChipText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  kindPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.driverEmeraldMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.driverEmeraldBorderSoft,
    flexShrink: 0,
    maxWidth: 140,
  },
  kindPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: EMERALD,
    textTransform: "uppercase",
  },
  routeTitle: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.55,
    lineHeight: 30,
  },
  routeSupport: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.1,
    lineHeight: 20,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    maxWidth: "100%",
  },
  tagEta: {
    backgroundColor: EMERALD,
  },
  tagEtaText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.1,
  },
  tagMuted: {
    backgroundColor: Theme.driverJobTagMuted,
  },
  tagMutedText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.driverJobTagMutedText,
  },
  tagWarn: {
    backgroundColor: Theme.driverJobTagWarn,
  },
  tagWarnText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.driverJobTagWarnText,
  },
  previewRail: {
    gap: 10,
    paddingVertical: 2,
  },
  previewRailHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 2,
  },
  previewRailKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.75,
    color: EMERALD,
  },
  previewRailHint: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "right",
    minWidth: 0,
  },
  previewRailRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  previewTile: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  previewTileMap: {
    backgroundColor: Theme.driverDock,
    borderColor: "rgba(198,240,53,0.22)",
  },
  previewTileNav: {
    backgroundColor: Theme.driverPrimary,
    borderColor: Theme.driverEmerald,
  },
  previewIconWell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  previewIconWellMap: {
    backgroundColor: "rgba(198,240,53,0.14)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(198,240,53,0.28)",
  },
  previewIconWellNav: {
    backgroundColor: "rgba(20,48,26,0.12)",
  },
  previewTileLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
  previewTileLabelNav: {
    color: LIME_INK,
  },
  previewTileCaption: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.62)",
    letterSpacing: -0.05,
    textAlign: "center",
  },
  previewTileCaptionNav: {
    color: "rgba(20,48,26,0.62)",
  },
  noteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: Theme.driverJobNoteBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.driverJobCardBorder,
  },
  noteIconPlate: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.driverEmeraldBorderSoft,
    flexShrink: 0,
  },
  noteCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  noteLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
    color: EMERALD,
  },
  noteBody: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  noteMeta: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 2,
  },
  assignerRow: {
    paddingHorizontal: 0,
    marginTop: 2,
  },
  missionKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginTop: 4,
  },
  addressCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.driverJobCardBorder,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryCta: {
    minHeight: 56,
    borderRadius: 999,
    backgroundColor: LIME,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
    shadowColor: LIME,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
  primaryCtaIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(20,48,26,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCtaLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: LIME_INK,
    letterSpacing: -0.2,
  },
  declineLinkWrap: {
    alignSelf: "center",
    paddingTop: 4,
    paddingBottom: 2,
    paddingHorizontal: 16,
    minHeight: Layout.minTouchTargetSize,
    justifyContent: "center",
  },
  declineLink: {
    fontSize: 14,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  errorText: {
    fontSize: 11,
    fontWeight: "600",
  },
  otpBoxRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    marginTop: 4,
  },
  otpBox: {
    width: 44,
    height: 52,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.driverJobNoteBg,
  },
  otpBoxDigit: {
    fontSize: 20,
    fontWeight: "800",
  },
  otpHiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
});

export default JobRequestCard;
