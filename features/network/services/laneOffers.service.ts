/**
 * Lane offers: offers relevant to an indent's lane (same pickup, drop and
 * vehicle type), not only the offers placed on that exact indent.
 * @see supabase/migrations/20271113091500_lane_offers_for_indent.sql
 */
import { supabase } from '@/lib/supabase';

export type LaneOfferKind = 'market_bid' | 'network_quote' | 'pool_commitment';
export type LaneOfferChannel = 'marketplace' | 'network';
export type LaneInviteStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type LaneInviteBlocker = 'needs_marketplace' | 'needs_network' | 'not_in_network';

export type LaneOffer = {
  offer_key: string;
  kind: LaneOfferKind;
  source_id: string;
  source_indent_id: string | null;
  source_indent_number: string | null;
  channel: LaneOfferChannel;
  bidder_type: 'dco' | 'organization';
  bidder_organization_id: string | null;
  bidder_name: string;
  amount: number;
  created_at: string;
  vehicles_left: number | null;
  valid_until: string | null;
  invite_id: string | null;
  invite_status: LaneInviteStatus | null;
  invite_blocker: LaneInviteBlocker | null;
};

export type LaneOffersCursor = { amount: number; key: string };

export type LaneOffersPage = {
  indent_id: string;
  pool_key: string | null;
  network_open: boolean;
  marketplace_open: boolean;
  total_count: number;
  network_count: number;
  marketplace_count: number;
  min_network_amount: number | null;
  min_marketplace_amount: number | null;
  has_more: boolean;
  next_cursor: LaneOffersCursor | null;
  items: LaneOffer[];
};

export type LaneBidInvite = {
  invite_id: string;
  indent_id: string;
  indent_number: string | null;
  pickup_area: string | null;
  drop_location: string | null;
  vehicle_type: string | null;
  pickup_date: string | null;
  channel: LaneOfferChannel;
  bidder_type: 'dco' | 'organization';
  bidder_organization_id: string | null;
  amount: number;
  shipper_name: string | null;
  created_at: string;
};

export type LaneBidInvitesCursor = { created_at: string; id: string };

export type LaneBidInvitesPage = {
  total_count: number;
  has_more: boolean;
  next_cursor: LaneBidInvitesCursor | null;
  items: LaneBidInvite[];
};

export type InviteLaneBidderResult = {
  kind: LaneOfferKind;
  invite_id?: string;
  status?: LaneInviteStatus;
  created?: boolean;
  attached?: boolean;
  quote_id?: string | null;
};

export type RespondLaneBidInviteResult = {
  invite_id: string;
  status: LaneInviteStatus;
};

export const LANE_OFFERS_PAGE_SIZE = 50;

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeLaneOffersPage(raw: unknown, indentId: string): LaneOffersPage {
  const r = (raw ?? {}) as Record<string, unknown>;
  const items = Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : [];
  const cursor = r.next_cursor as { amount?: unknown; key?: unknown } | null | undefined;
  return {
    indent_id: String(r.indent_id ?? indentId),
    pool_key: (r.pool_key as string | null) ?? null,
    network_open: r.network_open === true,
    marketplace_open: r.marketplace_open === true,
    total_count: toNumber(r.total_count),
    network_count: toNumber(r.network_count),
    marketplace_count: toNumber(r.marketplace_count),
    min_network_amount: toNullableNumber(r.min_network_amount),
    min_marketplace_amount: toNullableNumber(r.min_marketplace_amount),
    has_more: r.has_more === true,
    next_cursor:
      cursor && cursor.key != null && cursor.amount != null
        ? { amount: toNumber(cursor.amount), key: String(cursor.key) }
        : null,
    items: items.map((item) => ({
      ...(item as unknown as LaneOffer),
      amount: toNumber(item.amount),
      vehicles_left: toNullableNumber(item.vehicles_left),
    })),
  };
}

export async function listLaneOffersForIndent(
  indentId: string,
  options: { limit?: number; cursor?: LaneOffersCursor | null } = {},
): Promise<{ error: Error | null; page: LaneOffersPage | null }> {
  if (!indentId) return { error: null, page: null };
  const { data, error } = await supabase().rpc('list_lane_offers_for_indent', {
    p_indent_id: indentId,
    p_limit: options.limit ?? LANE_OFFERS_PAGE_SIZE,
    ...(options.cursor
      ? { p_after_amount: options.cursor.amount, p_after_key: options.cursor.key }
      : {}),
  });
  if (error) return { error: new Error(error.message), page: null };
  return { error: null, page: normalizeLaneOffersPage(data, indentId) };
}

/** Attaches live Network lane commitments to an indent. Returns how many were added. */
export async function attachLaneCommitmentsForIndent(
  indentId: string,
): Promise<{ error: Error | null; attached: number }> {
  if (!indentId) return { error: null, attached: 0 };
  const { data, error } = await supabase().rpc('attach_lane_commitments_for_indent', {
    p_indent_id: indentId,
  });
  if (error) return { error: new Error(error.message), attached: 0 };
  return { error: null, attached: toNumber((data as { attached?: unknown } | null)?.attached) };
}

export async function inviteLaneBidder(
  indentId: string,
  offer: Pick<LaneOffer, 'kind' | 'source_id'>,
): Promise<{ error: Error | null; result: InviteLaneBidderResult | null }> {
  const { data, error } = await supabase().rpc('invite_lane_bidder', {
    p_indent_id: indentId,
    p_kind: offer.kind,
    p_source_id: offer.source_id,
  });
  if (error) return { error: new Error(error.message), result: null };
  return { error: null, result: data as InviteLaneBidderResult };
}

export async function respondLaneBidInvite(
  inviteId: string,
  accept: boolean,
): Promise<{ error: Error | null; result: RespondLaneBidInviteResult | null }> {
  const { data, error } = await supabase().rpc('respond_lane_bid_invite', {
    p_invite_id: inviteId,
    p_accept: accept,
  });
  if (error) return { error: new Error(error.message), result: null };
  return { error: null, result: data as RespondLaneBidInviteResult };
}

export async function listMyLaneBidInvites(
  options: { limit?: number; cursor?: LaneBidInvitesCursor | null } = {},
): Promise<{ error: Error | null; page: LaneBidInvitesPage | null }> {
  const { data, error } = await supabase().rpc('list_my_lane_bid_invites', {
    p_limit: options.limit ?? LANE_OFFERS_PAGE_SIZE,
    ...(options.cursor
      ? { p_after_created_at: options.cursor.created_at, p_after_id: options.cursor.id }
      : {}),
  });
  if (error) return { error: new Error(error.message), page: null };
  const r = (data ?? {}) as Record<string, unknown>;
  const items = Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : [];
  return {
    error: null,
    page: {
      total_count: toNumber(r.total_count),
      has_more: r.has_more === true,
      next_cursor: (r.next_cursor as LaneBidInvitesCursor | null) ?? null,
      items: items.map((item) => ({
        ...(item as unknown as LaneBidInvite),
        amount: toNumber(item.amount),
      })),
    },
  };
}
