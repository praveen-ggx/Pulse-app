/**
 * Connection requests service — org-to-org invitations (client/supplier).
 * Single bounded context: connection_requests (invite by phone, list received/sent, approve/reject).
 * Same DB as pulse-unified-base; schema and RPCs live there. No driver-invite logic here.
 *
 * Data model (phone is on the person, not the org):
 * - organizations = company/org (name, slug, owner_id, etc.). No phone column.
 * - auth.users = the person; raw_user_meta_data->>'phone' (and optional ->'phone_numbers' array) stores phone on sign-up and profile edit.
 * Lookup "by phone" is by person: get_invitee_by_phone reads profiles.phone then auth metadata, resolves that user's
 * organization via organization_members or organizations.owner_id, and returns organization_id, full_name, phone,
 * organization_name, profile_company_name, and profile_role (profiles.role, for driver-aware invite UI).
 *
 * Role semantics (one direction per request; see on_connection_request_approved trigger):
 * - Add Client (requestShipperClient: true): inviter gets invitee as CLIENT; invitee gets inviter as SUPPLIER.
 * - Add Supplier (requestCarrierSupplier: true): inviter gets invitee as SUPPLIER; invitee gets inviter as CLIENT.
 *
 * Edge cases:
 * - Duplicate invite (same from_org → to_org): UNIQUE(from_organization_id, to_organization_id) causes insert 23505;
 *   createConnectionRequest merges role flags on the existing pending row and returns alreadyInvited.
 * - Same contact, different org shells (duplicate sign-ups): blocked while another pending invite exists to any
 *   org owned by that user; UI collapses multiple pending rows per owner in Inbound Protocol.
 * - Mutual invites (A→B and B→A): two separate rows; each approval creates one directional relationship.
 * - Re-invite after existing connection: duplicate insert prevented as above; existing client/supplier rows are updated by trigger when linked_organization_id already exists.
 */
import { runSingleflight } from '@/lib/cache/singleflight';
import { supabase } from '@/lib/supabase';
import { todayPendingInviteCountFromSent } from '@/lib/todayPendingInviteCount';

export { todayPendingInviteCountFromSent };

/** Max pending connection requests you can send per local day (UI + `runConnectionInvite` preflight). */
export const DAILY_CONNECTION_INVITE_LIMIT = 5;

/** Shown when the user hits the daily cap (client preflight, hub invite, or backend / rate limit). */
export const CONNECTION_REQUEST_DAILY_LIMIT_TITLE = "Daily limit exceeded";

export const CONNECTION_REQUEST_DAILY_LIMIT_MESSAGE =
  "Daily invite limit reached. Try again after 24 hours.";

export function looksLikeConnectionRateLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('limit') ||
    m.includes('rate') ||
    m.includes('too many') ||
    (m.includes('max') && m.includes('request')) ||
    m.includes('429')
  );
}
import {
  normalizePhoneForInviteeLookup,
  uniqueNormalizedPhonesForLookup,
} from '@/lib/phoneLookup';

export interface ConnectionInviteeByPhone {
  organization_id: string;
  full_name: string;
  phone: string;
  /** Matched user's organization name (organizations.name). */
  organization_name: string;
  /** Matched user's profile company (profiles.company_name), if set. */
  profile_company_name: string | null;
  /** `profiles.role` from get_invitee_by_phone (lowercase), e.g. `driver`. Empty when unknown. */
  profile_role: string;
}

/** Prefill: prefer profile company_name, else organization display name. */
export function inviteeSuggestedCompanyName(invitee: {
  profile_company_name?: string | null;
  organization_name?: string;
}): string {
  const fromProfile = (invitee.profile_company_name ?? "").trim();
  if (fromProfile.length > 0) return fromProfile;
  return (invitee.organization_name ?? "").trim();
}

/** True when invitee RPC reported a driver profile — used for Add Client / Supplier copy. */
export function inviteeProfileIsDriver(role: string | null | undefined): boolean {
  return (role ?? "").toLowerCase() === "driver";
}

export interface ConnectionRequestRow {
  id: string;
  from_organization_id: string;
  to_organization_id: string;
  request_shipper_client: boolean;
  request_carrier_supplier: boolean;
  status: string;
  created_at: string;
  responded_at: string | null;
  responded_by: string | null;
  from_org_name: string;
  to_org_name: string;
}

/**
 * Look up a person by phone, then their organization, for connection invite.
 * Phone is stored on the person (auth.users.raw_user_meta_data->>'phone' or ->'phone_numbers' array), not on organizations.
 * RPC get_invitee_by_phone finds the profile by phone, then returns that user's org id and display name. O(1).
 */
export interface ConnectionInviteeByPhoneRow {
  phone: string;
  organization_id: string;
  full_name: string | null;
  organization_name?: string | null;
  profile_company_name?: string | null;
  profile_role?: string | null;
}

export async function getConnectionInviteeByPhone(
  phone: string,
  orgId: string,
): Promise<{
  error: Error | null;
  invitee: ConnectionInviteeByPhone | null;
}> {
  const normalized = normalizePhoneForInviteeLookup(phone);
  if (!normalized) return { error: null, invitee: null };
  // orgId = the caller's ACTIVE workspace org. The RPC validates membership and
  // hides active members of that org, so a colleague can never be surfaced as an
  // external organization. Without it the RPC rejects the call outright.
  if (!orgId) return { error: null, invitee: null };
  const { data, error } = await supabase().rpc('get_invitee_by_phone', {
    p_phone: normalized,
    p_org_id: orgId,
  });
  if (error) return { error: new Error(error.message), invitee: null };
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!row?.organization_id)
    return { error: null, invitee: null };
  return {
    error: null,
    invitee: {
      organization_id: row.organization_id,
      full_name: row.full_name ?? '',
      phone: row.phone ?? normalized,
      organization_name: row.organization_name ?? '',
      profile_company_name: row.profile_company_name ?? null,
      profile_role: (row.profile_role ?? '').trim().toLowerCase(),
    },
  };
}

/**
 * Is this phone an ACTIVE member of `orgId`?
 *
 * Disambiguates a null `getConnectionInviteeByPhone` result: the invitee RPC
 * deliberately hides same-org active members, so "no row" means either "no
 * platform account" or "one of your own people". Call this ONLY when that lookup
 * returned null, to decide which.
 *
 * Returns a bare boolean about the caller's OWN org — no name, user id or org id.
 * Former/inactive members return false (still addable as an offline party).
 *
 * Throws on failure. Callers must surface a retryable error rather than falling
 * through to "no account": treating an error as NOT_FOUND would re-open the
 * misleading offline path this check exists to close.
 */
export async function isActiveOrgMemberPhone(
  phone: string,
  orgId: string,
): Promise<boolean> {
  const normalized = normalizePhoneForInviteeLookup(phone);
  if (!normalized || !orgId) return false;
  const { data, error } = await supabase().rpc('is_active_org_member_phone', {
    p_org_id: orgId,
    p_phone: normalized,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/**
 * Batch lookup: resolve invitee orgs for multiple phone numbers in one RPC call.
 * Returns a map keyed by normalized phone (digits-only, last-10 for India).
 *
 * Backend dependency: requires RPC `get_invitees_by_phones(p_phones text[])`.
 * If the RPC is not deployed yet, this function returns an empty map (no hard failure),
 * so the UI can gracefully show "Offline" until backend rollout completes.
 */
export async function getConnectionInviteesByPhones(
  phones: string[],
  orgId: string,
): Promise<{
  error: Error | null;
  inviteesByPhone: Map<string, ConnectionInviteeByPhone>;
}> {
  const normalizedPhones = uniqueNormalizedPhonesForLookup(phones);
  const inviteesByPhone = new Map<string, ConnectionInviteeByPhone>();
  if (normalizedPhones.length === 0) return { error: null, inviteesByPhone };
  if (!orgId) return { error: null, inviteesByPhone };

  const { data, error } = await supabase().rpc('get_invitees_by_phones', {
    p_phones: normalizedPhones,
    p_org_id: orgId,
  });

  if (error) {
    const msg = error.message ?? '';
    // Best-effort fallback: if the batch RPC isn't available yet, or fails due to
    // permissions/RLS differences, fall back to the single-phone RPC so UI can still
    // detect "ON APP" accounts and show the right CTA.
    const settled = await Promise.allSettled(
      normalizedPhones.map(async (p) => {
        const { invitee } = await getConnectionInviteeByPhone(p, orgId);
        return invitee;
      }),
    );
    for (let i = 0; i < settled.length; i++) {
      const res = settled[i];
      if (res.status !== "fulfilled") continue;
      const invitee = res.value;
      if (!invitee?.organization_id) continue;
      const phoneKey = normalizePhoneForInviteeLookup(
        invitee.phone ?? normalizedPhones[i] ?? "",
      );
      if (!phoneKey) continue;
      if (inviteesByPhone.has(phoneKey)) continue;
      inviteesByPhone.set(phoneKey, invitee);
    }
    // Even if the batch call failed, return best-effort results so UI can update labels.
    // If fallback couldn't resolve any, still surface the original error to callers that care.
    return inviteesByPhone.size > 0
      ? { error: null, inviteesByPhone }
      : { error: new Error(msg), inviteesByPhone };
  }

  const rows = (data ?? []) as ConnectionInviteeByPhoneRow[];
  for (const r of rows) {
    const phoneKey = normalizePhoneForInviteeLookup(r?.phone ?? '');
    if (!phoneKey) continue;
    if (!r?.organization_id) continue;
    // If backend returns multiple rows for same phone, keep the first (deterministic).
    if (inviteesByPhone.has(phoneKey)) continue;
    inviteesByPhone.set(phoneKey, {
      organization_id: r.organization_id,
      full_name: r.full_name ?? '',
      phone: r.phone ?? phoneKey,
      organization_name: r.organization_name ?? '',
      profile_company_name: r.profile_company_name ?? null,
      profile_role: (r.profile_role ?? '').trim().toLowerCase(),
    });
  }
  return { error: null, inviteesByPhone };
}

/** Flatten PostgREST / Supabase error fields for duplicate detection (PostgrestError has no HTTP status on the instance). */
function connectionRequestInsertErrorFingerprint(error: unknown): string {
  if (error == null) return "";
  if (typeof error === "string") return error.toLowerCase();
  if (typeof error !== "object") return String(error).toLowerCase();
  const e = error as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of ["message", "details", "hint", "code", "status", "statusCode"] as const) {
    const v = e[k];
    if (v != null) parts.push(String(v));
  }
  if (e.cause != null) parts.push(connectionRequestInsertErrorFingerprint(e.cause));
  try {
    parts.push(JSON.stringify(error));
  } catch {
    /* ignore circular refs */
  }
  return parts.join(" ").toLowerCase();
}

/**
 * True when the insert failed because this (from_org, to_org) pair already exists.
 * PostgREST returns JSON with `code` "23505"; browsers still show HTTP 409 in the Network panel.
 */
function isDuplicateConnectionRequestInsertError(error: unknown): boolean {
  if ((error as { code?: string } | null)?.code === "23505") return true;
  const f = connectionRequestInsertErrorFingerprint(error);
  if (f.includes("23505")) return true;
  if (f.includes("duplicate key")) return true;
  if (f.includes("unique constraint")) return true;
  if (f.includes("unique violation")) return true;
  if (f.includes("connection_requests_from_organization_id_to_organization_id")) return true;
  // Some proxies/clients only preserve status text in the message
  if (/\b409\b/.test(f) && (f.includes("conflict") || f.includes("duplicate") || f.includes("unique")))
    return true;
  return false;
}

async function selectConnectionRequestIdForOrgPair(
  fromOrgId: string,
  toOrgId: string,
): Promise<string | null> {
  const { data, error } = await supabase()
    .from("connection_requests")
    .select("id")
    .eq("from_organization_id", fromOrgId)
    .eq("to_organization_id", toOrgId)
    .maybeSingle();
  if (error || !data || typeof (data as { id?: string }).id !== "string") return null;
  return (data as { id: string }).id;
}

/** Merge role flags on an existing pending request (e.g. client invite then supplier to same org). */
async function mergeConnectionRequestRoles(
  requestId: string,
  options: { requestShipperClient: boolean; requestCarrierSupplier: boolean },
): Promise<{ error: Error | null }> {
  const { data, error } = await supabase()
    .from("connection_requests")
    .select("id, status, request_shipper_client, request_carrier_supplier")
    .eq("id", requestId)
    .maybeSingle();
  if (error) return { error: new Error(error.message) };
  if (!data || typeof (data as { id?: string }).id !== "string") {
    return { error: new Error("Connection request not found") };
  }
  const row = data as {
    status: string;
    request_shipper_client: boolean;
    request_carrier_supplier: boolean;
  };
  if (row.status !== "pending") return { error: null };

  const nextClient = row.request_shipper_client || options.requestShipperClient;
  const nextSupplier =
    row.request_carrier_supplier || options.requestCarrierSupplier;
  if (!nextClient && !nextSupplier) {
    return {
      error: new Error(
        "At least one of requestShipperClient or requestCarrierSupplier must be true",
      ),
    };
  }
  if (
    row.request_shipper_client === nextClient &&
    row.request_carrier_supplier === nextSupplier
  ) {
    return { error: null };
  }

  const { error: updateError } = await supabase()
    .from("connection_requests")
    .update({
      request_shipper_client: nextClient,
      request_carrier_supplier: nextSupplier,
    })
    .eq("id", requestId)
    .eq("status", "pending");
  return { error: updateError ? new Error(updateError.message) : null };
}

/**
 * Pending invite to another org owned by the same user (SECURITY DEFINER — RLS hides partner orgs).
 */
async function findPendingSentToPartnerOwner(
  fromOrgId: string,
  toOrgId: string,
): Promise<{ requestId: string; samePair: boolean } | null> {
  const { data, error } = await supabase().rpc(
    "find_pending_sent_connection_to_partner_owner",
    { p_from_org_id: fromOrgId, p_to_org_id: toOrgId },
  );
  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (
      msg.includes("function") &&
      (msg.includes("does not exist") || msg.includes("not found"))
    ) {
      return null;
    }
    return null;
  }
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!row || typeof (row as { request_id?: string }).request_id !== "string") {
    return null;
  }
  return {
    requestId: (row as { request_id: string }).request_id,
    samePair: Boolean((row as { same_pair?: boolean }).same_pair),
  };
}

const PENDING_INVITE_SAME_CONTACT_MESSAGE =
  "You already have a pending invitation to this contact. Recall it from Sent invites before sending another.";

/** Shown when an unverified org tries to connect. UI paths surface this via their existing error Alert. */
export const CONNECT_REQUIRES_VERIFICATION_MESSAGE =
  "Verify your business to connect with other organisations. Complete verification in Workspace → Organization.";

/**
 * Create a connection request (invite another org as client and/or supplier).
 * Validates at least one role and rejects self-invite. On duplicate insert returns alreadyInvited (no error).
 */
export async function createConnectionRequest(
  fromOrgId: string,
  toOrgId: string,
  options: { requestShipperClient: boolean; requestCarrierSupplier: boolean }
): Promise<{
  error: Error | null;
  requestId: string | null;
  alreadyInvited: boolean;
}> {
  const { requestShipperClient, requestCarrierSupplier } = options;
  if (!requestShipperClient && !requestCarrierSupplier)
    return {
      error: new Error('At least one of requestShipperClient or requestCarrierSupplier must be true'),
      requestId: null,
      alreadyInvited: false,
    };
  if (fromOrgId === toOrgId)
    return {
      error: new Error('You cannot invite your own organization'),
      requestId: null,
      alreadyInvited: false,
    };

  // Verified-org gate: only KYC-verified orgs may send connection requests. This
  // is the single choke point every connect entry point funnels through, so the
  // check lives here rather than per-UI (which is bypassable). UI still guards
  // for a fast prompt; this is the enforcement backstop.
  {
    const { data: fromOrg, error: verifyErr } = await supabase()
      .from('organizations')
      .select('verification_status')
      .eq('id', fromOrgId)
      .maybeSingle();
    if (verifyErr)
      return { error: verifyErr as Error, requestId: null, alreadyInvited: false };
    if (fromOrg?.verification_status !== 'verified')
      return {
        error: new Error(CONNECT_REQUIRES_VERIFICATION_MESSAGE),
        requestId: null,
        alreadyInvited: false,
      };
  }

  // Preflight: same org pair — merge roles on existing pending row (client + supplier to one org).
  const existingId = await selectConnectionRequestIdForOrgPair(fromOrgId, toOrgId);
  if (existingId) {
    const merged = await mergeConnectionRequestRoles(existingId, options);
    return {
      error: merged.error,
      requestId: existingId,
      alreadyInvited: true,
    };
  }

  // Block a second pending invite to a different org owned by the same person.
  const ownerPending = await findPendingSentToPartnerOwner(fromOrgId, toOrgId);
  if (ownerPending && !ownerPending.samePair) {
    return {
      error: new Error(PENDING_INVITE_SAME_CONTACT_MESSAGE),
      requestId: ownerPending.requestId,
      alreadyInvited: true,
    };
  }

  const { data, error } = await supabase()
    .from('connection_requests')
    .insert({
      from_organization_id: fromOrgId,
      to_organization_id: toOrgId,
      request_shipper_client: requestShipperClient,
      request_carrier_supplier: requestCarrierSupplier,
      status: 'pending',
    })
    .select('id')
    .maybeSingle();
  if (error) {
    // After any insert failure, prefer a read probe: handles duplicate + odd client error shapes.
    const afterErrorId = await selectConnectionRequestIdForOrgPair(fromOrgId, toOrgId);
    if (afterErrorId) {
      const merged = await mergeConnectionRequestRoles(afterErrorId, options);
      return {
        error: merged.error,
        requestId: afterErrorId,
        alreadyInvited: true,
      };
    }
    if (isDuplicateConnectionRequestInsertError(error)) {
      return { error: null, requestId: null, alreadyInvited: true };
    }
    const msg = (error as { message?: string }).message ?? '';
    const friendly =
      /permission|policy|row-level security/i.test(msg)
        ? 'You do not have permission to send this invitation.'
        : msg;
    return { error: new Error(friendly), requestId: null, alreadyInvited: false };
  }
  return {
    error: null,
    requestId: data?.id ?? null,
    alreadyInvited: false,
  };
}

export type ConnectionRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | string;

/**
 * Get the latest connection request status for a specific (from_org -> to_org).
 * Used to update UI immediately after sending an invitation (driver-style).
 */
export async function getLatestConnectionRequestStatus(
  fromOrgId: string,
  toOrgId: string,
): Promise<{ error: Error | null; status: ConnectionRequestStatus | null; requestId: string | null }> {
  const { data, error } = await supabase()
    .from("connection_requests")
    .select("id, status, created_at")
    .eq("from_organization_id", fromOrgId)
    .eq("to_organization_id", toOrgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: new Error(error.message), status: null, requestId: null };
  if (!data) return { error: null, status: null, requestId: null };
  const row = data as { id?: string | null; status?: string | null };
  return {
    error: null,
    status: (row.status ?? null) as ConnectionRequestStatus | null,
    requestId: row.id ?? null,
  };
}

/**
 * List connection requests received by the given org. Single RPC, O(n) in result size.
 */
export async function getConnectionRequestsReceived(
  orgId: string,
  opts?: { signal?: AbortSignal },
): Promise<{
  error: Error | null;
  requests: ConnectionRequestRow[];
}> {
  return runSingleflight(`connectionRequests.received:${orgId}`, async () => {
    const { data, error } = await supabase().rpc(
      'get_connection_requests_received_with_names',
      { p_org_id: orgId },
      { abortSignal: opts?.signal },
    );
    if (error) return { error: new Error(error.message), requests: [] };
    return { error: null, requests: (data ?? []) as ConnectionRequestRow[] };
  });
}

/**
 * List connection requests sent by the given org. Single RPC, O(n) in result size.
 */
export async function getConnectionRequestsSent(
  orgId: string,
  opts?: { signal?: AbortSignal },
): Promise<{
  error: Error | null;
  requests: ConnectionRequestRow[];
}> {
  return runSingleflight(`connectionRequests.sent:${orgId}`, async () => {
    const { data, error } = await supabase().rpc(
      'get_connection_requests_sent_with_names',
      { p_org_id: orgId },
      { abortSignal: opts?.signal },
    );
    if (error) return { error: new Error(error.message), requests: [] };
    return { error: null, requests: (data ?? []) as ConnectionRequestRow[] };
  });
}

/** True if today’s pending sent count is at or above the daily cap (extra fetch; server still enforces). */
export async function isDailyConnectionInviteLimitReached(
  orgId: string,
): Promise<boolean> {
  const { requests, error } = await getConnectionRequestsSent(orgId);
  if (error) return false;
  return (
    todayPendingInviteCountFromSent(requests) >= DAILY_CONNECTION_INVITE_LIMIT
  );
}

/**
 * Approve a connection request (caller must be member of to_organization_id).
 * Updates only when status is pending; trigger creates organization_relations and client/supplier rows.
 */
export async function approveConnectionRequest(requestId: string, receivingOrgId?: string): Promise<{
  error: Error | null;
  updated: boolean;
}> {
  const { data, error: sessionError } = await supabase().auth.getSession();
  const session = data?.session;
  const userId = session?.user?.id;
  if (sessionError || !userId)
    return { error: new Error('Session expired. Please sign in again.'), updated: false };

  let query = supabase()
    .from('connection_requests')
    .update({
      status: 'approved',
      responded_at: new Date().toISOString(),
      responded_by: userId,
    })
    .eq('id', requestId)
    .eq('status', 'pending');
  if (receivingOrgId) query = query.eq('to_organization_id', receivingOrgId);

  const { data: updateData, error } = await query.select('id');
  if (error) return { error: new Error(error.message), updated: false };
  const updated = Array.isArray(updateData) && updateData.length > 0;
  return { error: null, updated };
}

/**
 * Reject a connection request (caller must be member of to_organization_id).
 * Updates only when status is pending.
 */
export async function rejectConnectionRequest(requestId: string, receivingOrgId?: string): Promise<{
  error: Error | null;
  updated: boolean;
}> {
  const { data, error: sessionError } = await supabase().auth.getSession();
  const session = data?.session;
  const userId = session?.user?.id;
  if (sessionError || !userId)
    return { error: new Error('Session expired. Please sign in again.'), updated: false };

  let query = supabase()
    .from('connection_requests')
    .update({
      status: 'rejected',
      responded_at: new Date().toISOString(),
      responded_by: userId,
    })
    .eq('id', requestId)
    .eq('status', 'pending');
  if (receivingOrgId) query = query.eq('to_organization_id', receivingOrgId);

  const { data: updateData, error } = await query.select('id');
  if (error) return { error: new Error(error.message), updated: false };
  const updated = Array.isArray(updateData) && updateData.length > 0;
  return { error: null, updated };
}

/**
 * Withdraw a connection request that you have sent.
 * Deletes the pending request row (true withdraw).
 */
export async function cancelConnectionRequest(requestId: string): Promise<{
  error: Error | null;
  deleted: boolean;
}> {
  const { data, error } = await supabase()
    .from('connection_requests')
    .delete()
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');
  if (error) return { error: new Error(error.message), deleted: false };
  const deleted = Array.isArray(data) && data.length > 0;
  return { error: null, deleted };
}

export async function cancelPendingConnectionRequestByOrgPair(
  fromOrgId: string,
  toOrgId: string,
): Promise<{ error: Error | null; deleted: boolean }> {
  const { data, error } = await supabase()
    .from('connection_requests')
    .delete()
    .eq('from_organization_id', fromOrgId)
    .eq('to_organization_id', toOrgId)
    .eq('status', 'pending')
    .select('id');
  if (error) return { error: new Error(error.message), deleted: false };
  const deleted = Array.isArray(data) && data.length > 0;
  return { error: null, deleted };
}

/**
 * Withdraw all pending sent invites to orgs owned by the same user (cleans duplicate-contact shells).
 */
export async function cancelPendingConnectionRequestsForPartnerOwner(
  fromOrgId: string,
  partnerOwnerId: string,
): Promise<{ error: Error | null; deleted: boolean; deletedIds: string[] }> {
  const { data, error } = await supabase().rpc(
    "cancel_pending_sent_connections_to_partner_owner",
    {
      p_from_org_id: fromOrgId,
      p_partner_owner_id: partnerOwnerId,
    },
  );
  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (
      msg.includes("function") &&
      (msg.includes("does not exist") || msg.includes("not found"))
    ) {
      return {
        error: new Error(
          "System update required: cannot recall duplicate-contact invites. Apply latest database migrations.",
        ),
        deleted: false,
        deletedIds: [],
      };
    }
    return { error: new Error(error.message), deleted: false, deletedIds: [] };
  }
  const deletedIds = Array.isArray(data)
    ? data.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  return {
    error: null,
    deleted: deletedIds.length > 0,
    deletedIds,
  };
}
