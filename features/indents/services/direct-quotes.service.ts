/**
 * Direct quotes — supplier quotes on indents that have no marketplace listing
 * (circulation_target offline / integrated_supplier). Backed by public.direct_quotes.
 */
import { shouldFallbackDirectQuotesToTable } from '@/features/indents/utils/bidding/indentReviewHubOffers.util';
import { FINITE_LIST_CAP } from '@/lib/pagination';
import { supabase } from '@/lib/supabase';

const MY_DIRECT_QUOTES_SELECT =
  'id, indent_id, bidder_organization_id, amount, notes, status, created_at, updated_at, driver_id, vehicle_id, counter_amount' as const;

export interface DirectQuoteRow {
  id: string;
  indent_id: string;
  bidder_organization_id: string;
  bidder_organization_name?: string;
  amount: number;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  /** Assigned at quote time (parity with marketplace bid). */
  driver_id?: string | null;
  vehicle_id?: string | null;
  /** Owner counter-offer (INR). Null = none. Status stays pending until award/reject. */
  counter_amount?: number | null;
  /**
   * Hub channel. Default / omitted = org direct_quotes.
   * `driver_direct_bid` = Pilot / independent FO bid on the linked Pulse story.
   */
  offer_source?: "direct_quote" | "driver_direct_bid" | "market_bid";
  /** Pilot / FO bidder face (from profiles via list_driver_direct_bids_for_post). */
  bidder_avatar_url?: string | null;
  bidder_avatar_seed?: string | null;
  /** Driver user id for Pilot / FO bids — used to check live availability. */
  bidder_user_id?: string | null;
  /**
   * True when this offer cannot be awarded: bidder was picked on another load
   * (`superseded`) or `is_driver_available()` is currently false.
   */
  bidderUnavailable?: boolean;
}

/**
 * Submit a direct quote (RLS: caller must be member of bidder_organization_id).
 * Upserts so one quote per bidder per indent.
 * driverId/vehicleId optional — when provided, assign at quote time.
 */
export async function createDirectQuote(
  indentId: string,
  bidderOrgId: string,
  amount: number,
  notes?: string | null,
  driverId?: string | null,
  vehicleId?: string | null
): Promise<{ error: Error | null; quote: DirectQuoteRow | null }> {
  const { data, error } = await supabase()
    .from('direct_quotes')
    .upsert(
      {
        indent_id: indentId,
        bidder_organization_id: bidderOrgId,
        amount: Number(amount),
        notes: notes ?? null,
        status: 'pending',
        updated_at: new Date().toISOString(),
        driver_id: driverId ?? null,
        vehicle_id: vehicleId ?? null,
      },
      { onConflict: 'indent_id,bidder_organization_id' }
    )
    .select()
    .single();

  if (error) return { error: new Error(error.message), quote: null };
  return { error: null, quote: data as DirectQuoteRow };
}

/**
 * Fetch my organization's direct quotes (for carrier \"My Quotes / Active Loads\" views).
 */
export async function getMyDirectQuotes(
  bidderOrgId: string
): Promise<{ error: Error | null; quotes: DirectQuoteRow[] }> {
  const { data, error } = await supabase()
    .from('direct_quotes')
    .select(MY_DIRECT_QUOTES_SELECT)
    .eq('bidder_organization_id', bidderOrgId)
    .order('created_at', { ascending: false })
    .limit(FINITE_LIST_CAP);

  if (error) return { error: new Error(error.message), quotes: [] };
  return { error: null, quotes: (data ?? []) as DirectQuoteRow[] };
}

/**
 * Fetch all direct quotes for an indent with bidder organization names (for indent owner / Give Load).
 * Uses RPC so indent owner can see bidder names without RLS blocking organizations read.
 */
export async function getDirectQuotesByIndentId(
  indentId: string
): Promise<{ error: Error | null; quotes: DirectQuoteRow[] }> {
  const { data, error } = await supabase().rpc('get_direct_quotes_with_bidder_names', {
    p_indent_id: indentId,
  });

  if (!shouldFallbackDirectQuotesToTable(error, data)) {
    const rows = (data ?? []) as (DirectQuoteRow & { bidder_organization_name?: string })[];
    return { error: null, quotes: rows };
  }

  const { data: tableRows, error: tableError } = await supabase()
    .from('direct_quotes')
    .select(MY_DIRECT_QUOTES_SELECT)
    .eq('indent_id', indentId)
    .order('created_at', { ascending: false });
  if (tableError) {
    return {
      error: new Error(error?.message ?? tableError.message),
      quotes: [],
    };
  }
  return { error: null, quotes: (tableRows ?? []) as DirectQuoteRow[] };
}

/**
 * Get quote counts per indent in one query (O(n) over results). For Hire Partner list badges.
 * Returns Record<indent_id, count>. Indent IDs not present have count 0 (omitted from record).
 */
export async function getDirectQuoteCountsByIndentIds(
  indentIds: string[]
): Promise<{ error: Error | null; counts: Record<string, number> }> {
  if (indentIds.length === 0) {
    return { error: null, counts: {} };
  }
  const uniqueIds = [...new Set(indentIds.filter(Boolean))];
  const rows: Array<{ indent_id: string }> = [];
  for (let i = 0; i < uniqueIds.length; i += 40) {
    const chunk = uniqueIds.slice(i, i + 40);
    const { data, error } = await supabase()
      .from('direct_quotes')
      .select('indent_id')
      .in('indent_id', chunk);

    if (error) return { error: new Error(error.message), counts: {} };
    rows.push(...((data ?? []) as Array<{ indent_id: string }>));
  }
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const id = row.indent_id;
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return { error: null, counts };
}

/**
 * Update a direct quote's status (accept one, reject others).
 * RLS: caller must be indent owner.
 */
export async function updateDirectQuoteStatus(
  quoteId: string,
  status: 'accepted' | 'rejected'
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('direct_quotes')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteId);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Owner counter-offer on a pending direct quote.
 * Persists counter_amount; status remains pending so award still works.
 * RLS: indent owner (existing UPDATE policy).
 */
export async function submitDirectQuoteCounterOffer(
  quoteId: string,
  counterAmount: number,
): Promise<{ error: Error | null }> {
  const amount = Number(counterAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: new Error('Counter offer must be a positive amount.') };
  }
  const { data, error } = await supabase()
    .from('direct_quotes')
    .update({
      counter_amount: amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) return { error: new Error(error.message) };
  if (!data?.id) {
    return {
      error: new Error(
        'Could not send counter offer (quote not pending or permission denied).',
      ),
    };
  }
  return { error: null };
}

/**
 * Fetch accepted direct quote for a single indent (supplier deploy — fresh read).
 */
export async function getAcceptedDirectQuoteForIndent(
  bidderOrgId: string,
  indentId: string,
): Promise<{ error: Error | null; quote: DirectQuoteRow | null }> {
  const { data, error } = await supabase()
    .from('direct_quotes')
    .select('*')
    .eq('bidder_organization_id', bidderOrgId)
    .eq('indent_id', indentId)
    .eq('status', 'accepted')
    .maybeSingle();

  if (error) return { error: new Error(error.message), quote: null };
  return { error: null, quote: (data as DirectQuoteRow | null) ?? null };
}

/**
 * Used by finance aggregation to show supplier due amounts before a trip is created
 * (indent awarded state). Returns minimal shape for O(n) aggregation.
 * Query: direct_quotes WHERE status='accepted' AND indent_id IN (indents owned by orgId).
 */
export async function getAcceptedDirectQuotesByOrg(
  orgId: string
): Promise<{ error: Error | null; quotes: DirectQuoteRow[] }> {
  // Supabase client does not support subquery-in-clause directly.
  // Use a join: select from direct_quotes joining indents on organization_id.
  const { data, error } = await supabase()
    .from('direct_quotes')
    .select('*, indents!inner(organization_id)')
    .eq('status', 'accepted')
    .eq('indents.organization_id', orgId);

  if (error) return { error: new Error(error.message), quotes: [] };
  return { error: null, quotes: (data ?? []) as DirectQuoteRow[] };
}

/**
 * Update driver and vehicle assignment on an accepted quote (supplier only).
 * Used before creating trip from quote; RLS: caller must be member of bidder_organization_id.
 * O(1) single-row update. Allow driverId = null for ad hoc (OTP) path.
 */
export async function updateDirectQuoteAssignment(
  quoteId: string,
  driverId: string | null,
  vehicleId: string | null
): Promise<{ error: Error | null }> {
  const { data, error } = await supabase()
    .from('direct_quotes')
    .update({
      driver_id: driverId ?? null,
      vehicle_id: vehicleId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteId)
    .select('id')
    .maybeSingle();

  if (error) return { error: new Error(error.message) };
  if (!data?.id) {
    return {
      error: new Error(
        'Could not update quote assignment (no matching quote or permission denied).',
      ),
    };
  }
  return { error: null };
}

