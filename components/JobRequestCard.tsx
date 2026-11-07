/**
 * Job Request Card — trip assignment UI for driver (connectivity + OTP flow).
 * Visual layout aligned with driver `DriverInviteModal` (emerald hero, offer tiles, footer).
 */
import {
  HeroAssignerBlock,
  HeroKindBadge,
  RouteInlineRow,
  sheetStyles,
  TRIP_SHEET_BODY_PAD,
  TRIP_SHEET_BTN_HEIGHT,
  TRIP_SHEET_HERO_PAD,
  TRIP_SHEET_TOP_RADIUS,
  TripDetailsStrip,
} from "@/components/driver/DriverTripSheetLayout";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import type { JobCardAssignerPayload } from "@/features/trips/utils/driverAssignerDisplay.util";
import { LinearGradient } from "expo-linear-gradient";
import {
  Sparkles,
  Wallet,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from "react-native";

const OTP_LENGTH = 6;

const EMERALD = Theme.driverEmerald;
const EMERALD_DARK = Theme.driverEmeraldDark;
const MINT = "rgba(167,243,208,0.92)";

export interface JobRequestCardProps {
  pickup: string;
  dropoff: string;
  distance: string;
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
  assignmentId?: string;
  assignedBy?: JobCardAssignerPayload | null;
  assignedByLine?: string | null;
  onAssignerPress?: () => void;
  OtpInputComponent?: ComponentType<TextInputProps>;
  onOtpFocus?: () => void;
  otpKeyboardInset?: number;
  onViewTripPlan?: () => void;
  tripPlanAvailable?: boolean;
}

export function JobRequestCard({
  pickup,
  dropoff,
  distance,
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
  assignmentId,
  assignedBy = null,
  assignedByLine = null,
  OtpInputComponent: OtpInput = TextInput,
  onOtpFocus,
  otpKeyboardInset = 0,
  onViewTripPlan,
  tripPlanAvailable = false,
}: JobRequestCardProps) {
  const [isAccepted, setIsAccepted] = useState(false);
  const acceptedOnceRef = useRef(false);
  const otpInputRef = useRef<TextInput | null>(null);

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
    if (!otpMode) {
      setIsAccepted(false);
    }
  }, [otpMode]);

  const completeAccept = useCallback(() => {
    if (acceptedOnceRef.current || disabled) return;
    acceptedOnceRef.current = true;
    setIsAccepted(true);
    onAccept();
  }, [disabled, onAccept]);

  /** Same proceed/back pattern as POD complete delivery. */
  const requestAcceptConfirm = useCallback(() => {
    if (disabled || isAccepted) return;
    const title = "Accept trip?";
    const message = "Take this assignment and start the mission.";
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
      { text: "Back", style: "cancel" },
      { text: "Proceed", onPress: () => completeAccept() },
    ]);
  }, [completeAccept, disabled, isAccepted]);

  const shellStyle =
    variant === "page" || edgeToEdge
      ? [
          styles.sheet,
          styles.sheetEdgeToEdge,
          Platform.OS === "ios" ? styles.sheetShadowIos : styles.sheetShadowAndroid,
        ]
      : [
          styles.sheet,
          styles.sheetInset,
          Platform.OS === "ios" ? styles.sheetShadowIos : styles.sheetShadowAndroid,
        ];

  const showHeroAssigner =
    assignedBy != null
      ? Boolean(
          assignedBy.linePrimary.trim() || assignedBy.lineSecondary.trim(),
        )
      : Boolean(assignedByLine?.trim());

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
          <Text style={[styles.collapseChevron, { color: mutedTextColor }]}>
            {collapsed ? "▲" : "▼"}
          </Text>
        </TouchableOpacity>
      ) : null}

      {otpMode ? (
        <View
          style={[
            styles.otpPageWrap,
            otpKeyboardInset > 0 && { paddingBottom: otpKeyboardInset },
          ]}
        >
          <LinearGradient
            colors={[EMERALD_DARK, EMERALD]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCompact}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.heroEyebrowRow}>
                <Sparkles size={9} color={MINT} strokeWidth={2.5} />
                <Text style={styles.heroEyebrow}>VERIFY TRIP</Text>
              </View>
              {assignedBy ? (
                <HeroKindBadge kind={assignedBy.kind} label={assignedBy.kindLabel} />
              ) : null}
            </View>
            <Text style={styles.heroTitleCompact}>Enter trip OTP</Text>
            {showHeroAssigner ? (
              <View style={styles.heroAssignerOtpWrap}>
                <HeroAssignerBlock
                  assigner={assignedBy}
                  assignedByLine={assignedByLine}
                />
              </View>
            ) : null}
          </LinearGradient>
          <View style={styles.body}>
            <Text style={[styles.otpSubtitle, { color: mutedTextColor }]}>
              Enter the 6-digit OTP shared by your dispatcher to claim this trip.
            </Text>
            <View style={sheetStyles.tripDetailsCard}>
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
                styles.verifyBtnWrap,
                (otpSubmitting || otpValue.length !== OTP_LENGTH) &&
                  styles.btnDisabled,
              ]}
              disabled={otpSubmitting || otpValue.length !== OTP_LENGTH}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={[EMERALD, EMERALD_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.verifyGradient}
              >
                <Text style={styles.verifyText}>
                  {otpSubmitting ? "Verifying…" : "Verify OTP"}
                </Text>
              </LinearGradient>
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
        </View>
      ) : (
        <>
          <LinearGradient
            colors={[EMERALD_DARK, EMERALD]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.heroEyebrowRow}>
                <Sparkles size={9} color={MINT} strokeWidth={2.5} />
                <Text style={styles.heroEyebrow}>TRIP ASSIGNMENT</Text>
              </View>
              {assignedBy ? (
                <HeroKindBadge kind={assignedBy.kind} label={assignedBy.kindLabel} />
              ) : null}
            </View>
            <View style={styles.heroMainRow}>
              <View
                style={[
                  styles.heroEarningsBlock,
                  !showHeroAssigner && styles.heroEarningsBlockFull,
                ]}
              >
                <View style={styles.heroIconWrap}>
                  <Wallet size={14} color={EMERALD} strokeWidth={2.2} />
                </View>
                <View style={styles.heroTextBlock}>
                  <Text style={styles.heroAmount} numberOfLines={1}>
                    {earnings}
                  </Text>
                  <Text style={styles.heroAmountLabel}>{earningsLabel}</Text>
                </View>
              </View>
              {showHeroAssigner ? (
                <>
                  <View style={styles.heroColDivider} />
                  <HeroAssignerBlock
                    assigner={assignedBy}
                    assignedByLine={assignedByLine}
                  />
                </>
              ) : null}
            </View>
          </LinearGradient>

          {!collapsed ? (
            <View style={styles.body}>
              <View style={styles.sectionHeader}>
                <Text style={[sheetStyles.sectionLabel, { color: mutedTextColor }]}>
                  TRIP DETAILS
                </Text>
              </View>

              <TripDetailsStrip
                statLeft={distance}
                statRight={eta}
                pickup={pickup}
                dropoff={dropoff}
                primaryTextColor={primaryTextColor}
                mutedTextColor={mutedTextColor}
                dense
              />

              {errorMessage ? (
                <Text style={[styles.errorText, { color: Theme.negative }]}>
                  {errorMessage}
                </Text>
              ) : null}

              {onViewTripPlan ? (
                <TouchableOpacity
                  onPress={onViewTripPlan}
                  disabled={disabled}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="View trip plan"
                  style={styles.planBtn}
                >
                  <Text style={[styles.planBtnText, { color: accentColor }]}>
                    {tripPlanAvailable ? 'View trip plan on map' : 'View trip plan'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.footer}>
                <View style={styles.actions}>
                  {onDecline != null && !isAccepted ? (
                    <TouchableOpacity
                      onPress={onDecline}
                      style={styles.declineBtn}
                      disabled={disabled}
                      activeOpacity={0.82}
                    >
                      <Text style={[styles.declineBtnText, { color: mutedTextColor }]}>
                        Decline
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={requestAcceptConfirm}
                    style={[
                      styles.acceptBtn,
                      onDecline != null && !isAccepted ? styles.acceptBtnFlex : styles.acceptBtnFull,
                      disabled && styles.btnDisabled,
                    ]}
                    disabled={disabled || isAccepted}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel="Accept trip"
                  >
                    <LinearGradient
                      colors={[EMERALD, EMERALD_DARK]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.acceptGradient}
                    >
                      <Text style={styles.acceptLabel} numberOfLines={1}>
                        {isAccepted
                          ? requireOtp
                            ? "Accepted! Enter OTP"
                            : "Accepted!"
                          : "Accept trip"}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Theme.surface,
    borderTopLeftRadius: TRIP_SHEET_TOP_RADIUS,
    borderTopRightRadius: TRIP_SHEET_TOP_RADIUS,
    overflow: "hidden",
  },
  sheetInset: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  sheetEdgeToEdge: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  sheetShadowIos: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  sheetShadowAndroid: {
    elevation: 12,
  },
  collapseHandle: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  collapseChevron: {
    fontSize: 10,
    fontWeight: "800",
  },
  hero: {
    paddingTop: TRIP_SHEET_HERO_PAD.top,
    paddingHorizontal: TRIP_SHEET_HERO_PAD.horizontal,
    paddingBottom: TRIP_SHEET_HERO_PAD.bottom,
    gap: 10,
  },
  heroCompact: {
    paddingTop: TRIP_SHEET_HERO_PAD.top,
    paddingHorizontal: TRIP_SHEET_HERO_PAD.horizontal,
    paddingBottom: TRIP_SHEET_HERO_PAD.bottom,
    gap: 10,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heroEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
    minWidth: 0,
  },
  heroEyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.9,
    color: MINT,
    textTransform: "uppercase",
  },
  heroMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  heroEarningsBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  heroEarningsBlockFull: {
    flex: 1,
  },
  heroColDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.28)",
    alignSelf: "center",
    flexShrink: 0,
  },
  heroAssignerOtpWrap: {
    marginTop: 2,
    paddingTop: 6,
    paddingLeft: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.22)",
  },
  heroIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  heroAmount: {
    fontSize: 17,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: -0.25,
    lineHeight: 20,
  },
  heroAmountLabel: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: MINT,
    textTransform: "uppercase",
  },
  heroTitleCompact: {
    fontSize: 17,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: -0.3,
  },
  body: {
    paddingHorizontal: TRIP_SHEET_BODY_PAD.horizontal,
    paddingTop: TRIP_SHEET_BODY_PAD.top,
    paddingBottom: TRIP_SHEET_BODY_PAD.bottom,
    gap: 6,
    backgroundColor: Theme.surface,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 0,
  },
  errorText: {
    fontSize: 11,
    fontWeight: "600",
  },
  planBtn: {
    minHeight: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  planBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  footer: {
    paddingTop: 0,
  },
  actions: {
    flexDirection: "row",
    gap: 6,
    alignItems: "stretch",
  },
  declineBtn: {
    flex: 1,
    minHeight: TRIP_SHEET_BTN_HEIGHT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  declineBtnText: {
    ...sheetStyles.bodyLinkText,
    fontWeight: "600",
  },
  acceptBtn: {
    minHeight: TRIP_SHEET_BTN_HEIGHT,
    borderRadius: 10,
    overflow: "hidden",
  },
  acceptBtnFlex: {
    flex: 1.55,
  },
  acceptBtnFull: {
    flex: 1,
  },
  acceptGradient: {
    flex: 1,
    minHeight: TRIP_SHEET_BTN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  acceptLabel: {
    ...sheetStyles.bodyBtnText,
    color: "#fff",
  },
  btnDisabled: {
    opacity: 0.65,
  },
  declineLinkWrap: {
    alignSelf: "center",
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  declineLink: {
    fontSize: 14,
    fontWeight: "600",
  },
  otpPageWrap: {
    width: "100%",
  },
  otpSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  otpBoxRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    width: "100%",
  },
  otpBox: {
    width: 40,
    height: 46,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  otpBoxDigit: {
    fontSize: 18,
    fontWeight: "800",
  },
  otpHiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  verifyBtnWrap: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
  },
  verifyGradient: {
    minHeight: TRIP_SHEET_BTN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  verifyText: {
    ...sheetStyles.bodyBtnText,
    color: "#fff",
  },
});

export default JobRequestCard;
