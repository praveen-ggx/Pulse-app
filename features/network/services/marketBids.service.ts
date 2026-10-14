/**
 * Business Review Hub v1 — market_bids on a business-owned indent.
 * Distinct from driver_direct_bids (Reach) and org-to-org direct_quotes —
 * this is the DCO/fleet-owner-bids-directly-on-an-indent path.
 * @see supabase/migrations/20270301040000_market_bids.sql
 * @see supabase/migrations/20270304040000_list_market_bids_for_indent.sql
 * @see supabase/migrations/20270304030000_market_bid_trips_fk_fix.sql
 * @see supabase/migrations/20270304110000_market_bids_contact_visibility.sql
 */
import { supabase } from '@/lib/supabase';

export type MarketBidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'superseded';

/**
 * A8.6.2 — independent of MarketBidStatus (award outcome). not_required =
 * fee engine inactive/resolved to 0 at award time; required = fee >0 and
 * unpaid; pending = payment initiated with a provider (A8.7); paid =
 * confirmed server-side; failed = retryable, no auto-expiry in this phase.
 */
export type FeePaymentStatus = 'not_required' | 'required' | 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';

export type MarketBidForIndentRow = {
  id: string;
  indent_id: string;
  bidder_type: 'dco' | 'organization';
  bidder_user_id: string;
  bidder_display_name: string;
  bidder_organization_id: string | null;
  bidder_organization_name: string | null;
  /** Always populated (last-4 masked). */
  bidder_masked_phone: string | null;
  /** Unmasked — only non-null once accepted AND fee_payment_status is paid/not_required. */
  bidder_phone: string | null;
  /** Legacy RPC display flag on list_market_bids_for_indent — not a Driver App identity/auth gate. */
  is_fleet_owner: boolean;
  amount: number;
  note: string | null;
  status: MarketBidStatus;
  fee_payment_status: FeePaymentStatus;
  platform_fee_amount: number | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  vehicle_number: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_body_type: string | null;
  vehicle_capacity: string | null;
};

/** All market_bids on this indent, newest first — RLS-backed via list_market_bids_for_indent. */
export async function listMarketBidsForIndent(
  indentId: string,
): Promise<{ error: Error | null; bids: MarketBidForIndentRow[] }> {
  if (!indentId) return { error: null, bids: [] };
  const { data, error } = await supabase().rpc('list_market_bids_for_indent', {
    p_indent_id: indentId,
  });
  if (error) return { error: new Error(error.message), bids: [] };
  return { error: null, bids: (data ?? []) as MarketBidForIndentRow[] };
}

export type MarketplacePlatformFeeCalc = {
  is_active_config_found: boolean;
  config_id?: string;
  config_name?: string;
  comparison_mode?: 'highest' | 'lowest';
  max_fee?: number | null;
  bid_amount: number;
  components?: Array<{
    component_type: 'flat' | 'percentage';
    flat_amount: number | null;
    percentage_rate: number | null;
    computed_amount: number;
  }>;
  resolved_fee: number;
  capped?: boolean;
  client_price: number;
};

/**
 * A8.3 — preview-only call to the single authoritative fee calculation
 * (public.calculate_marketplace_platform_fee). Never recompute this
 * formula client-side; this is purely for showing the business what
 * accept_market_bid() will resolve to before they confirm the award.
 */
export async function calculateMarketplacePlatformFee(
  bidAmount: number,
): Promise<{ error: Error | null; calc: MarketplacePlatformFeeCalc | null }> {
  const { data, error } = await supabase().rpc('calculate_marketplace_platform_fee', {
    p_bid_amount: bidAmount,
  });
  if (error) return { error: new Error(error.message), calc: null };
  return { error: null, calc: (data as MarketplacePlatformFeeCalc) ?? null };
}

/**
 * A8.6.2 — award only. Never creates a trip for either bidder type anymore
 * (that split is exactly the point: the platform fee gates trip creation).
 * DCO callers must follow a successful award with
 * createMarketTripAfterFeePayment() once fee_payment_status is
 * paid/not_required; organization callers proceed to their existing
 * self-allocation flow, which now itself refuses to create a trip until
 * paid (see create_trip_from_assigned_indent).
 */
export async function awardMarketBid(bidId: string): Promise<{
  error: Error | null;
  status: MarketBidStatus | null;
  feePaymentStatus: FeePaymentStatus | null;
  platformFeeAmount: number | null;
}> {
  const { data, error } = await supabase().rpc('award_market_bid', {
    p_bid_id: bidId,
  });
  if (error) {
    return { error: new Error(error.message), status: null, feePaymentStatus: null, platformFeeAmount: null };
  }
  const result = data as {
    status?: MarketBidStatus;
    fee_payment_status?: FeePaymentStatus;
    platform_fee_amount?: number;
  } | null;
  return {
    error: null,
    status: result?.status ?? null,
    feePaymentStatus: result?.fee_payment_status ?? null,
    platformFeeAmount: result?.platform_fee_amount ?? null,
  };
}

/** DCO only — creates the trip once fee_payment_status is paid/not_required. */
export async function createMarketTripAfterFeePayment(
  bidId: string,
): Promise<{ error: Error | null; tripId: string | null }> {
  await supabase().rpc('settle_marketplace_fee_as_cash', { p_bid_id: bidId });

  const { data, error } = await supabase().rpc('create_market_trip_after_fee_payment', {
    p_bid_id: bidId,
  });
  if (error) return { error: new Error(error.message), tripId: null };
  const tripId = (data as { trip_id?: string } | null)?.trip_id ?? null;
  return { error: null, tripId };
}

export async function revokeIndentAward(indentId: string): Promise<{
  error: Error | null;
  awardRevokedAt: string | null;
}> {
  const { data, error } = await supabase().rpc('revoke_indent_award', {
    p_indent_id: indentId,
  });
  if (error) {
    return { error: new Error(error.message), awardRevokedAt: null };
  }
  const result = data as { award_revoked_at?: string } | null;
  return { error: null, awardRevokedAt: result?.award_revoked_at ?? null };
}

/** Reverse a paid test_online fee, then revoke. Razorpay and cash are refused by the RPC. */
export async function refundTestMarketplaceFeeAndRevokeIndent(
  indentId: string,
  reason: string,
): Promise<{ error: Error | null; awardRevokedAt: string | null }> {
  const { data, error } = await supabase().rpc(
    'refund_test_marketplace_fee_and_revoke_indent',
    { p_indent_id: indentId, p_reason: reason },
  );
  if (error) {
    return { error: new Error(error.message), awardRevokedAt: null };
  }
  const result = data as { award_revoked_at?: string; note?: string } | null;
  return { error: null, awardRevokedAt: result?.award_revoked_at ?? null };
}

export async function rejectMarketBid(bidId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc('reject_market_bid', { p_bid_id: bidId });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export type MarketplaceFeeOrder = {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
};

/**
 * A8.7 — starts a Razorpay checkout for this bid's Marketplace platform
 * fee. Calls the razorpay-create-order edge function, which reads the fee
 * amount server-side (never client-supplied) and records the pending
 * attempt via initiate_marketplace_fee_payment_order(). The bidder pays
 * this fee directly to Pulse — the client/load value is unaffected.
 */
export async function createMarketplaceFeeOrder(
  bidId: string,
): Promise<{ error: Error | null; order: MarketplaceFeeOrder | null }> {
  const { data, error } = await supabase().functions.invoke('razorpay-create-order', {
    body: { bidId },
  });
  if (error) {
    const payload = (data ?? null) as { error?: string; message?: string } | null;
    const detail = payload?.message?.trim() || payload?.error?.trim() || error.message;
    return { error: new Error(detail), order: null };
  }
  const result = data as { orderId?: string; amount?: number; currency?: string; keyId?: string } | null;
  if (!result?.orderId || !result?.keyId) {
    return { error: new Error('Payment order response was incomplete.'), order: null };
  }
  return {
    error: null,
    order: {
      orderId: result.orderId,
      amount: result.amount ?? 0,
      currency: result.currency ?? 'INR',
      keyId: result.keyId,
    },
  };
}

/**
 * A10.2 — PILOT/TEST ONLY. Mirrors createMarketplaceFeeOrder() but for the
 * `marketplace-test-payment` edge function (cash / test_online), used to
 * exercise the required -> paid -> trip state machine without Razorpay
 * credentials. Server-side gated (MARKETPLACE_TEST_PAYMENTS_ENABLED); this
 * client call never supplies an amount. Remove alongside the edge function
 * once the pilot's temporary payment methods are retired.
 */
export type TestMarketplaceFeeProvider = 'cash' | 'test_online';

export type TestMarketplaceFeeOrder = {
  orderId: string;
  amount: number;
  currency: string;
  provider: TestMarketplaceFeeProvider;
};

export async function createTestMarketplaceFeeOrder(
  bidId: string,
  provider: TestMarketplaceFeeProvider,
): Promise<{ error: Error | null; order: TestMarketplaceFeeOrder | null }> {
  const { data, error } = await supabase().functions.invoke('marketplace-test-payment', {
    body: { action: 'create', bidId, provider },
  });
  if (error) {
    const payload = (data ?? null) as { error?: string; message?: string } | null;
    const detail = payload?.message?.trim() || payload?.error?.trim() || error.message;
    return { error: new Error(detail), order: null };
  }
  const result = data as { orderId?: string; amount?: number; currency?: string; provider?: string } | null;
  if (!result?.orderId) {
    return { error: new Error('Test payment order response was incomplete.'), order: null };
  }
  return {
    error: null,
    order: {
      orderId: result.orderId,
      amount: result.amount ?? 0,
      currency: result.currency ?? 'INR',
      provider,
    },
  };
}

/**
 * A10.2 — PILOT/TEST ONLY. Simulates a provider outcome for the bidder's
 * OWN current pending test-payment attempt on this bid. Never tells the
 * server which payment/amount to confirm -- only "paid" or "failed" for
 * "my current attempt on this bid"; the server derives the rest and calls
 * the same confirm_marketplace_fee_payment() Razorpay itself uses.
 */
export async function settleMarketplaceFeeAsCash(
  bidId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc('settle_marketplace_fee_as_cash', {
    p_bid_id: bidId,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function settleMarketplaceFeeAsCashForIndent(
  indentId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc('settle_marketplace_fee_as_cash_for_indent', {
    p_indent_id: indentId,
  });
  if (error) {
    const missing =
      error.code === 'PGRST202' ||
      /could not find the function|does not exist/i.test(error.message);
    if (missing) return { error: null };
    return { error: new Error(error.message) };
  }
  return { error: null };
}

export function marketplaceFeeGateSatisfied(
  status: FeePaymentStatus | null | undefined,
): boolean {
  return status === 'paid' || status === 'not_required';
}

export async function simulateTestMarketplaceFeePayment(
  bidId: string,
  outcome: 'paid' | 'failed',
): Promise<{ error: Error | null }> {
  const { data, error } = await supabase().functions.invoke('marketplace-test-payment', {
    body: { action: 'simulate', bidId, outcome },
  });
  if (error) {
    const payload = (data ?? null) as { error?: string; message?: string } | null;
    const detail = payload?.message?.trim() || payload?.error?.trim() || error.message;
    return { error: new Error(detail) };
  }
  return { error: null };
}
