/**
 * Row shapes from DB views — safe projections for supplier/driver clients.
 * Derived from trips_supplier_view and trips_driver_view.
 */
import type { TripRow } from '@/features/trips/services/trips.service';

/** Safe to send to supplier clients (no shipper operational ids). */
export type SupplierTripRow = {
  id: string;
  booking_ref: string | null;
  source_indent_code: string | null;
  supplier_trip_sequence: number | null;
  status: string;
  pickup_location: string | null;
  pickup_address: string | null;
  pickup_scheduled_at: string | null;
  dropoff_location: string | null;
  dropoff_address: string | null;
  dropoff_scheduled_at: string | null;
  assigned_driver_id: string | null;
  driver_display_trip_id: string | null;
  vehicle_id: string | null;
  instructions: string | null;
  created_at: string;
  updated_at: string;
};

/** Safe to send to driver clients (no booking_ref or shipper operational ids). */
export type DriverTripRow = {
  id: string;
  driver_id?: string | null;
  driver_display_trip_id: string | null;
  status: string;
  pickup_location: string | null;
  pickup_address: string | null;
  pickup_scheduled_at: string | null;
  dropoff_location: string | null;
  dropoff_address: string | null;
  dropoff_scheduled_at: string | null;
  instructions: string | null;
  vehicle_id: string | null;
  pickup_lat?: number | null;
  pickup_lon?: number | null;
  drop_lat?: number | null;
  drop_lon?: number | null;
  started_at?: string | null;
  created_at: string;
  updated_at: string;
  client_price?: number | null;
  supplier_rate?: number | null;
  driver_commission?: number | null;
  distance?: number | null;
  supplier_id?: string | null;
  /**
   * Owning (dispatching) org. REQUIRED by the driver wallet to classify a trip as
   * fleet vs open — DriverWalletScreen's isEmployerOrgAtDate returns false
   * immediately when this is empty, which sends every trip to Open Trips.
   * Must stay projected by trips_driver_view.
   */
  organization_id?: string | null;
  /**
   * Dispatching org's display name, resolved by the view. The driver cannot read
   * `organizations` directly (RLS is is_org_member and drivers aren't members),
   * so without this the wallet can only print a generic "Fleet" label.
   */
  organization_name?: string | null;
  /** Trip origin ('direct_quote' | 'mover_asset' | 'manual' | …). Drives mover-asset UI. */
  source?: string | null;
  completed_at?: string | null;
  trip_number?: string | null;
  indent_id?: string | null;
  source_indent_id?: string | null;
  /** Authoritative Commerce origin from trips_driver_view (indents.execution_plan_id). */
  execution_plan_id?: string | null;
  is_commerce?: boolean;
  /** Asset vs market — drives driver expense / odometer capabilities. */
  trip_payout_mode?: string | null;
  operating_mode?: string | null;
  dco_payee_id?: string | null;
  start_odometer_km?: number | null;
  end_odometer_km?: number | null;
  odometer_distance_km?: number | null;
  gps_distance_km?: number | null;
  distance_discrepancy_km?: number | null;
  distance_source?: string | null;
  odometer_verification_state?: string | null;
  odometer_notes?: string | null;
  odometer_updated_at?: string | null;
  /** Explicit Fleet Owner / Driver-cum-Owner vehicle link. Nullable until set via set_trip_owner_vehicle(). */
  owner_vehicle_id?: string | null;
};

/** Map supplier view row → legacy TripRow for screens not yet migrated off TripRow. */
export function supplierRowToTripRow(row: SupplierTripRow): TripRow {
  return {
    id: row.id,
    organization_id: '',
    trip_number: row.booking_ref ?? row.id,
    booking_ref: row.booking_ref,
    source_indent_code: row.source_indent_code,
    supplier_trip_sequence: row.supplier_trip_sequence,
    status: row.status,
    pickup_area: row.pickup_location ?? '',
    drop_location: row.dropoff_location ?? '',
    pickup_date: row.pickup_scheduled_at,
    notes: row.instructions,
    driver_id: row.assigned_driver_id,
    driver_display_trip_id: row.driver_display_trip_id,
    vehicle_id: row.vehicle_id,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    indent_id: null,
    source: 'indent',
    client_name: '',
    client_price: 0,
    supplier_rate: 0,
    margin: 0,
    platform_fee: 0,
    driver_commission: 0,
    is_guaranteed: false,
    payment_status: 'pending',
    amount_paid: 0,
    distance: null,
    estimated_duration: null,
    client_id: null,
    supplier_id: null,
    load_type: null,
    started_at: null,
    completed_at: null,
  };
}

/** Map full trips row → driver-safe projection when trips_driver_view returns empty. */
export function tripRowToDriverTripRow(
  row: Pick<
    TripRow,
    | 'id'
    | 'driver_id'
    | 'driver_display_trip_id'
    | 'trip_number'
    | 'status'
    | 'pickup_area'
    | 'drop_location'
    | 'pickup_date'
    | 'pickup_lat'
    | 'pickup_lon'
    | 'drop_lat'
    | 'drop_lon'
    | 'notes'
    | 'vehicle_id'
    | 'started_at'
    | 'created_at'
    | 'updated_at'
    | 'client_price'
    | 'supplier_rate'
    | 'driver_commission'
    | 'distance'
    | 'supplier_id'
    | 'organization_id'
    | 'organization_name'
    | 'source'
    | 'completed_at'
    | 'indent_id'
    | 'trip_payout_mode'
    | 'operating_mode'
    | 'dco_payee_id'
    | 'start_odometer_km'
    | 'end_odometer_km'
    | 'odometer_distance_km'
    | 'gps_distance_km'
    | 'distance_discrepancy_km'
    | 'distance_source'
    | 'odometer_verification_state'
    | 'odometer_notes'
    | 'odometer_updated_at'
    | 'owner_vehicle_id'
  >,
): DriverTripRow {
  return {
    id: row.id,
    driver_id: row.driver_id ?? null,
    driver_display_trip_id: row.driver_display_trip_id ?? row.trip_number ?? null,
    status: row.status,
    pickup_location: row.pickup_area ?? null,
    pickup_address: row.pickup_area ?? null,
    pickup_scheduled_at: row.pickup_date ?? null,
    dropoff_location: row.drop_location ?? null,
    dropoff_address: row.drop_location ?? null,
    dropoff_scheduled_at: null,
    instructions: row.notes ?? null,
    vehicle_id: row.vehicle_id ?? null,
    pickup_lat: row.pickup_lat ?? null,
    pickup_lon: row.pickup_lon ?? null,
    drop_lat: row.drop_lat ?? null,
    drop_lon: row.drop_lon ?? null,
    started_at: row.started_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    client_price: row.client_price ?? null,
    supplier_rate: row.supplier_rate ?? null,
    driver_commission: row.driver_commission ?? null,
    distance: (() => {
      const raw = row.distance;
      if (raw == null) return null;
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? n : null;
    })(),
    supplier_id: row.supplier_id ?? null,
    // Carried through so the fallback path classifies identically to the view.
    organization_id: row.organization_id ?? null,
    organization_name: row.organization_name ?? null,
    source: row.source ?? null,
    completed_at: row.completed_at ?? null,
    trip_number: row.trip_number ?? null,
    indent_id: row.indent_id ?? null,
    trip_payout_mode: row.trip_payout_mode ?? null,
    operating_mode: row.operating_mode ?? null,
    dco_payee_id: row.dco_payee_id ?? null,
    start_odometer_km: row.start_odometer_km ?? null,
    end_odometer_km: row.end_odometer_km ?? null,
    odometer_distance_km: row.odometer_distance_km ?? null,
    gps_distance_km: row.gps_distance_km ?? null,
    distance_discrepancy_km: row.distance_discrepancy_km ?? null,
    distance_source: row.distance_source ?? null,
    odometer_verification_state: row.odometer_verification_state ?? null,
    odometer_notes: row.odometer_notes ?? null,
    odometer_updated_at: row.odometer_updated_at ?? null,
    owner_vehicle_id: row.owner_vehicle_id ?? null,
  };
}

/** Map driver view row → legacy TripRow for driver UI until fully on DriverTripRow. */
export function driverRowToTripRow(row: DriverTripRow): TripRow {
  return {
    id: row.id,
    // Must come from the row. Hardcoding '' here made isEmployerOrgAtDate fail for
    // every trip, so the driver Fleet Trips tab was always empty. See
    // supabase/migrations/20270118000000_driver_view_expose_org_and_source.sql.
    organization_id: row.organization_id ?? '',
    organization_name: row.organization_name ?? null,
    trip_number: row.driver_display_trip_id ?? row.id,
    driver_display_trip_id: row.driver_display_trip_id,
    status: row.status,
    pickup_area: row.pickup_location ?? '',
    drop_location: row.dropoff_location ?? '',
    pickup_date: row.pickup_scheduled_at,
    pickup_lat: row.pickup_lat ?? null,
    pickup_lon: row.pickup_lon ?? null,
    drop_lat: row.drop_lat ?? null,
    drop_lon: row.drop_lon ?? null,
    notes: row.instructions ?? (row as DriverTripRow & { notes?: string | null }).notes ?? null,
    vehicle_id: row.vehicle_id,
    started_at: row.started_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    indent_id: row.indent_id ?? null,
    source_indent_id: row.source_indent_id ?? null,
    execution_plan_id: row.execution_plan_id ?? null,
    is_commerce: Boolean(row.is_commerce || row.execution_plan_id),
    // Real source, not a hardcoded 'assigned' — mover_asset rows must stay
    // identifiable so the wallet can tell supplier-side trips from dispatches.
    source: row.source ?? 'assigned',
    client_name:
      (row as DriverTripRow & { client_name?: string | null }).client_name ?? '',
    client_price: row.client_price ?? 0,
    supplier_rate: row.supplier_rate ?? 0,
    margin: 0,
    platform_fee: 0,
    driver_commission: row.driver_commission ?? 0,
    is_guaranteed: false,
    payment_status: 'pending',
    amount_paid: 0,
    distance: row.distance ?? null,
    estimated_duration: null,
    client_id: (row as DriverTripRow & { client_id?: string | null }).client_id ?? null,
    supplier_id: row.supplier_id ?? null,
    driver_id: row.driver_id ?? null,
    load_type: null,
    completed_at: row.completed_at ?? null,
    trip_payout_mode: row.trip_payout_mode ?? null,
    operating_mode: row.operating_mode ?? null,
    dco_payee_id: row.dco_payee_id ?? null,
    start_odometer_km: row.start_odometer_km ?? null,
    end_odometer_km: row.end_odometer_km ?? null,
    odometer_distance_km: row.odometer_distance_km ?? null,
    gps_distance_km: row.gps_distance_km ?? null,
    distance_discrepancy_km: row.distance_discrepancy_km ?? null,
    distance_source: row.distance_source ?? null,
    odometer_verification_state: row.odometer_verification_state ?? null,
    odometer_notes: row.odometer_notes ?? null,
    odometer_updated_at: row.odometer_updated_at ?? null,
    owner_vehicle_id: row.owner_vehicle_id ?? null,
  };
}
