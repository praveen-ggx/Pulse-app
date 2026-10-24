/**
 * Suppliers service — Supabase only (mobile). Same DB as pulse-unified-base.
 */
import { DEFAULT_PAGE_SIZE, type PageOpts } from '@/lib/pagination';
import { syncDomainRows } from '@/lib/cache/domainSync';
import { mergeDeltaRows } from '@/lib/cache/mergeDelta';
import type { DeltaResponse } from '@/lib/cache/deltaTypes';
import { enrichConnectionPartnerAvatars } from '@/lib/enrichConnectionPartnerAvatars';
import { isIntegratedSupplierRow } from '@/features/trips/visibility/tripVisibility';
import { supabase } from '@/lib/supabase';
import {
  SAME_ORG_SUPPLIER_MESSAGE,
  phoneBelongsToActiveOrgMember,
} from '@/lib/sameOrgPartyGuard';

export interface SupplierRow {
  id: string;
  organization_id: string;
  name: string | null;
  /** @deprecated Use contact_person instead */
  contact: string | null;
  /** @deprecated Use name instead */
  company_name: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  pan_number: string | null;
  cin: string | null;
  msme_number: string | null;
  tan_number: string | null;
  iec_number: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  /** integrated = platform-linked; offline | marketplace = not. */
  supplier_type?: 'integrated' | 'offline' | 'marketplace';
  /** Optional convenience flag mirroring `supplier_type === 'integrated'`; may be
   *  populated by profile-enriched queries (parallels `ClientRow.is_integrated`). */
  is_integrated?: boolean;
  /** When set, this supplier is another platform org (for shared ledger / compare & verify). */
  linked_organization_id?: string | null;
  /** Avatar for the linked org, populated by `get_suppliers_with_profiles`.
   *  Resolution priority: `organizations.logo_url` (org branding) →
   *  `profiles.avatar_url` (owner's personal avatar) → null (let the UI
   *  render initials from the name + avatar_seed). */
  avatar_url?: string | null;
  avatar_seed?: string | null;
  owner_full_name?: string | null;
  vehicle_types?: string[] | null;
  operating_areas?: string[] | null;
  /** North, South, East, or West. Null when the partner has not chosen one. */
  primary_region?: string | null;
  onboarding_agreement_status?: 'pending' | 'draft' | 'signed' | 'expired' | 'terminated' | null;
  onboarding_agreement_signed_at?: string | null;
  onboarding_agreement_storage_path?: string | null;
  onboarding_agreement_notes?: string | null;
}

const SUPPLIER_CORE_COLUMNS = [
  "id", "organization_id", "name", "contact_person",
  "phone", "email", "address", "gstin", "pan_number", "cin", "msme_number", "tan_number", "iec_number", "is_active", "is_verified",
  "created_at", "updated_at", "supplier_type", "linked_organization_id",
  "avatar_url", "avatar_seed", "owner_full_name",
  "vehicle_types", "operating_areas",
].join(",");

const SUPPLIER_ONBOARDING_COLUMNS = [
  "onboarding_agreement_status",
  "onboarding_agreement_signed_at",
  "onboarding_agreement_storage_path",
  "onboarding_agreement_notes",
].join(",");

const SUPPLIER_COLUMNS = `${SUPPLIER_CORE_COLUMNS},${SUPPLIER_ONBOARDING_COLUMNS}`;

function isMissingOnboardingColumnError(message: string): boolean {
  return /onboarding_agreement_/i.test(message) && /does not exist/i.test(message);
}

const SUPPLIER_PRIMARY_REGIONS = ["North", "South", "East", "West"] as const;
export type SupplierPrimaryRegion = (typeof SUPPLIER_PRIMARY_REGIONS)[number];

export function isSupplierPrimaryRegion(value: string | null | undefined): value is SupplierPrimaryRegion {
  return SUPPLIER_PRIMARY_REGIONS.includes(value as SupplierPrimaryRegion);
}

/** Column value when present, otherwise the region stored on operating areas. */
export function readSupplierPrimaryRegion(
  row: { primary_region?: string | null; operating_areas?: string[] | null } | null | undefined,
): string | null {
  if (isSupplierPrimaryRegion(row?.primary_region)) return row.primary_region;
  return (row?.operating_areas ?? []).find((area) => isSupplierPrimaryRegion(area)) ?? null;
}

function operatingAreasWithPrimaryRegion(
  areas: string[] | null | undefined,
  region: string | null,
): string[] {
  const rest = (areas ?? []).filter((area) => !isSupplierPrimaryRegion(area));
  return region && isSupplierPrimaryRegion(region) ? [region, ...rest] : rest;
}

function isMissingPrimaryRegionColumnError(message: string): boolean {
  return /primary_region/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

function withDefaultOnboardingFields(row: SupplierRow): SupplierRow {
  return {
    ...row,
    onboarding_agreement_status: row.onboarding_agreement_status ?? "pending",
    onboarding_agreement_signed_at: row.onboarding_agreement_signed_at ?? null,
    onboarding_agreement_storage_path: row.onboarding_agreement_storage_path ?? null,
    onboarding_agreement_notes: row.onboarding_agreement_notes ?? null,
  };
}

export async function getSuppliersByOrganization(
  orgId: string,
  opts?: PageOpts
): Promise<{ error: Error | null; suppliers: SupplierRow[]; hasMore?: boolean }> {
  try {
    // Try optimized RPC first
    const { data, error: rpcError } = await supabase().rpc('get_suppliers_with_profiles', {
      p_org_id: orgId,
    });

    if (!rpcError && data) {
      const raw = (data ?? []) as unknown as SupplierRow[];
      if (opts != null) {
        const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
        const offset = opts.offset ?? 0;
        const hasMore = raw.length > offset + limit;
        return { error: null, suppliers: raw.slice(offset, offset + limit), hasMore };
      }
      return { error: null, suppliers: raw };
    }
    if (rpcError && __DEV__) {
      console.warn('[getSuppliersByOrganization] RPC failed, falling back to select:', rpcError.message);
    }
  } catch (e) {
    if (__DEV__) console.warn('[getSuppliersByOrganization] RPC exception:', e);
  }

  // Fallback to standard select if RPC fails or is missing
  const base = (columns: string) =>
    supabase()
      .from('suppliers')
      .select(columns)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

  if (opts != null) {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    let { data, error } = await base(SUPPLIER_COLUMNS).range(offset, offset + limit);
    if (error && isMissingOnboardingColumnError(error.message)) {
      ({ data, error } = await base(SUPPLIER_CORE_COLUMNS).range(offset, offset + limit));
    }
    if (error) return { error: new Error(error.message), suppliers: [] };
    const raw = ((data ?? []) as unknown as SupplierRow[]).map(withDefaultOnboardingFields);
    const hasMore = raw.length > limit;
    const page = hasMore ? raw.slice(0, limit) : raw;
    return {
      error: null,
      suppliers: await enrichConnectionPartnerAvatars(
        orgId,
        page,
        'get_suppliers_with_profiles',
      ),
      hasMore,
    };
  }
  let { data, error } = await base(SUPPLIER_COLUMNS);
  if (error && isMissingOnboardingColumnError(error.message)) {
    ({ data, error } = await base(SUPPLIER_CORE_COLUMNS));
  }
  if (error) return { error: new Error(error.message), suppliers: [] };
  const rows = ((data ?? []) as unknown as SupplierRow[]).map(withDefaultOnboardingFields);
  return {
    error: null,
    suppliers: await enrichConnectionPartnerAvatars(
      orgId,
      rows,
      'get_suppliers_with_profiles',
    ),
  };
}

export async function getSuppliersDelta(
  orgId: string,
  since: { updatedAt: string; tieBreakerId?: string | null },
): Promise<{ error: Error | null; delta: DeltaResponse<SupplierRow> }> {
  // Reuse clients delta RPC shape if suppliers RPC is not yet deployed.
  const { data, error } = await supabase().rpc('get_suppliers_delta', {
    p_org_id: orgId,
    p_since: since.updatedAt,
    p_limit: 1000,
  });
  if (error) return { error: new Error(error.message), delta: { changed: [], deletedIds: [], nextCursor: since } };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { changed?: SupplierRow[]; deleted_ids?: string[]; next_cursor?: string | null }
    | null;
  return {
    error: null,
    delta: {
      changed: (row?.changed ?? []) as SupplierRow[],
      deletedIds: (row?.deleted_ids ?? []) as string[],
      nextCursor: row?.next_cursor ? { updatedAt: row.next_cursor } : since,
    },
  };
}

export async function syncSuppliersWithCache(orgId: string, currentRows: SupplierRow[]) {
  try {
    const suppliers = await syncDomainRows<SupplierRow>({
      domain: 'suppliers',
      orgId,
      schemaVersion: '1',
      policy: { maxDeltaLagMs: 5 * 60_000, fullSyncEveryMs: 8 * 60 * 60_000 },
      currentRows,
      getFull: async () => {
        const res = await getSuppliersByOrganization(orgId);
        if (res.error) throw res.error;
        return res.suppliers;
      },
      getDelta: async (cursor) => {
        const res = await getSuppliersDelta(orgId, cursor);
        if (res.error) throw res.error;
        return res.delta;
      },
      merge: (existing, delta) =>
        mergeDeltaRows({
          existing,
          changed: delta.changed,
          deletedIds: delta.deletedIds,
          compare: (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
        }),
    });
    const enriched = await enrichConnectionPartnerAvatars(
      orgId,
      suppliers,
      'get_suppliers_with_profiles',
    );
    return { error: null, suppliers: enriched };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), suppliers: currentRows };
  }
}

export async function getSupplierById(
  orgId: string,
  supplierId: string
): Promise<{ error: Error | null; supplier: SupplierRow | null }> {
  let { data, error } = await supabase()
    .from('suppliers')
    .select(`${SUPPLIER_COLUMNS},primary_region`)
    .eq('organization_id', orgId)
    .eq('id', supplierId)
    .maybeSingle();
  if (error && isMissingPrimaryRegionColumnError(error.message)) {
    ({ data, error } = await supabase()
      .from('suppliers')
      .select(SUPPLIER_COLUMNS)
      .eq('organization_id', orgId)
      .eq('id', supplierId)
      .maybeSingle());
  }
  if (error && isMissingOnboardingColumnError(error.message)) {
    ({ data, error } = await supabase()
      .from('suppliers')
      .select(SUPPLIER_CORE_COLUMNS)
      .eq('organization_id', orgId)
      .eq('id', supplierId)
      .maybeSingle());
  }
  if (error) return { error: new Error(error.message), supplier: null };
  if (data == null) return { error: null, supplier: null };
  return { error: null, supplier: withDefaultOnboardingFields(data as unknown as SupplierRow) };
}

/**
 * Fetch supplier for detail/edit with integrated logic: when supplier_type = 'integrated',
 * name/company_name/contact_person/phone/email are COALESCE from linked org's owner profile.
 * Use this for the supplier detail screen and edit form so the form is pre-filled.
 */
export async function getSupplierDetails(
  supplierId: string
): Promise<{ error: Error | null; supplier: SupplierRow | null }> {
  const { data, error } = await supabase().rpc('get_supplier_details', {
    p_supplier_id: supplierId,
  });
  if (error) return { error: new Error(error.message), supplier: null };
  if (data == null) return { error: null, supplier: null };
  return { error: null, supplier: data as unknown as SupplierRow };
}

function coalesceSupplierDisplayField(
  local: string | null | undefined,
  enriched: string | null | undefined,
): string | null {
  const localTrim = local?.trim();
  if (localTrim) return localTrim;
  const enrichedTrim = enriched?.trim();
  if (enrichedTrim) return enrichedTrim;
  return local ?? enriched ?? null;
}

/**
 * Merge display contact fields from `get_supplier_details` onto a full supplier row.
 * Local supplier row values take priority; enriched linked-org values fill gaps.
 */
export function mergeSupplierDisplayFields(
  base: SupplierRow,
  details: SupplierRow,
): SupplierRow {
  return {
    ...base,
    name: coalesceSupplierDisplayField(base.name, details.name),
    contact: coalesceSupplierDisplayField(base.contact, details.contact),
    company_name: coalesceSupplierDisplayField(base.company_name, details.company_name),
    contact_person: coalesceSupplierDisplayField(base.contact_person, details.contact_person),
    phone: coalesceSupplierDisplayField(base.phone, details.phone),
    email: coalesceSupplierDisplayField(base.email, details.email),
  };
}

/**
 * Fetch display profile (name, contact, phone, email, avatar) for a linked organization (supplier side).
 * Uses RPC get_connection_partner_display (SECURITY DEFINER) so we can read the other org's profile.
 */
export async function getLinkedOrgProfileForSupplier(
  linkedOrganizationId: string
): Promise<{
  error: Error | null;
  profile: {
    organizationName: string;
    contactPerson: string;
    phone: string;
    email: string;
    avatarUrl?: string;
    avatarSeed?: string;
    gstin?: string | null;
    address?: string | null;
    website?: string | null;
    verificationStatus?: string | null;
  } | null;
}> {
  const { data: sessionData } = await supabase().auth.getSession();
  // Anon EXECUTE is revoked; calling before session restore logs 42501.
  // Fail locally (not `profile: null`) so callers don't read it as "no profile".
  if (!sessionData.session?.access_token) {
    return { error: new Error('Not authenticated'), profile: null };
  }
  const { data, error } = await supabase().rpc('get_connection_partner_display', {
    p_linked_organization_id: linkedOrganizationId,
  });
  if (error) {
    return { error: new Error(error.message), profile: null };
  }
  if (data == null || typeof data !== 'object') {
    return { error: null, profile: null };
  }
  const raw = data as {
    organizationName?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    avatarUrl?: string;
    avatarSeed?: string;
    gstin?: string | null;
    address?: string | null;
    website?: string | null;
    verificationStatus?: string | null;
  };
  return {
    error: null,
    profile: {
      organizationName: (raw.organizationName ?? '').trim() || 'Connected',
      contactPerson: (raw.contactPerson ?? '').trim(),
      phone: (raw.phone ?? '').trim(),
      email: (raw.email ?? '').trim(),
      avatarUrl: (raw.avatarUrl ?? '').trim(),
      avatarSeed: (raw.avatarSeed ?? '').trim(),
      gstin: raw.gstin ?? null,
      address: raw.address ?? null,
      website: raw.website ?? null,
      verificationStatus: (raw.verificationStatus ?? '').trim() || null,
    },
  };
}

/** Create supplier payload — matches SupplierFormData from pulse-unified-base AddSupplierWizard */
export interface CreateSupplierData {
  /** Display name of the supplier company. Stored in suppliers.name (canonical). */
  name?: string;
  /** @deprecated Pass name instead */
  company_name?: string;
  contact_person?: string;
  phone: string;
  email?: string;
  address?: string;
  operating_areas?: string[];
  vehicle_types?: string[];
  supplier_type?: 'integrated' | 'offline' | 'marketplace';
}

export async function createSupplier(
  orgId: string,
  supplierData: CreateSupplierData
): Promise<{ error: Error | null; supplier: SupplierRow | null }> {
  // Service-layer backstop: never create an offline supplier representing an
  // ACTIVE member of this same org. Not DB-enforced — see lib/sameOrgPartyGuard.
  if (await phoneBelongsToActiveOrgMember(orgId, supplierData.phone)) {
    return { error: new Error(SAME_ORG_SUPPLIER_MESSAGE), supplier: null };
  }

  const displayName = (supplierData.name ?? supplierData.company_name ?? supplierData.contact_person ?? '').trim();
  const payload = {
    organization_id: orgId,
    name: displayName,
    contact_person: supplierData.contact_person ?? null,
    phone: (supplierData.phone ?? '').trim(),
    email: (supplierData.email ?? '').trim() || null,
    address: (supplierData.address ?? '').trim() || null,
    is_active: true,
    is_verified: false,
    operating_areas: Array.isArray(supplierData.operating_areas) ? supplierData.operating_areas : [],
    vehicle_types: Array.isArray(supplierData.vehicle_types) ? supplierData.vehicle_types : [],
    supplier_type: supplierData.supplier_type ?? 'offline',
  };
  const { data, error } = await supabase()
    .from('suppliers')
    .insert(payload as Record<string, unknown>)
    .select()
    .single();
  if (error) return { error: new Error(error.message), supplier: null };
  return { error: null, supplier: data as unknown as SupplierRow };
}

export interface UpdateSupplierData {
  /** Display name. Writes to suppliers.name (canonical). */
  name?: string;
  /** @deprecated Use name instead */
  company_name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  pan_number?: string;
  cin?: string;
  msme_number?: string;
  tan_number?: string;
  iec_number?: string;
  vehicle_types?: string[];
  operating_areas?: string[];
  primary_region?: "North" | "South" | "East" | "West" | null;
}

export async function updateSupplier(
  orgId: string,
  supplierId: string,
  patch: UpdateSupplierData,
  options?: { allowIntegratedIdentity?: boolean },
): Promise<{ error: Error | null; supplier: SupplierRow | null }> {
  const touchesIdentity =
    patch.name !== undefined ||
    patch.company_name !== undefined ||
    patch.contact_person !== undefined ||
    patch.phone !== undefined ||
    patch.email !== undefined;

  if (touchesIdentity && !options?.allowIntegratedIdentity) {
    const { data: existing, error: existingError } = await supabase()
      .from("suppliers")
      .select("id, supplier_type, linked_organization_id")
      .eq("organization_id", orgId)
      .eq("id", supplierId)
      .maybeSingle();
    if (existingError) {
      return { error: new Error(existingError.message), supplier: null };
    }
    if (
      existing &&
      isIntegratedSupplierRow(
        existing as Pick<SupplierRow, "supplier_type" | "linked_organization_id">,
      )
    ) {
      return {
        error: new Error(
          "Name, phone, email, and contact person are managed by the connected supplier account and cannot be edited.",
        ),
        supplier: null,
      };
    }
  }

  const updates: Record<string, unknown> = {};
  // Resolve display name: accept either `name` or deprecated `company_name`
  const incomingName = patch.name ?? patch.company_name;
  if (incomingName !== undefined) {
    const resolved = incomingName.trim() || (patch.contact_person ?? '').trim() || '';
    updates.name = resolved;
  } else if (patch.contact_person !== undefined) {
    // contact_person changed but no explicit name — derive name from contact if name was empty
    updates.name = (patch.contact_person ?? '').trim();
  }
  if (patch.contact_person !== undefined) updates.contact_person = patch.contact_person.trim() || null;
  if (patch.phone !== undefined) updates.phone = patch.phone.trim();
  if (patch.email !== undefined) updates.email = patch.email.trim() || null;
  if (patch.address !== undefined) updates.address = patch.address.trim() || null;
  if (patch.gstin !== undefined) updates.gstin = patch.gstin.trim().toUpperCase() || null;
  if (patch.pan_number !== undefined) updates.pan_number = patch.pan_number.trim().toUpperCase() || null;
  if (patch.cin !== undefined) updates.cin = patch.cin.trim().toUpperCase() || null;
  if (patch.msme_number !== undefined) updates.msme_number = patch.msme_number.trim().toUpperCase() || null;
  if (patch.tan_number !== undefined) updates.tan_number = patch.tan_number.trim().toUpperCase() || null;
  if (patch.iec_number !== undefined) updates.iec_number = patch.iec_number.trim() || null;
  if (patch.vehicle_types !== undefined) updates.vehicle_types = patch.vehicle_types;
  if (patch.operating_areas !== undefined) updates.operating_areas = patch.operating_areas;
  if (patch.primary_region !== undefined) updates.primary_region = patch.primary_region;
  if (Object.keys(updates).length === 0) return { error: null, supplier: null };
  const { data, error } = await supabase()
    .from('suppliers')
    .update(updates)
    .eq('organization_id', orgId)
    .eq('id', supplierId)
    .select()
    .single();
  if (error && isMissingPrimaryRegionColumnError(error.message)) {
    delete updates.primary_region;
    if (patch.primary_region) {
      const { data: current, error: readError } = await supabase()
        .from("suppliers")
        .select("operating_areas")
        .eq("organization_id", orgId)
        .eq("id", supplierId)
        .maybeSingle();
      if (readError) return { error: new Error(readError.message), supplier: null };
      updates.operating_areas = operatingAreasWithPrimaryRegion(
        (current?.operating_areas as string[] | null | undefined) ?? [],
        patch.primary_region,
      );
    }
    if (Object.keys(updates).length === 0) return { error: null, supplier: null };
    const retry = await supabase()
      .from("suppliers")
      .update(updates)
      .eq("organization_id", orgId)
      .eq("id", supplierId)
      .select()
      .single();
    if (retry.error) return { error: new Error(retry.error.message), supplier: null };
    return {
      error: null,
      supplier: {
        ...(retry.data as unknown as SupplierRow),
        primary_region: patch.primary_region ?? null,
      },
    };
  }
  if (error) return { error: new Error(error.message), supplier: null };
  return { error: null, supplier: data as unknown as SupplierRow };
}
