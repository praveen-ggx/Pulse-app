/**
 * Partner profile hero — Metronic hex layout with solid fills and icon wells.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { OrgVerificationBadges } from "@/features/network/components/OrgVerificationBadges";
import {
  METRONIC,
  networkDesktopHubStyles as hubStyles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { platformShadow } from "@/lib/platformShadow";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { NetworkProfileAvatarRating } from "@/features/network/components/desktop/NetworkDesktopSalesStars";
import type { LucideIcon } from "lucide-react-native";
import {
  BadgeCheck,
  Building2,
  Calendar,
  ClipboardList,
  MapPin,
  Package,
  Phone,
  Radio,
  Star,
  Truck,
  UserRound,
  Users,
  X,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  type OrgVerificationState,
} from "@/features/network/utils/orgVerification.util";

export type NetworkProfileHubHeroStat = {
  value: string;
  label: string;
};

type Props = {
  name: string;
  roleLabel: string;
  location?: string | null;
  phone?: string | null;
  entityType: PartyEntityType;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  showVerified?: boolean;
  /** Explicit KYC state; when set, overrides showVerified boolean. */
  verificationState?: OrgVerificationState;
  /** Partner is registered on Pulse (integrated connection). */
  isSignedIn?: boolean;
  memberSinceYear?: number | null;
  connectionStatus?: string;
  stats: NetworkProfileHubHeroStat[];
  /** Partner average rating — shown under the avatar, not in the stats tiles. */
  ratingValue?: number | null;
  onClose?: () => void;
  /** Profile modal on narrow viewports — stacked meta, stat grid, lighter type. */
  compact?: boolean;
  vehicleCount?: number;
  indentCount?: number;
  profileStatsLoading?: boolean;
};

type MetaTone = "role" | "location" | "phone" | "vehicles" | "indents";
type StatTone = "trips" | "rating" | "mutuals" | "default";

const META_TONE: Record<
  MetaTone,
  { bg: string; icon: string }
> = {
  role: { bg: Theme.surface, icon: Theme.textSecondary },
  location: { bg: Theme.surface, icon: Theme.textSecondary },
  phone: { bg: Theme.surface, icon: Theme.textSecondary },
  vehicles: { bg: Theme.surface, icon: Theme.textSecondary },
  indents: { bg: Theme.surface, icon: Theme.textSecondary },
};

const STAT_TONE: Record<
  StatTone,
  { bg: string; icon: string }
> = {
  trips: { bg: Theme.surface, icon: Theme.primary },
  rating: { bg: Theme.surface, icon: Theme.warning },
  mutuals: { bg: Theme.surface, icon: Theme.darkGreen },
  default: { bg: Theme.surface, icon: METRONIC.subtle },
};

function roleDisplayLabel(role: string): string {
  if (role === "CLIENT") return "Client";
  if (role === "SUPPLIER") return "Supplier";
  if (role === "DRIVER") return "Driver";
  return role;
}

function roleIcon(entityType: PartyEntityType): LucideIcon {
  if (entityType === "client") return Building2;
  if (entityType === "supplier") return Package;
  return UserRound;
}

function statTone(label: string): StatTone {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("trip")) return "trips";
  if (normalized.includes("rating")) return "rating";
  if (normalized.includes("mutual")) return "mutuals";
  return "default";
}

function statIcon(label: string): LucideIcon {
  const tone = statTone(label);
  if (tone === "trips") return Truck;
  if (tone === "rating") return Star;
  if (tone === "mutuals") return Users;
  return Star;
}

function IconWell({
  Icon,
  tone,
  size = 14,
}: {
  Icon: LucideIcon;
  tone: MetaTone | StatTone;
  size?: number;
}) {
  const palette =
    tone === "role" ||
    tone === "location" ||
    tone === "phone" ||
    tone === "vehicles" ||
    tone === "indents"
      ? META_TONE[tone]
      : STAT_TONE[tone];
  return (
    <View style={[styles.iconWell, { backgroundColor: palette.bg }]}>
      <Icon size={size} color={palette.icon} strokeWidth={2.2} />
    </View>
  );
}

function MetaRow({
  icon,
  text,
  tone,
}: {
  icon: LucideIcon;
  text: string;
  tone: MetaTone;
}) {
  return (
    <View style={styles.metaRow}>
      <IconWell Icon={icon} tone={tone} size={12} />
      <Text style={styles.metaRowText} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

function StatTile({
  value,
  label,
  compact,
}: {
  value: string;
  label: string;
  compact: boolean;
}) {
  const tone = statTone(label);
  const Icon = statIcon(label);
  return (
    <View style={[styles.statTile, compact && styles.statTileCompact]}>
      <IconWell Icon={Icon} tone={tone} size={12} />
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileLabel}>{label}</Text>
    </View>
  );
}

function StatusPill({
  label,
  variant,
  icon,
  compact,
}: {
  label: string;
  variant: "signedIn" | "verified" | "recommended" | "since" | "connection";
  icon?: ReactNode;
  compact?: boolean;
}) {
  const variantStyle =
    variant === "signedIn"
      ? styles.statusPillSignedIn
      : variant === "verified"
        ? styles.statusPillVerified
        : variant === "recommended"
          ? styles.statusPillRecommended
          : variant === "since"
            ? styles.statusPillSince
            : styles.statusPillConnection;
  const textStyle =
    variant === "signedIn" || variant === "verified"
      ? styles.statusPillTextOnDark
      : variant === "recommended"
        ? styles.statusPillTextRecommended
        : variant === "since"
          ? styles.statusPillTextSince
          : styles.statusPillTextConnection;

  return (
    <View style={[styles.statusPill, variantStyle, compact && styles.statusPillCompact]}>
      {icon}
      <Text style={[textStyle, compact && styles.statusPillTextCompact]}>{label}</Text>
    </View>
  );
}

export function NetworkProfileHubHero({
  name,
  roleLabel,
  location,
  phone,
  entityType,
  avatarUrl,
  avatarSeed,
  showVerified = false,
  verificationState: verificationStateProp,
  isSignedIn = false,
  memberSinceYear = null,
  connectionStatus,
  stats,
  ratingValue = null,
  onClose,
  compact = false,
  vehicleCount = 0,
  indentCount = 0,
  profileStatsLoading = false,
}: Props) {
  const verificationState: OrgVerificationState =
    verificationStateProp ??
    (showVerified ? "verified" : "not_verified");
  const isKycVerified = verificationState === "verified";
  const locationLabel =
    location?.trim() && location.trim() !== "Not available"
      ? location.trim()
      : "Location not set";
  const phoneLabel = phone?.trim() || "No phone on file";
  const roleText = roleDisplayLabel(roleLabel);
  const RoleIcon = roleIcon(entityType);
  const avatarSize = compact ? 72 : 88;
  const vehiclesLabel = profileStatsLoading
    ? "Assets · …"
    : `${vehicleCount} asset${vehicleCount === 1 ? "" : "s"}`;
  const indentsLabel = profileStatsLoading
    ? "Indents shared · …"
    : `${indentCount} indent${indentCount === 1 ? "" : "s"} shared to network`;
  const visibleStats = stats.filter(
    (stat) => !stat.label.trim().toLowerCase().includes("rating"),
  );
  const statusLabel = (connectionStatus ?? "").trim();
  const pendingConnection = /request\s*sent/i.test(statusLabel);
  const redundantLive =
    isSignedIn && /^(live|connected)$/i.test(statusLabel);
  const showConnectionPill =
    Boolean(statusLabel) && !pendingConnection && !redundantLive;
  const showStatusRow =
    isSignedIn || memberSinceYear != null || showConnectionPill;

  return (
    <View
      style={[
        hubStyles.hero,
        compact && styles.heroCompact,
        compact && styles.heroCompactNoPattern,
      ]}
    >
      {!compact ? (
        <View style={[hubStyles.heroHexOverlay, compact && styles.heroHexOverlayCompact]} pointerEvents="none" />
      ) : null}

      {onClose ? (
        <Pressable
          onPress={onClose}
          style={[styles.closeBtn, compact && styles.closeBtnCompact]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close profile"
        >
          <X size={15} color={METRONIC.text} strokeWidth={2.4} />
        </Pressable>
      ) : null}

      <View style={[hubStyles.heroInner, compact && styles.heroInnerCompact]}>
        <View style={styles.avatarStack}>
          <View
            style={[
              hubStyles.heroAvatarPressable,
              compact && styles.heroAvatarPressableCompact,
            ]}
          >
            <View
              style={[
                hubStyles.heroAvatarRing,
                compact && styles.heroAvatarRingCompact,
              ]}
            >
              <PartyAvatar
                name={name}
                entityType={entityType}
                organizationImageUrl={avatarUrl}
                avatarUrl={avatarUrl}
                avatarSeed={avatarSeed}
                size={avatarSize}
                shape="circle"
                style={{ borderWidth: 0 }}
              />
            </View>
          </View>
          <View style={styles.heroRatingRow}>
            <NetworkProfileAvatarRating
              rating={ratingValue}
              size={compact ? 20 : 24}
              compact={compact}
              variant="single"
            />
          </View>
          <View style={[hubStyles.heroNameRow, compact && styles.heroNameRowCompact]}>
            <Text
              style={[hubStyles.heroName, compact && styles.heroNameCompact]}
              numberOfLines={2}
            >
              {name}
            </Text>
            {isKycVerified ? (
              <BadgeCheck
                size={compact ? 14 : 18}
                color={Theme.darkGreen}
                strokeWidth={2.2}
              />
            ) : null}
          </View>
          <OrgVerificationBadges
            state={verificationState}
            compact={compact}
            style={styles.nameRowBadges}
          />
        </View>

        {compact ? (
          <View style={styles.metaCard}>
            <MetaRow icon={RoleIcon} text={roleText} tone="role" />
            <View style={styles.metaDivider} />
            <MetaRow icon={MapPin} text={locationLabel} tone="location" />
            <View style={styles.metaDivider} />
            <MetaRow icon={Phone} text={phoneLabel} tone="phone" />
            <View style={styles.metaDivider} />
            <MetaRow icon={Truck} text={vehiclesLabel} tone="vehicles" />
            <View style={styles.metaDivider} />
            <MetaRow icon={ClipboardList} text={indentsLabel} tone="indents" />
          </View>
        ) : (
          <View style={styles.metaCardInline}>
            <MetaRow icon={RoleIcon} text={roleText.toUpperCase()} tone="role" />
            <MetaRow icon={MapPin} text={locationLabel} tone="location" />
            <MetaRow icon={Phone} text={phoneLabel} tone="phone" />
            <MetaRow icon={Truck} text={vehiclesLabel} tone="vehicles" />
            <MetaRow icon={ClipboardList} text={indentsLabel} tone="indents" />
          </View>
        )}

        {compact ? (
          <View style={styles.statsRow}>
            {visibleStats.map((stat) => (
              <StatTile
                key={stat.label}
                value={stat.value}
                label={stat.label}
                compact
              />
            ))}
          </View>
        ) : (
          <View style={styles.statsRow}>
            {visibleStats.map((stat) => (
              <StatTile
                key={stat.label}
                value={stat.value}
                label={stat.label}
                compact={false}
              />
            ))}
          </View>
        )}

        {showStatusRow ? (
          <View style={[styles.statusRow, compact && styles.statusRowCompact]}>
            {isSignedIn ? (
              <StatusPill
                compact={compact}
                variant="signedIn"
                label="Signed in"
                icon={<View style={styles.liveDot} />}
              />
            ) : null}
            {memberSinceYear != null ? (
              <StatusPill
                compact={compact}
                variant="since"
                label={`Since ${memberSinceYear}`}
                icon={<Calendar size={11} color={METRONIC.subtle} strokeWidth={2.4} />}
              />
            ) : null}
            {showConnectionPill ? (
              <StatusPill
                compact={compact}
                variant="connection"
                label={statusLabel}
                icon={<Radio size={11} color={Theme.textOnPrimary} strokeWidth={2.4} />}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCompact: {
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 14,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  heroCompactNoPattern: Platform.select({
    web: { backgroundImage: "none" as const },
    default: {},
  }),
  heroHexOverlayCompact: {
    backgroundColor: "transparent",
    opacity: 0,
  },
  heroInnerCompact: {
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  heroAvatarPressableCompact: {
    alignSelf: "center",
  },
  avatarStack: {
    alignSelf: "stretch",
    width: "100%",
    alignItems: "center",
    gap: 6,
  },
  heroRatingRow: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
    marginTop: 2,
    marginBottom: 2,
  },
  avatarBadges: {
    maxWidth: "100%",
  },
  heroAvatarRingCompact: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 0,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...platformShadow("0 4px 12px rgba(77, 54, 54, 0.08)", {
      color: Theme.primary,
      opacity: 0.08,
      radius: 12,
      offsetY: 4,
      elevation: 3,
    }),
  },
  heroNameCompact: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
    flexShrink: 1,
    color: METRONIC.text,
  },
  heroNameRowCompact: {
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "100%",
    paddingHorizontal: 8,
    marginTop: 0,
    gap: 4,
  },
  nameRowBadges: {
    alignSelf: "center",
    justifyContent: "center",
    maxWidth: "100%",
  },
  closeBtnCompact: {
    top: 8,
    right: 8,
    width: 28,
    height: 28,
  },
  closeBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    ...platformShadow("0 2px 6px rgba(15, 23, 42, 0.06)", {
      color: Theme.primary,
      opacity: 0.06,
      radius: 6,
      offsetY: 2,
      elevation: 2,
    }),
  },
  iconWell: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  metaCard: {
    alignSelf: "stretch",
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  metaCardInline: {
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    paddingVertical: 6,
  },
  metaDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.separatorLight,
    alignSelf: "stretch",
    width: "100%",
  },
  metaRowText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "400",
    color: METRONIC.text,
    lineHeight: 15,
    includeFontPadding: false,
  },
  statsRow: {
    alignSelf: "stretch",
    width: "100%",
    flexDirection: "row",
    gap: 8,
    minWidth: 0,
  },
  statTile: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  statTileCompact: {
    paddingVertical: 8,
    minHeight: 64,
  },
  statTileValue: {
    fontSize: 16,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: -0.35,
    fontVariant: ["tabular-nums"],
  },
  statTileLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 0,
  },
  statusRowCompact: {
    alignSelf: "stretch",
    justifyContent: "center",
    marginTop: 0,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusPillCompact: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillSignedIn: {
    backgroundColor: Theme.darkGreen,
  },
  statusPillVerified: {
    backgroundColor: Theme.darkGreen,
  },
  statusPillRecommended: {
    backgroundColor: Theme.aggregatePillBg,
    borderWidth: 1,
    borderColor: Theme.aggregatePillBorder,
  },
  statusPillSince: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  statusPillConnection: {
    backgroundColor: Theme.primary,
  },
  statusPillTextOnDark: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },
  statusPillTextRecommended: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.aggregatePillText,
    letterSpacing: 0.15,
  },
  statusPillTextSince: {
    fontSize: 11,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: 0.15,
  },
  statusPillTextConnection: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
    textTransform: "capitalize",
  },
  statusPillTextCompact: {
    fontSize: 10,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.textOnPrimary,
  },
});
