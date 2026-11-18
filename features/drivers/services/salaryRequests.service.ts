/**
 * Driver salary requests — single source of truth for driver_salary_requests table.
 * Driver requests salary from the org (fleet); org can Approve & Pay or Reject.
 * DB: public.driver_salary_requests (RLS: driver INSERT/SELECT own; org members manage by org).
 */
import { chunkIdsForRead, readAllPages } from "@/lib/pagination";
import { supabase } from '@/lib/supabase';

export type SalaryRequestType = 'monthly' | 'advance' | 'trip_based' | 'reward';

/** Max amount (₹) to avoid typos; DB allows numeric(12,2). */
const MAX_AMOUNT = 99_99_99_999;

export interface SalaryRequestRow {
  id: string;
  organization_id: string;
  driver_id: string;
  request_type: string;
  amount: number;
  currency: string;
  status: string;
  note: string | null;
  trip_ids: string[];
  cash_entry_id: string | null;
  /** For request_type 'monthly': first day of month (ISO date string from DB). */
  salary_month: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Create a salary request. Persists to driver_salary_requests; RLS enforces driver can insert own.
 * For request_type 'trip_based', pass options.tripIds. For 'monthly', pass options.salaryMonth (ISO date, first day of month).
 */
export async function createSalaryRequest(
  driverId: string,
  organizationId: string,
  requestType: SalaryRequestType,
  amount: number,
  options?: { note?: string | null; createdBy?: string | null; tripIds?: string[]; salaryMonth?: string }
): Promise<{ error: Error | null; request: SalaryRequestRow | null }> {
  const num = Number(amount);
  if (!Number.isFinite(num) || num <= 0) {
    return { error: new Error('Amount must be greater than 0'), request: null };
  }
  if (num > MAX_AMOUNT) {
    return { error: new Error(`Amount cannot exceed ₹${MAX_AMOUNT.toLocaleString('en-IN')}`), request: null };
  }
  const payload: Record<string, unknown> = {
    driver_id: driverId,
    organization_id: organizationId,
    request_type: requestType,
    amount: num,
    currency: 'INR',
    status: 'pending' as const,
    note: options?.note?.trim() || null,
    created_by: options?.createdBy ?? null,
  };
  if (requestType === 'trip_based' && options?.tripIds?.length) {
    payload.trip_ids = options.tripIds;
  }
  if (requestType === 'monthly' && options?.salaryMonth) {
    payload.salary_month = options.salaryMonth;
  }
  const { data, error } = await supabase()
    .from('driver_salary_requests')
    .insert(payload as Record<string, unknown>)
    .select()
    .single();
  if (error) return { error: new Error(error.message), request: null };
  return { error: null, request: data as SalaryRequestRow };
}

/**
 * List salary requests for the given driver ids (driver app). RLS: driver can read own.
 */
export async function getSalaryRequestsByDriverIds(
  driverIds: string[]
): Promise<{ error: Error | null; requests: SalaryRequestRow[] }> {
  if (driverIds.length === 0) return { error: null, requests: [] };
  const merged: SalaryRequestRow[] = [];
  const seen = new Set<string>();
  for (const chunk of chunkIdsForRead(driverIds)) {
    const page = await readAllPages<{
      id: string;
      organization_id: string;
      driver_id: string;
      request_type: string;
      amount: number;
      currency: string;
      status: string;
      note: string | null;
      trip_ids: string[] | null;
      cash_entry_id: string | null;
      salary_month: string | null;
      created_at: string | null;
      updated_at: string | null;
      created_by: string | null;
    }, { message: string }>(async (afterId, limit) => {
      let query = supabase().from("driver_salary_requests").select("*").in("driver_id", chunk);
      if (afterId) query = query.gt("id", afterId);
      const result = await query.order("id", { ascending: true }).limit(limit);
      return { data: result.data, error: result.error };
    });
    if (page.error) return { error: new Error(page.error.message), requests: [] };
    for (const row of page.data ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push({
        ...row,
        trip_ids: row.trip_ids ?? [],
        created_at: row.created_at ?? "",
        updated_at: row.updated_at ?? "",
      });
    }
  }
  merged.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { error: null, requests: merged };
}

/** Single salary request for the driver app detail view (RLS: own requests only). */
export async function getSalaryRequestByIdForDriver(
  requestId: string,
): Promise<{ error: Error | null; request: SalaryRequestRow | null }> {
  const { data, error } = await supabase()
    .from('driver_salary_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), request: null };
  return { error: null, request: (data as SalaryRequestRow | null) ?? null };
}

/** Row returned for org: request + driver name from join. */
export interface SalaryRequestWithDriverRow extends SalaryRequestRow {
  drivers?: {
    name: string | null;
    user_id?: string | null;
    avatar_url?: string | null;
    avatar_seed?: string | null;
    /** @deprecated PostgREST has no drivers→profiles FK; use avatar_url on drivers. */
    profiles?: {
      avatar_url?: string | null;
      avatar_seed?: string | null;
    } | null;
  } | null;
}

const SALARY_REQUEST_ORG_SELECT =
  "*, drivers(name, user_id, avatar_url, avatar_seed)";

/**
 * List salary requests for an organization (fleet/dispatcher view). RLS: org members can read for their org.
 */
export type SalaryRequestsListOptions = {
  status?: 'pending' | 'approved' | 'rejected' | 'paid';
  /** Page size for registry bootstrap / load-more (keeps DB reads bounded). */
  limit?: number;
  offset?: number;
};

export async function getSalaryRequestsByOrganization(
  organizationId: string,
  statusOrOptions?: 'pending' | 'approved' | 'rejected' | 'paid' | SalaryRequestsListOptions,
): Promise<{ error: Error | null; requests: SalaryRequestWithDriverRow[] }> {
  const options: SalaryRequestsListOptions =
    typeof statusOrOptions === 'string' || statusOrOptions === undefined
      ? { status: statusOrOptions }
      : statusOrOptions;

  let q = supabase()
    .from('driver_salary_requests')
    .select(SALARY_REQUEST_ORG_SELECT)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  if (options.status) q = q.eq('status', options.status);
  if (options.limit != null && options.limit > 0) {
    const offset = Math.max(0, options.offset ?? 0);
    q = q.range(offset, offset + options.limit - 1);
  }
  const { data, error } = await q;
  if (error) return { error: new Error(error.message), requests: [] };
  return { error: null, requests: (data ?? []) as SalaryRequestWithDriverRow[] };
}

export async function getSalaryRequestByIdForOrganization(
  organizationId: string,
  requestId: string,
): Promise<{ error: Error | null; request: SalaryRequestWithDriverRow | null }> {
  const { data, error } = await supabase()
    .from('driver_salary_requests')
    .select(SALARY_REQUEST_ORG_SELECT)
    .eq('organization_id', organizationId)
    .eq('id', requestId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), request: null };
  return { error: null, request: (data as SalaryRequestWithDriverRow | null) ?? null };
}

/**
 * Update salary request status (org side: approve & pay or reject). RLS: org members can update for their org.
 */
export async function updateSalaryRequestStatus(
  requestId: string,
  status: 'approved' | 'rejected' | 'paid',
  options?: { cashEntryId?: string | null }
): Promise<{ error: Error | null }> {
  const payload: Record<string, unknown> = { status };
  if (options?.cashEntryId !== undefined) payload.cash_entry_id = options.cashEntryId;
  const { error } = await supabase()
    .from('driver_salary_requests')
    .update(payload)
    .eq('id', requestId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
