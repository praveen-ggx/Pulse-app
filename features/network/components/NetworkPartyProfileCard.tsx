/**
 * Shared network profile card — reference grid + list layouts (connections & discover).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { NetworkHubGlassBadge } from "@/features/network/components/NetworkHubGlassBadge";
import { MutualConnectionsFacepile } from "@/features/network/components/MutualConnectionsFacepile";
import {
  networkPartyProfileCardStyles as s,
  NETWORK_PARTY_MUTUAL_FACE_GRID,
  NETWORK_PARTY_MUTUAL_FACE_LIST,
  NETWORK_PROFILE_CARD_LIST_HEIGHT,
} from "@/features/network/components/networkPartyProfileCard.styles";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Mail,
  MapPin,
  Phone,
  Send,
  Star,
  Truck,
  UserPlus,
  Users,
  Verified,
  X,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

/** Narrow phones: tighter list row, hide extras that break alignment. */
const LIST_MOBILE_BREAKPOINT = 600;
/** Hub split / grid cards: desktop party typography (matches network tab). */
const GRID_DESKTOP_BREAKPOINT = 820;


function ratingFilledCount(rating: number | null): number {
  if (rating == null || !Number.isFinite(rating)) return 0;
  return Math.max(0, Math.min(5, Math.round(rating)));
}

export type NetworkPartyRolePill = {
  label: string;
  backgroundColor: string;
  color: string;
  /** Lighter stop for top of glass gradient */
  gradientTop?: string;
  /** Glass rim — defaults to Theme.networkGlassBorder */
  borderColor?: string;
  /** Top specular line on the pill */
  highlightColor?: string;
};

export type NetworkPartyProfileCardProps = {
  partyId: string;
  name: string;
  layout: "grid" | "list";
  avatarSeed?: string | null;
  avatarUrl?: string | null;
  entityType?: PartyEntityType;
  primaryMeta?: string;
  primaryMetaUnset?: boolean;
  /** Icon beside primary meta in list layout (default building). */
  primaryMetaIcon?: "map-pin" | "building-2";
  secondaryMeta?: string | null;
  secondaryMetaKind?: "phone" | "email";
  /** List layout: party role label + contact phone on one row. */
  listPartnerMeta?: { partyType: string; phone: string };
  totalTrips?: number | null;
  ratingValue?: number | null;
  mutualCount?: number;
  showVerified?: boolean;
  showOnline?: boolean;
  rolePills?: NetworkPartyRolePill[];
  recommendedHighlight?: boolean;
  showTopMetrics?: boolean;
  showStatsRow?: boolean;
  showFullProfileLink?: boolean;
  onPressCard?: () => void;
  onOpenProfile?: () => void;
  connectionStatus?: "none" | "pending" | "approved" | string;
  loading?: boolean;
  onConnect?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
  /** Viewer org — used to resolve mutual connection avatars. */
  viewerOrgId?: string | null;
  /** List layout: open mutual connections list for this party. */
  onPressMutuals?: () => void;
  /** Tap a mutual avatar — open that org's profile. */
  onPressMutual?: (org: MutualConnectionRow) => void;
  onConnectionAction?: () => void;
  connectionActionLabel?: string;
  connectionActionDisabled?: boolean;
  connectionIntegrated?: boolean;
  /** Desktop grid: larger party block (connections hub). Discover cards omit this. */
  enlargeGridPartyOnDesktop?: boolean;
  /** Desktop list: larger avatar + left padding. Discover cards omit this. */
  enlargeListPartyOnDesktop?: boolean;
};

function StatStars({ filledStars, size }: { filledStars: number; size: number }) {
  return (
    <View style={s.metricStarsRow}>
      {Array.from({ length: 5 }).map((_, idx) => (
        <Star
          key={`metric-star-${idx}`}
          size={size}
          color={idx < filledStars ? Theme.driverGold : Theme.borderMedium}
          fill={idx < filledStars ? Theme.driverGold : "transparent"}
          strokeWidth={1.8}
        />
      ))}
    </View>
  );
}

function StatColumn({
  value,
  label,
  icon: Icon,
  variant = "default",
  filledStars = 0,
  showDivider,
  onPress,
}: {
  value: string;
  label: string;
  icon: LucideIcon;
  variant?: "default" | "trips" | "rating";
  filledStars?: number;
  showDivider?: boolean;
  onPress?: () => void;
}) {
  const body =
    variant === "trips" ? (
      <>
        <View style={[s.metricIconRing, s.metricIconRingTrips]}>
          <Truck size={14} color={Theme.primary} strokeWidth={2.3} />
        </View>
        <View style={s.metricValuePill}>
          <Text style={s.metricValuePillText} numberOfLines={1}>
            {value}
          </Text>
        </View>
      </>
    ) : variant === "rating" ? (
      <>
        <View style={[s.metricIconRing, s.metricIconRingRating]}>
          <Star size={13} color={Theme.driverGold} fill={Theme.driverGold} strokeWidth={0} />
        </View>
        <StatStars filledStars={filledStars} size={7} />
      </>
    ) : (
      <>
        <Icon size={11} color={Theme.textMuted} strokeWidth={2.2} />
        <Text style={s.statValue} numberOfLines={1}>
          {value}
        </Text>
        <Text style={s.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </>
    );

  const a11yLabel =
    variant === "trips"
      ? `${value} trips`
      : variant === "rating"
        ? filledStars > 0
          ? `${filledStars} star rating`
          : "No rating"
        : label;

  const col = (
    <View
      style={[s.statCol, variant !== "default" && s.statColMetric]}
      accessibilityLabel={a11yLabel}
    >
      {body}
    </View>
  );

  return (
    <>
      {showDivider ? <View style={s.statDivider} /> : null}
      {onPress ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [s.statColPressable, pressed && { opacity: 0.88 }]}
          accessibilityRole="button"
        >
          {col}
        </Pressable>
      ) : (
        col
      )}
    </>
  );
}

function ListTripsMetric({ value, compact }: { value: string; compact?: boolean }) {
  return (
    <View
      style={[s.listMetricCard, compact && s.listMetricCardMobile]}
      accessibilityLabel={`${value} trips`}
    >
      <View style={[s.metricIconRing, s.metricIconRingTrips, compact && s.metricIconRingMobile]}>
        <Truck size={compact ? 14 : 16} color={Theme.primary} strokeWidth={2.3} />
      </View>
      <View style={[s.metricValuePill, compact && s.metricValuePillMobile]}>
        <Text style={[s.metricValuePillText, compact && s.metricValuePillTextMobile]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function ListRatingMetric({ filledStars, compact }: { filledStars: number; compact?: boolean }) {
  return (
    <View
      style={[s.listMetricCard, s.listMetricCardRating, compact && s.listMetricCardMobile]}
      accessibilityLabel={filledStars > 0 ? `${filledStars} star rating` : "No rating"}
    >
      <View style={[s.metricIconRing, s.metricIconRingRating, compact && s.metricIconRingMobile]}>
        <Star
          size={compact ? 13 : 14}
          color={Theme.driverGold}
          fill={Theme.driverGold}
          strokeWidth={0}
        />
      </View>
      <StatStars filledStars={filledStars} size={compact ? 8 : 9} />
    </View>
  );
}

export function NetworkPartyProfileCard({
  partyId,
  name,
  layout,
  avatarSeed,
  avatarUrl,
  entityType = "client",
  primaryMeta = "",
  primaryMetaUnset = false,
  primaryMetaIcon = "building-2",
  secondaryMeta,
  secondaryMetaKind = "email",
  listPartnerMeta,
  totalTrips,
  ratingValue,
  mutualCount = 0,
  showVerified = false,
  showOnline = false,
  rolePills,
  recommendedHighlight = false,
  showTopMetrics = false,
  showStatsRow = false,
  showFullProfileLink = false,
  onPressCard,
  onOpenProfile,
  connectionStatus = "none",
  loading = false,
  onConnect,
  onCancel,
  onDismiss,
  viewerOrgId,
  onPressMutuals,
  onPressMutual,
  onConnectionAction,
  connectionActionLabel,
  connectionActionDisabled = false,
  connectionIntegrated = false,
  enlargeGridPartyOnDesktop = true,
  enlargeListPartyOnDesktop = true,
}: NetworkPartyProfileCardProps) {
  const { t } = useLanguage();
  const { width: windowWidth } = useWindowDimensions();
  const listMobile = layout === "list" && windowWidth < LIST_MOBILE_BREAKPOINT;
  const gridDesktop =
    enlargeGridPartyOnDesktop &&
    layout === "grid" &&
    windowWidth >= GRID_DESKTOP_BREAKPOINT;
  const listDesktop =
    enlargeListPartyOnDesktop && layout === "list" && !listMobile;
  const scale = useRef(new Animated.Value(1)).current;
  const isConnected = connectionStatus === "approved";
  const isPending = connectionStatus === "pending";
  const isDiscoverFooter = Boolean(onConnect || onCancel || isConnected || isPending);
  const hasMutuals = mutualCount > 0;

  const tripsDisplay =
    typeof totalTrips === "number" && totalTrips >= 0 ? String(totalTrips) : "—";
  const rating =
    typeof ratingValue === "number" && Number.isFinite(ratingValue)
      ? ratingValue.toFixed(1)
      : null;
  const filledStars = ratingFilledCount(ratingValue ?? null);
  const displayName = name.trim() || "—";
  const openProfile = onOpenProfile ?? onPressCard;

  const onIn = () =>
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  const renderTopMetrics = () =>
    showTopMetrics && showFullProfileLink && openProfile ? (
      <View style={s.cardTopRow}>
        <View style={s.metricsLeft} />
        <Pressable
          onPress={openProfile}
          style={({ pressed }) => [s.fullProfileBtn, pressed && { opacity: 0.82 }]}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${t("networkDiscoverFullProfile")} — ${displayName}`}
        >
          <Text style={s.fullProfileText} numberOfLines={1} ellipsizeMode="tail">
            {t("networkDiscoverFullProfile")}
          </Text>
          <ChevronRight size={10} color={Theme.textMuted} strokeWidth={2.4} />
        </Pressable>
      </View>
    ) : null;

  const showGridStats =
    showStatsRow ||
    showTopMetrics ||
    totalTrips != null ||
    ratingValue != null ||
    hasMutuals;

  const renderGridMutualColumn = () => (
    <>
      <View style={s.statDivider} />
      <View style={s.statColMutualFacepile}>
        {hasMutuals ? (
          <MutualConnectionsFacepile
            viewerOrgId={viewerOrgId}
            targetOrgId={partyId}
            mutualCount={mutualCount}
            faceSize={NETWORK_PARTY_MUTUAL_FACE_GRID}
            showSectionLabel
            sectionLabel={t("networkDiscoverMutuals")}
            compact
            onPressMutual={onPressMutual}
            onPressViewAll={onPressMutuals}
          />
        ) : (
          <>
            <Users size={11} color={Theme.textMuted} strokeWidth={2.2} />
            <Text style={s.statValue} numberOfLines={1}>
              —
            </Text>
            <Text style={s.statLabel} numberOfLines={1}>
              {t("networkDiscoverMutuals")}
            </Text>
          </>
        )}
      </View>
    </>
  );

  const renderGridStatsRow = () =>
    showGridStats ? (
      <View style={s.statsRow}>
        <StatColumn variant="trips" icon={Truck} value={tripsDisplay} label={t("trips")} />
        <StatColumn
          variant="rating"
          icon={Star}
          value={rating ?? "—"}
          label={t("networkDiscoverRating")}
          filledStars={filledStars}
          showDivider
        />
        {renderGridMutualColumn()}
      </View>
    ) : null;

  const showListMetrics =
    showStatsRow || showTopMetrics || totalTrips != null || ratingValue != null;

  const renderListMutualCell = () => {
    if (!hasMutuals) return null;

    return (
      <View style={[s.listMutualsWrap, listMobile && s.listMutualsWrapMobile]}>
        <MutualConnectionsFacepile
          viewerOrgId={viewerOrgId}
          targetOrgId={partyId}
          mutualCount={mutualCount}
          faceSize={listMobile ? 30 : NETWORK_PARTY_MUTUAL_FACE_LIST}
          showSectionLabel
          sectionLabel={t("networkDiscoverMutuals")}
          compact={listMobile}
          onPressMutual={onPressMutual}
          onPressViewAll={onPressMutuals}
        />
      </View>
    );
  };

  const renderListStatBoxes = () => (
    <View style={s.listStatBoxes}>
      {renderListMutualCell()}
      <ListTripsMetric value={tripsDisplay} compact={listMobile} />
      <ListRatingMetric filledStars={filledStars} compact={listMobile} />
    </View>
  );

  const PrimaryMetaIcon = primaryMetaIcon === "map-pin" ? MapPin : Building2;
  const SecondaryMetaIcon = secondaryMetaKind === "phone" ? Phone : Mail;

  const renderListAction = () => {
    if (isDiscoverFooter) {
      if (isConnected) {
        return (
          <View style={s.listActionBtn}>
            <CheckCircle2 size={14} color={Theme.textSecondary} strokeWidth={2.2} />
            <Text style={s.actionTextMuted} numberOfLines={1}>
              {t("networkDiscoverConnected")}
            </Text>
          </View>
        );
      }
      if (isPending) {
        return (
          <View style={s.listConnectRow}>
            <View style={[s.listActionBtn, s.listActionBtnFlex]}>
              <Text style={s.actionTextMuted} numberOfLines={1}>
                {t("networkDiscoverRequestSent")}
              </Text>
            </View>
            <Pressable
              onPress={onCancel}
              disabled={loading}
              style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.75 }]}
              hitSlop={6}
            >
              {loading ? (
                <LoadingIndicator size={12} color={Theme.textSecondary} />
              ) : (
                <X size={14} color={Theme.textSecondary} strokeWidth={2.5} />
              )}
            </Pressable>
          </View>
        );
      }
      return (
        <View style={s.listConnectRow}>
          <Pressable
            style={({ pressed }) => [
              s.listActionBtn,
              s.listActionBtnFlex,
              (pressed || loading) && { opacity: 0.88 },
            ]}
            onPress={onConnect}
            onPressIn={onIn}
            onPressOut={onOut}
            disabled={loading}
          >
            {loading ? (
              <LoadingIndicator size={14} color={Theme.primary} />
            ) : (
              <>
                <UserPlus size={14} color={Theme.primary} strokeWidth={2.4} />
                <Text style={s.actionTextPrimary} numberOfLines={1}>
                  {t("networkDiscoverConnect")}
                </Text>
              </>
            )}
          </Pressable>
          {onDismiss ? (
            <Pressable
              onPress={onDismiss}
              disabled={loading}
              style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.75 }]}
              hitSlop={6}
            >
              <X size={14} color={Theme.textSecondary} strokeWidth={2.5} />
            </Pressable>
          ) : null}
        </View>
      );
    }

    const label =
      connectionActionLabel ??
      (connectionIntegrated ? t("networkDiscoverConnected") : t("networkConnectionInvite"));
    return (
      <Pressable
        style={({ pressed }) => [
          s.listActionBtn,
          s.listActionBtnFullWidth,
          (pressed || loading) && { opacity: 0.88 },
          connectionActionDisabled && { opacity: 0.5 },
        ]}
        onPress={onConnectionAction}
        disabled={connectionActionDisabled || loading || connectionIntegrated}
      >
        {loading ? (
          <LoadingIndicator size={14} color={Theme.textSecondary} />
        ) : connectionIntegrated ? (
          <>
            <CheckCircle2 size={14} color={Theme.textSecondary} strokeWidth={2.2} />
            <Text style={s.actionTextMuted} numberOfLines={1}>
              {label}
            </Text>
          </>
        ) : (
          <>
            <Send size={14} color={Theme.primary} strokeWidth={2.4} />
            <Text style={s.actionTextPrimary} numberOfLines={1}>
              {label}
            </Text>
          </>
        )}
      </Pressable>
    );
  };

  const renderFooter = () => {
    if (isDiscoverFooter) {
      if (isConnected) {
        return (
          <View style={s.footer}>
            <View style={s.footerDivider} />
            <View style={[s.actionBtn, s.actionBtnOutline]}>
              <CheckCircle2 size={13} color={Theme.textSecondary} strokeWidth={2.2} />
              <Text style={s.actionTextMuted} numberOfLines={1}>
                {t("networkDiscoverConnected")}
              </Text>
            </View>
          </View>
        );
      }
      if (isPending) {
        return (
          <View style={s.footer}>
            <View style={s.footerDivider} />
            <View style={s.connectFooter}>
              <View style={[s.actionBtn, s.actionBtnOutline, s.actionBtnFlex]}>
                <Text style={s.actionTextMuted} numberOfLines={1}>
                  {t("networkDiscoverRequestSent")}
                </Text>
              </View>
              <Pressable
                onPress={onCancel}
                disabled={loading}
                style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.75 }]}
                hitSlop={6}
              >
                {loading ? (
                  <LoadingIndicator size={12} color={Theme.textSecondary} />
                ) : (
                  <X size={13} color={Theme.textSecondary} strokeWidth={2.5} />
                )}
              </Pressable>
            </View>
          </View>
        );
      }
      return (
        <View style={s.footer}>
          <View style={s.footerDivider} />
          <View style={s.connectFooter}>
            <Pressable
              style={({ pressed }) => [
                s.actionBtn,
                s.actionBtnOutline,
                s.actionBtnFlex,
                (pressed || loading) && { opacity: 0.88 },
              ]}
              onPress={onConnect}
              onPressIn={onIn}
              onPressOut={onOut}
              disabled={loading}
            >
              {loading ? (
                <LoadingIndicator size={13} color={Theme.primary} />
              ) : (
                <>
                  <UserPlus size={13} color={Theme.primary} strokeWidth={2.4} />
                  <Text style={s.actionTextPrimary} numberOfLines={1}>
                    {t("networkDiscoverConnect")}
                  </Text>
                </>
              )}
            </Pressable>
            {onDismiss ? (
              <Pressable
                onPress={onDismiss}
                disabled={loading}
                style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.75 }]}
                hitSlop={6}
              >
                <X size={13} color={Theme.textSecondary} strokeWidth={2.5} />
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    }

    const label =
      connectionActionLabel ??
      (connectionIntegrated ? t("networkDiscoverConnected") : t("networkConnectionInvite"));
    return (
      <View style={s.footer}>
        <View style={s.footerDivider} />
        <Pressable
          style={({ pressed }) => [
            s.actionBtn,
            s.actionBtnOutline,
            (pressed || loading) && { opacity: 0.88 },
            connectionActionDisabled && { opacity: 0.5 },
          ]}
          onPress={onConnectionAction}
          disabled={connectionActionDisabled || loading || connectionIntegrated}
        >
          {loading ? (
            <LoadingIndicator size={13} color={Theme.textSecondary} />
          ) : connectionIntegrated ? (
            <>
              <CheckCircle2 size={13} color={Theme.textSecondary} strokeWidth={2.2} />
              <Text style={s.actionTextMuted} numberOfLines={1}>
                {label}
              </Text>
            </>
          ) : (
            <>
              <Send size={13} color={Theme.primary} strokeWidth={2.4} />
              <Text style={s.actionTextPrimary} numberOfLines={1}>
                {label}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    );
  };

  if (layout === "list") {
    const showSecondary = Boolean(secondaryMeta) && !listMobile && !listPartnerMeta;
    const showListPartnerMeta = Boolean(listPartnerMeta);
    const showRolePills = Boolean(rolePills?.length) && !listMobile;

    return (
      <Animated.View
        style={[
          s.cardList,
          listMobile && s.cardListMobile,
          listDesktop && s.cardListDesktop,
          { transform: [{ scale }] },
        ]}
      >
          <View
            style={[
              s.listSingleRow,
              listMobile ? s.listSingleRowMobile : null,
              listDesktop ? s.listSingleRowDesktop : null,
            ]}
          >
            <Pressable
              onPress={onPressCard}
              onPressIn={onIn}
              onPressOut={onOut}
              disabled={!onPressCard}
              style={[
                s.listAvatarCol,
                listMobile && s.listAvatarColMobile,
                listDesktop && s.listAvatarColDesktop,
              ]}
              accessibilityRole={onPressCard ? "button" : undefined}
              accessibilityLabel={displayName}
            >
              <View
                style={[
                  s.listAvatarWrap,
                  listMobile && s.listAvatarWrapMobile,
                  listDesktop && s.listAvatarWrapDesktop,
                ]}
              >
                <PartyAvatar
                  name={displayName}
                  initialsColorSeed={partyId}
                  avatarSeed={avatarSeed}
                  avatarUrl={avatarUrl}
                  entityType={entityType}
                  size={listMobile ? 36 : listDesktop ? 48 : 40}
                  borderStyle={styles.avatarBorder}
                />
                {showOnline ? <View style={s.onlineDot} /> : null}
              </View>
            </Pressable>

            <Pressable
              onPress={onPressCard}
              onPressIn={onIn}
              onPressOut={onOut}
              disabled={!onPressCard}
              style={s.listInfo}
              accessibilityRole={onPressCard ? "button" : undefined}
              accessibilityLabel={displayName}
            >
              <View style={s.listHeaderRow}>
                <Text
                  style={[s.listName, listMobile && s.listNameMobile]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {displayName}
                </Text>
              </View>
              {primaryMeta ? (
                <View style={s.listMetaRow}>
                  <PrimaryMetaIcon size={9} color={Theme.textMuted} strokeWidth={2.2} />
                  <Text
                    style={[s.listMetaText, listMobile && s.listMetaTextMobile, primaryMetaUnset && s.metaTextMuted]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {primaryMeta}
                  </Text>
                </View>
              ) : null}
              {showListPartnerMeta && listPartnerMeta ? (
                <View
                  style={[
                    s.listPartnerMetaRow,
                    listMobile && s.listPartnerMetaRowMobile,
                  ]}
                >
                  <View style={s.listPartnerMetaSegment}>
                    <Building2 size={9} color={Theme.textMuted} strokeWidth={2.2} />
                    <Text
                      style={[
                        s.listPartnerMetaText,
                        listMobile && s.listPartnerMetaTextMobile,
                      ]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {listPartnerMeta.partyType}
                    </Text>
                  </View>
                  {listPartnerMeta.phone &&
                  listPartnerMeta.phone.trim().length > 0 &&
                  listPartnerMeta.phone !== "NA" ? (
                    <>
                      <View style={s.listPartnerMetaDivider} />
                      <View
                        style={[
                          s.listPartnerMetaSegment,
                          s.listPartnerMetaSegmentPhone,
                        ]}
                      >
                        <Phone size={9} color={Theme.textMuted} strokeWidth={2.2} />
                        <Text
                          style={[
                            s.listPartnerMetaText,
                            listMobile && s.listPartnerMetaTextMobile,
                          ]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {listPartnerMeta.phone}
                        </Text>
                      </View>
                    </>
                  ) : null}
                </View>
              ) : null}
              {showSecondary ? (
                <View style={s.listMetaRow}>
                  <SecondaryMetaIcon size={9} color={Theme.textMuted} strokeWidth={2.2} />
                  <Text
                    style={[s.listMetaText, listMobile && s.listMetaTextMobile]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {secondaryMeta}
                  </Text>
                </View>
              ) : null}
              {showRolePills ? (
                <View style={s.listRolePillsRow}>
                  {rolePills!.map((pill) => (
                    <NetworkHubGlassBadge key={pill.label} pill={pill} />
                  ))}
                </View>
              ) : null}
            </Pressable>

            {showListMetrics ? (
              <View style={[s.listMidGroup, listMobile && s.listMidGroupMobile]}>
                {renderListStatBoxes()}
              </View>
            ) : null}

            <View style={[s.listActionSlot, listMobile && s.listActionSlotMobile]}>
              {showVerified && !showListPartnerMeta ? (
                <View style={s.listActionMetaRow}>
                  <Verified size={listMobile ? 15 : 17} color={Theme.primary} strokeWidth={2.4} />
                </View>
              ) : null}
              {renderListAction()}
            </View>
          </View>
        </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        s.cardGrid,
        gridDesktop && s.cardGridPartyDesktop,
        recommendedHighlight && s.cardGridRecommended,
        { transform: [{ scale }] },
      ]}
      collapsable={false}
    >
      {renderTopMetrics()}

      <View style={s.gridBody}>
        <Pressable
          onPress={openProfile}
          disabled={!openProfile}
          style={({ pressed }) => [
            s.gridIdentityRow,
            gridDesktop && s.gridIdentityRowDesktop,
            pressed && openProfile && { opacity: 0.94 },
          ]}
        >
          <View style={[s.gridAvatarCol, gridDesktop && s.gridAvatarColDesktop]}>
            <View style={[s.gridAvatarWrap, gridDesktop && s.gridAvatarWrapDesktop]}>
              <PartyAvatar
                name={displayName}
                initialsColorSeed={partyId}
                avatarSeed={avatarSeed}
                avatarUrl={avatarUrl}
                entityType={entityType}
                size={gridDesktop ? 52 : 40}
                borderStyle={styles.avatarBorder}
              />
              {showOnline ? <View style={s.onlineDot} /> : null}
            </View>
          </View>

          <View style={[s.gridInfo, gridDesktop && s.gridInfoDesktop]}>
            <View style={s.gridNameRow}>
              <Text
                style={[s.gridName, gridDesktop && s.gridNameDesktop]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {displayName}
              </Text>
              {listPartnerMeta || showVerified ? (
                <View style={s.gridHeaderTrailing}>
                  {listPartnerMeta ? (
                    <View style={s.gridPartyTypeTrailing}>
                      <Building2
                        size={gridDesktop ? 10 : 9}
                        color={Theme.textMuted}
                        strokeWidth={2.2}
                      />
                      <Text
                        style={[s.gridMetaText, gridDesktop && s.gridMetaTextDesktop]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {listPartnerMeta.partyType}
                      </Text>
                    </View>
                  ) : null}
                  {showVerified ? (
                    <Verified
                      size={gridDesktop ? 14 : 13}
                      color={Theme.primary}
                      strokeWidth={2.4}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>

            {primaryMeta ? (
              <View style={s.gridMetaRow}>
                <PrimaryMetaIcon
                  size={gridDesktop ? 12 : 10}
                  color={Theme.textMuted}
                  strokeWidth={2.2}
                />
                <Text
                  style={[
                    s.gridMetaText,
                    gridDesktop && s.gridMetaTextDesktop,
                    primaryMetaUnset && s.metaTextMuted,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {primaryMeta}
                </Text>
              </View>
            ) : null}

            {listPartnerMeta ? (
              <View
                style={[s.gridPartnerMetaPhoneRow, gridDesktop && s.gridPartnerMetaRowDesktop]}
              >
                <Phone
                  size={gridDesktop ? 12 : 10}
                  color={Theme.textMuted}
                  strokeWidth={2.2}
                />
                <Text
                  style={[s.gridMetaText, gridDesktop && s.gridMetaTextDesktop]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {listPartnerMeta.phone}
                </Text>
              </View>
            ) : secondaryMeta ? (
              <View style={s.gridMetaRow}>
                <SecondaryMetaIcon
                  size={gridDesktop ? 12 : 10}
                  color={Theme.textMuted}
                  strokeWidth={2.2}
                />
                <Text
                  style={[s.gridMetaText, gridDesktop && s.gridMetaTextDesktop]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {secondaryMeta}
                </Text>
              </View>
            ) : !primaryMeta ? (
              <View style={s.gridMetaRow}>
                <MapPin
                  size={gridDesktop ? 12 : 10}
                  color={Theme.textMuted}
                  strokeWidth={2.2}
                />
                <Text
                  style={[
                    s.gridMetaText,
                    gridDesktop && s.gridMetaTextDesktop,
                    s.metaTextMuted,
                  ]}
                  numberOfLines={1}
                >
                  {t("networkDiscoverLocationNotSet")}
                </Text>
              </View>
            ) : null}

            {rolePills && rolePills.length > 0 ? (
              <View style={[s.gridRolePillsRow, gridDesktop && s.gridRolePillsRowDesktop]}>
                {rolePills.map((pill) => (
                  <NetworkHubGlassBadge
                    key={pill.label}
                    pill={pill}
                    size={gridDesktop ? "default" : "compact"}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </Pressable>

        {renderGridStatsRow()}
      </View>

      {renderFooter()}
    </Animated.View>
  );
}

export { NETWORK_PROFILE_CARD_LIST_HEIGHT };

const styles = StyleSheet.create({
  avatarBorder: { borderWidth: 0 },
});
