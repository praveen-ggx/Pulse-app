/**
 * Hydrates a NetworkProfileNode-shaped snapshot for a target organization.
 *
 * Used whenever the profile modal is opened from a sparse data source
 * (e.g. a mutual-connection row that only carries id + name + avatar_seed).
 * The caller should optimistically open the modal with whatever it has, then
 * patch the selected node with the snapshot returned here so the user sees the
 * actual organization's role, location, mutuals, rating, phone and integration
 * status instead of placeholder defaults.
 */
import {
  getLinkedOrgProfilesBatch,
  type OrgDisplayProfile,
} from "@/features/clients/services/clients.service";
import { supabase } from "@/lib/supabase";

export type NetworkProfileSnapshotRole = "CLIENT" | "SUPPLIER" | "DRIVER";
export type NetworkProfileSnapshotStatus = "CONNECTED" | "REQUEST SENT" | "LIVE";

export type NetworkProfileSnapshot = {
  id: string;
  name: string;
  type: NetworkProfileSnapshotRole;
  location: string;
  status: NetworkProfileSnapshotStatus;
  rating: number | null;
  /** Unique approved orgs connected to both viewer and target. Null = fetch failed. */
  mutuals: number | null;
  phone: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
  is_integrated: boolean;
  /** Admin / KYC verified (`organizations.verification_status = verified`). */
  is_kyc_verified: boolean;
  /** Enriched fields shown in public profile */
  registered_address: string | null;
  branch_count: number;
  sector: string | null;
  website: string | null;
  gstin: string | null;
  operating_model: string | null;
  total_trips: number;
  member_since_year: number | null;
  /** Fleet asset vehicles owned by the partner organization. */
  vehicle_count: number;
  /** Indents the partner has shared/broadcast to the Pulse network. */
  indent_count: number;
};

type OrganizationSnapshotRow = {
  id: string;
  name: string;
  avatar_seed: string | null;
  logo_url: string | null;
  city: string | null;
  state: string | null;
  address_line: string | null;
  owner_id: string | null;
  profile_sector: string | null;
  profile_website: string | null;
  gstin: string | null;
  operating_model: string | null;
  created_at: string | null;
  verification_status: string | null;
};

type PartnerDisplayBatchRow = {
  organizationName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  tripCount?: number | null;
  averageRating?: number | null;
  orgCreatedAt?: string | null;
  ownerSignedUpAt?: string | null;
  verificationStatus?: string | null;
  vehicleCount?: number | null;
  networkIndentCount?: number | null;
};

type PartnerDisplaySingleRow = {
  organizationName?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  gstin?: string | null;
  address?: string | null;
  website?: string | null;
  orgCreatedAt?: string | null;
  ownerSignedUpAt?: string | null;
  verificationStatus?: string | null;
  tripCount?: number | null;
  averageRating?: number | null;
  ratingCount?: number | null;
  vehicleCount?: number | null;
  networkIndentCount?: number | null;
};

function isKycVerifiedStatus(value: string | null | undefined): boolean {
  return String(value ?? "")
    .trim()
    .toLowerCase() === "verified";
}

function yearFromTimestamp(iso: string | null | undefined): number | null {
  if (!iso?.trim()) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  return Number.isFinite(year) ? year : null;
}

function resolveMemberSinceYear(
  orgRow: OrganizationSnapshotRow,
  partnerBatch: PartnerDisplayBatchRow | null,
  partnerProfile: PartnerDisplaySingleRow | null,
): number | null {
  return (
    yearFromTimestamp(partnerBatch?.ownerSignedUpAt) ??
    yearFromTimestamp(partnerProfile?.ownerSignedUpAt) ??
    yearFromTimestamp(partnerBatch?.orgCreatedAt) ??
    yearFromTimestamp(partnerProfile?.orgCreatedAt) ??
    yearFromTimestamp(orgRow.created_at)
  );
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function orgDisplayToPartnerBatchRow(
  profile: OrgDisplayProfile | undefined,
): PartnerDisplayBatchRow | null {
  if (!profile) return null;
  return {
    organizationName: profile.organizationName,
    phone: profile.phone,
    avatarUrl: profile.avatarUrl ?? profile.logoUrl ?? null,
    avatarSeed: profile.avatarSeed ?? profile.orgAvatarSeed ?? null,
    tripCount: profile.tripCount ?? null,
    averageRating: profile.averageRating ?? null,
    orgCreatedAt: profile.orgCreatedAt ?? null,
    ownerSignedUpAt: profile.ownerSignedUpAt ?? null,
    verificationStatus: profile.verificationStatus ?? null,
    vehicleCount: profile.vehicleCount ?? null,
    networkIndentCount: profile.networkIndentCount ?? null,
  };
}

export type OrgProfileSnapshotOptions = {
  /** When the linked-org bootstrap cache already has this partner, skip the batch RPC. */
  partnerProfile?: OrgDisplayProfile | null;
};

/** Instant hero snapshot from the same partner-display payload other pages prefetch. */
export function snapshotFromPartnerDisplay(
  targetOrgId: string,
  profile: OrgDisplayProfile,
): NetworkProfileSnapshot {
  const year =
    yearFromTimestamp(profile.ownerSignedUpAt) ??
    yearFromTimestamp(profile.orgCreatedAt);
  return {
    id: targetOrgId,
    name: nonEmptyString(profile.organizationName) ?? "Organization",
    type: "SUPPLIER",
    location: formatLocation(null, null, null),
    status: "LIVE",
    rating:
      typeof profile.averageRating === "number" ? profile.averageRating : null,
    mutuals: null,
    phone: nonEmptyString(profile.phone),
    avatar_url:
      nonEmptyString(profile.avatarUrl) ?? nonEmptyString(profile.logoUrl),
    avatar_seed:
      nonEmptyString(profile.avatarSeed) ?? nonEmptyString(profile.orgAvatarSeed),
    is_integrated: false,
    is_kyc_verified: isKycVerifiedStatus(profile.verificationStatus),
    registered_address: null,
    branch_count: 0,
    sector: null,
    website: null,
    gstin: null,
    operating_model: null,
    total_trips: typeof profile.tripCount === "number" ? profile.tripCount : 0,
    member_since_year: year,
    vehicle_count:
      typeof profile.vehicleCount === "number" ? profile.vehicleCount : 0,
    indent_count:
      typeof profile.networkIndentCount === "number"
        ? profile.networkIndentCount
        : 0,
  };
}

export function memberSinceYearFromIso(
  iso: string | null | undefined,
): number | null {
  return yearFromTimestamp(iso);
}

async function loadOrganizationRow(
  targetOrgId: string,
): Promise<{ error: Error | null; row: OrganizationSnapshotRow | null }> {
  const orgWithLogo = await supabase()
    .from("organizations")
    .select(
      "id, name, avatar_seed, logo_url, city, state, address_line, owner_id, profile_sector, profile_website, gstin, operating_model, created_at, verification_status",
    )
    .eq("id", targetOrgId)
    .maybeSingle();

  if (orgWithLogo.error && isMissingColumnError(orgWithLogo.error.message)) {
    const fallback = await supabase()
      .from("organizations")
      .select("id, name, avatar_seed, city, state, address_line, owner_id")
      .eq("id", targetOrgId)
      .maybeSingle();
    if (fallback.error) {
      return { error: new Error(fallback.error.message), row: null };
    }
    if (!fallback.data) return { error: null, row: null };
    return {
      error: null,
      row: {
        ...(fallback.data as {
          id: string;
          name: string;
          avatar_seed: string | null;
          city: string | null;
          state: string | null;
          address_line: string | null;
          owner_id: string | null;
        }),
        logo_url: null,
        profile_sector: null,
        profile_website: null,
        gstin: null,
        operating_model: null,
        created_at: null,
        verification_status: null,
      },
    };
  }

  if (orgWithLogo.error) {
    return { error: new Error(orgWithLogo.error.message), row: null };
  }

  return {
    error: null,
    row: orgWithLogo.data ? (orgWithLogo.data as OrganizationSnapshotRow) : null,
  };
}

function buildOrganizationRowFromPartnerDisplay(
  targetOrgId: string,
  batchRow: PartnerDisplayBatchRow | null,
  singleRow: PartnerDisplaySingleRow | null,
): OrganizationSnapshotRow | null {
  if (!batchRow && !singleRow) return null;

  return {
    id: targetOrgId,
    name:
      nonEmptyString(singleRow?.organizationName) ??
      nonEmptyString(batchRow?.organizationName) ??
      "Organization",
    avatar_seed: nonEmptyString(singleRow?.avatarSeed) ?? nonEmptyString(batchRow?.avatarSeed),
    logo_url: nonEmptyString(singleRow?.avatarUrl) ?? nonEmptyString(batchRow?.avatarUrl),
    city: null,
    state: null,
    address_line: nonEmptyString(singleRow?.address),
    owner_id: null,
    profile_sector: null,
    profile_website: nonEmptyString(singleRow?.website),
    gstin: nonEmptyString(singleRow?.gstin),
    operating_model: null,
    created_at: null,
    verification_status:
      nonEmptyString(singleRow?.verificationStatus) ??
      nonEmptyString(batchRow?.verificationStatus),
  };
}

function formatLocation(
  city: string | null | undefined,
  state: string | null | undefined,
  addressLine: string | null | undefined,
): string {
  const cs = [city, state]
    .map((v) => v?.trim() ?? "")
    .filter((v) => v.length > 0)
    .join(", ")
    .trim();
  if (cs) return cs;
  const fallback = addressLine?.trim() ?? "";
  return fallback || "Not available";
}

function isMissingColumnError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /does not exist|undefined column|undefined_table|undefined_function/i.test(
    message,
  );
}

export async function getOrgProfileSnapshot(
  viewerOrgId: string,
  targetOrgId: string,
  options?: OrgProfileSnapshotOptions,
): Promise<{ error: Error | null; snapshot: NetworkProfileSnapshot | null }> {
  if (!viewerOrgId || !targetOrgId) {
    return { error: null, snapshot: null };
  }

  const connectionSelect =
    "status, from_organization_id, to_organization_id, request_shipper_client, request_carrier_supplier";

  const seededPartner = options?.partnerProfile ?? null;
  const [
    partnerProfiles,
    orgLoadRes,
    connFwdRes,
    connRevRes,
    clientLinkRes,
    supplierLinkRes,
    locationsRes,
  ] = await Promise.all([
    seededPartner
      ? Promise.resolve({ [targetOrgId]: seededPartner })
      : getLinkedOrgProfilesBatch([targetOrgId]),
    loadOrganizationRow(targetOrgId),
    supabase()
      .from("connection_requests")
      .select(connectionSelect)
      .eq("from_organization_id", viewerOrgId)
      .eq("to_organization_id", targetOrgId)
      .maybeSingle(),
    supabase()
      .from("connection_requests")
      .select(connectionSelect)
      .eq("from_organization_id", targetOrgId)
      .eq("to_organization_id", viewerOrgId)
      .maybeSingle(),
    supabase()
      .from("clients")
      .select("id, name")
      .eq("organization_id", viewerOrgId)
      .eq("linked_organization_id", targetOrgId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle(),
    supabase()
      .from("suppliers")
      .select("id")
      .eq("organization_id", viewerOrgId)
      .eq("linked_organization_id", targetOrgId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle(),
    supabase()
      .from("organization_locations")
      .select("id, location_type, address_line, city, state")
      .eq("organization_id", targetOrgId)
      .order("sort_order", { ascending: true }),
  ]);

  const connRes = { data: connFwdRes.data ?? connRevRes.data };

  const partnerBatch = orgDisplayToPartnerBatchRow(partnerProfiles[targetOrgId]);

  let partnerProfile: PartnerDisplaySingleRow | null = null;
  const hasSession = partnerBatch
    ? true
    : Boolean((await supabase().auth.getSession()).data.session?.access_token);
  // Batch returns {} without a session; don't fall back to the single RPC as anon (42501).
  if (!partnerBatch && hasSession) {
    const partnerProfileRes = await supabase().rpc("get_connection_partner_display", {
      p_linked_organization_id: targetOrgId,
    });
    partnerProfile = partnerProfileRes.error
      ? null
      : ((partnerProfileRes.data ?? null) as PartnerDisplaySingleRow | null);
  }

  let orgRow =
    orgLoadRes.row ??
    buildOrganizationRowFromPartnerDisplay(targetOrgId, partnerBatch, partnerProfile);

  if (!orgRow) {
    return { error: orgLoadRes.error, snapshot: null };
  }

  const partnerSignupAt =
    nonEmptyString(partnerBatch?.ownerSignedUpAt) ??
    nonEmptyString(partnerProfile?.ownerSignedUpAt) ??
    nonEmptyString(partnerBatch?.orgCreatedAt) ??
    nonEmptyString(partnerProfile?.orgCreatedAt);
  if (!orgRow.created_at && partnerSignupAt) {
    orgRow = { ...orgRow, created_at: partnerSignupAt };
  }

  const partnerVerificationStatus =
    nonEmptyString(partnerBatch?.verificationStatus) ??
    nonEmptyString(partnerProfile?.verificationStatus);
  if (!orgRow.verification_status && partnerVerificationStatus) {
    orgRow = { ...orgRow, verification_status: partnerVerificationStatus };
  }

  const phone =
    nonEmptyString(partnerBatch?.phone) ?? nonEmptyString(partnerProfile?.phone);
  const ownerAvatarUrl =
    nonEmptyString(partnerBatch?.avatarUrl) ?? nonEmptyString(partnerProfile?.avatarUrl);
  const partnerTripCount =
    typeof partnerBatch?.tripCount === "number"
      ? partnerBatch.tripCount
      : typeof partnerProfile?.tripCount === "number"
        ? partnerProfile.tripCount
        : null;
  const partnerRating =
    typeof partnerBatch?.averageRating === "number"
      ? partnerBatch.averageRating
      : typeof partnerProfile?.averageRating === "number"
        ? partnerProfile.averageRating
        : null;

  let status: NetworkProfileSnapshotStatus = "LIVE";
  let isIntegrated = false;
  if (connRes.data) {
    const row = connRes.data as { status?: string | null };
    const s = String(row.status ?? "").toLowerCase();
    if (s === "approved") {
      status = "CONNECTED";
      isIntegrated = true;
    } else if (s === "pending") {
      status = "REQUEST SENT";
    }
  }
  // A live client/supplier link is the actual integration, even when the
  // connection_request row is missing or still pending (e.g. admin-linked).
  if (clientLinkRes.data?.id || supplierLinkRes.data?.id) {
    isIntegrated = true;
    if (status !== "REQUEST SENT") status = "CONNECTED";
  }

  let role: NetworkProfileSnapshotRole = "SUPPLIER";
  if (clientLinkRes.data?.id) {
    role = "CLIENT";
  } else if (supplierLinkRes.data?.id) {
    role = "SUPPLIER";
  }

  const resolvedLogoUrl =
    orgRow.logo_url && orgRow.logo_url.trim().length > 0
      ? orgRow.logo_url
      : null;
  const resolvedAvatarUrl = resolvedLogoUrl ?? ownerAvatarUrl;

  let branchCount = 0;
  let registeredAddress: string | null = null;
  if (!locationsRes.error && Array.isArray(locationsRes.data)) {
    branchCount = locationsRes.data.length;
    const regOff = (
      locationsRes.data as Array<{
        location_type: string;
        address_line: string | null;
        city: string | null;
        state: string | null;
      }>
    ).find((l) => l.location_type === "registered_office");
    if (regOff) {
      registeredAddress =
        [regOff.address_line, regOff.city, regOff.state]
          .filter(Boolean)
          .join(", ") || null;
    }
  }
  if (!registeredAddress && orgRow.address_line?.trim()) {
    registeredAddress = orgRow.address_line.trim();
  } else if (!registeredAddress) {
    registeredAddress = nonEmptyString(partnerProfile?.address);
  }

  const sector = orgRow.profile_sector?.trim() || null;
  const website =
    orgRow.profile_website?.trim() || nonEmptyString(partnerProfile?.website);
  const gstin = orgRow.gstin?.trim() || nonEmptyString(partnerProfile?.gstin);
  const operatingModel = orgRow.operating_model?.trim() || null;

  const totalTrips = partnerTripCount ?? 0;

  const vehicleCount =
    typeof partnerBatch?.vehicleCount === "number"
      ? partnerBatch.vehicleCount
      : typeof partnerProfile?.vehicleCount === "number"
        ? partnerProfile.vehicleCount
        : 0;
  const indentCount =
    typeof partnerBatch?.networkIndentCount === "number"
      ? partnerBatch.networkIndentCount
      : typeof partnerProfile?.networkIndentCount === "number"
        ? partnerProfile.networkIndentCount
        : 0;

  const rating = partnerRating;

  const snapshot: NetworkProfileSnapshot = {
    id: orgRow.id,
    name: orgRow.name,
    type: role,
    location:
      formatLocation(orgRow.city, orgRow.state, orgRow.address_line) !==
      "Not available"
        ? formatLocation(orgRow.city, orgRow.state, orgRow.address_line)
        : nonEmptyString(partnerProfile?.address) ?? "Not available",
    status,
    rating,
    mutuals: null,
    phone,
    avatar_url: resolvedAvatarUrl,
    avatar_seed: orgRow.avatar_seed,
    is_integrated: isIntegrated,
    is_kyc_verified: isKycVerifiedStatus(orgRow.verification_status),
    registered_address: registeredAddress,
    branch_count: branchCount,
    sector,
    website,
    gstin,
    operating_model: operatingModel,
    total_trips: totalTrips,
    member_since_year: resolveMemberSinceYear(orgRow, partnerBatch, partnerProfile),
    vehicle_count: vehicleCount,
    indent_count: indentCount,
  };

  return { error: null, snapshot };
}
