/**
 * Pulse Boost — boost flow. A campaign always wraps an existing post
 * (public.posts) — see 20261224040000_reach_campaigns_core.sql for why there
 * is no separate story/media table for v1.
 */
import { supabase } from '@/lib/supabase';
import { getIndentOperationalDisplayCode } from '@/features/operations/display/operationalDisplay';
import {
  hasFullPulseBoostDistribution,
  PULSE_BOOST_DISTRIBUTION_CHANNELS,
} from '@/features/reach/utils/reachDistribution.util';

export type ReachPlanCode = 'basic' | 'boost' | 'max';
/** draft: not yet published. active: running, real expires_at. completed:
 * expires_at passed (auto, hourly cron) or target lifecycle ended. cancelled:
 * stopped early. No separate 'expired' — same time-based trigger as
 * 'completed', collapsed to one terminal state. */
export type ReachCampaignStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type ReachPaymentMethod = 'credits' | 'money';

export interface ReachPlanRow {
  id: string;
  code: ReachPlanCode;
  name: string;
  price_inr: number;
  credit_price: number;
  estimated_reach_min: number;
  estimated_reach_max: number;
  audience_scope: string;
  sort_order: number;
  duration_hours: number;
}

export interface ReachCampaignRow {
  id: string;
  org_id: string;
  post_id: string | null;
  plan_id: string;
  status: ReachCampaignStatus;
  published_at: string | null;
  expires_at: string | null;
  completed_at: string | null;
  created_at: string;
  /** Snapshotted at publish time — stays accurate even if the source post is
   * later edited or deleted. Never re-read from `posts` after publish. */
  snapshot_post_type: 'UPDATE' | 'LOAD' | null;
  snapshot_title: string | null;
  snapshot_origin: string | null;
  snapshot_destination: string | null;
  snapshot_vehicle_type: string | null;
  snapshot_material: string | null;
  snapshot_content: string | null;
  snapshot_posted_at: string | null;
  /** Indent behind the boosted LOAD story — stable trip identity across
   * re-broadcasts of the same load. Null for UPDATE stories / ad-hoc loads. */
  snapshot_source_indent_id: string | null;
  /** Only meaningful when status === 'cancelled', e.g. 'source_deleted'. */
  cancel_reason: string | null;
  /** Snapshot lifecycle: set when the source story was deleted while the
   * campaign was active. The campaign keeps serving from its snapshot —
   * transparency stamp only, not a lifecycle state. */
  source_deleted_at: string | null;
  // ── Boost V2: driver distribution + referral escrow ──
  /** Feeds this campaign runs in. Always includes 'fleet'; may include 'driver'. */
  distribution_channels: ReachDistributionChannel[];
  driver_reward_enabled: boolean;
  /** 'flat' only in this release — schema supports 'percentage' for later. */
  reward_type: 'flat' | 'percentage';
  /** Flat reward per converted referral (Pulse Credits). */
  reward_amount: number;
  /** Maximum Referral Budget configured at publish (credits). */
  reward_budget: number;
  /** Referral Escrow still locked (credits). Refunds automatically at completion. */
  reward_reserved: number;
  reward_paid: number;
  reward_refunded: number;
  // ── Enriched client-side by getReachCampaignsForOrg (not DB columns) ──
  /** Real operational indent code (e.g. IND001 / GGV234-IND-001) — the same
   * identity shown everywhere else in the app, never a UUID fragment. */
  indent_display_code?: string | null;
  /** The load's actual offered rate (posts.rate_offer, falling back to the
   * indent's supplier target). NOT the boost plan price. */
  load_rate?: number | null;
  load_pickup_date?: string | null;
  load_weight?: number | null;
  load_type?: string | null;
}

export type ReachDistributionChannel = 'fleet' | 'driver';

export interface ReachDriverRewardConfig {
  distributionChannels: ReachDistributionChannel[];
  driverRewardEnabled: boolean;
  /** Flat credits per converted referral. */
  rewardAmount: number;
  /** Maximum Referral Budget (credits) — reserved as escrow at publish. */
  rewardBudget: number;
}

export interface PublishReachCampaignResult {
  ok: boolean;
  campaign_id: string;
  purchase_id: string;
  purchase_status: 'pending' | 'paid';
  /** 'draft' for a pending cash payment (no gateway exists — doesn't go live
   * until confirmed), 'active' for credits (fully real, immediate). */
  campaign_status: ReachCampaignStatus;
  plan_code: ReachPlanCode;
  expires_at: string | null;
}

/** One delivery wave from get_reach_campaign_delivery — the per-wave funnel
 * from the canonical reach_campaign_targets record. Waves 1–3 are the
 * scheduled 40/40/20 release; wave 4 is the one-time no-bid escalation push
 * (up to +20% of the plan reach). */
export interface ReachCampaignDeliveryWaveRow {
  wave: 1 | 2 | 3 | 4;
  targets: number;
  verified_targets: number;
  released_at: string;
  /** Targeted orgs that saw the story (viewed_at set). */
  viewed: number;
  /** Targeted orgs that placed a bid (bid_at set). */
  bids: number;
  /** Targeted orgs whose referral converted to a trip (converted_at set). */
  conversions: number;
}

export interface UpgradeReachCampaignResult {
  ok: boolean;
  campaign_id: string;
  purchase_id: string;
  purchase_status: 'pending' | 'paid';
  new_plan_code: ReachPlanCode;
  expires_at: string;
}

export async function getReachPlans(): Promise<{ error: Error | null; plans: ReachPlanRow[] }> {
  const { data, error } = await supabase()
    .from('reach_plans')
    .select('id, code, name, price_inr, credit_price, estimated_reach_min, estimated_reach_max, audience_scope, sort_order, duration_hours')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) return { error: new Error(error.message), plans: [] };
  return { error: null, plans: (data ?? []) as ReachPlanRow[] };
}

export async function publishReachCampaign(
  orgId: string,
  postId: string,
  planId: string,
  paymentMethod: ReachPaymentMethod,
  rewardConfig?: ReachDriverRewardConfig,
): Promise<{ error: Error | null; result: PublishReachCampaignResult | null }> {
  const { data, error } = await supabase().rpc('publish_reach_campaign', {
    p_org_id: orgId,
    p_post_id: postId,
    p_plan_id: planId,
    p_payment_method: paymentMethod,
    p_distribution_channels: [...PULSE_BOOST_DISTRIBUTION_CHANNELS],
    p_driver_reward_enabled: rewardConfig?.driverRewardEnabled ?? false,
    ...(rewardConfig
      ? {
          p_reward_type: 'flat',
          p_reward_amount: rewardConfig.rewardAmount,
          p_reward_budget: rewardConfig.rewardBudget,
        }
      : null),
  });

  if (error) return { error: new Error(error.message), result: null };
  return { error: null, result: data as PublishReachCampaignResult };
}

export async function getReachCampaignsForOrg(
  orgId: string,
): Promise<{ error: Error | null; campaigns: ReachCampaignRow[] }> {
  const { data, error } = await supabase()
    .from('reach_campaigns')
    .select('id, org_id, post_id, plan_id, status, published_at, expires_at, completed_at, created_at, snapshot_post_type, snapshot_title, snapshot_origin, snapshot_destination, snapshot_vehicle_type, snapshot_material, snapshot_content, snapshot_posted_at, snapshot_source_indent_id, cancel_reason, source_deleted_at, distribution_channels, driver_reward_enabled, reward_type, reward_amount, reward_budget, reward_reserved, reward_paid, reward_refunded')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), campaigns: [] };
  const campaigns = (data ?? []) as ReachCampaignRow[];
  await ensureActiveBoostDistribution(campaigns);
  await enrichCampaignsWithLoadIdentity(campaigns);
  return { error: null, campaigns };
}

/** Live campaigns must keep the plan surfaces: Network, Pulse, Pilot/DCO. */
async function ensureActiveBoostDistribution(
  campaigns: ReachCampaignRow[],
): Promise<void> {
  const stale = campaigns.filter(
    (c) => c.status === 'active' && !hasFullPulseBoostDistribution(c.distribution_channels),
  );
  if (stale.length === 0) return;
  await Promise.all(
    stale.map(async (campaign) => {
      const { error } = await supabase()
        .from('reach_campaigns')
        .update({ distribution_channels: [...PULSE_BOOST_DISTRIBUTION_CHANNELS] })
        .eq('id', campaign.id)
        .eq('org_id', campaign.org_id)
        .eq('status', 'active');
      if (error) {
        if (__DEV__) {
          console.warn('[reach] could not expand boost channels:', error.message);
        }
        return;
      }
      campaign.distribution_channels = [...PULSE_BOOST_DISTRIBUTION_CHANNELS];
    }),
  );
}

/**
 * Attach the REAL load identity/values to campaign rows: the operational
 * indent code (IND001-style, same as Trips/Indents screens) and the load's
 * actual rate + pickup/load details. Batched (two queries total) and
 * best-effort — enrichment failure degrades to the snapshot fallbacks, it
 * never fails the campaign list itself.
 */
async function enrichCampaignsWithLoadIdentity(campaigns: ReachCampaignRow[]): Promise<void> {
  const indentIds = [
    ...new Set(campaigns.map((c) => c.snapshot_source_indent_id).filter(Boolean)),
  ] as string[];
  const postIds = [...new Set(campaigns.map((c) => c.post_id).filter(Boolean))] as string[];
  if (indentIds.length === 0 && postIds.length === 0) return;

  const [indentsRes, postsRes] = await Promise.all([
    indentIds.length > 0
      ? supabase()
          .from('indents')
          .select(
            'id, indent_operational_code, indent_code, display_indent_id, indent_number, pickup_date, weight, load_type, supplier_target',
          )
          .in('id', indentIds)
      : Promise.resolve({ data: [], error: null }),
    postIds.length > 0
      ? supabase().from('posts').select('id, rate_offer').in('id', postIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  interface IndentIdentityRow {
    id: string;
    indent_operational_code: string | null;
    indent_code: string | null;
    display_indent_id: string | null;
    indent_number: string | null;
    pickup_date: string | null;
    weight: number | null;
    load_type: string | null;
    supplier_target: number | null;
  }
  const indentById = new Map(
    ((indentsRes.data ?? []) as IndentIdentityRow[]).map((r) => [r.id, r]),
  );
  const ratesByPost = new Map(
    ((postsRes.data ?? []) as { id: string; rate_offer: number | null }[]).map((r) => [
      r.id,
      r.rate_offer,
    ]),
  );

  for (const c of campaigns) {
    const indent = c.snapshot_source_indent_id
      ? indentById.get(c.snapshot_source_indent_id)
      : undefined;
    if (indent) {
      const code = getIndentOperationalDisplayCode(indent);
      c.indent_display_code = code !== '—' ? code : null;
      c.load_pickup_date = indent.pickup_date;
      c.load_weight = indent.weight;
      c.load_type = indent.load_type;
    }
    const postRate = c.post_id ? ratesByPost.get(c.post_id) : undefined;
    c.load_rate = postRate ?? indent?.supplier_target ?? null;
  }
}

export interface ReachCampaignPurchaseRow {
  id?: string;
  campaign_id: string;
  plan_id: string;
  created_at: string;
  payment_method?: 'credits' | 'money' | 'mixed' | string;
  credits_charged?: number;
  amount_inr_charged?: number;
  status?: 'pending' | 'paid' | 'failed' | 'refunded' | string;
}

/**
 * Every publish/upgrade transaction across an org's campaigns, oldest first —
 * the real plan-tier timeline. A single campaign row only ever holds its
 * CURRENT plan_id (upgrade_reach_campaign mutates in place), so a trip
 * upgraded Starter -> Growth -> Business has one reach_campaigns row but
 * three purchase rows; a re-broadcast trip has one purchase row per
 * campaign row. Merging both is what makes the plan timeline complete.
 */
export async function getReachCampaignPurchasesForOrg(
  orgId: string,
): Promise<{ error: Error | null; purchases: ReachCampaignPurchaseRow[] }> {
  const { data, error } = await supabase()
    .from('reach_campaign_purchases')
    .select(
      'id, campaign_id, plan_id, created_at, payment_method, credits_charged, amount_inr_charged, status, reach_campaigns!inner(org_id)',
    )
    .eq('reach_campaigns.org_id', orgId)
    .order('created_at', { ascending: true });

  if (error) return { error: new Error(error.message), purchases: [] };
  return {
    error: null,
    purchases: (data ?? []).map((r) => ({
      id: r.id,
      campaign_id: r.campaign_id,
      plan_id: r.plan_id,
      created_at: r.created_at,
      payment_method: r.payment_method,
      credits_charged: r.credits_charged ?? 0,
      amount_inr_charged: Number(r.amount_inr_charged ?? 0),
      status: r.status,
    })) as ReachCampaignPurchaseRow[],
  };
}

/** Snapshot lifecycle: called when the source story is deleted while the
 * campaign is active. Does NOT cancel — the campaign continues serving from
 * its snapshot; this stamps source_deleted_at for transparency/analytics. */
export async function markReachCampaignSourceDeleted(
  campaignId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc('mark_reach_campaign_source_deleted', {
    p_campaign_id: campaignId,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function cancelReachCampaign(
  campaignId: string,
  reason: string = 'user_cancelled',
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc('cancel_reach_campaign', {
    p_campaign_id: campaignId,
    p_reason: reason,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/** Per-wave delivery stats (targets, verified split, impressions) for the
 * campaign detail Delivery panel. Owner-org members only. */
export async function getReachCampaignDelivery(
  campaignId: string,
): Promise<{ error: Error | null; waves: ReachCampaignDeliveryWaveRow[] }> {
  const { data, error } = await supabase().rpc('get_reach_campaign_delivery', {
    p_campaign_id: campaignId,
  });
  if (error) return { error: new Error(error.message), waves: [] };
  return { error: null, waves: (data ?? []) as ReachCampaignDeliveryWaveRow[] };
}

export async function upgradeReachCampaign(
  campaignId: string,
  newPlanId: string,
  paymentMethod: ReachPaymentMethod,
): Promise<{ error: Error | null; result: UpgradeReachCampaignResult | null }> {
  const { data, error } = await supabase().rpc('upgrade_reach_campaign', {
    p_campaign_id: campaignId,
    p_new_plan_id: newPlanId,
    p_payment_method: paymentMethod,
  });

  if (error) return { error: new Error(error.message), result: null };
  return { error: null, result: data as UpgradeReachCampaignResult };
}
