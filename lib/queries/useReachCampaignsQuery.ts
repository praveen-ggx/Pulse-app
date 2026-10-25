import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getReachPlans,
  getReachCampaignsForOrg,
  getReachCampaignPurchasesForOrg,
  getReachCampaignDelivery,
  markReachCampaignSourceDeleted,
  publishReachCampaign,
  upgradeReachCampaign,
  cancelReachCampaign,
  type ReachDriverRewardConfig,
  type ReachPaymentMethod,
} from '@/features/reach/services/campaigns.service';
import {
  getDriverReachStories,
  getDriverReferralEarnings,
  getDriverReferralForTrip,
  getDriverReferralsForCampaign,
  getReachReferralInbox,
  decideReachReferral,
  recommendReachCampaign,
  submitDriverDirectBid,
  type RecommendReachCampaignInput,
} from '@/features/reach/services/driverReferrals.service';
import { createSalaryRequest } from '@/features/drivers/services/salaryRequests.service';
import {
  getReachCampaignMetrics,
  getReachOrgSummary,
  type ReachCampaignMetrics,
} from '@/features/reach/services/analytics.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useReachPlansQuery() {
  return useQuery({
    queryKey: queryKeys.reach.plans(),
    queryFn: async () => {
      const res = await getReachPlans();
      if (res.error) throw res.error;
      return res.plans;
    },
    staleTime: STALE.slow, // admin-editable, changes rarely
  });
}

export function useReachCampaignsQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.campaignsForOrg(orgId ?? ''),
    queryFn: async () => {
      const res = await getReachCampaignsForOrg(orgId!);
      if (res.error) throw res.error;
      return res.campaigns;
    },
    enabled: !!orgId,
    staleTime: STALE.frequent,
  });
}

/** Plan-tier timeline source — see getReachCampaignPurchasesForOrg. */
export function useReachCampaignPurchasesQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.campaignPurchasesForOrg(orgId ?? ''),
    queryFn: async () => {
      const res = await getReachCampaignPurchasesForOrg(orgId!);
      if (res.error) throw res.error;
      return res.purchases;
    },
    enabled: !!orgId,
    staleTime: STALE.frequent,
  });
}

export function useReachCampaignMetricsQuery(campaignId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.campaignMetrics(campaignId ?? ''),
    queryFn: async () => {
      const res = await getReachCampaignMetrics(campaignId!);
      if (res.error) throw res.error;
      return res.metrics;
    },
    enabled: !!campaignId,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

/**
 * Trip-level metrics for the Story reel. One card groups every campaign that
 * shares an indent (re-boost / upgrade siblings). Reading only the primary
 * row drops impressions that landed on an earlier sibling — e.g. Starter got
 * 6 impressions, then Business became primary and the card showed Reach 0
 * while the org KPI still counted 6. Sum across the whole trip group.
 */
export function useReachTripMetricsQuery(campaignIds: string[]) {
  const ids = campaignIds.filter(Boolean);
  const queries = useQueries({
    queries: ids.map((campaignId) => ({
      queryKey: queryKeys.reach.campaignMetrics(campaignId),
      queryFn: async () => {
        const res = await getReachCampaignMetrics(campaignId);
        if (res.error) throw res.error;
        return res.metrics;
      },
      staleTime: 10_000,
      refetchInterval: 15_000,
    })),
  });

  const isLoading = ids.length > 0 && queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);
  const ready = ids.length > 0 && queries.every((q) => q.data != null);

  let data: ReachCampaignMetrics | null = null;
  if (ready) {
    data = { impressions: 0, views: 0, bids: 0, creditsUsed: 0 };
    for (const q of queries) {
      const m = q.data!;
      data.impressions += m.impressions;
      data.views += m.views;
      data.bids += m.bids;
      data.creditsUsed += m.creditsUsed;
    }
  }

  return { data, isLoading, isError };
}

export function useReachOrgSummaryQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.orgSummary(orgId ?? ''),
    queryFn: async () => {
      const res = await getReachOrgSummary(orgId!);
      if (res.error) throw res.error;
      return res.summary;
    },
    enabled: !!orgId,
    staleTime: STALE.frequent,
  });
}

/** Per-wave delivery stats for the campaign detail Delivery panel. */
export function useReachCampaignDeliveryQuery(campaignId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.campaignDelivery(campaignId ?? ''),
    queryFn: async () => {
      const res = await getReachCampaignDelivery(campaignId!);
      if (res.error) throw res.error;
      return res.waves;
    },
    enabled: !!campaignId,
    staleTime: STALE.frequent,
  });
}

/** Driver Story tab feed for the authenticated driver. */
export function useDriverReachStoriesQuery(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.driverStories(userId ?? ''),
    queryFn: async () => {
      const res = await getDriverReachStories();
      if (res.error) throw res.error;
      return res.stories;
    },
    enabled: !!userId,
    staleTime: STALE.frequent,
  });
}

/** Referral reward earnings + withdrawal state for the Stories green card. */
export function useDriverRewardEarningsQuery(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.driverRewardEarnings(userId ?? ''),
    queryFn: async () => {
      const res = await getDriverReferralEarnings();
      if (res.error) throw res.error;
      return res.data;
    },
    enabled: !!userId,
    staleTime: STALE.frequent,
  });
}

/** This trip's own Reach referral, if it started as a recommendation —
 * powers the trip card's reward/recommendation badge. */
export function useDriverReferralForTripQuery(tripId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.driverReferralForTrip(tripId ?? ''),
    queryFn: async () => {
      const res = await getDriverReferralForTrip(tripId as string);
      if (res.error) throw res.error;
      return res.referral;
    },
    enabled: !!tripId,
    staleTime: STALE.frequent,
  });
}

/** Driver withdraws referral rewards — a driver_salary_requests row
 * (request_type='reward') the fleet owner approves & pays like any salary
 * request. */
export function useRequestRewardWithdrawalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      driverId,
      orgId,
      amount,
    }: {
      driverId: string;
      orgId: string;
      amount: number;
      /** Invalidation target. */
      userId: string;
    }) => {
      const res = await createSalaryRequest(driverId, orgId, 'reward', amount, {
        note: 'Referral reward withdrawal',
      });
      if (res.error) throw res.error;
      return res.request;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.reach.driverRewardEarnings(variables.userId),
      });
    },
  });
}

export function usePublishReachCampaignMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      postId,
      planId,
      paymentMethod,
      rewardConfig,
    }: {
      orgId: string;
      postId: string;
      planId: string;
      paymentMethod: ReachPaymentMethod;
      /** Boost V2: driver distribution + referral escrow (optional). */
      rewardConfig?: ReachDriverRewardConfig;
    }) => publishReachCampaign(orgId, postId, planId, paymentMethod, rewardConfig),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reach.campaignsForOrg(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.reach.campaignPurchasesForOrg(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.reach.wallet(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.reach.orgSummary(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: ["q", "reach", "metrics"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.all(variables.orgId) });
    },
  });
}

export function useReachDriverReferralsQuery(campaignId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.driverReferralsForCampaign(campaignId ?? ''),
    queryFn: async () => {
      const res = await getDriverReferralsForCampaign(campaignId!);
      if (res.error) throw res.error;
      return res.referrals;
    },
    enabled: !!campaignId,
    staleTime: STALE.frequent,
  });
}

export function useRecommendReachCampaignMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecommendReachCampaignInput) => recommendReachCampaign(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.reach.driverReferralsForCampaign(variables.campaignId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.reach.driverReferralsForFleetOrg(variables.fleetOrgId),
      });
    },
  });
}

/** Independent driver's direct bid on a boosted story — no organization
 * required. Caller invalidates queryKeys.reach.driverStories(userId) itself
 * (same posture as the recommend flow in DriverStoriesScreen) since the
 * userId isn't part of this mutation's input. */
export function useSubmitDriverDirectBidMutation() {
  return useMutation({
    mutationFn: (input: { postId: string; amount: number; note?: string }) =>
      submitDriverDirectBid(input.postId, input.amount, input.note),
  });
}

/** Fleet Owner Recommendation Inbox — recommendations drivers sent this org. */
export function useReachReferralInboxQuery(fleetOrgId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.driverReferralsForFleetOrg(fleetOrgId ?? ''),
    queryFn: async () => {
      const res = await getReachReferralInbox(fleetOrgId!);
      if (res.error) throw res.error;
      return res.inbox;
    },
    enabled: !!fleetOrgId,
    staleTime: STALE.frequent,
  });
}

export function useDecideReachReferralMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      referralId,
      approve,
    }: {
      referralId: string;
      approve: boolean;
      /** Invalidation targets — pass whichever contexts are known. */
      campaignId?: string;
      fleetOrgId?: string;
    }) => decideReachReferral(referralId, approve),
    onSuccess: (_data, variables) => {
      if (variables.campaignId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.reach.driverReferralsForCampaign(variables.campaignId),
        });
      }
      if (variables.fleetOrgId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.reach.driverReferralsForFleetOrg(variables.fleetOrgId),
        });
      }
    },
  });
}

export function useUpgradeReachCampaignMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
      newPlanId,
      paymentMethod,
    }: {
      campaignId: string;
      newPlanId: string;
      paymentMethod: ReachPaymentMethod;
      orgId: string; // only used to invalidate the right query below
    }) => upgradeReachCampaign(campaignId, newPlanId, paymentMethod),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reach.campaignsForOrg(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.reach.campaignPurchasesForOrg(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.reach.wallet(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.reach.orgSummary(variables.orgId) });
    },
  });
}

/** Snapshot lifecycle: the source story was deleted but the campaign lives
 * on, serving from its snapshot. Stamps source_deleted_at (transparency). */
export function useMarkReachCampaignSourceDeletedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
    }: {
      campaignId: string;
      orgId: string; // only used to invalidate the right query below
    }) => markReachCampaignSourceDeleted(campaignId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reach.campaignsForOrg(variables.orgId) });
    },
  });
}

export function useCancelReachCampaignMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
      reason,
    }: {
      campaignId: string;
      reason: string;
      orgId: string; // only used to invalidate the right query below
    }) => cancelReachCampaign(campaignId, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reach.campaignsForOrg(variables.orgId) });
    },
  });
}
