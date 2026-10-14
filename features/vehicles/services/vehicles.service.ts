/**
 * Vehicles service — Supabase only (mobile). Same DB as pulse-unified-base.
 */
import { supabase } from '@/lib/supabase';
import { formatIndianVehicleNumber } from '@/lib/format';
import { DEFAULT_PAGE_SIZE, type PageOpts } from '@/lib/pagination';
import { syncDomainRows } from '@/lib/cache/domainSync';
import { mergeDeltaRows } from '@/lib/cache/mergeDelta';
import type { DeltaResponse } from '@/lib/cache/deltaTypes';
import type { VehicleDocuments } from '../utils/vehicleDocuments.util';

export interface VehicleRow {
  id: string;
  organization_id: string;
  vehicle_number: string;
  vehicle_type: string | null;
  capacity: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_body_type: string | null;
  vehicle_size: string | null;
  vehicle_axle: string | null;
  status: string;
  type: string;
  documents: VehicleDocuments | null;
  avatar_url?: string | null;
  avatar_seed?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Vehicle source: organization (your fleet) or partner (supplier/partner org).
 * Backend/Supabase: public.vehicles already has type ('owned'|'adhoc') and optional supplier_id.
 * We map vehicleSource → type: organization→'owned', partner→'adhoc'. supplier_id can be set
 * when UI adds a supplier picker for partner vehicles.
 */
export type VehicleSource = 'organization' | 'partner';

export interface VehicleInsert {
  vehicleSource?: VehicleSource;
  vehicle_number: string;
  vehicle_type?: string;
  capacity?: string;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  vehicle_body_type?: string | null;
  vehicle_size?: string | null;
  vehicle_axle?: string | null;
  documents?: VehicleDocuments;
}

export async function getVehiclesByOrganization(
  orgId: string,
  opts?: PageOpts
): Promise<{ error: Error | null; vehicles: VehicleRow[]; hasMore?: boolean }> {
  const base = () =>
    supabase()
      .from('vehicles')
      .select('*')
      .eq('organization_id', orgId)
      .eq('type', 'owned')
      .order('created_at', { ascending: false });
  if (opts != null) {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await base().range(offset, offset + limit);
    if (error) return { error: new Error(error.message), vehicles: [] };
    const raw = (data ?? []) as VehicleRow[];
    const hasMore = raw.length > limit;
    return { error: null, vehicles: hasMore ? raw.slice(0, limit) : raw, hasMore };
  }
  const { data, error } = await base();
  if (error) return { error: new Error(error.message), vehicles: [] };
  return { error: null, vehicles: (data ?? []) as VehicleRow[] };
}

export async function getVehiclesDelta(
  orgId: string,
  since: { updatedAt: string; tieBreakerId?: string | null },
): Promise<{ error: Error | null; delta: DeltaResponse<VehicleRow> }> {
  const { data, error } = await supabase().rpc('get_vehicles_delta', {
    p_org_id: orgId,
    p_since: since.updatedAt,
    p_limit: 1000,
  });
  if (error) return { error: new Error(error.message), delta: { changed: [], deletedIds: [], nextCursor: since } };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { changed?: VehicleRow[]; deleted_ids?: string[]; next_cursor?: string | null }
    | null;
  return {
    error: null,
    delta: {
      changed: (row?.changed ?? []) as VehicleRow[],
      deletedIds: (row?.deleted_ids ?? []) as string[],
      nextCursor: row?.next_cursor ? { updatedAt: row.next_cursor } : since,
    },
  };
}

export async function syncVehiclesWithCache(orgId: string, currentRows: VehicleRow[]) {
  try {
    const vehicles = await syncDomainRows<VehicleRow>({
      domain: 'vehicles',
      orgId,
      schemaVersion: '1',
      policy: { maxDeltaLagMs: 5 * 60_000, fullSyncEveryMs: 8 * 60 * 60_000 },
      currentRows,
      getFull: async () => {
        const res = await getVehiclesByOrganization(orgId);
        if (res.error) throw res.error;
        return res.vehicles;
      },
      getDelta: async (cursor) => {
        const res = await getVehiclesDelta(orgId, cursor);
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
    return { error: null, vehicles };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), vehicles: currentRows };
  }
}

export async function getVehicleById(
  orgId: string,
  vehicleId: string,
  signal?: AbortSignal,
): Promise<{ error: Error | null; vehicle: VehicleRow | null }> {
  const query = supabase()
    .from('vehicles')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', vehicleId);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();
  if (error) return { error: new Error(error.message), vehicle: null };
  return { error: null, vehicle: data as VehicleRow | null };
}

/** Point lookup on (organization_id, vehicle_number). Tries the compact plate and the raw text. */
export async function findVehicleByPlate(
  orgId: string,
  plate: string,
): Promise<{ error: Error | null; vehicle: VehicleRow | null }> {
  const compact = formatIndianVehicleNumber(plate).trim();
  const raw = plate.trim();
  const numbers = Array.from(new Set([compact, raw].filter(Boolean)));
  for (const vehicleNumber of numbers) {
    const { data, error } = await supabase()
      .from("vehicles")
      .select("id, organization_id, vehicle_number, vehicle_type, documents, status, type, created_at, updated_at")
      .eq("organization_id", orgId)
      .eq("vehicle_number", vehicleNumber)
      .limit(1)
      .maybeSingle();
    if (error) return { error: new Error(error.message), vehicle: null };
    if (data) return { error: null, vehicle: data as VehicleRow };
  }
  return { error: null, vehicle: null };
}

/**
 * Read-only, minimal vehicle info for a viewer org that does not own the
 * vehicle but has a legitimate trip referencing it (e.g. an aggregator
 * viewing the vendor's own truck on a subcontracted trip). Returns only
 * basic fields + documents — no trip history/ledger/driver list, which stay
 * scoped to the vehicle's own organization.
 */
export async function getVehicleForTripViewer(
  vehicleId: string,
  tripId: string,
  viewerOrgId: string,
): Promise<{ error: Error | null; vehicle: VehicleRow | null }> {
  const { data, error } = await supabase().rpc('get_vehicle_for_trip_viewer', {
    p_vehicle_id: vehicleId,
    p_trip_id: tripId,
    p_viewer_org_id: viewerOrgId,
  });
  if (error) return { error: new Error(error.message), vehicle: null };
  return { error: null, vehicle: (data as VehicleRow | null) ?? null };
}

export async function createVehicle(
  orgId: string,
  payload: VehicleInsert
): Promise<{ error: Error | null; vehicle: VehicleRow | null }> {
  // DB: vehicles.type = 'owned' | 'adhoc'; vehicles.supplier_id optional for partner
  const type = payload.vehicleSource === 'partner' ? 'adhoc' : 'owned';
  const { data, error } = await supabase()
    .from('vehicles')
    .insert({
      organization_id: orgId,
      vehicle_number: (payload.vehicle_number ?? '').trim(),
      vehicle_type: (payload.vehicle_type ?? '').trim() || null,
      capacity: (payload.capacity ?? '').trim() || null,
      vehicle_brand: (payload.vehicle_brand ?? '').trim() || null,
      vehicle_model: (payload.vehicle_model ?? '').trim() || null,
      vehicle_body_type: (payload.vehicle_body_type ?? '').trim() || null,
      vehicle_size: (payload.vehicle_size ?? '').trim() || null,
      vehicle_axle: (payload.vehicle_axle ?? '').trim() || null,
      documents: payload.documents ?? {},
      status: 'active',
      type,
      // supplier_id: set when partner and we have a supplier picker (optional)
    } as Record<string, unknown>)
    .select()
    .single();
  if (error) {
    const message =
      error.message?.includes('idx_vehicles_org_number') ||
      error.message?.includes('duplicate key')
        ? 'A vehicle with this registration number is already added for your organization. Use a different number.'
        : error.message;
    return { error: new Error(message), vehicle: null };
  }
  return { error: null, vehicle: data as VehicleRow };
}

export interface UpdateVehicleData {
  vehicle_number?: string;
  vehicle_brand?: string | null;
  vehicle_body_type?: string | null;
  vehicle_size?: string | null;
  vehicle_axle?: string | null;
  documents?: VehicleDocuments;
  avatar_url?: string | null;
  avatar_seed?: string | null;
}

export async function updateVehicle(
  orgId: string,
  vehicleId: string,
  patch: UpdateVehicleData
): Promise<{ error: Error | null; vehicle: VehicleRow | null }> {
  const updates: Record<string, unknown> = {};
  if (patch.vehicle_number !== undefined) updates.vehicle_number = (patch.vehicle_number ?? '').trim();
  if (patch.vehicle_brand !== undefined) updates.vehicle_brand = (patch.vehicle_brand ?? '').trim() || null;
  if (patch.vehicle_body_type !== undefined) updates.vehicle_body_type = (patch.vehicle_body_type ?? '').trim() || null;
  if (patch.vehicle_size !== undefined) updates.vehicle_size = (patch.vehicle_size ?? '').trim() || null;
  if (patch.vehicle_axle !== undefined) updates.vehicle_axle = (patch.vehicle_axle ?? '').trim() || null;
  if (patch.vehicle_body_type !== undefined) updates.vehicle_type = (patch.vehicle_body_type ?? '').trim() || null;
  if (patch.documents !== undefined) updates.documents = patch.documents;
  if (patch.avatar_url !== undefined) updates.avatar_url = patch.avatar_url;
  if (patch.avatar_seed !== undefined) updates.avatar_seed = patch.avatar_seed;
  if (Object.keys(updates).length === 0) return { error: null, vehicle: null };
  const { data, error } = await supabase()
    .from('vehicles')
    .update(updates)
    .eq('organization_id', orgId)
    .eq('id', vehicleId)
    .select()
    .single();
  if (error) return { error: new Error(error.message), vehicle: null };
  return { error: null, vehicle: data as VehicleRow };
}
