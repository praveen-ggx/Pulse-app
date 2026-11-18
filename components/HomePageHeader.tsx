/**
 * Home / Network / Trips top bar — profile, invitations, notifications (compact).
 * Icons match the desktop top nav. Invites and notifications follow RBAC.
 */
import { NotificationBellIcon } from "@/components/NotificationBellIcon";
import { WEB_TOP_NAV_ICON } from "@/components/demo/webTopNavIcon.tokens";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoTabBarVisibilityProgressOptional } from "@/contexts/DemoTabBarScrollContext";
import {
  useAccessibleNotificationCount,
  useRegistryNotificationAccess,
} from "@/lib/alertRegistry/useRegistryNotificationAccess";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { ROUTES } from "@/lib/routes";
import { ChevronLeft, Inbox } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HEADER_AVATAR_SIZE = 44;
const HEADER_ACTION_ICON_SIZE = WEB_TOP_NAV_ICON.size + 2;

export interface HomePageHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  onProfilePress?: () => void;
  onInvitationsPress?: () => void;
  onNotificationsPress?: () => void;
  invitationBadgeCount?: number;
  skipSafeAreaTop?: boolean;
  /** Hide while the page scrolls; return once scrolling is idle. */
  autoHide?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Count pill with a soft, slow pulse ring while there is something new. */
function Badge({ count }: { count: number }) {
  const pulse = useSharedValue(0);
  const active = count > 0;
  useEffect(() => {
    if (!active) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }),
        withDelay(1800, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [active, pulse]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.45, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.9], Extrapolation.CLAMP) }],
  }));
  if (!active) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <View style={styles.badgeAnchor} pointerEvents="none">
      <Animated.View style={[styles.badgeRing, ringStyle]} />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{label}</Text>
      </View>
    </View>
  );
}

/** Profile avatar from the top nav. Opens the workspace profile. */
export function TopNavProfileButton({
  onPress,
  size = HEADER_AVATAR_SIZE,
}: {
  onPress?: () => void;
  /** Circle diameter. Hub titles use a smaller size than the main header. */
  size?: number;
}) {
  const router = useRouter();
  const { profile, user } = useAuth();
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const resolveAvatar = async () => {
      if (!profile) {
        if (mounted) setProfileAvatarUri(null);
        return;
      }
      if (profile.avatar_url?.startsWith("http")) {
        if (mounted) setProfileAvatarUri(profile.avatar_url);
        return;
      }
      if (profile.avatar_url?.trim()) {
        const signed = await getSignedAvatarUrl(profile.avatar_url.trim());
        if (mounted) setProfileAvatarUri(signed);
        return;
      }
      if (profile.avatar_seed?.trim()) {
        if (mounted)
          setProfileAvatarUri(getUser2DAvatarUriForSeed(profile.avatar_seed.trim()));
        return;
      }
      if (mounted)
        setProfileAvatarUri(getUser2DAvatarUriForSeed(DEFAULT_USER_2D_AVATAR_SEED));
    };
    void resolveAvatar();
    return () => {
      mounted = false;
    };
  }, [profile]);

  const profileDisplayName = (
    profile?.full_name ??
    profile?.displayName ??
    user?.email?.split("@")[0] ??
    "User"
  ).trim();

  const initials = useMemo(
    () =>
      profileDisplayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "US",
    [profileDisplayName],
  );

  const handleProfile = () => {
    if (onPress) {
      onPress();
      return;
    }
    router.push(ROUTES.WORKSPACE as Parameters<typeof router.push>[0]);
  };

  return (
    <Pressable
      onPress={handleProfile}
      style={({ pressed }) => [
        styles.avatarBtn,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      hitSlop={6}
    >
      {profileAvatarUri ? (
        <Image source={{ uri: profileAvatarUri }} style={styles.avatarImage} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={[styles.avatarInitials, { fontSize: Math.round(size * 0.32) }]}>{initials}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Notification bell from the top nav, including the unread count. */
export function TopNavNotificationButton({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const { canSeeNotifications } = useRegistryNotificationAccess();
  const notificationUnread = useAccessibleNotificationCount(currentOrganization?.id ?? null);
  if (!canSeeNotifications) return null;
  const notifBadge = notificationUnread;
  const handleNotifications = () => {
    if (onPress) {
      onPress();
      return;
    }
    router.push("/notifications");
  };
  return (
    <Pressable
      onPress={handleNotifications}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={
        notifBadge > 0 ? `Notifications, ${notifBadge} new` : "Notifications"
      }
      hitSlop={6}
    >
      <NotificationBellIcon
        size={HEADER_ACTION_ICON_SIZE}
        color={notifBadge > 0 ? WEB_TOP_NAV_ICON.active : WEB_TOP_NAV_ICON.muted}
        strokeWidth={WEB_TOP_NAV_ICON.stroke}
      />
      <Badge count={notifBadge} />
    </Pressable>
  );
}

export function HomePageHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  onProfilePress,
  onInvitationsPress,
  onNotificationsPress,
  invitationBadgeCount = 0,
  skipSafeAreaTop = false,
  autoHide = false,
  style,
}: HomePageHeaderProps) {
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { canSeeInvites } = useRegistryNotificationAccess();
  const scrollProgress = useDemoTabBarVisibilityProgressOptional();
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const hideStyle = useAnimatedStyle(() => {
    if (!autoHide || !scrollProgress || measuredHeight <= 0) return {};
    const p = scrollProgress.value;
    return {
      height: interpolate(p, [0, 1], [0, measuredHeight], Extrapolation.CLAMP),
      opacity: interpolate(p, [0, 0.6, 1], [0, 0.85, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(p, [0, 1], [-10, 0], Extrapolation.CLAMP) },
      ],
    };
  });
  const onMeasure = (event: LayoutChangeEvent) => {
    const h = Math.round(event.nativeEvent.layout.height);
    if (h > 0 && h !== measuredHeight) setMeasuredHeight(h);
  };

  const profileDisplayName = (
    profile?.full_name ??
    profile?.displayName ??
    user?.email?.split("@")[0] ??
    "User"
  ).trim();

  const welcomeName = useMemo(() => {
    const first = profileDisplayName.split(/\s+/).filter(Boolean)[0];
    const raw = first || profileDisplayName;
    if (!raw) return "there";
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }, [profileDisplayName]);

  const headerTitle = (
    title?.trim() ||
    currentOrganization?.name?.trim() ||
    profile?.company_name?.trim() ||
    "Network"
  ).toUpperCase();

  const headerSubtitle =
    subtitle !== undefined ? subtitle.trim() : `Welcome ${welcomeName}`;
  const topPad = skipSafeAreaTop ? 4 : insets.top + 4;
  const inviteBadge = canSeeInvites ? invitationBadgeCount : 0;

  const handleInvitations = () => {
    if (onInvitationsPress) onInvitationsPress();
  };

  return (
    <Animated.View style={[styles.hideClip, hideStyle]}>
    <View style={[styles.wrap, { paddingTop: topPad }, style]} onLayout={onMeasure}>
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <ChevronLeft size={20} color={Theme.textPrimaryDark} strokeWidth={2.4} />
          </Pressable>
        ) : (
          <TopNavProfileButton onPress={onProfilePress} />
        )}

        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {headerTitle}
          </Text>
          {headerSubtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          {canSeeInvites && onInvitationsPress ? (
            <Pressable
              onPress={handleInvitations}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={
                inviteBadge > 0 ? `Manage invitations, ${inviteBadge} pending` : "Manage invitations"
              }
              hitSlop={6}
            >
              <Inbox
                size={HEADER_ACTION_ICON_SIZE}
                color={inviteBadge > 0 ? WEB_TOP_NAV_ICON.active : WEB_TOP_NAV_ICON.muted}
                strokeWidth={WEB_TOP_NAV_ICON.stroke}
              />
              <Badge count={inviteBadge} />
            </Pressable>
          ) : null}
          <TopNavNotificationButton onPress={onNotificationsPress} />
        </View>
      </View>
    </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hideClip: { overflow: "hidden" },
  wrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 6,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: HEADER_AVATAR_SIZE,
  },
  avatarBtn: {
    width: HEADER_AVATAR_SIZE,
    height: HEADER_AVATAR_SIZE,
    borderRadius: HEADER_AVATAR_SIZE / 2,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "hidden",
    backgroundColor: Theme.surfaceGray,
    flexShrink: 0,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  title: {
    ...Typography.headerTitle,
    fontSize: 13,
    color: Theme.textPrimaryDark,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 2,
    lineHeight: 14,
    letterSpacing: 0.1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  iconBtn: {
    width: HEADER_AVATAR_SIZE,
    height: HEADER_AVATAR_SIZE,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.94 }],
  },
  badgeAnchor: {
    position: "absolute",
    top: 4,
    right: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeRing: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.teslaRed,
  },
  badge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: Theme.teslaRed,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Theme.screenBackground,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
});
