import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { resolveCommercialOpportunity } from '@/features/marketplace/domain';
import { StoryMobilePopupShell } from '@/features/network/components/StoryMobilePopupShell';
import StoryDetailScreen from '@/features/network/screens/StoryDetailScreen';
import {
  checkOrgsConnectedForStoryPreview,
  getStoryClosedInfo,
  getStoryPreview,
  type StoryClosedReason,
  type StoryPreviewRow,
} from '@/features/network/services/posts.service';
import { getDriverReachStories } from '@/features/reach/services/driverReferrals.service';
import { DriverPulseStoryViewer } from '@/features/reach/screens/DriverPulseStoryViewer';
import { ROUTES } from '@/lib/routes';
import { useMemberAccess } from '@/lib/useMemberAccess';
import { useSafeBack } from '@/lib/useSafeBack';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CheckCircle2,
  Clock3,
  MapPin,
  SearchX,
  Truck,
  XCircle,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Preview gate: market closed when resolver says the listing is not open-market
 * visible for an anonymous/share viewer. Backend sets is_active from indent
 * lifecycle for LOAD stories (M0); do not invent close from expires_at alone.
 */
function isPreviewMarketClosed(preview: StoryPreviewRow): boolean {
  if (preview.type !== 'LOAD') return preview.is_active === false;
  const opportunity = resolveCommercialOpportunity({
    viewerOrgId: null,
    ownerOrgId: preview.organization_id,
    isLoad: true,
    postIsActive: preview.is_active,
    bidCount: 0,
  });
  return !opportunity.visibility.isOpenMarketVisible;
}

const CLOSED_COPY: Record<
  StoryClosedReason,
  { title: string; sub: string; tone: 'positive' | 'neutral' }
> = {
  assigned: {
    title: 'This load has been assigned',
    sub: 'The load giver has awarded this broadcast to a partner. Bidding is closed for this load.',
    tone: 'positive',
  },
  withdrawn: {
    title: 'This broadcast was withdrawn',
    sub: 'The load giver cancelled this indent, so it is no longer open for bids.',
    tone: 'neutral',
  },
  expired: {
    title: 'This broadcast has expired',
    sub: 'The bidding window for this load has ended.',
    tone: 'neutral',
  },
  closed: {
    title: 'This broadcast is closed',
    sub: 'The load giver has stopped taking bids on this broadcast.',
    tone: 'neutral',
  },
  removed: {
    title: 'This broadcast is no longer available',
    sub: 'The story may have been deleted, or the load has already been assigned.',
    tone: 'neutral',
  },
};

function closedIcon(reason: StoryClosedReason) {
  switch (reason) {
    case 'assigned':
      return <CheckCircle2 size={26} color={Theme.positive} strokeWidth={1.8} />;
    case 'withdrawn':
      return <XCircle size={26} color={Theme.textSecondary} strokeWidth={1.8} />;
    case 'removed':
      return <SearchX size={26} color={Theme.textSecondary} strokeWidth={1.8} />;
    default:
      return <Clock3 size={26} color={Theme.textSecondary} strokeWidth={1.8} />;
  }
}

/** Card-styled terminal state for a dead story link (assigned / expired / …). */
function StoryClosedView({
  reason,
  onGoHome,
}: {
  reason: StoryClosedReason;
  onGoHome: () => void;
}) {
  const insets = useSafeAreaInsets();
  const copy = CLOSED_COPY[reason];
  return (
    <StoryMobilePopupShell onBackdropPress={onGoHome}>
    <View
      style={[
        styles.container,
        styles.centered,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={[styles.card, styles.closedCard]}>
        <View
          style={[
            styles.iconWrap,
            copy.tone === 'positive' && styles.iconWrapPositive,
          ]}
        >
          {closedIcon(reason)}
        </View>
        <Text style={styles.expiredTitle}>{copy.title}</Text>
        <Text style={styles.expiredSub}>{copy.sub}</Text>
        <Pressable
          style={[styles.ctaBtn, styles.closedCta]}
          onPress={onGoHome}
          accessibilityRole="button"
        >
          <Text style={styles.ctaBtnText}>Find more loads on Pulse</Text>
        </Pressable>
      </View>
    </View>
    </StoryMobilePopupShell>
  );
}

function PreviewShell({
  preview,
  children,
  onClose,
}: {
  preview: StoryPreviewRow;
  /** Omitted when there's no action to offer (e.g. member lacks the story grant). */
  children?: React.ReactNode;
  onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const routeLabel =
    preview.origin && preview.destination
      ? `${preview.origin.toUpperCase()} → ${preview.destination.toUpperCase()}`
      : null;

  return (
    <StoryMobilePopupShell onBackdropPress={onClose}>
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Truck size={26} color={Theme.brandBlueInk} strokeWidth={1.8} />
        </View>
        <Text style={styles.orgName}>{preview.org_name || 'Pulse network'}</Text>
        {routeLabel ? (
          <View style={styles.routeRow}>
            <MapPin size={14} color={Theme.textSecondary} />
            <Text style={styles.routeText}>{routeLabel}</Text>
          </View>
        ) : null}
        {preview.vehicle_type ? (
          <Text style={styles.metaText}>{preview.vehicle_type}</Text>
        ) : null}
        {preview.expires_at ? (
          <View style={styles.expiryRow}>
            <Clock3 size={12} color={Theme.textMuted} />
            <Text style={styles.expiryText}>
              Expires {new Date(preview.expires_at).toLocaleString('en-IN')}
            </Text>
          </View>
        ) : null}
      </View>
      {children}
    </View>
    </StoryMobilePopupShell>
  );
}

export default function StoryDetailRoute() {
  const { user, status, profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const router = useRouter();
  const closeStory = useSafeBack(ROUTES.TABS.NETWORK);
  const params = useLocalSearchParams<{ postId?: string; orgId?: string; storyType?: string; queue?: string }>();
  const myOrgId = currentOrganization?.id ?? '';
  const isDriver = profile?.role === 'driver';

  const previewQ = useQuery({
    queryKey: ['q', 'posts', 'story-preview', params.postId],
    queryFn: async () => {
      const { preview } = await getStoryPreview(params.postId!);
      return preview;
    },
    enabled: Boolean(params.postId),
    staleTime: 30_000,
  });

  const driverStoriesQ = useQuery({
    queryKey: ['q', 'reach', 'driver-stories', 'story-detail', user?.uid],
    queryFn: async () => {
      const { stories } = await getDriverReachStories();
      return stories;
    },
    enabled: Boolean(isDriver && user?.uid && params.postId),
    staleTime: 30_000,
  });

  const driverStory = useMemo(() => {
    if (!params.postId || !driverStoriesQ.data) return null;
    return driverStoriesQ.data.find((s) => s.post_id === params.postId) ?? null;
  }, [driverStoriesQ.data, params.postId]);

  const storyClosed =
    !previewQ.isLoading &&
    (previewQ.data == null || isPreviewMarketClosed(previewQ.data));

  /** Why the link is dead — awarded indent, cancelled, expired, deleted. */
  const closedInfoQ = useQuery({
    queryKey: ['q', 'posts', 'story-closed', params.postId],
    queryFn: () => getStoryClosedInfo(params.postId!),
    enabled:
      Boolean(params.postId) &&
      storyClosed &&
      !(myOrgId && previewQ.data?.organization_id === myOrgId) &&
      !isDriver,
    staleTime: 30_000,
  });

  const connectionQ = useQuery({
    queryKey: ['q', 'posts', 'org-connected', myOrgId, previewQ.data?.organization_id, params.postId],
    queryFn: async () => {
      const { connected } = await checkOrgsConnectedForStoryPreview(
        myOrgId,
        previewQ.data!.organization_id,
        params.postId,
      );
      return connected;
    },
    enabled:
      Boolean(user) &&
      status !== 'restoring' &&
      Boolean(myOrgId) &&
      Boolean(previewQ.data) &&
      !isDriver,
    staleTime: 30_000,
  });

  const returnTo = useMemo(() => {
    const entries = Object.entries(params).filter(([, v]) => typeof v === 'string') as [string, string][];
    const qs = new URLSearchParams(Object.fromEntries(entries)).toString();
    return encodeURIComponent(`/story-detail?${qs}`);
  }, [params]);

  if (status === 'restoring' || previewQ.isLoading) {
    return (
      <StoryMobilePopupShell onBackdropPress={closeStory}>
        <LazySuspenseInlineFallback />
      </StoryMobilePopupShell>
    );
  }

  const preview = previewQ.data;
  /**
   * Load givers keep access to their own broadcast after award/deactivation
   * (mirrors getNetworkFeed, which keeps own-org awarded LOAD posts visible).
   */
  const isOwnStory = Boolean(
    myOrgId && preview && preview.organization_id === myOrgId,
  );

  if (isDriver && params.postId && (driverStory || driverStoriesQ.isLoading)) {
    const driverQueue =
      (driverStoriesQ.data?.length ?? 0) > 0
        ? driverStoriesQ.data!
        : driverStory
          ? [driverStory]
          : [];
    if (driverStoriesQ.isLoading && !driverStory) {
      return (
        <StoryMobilePopupShell onBackdropPress={closeStory}>
          <LazySuspenseInlineFallback />
        </StoryMobilePopupShell>
      );
    }
    if (driverStory) {
      return (
        <DriverPulseStoryViewer
          stories={driverQueue.filter((s) => s.post_id)}
          initialPostId={params.postId}
          postId={params.postId}
          story={driverStory}
          shipperName={driverStory.org_name ?? preview?.org_name}
          onClose={closeStory}
        />
      );
    }
  }

  const waitForConnection =
    Boolean(user) && Boolean(myOrgId) && !isDriver && !isOwnStory;
  if (storyClosed && !isOwnStory) {
    if (closedInfoQ.isLoading || (waitForConnection && connectionQ.isLoading)) {
      return (
        <StoryMobilePopupShell onBackdropPress={closeStory}>
          <LazySuspenseInlineFallback />
        </StoryMobilePopupShell>
      );
    }
    // Connected / client-book partners still preview the story card.
    // Market-closed only blocks strangers.
    if (!waitForConnection || !connectionQ.data) {
      return (
        <StoryClosedView
          reason={closedInfoQ.data?.reason ?? 'removed'}
          onGoHome={() => router.replace(ROUTES.INDEX)}
        />
      );
    }
  }

  if (!preview) {
    return (
      <StoryMobilePopupShell onBackdropPress={closeStory}>
        <View style={[styles.centered, { flex: 1, padding: 24 }]}>
          <Text style={styles.metaText}>This story could not be opened.</Text>
          <Pressable onPress={closeStory} style={styles.ctaBtn}>
            <Text style={styles.ctaBtnText}>Close</Text>
          </Pressable>
        </View>
      </StoryMobilePopupShell>
    );
  }

  if (!user) {
    return (
      <PreviewShell preview={preview} onClose={closeStory}>
        <Pressable
          style={styles.ctaBtn}
          onPress={() => router.replace(`/sign-in?returnTo=${returnTo}`)}
        >
          <Text style={styles.ctaBtnText}>Sign up / Log in to bid</Text>
        </Pressable>
      </PreviewShell>
    );
  }

  /**
   * Signed-in members still need the `sales.network.stories` grant to reach the
   * bidding screen. Without it they fall back to the same public preview an
   * outsider sees — this is the door that made chat → story → live indent work
   * for a fully restricted member. Owners/admins bypass via useMemberAccess.
   * Own-org broadcasts stay visible so a load giver never locks themselves out.
   */
  if (!accessLoading && !isOwnStory && !canSurface('sales.network.stories')) {
    return <PreviewShell preview={preview} onClose={closeStory} />;
  }

  if (accessLoading || connectionQ.isLoading) {
    return (
      <StoryMobilePopupShell onBackdropPress={closeStory}>
        <LazySuspenseInlineFallback />
      </StoryMobilePopupShell>
    );
  }

  if (!connectionQ.data) {
    return (
      <PreviewShell preview={preview} onClose={closeStory}>
        <Pressable style={styles.ctaBtn} onPress={() => router.replace(ROUTES.TABS.NETWORK)}>
          <Text style={styles.ctaBtnText}>Connect with {preview.org_name || 'this org'} to bid</Text>
        </Pressable>
      </PreviewShell>
    );
  }

  return <StoryDetailScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 24,
  },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  card: {
    backgroundColor: Theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  /** Terminal-state card — centered, no list below so no bottom margin. */
  closedCard: {
    width: '100%',
    maxWidth: 380,
    paddingVertical: 28,
    paddingHorizontal: 24,
    gap: 6,
    marginBottom: 0,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surfaceLight,
    marginBottom: 4,
  },
  iconWrapPositive: {
    backgroundColor: Theme.positiveMuted,
  },
  orgName: { fontSize: 15, fontWeight: '800', color: Theme.textPrimaryDark },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  routeText: { fontSize: 14, fontWeight: '700', color: Theme.textPrimaryDark },
  metaText: { fontSize: 12, fontWeight: '600', color: Theme.textSecondary },
  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  expiryText: { fontSize: 11, fontWeight: '500', color: Theme.textMuted },
  expiredTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
  },
  expiredSub: {
    fontSize: 13,
    fontWeight: '500',
    color: Theme.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  ctaBtn: {
    backgroundColor: Theme.brandBlueInk,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  closedCta: {
    marginTop: 14,
    alignSelf: 'stretch',
  },
  ctaBtnText: { fontSize: 13, fontWeight: '700', color: Theme.textOnPrimary },
});
