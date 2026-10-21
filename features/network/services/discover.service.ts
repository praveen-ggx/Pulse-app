/**
 * Discover service — search organizations outside your current network.
 */
import { isOrgKycVerified } from '@/features/network/utils/orgVerification.util';
import { pickOrgAvatarStorageRef } from '@/features/network/utils/orgAvatarRef.util';
import { supabase } from '@/lib/supabase';

function parseRating(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Merge partner-display fields (logo, KYC, stats) onto discover_organizations rows.
 * Profiles come from the canonical linked-org cache (one batch RPC for missing IDs).
 */
export function applyPartnerDisplayToDiscoverOrgs(
  orgs: DiscoverOrg[],
  profiles: Record<
    string,
    {
      avatarUrl?: string | null;
      logoUrl?: string | null;
      avatarSeed?: string | null;
      verificationStatus?: string | null;
      averageRating?: number | string | null;
      tripCount?: number | string | null;
      ratingCount?: number | string | null;
      orgCreatedAt?: string | null;
      phone?: string | null;
      vehicleCount?: number | string | null;
      networkIndentCount?: number | string | null;
    }
  >,
): DiscoverOrg[] {
  if (orgs.length === 0) return orgs;

  return orgs.map((org) => {
    const row = profiles[org.id];
    const batchUrl =
      pickOrgAvatarStorageRef(row?.logoUrl, row?.avatarUrl) ??
      (row?.avatarUrl ?? "").trim();
    const batchSeed = (row?.avatarSeed ?? "").trim();
    const verificationStatus =
      (
        row?.verificationStatus ??
        org.verification_status ??
        ""
      )
        .toString()
        .trim() || null;
    const batchRating = parseRating(row?.averageRating);
    const orgRating = parseRating(org.average_rating ?? org.rating);
    const rating = batchRating ?? orgRating;
    const tripCount =
      parseCount(row?.tripCount) ?? parseCount(org.trip_count);
    const ratingCount = parseCount(row?.ratingCount) ?? parseCount(org.rating_count);
    const orgCreatedAt =
      parseTimestamp(row?.orgCreatedAt) ?? parseTimestamp(org.org_created_at);
    const phone =
      (typeof row?.phone === "string" ? row.phone.trim() : "") ||
      org.phone ||
      null;
    const vehicleCount =
      parseCount(row?.vehicleCount) ?? parseCount(org.vehicle_count);
    const networkIndentCount =
      parseCount(row?.networkIndentCount) ?? parseCount(org.network_indent_count);
    return {
      ...org,
      avatar_url: (org.avatar_url ?? "").trim() || batchUrl || null,
      avatar_seed: (org.avatar_seed ?? "").trim() || batchSeed || org.avatar_seed,
      verification_status: verificationStatus,
      is_kyc_verified: isOrgKycVerified({
        verification_status: verificationStatus,
        is_kyc_verified: org.is_kyc_verified,
      }),
      average_rating: rating,
      rating,
      trip_count: tripCount,
      rating_count: ratingCount,
      org_created_at: orgCreatedAt,
      phone,
      vehicle_count: vehicleCount,
      network_indent_count: networkIndentCount,
    };
  });
}

export interface DiscoverOrg {
  id: string;
  name: string;
  avatar_seed: string | null;
  /** Org logo or owner profile photo — same resolution as chat / connection cards. */
  avatar_url?: string | null;
  /** Optional profile role from RPC, used to hide drivers in Discover. */
  profile_role?: string | null;
  /** Counterparty operating model (ASSET_BASED / NON_ASSET / HYBRID) for connect-role gating. */
  operating_model?: string | null;
  /** From organizations — RPC discover_organizations returns these for card location. */
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  location?: string | null;
  business_location?: string | null;
  headquarters?: string | null;
  mutual_count?: number | null;
  mutual_connections_count?: number | null;
  rating?: number | null;
  average_rating?: number | null;
  trip_count?: number | null;
  rating_count?: number | null;
  vehicle_count?: number | null;
  network_indent_count?: number | null;
  phone?: string | null;
  org_created_at?: string | null;
  lane_overlap_count?: number | null;
  recommendation_score?: number | null;
  is_in_user_trip_city?: boolean | null;
  connection_status: 'none' | 'pending' | 'approved' | 'rejected' | string;
  /** Admin KYC status from discover RPC / partner display enrichment. */
  verification_status?: string | null;
  /** True when `verification_status === 'verified'`. */
  is_kyc_verified?: boolean;
}

export async function discoverOrganizations(
  orgId: string,
  search = '',
  limit = 20,
  offset = 0,
): Promise<{ error: Error | null; orgs: DiscoverOrg[] }> {
  const cappedLimit = Math.min(Math.max(limit, 1), 40);
  const { data, error } = await supabase().rpc('discover_organizations', {
    p_org_id: orgId,
    p_search: search,
    p_limit: cappedLimit,
    p_offset: Math.max(offset, 0),
  });

  if (error) return { error: new Error(error.message), orgs: [] };
  const raw = ((data ?? []) as DiscoverOrg[]).map((org) => {
    const verificationStatus =
      (org.verification_status ?? "").toString().trim() || null;
    return {
      ...org,
      verification_status: verificationStatus,
      is_kyc_verified: isOrgKycVerified({
        verification_status: verificationStatus,
        is_kyc_verified: org.is_kyc_verified,
      }),
    };
  });
  return { error: null, orgs: raw };
}
