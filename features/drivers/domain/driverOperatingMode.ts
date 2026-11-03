/**
 * Driver vs DCO operating mode — client mirror of the server-resolved state
 * returned by get_my_driver_operating_mode()
 * (Pulse-app supabase/migrations/20271005120000_dco_operating_model_boundary.sql).
 *
 * The server is the authority: Marketplace listing/bidding, employee-driver
 * linking and FLEET trip assignment are all enforced there. This module only
 * parses that answer and derives display/routing decisions from it — it must
 * not recompute DCO status from dco_profiles, owner_vehicles or drivers rows.
 */
import { isFleetTripMarked } from '../utils/driverFleetTripMark.util';
import { isDcoOperatingTrip } from '../../trips/domain/tripDcoOperating';

export type DriverOperatingModeKind =
  | 'DRIVER'
  | 'DCO'
  | 'DCO_VEHICLE_REQUIRED'
  | 'DCO_SUSPENDED'
  | 'DCO_EMPLOYMENT_CONFLICT';

export type DriverOperatingMode = {
  mode: DriverOperatingModeKind;
  dcoStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  isEmployeeDriver: boolean;
  hasActiveVehicle: boolean;
  marketplaceAllowed: boolean;
};

const MODES: readonly DriverOperatingModeKind[] = [
  'DRIVER',
  'DCO',
  'DCO_VEHICLE_REQUIRED',
  'DCO_SUSPENDED',
  'DCO_EMPLOYMENT_CONFLICT',
];

const DCO_STATUSES: readonly DriverOperatingMode['dcoStatus'][] = [
  'NONE',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
];

/** Fail-closed default while loading or on error: plain driver, no Marketplace. */
export const DEFAULT_DRIVER_OPERATING_MODE: DriverOperatingMode = {
  mode: 'DRIVER',
  dcoStatus: 'NONE',
  isEmployeeDriver: false,
  hasActiveVehicle: false,
  marketplaceAllowed: false,
};

export function parseDriverOperatingMode(raw: unknown): DriverOperatingMode {
  if (!raw || typeof raw !== 'object') return DEFAULT_DRIVER_OPERATING_MODE;
  const r = raw as Record<string, unknown>;
  const mode = MODES.includes(r.mode as DriverOperatingModeKind)
    ? (r.mode as DriverOperatingModeKind)
    : 'DRIVER';
  const dcoStatus = DCO_STATUSES.includes(r.dco_status as DriverOperatingMode['dcoStatus'])
    ? (r.dco_status as DriverOperatingMode['dcoStatus'])
    : 'NONE';
  return {
    mode,
    dcoStatus,
    isEmployeeDriver: r.is_employee_driver === true,
    hasActiveVehicle: r.has_active_vehicle === true,
    // Both must agree; a malformed payload never grants access.
    marketplaceAllowed: mode === 'DCO' && r.marketplace_allowed === true,
  };
}

/** True for every state where the person holds DCO status (never an employee-driver mode). */
export function isDcoOperatingMode(m: DriverOperatingMode): boolean {
  return m.mode !== 'DRIVER';
}

/**
 * DCO is the only owner-operator concept (there is no separate Fleet Owner
 * capability). Mirrors the server's is_dco_eligible(): approved and not
 * employed. Vehicle is deliberately not required so the first one can be added.
 */
export function canManageOwnerVehicles(m: DriverOperatingMode): boolean {
  return m.mode === 'DCO' || m.mode === 'DCO_VEHICLE_REQUIRED';
}

/**
 * DCO Self shipper CRM / Party B book. Employees and independents never get this.
 */
export function canAddDcoShippers(m: DriverOperatingMode): boolean {
  return canManageOwnerVehicles(m);
}

/** DCO Self book (parties, issue, collect). Same gate as shipper CRM. */
export function canManageDcoSelfBook(m: DriverOperatingMode): boolean {
  return canAddDcoShippers(m);
}

/**
 * Independent DRIVER book — separate from DCO Self and employer ledger.
 * Plain DRIVER who is not an active fleet employee.
 */
export function canManageIndieBook(m: DriverOperatingMode): boolean {
  return m.mode === 'DRIVER' && !m.isEmployeeDriver;
}

/**
 * Offline customer tagging / capture entry.
 * DCO → Self book. Independent DRIVER → indie book. Employees attribute to employer.
 */
export function canTagOfflineParty(m: DriverOperatingMode): boolean {
  return canManageDcoSelfBook(m) || canManageIndieBook(m);
}

/** Fleet employee attribution path (Control / History). */
export function canAttributeToEmployer(m: DriverOperatingMode): boolean {
  return m.mode === 'DRIVER' && m.isEmployeeDriver;
}

/**
 * Wallet primary book tab / header label — terminology only, not a destination change.
 * DCO Self → "Self"; independent DRIVER → "Independent"; fleet employee → "Fleet".
 */
export function driverWalletBookTabLabel(m: DriverOperatingMode): string {
  if (canManageDcoSelfBook(m)) return 'Self';
  if (canManageIndieBook(m)) return 'Independent';
  return 'Fleet';
}

/** Short copy for saved-party lists (Add Client / tag picker). */
export function driverOfflinePartyBookKicker(m: DriverOperatingMode): string {
  if (canManageDcoSelfBook(m)) return 'Saved in Self';
  if (canManageIndieBook(m)) return 'Saved customers';
  return 'Saved parties';
}

type RelationshipRow = {
  left_at?: string | null;
  relationship_status?: string | null;
  relationship_origin?: string | null;
};

function isMarketAwardStub(d: RelationshipRow): boolean {
  return String(d.relationship_origin ?? '').trim().toLowerCase() === 'market_award';
}

/**
 * Current businesses vs previous fleets from the person's own drivers rows.
 * "Current" keeps isActiveFleetRelationshipDriver's membership (active_employee
 * or independent phone-assignment) minus Marketplace award stubs
 * (relationship_origin='market_award'), which are never an employer, current
 * or historical. Previous fleets are history only and grant
 * nothing — the server refuses to re-activate them for a DCO.
 */
export function splitEmployerRelationships<T extends RelationshipRow>(
  rows: readonly T[],
): { current: T[]; previous: T[] } {
  const current: T[] = [];
  const previous: T[] = [];
  for (const d of rows) {
    if (isMarketAwardStub(d)) continue;
    const left = d.left_at != null && String(d.left_at).trim() !== '';
    const status = String(d.relationship_status ?? '').trim().toLowerCase();
    if (!left && (status === 'active_employee' || status === 'independent')) current.push(d);
    else if (left || status === 'disconnected') previous.push(d);
  }
  return { current, previous };
}

export type DriverJobSource = 'marketplace_award' | 'dco_direct' | 'business_assigned';

/**
 * Where a trip on the driver's list came from, from canonical trip columns only:
 * trips.source='market_bid' is a Marketplace award (including pre-DCO-4 rows);
 * any other trips.operating_mode='DCO' trip is DCO work from another award path;
 * everything else is business/employer-assigned FLEET work.
 */
export function driverJobSource(trip: {
  source?: string | null;
  operating_mode?: string | null;
}): DriverJobSource {
  if (String(trip.source ?? '').trim() === 'market_bid') return 'marketplace_award';
  if (isDcoOperatingTrip(trip)) return 'dco_direct';
  return 'business_assigned';
}

/** History chips: DCO = Offline + Marketplace; connected employee = Fleet + Offline. */
export type DriverHistoryLane = 'marketplace' | 'offline' | 'fleet';
export type DriverHistoryTabId = 'offline' | 'marketplace' | 'fleet';

export function driverHistoryLane(
  trip: {
    source?: string | null;
    operating_mode?: string | null;
    notes?: string | null;
  },
  isFleetDispatched: boolean,
): DriverHistoryLane {
  if (driverJobSource(trip) === 'marketplace_award') return 'marketplace';
  if (isFleetDispatched || isFleetTripMarked(trip.notes)) return 'fleet';
  return 'offline';
}

/** Card chip: DCO sees Offline / Marketplace; employee sees Offline / Fleet. */
export function driverHistoryLaneLabel(lane: DriverHistoryLane): string {
  if (lane === "marketplace") return "Marketplace trip";
  if (lane === "fleet") return "Fleet trip";
  return "Offline trip";
}

export function driverHistoryTabsForMode(isDco: boolean): readonly DriverHistoryTabId[] {
  return isDco ? (['offline', 'marketplace'] as const) : (['fleet', 'offline'] as const);
}
