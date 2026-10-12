/**
 * Platform Identity team roles — aligned with platform.roles seed and @pulse/contracts.
 * Maps to legacy organization_members.role for mobile Supabase writes.
 */
import type { OrgMember, OrgMemberRole } from "@/types/organization";
import type { Capability } from "@/lib/capabilities";
import {
  COMPLIANCE_ROLE_SURFACE_IDS,
  defaultSurfacesForRole,
  domainsFromSurfaces,
  hydrateMemberSurfaces,
  memberHasSurface,
  normalizeSurfaces,
  type MemberSurfaceMap,
} from "@/lib/memberSurfaces";

/**
 * `planner` / `operator` are retired from new invites (superseded by the named
 * functional roles below) but stay in the union so pre-existing stored rows
 * still resolve to a real type instead of falling through to `null`.
 */
export type PlatformTeamRole =
  | "admin"
  | "planner"
  | "operator"
  | "finance"
  | "sales"
  | "tripops"
  | "ground_ops"
  /** Supplier desk — suppliers on Network + Finance → Suppliers sub-tab only. */
  | "vendor_support"
  /** Debit control desk — hard-copy POD (POD Pending / Received) + Debit Control page. Never pays. */
  | "debit_control"
  /** Trip Compliance — verifies documents, marks trips verified, logs hard-copy POD. Never pays. */
  | "compliance"
  /**
   * Zero-domain floor. A member with no Finance/Sales/TripOps access left
   * degrades to `restricted` instead of silently inheriting TripOps.
   */
  | "restricted";

const ALL_PLATFORM_TEAM_ROLES: readonly PlatformTeamRole[] = [
  "admin",
  "planner",
  "operator",
  "finance",
  "sales",
  "tripops",
  "ground_ops",
  "vendor_support",
  "debit_control",
  "compliance",
  "restricted",
];

/** Narrows a raw string (e.g. from an RPC payload) to a known `PlatformTeamRole`. */
export function isPlatformTeamRole(value: string): value is PlatformTeamRole {
  return (ALL_PLATFORM_TEAM_ROLES as readonly string[]).includes(value);
}

/** Named functional roles an owner can assign to a non-admin member. */
export type FunctionalRole = "finance" | "sales" | "tripops";

/** Per-domain tab access stored on the member row (org model ∩ these flags). */
export type MemberDomainFlags = {
  finance: boolean;
  sales: boolean;
  tripops: boolean;
};

export type TeamInvitePermissions = {
  platformRole: PlatformTeamRole;
  grants: string[];
  /**
   * Optional multi-domain overrides. When present, `useMemberCapabilities`
   * uses these instead of the single functional role derived from
   * `platformRole`. Absent on legacy rows → fall back to one-of-three role.
   */
  domains?: MemberDomainFlags;
  /**
   * Drill-down surface grants (org model ∩ these). Source of truth for
   * per-action RBAC — see `lib/memberSurfaces.ts`.
   */
  surfaces?: MemberSurfaceMap;
  /**
   * Department manager flag. Owner-assigned only (via set_member_role).
   * Lets the member edit `surfaces` for other members sharing their own
   * `platformRole`, through the narrower set_member_surfaces_as_manager RPC —
   * never role/platformRole/domains/this flag itself. See
   * supabase/migrations/20270220120000_department_manager_surface_write.sql.
   */
  isDepartmentManager?: boolean;
  /**
   * Pending phone invites only: Ground Ops warehouses, replayed into
   * organization_member_warehouses by accept_pending_team_invitation.
   */
  warehouseIds?: string[];
};

const PERMISSION_LABELS: Record<string, string> = {
  "org:read": "View organisation",
  "org:write": "Edit organisation settings",
  "organizations:create": "Create organisations",
  "warehouses:read": "View warehouses",
  "warehouses:write": "Manage warehouses",
  "users:invite": "Invite team members",
  "users:manage": "Manage team members",
  "commerce:*": "Commerce — products, orders, CRM",
  "planning:*": "Planning — indents & load planning",
  "ops:*": "Operations — dispatch & trips",
  "execution:read": "View trips & execution",
  "finance:read": "View finance & ledgers",
  "finance:manage": "Manage finance & invoicing",
};

export const PLATFORM_ROLE_GRANTS: Record<PlatformTeamRole, string[]> = {
  admin: [
    "org:read",
    "org:write",
    "warehouses:read",
    "warehouses:write",
    "users:invite",
    "users:manage",
    "commerce:*",
    "planning:*",
    "ops:*",
    "finance:read",
    "finance:manage",
  ],
  planner: [
    "org:read",
    "warehouses:read",
    "warehouses:write",
    "commerce:*",
    "planning:*",
  ],
  operator: ["org:read", "warehouses:read", "ops:*", "execution:read"],
  finance: ["org:read", "finance:read", "finance:manage"],
  sales: ["org:read", "warehouses:read", "commerce:*"],
  tripops: ["org:read", "warehouses:read", "ops:*", "planning:*", "execution:read"],
  ground_ops: ["org:read", "execution:read"],
  vendor_support: ["org:read", "warehouses:read", "commerce:*", "finance:read"],
  debit_control: ["org:read", "execution:read"],
  compliance: ["org:read", "execution:read"],
  // Baseline only — can see the workspace exists, nothing functional.
  restricted: ["org:read"],
};

export type TeamInviteRoleOption = {
  value: PlatformTeamRole;
  label: string;
  description: string;
  grants: string[];
};

export const TEAM_INVITE_ROLE_OPTIONS: TeamInviteRoleOption[] = [
  {
    value: "admin",
    label: "Administrator",
    description: "Full workspace access — team, settings, commerce, planning, and operations.",
    grants: PLATFORM_ROLE_GRANTS.admin,
  },
  {
    value: "finance",
    label: "Finance",
    description: "Finance and ledgers — cash, invoicing, and fiscal reporting.",
    grants: PLATFORM_ROLE_GRANTS.finance,
  },
  {
    value: "sales",
    label: "Sales",
    description: "Commerce and customers — marketplace, clients, and load posting.",
    grants: PLATFORM_ROLE_GRANTS.sales,
  },
  {
    value: "vendor_support",
    label: "Vendor support",
    description: "Manage suppliers on the Network page; in Finance, the Suppliers sub-tab only.",
    grants: PLATFORM_ROLE_GRANTS.vendor_support,
  },
  {
    value: "tripops",
    label: "TripOps",
    description: "Day-to-day execution — trips, dispatch, driver coordination, and trip visibility.",
    grants: PLATFORM_ROLE_GRANTS.tripops,
  },
  {
    value: "ground_ops",
    label: "Ground Ops",
    description: "Upload trip documents from the field — LR, POD, and other trip paperwork.",
    grants: PLATFORM_ROLE_GRANTS.ground_ops,
  },
  {
    value: "compliance",
    label: "Compliance",
    description: "Document Upload and Compliance Verification — verify documents, mark trips verified. No payments.",
    grants: PLATFORM_ROLE_GRANTS.compliance,
  },
  {
    value: "debit_control",
    label: "Debit control",
    description: "Hard-copy POD — POD Pending / POD Received and the Debit Control page. No payments.",
    grants: PLATFORM_ROLE_GRANTS.debit_control,
  },
];

export function permissionLabel(grant: string): string {
  return PERMISSION_LABELS[grant] ?? grant;
}

export function emptyMemberDomains(): MemberDomainFlags {
  return { finance: false, sales: false, tripops: false };
}

/** Default domain flags for a platform role preset. */
export function domainsFromPlatformRole(
  platformRole: PlatformTeamRole | null,
): MemberDomainFlags {
  if (platformRole === "admin") {
    return { finance: true, sales: true, tripops: true };
  }
  const functional = functionalRoleFromPlatformRole(platformRole);
  return {
    finance: functional === "finance",
    sales: functional === "sales",
    tripops: functional === "tripops",
  };
}

/**
 * Resolve effective domain flags for a stored member row.
 * Prefers surfaces → domains → platformRole.
 */
export function domainsFromMember(
  member: Pick<OrgMember, "role" | "permissions">,
): MemberDomainFlags {
  const raw = member.permissions as TeamInvitePermissions | null | undefined;
  if (raw?.surfaces && Object.keys(raw.surfaces).length > 0) {
    return domainsFromSurfaces(raw.surfaces);
  }
  const stored = raw?.domains;
  if (
    stored &&
    typeof stored.finance === "boolean" &&
    typeof stored.sales === "boolean" &&
    typeof stored.tripops === "boolean"
  ) {
    return {
      finance: stored.finance,
      sales: stored.sales,
      tripops: stored.tripops,
    };
  }
  return domainsFromPlatformRole(platformRoleFromMember(member));
}

/** Resolve surface map — explicit surfaces (hydrated), else derive from role. */
export function surfacesFromMember(
  member: Pick<OrgMember, "role" | "permissions">,
  orgCaps: Capability[] = [],
): MemberSurfaceMap {
  const raw = member.permissions as TeamInvitePermissions | null | undefined;
  if (raw?.surfaces && typeof raw.surfaces === "object") {
    return hydrateMemberSurfaces({ ...raw.surfaces }, orgCaps);
  }
  const role = platformRoleFromMember(member);
  if (!role) return {};
  return defaultSurfacesForRole(role, orgCaps);
}

/**
 * Pick a display/storage platformRole that best matches the domain set.
 * Admin only when all three are on AND `preferAdmin` is true (explicit admin preset).
 * Zero domains → `restricted` (never silently fall back to tripops).
 */
export function platformRoleFromDomains(
  domains: MemberDomainFlags,
  preferAdmin = false,
): PlatformTeamRole {
  if (preferAdmin && domains.finance && domains.sales && domains.tripops) {
    return "admin";
  }
  // Prefer tripops > finance > sales when multiple are on (label only — domains gate access).
  if (domains.tripops) return "tripops";
  if (domains.finance) return "finance";
  if (domains.sales) return "sales";
  return "restricted";
}

/**
 * Role label after a domain, section, or single-surface edit.
 *
 * Finance / Sales / TripOps / Admin are derived from domain flags.
 * Compliance and Ground Ops are not — a section toggle used to drop them
 * onto TripOps whenever Operations stayed on. Keep the label while its
 * grants are still there; re-derive only once those grants are gone.
 */
export function platformRoleAfterAccessEdit(
  role: PlatformTeamRole,
  domains: MemberDomainFlags,
  surfaces: MemberSurfaceMap,
  orgCaps: Capability[],
): PlatformTeamRole {
  if (role === "admin") {
    return domains.finance && domains.sales && domains.tripops
      ? "admin"
      : platformRoleFromDomains(domains);
  }
  if (role === "compliance") {
    const stillHasCompliance = COMPLIANCE_ROLE_SURFACE_IDS.some((id) =>
      memberHasSurface(orgCaps, surfaces, id),
    );
    return stillHasCompliance ? "compliance" : platformRoleFromDomains(domains);
  }
  if (role === "ground_ops") {
    return domains.tripops ? "ground_ops" : platformRoleFromDomains(domains);
  }
  if (role === "debit_control") {
    return memberHasSurface(orgCaps, surfaces, "trip_compliance.pod.manage")
      ? "debit_control"
      : platformRoleFromDomains(domains);
  }
  if (role === "vendor_support") {
    return memberHasSurface(orgCaps, surfaces, "sales.suppliers.view")
      ? "vendor_support"
      : platformRoleFromDomains(domains);
  }
  if (
    (role === "finance" || role === "sales" || role === "tripops") &&
    domains[role]
  ) {
    return role;
  }
  return platformRoleFromDomains(domains);
}

/** Union of grant strings for every enabled domain (+ org:read baseline). */
export function grantsFromDomains(domains: MemberDomainFlags): string[] {
  const set = new Set<string>(["org:read"]);
  if (domains.finance) {
    for (const g of PLATFORM_ROLE_GRANTS.finance) set.add(g);
  }
  if (domains.sales) {
    for (const g of PLATFORM_ROLE_GRANTS.sales) set.add(g);
  }
  if (domains.tripops) {
    for (const g of PLATFORM_ROLE_GRANTS.tripops) set.add(g);
  }
  return Array.from(set);
}

export function buildTeamInvitePermissions(
  platformRole: PlatformTeamRole,
  domains?: MemberDomainFlags,
  orgCaps: Capability[] = [],
  surfaces?: MemberSurfaceMap,
): TeamInvitePermissions {
  const rawSurfaces =
    surfaces ??
    (orgCaps.length > 0
      ? defaultSurfacesForRole(platformRole, orgCaps)
      : undefined);
  // Guard against an unsatisfiable grant (a surface true with its requires
  // chain missing/false) reaching storage from any caller, not just the
  // permissions panel — see normalizeSurfaces for why this must never be
  // skipped on a write path.
  const resolvedSurfaces = rawSurfaces
    ? normalizeSurfaces(rawSurfaces, orgCaps)
    : undefined;
  const resolvedDomains =
    domains ??
    (resolvedSurfaces && Object.keys(resolvedSurfaces).length > 0
      ? domainsFromSurfaces(resolvedSurfaces)
      : domainsFromPlatformRole(platformRole));
  return {
    platformRole,
    grants:
      platformRole === "admin"
        ? PLATFORM_ROLE_GRANTS.admin
        : grantsFromDomains(resolvedDomains),
    domains: resolvedDomains,
    ...(resolvedSurfaces ? { surfaces: resolvedSurfaces } : null),
  };
}

/** Build permissions from an explicit surface map (permission detail page). */
export function buildPermissionsFromSurfaces(
  surfaces: MemberSurfaceMap,
  options?: {
    preferAdmin?: boolean;
    platformRole?: PlatformTeamRole;
    orgCaps?: Capability[];
  },
): TeamInvitePermissions {
  const domains = domainsFromSurfaces(surfaces);
  const preferAdmin =
    options?.preferAdmin ?? options?.platformRole === "admin";

  // Keep the role the owner picked while its access is still there. Re-deriving
  // from domains alone mislabelled Sales as TripOps (Sales has the Trips tab).
  const requested = options?.platformRole;
  const platformRole =
    requested === "admin" && domains.finance && domains.sales && domains.tripops
      ? "admin"
      : requested === "ground_ops" ||
          requested === "compliance" ||
          requested === "vendor_support" ||
          requested === "debit_control"
        ? requested
        : (requested === "finance" || requested === "sales" || requested === "tripops") &&
            domains[requested]
          ? requested
          : platformRoleFromDomains(domains, preferAdmin);

  return buildTeamInvitePermissions(
    platformRole,
    domains,
    options?.orgCaps ?? [],
    surfaces,
  );
}

/** Roles that can carry the Department manager flag (one department each). */
export function canBeDepartmentManager(role: PlatformTeamRole): boolean {
  return role !== "admin" && role !== "restricted" && role !== "planner" && role !== "operator";
}

/**
 * Single write-shape for member access — used by both Invite and Edit so the
 * stored permissions are identical for the same toggles. Normalizes the
 * requires-chain and drops the manager flag on roles that can't hold it.
 */
export function buildMemberPermissions(input: {
  platformRole: PlatformTeamRole;
  surfaces: MemberSurfaceMap;
  isDepartmentManager?: boolean;
  orgCaps: Capability[];
}): TeamInvitePermissions {
  const permissions = buildPermissionsFromSurfaces(
    normalizeSurfaces(input.surfaces, input.orgCaps),
    {
      platformRole: input.platformRole,
      preferAdmin: input.platformRole === "admin",
      orgCaps: input.orgCaps,
    },
  );
  return {
    ...permissions,
    isDepartmentManager:
      input.isDepartmentManager === true &&
      canBeDepartmentManager(permissions.platformRole),
  };
}

/** @deprecated Prefer buildPermissionsFromSurfaces — kept for callers that only flip domains. */
export function buildPermissionsFromDomains(
  domains: MemberDomainFlags,
  options?: {
    preferAdmin?: boolean;
    platformRole?: PlatformTeamRole;
    orgCaps?: Capability[];
  },
): TeamInvitePermissions {
  const preferAdmin =
    options?.preferAdmin ?? options?.platformRole === "admin";
  const platformRole =
    options?.platformRole === "admin" &&
    domains.finance &&
    domains.sales &&
    domains.tripops
      ? "admin"
      : platformRoleFromDomains(domains, preferAdmin);
  const orgCaps = options?.orgCaps ?? [];
  const surfaces =
    orgCaps.length > 0
      ? defaultSurfacesForRole(platformRole, orgCaps)
      : undefined;
  // Honor domain master switches when we have surfaces
  let resolved = surfaces ?? {};
  if (surfaces) {
    if (!domains.finance) {
      resolved = { ...resolved };
      for (const k of Object.keys(resolved) as (keyof MemberSurfaceMap)[]) {
        if (String(k).startsWith("finance.")) resolved[k] = false;
      }
    }
    if (!domains.sales) {
      resolved = { ...resolved };
      for (const k of Object.keys(resolved) as (keyof MemberSurfaceMap)[]) {
        if (String(k).startsWith("sales.")) resolved[k] = false;
      }
    }
    if (!domains.tripops) {
      resolved = { ...resolved };
      for (const k of Object.keys(resolved) as (keyof MemberSurfaceMap)[]) {
        if (String(k).startsWith("tripops.") || String(k).startsWith("fleet.")) {
          resolved[k] = false;
        }
      }
    }
  }
  return buildTeamInvitePermissions(platformRole, domains, orgCaps, resolved);
}

/** Legacy org_members.role value stored alongside permissions.platformRole. */
export function orgMemberRoleForPlatformRole(
  platformRole: PlatformTeamRole,
): OrgMemberRole {
  switch (platformRole) {
    case "admin":
      return "admin";
    case "planner":
      return "dispatcher";
    case "operator":
      return "member";
    case "finance":
      return "finance";
    case "sales":
      return "member";
    case "tripops":
      return "dispatcher";
    case "ground_ops":
      return "member";
    case "vendor_support":
      return "member";
    case "debit_control":
      return "member";
    case "compliance":
      return "member";
    case "restricted":
      return "member";
  }
}

/**
 * Labels for roles that are not offered as pickable presets in
 * `TEAM_INVITE_ROLE_OPTIONS` (derived or legacy states).
 */
const NON_PRESET_ROLE_LABELS: Partial<Record<PlatformTeamRole, string>> = {
  restricted: "Restricted",
};

export function platformRoleLabel(role: PlatformTeamRole): string {
  return (
    TEAM_INVITE_ROLE_OPTIONS.find((o) => o.value === role)?.label ??
    NON_PRESET_ROLE_LABELS[role] ??
    role
  );
}

export function platformRoleFromMember(
  member: Pick<OrgMember, "role" | "permissions">,
): PlatformTeamRole | null {
  const raw = member.permissions as TeamInvitePermissions | null | undefined;
  if (raw?.platformRole) return raw.platformRole;
  switch (member.role) {
    case "admin":
      return "admin";
    case "dispatcher":
      return "planner";
    case "member":
      return "operator";
    default:
      return null;
  }
}

/**
 * Narrows a stored platform role to a functional role, for domain-access
 * intersection with the org operating model. `null` covers admin/owner
 * (bypass functional gating entirely) and unassigned/legacy planner/operator
 * rows (no functional domain access until the owner assigns one).
 * Ground Ops and Compliance map to tripops (read access to trips).
 */
export function functionalRoleFromPlatformRole(
  platformRole: PlatformTeamRole | null,
): FunctionalRole | null {
  if (
    platformRole === "finance" ||
    platformRole === "sales" ||
    platformRole === "tripops"
  ) {
    return platformRole;
  }
  if (platformRole === "ground_ops" || platformRole === "compliance") {
    return "tripops";
  }
  return null;
}

export function memberDisplayRoleLabel(
  member: Pick<OrgMember, "role" | "permissions">,
): string {
  if (member.role === "owner") return "OWNER";
  const platform = platformRoleFromMember(member);
  if (platform) return platformRoleLabel(platform).toUpperCase();
  switch (member.role) {
    case "admin":
      return "ADMIN";
    case "dispatcher":
      return "DISPATCHER";
    case "finance":
      return "FINANCE";
    case "driver":
      return "DRIVER";
    default:
      return "MEMBER";
  }
}
