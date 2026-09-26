/**
 * Clients service — Core compatibility adapter over platform CustomerService.
 * CRUD and list reads delegate to CustomerService → customerRepository → clients.
 * Connection RPCs (detail bundle, linked org profiles) remain here until Phase 3.
 */
import { enrichConnectionPartnerAvatars } from '@/lib/enrichConnectionPartnerAvatars';
import {
  SAME_ORG_CLIENT_MESSAGE,
  phoneBelongsToActiveOrgMember,
} from '@/lib/sameOrgPartyGuard';
import { isIntegratedClientRow } from '@/features/trips/visibility/tripVisibility';
import { CustomerService } from '@/lib/platform';
import { supabase } from '@/lib/supabase';
import { DEFAULT_PAGE_SIZE, type PageOpts } from '@/lib/pagination';
import { syncDomainRows } from '@/lib/cache/domainSync';
import { mergeDeltaRows } from '@/lib/cache/mergeDelta';
import type { DeltaResponse } from '@/lib/cache/deltaTypes';
import type { RatingRow } from '@/features/ratings';
import type { ClientWarehouse } from '@/features/clients/services/clientWarehouses.service';
import type { ClientContract } from '@/features/clients/services/clientContracts.service';
import type { InvoicePodPolicy } from '@/features/invoicing/utils/invoicePodPolicy.util';

export interface ClientRow {
  id: string;
  organization_id: string;
  name: string;
  contact_person: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  gstin: string | null;
  pan_number: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  display_id?: string;
  /** True when client is linked to another org on the platform (shared ledger). */
  is_integrated?: boolean;
  /** When set, client is another platform org (for Compare & Verify partner resolution). */
  linked_organization_id?: string | null;
  /** Optional contact/commission percent; shown in Finance customers table subline (e.g. "MANUAL · 10%"). */
  contact_percent?: number | null;
  /** Avatar for the linked org, populated by `get_clients_with_profiles`.
   *  Resolution priority: `organizations.logo_url` (org branding) →
   *  `profiles.avatar_url` (owner's personal avatar) → null (let the UI
   *  render initials from the name + avatar_seed). */
  avatar_url?: string | null;
  avatar_seed?: string | null;
  owner_full_name?: string | null;
  /** DB `string | null`. Parse with `parseInvoicePodPolicy` before use. */
  invoice_pod_policy?: string | null;
}

function asClientRow(record: Record<string, unknown> | null): ClientRow | null {
  return record as ClientRow | null;
}

function mapCreateClientError(e: unknown): Error {
  const err = e as Error & { code?: string };
  if (err.code === '23505') {
    return new Error('A client with this phone number already exists.');
  }
  if (err.code === '42501' || err.message?.toLowerCase().includes('row-level security')) {
    return new Error('You do not have permission to add clients to this organization.');
  }
  return new Error(err.message || 'Failed to create client');
}

export async function getClientsByOrganization(
  orgId: string,
  opts?: PageOpts
): Promise<{ error: Error | null; clients: ClientRow[]; hasMore?: boolean }> {
  try {
    const raw = (await CustomerService.listClientRecordsWithProfiles(orgId)) as unknown as ClientRow[];
    if (opts != null) {
      const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
      const offset = opts.offset ?? 0;
      const hasMore = raw.length > offset + limit;
      return { error: null, clients: raw.slice(offset, offset + limit), hasMore };
    }
    return { error: null, clients: raw };
  } catch (rpcError) {
    if (__DEV__) {
      console.warn('[getClientsByOrganization] RPC failed, falling back to platform list:', rpcError);
    }
  }

  try {
    const rows = (await CustomerService.listClientRecords(orgId)) as unknown as ClientRow[];
    if (opts != null) {
      const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
      const offset = opts.offset ?? 0;
      const hasMore = rows.length > offset + limit;
      const page = rows.slice(offset, offset + limit);
      return {
        error: null,
        clients: await enrichConnectionPartnerAvatars(orgId, page, 'get_clients_with_profiles'),
        hasMore,
      };
    }
    return {
      error: null,
      clients: await enrichConnectionPartnerAvatars(orgId, rows, 'get_clients_with_profiles'),
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      clients: [],
    };
  }
}

export async function getClientsDelta(
  orgId: string,
  since: { updatedAt: string; tieBreakerId?: string | null },
): Promise<{ error: Error | null; delta: DeltaResponse<ClientRow> }> {
  const { data, error } = await supabase().rpc('get_clients_delta', {
    p_org_id: orgId,
    p_since: since.updatedAt,
    p_limit: 1000,
  });
  if (error) {
    return {
      error: new Error(error.message),
      delta: { changed: [], deletedIds: [], nextCursor: since },
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { changed?: ClientRow[]; deleted_ids?: string[]; next_cursor?: string | null }
    | null;
  return {
    error: null,
    delta: {
      changed: (row?.changed ?? []) as ClientRow[],
      deletedIds: (row?.deleted_ids ?? []) as string[],
      nextCursor: row?.next_cursor ? { updatedAt: row.next_cursor } : since,
    },
  };
}

export async function syncClientsWithCache(
  orgId: string,
  currentRows: ClientRow[],
): Promise<{ error: Error | null; clients: ClientRow[] }> {
  try {
    const clients = await syncDomainRows<ClientRow>({
      domain: 'clients',
      orgId,
      schemaVersion: '2',
      policy: { maxDeltaLagMs: 5 * 60_000, fullSyncEveryMs: 8 * 60 * 60_000 },
      currentRows,
      getFull: async () => {
        const res = await getClientsByOrganization(orgId);
        if (res.error) throw res.error;
        return res.clients;
      },
      getDelta: async (cursor) => {
        const res = await getClientsDelta(orgId, cursor);
        if (res.error) throw res.error;
        return res.delta;
      },
      merge: (existing, delta) =>
        mergeDeltaRows({
          existing,
          changed: delta.changed,
          deletedIds: delta.deletedIds,
          compare: (a, b) => a.name.localeCompare(b.name),
        }),
    });
    const enriched = await enrichConnectionPartnerAvatars(
      orgId,
      clients,
      'get_clients_with_profiles',
    );
    return { error: null, clients: enriched };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), clients: currentRows };
  }
}

export async function getClientById(
  orgId: string,
  clientId: string
): Promise<{ error: Error | null; client: ClientRow | null }> {
  try {
    const client = asClientRow(await CustomerService.findClientRecord(orgId, clientId));
    return { error: null, client };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), client: null };
  }
}

/**
 * Fetch client for detail/edit with integrated logic: when linked_organization_id is set,
 * name/contact_person/phone/email are COALESCE from linked org's owner profile.
 * Use this for the client detail screen and edit form so the form is pre-filled.
 */
export async function getClientDetails(
  clientId: string
): Promise<{ error: Error | null; client: ClientRow | null }> {
  const { data, error } = await supabase().rpc('get_client_details', {
    p_client_id: clientId,
  });
  if (error) return { error: new Error(error.message), client: null };
  if (data == null) return { error: null, client: null };
  return { error: null, client: data as ClientRow };
}

/**
 * Fetch display profile (name, contact, phone, avatar) for a linked organization.
 * Used when syncing integrated client details from the other org's profile.
 * Uses RPC get_connection_partner_display (SECURITY DEFINER) so we can read the other org's profile.
 */
export async function getLinkedOrgProfile(linkedOrganizationId: string): Promise<{
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

export type OrgDisplayProfile = {
  organizationName: string;
  contactPerson: string;
  phone: string;
  logoUrl?: string;
  ownerAvatarUrl?: string;
  orgAvatarSeed?: string;
  avatarUrl?: string;
  avatarSeed?: string;
  ownerId?: string;
  orgCreatedAt?: string;
  ownerSignedUpAt?: string;
  tripCount?: number;
  averageRating?: number | null;
  ratingCount?: number;
  verificationStatus?: string | null;
  vehicleCount?: number;
  networkIndentCount?: number;
};

function isUnauthenticatedPartnerDisplayError(
  error: { message?: string; code?: string; status?: number } | null,
): boolean {
  if (!error) return false;
  const code = String(error.code ?? '').toUpperCase();
  const status = error.status;
  if (status === 401 || status === 403) return true;
  if (code === '42501' || code === 'PGRST301') return true;
  const message = String(error.message ?? '').toLowerCase();
  return (
    message.includes('permission denied') ||
    message.includes('not authenticated') ||
    message.includes('jwt')
  );
}

/** Batch-fetch display profiles for multiple linked orgs in one RPC call. */
/**
 * Single-flight guard for `get_connection_partner_display_batch`. Several
 * independent call sites (ClientDetailScreen, chat branding, mutual
 * connections, bids, inbound-protocol) can request the same id set within
 * the same page load with no coordination between them — without this, each
 * one fires its own RPC. Keyed by the exact sorted id set: this catches the
 * common "same one org id looked up from two components" case without the
 * complexity of a partial-overlap cache (see `linkedOrgDisplayCache.ts` for
 * that, used by the one call site that already needed it).
 */
const linkedOrgProfilesBatchInFlight = new Map<
  string,
  Promise<Record<string, OrgDisplayProfile>>
>();

export async function getLinkedOrgProfilesBatch(
  linkedOrganizationIds: string[]
): Promise<Record<string, OrgDisplayProfile>> {
  if (linkedOrganizationIds.length === 0) return {};
  const dedupeKey = Array.from(new Set(linkedOrganizationIds.map((id) => id.trim()).filter(Boolean)))
    .sort()
    .join(',');
  if (!dedupeKey) return {};
  const inFlight = linkedOrgProfilesBatchInFlight.get(dedupeKey);
  if (inFlight) return inFlight;
  const run = fetchLinkedOrgProfilesBatchUncached(linkedOrganizationIds).finally(() => {
    linkedOrgProfilesBatchInFlight.delete(dedupeKey);
  });
  linkedOrgProfilesBatchInFlight.set(dedupeKey, run);
  return run;
}

const PARTNER_DISPLAY_BATCH_CHUNK = 24;

async function fetchLinkedOrgProfilesBatchUncached(
  linkedOrganizationIds: string[]
): Promise<Record<string, OrgDisplayProfile>> {
  const { data: sessionData } = await supabase().auth.getSession();
  if (!sessionData.session?.access_token) return {};
  const uniqueIds = [
    ...new Set(linkedOrganizationIds.map((id) => id.trim()).filter(Boolean)),
  ];
  const result: Record<string, OrgDisplayProfile> = {};
  for (let i = 0; i < uniqueIds.length; i += PARTNER_DISPLAY_BATCH_CHUNK) {
    const chunk = uniqueIds.slice(i, i + PARTNER_DISPLAY_BATCH_CHUNK);
    const { data, error } = await supabase().rpc('get_connection_partner_display_batch', {
      p_linked_organization_ids: chunk,
    });
    if (error || data == null || typeof data !== 'object') {
      if (error && isUnauthenticatedPartnerDisplayError(error) && __DEV__) {
        console.warn('[partner-display] skipped unauthenticated batch', error.message);
      }
      continue;
    }
    Object.assign(result, mapPartnerDisplayBatch(data as Record<string, PartnerDisplayRaw>));
  }
  return result;
}

type PartnerDisplayRaw = {
  organizationName?: string;
  contactPerson?: string;
  phone?: string;
  logoUrl?: string;
  ownerAvatarUrl?: string;
  orgAvatarSeed?: string;
  avatarUrl?: string;
  avatarSeed?: string;
  ownerId?: string;
  orgCreatedAt?: string;
  ownerSignedUpAt?: string;
  tripCount?: number;
  averageRating?: number | null;
  ratingCount?: number;
  verificationStatus?: string | null;
  vehicleCount?: number;
  networkIndentCount?: number;
};

function mapPartnerDisplayBatch(
  raw: Record<string, PartnerDisplayRaw>,
): Record<string, OrgDisplayProfile> {
  const result: Record<string, OrgDisplayProfile> = {};
  for (const [oid, entry] of Object.entries(raw)) {
    if (!entry) continue;
    const ownerId = (entry.ownerId ?? '').trim();
    const logoUrl = (entry.logoUrl ?? '').trim();
    const ownerAvatarUrl = (entry.ownerAvatarUrl ?? '').trim();
    const orgAvatarSeed = (entry.orgAvatarSeed ?? '').trim();
    const avatarUrl = (entry.avatarUrl ?? '').trim();
    const avatarSeed = (entry.avatarSeed ?? '').trim();
    const orgCreatedAt = (entry.orgCreatedAt ?? '').trim();
    const ownerSignedUpAt = (entry.ownerSignedUpAt ?? '').trim();
    const verificationStatus = (entry.verificationStatus ?? '').trim() || null;
    const tripCount =
      typeof entry.tripCount === 'number' && Number.isFinite(entry.tripCount)
        ? entry.tripCount
        : undefined;
    const averageRating =
      typeof entry.averageRating === 'number' && Number.isFinite(entry.averageRating)
        ? entry.averageRating
        : entry.averageRating === null
          ? null
          : undefined;
    const ratingCount =
      typeof entry.ratingCount === 'number' && Number.isFinite(entry.ratingCount)
        ? entry.ratingCount
        : undefined;
    const vehicleCount =
      typeof entry.vehicleCount === 'number' && Number.isFinite(entry.vehicleCount)
        ? entry.vehicleCount
        : undefined;
    const networkIndentCount =
      typeof entry.networkIndentCount === 'number' && Number.isFinite(entry.networkIndentCount)
        ? entry.networkIndentCount
        : undefined;
    result[oid] = {
      organizationName: (entry.organizationName ?? '').trim() || 'Connected',
      contactPerson: (entry.contactPerson ?? '').trim(),
      phone: (entry.phone ?? '').trim(),
      ...(logoUrl ? { logoUrl } : {}),
      ...(ownerAvatarUrl ? { ownerAvatarUrl } : {}),
      ...(orgAvatarSeed ? { orgAvatarSeed } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(avatarSeed ? { avatarSeed } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(orgCreatedAt ? { orgCreatedAt } : {}),
      ...(ownerSignedUpAt ? { ownerSignedUpAt } : {}),
      ...(tripCount !== undefined ? { tripCount } : {}),
      ...(averageRating !== undefined ? { averageRating } : {}),
      ...(ratingCount !== undefined ? { ratingCount } : {}),
      ...(vehicleCount !== undefined ? { vehicleCount } : {}),
      ...(networkIndentCount !== undefined ? { networkIndentCount } : {}),
      ...(verificationStatus ? { verificationStatus } : { verificationStatus: null }),
    };
  }
  return result;
}

/**
 * Find an active client by name within an organization (trimmed exact match).
 * Used when creating trips so client_id is set and integrated clients can see the trip (RLS).
 */
export async function getClientByName(
  orgId: string,
  name: string
): Promise<{ error: Error | null; client: ClientRow | null }> {
  try {
    const client = asClientRow(await CustomerService.findClientByName(orgId, name));
    return { error: null, client };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), client: null };
  }
}

/**
 * Find an active client by phone within an organization (idempotency / duplicate check).
 */
export async function getClientByPhone(
  orgId: string,
  phone: string
): Promise<{ error: Error | null; client: ClientRow | null }> {
  try {
    const client = asClientRow(await CustomerService.findClientByPhone(orgId, phone));
    return { error: null, client };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), client: null };
  }
}

/**
 * Create client payload.
 * Mobile quick-add: contact_person + phone are enough; name is derived for DB (required column).
 * Full payload supported for web parity (organization_name, email, address, etc.).
 */
export interface CreateClientData {
  /** Contact person name (required for quick-add). Used as organization name if organization_name omitted. */
  contact_person: string;
  phone: string;
  organization_name?: string;
  email?: string;
  address?: string;
  gstin?: string;
  pan_number?: string;
  notes?: string;
  is_integrated?: boolean;
}

export async function createClient(
  orgId: string,
  clientData: CreateClientData
): Promise<{ error: Error | null; client: ClientRow | null }> {
  const sb = supabase();
  const { data: { session }, error: sessionError } = await sb.auth.getSession();
  if (sessionError || !session?.user) {
    return {
      error: new Error('Your session may have expired. Please sign out and sign in again.'),
      client: null,
    };
  }
  await sb.auth.refreshSession().then(() => {});
  const { data: { session: currentSession } } = await sb.auth.getSession();
  const sessionToUse = currentSession ?? session;
  try {
    await sb.auth.setSession({
      access_token: sessionToUse.access_token,
      refresh_token: sessionToUse.refresh_token,
    });
  } catch {
    return {
      error: new Error('Session invalid. Please sign out and sign in again.'),
      client: null,
    };
  }
  // Service-layer backstop: never create an offline client representing an
  // ACTIVE member of this same org. Not DB-enforced — see lib/sameOrgPartyGuard.
  if (await phoneBelongsToActiveOrgMember(orgId, clientData.phone)) {
    return { error: new Error(SAME_ORG_CLIENT_MESSAGE), client: null };
  }

  const name =
    (clientData.organization_name ?? '').trim() ||
    (clientData.contact_person ?? '').trim() ||
    'Client';
  try {
    const client = asClientRow(await CustomerService.createClientRecord(orgId, {
      name,
      phone: (clientData.phone ?? '').trim(),
      email: (clientData.email ?? '').trim() || undefined,
      address: (clientData.address ?? '').trim() || undefined,
      gstin: (clientData.gstin ?? '').trim() || undefined,
      contactPerson: (clientData.contact_person ?? '').trim() || undefined,
      panNumber: (clientData.pan_number ?? '').trim() || undefined,
      notes: (clientData.notes ?? '').trim() || undefined,
      isIntegrated: clientData.is_integrated ?? false,
      createdBy: sessionToUse.user.id,
    }));
    return { error: null, client };
  } catch (e) {
    return { error: mapCreateClientError(e), client: null };
  }
}

/** Patch for updating a client (e.g. after create from Ops Agent). */
export interface UpdateClientData {
  contact_person?: string;
  phone?: string;
  organization_name?: string;
  email?: string;
  address?: string;
  gstin?: string;
  pan_number?: string;
}

const CLIENT_IDENTITY_FIELDS = [
  "contact_person",
  "phone",
  "organization_name",
  "email",
] as const satisfies ReadonlyArray<keyof UpdateClientData>;

export async function updateClient(
  orgId: string,
  clientId: string,
  patch: UpdateClientData
): Promise<{ error: Error | null; client: ClientRow | null }> {
  const hasPatch =
    patch.contact_person !== undefined ||
    patch.phone !== undefined ||
    patch.email !== undefined ||
    patch.address !== undefined ||
    patch.gstin !== undefined ||
    patch.pan_number !== undefined ||
    patch.organization_name !== undefined;
  if (!hasPatch) return { error: null, client: null };

  const touchesIdentity = CLIENT_IDENTITY_FIELDS.some(
    (key) => patch[key] !== undefined,
  );
  if (touchesIdentity) {
    const { data: existing, error: existingError } = await supabase()
      .from("clients")
      .select("id, is_integrated, linked_organization_id")
      .eq("organization_id", orgId)
      .eq("id", clientId)
      .maybeSingle();
    if (existingError) {
      return { error: new Error(existingError.message), client: null };
    }
    if (
      existing &&
      isIntegratedClientRow(
        existing as Pick<ClientRow, "is_integrated" | "linked_organization_id">,
      )
    ) {
      return {
        error: new Error(
          "Name, phone, email, and contact person are managed by the connected client account and cannot be edited.",
        ),
        client: null,
      };
    }
  }

  const name =
    (patch.organization_name ?? '').trim() ||
    (patch.contact_person ?? '').trim() ||
    'Client';
  try {
    const client = asClientRow(await CustomerService.updateClientRecord(orgId, clientId, {
      name: patch.organization_name !== undefined || patch.contact_person !== undefined ? name : undefined,
      phone: patch.phone !== undefined ? patch.phone.trim() : undefined,
      email: patch.email !== undefined ? patch.email.trim() || undefined : undefined,
      address: patch.address !== undefined ? patch.address.trim() || undefined : undefined,
      gstin: patch.gstin !== undefined ? patch.gstin.trim() || undefined : undefined,
      contactPerson: patch.contact_person !== undefined ? patch.contact_person.trim() || undefined : undefined,
      panNumber: patch.pan_number !== undefined ? patch.pan_number.trim() || undefined : undefined,
    }));
    return { error: null, client };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), client: null };
  }
}

function mapInvoicePodPolicyWriteError(e: { message?: string; code?: string }): Error {
  const message = e.message ?? "";
  if (e.code === "42501" || message.includes("invoice_pod_policy_forbidden")) {
    return new Error("You do not have permission to change this client's invoicing POD policy.");
  }
  if (e.code === "23514" || message.includes("clients_invoice_pod_policy_check")) {
    return new Error("That POD policy is not valid.");
  }
  return new Error(message || "Failed to update invoicing POD policy");
}

/** Live DB helper — same OR as trg_clients_protect_invoice_pod_policy. */
export async function canManageClientInvoicePodPolicy(
  orgId: string,
): Promise<{ error: Error | null; allowed: boolean }> {
  const { data, error } = await supabase().rpc("can_manage_client_invoice_pod_policy", {
    p_org_id: orgId,
  });
  if (error) return { error: new Error(error.message), allowed: false };
  return { error: null, allowed: data === true };
}

/** Batched `id, invoice_pod_policy` for invoice eligibility. One query (chunked). */
export async function fetchClientInvoicePodPolicies(
  orgId: string,
  clientIds: string[],
): Promise<{ error: Error | null; policies: Record<string, unknown> }> {
  const ids = Array.from(new Set(clientIds.map((id) => id.trim()).filter(Boolean)));
  const policies: Record<string, unknown> = {};
  if (!orgId || ids.length === 0) return { error: null, policies };
  try {
    const chunkSize = 200;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data, error } = await supabase()
        .from("clients")
        .select("id, invoice_pod_policy")
        .eq("organization_id", orgId)
        .in("id", chunk);
      if (error) return { error: new Error(error.message), policies: {} };
      for (const row of data ?? []) {
        const id = String((row as { id?: string }).id ?? "");
        if (!id) continue;
        policies[id] = (row as { invoice_pod_policy?: unknown }).invoice_pod_policy;
      }
    }
    return { error: null, policies };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      policies: {},
    };
  }
}

/** Single-column read. Does not load trips, invoices, or the management bundle. */
export async function getClientInvoicePodPolicy(
  orgId: string,
  clientId: string,
): Promise<{ error: Error | null; raw: unknown }> {
  const { data, error } = await supabase()
    .from("clients")
    .select("invoice_pod_policy")
    .eq("organization_id", orgId)
    .eq("id", clientId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), raw: null };
  if (!data) {
    return { error: new Error("Client not found or you cannot view this client."), raw: null };
  }
  return { error: null, raw: data.invoice_pod_policy };
}

/** Single-column patch. Does not touch identity, trips, invoices, or workspace POD. */
export async function updateClientInvoicePodPolicy(
  orgId: string,
  clientId: string,
  policy: InvoicePodPolicy | null,
): Promise<{ error: Error | null; raw: unknown }> {
  const { data, error } = await supabase()
    .from("clients")
    .update({ invoice_pod_policy: policy })
    .eq("organization_id", orgId)
    .eq("id", clientId)
    .select("invoice_pod_policy")
    .maybeSingle();
  if (error) return { error: mapInvoicePodPolicyWriteError(error), raw: null };
  if (!data) {
    return {
      error: new Error("Client not found or you cannot update this client."),
      raw: null,
    };
  }
  return { error: null, raw: data.invoice_pod_policy };
}

const EMPTY_CLIENT_DETAIL_BUNDLE = {
  error: null as Error | null,
  client: null as ClientRow | null,
  ratings: [] as RatingRow[],
  warehouses: [] as ClientWarehouse[],
  contracts: [] as ClientContract[],
};

function isMissingRpcError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? '');
  const message = String(error.message ?? '');
  return code === 'PGRST202' || /schema cache|could not find the function/i.test(message);
}

function parseClientDetailBundle(data: unknown): {
  client: ClientRow | null;
  ratings: RatingRow[];
  warehouses: ClientWarehouse[];
  contracts: ClientContract[];
} {
  let value = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      value = null;
    }
  }
  if (Array.isArray(value)) value = value[0];
  if (!value || typeof value !== 'object') return { ...EMPTY_CLIENT_DETAIL_BUNDLE };
  const row = value as Record<string, unknown>;
  if (
    row.client == null &&
    typeof row.id === 'string' &&
    typeof row.organization_id === 'string'
  ) {
    return {
      client: row as unknown as ClientRow,
      ratings: [],
      warehouses: [],
      contracts: [],
    };
  }
  return {
    client: (row.client as ClientRow | null) ?? null,
    ratings: (row.ratings as RatingRow[] | undefined) ?? [],
    warehouses: (row.warehouses as ClientWarehouse[] | undefined) ?? [],
    contracts: (row.contracts as ClientContract[] | undefined) ?? [],
  };
}

/** Single round-trip bundle for ClientDetailScreen — replaces 4 parallel calls. */
export async function getClientDetailBundle(orgId: string, clientId: string): Promise<{
  error: Error | null;
  client: ClientRow | null;
  ratings: RatingRow[];
  warehouses: ClientWarehouse[];
  contracts: ClientContract[];
}> {
  const args = { p_org_id: orgId, p_client_id: clientId };
  let { data, error } = await supabase().rpc('get_client_page_bootstrap', args);
  if (isMissingRpcError(error)) {
    ({ data, error } = await supabase().rpc('get_client_detail_bundle', args));
  }
  if (error) {
    return { ...EMPTY_CLIENT_DETAIL_BUNDLE, error: new Error(error.message) };
  }
  const bundle = parseClientDetailBundle(data);
  if (!bundle.client) {
    const details = await getClientDetails(clientId);
    if (details.error) {
      return { ...EMPTY_CLIENT_DETAIL_BUNDLE, error: details.error };
    }
    if (details.client) bundle.client = details.client;
  }
  return { error: null, ...bundle };
}
