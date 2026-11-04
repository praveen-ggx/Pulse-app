/**
 * Drivers service — Supabase only (mobile).
 * Single bounded context: drivers (driver records, invite, linked driver for current user).
 * One service per domain (microservices). Same DB as pulse-unified-base.
 */
import { DEFAULT_PAGE_SIZE, type PageOpts } from "@/lib/pagination";
import { syncDomainRows } from "@/lib/cache/domainSync";
import { mergeDeltaRows } from "@/lib/cache/mergeDelta";
import type { DeltaResponse } from "@/lib/cache/deltaTypes";
import { getAccessToken, supabase } from "@/lib/supabase";
import { normalizeInfrastructureErrorMessage } from "@/lib/supabaseHttp.util";
import type { RatingRow } from "@/features/ratings";
import type { SalaryRequestRow } from "@/features/drivers/services/salaryRequests.service";
import type { LedgerRow } from "@/features/finance";
import {
  validateDriverInviteCompensation,
} from "../utils/driverInviteCompensation.util";

const DRIVER_COLUMNS = [
  "id", "organization_id", "user_id", "name", "phone", "email",
  "license_number", "emergency_name", "emergency_contact", "status",
  "assigned_vehicle_id", "created_at", "updated_at", "left_at",
  "tracking_only", "relationship_origin", "relationship_status",
  "payable_amount", "commission_percent", "commission_per_km",
  "avatar_url", "avatar_seed",
].join(",");

const DRIVER_LEDGER_COLUMNS = [
  "id", "organization_id", "driver_id", "trip_id", "type",
  "amount", "currency", "description", "created_at", "created_by",
  "reference_type", "reference_id",
].join(",");

export interface CreateDriverServiceData {
  driverSource?: string;
  name: string;
  phone: string | null;
  email?: string | null;
  emergencyContact?: string;
  emergencyName?: string;
  licenseNumber?: string;
  payableAmount?: number | null;
  commissionPercent?: number | null;
  commissionPerKm?: number | null;
}

export interface DriverRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  name: string;
  phone: string | null;
  email?: string | null;
  /** Driving licence number when stored on the driver row. */
  license_number?: string | null;
  emergency_name?: string | null;
  emergency_contact?: string | null;
  status: string;
  assigned_vehicle_id: string | null;
  created_at: string;
  updated_at: string;
  /** When set, driver has left this fleet; connection is in passbook history. */
  left_at?: string | null;
  /** When true, driver was created only for aggregate trip tracking (assign-by-phone). Exclude from Drivers tab. */
  tracking_only?: boolean;
  /** How this row originated. Write-once; never re-derived from current state. */
  relationship_origin?: string | null;
  /** Current primary relationship with this org (active_employee | independent | disconnected | superseded). Independent of compensation eligibility and trip assignment context. */
  relationship_status?: string | null;
  /** Fixed salary amount for the driver (nullable). */
  payable_amount?: number | null;
  /** Commission percentage for the driver (nullable). */
  commission_percent?: number | null;
  /** Per-kilometer rate for the driver (nullable). */
  commission_per_km?: number | null;
  /** Optional linked profile avatar fields when joined via RPC/view. */
  avatar_url?: string | null;
  avatar_seed?: string | null;
  /** Joined organization name — populated by getLinkedDriversForCurrentUser. */
  organizations?: { name: string } | null;
}

/**
 * Local / manual directory driver — fleet owns name/email/phone until app link.
 * Excludes connected (`user_id`), left stints, and tracking-only stubs.
 */
export function isLocalDriverRow(
  driver:
    | Pick<DriverRow, "user_id" | "left_at" | "tracking_only">
    | null
    | undefined,
): boolean {
  if (!driver) return false;
  if (driver.tracking_only === true) return false;
  if (driver.user_id) return false;
  if (driver.left_at) return false;
  return true;
}

/** Identity fields owned by the driver app once connected (or after leave). */
export const DRIVER_IDENTITY_FIELDS = ["name", "phone", "email"] as const;

export type DriverIdentityField = (typeof DRIVER_IDENTITY_FIELDS)[number];

/**
 * Asset (party) drivers only — excludes one-time / tracking-only stubs from assign-by-phone.
 * Used by party Drivers list, sync cache, and any fleet roster UI.
 * Filter is applied in code so lists work even when tracking_only is missing on legacy rows.
 */
export function excludeTrackingOnlyDrivers(drivers: DriverRow[]): DriverRow[] {
  return drivers.filter((d) => d.tracking_only !== true);
}

/** @deprecated Prefer {@link excludeTrackingOnlyDrivers} */
function excludeTrackingOnly(drivers: DriverRow[]): DriverRow[] {
  return excludeTrackingOnlyDrivers(drivers);
}

/**
 * Fleet-relationship membership only (relationship_origin/relationship_status
 * model — see docs/DRIVER_TRIP_COMPENSATION_MODEL.md and the tracking_only
 * incident investigation). Explicit inclusion, not `!= null`: only
 * active_employee and independent count as "in the fleet". disconnected,
 * superseded, and NULL (legacy/unresolved rows, including the 33-row
 * tracking_only incident cohort) are excluded.
 *
 * This is relationship membership ONLY. It is not a compensation-eligibility
 * check (see resolveDriverTripPayoutTerms/tripEarningsDetailForDriver in
 * driverUtils.util.ts) and not a trip-assignment-context check (see
 * trip.supplier_id / isAggregate). Do not use this to gate earnings display.
 */
export function filterActiveFleetRelationshipDrivers(drivers: DriverRow[]): DriverRow[] {
  return drivers.filter(isActiveFleetRelationshipDriver);
}

/** Single-row form of {@link filterActiveFleetRelationshipDrivers}, for call sites that check one row at a time (e.g. inside a compound trip-level condition) rather than filtering a list. */
export function isActiveFleetRelationshipDriver(
  d: Pick<DriverRow, "relationship_status">,
): boolean {
  return (
    d.relationship_status === "active_employee" ||
    d.relationship_status === "independent"
  );
}

/**
 * Salary/billing eligibility — may this driver row bill its org as an employer?
 *
 * Canonical gate for every "request salary / commission from this fleet" surface.
 * Do not hand-roll this check in a screen: a local copy is how the marketplace
 * (DCO) hole appeared, and Rule 7 of docs/DRIVER_TRIP_COMPENSATION_MODEL.md
 * exists to prevent exactly that.
 *
 * Keyed on `relationship_origin` (write-once provenance), not on current state:
 * - `market_award` rows are award stubs the marketplace engine creates so a DCO
 *   can execute a trip. Rules 1/3/6 of that doc: driver-row existence is not
 *   employment, assignment is not compensation, and marketplace compensation
 *   must not route through fleet employment. A DCO is paid via the marketplace
 *   payout path (Part 5), never as that org's staff.
 *
 * Deliberately NOT checked here:
 * - `tracking_only` — excluding it blocked the phone-assignment cohort from
 *   billing legitimate work (the tracking_only incident); it is not an
 *   employer signal (Rule 2).
 * - `relationship_status === 'independent'` — shared by 25 legitimate
 *   phone-assignment drivers, so it cannot discriminate a DCO.
 */
export function isSalaryEligibleDriver(
  d: Pick<DriverRow, "organization_id" | "relationship_status" | "relationship_origin">,
): boolean {
  if (!String(d.organization_id ?? "").trim()) return false;
  if (String(d.relationship_origin ?? "").trim().toLowerCase() === "market_award") return false;
  const status = String(d.relationship_status ?? "").trim().toLowerCase();
  return status !== "disconnected" && status !== "superseded";
}

/**
 * Finance Drivers ledger — settle current fleet members and former members
 * who left (`left_at` / disconnected). Tracking-only trip stubs stay out:
 * a phone-assign on a trip is not a roster identity.
 *
 * `market_award` DCO stubs stay out: DCO settlement is Finance → Suppliers
 * (contact_type=dco / dco_payee_id), never Finance → Drivers.
 */
export function isFinanceLedgerDriver(
  d: Pick<
    DriverRow,
    | "relationship_status"
    | "left_at"
    | "tracking_only"
    | "status"
    | "relationship_origin"
  >,
): boolean {
  if (d.tracking_only === true) return false;
  if (String(d.relationship_origin ?? "").trim().toLowerCase() === "market_award") {
    return false;
  }
  if (isActiveFleetRelationshipDriver(d)) return true;
  if (d.relationship_status === "disconnected") return true;
  if (d.left_at != null && String(d.left_at).trim() !== "") return true;
  if (d.status === "inactive") return true;
  return false;
}

export function filterFinanceLedgerDrivers(drivers: DriverRow[]): DriverRow[] {
  return drivers.filter(isFinanceLedgerDriver);
}

/**
 * Deduplicates drivers by identity (user_id or normalized phone).
 * When the same physical driver has an active row (left_at = null) AND an old
 * disconnected row, only the active row is kept for the list.  The disconnected
 * row's history is surfaced via the Tenure History section in the detail screen.
 */
function deduplicateDriversByIdentity(drivers: DriverRow[]): DriverRow[] {
  const normalizePhone = (p: string | null | undefined) =>
    (p ?? '').replace(/[^0-9]/g, '').slice(-10);

  // Build sets of identities that have an active row
  const activeUserIds = new Set<string>();
  const activePhones = new Set<string>();
  for (const d of drivers) {
    if (d.left_at) continue;
    if (d.user_id) activeUserIds.add(d.user_id);
    const ph = normalizePhone(d.phone);
    if (ph.length >= 10) activePhones.add(ph);
  }

  return drivers.filter((d) => {
    // Active rows are always kept
    if (!d.left_at) return true;
    // Disconnected row: suppress if an active row for same identity already shown
    if (d.user_id && activeUserIds.has(d.user_id)) return false;
    const ph = normalizePhone(d.phone);
    if (ph.length >= 10 && activePhones.has(ph)) return false;
    return true;
  });
}

/** Ensure display name is set (DB may use name or full_name). */
function normalizeDriverRow<T extends { name?: string | null; full_name?: string | null }>(row: T): T {
  const name = (row.name ?? (row as { full_name?: string | null }).full_name ?? "").trim() || "—";
  return { ...row, name };
}

/**
 * `get_drivers_with_profiles` historically omitted relationship columns.
 * The client filter needs them; hydrate from `drivers` when missing.
 */
async function attachRelationshipFields(
  orgId: string,
  rows: DriverRow[],
): Promise<DriverRow[]> {
  if (rows.length === 0) return rows;
  const needsHydration = rows.some(
    (row) => row.relationship_status === undefined,
  );
  if (!needsHydration) return rows;

  const { data, error } = await supabase()
    .from("drivers")
    .select("id, relationship_status, relationship_origin")
    .eq("organization_id", orgId)
    .in(
      "id",
      rows.map((row) => row.id),
    );
  if (error || !data) return rows;

  const byId = new Map(
    (
      data as {
        id: string;
        relationship_status: string | null;
        relationship_origin: string | null;
      }[]
    ).map((row) => [row.id, row]),
  );
  return rows.map((row) => {
    const rel = byId.get(row.id);
    if (!rel) return row;
    return {
      ...row,
      relationship_status: rel.relationship_status,
      relationship_origin: rel.relationship_origin,
    };
  });
}

/**
 * Batch phone lookup for N driver ids in one query — used by the fleet
 * operations dashboard's "Call Driver" alert action, which otherwise has no
 * way to know if a phone number exists for a given trip's driver.
 */
export async function getDriverPhonesByIds(
  driverIds: string[],
): Promise<{ error: Error | null; phoneByDriverId: Map<string, string> }> {
  if (driverIds.length === 0) return { error: null, phoneByDriverId: new Map() };
  const { data, error } = await supabase()
    .from("drivers")
    .select("id, phone")
    .in("id", driverIds);
  if (error) return { error: new Error(error.message), phoneByDriverId: new Map() };

  const phoneByDriverId = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; phone: string | null }[]) {
    const phone = (row.phone ?? "").trim();
    if (phone) phoneByDriverId.set(row.id, phone);
  }
  return { error: null, phoneByDriverId };
}

export async function getDriversByOrganization(
  orgId: string,
  opts?: PageOpts,
): Promise<{ error: Error | null; drivers: DriverRow[]; hasMore?: boolean }> {
  // Try profile-joined RPC first (returns avatar_url + avatar_seed from profiles via user_id join).
  if (opts == null) {
    if (!(await getAccessToken())) {
      return { error: null, drivers: [] };
    }
    try {
      const { data, error: rpcError } = await supabase().rpc(
        "get_drivers_with_profiles",
        { p_org_id: orgId },
      );
      if (!rpcError && data) {
        const raw = deduplicateDriversByIdentity(
          excludeTrackingOnly((data ?? []) as DriverRow[]),
        );
        const normalized = raw.map((d) => normalizeDriverRow(d));
        return {
          error: null,
          drivers: await attachRelationshipFields(orgId, normalized),
        };
      }
    } catch {
      // Fall through to direct select
    }
  }

  const base = () =>
    supabase()
      .from("drivers")
      .select(DRIVER_COLUMNS)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
  if (opts != null) {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await base().range(offset, offset + limit);
    if (error) return { error: new Error(error.message), drivers: [] };
    const raw = excludeTrackingOnly((data ?? []) as unknown as DriverRow[]);
    const normalized = raw.map((d) => normalizeDriverRow(d));
    const hasMore = raw.length > limit;
    return {
      error: null,
      drivers: hasMore ? normalized.slice(0, limit) : normalized,
      hasMore,
    };
  }
  const { data, error } = await base();
  if (error) return { error: new Error(error.message), drivers: [] };
  const raw = deduplicateDriversByIdentity(
    excludeTrackingOnly((data ?? []) as unknown as DriverRow[]),
  );
  return { error: null, drivers: raw.map((d) => normalizeDriverRow(d)) };
}

// ─── Tenure History ──────────────────────────────────────────────────────────

export interface DriverTenureRow {
  id: string;
  driver_id: string;
  organization_id: string;
  joined_at: string;
  left_at: string | null;
  trip_count: number;
  created_at: string;
}

/**
 * Returns the tenure history for a driver — all connect/disconnect periods
 * ordered most-recent first.  Used by the "Tenure History" section in the
 * driver detail screen.
 */
export async function getDriverTenures(
  orgId: string,
  driverId: string,
): Promise<{ error: Error | null; tenures: DriverTenureRow[] }> {
  const { data, error } = await supabase().rpc('get_driver_tenures', {
    p_org_id: orgId,
    p_driver_id: driverId,
  });
  if (error) return { error: new Error(error.message), tenures: [] };
  return { error: null, tenures: (data ?? []) as DriverTenureRow[] };
}

export async function getDriversDelta(
  orgId: string,
  since: { updatedAt: string; tieBreakerId?: string | null },
): Promise<{ error: Error | null; delta: DeltaResponse<DriverRow> }> {
  const { data, error } = await supabase().rpc("get_drivers_delta", {
    p_org_id: orgId,
    p_since: since.updatedAt,
    p_limit: 1000,
  });
  if (error) return { error: new Error(error.message), delta: { changed: [], deletedIds: [], nextCursor: since } };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { changed?: DriverRow[]; deleted_ids?: string[]; next_cursor?: string | null }
    | null;
  return {
    error: null,
    delta: {
      changed: (row?.changed ?? []) as DriverRow[],
      deletedIds: (row?.deleted_ids ?? []) as string[],
      nextCursor: row?.next_cursor ? { updatedAt: row.next_cursor } : since,
    },
  };
}

export async function syncDriversWithCache(orgId: string, currentRows: DriverRow[]) {
  try {
    const drivers = await syncDomainRows<DriverRow>({
      domain: "drivers",
      orgId,
      schemaVersion: "2",
      policy: { maxDeltaLagMs: 5 * 60_000, fullSyncEveryMs: 8 * 60 * 60_000 },
      currentRows,
      getFull: async () => {
        const res = await getDriversByOrganization(orgId);
        if (res.error) throw res.error;
        return res.drivers;
      },
      getDelta: async (cursor) => {
        const res = await getDriversDelta(orgId, cursor);
        if (res.error) throw res.error;
        return res.delta;
      },
      merge: (existing, delta) => {
        // Delta RPC returns all drivers (including tracking_only). Drop one-time
        // stubs so they never re-enter the party roster cache after a full sync.
        const trackingOnlyIds = delta.changed
          .filter((d) => d.tracking_only === true)
          .map((d) => d.id);
        const merged = mergeDeltaRows({
          existing,
          changed: excludeTrackingOnlyDrivers(delta.changed),
          deletedIds: [...delta.deletedIds, ...trackingOnlyIds],
          compare: (a, b) =>
            (b.created_at ?? "").localeCompare(a.created_at ?? ""),
        });
        return excludeTrackingOnlyDrivers(merged);
      },
    });
    return { error: null, drivers: excludeTrackingOnlyDrivers(drivers) };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), drivers: currentRows };
  }
}

export async function getDriverById(
  orgId: string,
  driverId: string,
  signal?: AbortSignal,
): Promise<{ error: Error | null; driver: DriverRow | null }> {
  const query = supabase()
    .from("drivers")
    .select(DRIVER_COLUMNS)
    .eq("organization_id", orgId)
    .eq("id", driverId);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();
  if (error) return { error: new Error(error.message), driver: null };
  const row = data as DriverRow | null;
  let driver = row ? normalizeDriverRow(row) : null;
  if (driver && !(driver.email ?? "").trim()) {
    try {
      const emailQuery = supabase().rpc("get_driver_coalesced_email_for_org", {
        p_org_id: orgId,
        p_driver_id: driverId,
      });
      const { data: rows, error: rpcError } = await (signal
        ? emailQuery.abortSignal(signal)
        : emailQuery);
      if (!rpcError && Array.isArray(rows) && rows.length > 0) {
        const e = (rows[0] as { email?: string | null }).email;
        if (e != null && String(e).trim() !== "") {
          driver = { ...driver, email: String(e).trim() };
        }
      }
    } catch {
      // RPC missing on older DB — keep drivers row as-is
    }
  }
  return { error: null, driver };
}

/** Normalize phone for comparison (strip spaces; same driver = same number). */
function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\s/g, "").trim();
}

/**
 * Add driver directly (no invitation). Atomically finds-or-creates the org's
 * drivers row via the create_driver_direct RPC:
 * - Reconnects a left driver in this org with the same phone (clears left_at,
 *   updates name/email/pay terms) -- same intent as before.
 * - Reuses an already-active same-org row for this phone (idempotent add).
 * - Rejects with a clean error if the phone is already an unlinked roster
 *   placeholder in a DIFFERENT organization, instead of a raw 23505.
 * See create_driver_direct RPC for the full collision/concurrency handling.
 */
export async function createDriver(
  orgId: string,
  data: CreateDriverServiceData,
): Promise<{ error: Error | null; driver: DriverRow | null }> {
  const { data: result, error } = await supabase().rpc("create_driver_direct", {
    p_org_id: orgId,
    p_name: (data.name || "").trim() || "—",
    p_phone: (data.phone ?? "").trim() || undefined,
    p_email: (data.email || "").trim() || undefined,
    p_payable_amount: data.payableAmount ?? undefined,
    p_commission_percent: data.commissionPercent ?? undefined,
    p_commission_per_km: data.commissionPerKm ?? undefined,
  });
  if (error) return { error: new Error(error.message), driver: null };
  const row = result as { ok?: boolean; error?: string; driver?: DriverRow } | null;
  if (!row?.ok) {
    return { error: new Error(row?.error ?? "Could not add driver"), driver: null };
  }
  return { error: null, driver: (row.driver as DriverRow) ?? null };
}

export interface UpdateDriverData {
  name?: string;
  phone?: string | null;
  email?: string | null;
  status?: string;
  assigned_vehicle_id?: string | null;
  /** Set to null to reconnect a driver who had left (clear left_at). */
  left_at?: null;
  /** Fixed salary amount for the driver (nullable). */
  payable_amount?: number | null;
  /** Commission percentage for the driver (nullable). */
  commission_percent?: number | null;
  /** Per-kilometer rate for the driver (nullable). */
  commission_per_km?: number | null;
}

export async function updateDriver(
  orgId: string,
  driverId: string,
  patch: UpdateDriverData,
): Promise<{ error: Error | null; driver: DriverRow | null }> {
  const touchesIdentity =
    patch.name !== undefined ||
    patch.phone !== undefined ||
    patch.email !== undefined;
  const reconnecting = patch.left_at === null;

  if (touchesIdentity) {
    const { data: existing, error: existingError } = await supabase()
      .from("drivers")
      .select("id, user_id, left_at, tracking_only")
      .eq("organization_id", orgId)
      .eq("id", driverId)
      .maybeSingle();
    if (existingError) {
      return { error: new Error(existingError.message), driver: null };
    }
    if (!existing) {
      return { error: new Error("Driver not found"), driver: null };
    }
    const row = existing as Pick<
      DriverRow,
      "user_id" | "left_at" | "tracking_only"
    >;
    // Reconnect (clear left_at) may coalesce name/phone/email onto a prior stint.
    if (!reconnecting) {
      if (row.user_id) {
        return {
          error: new Error(
            "Name, email, and phone are managed by the driver’s app and cannot be edited.",
          ),
          driver: null,
        };
      }
      if (row.tracking_only === true) {
        return {
          error: new Error(
            "Tracking-only driver contacts cannot be edited from the fleet directory.",
          ),
          driver: null,
        };
      }
      if (row.left_at) {
        return {
          error: new Error(
            "Contact details for a left driver cannot be edited. Use reconnect or reinvite.",
          ),
          driver: null,
        };
      }
    }

    if (!reconnecting && patch.phone !== undefined) {
      const phoneNorm = (patch.phone ?? "").replace(/\D/g, "").slice(-10);
      if (phoneNorm.length >= 8) {
        const { data: peers, error: peersError } = await supabase()
          .from("drivers")
          .select("id, name, phone")
          .eq("organization_id", orgId)
          .is("left_at", null)
          .neq("id", driverId)
          .limit(200);
        if (peersError) {
          return { error: new Error(peersError.message), driver: null };
        }
        const conflict = (peers ?? []).find((peer) => {
          const peerDigits = String(
            (peer as { phone?: string | null }).phone ?? "",
          )
            .replace(/\D/g, "")
            .slice(-10);
          return peerDigits.length >= 8 && peerDigits === phoneNorm;
        });
        if (conflict) {
          return {
            error: new Error(
              "Another active driver in this fleet already uses this phone number.",
            ),
            driver: null,
          };
        }
      }
    }
  }

  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) updates.name = (patch.name ?? '').trim() || '—';
  if (patch.phone !== undefined) updates.phone = (patch.phone ?? '').trim() || null;
  if (patch.email !== undefined) updates.email = (patch.email ?? '').trim() || null;
  if (patch.assigned_vehicle_id !== undefined) updates.assigned_vehicle_id = patch.assigned_vehicle_id || null;
  if (patch.left_at === null) updates.left_at = null;
  if (patch.payable_amount !== undefined) updates.payable_amount = patch.payable_amount;
  if (patch.commission_percent !== undefined) updates.commission_percent = patch.commission_percent;
  if (patch.commission_per_km !== undefined) updates.commission_per_km = patch.commission_per_km;
  if (Object.keys(updates).length === 0) return { error: null, driver: null };
  const { data, error } = await supabase()
    .from("drivers")
    .update(updates)
    .eq("organization_id", orgId)
    .eq("id", driverId)
    .select()
    .single();
  if (error) return { error: new Error(error.message), driver: null };
  const driver = data as DriverRow;

  // Best-effort: keep the accepted invite's compensation terms in sync.
  // getDriverOffersByOrganization() reads driver_invites.payable_amount /
  // commission_* in preference to the drivers table, so an edit here would
  // otherwise never surface in trip-cost/PnL calculations.
  const touchesCompensation =
    patch.payable_amount !== undefined ||
    patch.commission_percent !== undefined ||
    patch.commission_per_km !== undefined;
  if (touchesCompensation && driver.user_id) {
    const inviteUpdates: Record<string, unknown> = {};
    if (patch.payable_amount !== undefined) inviteUpdates.payable_amount = patch.payable_amount;
    if (patch.commission_percent !== undefined) inviteUpdates.commission_percent = patch.commission_percent;
    if (patch.commission_per_km !== undefined) inviteUpdates.commission_per_km = patch.commission_per_km;
    await supabase()
      .from("driver_invites")
      .update(inviteUpdates)
      .eq("from_organization_id", orgId)
      .eq("to_user_id", driver.user_id)
      .eq("status", "accepted");
  }

  return { error: null, driver };
}

export type DriverContactCollision = {
  kind: "driver_profile_phone" | "driver_profile_email" | "org_roster_phone";
  label: string;
  detail: string;
};

/**
 * Pre-save checks for local driver contact edits. Warns when phone/email may
 * auto-link a driver app account, or collide with another active roster row.
 */
export async function findLocalDriverContactCollisions(
  orgId: string,
  driverId: string,
  contact: { phone?: string | null; email?: string | null },
): Promise<{ error: Error | null; collisions: DriverContactCollision[] }> {
  const collisions: DriverContactCollision[] = [];
  const phoneRaw = (contact.phone ?? "").trim();
  const emailRaw = (contact.email ?? "").trim();

  if (phoneRaw) {
    const invitee = await getDriverInviteeByPhone(phoneRaw);
    if (invitee.error) {
      return { error: invitee.error, collisions: [] };
    }
    if (invitee.user_id) {
      collisions.push({
        kind: "driver_profile_phone",
        label: invitee.full_name?.trim() || "Driver account",
        detail:
          "This phone matches an existing driver app account. Saving can link that account to this roster row when they sign in.",
      });
    }

    const phoneNorm = phoneRaw.replace(/\D/g, "").slice(-10);
    if (phoneNorm.length >= 8) {
      const { data: peers, error: peersError } = await supabase()
        .from("drivers")
        .select("id, name, phone")
        .eq("organization_id", orgId)
        .is("left_at", null)
        .neq("id", driverId)
        .limit(200);
      if (peersError) {
        return { error: new Error(peersError.message), collisions: [] };
      }
      const conflict = (peers ?? []).find((row) => {
        const peerDigits = String((row as { phone?: string | null }).phone ?? "")
          .replace(/\D/g, "")
          .slice(-10);
        return peerDigits.length >= 8 && peerDigits === phoneNorm;
      }) as { id: string; name?: string | null } | undefined;
      if (conflict) {
        collisions.push({
          kind: "org_roster_phone",
          label: (conflict.name ?? "").trim() || "Another driver",
          detail:
            "Another active driver in this fleet already uses this phone number.",
        });
      }
    }
  }

  if (emailRaw) {
    const { data: profile, error: profileError } = await supabase()
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "driver")
      .ilike("email", emailRaw)
      .maybeSingle();
    if (profileError) {
      // Profiles may be RLS-restricted; skip soft-warn rather than blocking save.
    } else if (profile?.id) {
      collisions.push({
        kind: "driver_profile_email",
        label:
          ((profile as { full_name?: string | null }).full_name ?? "").trim() ||
          emailRaw,
        detail:
          "This email matches an existing driver app account. Saving can attach that account to this roster row on next sync / sign-in.",
      });
    }
  }

  return { error: null, collisions };
}

/**
 * Get the driver row linked to the current user (auth.uid).
 * Returns a single row; when the user has multiple (e.g. own org + fleet orgs), use getLinkedDriversForCurrentUser.
 */
export async function getLinkedDriverForCurrentUser(
  userId: string,
): Promise<{ error: Error | null; driver: DriverRow | null }> {
  const { data, error } = await supabase()
    .from("drivers")
    .select(DRIVER_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), driver: null };
  return { error: null, driver: data as DriverRow | null };
}

/**
 * Links unlinked driver roster rows to the current auth user by profile email/phone.
 * Idempotent — safe to call on every driver-home load (e.g. trip assigned after signup).
 *
 * Single-flight + short cooldown: password sign-in and driver-home mount can both
 * request a sync within the same second; coalesce to one RPC (incident 2026-09-18).
 */
let syncLinkedDriversInflight: Promise<{
  error: Error | null;
  linkedCount: number;
}> | null = null;
let syncLinkedDriversLastDoneAt = 0;
const SYNC_LINKED_DRIVERS_COOLDOWN_MS = 5_000;
let syncLinkedDriversLastResult: {
  error: Error | null;
  linkedCount: number;
} = { error: null, linkedCount: 0 };

export async function syncLinkedDriverRowsForCurrentUser(): Promise<{
  error: Error | null;
  linkedCount: number;
}> {
  if (syncLinkedDriversInflight) return syncLinkedDriversInflight;
  const now = Date.now();
  if (now - syncLinkedDriversLastDoneAt < SYNC_LINKED_DRIVERS_COOLDOWN_MS) {
    return syncLinkedDriversLastResult;
  }
  syncLinkedDriversInflight = (async () => {
    try {
      const { data, error } = await supabase().rpc("sync_my_driver_rows_user_id");
      if (error) {
        syncLinkedDriversLastResult = { error: new Error(error.message), linkedCount: 0 };
      } else {
        syncLinkedDriversLastResult = {
          error: null,
          linkedCount: typeof data === "number" ? data : 0,
        };
      }
      syncLinkedDriversLastDoneAt = Date.now();
      return syncLinkedDriversLastResult;
    } finally {
      syncLinkedDriversInflight = null;
    }
  })();
  return syncLinkedDriversInflight;
}

/** Test-only: reset dedupe state between unit tests. */
export function __resetSyncLinkedDriversDedupeForTests(): void {
  syncLinkedDriversInflight = null;
  syncLinkedDriversLastDoneAt = 0;
  syncLinkedDriversLastResult = { error: null, linkedCount: 0 };
}

/**
 * Get all driver rows linked to the current user (own org + any fleet orgs after accepting invites).
 * Used so we can load trips assigned to the user in any org.
 */
export async function getLinkedDriversForCurrentUser(
  userId: string,
): Promise<{ error: Error | null; drivers: DriverRow[] }> {
  const { data, error } = await supabase()
    .from("drivers")
    .select(`${DRIVER_COLUMNS}, organizations!left(name)`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    return {
      error: new Error(normalizeInfrastructureErrorMessage(error.message)),
      drivers: [],
    };
  }
  return { error: null, drivers: (data ?? []) as unknown as DriverRow[] };
}

/** Driver invite row (from get_driver_invites_received). Driver sees these in the app. */
export interface DriverInviteRow {
  id: string;
  from_organization_id: string;
  to_user_id: string;
  status: string;
  created_at: string;
  responded_at: string | null;
  responded_by: string | null;
  from_org_name: string | null;
  from_org_logo_url?: string | null;
  from_org_avatar_url?: string | null;
  from_org_avatar_seed?: string | null;
  payable_amount: number | null;
  commission_percent: number | null;
  commission_per_km: number | null;
}

/** One existing driver match from platform (profile with role=driver, by phone). Contact and DL used to pre-fill form. */
export interface ExistingDriverMatch {
  user_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  /** Driving license number (from profiles.license_number when RPC returns it). */
  license_number: string | null;
  /** Optional avatar path/url from profile metadata (when RPC provides it). */
  avatar_url?: string | null;
  /** Optional avatar preset seed (when RPC provides it). */
  avatar_seed?: string | null;
  /** True when driver is currently connected to at least one fleet (left_at is null).
   *  Not the same as “in *your* fleet” — use org roster for employment status. */
  is_in_fleet?: boolean;
}

export interface DriverProfileAvatar {
  avatar_url: string | null;
  avatar_seed: string | null;
}

/**
 * Look up driver profile(s) by phone (for Add Driver: list and auto-fill).
 * Returns 0 or 1 match (DB returns at most one). Single RPC call, O(1) result set.
 */
export async function searchExistingDriversByPhone(phone: string): Promise<{
  error: Error | null;
  matches: ExistingDriverMatch[];
}> {
  const normalized = (phone || "").trim().replace(/\s+/g, "");
  if (!normalized) return { error: null, matches: [] };
  const { data, error } = await supabase().rpc("get_driver_invitee_by_phone", {
    p_phone: normalized,
  });
  if (error) return { error: new Error(error.message), matches: [] };
  const rows = (data ?? []) as {
    user_id: string;
    full_name: string;
    phone: string;
    email?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_phone?: string | null;
    license_number?: string | null;
    avatar_url?: string | null;
    avatarUrl?: string | null;
    avatar_seed?: string | null;
    avatarSeed?: string | null;
    is_in_fleet?: boolean | null;
  }[];
  const matches: ExistingDriverMatch[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r?.user_id)
      matches.push({
        user_id: r.user_id,
        full_name: r.full_name ?? "",
        phone: r.phone ?? normalized,
        email: r.email ?? null,
        emergency_contact_name: r.emergency_contact_name ?? null,
        emergency_contact_phone: r.emergency_contact_phone ?? null,
        license_number: r.license_number ?? null,
        avatar_url: r.avatar_url ?? r.avatarUrl ?? null,
        avatar_seed: r.avatar_seed ?? r.avatarSeed ?? null,
        is_in_fleet: r.is_in_fleet === true,
      });
  }
  return { error: null, matches };
}

/** Fetch avatar metadata for a matched driver profile. */
export async function getDriverProfileAvatar(
  userId: string,
): Promise<{ error: Error | null; avatar: DriverProfileAvatar | null }> {
  const id = (userId || "").trim();
  if (!id) return { error: null, avatar: null };
  const { data, error } = await supabase()
    .from("profiles")
    .select("avatar_url, avatar_seed")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: new Error(error.message), avatar: null };
  const row = data as { avatar_url?: string | null; avatar_seed?: string | null } | null;
  return {
    error: null,
    avatar: row
      ? {
          avatar_url: row.avatar_url ?? null,
          avatar_seed: row.avatar_seed ?? null,
        }
      : null,
  };
}

/**
 * Look up a driver profile by phone (for sending in-app invite). Requires RPC get_driver_invitee_by_phone.
 */
export async function getDriverInviteeByPhone(phone: string): Promise<{
  error: Error | null;
  user_id: string | null;
  full_name: string | null;
  phone: string | null;
}> {
  const { error, matches } = await searchExistingDriversByPhone(phone);
  if (error) return { error, user_id: null, full_name: null, phone: null };
  const row = matches[0] ?? null;
  return {
    error: null,
    user_id: row?.user_id ?? null,
    full_name: row?.full_name ?? null,
    phone: row?.phone ?? null,
  };
}

export interface DriverInviteOffer {
  payableAmount?: number | null;
  commissionPercent?: number | null;
  commissionPerKm?: number | null;
}

/**
 * Read existing invite status for (org, driver user).
 * Returns null when no invite exists or RPC unavailable.
 */
export async function getDriverInviteSentStatus(
  orgId: string,
  toUserId: string,
): Promise<{ error: Error | null; status: string | null }> {
  try {
    const { data: statusRow, error } = await supabase().rpc(
      "get_driver_invite_sent_status",
      {
        p_org_id: orgId,
        p_to_user_id: toUserId,
      },
    );
    if (error) return { error: new Error(error.message), status: null };
    const row = Array.isArray(statusRow) ? statusRow[0] : statusRow;
    const s = (row as { status?: string } | undefined)?.status ?? null;
    return { error: null, status: typeof s === "string" ? s : null };
  } catch {
    return { error: null, status: null };
  }
}

/**
 * Create a driver_invites row so the driver sees the invite in the app (when they have an account).
 * RLS: org members can insert for their org.
 * Optional offer (payable_amount, commission_percent, commission_per_km) is stored when provided.
 */
async function createDriverInvite(
  fromOrganizationId: string,
  toUserId: string,
  fromOrgName?: string | null,
  inviteeName?: string | null,
  offer?: DriverInviteOffer | null,
): Promise<{ error: Error | null; created: boolean }> {
  const payload: Record<string, unknown> = {
    from_organization_id: fromOrganizationId,
    to_user_id: toUserId,
    status: "pending",
    from_org_name: fromOrgName ?? null,
    invitee_name: (inviteeName ?? "").trim() || null,
  };
  if (offer) {
    if (offer.payableAmount != null && offer.payableAmount > 0)
      payload.payable_amount = offer.payableAmount;
    if (offer.commissionPercent != null && offer.commissionPercent >= 0)
      payload.commission_percent = offer.commissionPercent;
    if (offer.commissionPerKm != null && offer.commissionPerKm >= 0)
      payload.commission_per_km = offer.commissionPerKm;
  }
  const { error } = await supabase().from("driver_invites").insert(payload);
  if (error) {
    const code = (error as { code?: string }).code;
    const msg = (error as { message?: string }).message ?? "";
    if (code === "23505") {
      // Unique constraint (from_org,to_user) already exists: treat as already invited.
      return { error: null, created: false };
    }
    const friendly =
      code === "42501" || /row-level security|permission|policy/i.test(msg)
        ? "You do not have permission to send invitations for this organization."
        : msg || "Failed to send invitation.";
    return { error: new Error(friendly), created: false };
  }
  return { error: null, created: true };
}

/**
 * Re-open a previously rejected/declined invite by updating it back to pending.
 * This enables explicit "Invite again" flows without creating duplicate rows.
 */
async function reopenDriverInvite(
  fromOrganizationId: string,
  toUserId: string,
  fromOrgName?: string | null,
  inviteeName?: string | null,
  offer?: DriverInviteOffer | null,
): Promise<{ error: Error | null; reopened: boolean }> {
  const { data, error } = await supabase().rpc("reopen_driver_invite", {
    p_org_id: fromOrganizationId,
    p_to_user_id: toUserId,
    p_from_org_name: fromOrgName ?? null,
    p_invitee_name: (inviteeName ?? "").trim() || null,
    p_payable_amount:
      offer?.payableAmount != null && offer.payableAmount > 0
        ? offer.payableAmount
        : null,
    p_commission_percent:
      offer?.commissionPercent != null && offer.commissionPercent >= 0
        ? offer.commissionPercent
        : null,
    p_commission_per_km:
      offer?.commissionPerKm != null && offer.commissionPerKm >= 0
        ? offer.commissionPerKm
        : null,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/function.*reopen_driver_invite.*does not exist/i.test(msg)) {
      return {
        error: new Error(
          "Server update required for re-invite. Please ask admin to run latest database migrations."
        ),
        reopened: false,
      };
    }
    return { error: new Error(msg), reopened: false };
  }
  const obj = data as { ok?: boolean } | null;
  return { error: null, reopened: obj?.ok === true };
}

/**
 * Send driver invitation:
 * - If a driver account exists with this phone (get_driver_invitee_by_phone): create driver_invites
 *   so they see the invite in the app and can Accept (creates driver row in your org).
 * - Otherwise: create a driver row so you can assign trips; they'll link when they sign up with that phone.
 */
export async function inviteDriver(
  orgId: string,
  data: CreateDriverServiceData,
  orgName?: string | null,
  options?: {
    allowReinviteRejected?: boolean;
    /** When true, at least one pay term must be supplied (reconnect / in-app invite). */
    requireCompensation?: boolean;
    /** When known (e.g. disconnected driver row), skip phone lookup. */
    knownToUserId?: string | null;
  },
): Promise<{
  error: Error | null;
  driver: DriverRow | null;
  inviteSent: boolean;
  /** True when a driver_invites row already exists for (from_org_id,to_user_id). */
  inviteAlreadyExists?: boolean;
  inviteStatus?: string;
}> {
  const phone = (data.phone || "").trim();
  const phoneNorm = normalizePhone(phone);
  if (!phoneNorm)
    return {
      error: new Error("Phone is required"),
      driver: null,
      inviteSent: false,
    };

  const invitee = await getDriverInviteeByPhone(phone);
  if (invitee.error) {
    const msg = invitee.error.message ?? "";
    const friendly = /function.*does not exist|relation.*does not exist/i.test(
      msg,
    )
      ? "Server setup is incomplete. Please try again later or contact support."
      : /permission|policy|row-level security/i.test(msg)
        ? "You do not have permission to look up drivers for this organization."
        : msg;
    return { error: new Error(friendly), driver: null, inviteSent: false };
  }

  let toUserId =
    (options?.knownToUserId ?? "").trim() || invitee.user_id || null;

  if (!toUserId) {
    if (phoneNorm) {
      const { drivers } = await getDriversByOrganization(orgId);
      const disconnected = drivers.find(
        (d) => d.left_at && d.user_id && normalizePhone(d.phone) === phoneNorm,
      );
      if (disconnected?.user_id) toUserId = disconnected.user_id;
    }
  }

  if (!toUserId) {
    if (options?.requireCompensation) {
      return {
        error: new Error(
          "This driver is not linked to a Pulse app account. They must sign in on the driver app before you can send an in-app invitation.",
        ),
        driver: null,
        inviteSent: false,
      };
    }
  }

  if (toUserId) {
    if (options?.requireCompensation) {
      const compensationError = validateDriverInviteCompensation({
        payableAmount: data.payableAmount ?? null,
        commissionPercent: data.commissionPercent ?? null,
        commissionPerKm: data.commissionPerKm ?? null,
      });
      if (compensationError) {
        return {
          error: new Error(compensationError),
          driver: null,
          inviteSent: false,
        };
      }
    }

    // Validation: block duplicate driver_invites for this (org,driver user).
    // Use RPC because client-side RLS typically prevents selecting invite rows by from_organization_id.
    let existingStatus: string | null = null;
    try {
      const { data: statusRow } = await supabase().rpc("get_driver_invite_sent_status", {
        p_org_id: orgId,
        p_to_user_id: toUserId,
      });
      // RPC returns TABLE(status text); supabase-js usually returns an array.
      const row = Array.isArray(statusRow) ? statusRow[0] : statusRow;
      const s = (row as { status?: string } | undefined)?.status ?? null;
      existingStatus = typeof s === "string" ? s : null;
    } catch {
      // If RPC is not deployed yet, we rely on unique constraint handling below.
    }

    if (existingStatus) {
      const normalizedStatus = existingStatus.toLowerCase();

      const { data: activeRow } = await supabase()
        .from("drivers")
        .select("id")
        .eq("organization_id", orgId)
        .eq("user_id", toUserId)
        .is("left_at", null)
        .limit(1)
        .maybeSingle();
      const driverStillActiveInOrg = Boolean(activeRow?.id);

      // Can't re-invite a driver who is still actively connected
      if (driverStillActiveInOrg) {
        return {
          error: null,
          driver: null,
          inviteSent: false,
          inviteAlreadyExists: true,
          inviteStatus: existingStatus,
        };
      }

      const inviteeName =
        (data.name ?? "").trim() || invitee.full_name || null;
      const offer: DriverInviteOffer | null =
        data.payableAmount != null ||
        data.commissionPercent != null ||
        data.commissionPerKm != null
          ? {
              payableAmount: data.payableAmount ?? null,
              commissionPercent: data.commissionPercent ?? null,
              commissionPerKm: data.commissionPerKm ?? null,
            }
          : null;

      // Reconnect after leave / rejection: INSERT a fresh pending invite row.
      // The partial unique index (pending only) allows this alongside historical rows.
      const isReconnect =
        normalizedStatus === "rejected" ||
        normalizedStatus === "declined" ||
        normalizedStatus === "accepted";

      if (isReconnect) {
        const { error: inviteErr, created } = await createDriverInvite(
          orgId,
          toUserId,
          orgName,
          inviteeName,
          offer,
        );
        if (inviteErr) return { error: inviteErr, driver: null, inviteSent: false };
        if (created) return { error: null, driver: null, inviteSent: true };
        return {
          error: new Error("Re-invite could not be sent. Please try again."),
          driver: null,
          inviteSent: false,
        };
      }

      // Pending invite already exists: update pay terms only (no new row needed)
      if (normalizedStatus === "pending" && options?.requireCompensation) {
        const { error: reopenError, reopened } = await reopenDriverInvite(
          orgId,
          toUserId,
          orgName,
          inviteeName,
          offer,
        );
        if (reopenError) {
          return { error: reopenError, driver: null, inviteSent: false };
        }
        if (reopened) {
          return { error: null, driver: null, inviteSent: true };
        }
        return {
          error: new Error("Could not update invite terms. Please try again."),
          driver: null,
          inviteSent: false,
        };
      }

      return {
        error: null,
        driver: null,
        inviteSent: false,
        inviteAlreadyExists: true,
        inviteStatus: existingStatus,
      };
    }

    const offer: DriverInviteOffer | null =
      data.payableAmount != null ||
      data.commissionPercent != null ||
      data.commissionPerKm != null
        ? {
            payableAmount: data.payableAmount ?? null,
            commissionPercent: data.commissionPercent ?? null,
            commissionPerKm: data.commissionPerKm ?? null,
          }
        : null;
    const { error: inviteError, created } = await createDriverInvite(
      orgId,
      toUserId,
      orgName,
      invitee.full_name ?? null,
      offer,
    );
    if (inviteError)
      return { error: inviteError, driver: null, inviteSent: false };
    if (created) {
      return { error: null, driver: null, inviteSent: true };
    }

    // Race/concurrency: unique constraint prevented insert, treat as already invited.
    return {
      error: null,
      driver: null,
      inviteSent: false,
      inviteAlreadyExists: true,
      inviteStatus: existingStatus ?? "pending",
    };
  }

  // No platform driver user found for this phone -> invite_driver RPC
  // atomically finds-or-creates the org's driver row (reusing + refreshing
  // an existing active row, or creating one under the shared cross-org
  // phone lock) and creates the pending driver_invites row in one call.
  const rosterInvite = await inviteRosterDriver(
    phoneNorm,
    (data.name || "").trim() || "—",
    orgId,
    {
      email: (data.email || "").trim() || null,
      payableAmount: data.payableAmount ?? null,
      commissionPercent: data.commissionPercent ?? null,
      commissionPerKm: data.commissionPerKm ?? null,
    },
  );
  if (rosterInvite.error) {
    return { error: rosterInvite.error, driver: null, inviteSent: false };
  }
  return {
    error: null,
    driver: rosterInvite.driver,
    inviteSent: Boolean(rosterInvite.inviteId),
  };
}

export interface EnsureDriverRowByPhoneOptions {
  /** When true, mark driver as tracking-only (one-time for aggregate trip). Excluded from Drivers tab. */
  trackingOnly?: boolean;
  /**
   * When true (used for reassignment), always return an unlinked driver row (user_id = null)
   * so the trip must be claimed via OTP and does not show directly in any driver's trips list.
   */
  forceUnlinkedForOtp?: boolean;
  /**
   * Dispatcher-agreed commission %. Written ONLY when this call inserts a new
   * row. Existing rows keep their own terms — overwriting them here would let
   * one org silently rewrite pay terms agreed by another org for the same
   * driver. The trip still gets the correct payout via trips.driver_commission.
   */
  commissionPercent?: number | null;
}

function isPlaceholderDriverName(value: string | null | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return !v || v === "driver" || v === "—" || v === "-";
}

function resolveDriverDisplayName(
  name: string | null | undefined,
  platformName: string | null | undefined,
): string | null {
  const candidates = [(name ?? "").trim(), (platformName ?? "").trim()];
  for (const c of candidates) {
    if (c && !isPlaceholderDriverName(c)) return c;
  }
  return null;
}

async function applyDriverNameToRow(
  driver: DriverRow,
  name: string | null | undefined,
): Promise<DriverRow> {
  const next = resolveDriverDisplayName(name, null);
  if (!next) return driver;
  if (!isPlaceholderDriverName(driver.name) && (driver.name ?? "").trim() === next) {
    return driver;
  }
  // Always stamp dispatcher name onto placeholder / tracking_only rows so hub shows the real name.
  if (!isPlaceholderDriverName(driver.name) && driver.tracking_only !== true) {
    return driver;
  }
  const { data, error } = await supabase()
    .from("drivers")
    .update({ name: next, updated_at: new Date().toISOString() })
    .eq("id", driver.id)
    .select(DRIVER_COLUMNS)
    .single();
  if (error || !data) return driver;
  return normalizeDriverRow(data as unknown as DriverRow);
}

/**
 * Ensure a driver row exists in the org for the given phone (assign-by-phone / ad-hoc trip).
 * Normalizes phone, looks up platform user by phone, then finds or creates driver row in this org.
 * O(1): one RPC + one select + at most one insert.
 */
export async function ensureDriverRowByPhone(
  orgId: string,
  phone: string,
  name?: string,
  options?: EnsureDriverRowByPhoneOptions,
): Promise<{ error: Error | null; driver: DriverRow | null }> {
  const normalized = (phone || "").trim().replace(/\s+/g, "");
  if (!normalized)
    return { error: new Error("Phone is required"), driver: null };

  const { error: lookupError, matches } =
    await searchExistingDriversByPhone(normalized);
  if (lookupError) return { error: lookupError, driver: null };
  const match = matches[0] ?? null;

  // Aggregate trips: prefer existing driver in org with this phone (driver already in app
  // sees the trip immediately). If none, create tracking_only row and they claim via OTP.
  if (options?.trackingOnly === true) {
    // Reassignment flow: always return an unlinked row so driver must claim via OTP.
    // Uses match_driver_by_phone RPC which folds exact + last-10-digit fallback into one SQL predicate.
    if (options.forceUnlinkedForOtp === true) {
      // Step 1: find an already-unlinked driver matching this phone (exact or last-10 fallback)
      const { data: unlinkedDriver, error: unlinkedErr } = await supabase()
        .rpc("match_driver_by_phone", { p_org_id: orgId, p_phone: normalized, p_require_unlinked: true })
        .maybeSingle();
      if (unlinkedErr) return { error: new Error(unlinkedErr.message), driver: null };
      if (unlinkedDriver) {
        const stamped = await applyDriverNameToRow(unlinkedDriver as DriverRow, name);
        return { error: null, driver: stamped };
      }

      // Step 2: find any driver (possibly linked) — unlink it so driver must claim via OTP
      const { data: anyDriver, error: anyErr } = await supabase()
        .rpc("match_driver_by_phone", { p_org_id: orgId, p_phone: normalized, p_require_unlinked: false })
        .maybeSingle();
      if (anyErr) return { error: new Error(anyErr.message), driver: null };
      if (anyDriver) {
        const { error: unlinkErr } = await supabase()
          .from("drivers")
          .update({ user_id: null, updated_at: new Date().toISOString() })
          .eq("id", (anyDriver as DriverRow).id);
        if (unlinkErr) return { error: new Error(unlinkErr.message), driver: null };
        const { data: fresh, error: freshErr } = await supabase()
          .from("drivers")
          .select(DRIVER_COLUMNS)
          .eq("id", (anyDriver as DriverRow).id)
          .single();
        if (freshErr) return { error: new Error(freshErr.message), driver: null };
        if (fresh) {
          const stamped = await applyDriverNameToRow(fresh as unknown as DriverRow, name);
          return { error: null, driver: stamped };
        }
      }
    } else {
      // trackingOnly=true, forceUnlinkedForOtp=false: prefer any existing driver for this phone
      const { data: existing, error: findError } = await supabase()
        .rpc("match_driver_by_phone", { p_org_id: orgId, p_phone: normalized, p_require_unlinked: false })
        .maybeSingle();
      if (findError) return { error: new Error(findError.message), driver: null };
      if (existing) {
        const stamped = await applyDriverNameToRow(existing as unknown as DriverRow, name);
        return { error: null, driver: stamped };
      }
    }
  } else {
    const q = supabase().from("drivers").select(DRIVER_COLUMNS).eq("organization_id", orgId);
    const orClause = match
      ? `phone.eq.${normalized},user_id.eq.${match.user_id}`
      : `phone.eq.${normalized}`;
    const { data: existing, error: findError } = await q
      .or(orClause)
      .limit(1)
      .maybeSingle();
    if (findError) return { error: new Error(findError.message), driver: null };
    if (existing) {
      const stamped = await applyDriverNameToRow(existing as unknown as DriverRow, name);
      return { error: null, driver: stamped };
    }
  }

  const resolvedName =
    resolveDriverDisplayName(name, match?.full_name) ??
    ((name ?? "").trim() || "Driver");
  const resolvedUserId =
    options?.trackingOnly === true ? null : (match?.user_id ?? null);
  // Insert-only: never stamp terms onto a pre-existing row (see the option doc).
  const commissionPct = Number(options?.commissionPercent ?? 0) || 0;

  // ensure_driver_row_by_phone_insert RPC: this is the one place this
  // function creates a new row, so it's the only place that can collide
  // with idx_drivers_phone_normalised (global, not org-scoped). Every
  // resolution branch above this point is an unchanged, non-racy read.
  const { data: result, error: insertError } = await supabase().rpc(
    "ensure_driver_row_by_phone_insert",
    {
      p_org_id: orgId,
      p_name: resolvedName,
      p_phone: normalized,
      // Generated type declares p_user_id as required `string` since the SQL
      // param has no DEFAULT, but Postgres accepts NULL for any scalar arg
      // regardless of default -- this is a real, common case (tracking-only
      // or no platform-user match).
      p_user_id: resolvedUserId as unknown as string,
      p_tracking_only: options?.trackingOnly === true,
      p_commission_percent: commissionPct > 0 ? commissionPct : undefined,
    },
  );
  if (insertError) return { error: new Error(insertError.message), driver: null };
  const row = result as { ok?: boolean; error?: string; driver?: DriverRow } | null;
  if (!row?.ok) {
    return { error: new Error(row?.error ?? "Could not create driver"), driver: null };
  }
  return { error: null, driver: (row.driver as DriverRow) ?? null };
}

/**
 * Link phone to an existing driver row (post-OTP claim). Driver can only update own row.
 * Uses RPC link_driver_phone so driver app can set phone for tracking. O(1).
 */
export async function linkPhoneToDriver(
  driverId: string,
  phone: string,
): Promise<{ error: Error | null }> {
  const normalized = (phone || "").trim().replace(/\s+/g, "");
  if (!normalized) return { error: new Error("Phone is required") };
  const { data, error } = await supabase().rpc("link_driver_phone", {
    p_driver_id: driverId,
    p_phone: normalized,
  });
  if (error) return { error: new Error(error.message) };
  const obj = data as { ok?: boolean; error?: string } | null;
  if (obj && obj.ok === false && obj.error)
    return { error: new Error(obj.error) };
  return { error: null };
}

/**
 * List invites received by the current user (driver app). Requires RPC get_driver_invites_received.
 * Prefer {@link useDriverInvitesQuery} for UI — TanStack Query dedupes concurrent reads.
 */
export async function getDriverInvitesReceived(): Promise<{
  error: Error | null;
  invites: DriverInviteRow[];
}> {
  const { data, error } = await supabase().rpc("get_driver_invites_received");
  if (error) return { error: new Error(error.message), invites: [] };
  return { error: null, invites: (data ?? []) as DriverInviteRow[] };
}

/**
 * Driver app: fetch the accepted pay terms for the current user in a given org.
 * Uses invites received RPC (RLS-safe) and returns the offer terms if accepted.
 */
export async function getAcceptedDriverOfferForOrganization(
  orgId: string,
): Promise<{
  error: Error | null;
  offer: DriverOffer | null;
}> {
  const normalizedOrgId = (orgId ?? "").trim();
  if (!normalizedOrgId) return { error: null, offer: null };

  const { error, invites } = await getDriverInvitesReceived();
  if (error) return { error, offer: null };

  const invite =
    invites.find(
      (i) =>
        (i.from_organization_id ?? "").trim() === normalizedOrgId &&
        String(i.status ?? "").toLowerCase() === "accepted",
    ) ?? null;

  if (!invite) return { error: null, offer: null };

  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    error: null,
    offer: {
      payableAmount: num(
        (invite as { payable_amount?: unknown }).payable_amount,
      ),
      commissionPercent: num(
        (invite as { commission_percent?: unknown }).commission_percent,
      ),
      commissionPerKm: num(
        (invite as { commission_per_km?: unknown }).commission_per_km,
      ),
    },
  };
}

/** Minimal row for "driver invites sent" list (e.g. Network REQUESTS tab). */
export interface DriverInviteSentRow {
  id: string;
  from_org_name: string | null;
  driver_name: string | null;
  status: string;
  created_at: string;
  /** Invitee auth user; used to hide accepted invites when they already appear on the driver roster. */
  to_user_id?: string | null;
}

/** Match state when a manual driver's phone later signs up in app. */
export interface DriverSignupMatchStatus {
  id: string;
  state: "pending_owner_action" | "invite_sent" | "linked" | "declined" | "ignored" | "expired";
  matched_user_id: string;
  detected_at: string;
}

/** Offer terms from an accepted driver invite. Used to compute commission from trip base price. */
export interface DriverOffer {
  payableAmount: number | null;
  commissionPercent: number | null;
  commissionPerKm: number | null;
}

/**
 * Fetch display profile (name/avatar) for a driver's linked user profile.
 * Uses RPC get_driver_profile_display (SECURITY DEFINER) to read profile safely.
 */
export async function getDriverProfileDisplay(driverId: string): Promise<{
  error: Error | null;
  profile: { fullName: string; avatarUrl?: string; avatarSeed?: string } | null;
}> {
  const normalizedDriverId = (driverId ?? "").trim();
  if (!normalizedDriverId) return { error: null, profile: null };

  const { data, error } = await supabase().rpc("get_driver_profile_display", {
    p_driver_id: normalizedDriverId,
  });
  if (error) {
    return { error: new Error(error.message), profile: null };
  }
  if (data == null || typeof data !== "object") {
    return { error: null, profile: null };
  }

  const raw = data as {
    fullName?: string;
    avatarUrl?: string;
    avatarSeed?: string;
  };

  return {
    error: null,
    profile: {
      fullName: (raw.fullName ?? "").trim(),
      avatarUrl: (raw.avatarUrl ?? "").trim(),
      avatarSeed: (raw.avatarSeed ?? "").trim(),
    },
  };
}

/** Batch fetch display profiles for multiple drivers in one RPC call. */
export async function getDriverProfileDisplayBatch(
  driverIds: string[],
): Promise<Record<string, { fullName: string; avatarUrl?: string; avatarSeed?: string }>> {
  const ids = driverIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return {};

  const { data, error } = await supabase().rpc("get_driver_profile_display_batch", {
    p_driver_ids: ids,
  });
  if (error || !data || typeof data !== "object") return {};

  const result: Record<string, { fullName: string; avatarUrl?: string; avatarSeed?: string }> = {};
  for (const [driverId, raw] of Object.entries(data as Record<string, unknown>)) {
    if (raw && typeof raw === "object") {
      const r = raw as { fullName?: string; avatarUrl?: string; avatarSeed?: string };
      result[driverId] = {
        fullName: (r.fullName ?? "").trim(),
        avatarUrl: (r.avatarUrl ?? "").trim(),
        avatarSeed: (r.avatarSeed ?? "").trim(),
      };
    }
  }
  return result;
}

/**
 * Read latest invite terms for a specific org + user from driver_invites (any status).
 * Used by owner profile re-invite flow to reuse previously entered compensation values.
 */
export async function getLatestDriverInviteTermsByUser(
  orgId: string,
  userId: string,
): Promise<{ error: Error | null; offer: DriverOffer | null; status: string | null }> {
  const { data, error } = await supabase()
    .from("driver_invites")
    .select("status, payable_amount, commission_percent, commission_per_km, created_at")
    .eq("from_organization_id", orgId)
    .eq("to_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: new Error(error.message), offer: null, status: null };
  if (!data) return { error: null, offer: null, status: null };

  const row = data as {
    status?: string | null;
    payable_amount?: number | string | null;
    commission_percent?: number | string | null;
    commission_per_km?: number | string | null;
  };
  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    error: null,
    status: row.status ?? null,
    offer: {
      payableAmount: num(row.payable_amount),
      commissionPercent: num(row.commission_percent),
      commissionPerKm: num(row.commission_per_km),
    },
  };
}

/**
 * Get driver offers (salary + commission terms) for all drivers in the org from accepted invites.
 * Used for: commission = trip client_price * (commission_percent/100) or distance * commission_per_km; salary is predefined.
 */
export async function getDriverOffersByOrganization(orgId: string): Promise<{
  error: Error | null;
  offersByDriverId: Record<string, DriverOffer>;
}> {
  const { error: driversErr, drivers } = await getDriversByOrganization(orgId);
  if (driversErr || !drivers.length)
    return { error: driversErr ?? null, offersByDriverId: {} };
  const userIds = drivers
    .map((d) => d.user_id)
    .filter((u): u is string => u != null && u !== "");
  if (userIds.length === 0) return { error: null, offersByDriverId: {} };
  const { data: invites, error } = await supabase()
    .from("driver_invites")
    .select("to_user_id, payable_amount, commission_percent, commission_per_km")
    .eq("from_organization_id", orgId)
    .eq("status", "accepted")
    .in("to_user_id", userIds);
  if (error) return { error: new Error(error.message), offersByDriverId: {} };
  const userToDriver = new Map<string, (typeof drivers)[0]>();
  for (const d of drivers) {
    if (d.user_id) userToDriver.set(d.user_id, d);
  }
  /** Parse numeric from DB (Supabase may return numeric as string). */
  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const offersByDriverId: Record<string, DriverOffer> = {};
  for (const row of invites ?? []) {
    const driver = userToDriver.get(
      (row as { to_user_id: string }).to_user_id,
    );
    if (!driver) continue;
    const r = row as {
      payable_amount?: unknown;
      commission_percent?: unknown;
      commission_per_km?: unknown;
    };
    // Invite fields take priority; fall back to drivers table when invite was accepted
    // without commission terms (e.g. invite pre-dated the compensation edit).
    const payable = num(r.payable_amount) ?? num(driver.payable_amount);
    const pct = num(r.commission_percent) ?? num(driver.commission_percent);
    const perKm = num(r.commission_per_km) ?? num(driver.commission_per_km);
    offersByDriverId[driver.id] = {
      payableAmount: payable,
      commissionPercent: pct,
      commissionPerKm: perKm,
    };
  }
  return { error: null, offersByDriverId };
}

/**
 * List driver invites sent by the given org (pending only). Used by Network Architecture REQUESTS tab.
 * RLS: from_org members can select. Single indexed query, O(n) in result size.
 */
export async function getDriverInvitesSent(orgId: string): Promise<{
  error: Error | null;
  invites: DriverInviteSentRow[];
}> {
  if (!(await getAccessToken())) {
    return { error: null, invites: [] };
  }
  // Prefer an RPC because client-side RLS typically blocks reading invitee details (auth.users/profiles).
  const { data, error } = await supabase().rpc("get_driver_invites_sent", { p_org_id: orgId });
  if (error) {
    // Fallback: show invites even when the RPC isn't available (e.g. not deployed yet / RLS differences).
    const { data: fallback, error: fallbackErr } = await supabase()
      .from("driver_invites")
      .select("id, from_org_name, invitee_name, status, created_at, to_user_id")
      .eq("from_organization_id", orgId)
      .order("created_at", { ascending: false });
    if (fallbackErr) return { error: new Error(fallbackErr.message), invites: [] };
    return {
      error: null,
      invites: ((fallback ?? []) as Array<{
        id: string;
        from_org_name: string | null;
        invitee_name: string | null;
        status: string;
        created_at: string;
        to_user_id?: string | null;
      }>).map((r) => ({
        ...r,
        driver_name: r.invitee_name ?? null,
        to_user_id: r.to_user_id ?? null,
      })),
    };
  }
  return { error: null, invites: (data ?? []) as DriverInviteSentRow[] };
}

/**
 * Read signup-match state for a driver row in owner/dispatcher app.
 * Returns pending/invite-sent state when a manually-added driver later signs up with same phone.
 */
export async function getDriverSignupMatchStatus(
  driverId: string,
): Promise<{ error: Error | null; match: DriverSignupMatchStatus | null }> {
  const { data, error } = await supabase().rpc("get_driver_signup_match_status", {
    p_driver_id: driverId,
  });
  if (error) return { error: new Error(error.message), match: null };
  const row = (Array.isArray(data) ? data[0] : data) as DriverSignupMatchStatus | undefined;
  return { error: null, match: row ?? null };
}

/**
 * Owner action: send invitation for a detected signup-match (manual driver -> real app account).
 * Uses DB RPC so it stays idempotent and updates signup-match state consistently.
 */
export async function sendDriverSignupMatchInvite(
  driverId: string,
  offer?: {
    payableAmount?: number | null;
    commissionPercent?: number | null;
    commissionPerKm?: number | null;
  },
): Promise<{
  error: Error | null;
  ok: boolean;
  already_exists: boolean;
  status: string | null;
}> {
  const payloadWithOffer = {
    p_driver_id: driverId,
    p_payable_amount: offer?.payableAmount ?? null,
    p_commission_percent: offer?.commissionPercent ?? null,
    p_commission_per_km: offer?.commissionPerKm ?? null,
  };
  let { data, error } = await supabase().rpc(
    "send_driver_signup_match_invite",
    payloadWithOffer,
  );
  if (error) {
    const msg = error.message ?? "";
    // Backward-compat: older backend has send_driver_signup_match_invite(uuid) only.
    if (/Could not find the function public\.send_driver_signup_match_invite/i.test(msg)) {
      const legacy = await supabase().rpc("send_driver_signup_match_invite", {
        p_driver_id: driverId,
      });
      data = legacy.data;
      error = legacy.error;
    }
  }
  if (error) return { error: new Error(error.message), ok: false, already_exists: false, status: null };
  const obj = data as { ok?: boolean; already_exists?: boolean; status?: string } | null;
  if (obj?.ok === false) {
    return {
      error: new Error((obj as { error?: string }).error ?? "Failed to send invitation"),
      ok: false,
      already_exists: Boolean(obj?.already_exists),
      status: obj?.status ?? null,
    };
  }
  return {
    error: null,
    ok: obj?.ok ?? true,
    already_exists: Boolean(obj?.already_exists),
    status: obj?.status ?? null,
  };
}

/**
 * Owner dismisses a pending signup match (manual driver ↔ app account detected).
 */
export async function dismissDriverSignupMatch(
  driverId: string,
): Promise<{ error: Error | null; dismissed: number }> {
  const { data, error } = await supabase().rpc("dismiss_driver_signup_match", {
    p_driver_id: driverId,
  });
  if (error) return { error: new Error(error.message), dismissed: 0 };
  const obj = data as { ok?: boolean; dismissed?: number } | null;
  const n = typeof obj?.dismissed === "number" ? obj.dismissed : 0;
  return { error: null, dismissed: n };
}

/**
 * Owner action: reset a sent/declined signup-match invitation back to pending_owner_action.
 * Preferred RPC is reset_driver_signup_invite; falls back to dismiss behavior for older backends.
 */
export async function resetDriverSignupInvite(
  driverId: string,
): Promise<{ error: Error | null; reset: boolean }> {
  const { data, error } = await supabase().rpc("reset_driver_signup_invite", {
    p_driver_id: driverId,
  });
  if (!error) {
    const obj = data as { ok?: boolean; reset?: boolean } | null;
    return {
      error: null,
      reset: Boolean(obj?.ok ?? obj?.reset ?? true),
    };
  }
  // Backward-compat fallback while backend RPC is rolling out.
  const fallback = await dismissDriverSignupMatch(driverId);
  if (fallback.error) return { error: fallback.error, reset: false };
  if (fallback.dismissed > 0) return { error: null, reset: true };
  return {
    error: new Error("Unable to reset invitation right now. Please try again shortly."),
    reset: false,
  };
}

/**
 * Dispatcher-led roster invite for drivers without a platform account yet.
 * Atomically finds-or-creates the org's roster row (reusing + refreshing an
 * existing active row, or creating one under a global cross-org phone lock)
 * and creates the pending driver_invites row. See invite_driver RPC.
 */
export async function inviteRosterDriver(
  phone: string,
  name: string,
  orgId: string,
  extra?: {
    email?: string | null;
    payableAmount?: number | null;
    commissionPercent?: number | null;
    commissionPerKm?: number | null;
  },
): Promise<{ inviteId: string | null; driver: DriverRow | null; error: Error | null }> {
  const { data, error } = await supabase().rpc("invite_driver", {
    p_phone: phone,
    p_name: name,
    p_org_id: orgId,
    p_email: extra?.email ?? undefined,
    p_payable_amount: extra?.payableAmount ?? undefined,
    p_commission_percent: extra?.commissionPercent ?? undefined,
    p_commission_per_km: extra?.commissionPerKm ?? undefined,
  });
  if (error) {
    return { inviteId: null, driver: null, error: new Error(error.message) };
  }
  const result = data as {
    ok?: boolean;
    error?: string;
    driver?: DriverRow;
    invite_id?: string;
  } | null;
  if (!result?.ok) {
    return {
      inviteId: null,
      driver: null,
      error: new Error(result?.error ?? "Could not invite driver"),
    };
  }
  return {
    inviteId: result.invite_id ?? null,
    driver: (result.driver as DriverRow) ?? null,
    error: null,
  };
}

/**
 * Consume a phone-based roster invite after driver OTP auth (deep link token).
 * Sets drivers.user_id = auth.uid() when phone matches.
 */
export async function consumeDriverInvite(
  inviteId: string,
): Promise<{ success: boolean; error: Error | null }> {
  const { data, error } = await supabase().rpc("consume_driver_invite", {
    p_invite_id: inviteId,
  });
  if (error) {
    return { success: false, error: new Error(error.message) };
  }
  return { success: data === true, error: null };
}

/**
 * Accept a driver invite: creates driver row in that org and links to current user. Requires RPC accept_driver_invite.
 * Backend should prefer reconnecting: if a driver with the same phone already exists in that org with left_at set,
 * update that row (clear left_at, set user_id) and return it instead of inserting a duplicate.
 */
export async function acceptDriverInvite(inviteId: string): Promise<{
  error: Error | null;
  driver_id: string | null;
  organization_id: string | null;
}> {
  const { data, error } = await supabase().rpc("accept_driver_invite", {
    p_invite_id: inviteId,
  });
  if (error) {
    // 23505 = duplicate key on idx_drivers_active_phone: a concurrent accept
    // already registered this driver in the org. Surface a clean message rather
    // than a raw DB exception.
    const code = (error as { code?: string }).code;
    const message =
      code === "23505"
        ? "You're already registered with this organization."
        : error.message?.includes("dco_not_employee_driver")
          ? "DCOs cannot join a business as employee drivers. You can operate independently as a DCO."
          : error.message;
    return {
      error: new Error(message),
      driver_id: null,
      organization_id: null,
    };
  }
  const obj = data as { driver_id?: string; organization_id?: string } | null;
  return {
    error: null,
    driver_id: obj?.driver_id ?? null,
    organization_id: obj?.organization_id ?? null,
  };
}

/**
 * Reject a driver invite. Requires RPC reject_driver_invite.
 */
export async function rejectDriverInvite(
  inviteId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc("reject_driver_invite", {
    p_invite_id: inviteId,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Cancel a driver invite that you have sent.
 * Deletes the pending invite row.
 */
export async function cancelDriverInvite(inviteId: string): Promise<{
  error: Error | null;
  deleted: boolean;
}> {
  const { data: deleteData, error } = await supabase()
    .from("driver_invites")
    .delete()
    .eq("id", inviteId)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: new Error(error.message), deleted: false };
  const deleted = Array.isArray(deleteData) && deleteData.length > 0;
  return { error: null, deleted };
}

/**
 * Leave a fleet (set driver's left_at for that org). Requires RPC leave_fleet in pulse-unified-base.
 * Driver must be linked to current user; after success the connection appears in passbook history.
 */
export async function leaveFleet(
  organizationId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc("leave_fleet", {
    p_organization_id: organizationId,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Link an existing driver row to an app user by phone/email (dispatcher action).
 * Requires RPC attach_driver_by_contact in the DB (pulse-unified-base). The driver must
 * have signed up first (profile with role=driver and matching phone/email).
 */
export async function attachDriverByContact(
  driverId: string,
  options: { phone?: string | null; email?: string | null },
): Promise<{ error: Error | null; driver: DriverRow | null }> {
  const phone = options.phone?.trim() || null;
  const email = options.email?.trim() || null;
  const { data, error } = await supabase()
    .rpc("attach_driver_by_contact", {
      p_driver_id: driverId,
      p_phone: phone || undefined,
      p_email: email || undefined,
    })
    .select()
    .maybeSingle();
  if (error) return { error: new Error(error.message), driver: null };
  return { error: null, driver: data as DriverRow | null };
}

/** driver_ledger.type values (CHECK constraint). Add new values via DB migration in pulse-unified-base if needed. */
export const DRIVER_LEDGER_TYPES = [
  "salary",
  "settlement",
  "advance",
  "reimbursement",
  "bonus",
  "adjustment",
  "deduction",
] as const;
export type DriverLedgerType = (typeof DRIVER_LEDGER_TYPES)[number];

export interface DriverLedgerRow {
  id: string;
  organization_id: string;
  driver_id: string;
  trip_id: string | null;
  type: string;
  amount: number;
  currency: string;
  description: string | null;
  created_at: string;
  created_by: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
}

/**
 * Create a driver_ledger entry when the supplier pays a driver.
 * RLS: org members can insert for their org. Driver can read own ledger.
 */
export async function createDriverLedgerEntry(
  orgId: string,
  driverId: string,
  amount: number,
  type: DriverLedgerType,
  options?: {
    tripId?: string | null;
    createdBy?: string | null;
    description?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
  },
): Promise<{ error: Error | null; row: DriverLedgerRow | null }> {
  if (amount <= 0)
    return { error: new Error("Amount must be positive"), row: null };
  if (!DRIVER_LEDGER_TYPES.includes(type))
    return { error: new Error("Invalid driver ledger type"), row: null };
  const payload: Record<string, unknown> = {
    organization_id: orgId,
    driver_id: driverId,
    amount,
    type,
    trip_id: options?.tripId ?? null,
    created_by: options?.createdBy ?? null,
    description: options?.description ?? null,
    reference_type: options?.referenceType ?? null,
    reference_id: options?.referenceId ?? null,
  };
  const { data, error } = await supabase()
    .from("driver_ledger")
    .insert(payload)
    .select()
    .single();
  if (error) {
    const duplicate =
      error.code === "23505" ||
      /driver_ledger_dco_capture_uidx|duplicate key/i.test(error.message ?? "");
    if (duplicate && options?.referenceId) {
      const existing = await findDriverLedgerByReference(
        orgId,
        options.referenceType ?? "dco_capture",
        options.referenceId,
      );
      if (existing.row) return existing;
    }
    return { error: new Error(error.message), row: null };
  }
  return { error: null, row: data as DriverLedgerRow };
}

export async function findDriverLedgerByReference(
  orgId: string,
  referenceType: string,
  referenceId: string,
): Promise<{ error: Error | null; row: DriverLedgerRow | null }> {
  const type = referenceType.trim();
  const key = referenceId.trim();
  if (!orgId || !type || !key) return { error: null, row: null };
  const { data, error } = await supabase()
    .from("driver_ledger")
    .select(DRIVER_LEDGER_COLUMNS)
    .eq("organization_id", orgId)
    .eq("reference_type", type)
    .eq("reference_id", key)
    .maybeSingle();
  if (error) return { error: new Error(error.message), row: null };
  return { error: null, row: (data as DriverLedgerRow | null) ?? null };
}

/** Driver still linked to a fleet vehicle. Used when a plate change should suggest who already runs it. */
export async function findActiveDriverForVehicle(
  vehicleId: string,
): Promise<{ error: Error | null; name: string | null; phone: string | null }> {
  const id = vehicleId.trim();
  if (!id) return { error: null, name: null, phone: null };
  const { data, error } = await supabase()
    .from("drivers")
    .select("name, phone")
    .eq("assigned_vehicle_id", id)
    .is("left_at", null)
    .limit(1)
    .maybeSingle();
  if (error) return { error: new Error(error.message), name: null, phone: null };
  const row = data as { name?: string | null; phone?: string | null } | null;
  return {
    error: null,
    name: row?.name?.trim() || null,
    phone: row?.phone?.trim() || null,
  };
}

/**
 * Get driver_ledger entries for a driver (e.g. driver app Wallet). RLS: driver can read own ledger.
 */
export async function getDriverLedgerByDriver(
  driverId: string,
): Promise<{ error: Error | null; entries: DriverLedgerRow[] }> {
  const { data, error } = await supabase()
    .from("driver_ledger")
    .select(DRIVER_LEDGER_COLUMNS)
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { error: new Error(error.message), entries: [] };
  return { error: null, entries: (data ?? []) as unknown as DriverLedgerRow[] };
}

/**
 * Ledger rows for one trip. The `trip_id` filter is applied in Postgres.
 * The cap matches the old driver-wide window so a busy trip is not truncated
 * below what settlement used to see, without loading other trips.
 */
export async function getDriverLedgerByTripId(
  tripId: string,
): Promise<{ error: Error | null; entries: DriverLedgerRow[] }> {
  const id = tripId.trim();
  if (!id) return { error: null, entries: [] };
  const { data, error } = await supabase()
    .from("driver_ledger")
    .select(DRIVER_LEDGER_COLUMNS)
    .eq("trip_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { error: new Error(error.message), entries: [] };
  return { error: null, entries: (data ?? []) as unknown as DriverLedgerRow[] };
}

/**
 * Get driver_ledger entries for multiple driver ids (e.g. current user has multiple org links). Single query.
 */
export async function getDriverLedgerByDriverIds(
  driverIds: string[],
): Promise<{ error: Error | null; entries: DriverLedgerRow[] }> {
  if (driverIds.length === 0) return { error: null, entries: [] };
  const { data, error } = await supabase()
    .from("driver_ledger")
    .select(DRIVER_LEDGER_COLUMNS)
    .in("driver_id", driverIds)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { error: new Error(error.message), entries: [] };
  return { error: null, entries: (data ?? []) as unknown as DriverLedgerRow[] };
}

/** Single round-trip bundle for DriverDetailScreen — replaces 6 parallel calls. */
export async function getDriverDetailBundle(orgId: string, driverId: string): Promise<{
  error: Error | null;
  driver: DriverRow | null;
  ratings: RatingRow[];
  salaryRequests: SalaryRequestRow[];
  ledger: DriverLedgerRow[];
  transactions: LedgerRow[];
}> {
  const { data, error } = await supabase().rpc('get_driver_detail_bundle', {
    p_org_id: orgId,
    p_driver_id: driverId,
  });
  if (error) return { error: new Error(error.message), driver: null, ratings: [], salaryRequests: [], ledger: [], transactions: [] };
  const bundle = data as { driver: DriverRow | null; ratings: RatingRow[]; salary_requests: SalaryRequestRow[]; ledger: DriverLedgerRow[]; transactions: LedgerRow[] };
  return {
    error: null,
    driver: bundle.driver ?? null,
    ratings: bundle.ratings ?? [],
    salaryRequests: bundle.salary_requests ?? [],
    ledger: (bundle.ledger ?? []) as DriverLedgerRow[],
    transactions: bundle.transactions ?? [],
  };
}
