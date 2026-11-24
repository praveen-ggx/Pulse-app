/**
 * Resolve “who assigned this trip?” for driver UI (asset roster, aggregate OTP, assign-by-phone).
 * Mirrors logic in app/(driver)/index.tsx notifications / assignment card.
 */
import type { TripRow } from "@/features/trips/services/trips.service";
import { getFleetAvatarSeedForOrg } from "@/features/vehicles/utils/fleetAvatar.util";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Any-version UUID: what Postgres accepts for a uuid column. */
const UUID_ANY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeUuidFragment(s: string): boolean {
  const t = String(s ?? "").trim();
  if (!t) return false;
  if (UUID_V4_RE.test(t)) return true;
  if (/^[0-9a-f]{6,12}$/i.test(t)) return true;
  return false;
}

/** Prefer assignment audit actor (who assigned driver), then explicit assigner ids, then creator. */
export function resolveAssignerUserId(
  trip: TripRow,
  auditActorByTripId: Record<string, string>,
): string {
  const meta = trip as TripRow &
    Record<string, string | number | boolean | null | undefined>;
  const audit = (auditActorByTripId[String(trip.id)] ?? "").trim();
  const assignedByUserId = String(meta.assigned_by_user_id ?? "").trim();
  const createdByUserId = String(trip.created_by_user_id ?? "").trim();
  const ownerUserId = String(meta.owner_user_id ?? "").trim();
  const statusUpdatedBy = String(meta.status_updated_by ?? "").trim();
  const assignedBy = String(meta.assigned_by ?? "").trim();
  const createdBy = String(trip.created_by ?? "").trim();

  // Every candidate feeds `profiles.id IN (...)`. status_updated_by / audit actors can hold a
  // free-text name (e.g. "Sivakozhunthu"), which makes Postgres reject the whole list (22P02).
  for (const candidate of [
    audit,
    assignedByUserId,
    createdByUserId,
    ownerUserId,
    statusUpdatedBy,
    assignedBy,
    createdBy,
  ]) {
    if (candidate && UUID_ANY_RE.test(candidate)) return candidate;
  }
  return "";
}

export function humanizeAssignerDisplayName(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  if (looksLikeUuidFragment(t)) return "";
  const lower = t.toLowerCase();
  if (lower === "partner") return "";
  if (/^user\s+/i.test(t)) {
    const rest = t.replace(/^user\s+/i, "").trim();
    if (looksLikeUuidFragment(rest) || /^[0-9a-f-]{6,}$/i.test(rest)) return "";
  }
  return t;
}

export type DriverInviteLite = {
  from_organization_id?: string | null;
  from_org_name?: string | null;
  from_org_logo_url?: string | null;
  from_org_avatar_url?: string | null;
  from_org_avatar_seed?: string | null;
  payable_amount?: number | null;
  commission_percent?: number | null;
  commission_per_km?: number | null;
  status?: string | null;
};

/** How the driver should treat this assignment (fleet payroll vs direct / partner). */
export type JobCardAssignmentSourceKind =
  | "your_fleet"
  | "employer"
  | "direct"
  | "partner";

export type JobCardAssignerPayload = {
  kind: JobCardAssignmentSourceKind;
  kindLabel: string;
  linePrimary: string;
  lineSecondary: string;
  orgId: string;
  orgName: string;
  orgLogoUrl?: string | null;
  orgAvatarSeed?: string | null;
  orgAvatarUrl?: string | null;
};

export function resolveJobCardAssignmentSourceKind(
  trip: TripRow,
  driverOrganizationId: string | null | undefined,
  flags: { requiresOtp: boolean; isAggregate: boolean; isRoster: boolean },
  acceptedInviteForOrg: DriverInviteLite | null,
): Pick<JobCardAssignerPayload, "kind" | "kindLabel"> {
  const tripOrgId = (trip.organization_id ?? "").trim();
  const tripSupplierId = (trip.supplier_id ?? "").trim();
  const driverOrgId = (driverOrganizationId ?? "").trim();
  const isOwnFleet = Boolean(
    driverOrgId &&
    (tripOrgId === driverOrgId || (tripSupplierId && tripSupplierId === driverOrgId)),
  );
  const hasAcceptedEmployer =
    acceptedInviteForOrg != null &&
    String(acceptedInviteForOrg.status ?? "").toLowerCase() === "accepted";

  if (flags.requiresOtp || flags.isAggregate) {
    return { kind: "direct", kindLabel: "OFFLINE TRIP" };
  }
  if (isOwnFleet) {
    return { kind: "your_fleet", kindLabel: "YOUR FLEET" };
  }
  if (hasAcceptedEmployer || flags.isRoster) {
    return { kind: "employer", kindLabel: "EMPLOYER" };
  }
  return { kind: "partner", kindLabel: "PARTNER FLEET" };
}

/** Structured assigner block for JobRequestCard (avatar + trip-source badge). */
export function buildJobCardAssignerPayload(
  trip: TripRow,
  assigner: Pick<
    AssignerDisplayResult,
    "assignerLinePrimary" | "assignerLineSecondary" | "assignedByOrgName"
  > &
    Partial<Pick<AssignerDisplayResult, "effectiveAssignerOrgId">>,
  driverOrganizationId: string | null | undefined,
  inviteForOrg: DriverInviteLite | null,
  flags: { requiresOtp: boolean; isAggregate: boolean; isRoster: boolean },
  orgLogoFromDb?: string | null,
  orgAvatarFromDb?: { seed?: string | null; url?: string | null } | null,
): JobCardAssignerPayload {
  const acceptedInvite =
    inviteForOrg &&
    String(inviteForOrg.status ?? "").toLowerCase() === "accepted"
      ? inviteForOrg
      : null;
  const { kind, kindLabel } = resolveJobCardAssignmentSourceKind(
    trip,
    driverOrganizationId,
    flags,
    acceptedInvite,
  );
  // Prefer employer / assigning org (invite or display resolver) over raw trip.organization_id
  // — cross-org marketplace trips often put the client org on the trip row.
  const orgId =
    (inviteForOrg?.from_organization_id ?? "").trim() ||
    (assigner.effectiveAssignerOrgId ?? "").trim() ||
    (trip.organization_id ?? "").trim();

  // Business OrgParty order: logo → owner/admin seed → owner photo → hash fallback.
  // Treat empty strings as missing (invite RPC often returns "").
  const logoUrl =
    (inviteForOrg?.from_org_logo_url ?? "").trim() ||
    (orgLogoFromDb ?? "").trim() ||
    null;
  const ownerSeed =
    (inviteForOrg?.from_org_avatar_seed ?? "").trim() ||
    (orgAvatarFromDb?.seed ?? "").trim() ||
    null;
  const ownerPhoto =
    (inviteForOrg?.from_org_avatar_url ?? "").trim() ||
    (orgAvatarFromDb?.url ?? "").trim() ||
    null;
  // PartyAvatar checks contact photo before org seed — only pass owner photo when
  // there is no seed, so we match avatarContext OrgParty (logo → seed → photo).
  const orgAvatarSeed =
    ownerSeed ||
    (orgId
      ? getFleetAvatarSeedForOrg(orgId, assigner.assignedByOrgName)
      : null);

  return {
    kind,
    kindLabel,
    linePrimary: assigner.assignerLinePrimary,
    lineSecondary: assigner.assignerLineSecondary,
    orgId,
    orgName: assigner.assignedByOrgName,
    orgLogoUrl: logoUrl,
    orgAvatarSeed,
    orgAvatarUrl: ownerSeed ? null : ownerPhoto,
  };
}

/** Match fleet invite to assigning org (employer / supplier / trip org), same as trip-history. */
export function findDriverInviteForTripOrgs(
  invites: readonly DriverInviteLite[],
  orgIds: Array<string | null | undefined>,
): DriverInviteLite | null {
  for (const raw of orgIds) {
    const oid = String(raw ?? "").trim();
    if (!oid) continue;
    const hit = invites.find(
      (i) => (i.from_organization_id ?? "").trim() === oid,
    );
    if (hit) return hit;
  }
  return null;
}

export type AssignerResolutionDeps = {
  assignmentActorByTripId: Record<string, string>;
  assignerNamesByUserId: Record<string, string>;
  assignerOrgNameByUserId?: Record<string, string>;
  assignerDisplayByTripId: Record<string, string>;
  /** SECURITY DEFINER RPC: fleet name for trips.organization_id (drivers may lack org SELECT). */
  assignerTripOrgNameByTripId?: Record<string, string>;
  /** SECURITY DEFINER RPC: fleet org id when trip.organization_id is blanked in driver view. */
  assignerTripOrgIdByTripId?: Record<string, string>;
  organizationNamesById: Record<string, string>;
};

export type AssignerDisplayResult = {
  assignedByUserName: string | null;
  assignedByOrgName: string;
  assignerPersonDisplay: string;
  /** Bold / leading segment for driver UI: fleet when known, else person. */
  assignerLinePrimary: string;
  /** Muted / trailing segment: dispatcher when fleet leads, else fleet label. */
  assignerLineSecondary: string;
  assignedByName: string;
  /**
   * The org that actually assigned this trip from the driver's perspective.
   * For direct fleet trips: trip.organization_id.
   * For cross-org trips where employer is supplier: trip.supplier_id.
   * Callers use this to look up the correct logo/avatar.
   */
  effectiveAssignerOrgId: string;
};

/** Cross-fleet placeholder when the assigning org name cannot be resolved client-side. */
export const DRIVER_ASSIGNING_FLEET_UNKNOWN_LABEL = "Assigning fleet";

function isGenericAssignerPerson(name: string): boolean {
  const t = name.trim().toLowerCase();
  return (
    !t ||
    t === "fleet dispatcher" ||
    t === "dispatcher" ||
    t === "partner"
  );
}

/**
 * Driver-facing “Assigned by” line: lead with organization when we know it.
 * Do not surface internal dispatcher / reassignment actors (e.g. “Kamesh”) —
 * drivers need the fleet brand, not staff roster names from assignment audit.
 * When the org is unknown, keep a real person name first so the line stays useful.
 */
export function assignerPrimarySecondaryForDriver(
  assignedByOrgName: string,
  assignerPersonDisplay: string,
): Pick<AssignerDisplayResult, "assignerLinePrimary" | "assignerLineSecondary"> {
  const unknownPeerOrg = assignedByOrgName === DRIVER_ASSIGNING_FLEET_UNKNOWN_LABEL;
  const person = assignerPersonDisplay.trim();
  const genericPerson = isGenericAssignerPerson(person);

  if (unknownPeerOrg) {
    return {
      assignerLinePrimary: genericPerson ? assignedByOrgName : person,
      assignerLineSecondary: genericPerson ? "" : assignedByOrgName,
    };
  }

  return {
    assignerLinePrimary: assignedByOrgName,
    assignerLineSecondary: "",
  };
}

/**
 * Dispatcher / fleet attribution for a trip (not cargo-party client/supplier names).
 * Used on JobRequestCard, notifications list, etc.
 */
export function buildAssignerDisplayForTrip(
  trip: TripRow,
  invites: DriverInviteLite[],
  driverOrganizationId: string | null | undefined,
  deps: AssignerResolutionDeps,
): AssignerDisplayResult {
  const tripMeta = trip as TripRow &
    Record<string, string | number | boolean | null | undefined>;
  const inviteForTrip =
    invites.find(
      (i) =>
        (i.from_organization_id ?? "").trim() ===
        (trip.organization_id ?? "").trim(),
    ) ??
    (trip.supplier_id
      ? invites.find(
          (i) =>
            (i.from_organization_id ?? "").trim() ===
            (trip.supplier_id ?? "").trim(),
        )
      : undefined) ??
    null;

  const assignerUserId = resolveAssignerUserId(
    trip,
    deps.assignmentActorByTripId,
  ).trim();

  // Determine the org that actually assigned this trip from the driver's perspective.
  // For cross-org trips the invite may come from supplier_id (employer is supplier), or
  // the driver's own org may be the supplier (admin/owner driving for their fleet).
  const tripOrgIdRaw = (trip.organization_id ?? "").trim();
  const tripSupplierIdRaw = (trip.supplier_id ?? "").trim();
  const driverOrgIdRaw = (driverOrganizationId ?? "").trim();
  const inviteIsFromSupplier =
    !!tripSupplierIdRaw &&
    !!inviteForTrip &&
    (inviteForTrip.from_organization_id ?? "").trim() === tripSupplierIdRaw;
  const driverOrgIsSupplier =
    !!tripSupplierIdRaw && !!driverOrgIdRaw && driverOrgIdRaw === tripSupplierIdRaw;
  const rpcAssignerOrgId = (
    deps.assignerTripOrgIdByTripId?.[String(trip.id).trim()] ?? ""
  ).trim();
  const effectiveAssignerOrgId =
    inviteIsFromSupplier || driverOrgIsSupplier
      ? tripSupplierIdRaw
      : tripOrgIdRaw || rpcAssignerOrgId;

  const tripAssignedByUserNameCandidates = [
    tripMeta.assigned_by_name,
    tripMeta.assigned_by_user_name,
    tripMeta.assigned_by,
    tripMeta.created_by_name,
    tripMeta.dispatcher_name,
  ];
  const tripAssignedByOrgNameCandidates = [
    deps.assignerTripOrgNameByTripId?.[String(trip.id).trim()] ?? null,
    deps.assignerOrgNameByUserId?.[assignerUserId] ?? null,
    inviteForTrip?.from_org_name ?? null,
    deps.organizationNamesById[effectiveAssignerOrgId] ?? null,
    // Fall back to trip.organization_id name only when different from effective assigner
    effectiveAssignerOrgId !== tripOrgIdRaw
      ? (deps.organizationNamesById[tripOrgIdRaw] ?? null)
      : null,
    (tripMeta.organization_name as string | null | undefined) ?? null,
    (tripMeta.org_name as string | null | undefined) ?? null,
    (tripMeta.from_org_name as string | null | undefined) ?? null,
    (tripMeta.company_name as string | null | undefined) ?? null,
  ];
  const resolvedFromTripFields = tripAssignedByUserNameCandidates
    .map((value) => humanizeAssignerDisplayName(String(value ?? "")))
    .find((value) => value.length > 0);
  const resolvedFromProfiles = humanizeAssignerDisplayName(
    deps.assignerNamesByUserId[assignerUserId] ?? "",
  );
  const fromRpc = humanizeAssignerDisplayName(
    deps.assignerDisplayByTripId[String(trip.id)] ?? "",
  );
  const assignedByUserName =
    (fromRpc.length > 0 ? fromRpc : null) ??
    resolvedFromTripFields ??
    (resolvedFromProfiles.length > 0 ? resolvedFromProfiles : null);

  const assignedByOrgName =
    tripAssignedByOrgNameCandidates
      .map((value) => String(value ?? "").trim())
      .find((value) => value.length > 0) ??
    ((trip.organization_id ?? "").trim() ===
    (driverOrganizationId ?? "").trim()
      ? "Your fleet"
      : DRIVER_ASSIGNING_FLEET_UNKNOWN_LABEL);

  const assignerPersonDisplay =
    (assignedByUserName ?? "").trim() || "Fleet dispatcher";

  const { assignerLinePrimary, assignerLineSecondary } =
    assignerPrimarySecondaryForDriver(assignedByOrgName, assignerPersonDisplay);
  const assignedByName = [assignerLinePrimary, assignerLineSecondary]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" · ");

  return {
    assignedByUserName,
    assignedByOrgName,
    assignerPersonDisplay,
    assignerLinePrimary,
    assignerLineSecondary,
    assignedByName,
    effectiveAssignerOrgId,
  };
}
