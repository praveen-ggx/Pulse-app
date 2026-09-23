/**
 * Fleet Owner capacity Story viewer — same Pulse story chrome as Boosted LOADs,
 * rendered from the FO's own VEHICLE_AVAILABILITY post (null org).
 */
import { PulseBrandMark } from '@/components/brand/PulseBrandMark';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import type { FleetOwnerCapacityStory } from '@/features/driver/services/fleetOwnerCapacityStory.service';
import { capacityStoryRouteLabel } from '@/features/driver/services/fleetOwnerCapacityStory.service';
import { StoryBroadcastPreview } from '@/features/network/components/StoryBroadcastPreview';
import type { PostRow } from '@/features/network/services/posts.service';
import {
  formatCapacityMaterial,
} from '@/features/network/utils/storyDisplay';
import { positiveMoneyOrNull } from '@/lib/format';
import { Megaphone, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const INK = Theme.textPrimaryDark;
const MUTED = Theme.textSecondary;
const STORY_DURATION = 15000;

export type DriverCapacityStoryViewerProps = {
  story: FleetOwnerCapacityStory;
  onClose: () => void;
  footerActions?: {
    primary?: { label: string; hint?: string; onPress: () => void } | null;
    secondary?: { label: string; onPress: () => void } | null;
  };
};

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function capacityToPost(story: FleetOwnerCapacityStory): PostRow {
  return {
    id: story.id,
    organization_id: null,
    org_name: 'Fleet availability',
    org_avatar_seed: null,
    org_avatar_url: null,
    author_user_id: story.author_user_id,
    type: 'VEHICLE_AVAILABILITY',
    content: story.content,
    origin: story.origin,
    destination: story.destination,
    load_date: story.load_date,
    vehicle_type: story.vehicle_type,
    weight_tonnes: null,
    rate_offer: positiveMoneyOrNull(story.rate_offer),
    material: story.material,
    expires_at: story.expires_at,
    is_active: story.is_active,
    view_count: 0,
    bid_count: 0,
    created_at: story.created_at,
    is_sponsored: false,
    reach_campaign_id: null,
  };
}

export function DriverCapacityStoryViewer({
  story,
  onClose,
  footerActions,
}: DriverCapacityStoryViewerProps) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const footerFade = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const post = useMemo(() => capacityToPost(story), [story]);

  useEffect(() => {
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) onCloseRef.current();
    });
    return () => anim.stop();
  }, [story.id, progress]);

  useEffect(() => {
    footerFade.setValue(0);
    Animated.timing(footerFade, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [story.id, footerFade]);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  // StoryBroadcastPreview takes the raw location strings and formats them
  // itself; an open-capacity post with no destination still reads "Anywhere".
  const originLabel = post.origin;
  const destinationLabel = post.destination?.trim() ? post.destination : 'Anywhere';
  const material =
    formatCapacityMaterial(post.material) ||
    post.vehicle_type?.trim() ||
    'Open capacity';

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <View style={styles.ambientGlow} pointerEvents="none" />

        <View style={[styles.progressRow, { paddingTop: insets.top + 8 }]}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
        </View>

        <View style={[styles.topBar, { paddingHorizontal: Layout.screenPaddingHorizontal }]}>
          <View style={styles.topBarLeft}>
            <Text style={styles.orgTitle} numberOfLines={1}>
              Fleet availability
            </Text>
            <View style={styles.topBarSubRow}>
              <Text style={styles.timeAgoLabel}>{timeAgo(post.created_at)}</Text>
              <View style={styles.capacityTag}>
                <Megaphone size={9} color={Theme.darkGreen} strokeWidth={2.25} />
                <Text style={styles.capacityTagText}>My capacity</Text>
              </View>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.topBarIconBtn,
              pressed && styles.topBarIconBtnPressed,
            ]}
            onPress={onClose}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Close story"
          >
            <X size={16} color={INK} strokeWidth={2.25} />
          </Pressable>
        </View>

        <View style={styles.centerStage} pointerEvents="none">
          <StoryBroadcastPreview
            post={post}
            loadMaterial={material}
            origin={originLabel}
            destination={destinationLabel}
            loadTargetRate={post.rate_offer}
            storyKey={post.id}
            kicker="Open capacity"
          />
        </View>

        <View style={styles.watermark} pointerEvents="none">
          <PulseBrandMark wordColor={INK} dotColor={INK} textStyle={styles.watermarkText} />
        </View>

        <Animated.View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              opacity: footerFade,
            },
          ]}
        >
          <View style={styles.metaBanner}>
            <Text style={styles.metaBannerLabel} numberOfLines={1}>
              {capacityStoryRouteLabel(story)}
            </Text>
            <Text style={styles.metaBannerSub} numberOfLines={1}>
              {[story.vehicle_type, formatCapacityMaterial(story.material)]
                .filter(Boolean)
                .join(' · ') || 'Shared with Business Idle capacity'}
            </Text>
          </View>

          {footerActions?.primary ? (
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={footerActions.primary.onPress}
            >
              <Text style={styles.primaryBtnText}>{footerActions.primary.label}</Text>
              {footerActions.primary.hint ? (
                <Text style={styles.primaryBtnHint}>{footerActions.primary.hint}</Text>
              ) : null}
            </Pressable>
          ) : null}

          {footerActions?.secondary ? (
            <Pressable
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={footerActions.secondary.onPress}
            >
              <Text style={styles.secondaryBtnText}>{footerActions.secondary.label}</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={onClose}
            >
              <Text style={styles.secondaryBtnText}>Done</Text>
            </Pressable>
          )}

          {!story.is_active ? (
            <Pressable
              onPress={() =>
                Alert.alert('Offline', 'This capacity Story is already offline.')
              }
            >
              <Text style={styles.offlineHint}>This Story is offline</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  ambientGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(21,128,61,0.04)',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 8,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: Theme.surfaceBorder,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: INK,
    borderRadius: 2,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 6,
  },
  topBarLeft: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  orgTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: INK,
    letterSpacing: -0.15,
  },
  topBarSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeAgoLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: MUTED,
  },
  capacityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Theme.positiveMuted,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  capacityTagText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.35,
    color: Theme.darkGreen,
    textTransform: 'uppercase',
  },
  topBarIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  topBarIconBtnPressed: { opacity: 0.85 },
  centerStage: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  watermark: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    transform: [{ translateY: -28 }],
  },
  watermarkText: {
    fontSize: 48,
    fontWeight: '800',
    color: INK,
    opacity: 0.03,
    letterSpacing: -1,
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.loadStatusTabBorderSoft,
    backgroundColor: 'rgba(255,255,255,0.98)',
    gap: 8,
  },
  metaBanner: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    gap: 2,
  },
  metaBannerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: INK,
  },
  metaBannerSub: {
    fontSize: 11,
    fontWeight: '500',
    color: MUTED,
  },
  primaryBtn: {
    borderRadius: 8,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
  },
  primaryBtnHint: {
    fontSize: 10,
    fontWeight: '500',
    color: Theme.buttonPrimaryText,
    opacity: 0.72,
  },
  secondaryBtn: {
    borderRadius: 8,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingVertical: 11,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: INK,
  },
  btnPressed: { opacity: 0.9 },
  offlineHint: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: Theme.negative,
  },
});
