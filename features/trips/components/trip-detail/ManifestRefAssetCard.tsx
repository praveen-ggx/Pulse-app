import { EntityAvatar as PartyAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import { formatIndianVehicleNumber } from "@/lib/format";
import { formatPhoneForDisplay } from "@/lib/phoneLookup";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

const AVATAR_SIZE = 32;
const AVATAR_SIZE_DESKTOP = 44;
const VEHICLE_ICON_SIZE_DESKTOP = 44;

type Props = {
  roleLabel: string;
  primaryText: string;
  variant: "driver" | "vehicle";
  /** Shown under plate on vehicle cards (tiny). */
  vehicleType?: string | null;
  /** Driver contact number under name / rating. */
  phone?: string | null;
  ratingAvg?: number | null;
  docsIssue?: boolean;
  insightsLoading?: boolean;
  driverName?: string | null;
  driverAvatarUrl?: string | null;
  driverId?: string | null;
  showChange?: boolean;
  onChange?: () => void;
  style?: StyleProp<ViewStyle>;
  desktop?: boolean;
  /** Stretch to fill a flex parent (Journey Log equal-height slots). */
  fill?: boolean;
};

function formatDriverDisplayName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || trimmed === "Unassigned") return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Plate only — drop vehicle type / capacity joined with " · ". */
function formatVehiclePlateOnly(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || trimmed === "Pending") return trimmed;
  const platePart = trimmed.split("·")[0]?.trim() ?? trimmed;
  const formatted = formatIndianVehicleNumber(platePart).trim();
  return formatted || platePart;
}

function AssetCopyButton({
  value,
  label,
  size,
  docsIssue,
  style,
}: {
  value: string;
  label: string;
  size: number;
  docsIssue: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const text = value.trim();
  const canCopy =
    text.length > 0 && text !== "—" && text !== "Unassigned" && text !== "Pending";
  const idleColor = docsIssue ? Theme.destructive : Theme.textMuted;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!canCopy) {
    return (
      <View
        style={[styles.copySlot, style]}
        accessibilityLabel={
          docsIssue ? "Documents missing or expired" : "Documents on file"
        }
      >
        <Feather name="file-text" size={size} color={idleColor} />
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={() => {
        void (async () => {
          try {
            const copiedOk = await Clipboard.setStringAsync(text);
            if (!copiedOk) {
              Alert.alert("Copy failed", `Could not copy ${label}.`);
              return;
            }
            setCopied(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setCopied(false), 1600);
          } catch {
            Alert.alert("Copy failed", `Could not copy ${label}.`);
          }
        })();
      }}
      activeOpacity={0.7}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={copied ? `${label} copied` : `Copy ${label}`}
      style={[styles.copySlot, style]}
    >
      <Feather
        name={copied ? "check" : "copy"}
        size={size}
        color={copied ? Theme.success : idleColor}
      />
    </TouchableOpacity>
  );
}

function RatingMetaRow({
  ratingAvg,
  loading,
  desktop = false,
}: {
  ratingAvg: number | null | undefined;
  loading: boolean;
  desktop?: boolean;
}) {
  const hasRating = ratingAvg != null && Number.isFinite(ratingAvg);
  const starSize = desktop ? 13 : 11;

  if (loading) {
    return (
      <View style={styles.metaRow}>
        <ActivityIndicator size="small" color={Theme.textMuted} />
      </View>
    );
  }

  if (!hasRating) {
    return (
      <View style={styles.metaRow}>
        <Text
          style={[styles.metaText, desktop && styles.metaTextDesktop]}
          numberOfLines={1}
        >
          No rating yet
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.metaRow}>
      <View style={styles.ratingRow}>
        <FontAwesome
          name="star"
          size={starSize}
          color={Theme.feedbackModalStarActive}
        />
        <Text
          style={[styles.ratingValue, desktop && styles.ratingValueDesktop]}
          numberOfLines={1}
        >
          {ratingAvg.toFixed(1)}
        </Text>
      </View>
    </View>
  );
}

function VehicleTypeMetaRow({
  vehicleType,
  loading,
  desktop = false,
}: {
  vehicleType: string | null | undefined;
  loading: boolean;
  desktop?: boolean;
}) {
  const typeLabel = vehicleType?.trim() || null;

  if (loading) {
    return (
      <View style={styles.metaRow}>
        <ActivityIndicator size="small" color={Theme.textMuted} />
      </View>
    );
  }

  return (
    <View style={styles.metaRow}>
      {typeLabel ? (
        <View style={[styles.typeChip, desktop && styles.typeChipDesktop]}>
          <Text
            style={[styles.vehicleTypeText, desktop && styles.vehicleTypeTextDesktop]}
            numberOfLines={1}
          >
            {typeLabel}
          </Text>
        </View>
      ) : (
        <View style={styles.vehicleTypeSpacer} />
      )}
    </View>
  );
}

export function ManifestRefAssetCard({
  roleLabel,
  primaryText,
  variant,
  vehicleType = null,
  phone = null,
  ratingAvg = null,
  docsIssue = false,
  insightsLoading = false,
  driverName,
  driverAvatarUrl,
  driverId,
  showChange = false,
  onChange,
  style,
  desktop = false,
  fill = false,
}: Props) {
  const displayPrimary =
    variant === "driver"
      ? formatDriverDisplayName(primaryText)
      : formatVehiclePlateOnly(primaryText);
  const phoneDisplay =
    variant === "driver" ? formatPhoneForDisplay(phone) : "";
  const phoneDigits = (phone ?? "").replace(/[^\d+]/g, "");
  const displayVehicleType = (() => {
    if (variant !== "vehicle") return null;
    const explicit = vehicleType?.trim();
    if (explicit) return explicit;
    const trimmed = primaryText.trim();
    if (!trimmed.includes("·")) return null;
    const tail = trimmed
      .split("·")
      .slice(1)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" · ");
    return tail || null;
  })();
  const isDriver = variant === "driver";
  const avatarSize = desktop ? AVATAR_SIZE_DESKTOP : AVATAR_SIZE;

  const copyValue = isDriver ? phoneDisplay : displayPrimary;
  const copyLabel = isDriver ? "driver mobile number" : "vehicle number";

  return (
    <View
      style={[
        styles.card,
        desktop && styles.cardDesktop,
        fill && styles.cardFill,
        style,
      ]}
    >
      <View style={[styles.cardBody, desktop && styles.cardBodyDesktop]}>
        <View style={styles.headerRow}>
          <Text
            style={[styles.roleLabel, desktop && styles.roleLabelDesktop]}
            numberOfLines={1}
          >
            {roleLabel}
          </Text>
          <View style={styles.headerActions}>
            <AssetCopyButton
              value={copyValue}
              label={copyLabel}
              size={desktop ? 13 : 12}
              docsIssue={docsIssue}
            />
            {showChange && onChange ? (
              <TouchableOpacity
                onPress={onChange}
                style={styles.changeBtn}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Change ${roleLabel.toLowerCase()}`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text
                  style={[
                    styles.changeBtnText,
                    desktop && styles.changeBtnTextDesktop,
                  ]}
                >
                  Change
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.contentRow}>
          {isDriver ? (
            <View style={styles.avatarCol}>
              <PartyAvatar
                name={driverName ?? displayPrimary}
                entityType="driver"
                size={avatarSize}
                avatarUrl={driverAvatarUrl ?? undefined}
                avatarSeed={driverId ?? undefined}
                showIntegrationBadge={false}
              />
            </View>
          ) : (
            <View
              style={[styles.vehicleIcon, desktop && styles.vehicleIconDesktop]}
            >
              <Feather
                name="truck"
                size={desktop ? 18 : 14}
                color={Theme.textOnPrimary}
              />
            </View>
          )}

          <View style={styles.bodyCol}>
            <Text
              style={[styles.primaryText, desktop && styles.primaryTextDesktop]}
              numberOfLines={1}
            >
              {displayPrimary}
            </Text>

            {isDriver && phoneDisplay ? (
              <Text
                selectable
                onPress={
                  Platform.OS === "web"
                    ? undefined
                    : () => {
                        if (phoneDigits) void Linking.openURL(`tel:${phoneDigits}`);
                      }
                }
                style={[
                  styles.phoneText,
                  desktop && styles.phoneTextDesktop,
                  styles.phoneTextSelectable,
                ]}
                numberOfLines={1}
                accessibilityRole={Platform.OS === "web" ? "text" : "link"}
                accessibilityLabel={
                  Platform.OS === "web"
                    ? `Driver mobile ${phoneDisplay}`
                    : `Call ${displayPrimary} at ${phoneDisplay}`
                }
              >
                {phoneDisplay}
              </Text>
            ) : null}

            {isDriver ? (
              <RatingMetaRow
                ratingAvg={ratingAvg}
                loading={insightsLoading}
                desktop={desktop}
              />
            ) : (
              <VehicleTypeMetaRow
                vehicleType={displayVehicleType}
                loading={insightsLoading}
                desktop={desktop}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 8px rgba(15, 23, 42, 0.06)",
      } as ViewStyle,
      default: {
        shadowColor: Theme.textPrimaryDark,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 1,
      },
    }),
  },
  cardDesktop: {
    flex: undefined,
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderRadius: 22,
    gap: 10,
    backgroundColor: Theme.tripDetailAssetCardBackgroundColor,
    borderColor: Theme.surfaceBorder,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 10,
    justifyContent: "center",
  },
  cardBodyDesktop: {
    gap: 12,
  },
  cardFill: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    justifyContent: "center",
  },
  copySlot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    ...Platform.select({
      web: { cursor: "pointer" } as ViewStyle,
      default: {},
    }),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 28,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  roleLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 13,
  },
  roleLabelDesktop: {
    fontSize: 11,
    letterSpacing: 1,
    lineHeight: 14,
  },
  changeBtn: {
    flexShrink: 0,
    minHeight: 28,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  changeBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.pulseIndigo,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  changeBtnTextDesktop: {
    fontSize: 11,
    letterSpacing: 0.6,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  bodyCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  primaryText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
    lineHeight: 16,
  },
  primaryTextDesktop: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  phoneText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.driverEmerald,
    letterSpacing: 0.1,
  },
  phoneTextDesktop: {
    fontSize: 13,
    fontWeight: "700",
  },
  phoneTextSelectable: {
    ...Platform.select({
      web: {
        userSelect: "text",
        cursor: "text",
      } as TextStyle,
      default: {},
    }),
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 16,
    minWidth: 0,
  },
  ratingRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingValue: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 14,
    flexShrink: 0,
  },
  metaText: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  typeChip: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  typeChipDesktop: {
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  vehicleTypeText: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.1,
    lineHeight: 14,
  },
  ratingValueDesktop: {
    fontSize: 13,
    lineHeight: 17,
  },
  metaTextDesktop: {
    fontSize: 12,
    lineHeight: 16,
  },
  vehicleTypeTextDesktop: {
    fontSize: 12,
    lineHeight: 16,
  },
  vehicleTypeSpacer: {
    flex: 1,
    minHeight: 9,
  },
  avatarCol: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleIcon: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  vehicleIconDesktop: {
    width: VEHICLE_ICON_SIZE_DESKTOP,
    height: VEHICLE_ICON_SIZE_DESKTOP,
    borderRadius: VEHICLE_ICON_SIZE_DESKTOP / 2,
  },
});
