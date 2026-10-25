/**
 * Post detail modal — shows full post with bids list.
 * Load owner sees bids and can accept/reject. Others can bid from here too.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from '@/constants/Theme';
import { BidSheet } from '@/features/network/components/bidding/BidSheet';
import { useVerifiedActionGuard } from '@/features/network/utils/verifiedActionGuard';
import { useNetworkFeedQuery, useAfterPostDeleted } from '@/lib/queries/usePostsQuery';
import {
  useBidsForPostQuery,
  useAcceptBidMutation,
  useRejectBidMutation,
} from '@/lib/queries/useBidsQuery';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useReachCampaignsQuery, useMarkReachCampaignSourceDeletedMutation } from '@/lib/queries/useReachCampaignsQuery';
import { deactivatePost, isPostVisibleForOrg, type PostRow } from '@/features/network/services/posts.service';
import { type BidRow, RelationshipRequiredError } from '@/features/network/services/bids.service';
import { createConnectionRequest } from '@/features/connections/services/connectionRequests.service';
import { ROUTES } from '@/lib/routes';
import { formatINR } from '@/lib/format';
import { confirmDialog } from '@/lib/confirmDialog';
import type { LinkedOrgDisplay } from '@/lib/useLinkedOrgProfileMap';
import { useLinkedOrgDisplayMap } from '@/lib/queries/useLinkedOrgDisplayQuery';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Package,
  ThumbsDown,
  ThumbsUp,
  Truck,
  Trash2,
  Zap,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ORG_COLORS = [
  '#4D3636', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f59e0b', '#10b981', '#3b82f6', '#0ea5e9',
];
function orgColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % ORG_COLORS.length;
  return ORG_COLORS[h];
}
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function BidCard({
  bid,
  isOwner,
  branding,
  onAccept,
  onReject,
}: {
  bid: BidRow;
  isOwner: boolean;
  branding?: LinkedOrgDisplay | null;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const isPending = bid.status === 'pending';
  const isAccepted = bid.status === 'accepted';
  const orgName = bid.bidder_org_name ?? 'Unknown';

  return (
    <View style={[styles.bidCard, isAccepted && styles.bidCardAccepted]}>
      <View style={styles.bidAvatar}>
        <PartyAvatar
          name={orgName}
          initialsColorSeed={bid.bidder_organization_id}
          avatarUrl={branding?.avatarUrl}
          avatarSeed={branding?.avatarSeed}
          entityType="supplier"
          size={44}
        />
      </View>
      <View style={styles.bidInfo}>
        <Text style={styles.bidOrgName}>{(bid.bidder_org_name ?? 'Unknown').toUpperCase()}</Text>
        {bid.note ? <Text style={styles.bidNote} numberOfLines={2}>{bid.note}</Text> : null}
        <Text style={styles.bidTime}>{timeAgo(bid.created_at)}</Text>
      </View>
      <View style={styles.bidRight}>
        <Text style={[styles.bidAmount, { color: isAccepted ? '#10b981' : Theme.textPrimary }]}>
          {formatINR(bid.amount)}
        </Text>
        {isAccepted ? (
          <View style={styles.acceptedBadge}>
            <Check size={10} color="#10b981" strokeWidth={3} />
            <Text style={styles.acceptedText}>Accepted</Text>
          </View>
        ) : isOwner && isPending ? (
          <View style={styles.bidActions}>
            <Pressable style={styles.acceptBtn} onPress={() => onAccept(bid.id)} hitSlop={8}>
              <ThumbsUp size={14} color="#10b981" />
            </Pressable>
            <Pressable style={styles.rejectBtn} onPress={() => onReject(bid.id)} hitSlop={8}>
              <ThumbsDown size={14} color="#ef4444" />
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function PostDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;

  const [bidSheetPost, setBidSheetPost] = useState<PostRow | null>(null);
  const guardVerified = useVerifiedActionGuard();

  const feedQ = useNetworkFeedQuery(orgId);
  const afterPostDeleted = useAfterPostDeleted(orgId);
  const bidsQ = useBidsForPostQuery(postId ?? null);
  const acceptMutation = useAcceptBidMutation(postId ?? '');
  const rejectMutation = useRejectBidMutation(postId ?? '');
  const [isDeleting, setIsDeleting] = useState(false);

  const allowLoadPosts = organization?.capabilities?.canBid ?? true;
  const visiblePosts = useMemo(
    () => (feedQ.data ?? []).filter((post) => isPostVisibleForOrg(post, { allowLoadPosts })),
    [feedQ.data, allowLoadPosts],
  );
  const post = useMemo(
    () => visiblePosts.find((p) => p.id === postId) ?? null,
    [visiblePosts, postId],
  );

  const isOwner = post?.organization_id === orgId;
  const isLoad = post?.type === 'LOAD';
  const myCampaignsQ = useReachCampaignsQuery(isOwner ? orgId : null);
  const activeCampaignForPost = useMemo(
    () =>
      myCampaignsQ.data?.find(
        (c) => c.post_id === post?.id && (c.status === 'draft' || c.status === 'active'),
      ) ?? null,
    [myCampaignsQ.data, post?.id],
  );
  const markSourceDeletedMutation = useMarkReachCampaignSourceDeletedMutation();
  const color = post ? orgColor(post.organization_id ?? '') : Theme.primary;
  const bids = bidsQ.data ?? [];
  const bidderOrgIds = useMemo(
    () =>
      [
        ...new Set(
          bids
            .map((b) => b.bidder_organization_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ].sort(),
    [bids],
  );
  const bidderBrandingByOrgId = useLinkedOrgDisplayMap(bidderOrgIds);

  /**
   * Relationship Guard v1 (docs/architecture/11-relationship-guard-v1.md): the shipper
   * should never hit a dead end on this error — always offer the next concrete action.
   */
  const handleAcceptBidError = (error: Error) => {
    if (!(error instanceof RelationshipRequiredError)) {
      Alert.alert('Error', error.message);
      return;
    }

    if (error.eligibility.reason === 'invitation_pending') {
      Alert.alert('Invitation Pending', error.message, [
        { text: 'OK', style: 'cancel' },
        { text: 'View Invitation', onPress: () => router.push(ROUTES.TABS.NETWORK) },
      ]);
      return;
    }

    if (error.eligibility.reason === 'invitation_rejected') {
      Alert.alert('Relationship Rejected', error.message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resend',
          onPress: () => void sendConnectionRequest(error.bidderOrgId, error.shipperOrgId),
        },
      ]);
      return;
    }

    Alert.alert('Relationship Required', error.message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send Connection Request',
        onPress: () => void sendConnectionRequest(error.bidderOrgId, error.shipperOrgId),
      },
    ]);
  };

  const sendConnectionRequest = async (bidderOrgId: string, shipperOrgId: string) => {
    const { error } = await createConnectionRequest(shipperOrgId, bidderOrgId, {
      requestShipperClient: false,
      requestCarrierSupplier: true,
    });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    Alert.alert('Connection Request Sent', 'You can award this bid once the connection is accepted.');
  };

  const handleAccept = (bidId: string) => {
    Alert.alert('Accept Bid', 'Accept this bid? The bidder will be notified.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          const res = await acceptMutation.mutateAsync(bidId);
          if (res.error) handleAcceptBidError(res.error);
        },
      },
    ]);
  };

  const handleReject = (bidId: string) => {
    Alert.alert('Reject Bid', 'Reject this bid?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          const res = await rejectMutation.mutateAsync(bidId);
          if (res.error) Alert.alert('Error', res.error.message);
        },
      },
    ]);
  };

  const handleDeletePost = useCallback(async () => {
    if (!post || !isOwner || !orgId || isDeleting) return;
    const ok = activeCampaignForPost
      ? await confirmDialog({
          title: 'Delete story?',
          message:
            'This story has an active Pulse Boost campaign.\n\nThe story will be removed, but your paid campaign continues:\n' +
            '• Delivery keeps running from the campaign snapshot\n' +
            '• Analytics and campaign history stay intact\n' +
            '• The campaign ends on its normal schedule\n\n' +
            'Deleting the story cannot be undone.',
          confirmLabel: 'Delete',
          destructive: true,
        })
      : await confirmDialog({
          title: 'Delete post?',
          message: 'This broadcast will be removed from your network feed.',
          confirmLabel: 'Delete',
          destructive: true,
        });
    if (!ok) return;
    setIsDeleting(true);
    if (activeCampaignForPost) {
      // Transparency stamp only — the campaign is NOT cancelled. The customer
      // bought distribution; delivery continues from the campaign snapshot.
      await markSourceDeletedMutation.mutateAsync({
        campaignId: activeCampaignForPost.id,
        orgId,
      });
    }
    const { error } = await deactivatePost(post.id, orgId);
    setIsDeleting(false);
    if (error) {
      Alert.alert('Could not delete', error.message);
      return;
    }
    await afterPostDeleted(post.id);
    router.back();
  }, [post, isOwner, orgId, isDeleting, afterPostDeleted, router, activeCampaignForPost, markSourceDeletedMutation]);

  if (!post) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={20} color={Theme.textPrimary} />
          </Pressable>
        </View>
        <LoadingIndicator color={Theme.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={Theme.textPrimary} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {isLoad ? 'Load Post' : 'Post'}
          </Text>
        </View>
        {isOwner ? (
          <Pressable
            onPress={handleDeletePost}
            disabled={isDeleting}
            style={[styles.headerActionBtn, isDeleting && styles.headerActionBtnDisabled]}
            hitSlop={8}
            accessibilityLabel="Delete post"
          >
            <Trash2 size={18} color={Theme.teslaRed} strokeWidth={2.2} />
          </Pressable>
        ) : (
          <View style={styles.headerActionSpacer} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Post card */}
        <View style={[styles.postCard, { borderTopColor: color }]}>
          {/* Org info */}
          <View style={styles.postHeader}>
            <PartyAvatar
              name={post.org_name}
              initialsColorSeed={post.organization_id}
              avatarSeed={post.org_avatar_seed}
              entityType="supplier"
              size={44}
              style={styles.postAvatar}
            />
            <View style={styles.postMeta}>
              <Text style={styles.postOrgName}>{post.org_name.toUpperCase()}</Text>
              <View style={styles.postMetaRow}>
                <Clock3 size={10} color={Theme.textSecondary} />
                <Text style={styles.postTime}>{timeAgo(post.created_at)}</Text>
                {isLoad && (
                  <View style={styles.loadTypeBadge}>
                    <Truck size={9} color="#f59e0b" />
                    <Text style={styles.loadTypeBadgeText}>LOAD</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Load details */}
          {isLoad && post.origin && post.destination && (
            <View style={[styles.routeBox, { borderLeftColor: color }]}>
              <View style={styles.routeRow}>
                <View style={styles.routePoint}>
                  <View style={[styles.routeDot, { backgroundColor: '#10b981' }]} />
                  <Text style={styles.routeLabel}>FROM</Text>
                  <Text style={styles.routeCity}>{post.origin}</Text>
                </View>
                <ArrowRight size={18} color={Theme.textSecondary} />
                <View style={styles.routePoint}>
                  <View style={[styles.routeDot, { backgroundColor: color }]} />
                  <Text style={styles.routeLabel}>TO</Text>
                  <Text style={styles.routeCity}>{post.destination}</Text>
                </View>
              </View>

              <View style={styles.loadChips}>
                {post.vehicle_type && (
                  <View style={styles.chip}>
                    <Truck size={10} color={Theme.textSecondary} />
                    <Text style={styles.chipText}>{post.vehicle_type}</Text>
                  </View>
                )}
                {post.weight_tonnes != null && (
                  <View style={styles.chip}>
                    <Package size={10} color={Theme.textSecondary} />
                    <Text style={styles.chipText}>{post.weight_tonnes}T</Text>
                  </View>
                )}
                {post.material && (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{post.material}</Text>
                  </View>
                )}
              </View>

              {post.rate_offer != null && (
                <View style={styles.rateRow}>
                  <Text style={styles.rateLabel}>EXPECTED RATE</Text>
                  <Text style={[styles.rateValue, { color }]}>{formatINR(post.rate_offer)}</Text>
                </View>
              )}
            </View>
          )}

          {post.content ? (
            <Text style={styles.postContent}>{post.content}</Text>
          ) : null}
        </View>

        {/* Bids section */}
        {isLoad && (
          <View style={styles.bidsSection}>
            <View style={styles.bidsSectionHeader}>
              <Text style={styles.bidsSectionTitle}>
                {isOwner ? 'BIDS RECEIVED' : 'BIDS'} ({bids.length})
              </Text>
              {bidsQ.isLoading && <LoadingIndicator size={12} color={Theme.primary} />}
            </View>

            {bids.length === 0 && !bidsQ.isLoading && (
              <View style={styles.noBids}>
                <Zap size={28} color={Theme.textSecondary} strokeWidth={1} />
                <Text style={styles.noBidsText}>No bids yet</Text>
                <Text style={styles.noBidsSub}>
                  {isOwner ? 'Bids will appear here as your network responds' : 'Be the first to place a bid'}
                </Text>
              </View>
            )}

            {bids.map((bid) => (
              <BidCard
                key={bid.id}
                bid={bid}
                isOwner={isOwner}
                branding={bidderBrandingByOrgId[bid.bidder_organization_id]}
                onAccept={handleAccept}
                onReject={handleReject}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* CTA for non-owners on load posts */}
      {isLoad && !isOwner && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={styles.bidCta} onPress={() => guardVerified(() => setBidSheetPost(post))}>
            <ThumbsUp size={18} color="#fff" />
            <Text style={styles.bidCtaText}>Place Your Bid</Text>
          </Pressable>
        </View>
      )}

      <BidSheet
        visible={bidSheetPost !== null}
        post={bidSheetPost}
        orgId={orgId ?? ''}
        onClose={() => setBidSheetPost(null)}
        onSuccess={() => bidsQ.refetch()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Theme.textPrimary,
    letterSpacing: -0.3,
  },
  headerActionSpacer: { width: 36, height: 36 },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
  },
  headerActionBtnDisabled: { opacity: 0.55 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
  postCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    overflow: 'hidden',
    borderTopWidth: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    paddingBottom: 12,
  },
  postAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAvatarText: { fontSize: 14, fontWeight: '900' },
  postMeta: { flex: 1 },
  postOrgName: {
    fontSize: 13,
    fontWeight: '900',
    color: Theme.textPrimary,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  postMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  postTime: { fontSize: 11, color: Theme.textSecondary, fontWeight: '600' },
  loadTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f59e0b18',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  loadTypeBadgeText: { fontSize: 8, fontWeight: '900', color: '#f59e0b' },
  routeBox: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: Theme.surface,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  routePoint: { flex: 1, gap: 3 },
  routeDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 2 },
  routeLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: Theme.textSecondary,
    letterSpacing: 0.8,
  },
  routeCity: {
    fontSize: 16,
    fontWeight: '900',
    color: Theme.textPrimary,
    letterSpacing: -0.3,
  },
  loadChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Theme.screenBackground,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  chipText: { fontSize: 11, fontWeight: '700', color: Theme.textSecondary },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  rateLabel: { fontSize: 9, fontWeight: '900', color: Theme.textSecondary, letterSpacing: 0.5 },
  rateValue: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  postContent: {
    fontSize: 15,
    color: Theme.textPrimary,
    fontWeight: '500',
    lineHeight: 22,
    padding: 16,
    paddingTop: 0,
  },
  bidsSection: { gap: 10 },
  bidsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  bidsSectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: Theme.textSecondary,
    letterSpacing: 0.8,
  },
  bidCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
  },
  bidCardAccepted: {
    borderColor: '#10b98140',
    backgroundColor: '#10b98108',
  },
  bidAvatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidAvatarText: { fontSize: 13, fontWeight: '900' },
  bidInfo: { flex: 1 },
  bidOrgName: {
    fontSize: 11,
    fontWeight: '900',
    color: Theme.textPrimary,
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  bidNote: { fontSize: 12, color: Theme.textSecondary, fontWeight: '500', lineHeight: 16, marginBottom: 4 },
  bidTime: { fontSize: 10, color: Theme.textSecondary, fontWeight: '600' },
  bidRight: { alignItems: 'flex-end', gap: 6 },
  bidAmount: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  bidActions: { flexDirection: 'row', gap: 6 },
  acceptBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#10b98118',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#ef444418',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10b98118',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  acceptedText: { fontSize: 10, fontWeight: '800', color: '#10b981' },
  noBids: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  noBidsText: { fontSize: 15, fontWeight: '800', color: Theme.textPrimary },
  noBidsSub: {
    fontSize: 12,
    color: Theme.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  footer: {
    padding: 16,
    paddingTop: 12,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.surfaceBorder,
  },
  bidCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Theme.buttonPrimary,
    borderRadius: 14,
    paddingVertical: 16,
  },
  bidCtaText: { fontSize: 16, fontWeight: '900', color: Theme.buttonPrimaryText, letterSpacing: -0.3 },
});
