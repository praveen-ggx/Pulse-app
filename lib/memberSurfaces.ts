/**
 * Per-member RBAC surfaces — the drill-down grant catalog for Pulse.
 *
 * Resolution (non-owner/admin):
 *   org operating-model capabilities ∩ member.permissions.surfaces
 *
 * Each surface maps to Capability token(s). Fine actions that share a Capability
 * (e.g. create-indent vs create-trip) are gated by surface id at the call site
 * via `useMemberAccess().can(id)` / `memberHasSurface`.
 *
 * See docs/RBAC_OPERATING_MODEL.md.
 */
import type { Capability } from "@/lib/capabilities";
import type {
  FunctionalRole,
  MemberDomainFlags,
  PlatformTeamRole,
} from "@/features/organization/utils/teamInviteRoles.util";

export type MemberSurfaceId =
  // Finance
  | "finance.tab"
  | "finance.view"
  | "finance.manage"
  | "finance.subtab.cash"
  | "finance.subtab.customers"
  | "finance.subtab.suppliers"
  | "finance.subtab.garage"
  | "finance.subtab.drivers"
  | "finance.ledger.customers"
  | "finance.ledger.suppliers"
  | "finance.ledger.vehicle"
  | "finance.ledger.driver"
  | "finance.add_transaction"
  | "finance.edit_transaction"
  | "finance.void_adjustments"
  | "finance.invoicing"
  | "finance.pod_reconciliation"
  | "finance.business_pulse"
  | "finance.reports"
  | "finance.shared_ledger"
  | "finance.trip_ledger"
  | "finance.branding"
  | "finance.documents_center"
  | "finance.expenses.view"
  | "finance.expenses.approve"
  // Sales / network
  | "sales.tab"
  | "sales.clients.view"
  | "sales.clients.create"
  | "sales.clients.edit"
  | "sales.clients.detail"
  | "sales.clients.analytics"
  | "sales.marketplace.post"
  | "sales.marketplace.bid"
  | "sales.network.connect"
  | "sales.network.discover"
  | "sales.network.stories"
  | "sales.suppliers.view"
  | "sales.suppliers.create"
  | "sales.suppliers.edit"
  | "sales.suppliers.detail"
  | "sales.suppliers.analytics"
  | "sales.load_board"
  | "sales.from_clients"
  | "sales.chat"
  // TripOps / dispatch
  | "tripops.tab"
  | "tripops.trips.view"
  | "tripops.trips.detail"
  | "tripops.trips.create_asset"
  | "tripops.trips.create_aggregate"
  | "tripops.trips.assign"
  | "tripops.trips.reassign"
  | "tripops.trips.tracking"
  | "tripops.trips.docs"
  | "tripops.trips.expenses"
  | "tripops.trips.finance"
  | "tripops.trips.verification"
  | "tripops.trips.simulate"
  | "tripops.trips.ratings"
  | "tripops.indents.view"
  | "tripops.indents.create"
  | "tripops.indents.edit"
  | "tripops.indents.cancel"
  | "tripops.indents.broadcast"
  | "tripops.indents.bid"
  | "tripops.indents.award"
  | "tripops.indents.allocate"
  | "tripops.pulse_loads"
  // Trip Compliance (parallel workflow over canonical trips — NOT the fleet/KYC
  // "compliance" section above, which is unrelated vehicle/driver/document compliance)
  | "trip_compliance.tab"
  | "trip_compliance.documents.view"
  | "trip_compliance.documents.verify"
  | "trip_compliance.trip.mark_verified"
  | "trip_compliance.finance.view"
  | "trip_compliance.finance.manage"
  | "trip_compliance.pod.manage"
  // Fleet (asset path)
  | "fleet.vehicles.view"
  | "fleet.vehicles.create"
  | "fleet.vehicles.edit"
  | "fleet.vehicles.analytics"
  | "fleet.vehicles.documents"
  | "fleet.drivers.view"
  | "fleet.drivers.create"
  | "fleet.drivers.edit"
  | "fleet.drivers.invite"
  | "fleet.drivers.analytics"
  | "fleet.drivers.assign_vehicle"
  // Team / workspace
  | "team.manage"
  | "team.invite"
  | "team.audit"
  | "workspace.settings"
  | "workspace.kyc"
  | "workspace.products"
  | "workspace.notifications";

export type MemberSurfaceMap = Partial<Record<MemberSurfaceId, boolean>>;

export type MemberSurfaceDef = {
  id: MemberSurfaceId;
  label: string;
  hint: string;
  /** UI grouping under the permission page. */
  domain: FunctionalRole | "fleet" | "team" | "trip_compliance";
  /**
   * Optional sub-section label inside a domain accordion. Purely presentational
   * — surfaces with the same `group` render under one collapsible header so the
   * flat catalog stays scannable. Ungrouped surfaces render above the groups.
   */
  group?: string;
  /** Org must have ANY of these capabilities (operating-model gate). */
  anyOfCaps: readonly Capability[];
  /**
   * Capabilities this surface actually confers when granted. Defaults to
   * `anyOfCaps`. Set explicitly when `anyOfCaps` is a broad union used only as
   * an availability gate — otherwise enabling the surface would leak every cap
   * in that union (e.g. a finance sub-tab handing out `dispatch`).
   */
  grantsCaps?: readonly Capability[];
  /**
   * Parent surface that must also be on (e.g. finance.manage → finance.view).
   * Checked after org ∩ member map.
   */
  requires?: MemberSurfaceId;
};

const DISP: readonly Capability[] = ["dispatch", "dispatch_for_own_fleet"];
const FIN: readonly Capability[] = ["finance_view", "finance_manage"];
const FLEET: readonly Capability[] = ["fleet_management", "dispatch_for_own_fleet"];

export const MEMBER_SURFACE_CATALOG: readonly MemberSurfaceDef[] = [
  // ── Finance ──────────────────────────────────────────────────────────────
  {
    id: "finance.tab",
    label: "Finance tab",
    hint: "Open the Fiscal tab",
    domain: "finance",
    anyOfCaps: FIN,
  },
  {
    id: "finance.view",
    label: "View finance",
    hint: "Ledgers, balances, reports (read)",
    domain: "finance",
    anyOfCaps: FIN,
    requires: "finance.tab",
  },
  {
    id: "finance.manage",
    label: "Manage finance",
    hint: "Create/edit ledger entries and fiscal actions",
    domain: "finance",
    anyOfCaps: ["finance_manage"],
    requires: "finance.view",
  },
  {
    id: "finance.subtab.cash",
    group: "Sub-tabs",
    label: "Cash sub-tab",
    hint: "Finance → Cash",
    domain: "finance",
    anyOfCaps: FIN,
    requires: "finance.view",
  },
  {
    id: "finance.subtab.customers",
    group: "Sub-tabs",
    label: "Customers sub-tab",
    hint: "Finance → Customers",
    domain: "finance",
    anyOfCaps: DISP,
    grantsCaps: [],
    requires: "finance.view",
  },
  {
    id: "finance.subtab.suppliers",
    group: "Sub-tabs",
    label: "Suppliers sub-tab",
    hint: "Finance → Suppliers (aggregate / hybrid)",
    domain: "finance",
    anyOfCaps: ["dispatch"],
    grantsCaps: [],
    requires: "finance.view",
  },
  {
    id: "finance.subtab.garage",
    group: "Sub-tabs",
    label: "Garage sub-tab",
    hint: "Finance → Garage (asset / hybrid)",
    domain: "finance",
    anyOfCaps: FLEET,
    grantsCaps: [],
    requires: "finance.view",
  },
  {
    id: "finance.subtab.drivers",
    group: "Sub-tabs",
    label: "Drivers sub-tab",
    hint: "Finance → Drivers (asset / hybrid)",
    domain: "finance",
    anyOfCaps: FLEET,
    grantsCaps: [],
    requires: "finance.view",
  },
  {
    id: "finance.ledger.customers",
    group: "Ledger access",
    label: "Ledger · customers",
    hint: "Cash-tab party filter: customers",
    domain: "finance",
    anyOfCaps: DISP,
    grantsCaps: [],
    requires: "finance.subtab.cash",
  },
  {
    id: "finance.ledger.suppliers",
    group: "Ledger access",
    label: "Ledger · suppliers",
    hint: "Cash-tab party filter: suppliers",
    domain: "finance",
    anyOfCaps: ["dispatch"],
    grantsCaps: [],
    requires: "finance.subtab.cash",
  },
  {
    id: "finance.ledger.vehicle",
    group: "Ledger access",
    label: "Ledger · vehicles",
    hint: "Cash-tab party filter: vehicles",
    domain: "finance",
    anyOfCaps: FLEET,
    grantsCaps: [],
    requires: "finance.subtab.cash",
  },
  {
    id: "finance.ledger.driver",
    group: "Ledger access",
    label: "Ledger · drivers",
    hint: "Cash-tab party filter: drivers",
    domain: "finance",
    anyOfCaps: FLEET,
    grantsCaps: [],
    requires: "finance.subtab.cash",
  },
  {
    id: "finance.add_transaction",
    group: "Transactions",
    label: "Add transaction",
    hint: "Add ledger entry from party / trip screens",
    domain: "finance",
    anyOfCaps: ["finance_manage"],
    requires: "finance.manage",
  },
  {
    id: "finance.edit_transaction",
    group: "Transactions",
    label: "Edit transaction",
    hint: "Edit existing ledger entries",
    domain: "finance",
    anyOfCaps: ["finance_manage"],
    requires: "finance.manage",
  },
  {
    id: "finance.void_adjustments",
    group: "Transactions",
    label: "Void / adjust entries",
    hint: "Trip finance adjustments, voids, provisions",
    domain: "finance",
    anyOfCaps: ["finance_manage"],
    requires: "finance.manage",
  },
  {
    id: "finance.invoicing",
    group: "Billing & POD",
    label: "Invoicing",
    hint: "Execute invoices & PDF preview",
    domain: "finance",
    anyOfCaps: FIN,
    requires: "finance.view",
  },
  {
    id: "finance.pod_reconciliation",
    group: "Billing & POD",
    label: "POD reconciliation",
    hint: "POD reconcile & log incoming PODs",
    domain: "finance",
    anyOfCaps: [...FIN, ...DISP],
    grantsCaps: FIN,
    requires: "finance.view",
  },
  {
    id: "finance.business_pulse",
    group: "Reports & insights",
    label: "Business Pulse",
    hint: "Business pulse dashboard",
    domain: "finance",
    anyOfCaps: FIN,
    requires: "finance.view",
  },
  {
    id: "finance.reports",
    group: "Reports & insights",
    label: "Finance reports",
    hint: "Report tab / export summaries",
    domain: "finance",
    anyOfCaps: FIN,
    requires: "finance.view",
  },
  {
    id: "finance.shared_ledger",
    group: "Reports & insights",
    label: "Shared ledger",
    hint: "Integrated party shared ledger views",
    domain: "finance",
    anyOfCaps: FIN,
    requires: "finance.view",
  },
  {
    id: "finance.trip_ledger",
    group: "Reports & insights",
    label: "Trip ledger page",
    hint: "Open /trip-ledger and trip cash history",
    domain: "finance",
    anyOfCaps: FIN,
    requires: "finance.view",
  },
  {
    id: "finance.branding",
    group: "Billing & POD",
    label: "Invoice branding",
    hint: "Branding settings for invoice PDFs",
    domain: "finance",
    anyOfCaps: FIN,
    requires: "finance.invoicing",
  },
  {
    id: "finance.documents_center",
    group: "Reports & insights",
    label: "Documents center",
    hint: "Org documents vault / documents-center",
    domain: "finance",
    anyOfCaps: [...FIN, ...DISP],
    grantsCaps: FIN,
    requires: "finance.view",
  },
  {
    id: "finance.expenses.view",
    group: "Trip expenses",
    label: "View trip expenses",
    hint: "Fuel / toll / other expense hub (read)",
    domain: "finance",
    anyOfCaps: [...FIN, ...DISP],
    grantsCaps: FIN,
    requires: "finance.view",
  },
  {
    id: "finance.expenses.approve",
    group: "Trip expenses",
    label: "Approve trip expenses",
    hint: "Approve / settle driver expense claims",
    domain: "finance",
    anyOfCaps: ["finance_manage"],
    requires: "finance.expenses.view",
  },

  // ── Sales ────────────────────────────────────────────────────────────────
  {
    id: "sales.tab",
    label: "Network tab",
    hint: "Open Network / sales home",
    domain: "sales",
    anyOfCaps: ["marketplace_post", "marketplace_bid", ...DISP],
    grantsCaps: [],
  },
  {
    id: "sales.clients.view",
    group: "Clients",
    label: "View clients",
    hint: "Clients list & party customers",
    domain: "sales",
    anyOfCaps: DISP,
    grantsCaps: [],
    requires: "sales.tab",
  },
  {
    id: "sales.clients.create",
    group: "Clients",
    label: "Add client",
    hint: "Create client records",
    domain: "sales",
    anyOfCaps: DISP,
    requires: "sales.clients.view",
  },
  {
    id: "sales.clients.edit",
    group: "Clients",
    label: "Edit client",
    hint: "Edit client profiles",
    domain: "sales",
    anyOfCaps: DISP,
    requires: "sales.clients.view",
  },
  {
    id: "sales.clients.detail",
    group: "Clients",
    label: "Client detail",
    hint: "Open client detail & trips",
    domain: "sales",
    anyOfCaps: DISP,
    grantsCaps: [],
    requires: "sales.clients.view",
  },
  {
    id: "sales.clients.analytics",
    group: "Clients",
    label: "Client analytics",
    hint: "Client analytics / ranking views",
    domain: "sales",
    anyOfCaps: DISP,
    requires: "sales.clients.detail",
  },
  {
    id: "sales.marketplace.post",
    group: "Marketplace & network",
    label: "Post loads / give-load",
    hint: "Marketplace post & create-post (aggregate / hybrid)",
    domain: "sales",
    anyOfCaps: ["marketplace_post", "dispatch"],
    requires: "sales.tab",
  },
  {
    id: "sales.marketplace.bid",
    group: "Marketplace & network",
    label: "Marketplace bid",
    hint: "Bid on marketplace listings (asset / hybrid)",
    domain: "sales",
    anyOfCaps: ["marketplace_bid"],
    requires: "sales.tab",
  },
  {
    id: "sales.network.connect",
    group: "Marketplace & network",
    label: "Network connect",
    hint: "Send connection requests",
    domain: "sales",
    anyOfCaps: ["marketplace_post", "marketplace_bid", ...DISP],
    requires: "sales.tab",
  },
  {
    id: "sales.network.discover",
    group: "Marketplace & network",
    label: "Discover network",
    hint: "Discover orgs / grow network",
    domain: "sales",
    anyOfCaps: ["marketplace_post", "marketplace_bid", ...DISP],
    requires: "sales.tab",
  },
  {
    id: "sales.network.stories",
    group: "Marketplace & network",
    label: "Stories & feed",
    hint: "View / interact with network stories",
    domain: "sales",
    anyOfCaps: ["marketplace_post", "marketplace_bid", ...DISP],
    requires: "sales.tab",
  },
  {
    id: "sales.suppliers.view",
    group: "Suppliers",
    label: "View suppliers",
    hint: "Supplier directory (aggregate / hybrid)",
    domain: "sales",
    anyOfCaps: ["dispatch"],
    grantsCaps: [],
    requires: "sales.tab",
  },
  {
    id: "sales.suppliers.create",
    group: "Suppliers",
    label: "Add supplier",
    hint: "Create supplier records",
    domain: "sales",
    anyOfCaps: ["dispatch"],
    requires: "sales.suppliers.view",
  },
  {
    id: "sales.suppliers.edit",
    group: "Suppliers",
    label: "Edit supplier",
    hint: "Edit supplier profiles",
    domain: "sales",
    anyOfCaps: ["dispatch"],
    requires: "sales.suppliers.view",
  },
  {
    id: "sales.suppliers.detail",
    group: "Suppliers",
    label: "Supplier detail",
    hint: "Open supplier detail & trips",
    domain: "sales",
    anyOfCaps: ["dispatch"],
    grantsCaps: [],
    requires: "sales.suppliers.view",
  },
  {
    id: "sales.suppliers.analytics",
    group: "Suppliers",
    label: "Supplier analytics",
    hint: "Supplier analytics views",
    domain: "sales",
    anyOfCaps: ["dispatch"],
    requires: "sales.suppliers.detail",
  },
  {
    id: "sales.load_board",
    group: "Marketplace & network",
    label: "Load board",
    hint: "Open load board marketplace",
    domain: "sales",
    anyOfCaps: DISP,
    requires: "sales.tab",
  },
  {
    id: "sales.from_clients",
    group: "Marketplace & network",
    label: "From clients",
    hint: "Loads / requests from clients hub",
    domain: "sales",
    anyOfCaps: DISP,
    requires: "sales.tab",
  },
  {
    id: "sales.chat",
    group: "Marketplace & network",
    label: "Business chat",
    hint: "Org / partner chat threads",
    domain: "sales",
    anyOfCaps: [...DISP, "marketplace_post", "marketplace_bid"],
    requires: "sales.tab",
  },

  // ── TripOps ──────────────────────────────────────────────────────────────
  {
    id: "tripops.tab",
    label: "Trips tab",
    hint: "Open Trips home",
    domain: "tripops",
    anyOfCaps: DISP,
    grantsCaps: [],
  },
  {
    id: "tripops.trips.view",
    group: "Trips",
    label: "View trips",
    hint: "Trips list",
    domain: "tripops",
    anyOfCaps: DISP,
    grantsCaps: [],
    requires: "tripops.tab",
  },
  {
    id: "tripops.trips.detail",
    group: "Trips",
    label: "Trip detail",
    hint: "Open trip detail page",
    domain: "tripops",
    // Reachable by dispatch OR finance users, but confers neither: opening a
    // trip is read-only. Without an explicit `grantsCaps` this would fall back
    // to `anyOfCaps` and hand a dispatcher finance_view/finance_manage.
    anyOfCaps: [...DISP, ...FIN],
    grantsCaps: [],
    requires: "tripops.trips.view",
  },
  {
    id: "tripops.trips.create_asset",
    group: "Trips",
    label: "Create trip · own fleet",
    hint: "Asset / hybrid supply mode",
    domain: "tripops",
    anyOfCaps: FLEET,
    requires: "tripops.trips.view",
  },
  {
    id: "tripops.trips.create_aggregate",
    group: "Trips",
    label: "Create trip · partner",
    hint: "Aggregate / hybrid supply mode",
    domain: "tripops",
    anyOfCaps: ["dispatch"],
    requires: "tripops.trips.view",
  },
  {
    id: "tripops.trips.assign",
    group: "Trips",
    label: "Assign driver / vehicle",
    hint: "First assignment on trip cards & detail",
    domain: "tripops",
    anyOfCaps: DISP,
    requires: "tripops.trips.detail",
  },
  {
    id: "tripops.trips.reassign",
    group: "Trips",
    label: "Reassign assets",
    hint: "Change driver / vehicle mid-trip",
    domain: "tripops",
    anyOfCaps: DISP,
    requires: "tripops.trips.assign",
  },
  {
    id: "tripops.trips.tracking",
    group: "Trip execution",
    label: "Trip tracking",
    hint: "Live map, ping, location trail",
    domain: "tripops",
    anyOfCaps: DISP,
    requires: "tripops.trips.detail",
  },
  {
    id: "tripops.trips.docs",
    group: "Trip execution",
    label: "Trip documents",
    hint: "POD / LR / trip docs tab",
    domain: "tripops",
    anyOfCaps: [...DISP, ...FIN],
    // POD / LR viewing is read-only and reachable by finance (POD
    // reconciliation); it must not confer dispatch.
    grantsCaps: [],
    requires: "tripops.trips.detail",
  },
  {
    id: "tripops.trips.expenses",
    group: "Trip execution",
    label: "Trip expenses tab",
    hint: "Expense hub on trip detail",
    domain: "tripops",
    anyOfCaps: [...DISP, ...FIN],
    // Read-only, same rationale as tripops.trips.finance: seeing the expense
    // hub must not confer finance_manage. Approving/posting an expense is
    // gated on finance.expenses.approve at the call site.
    grantsCaps: ["finance_view"],
    requires: "tripops.trips.detail",
  },
  {
    id: "tripops.trips.finance",
    group: "Trip execution",
    label: "Trip finance tab",
    hint: "Trip-level finance / settlement tab",
    domain: "tripops",
    anyOfCaps: [...DISP, ...FIN],
    // Read-only: seeing a trip's settlement figures must not confer
    // finance_manage. Write actions (capture payment, adjustments) are gated on
    // their own finance.* surfaces at the call site.
    grantsCaps: ["finance_view"],
    requires: "tripops.trips.detail",
  },
  {
    id: "tripops.trips.verification",
    group: "Trip execution",
    label: "Trip verification",
    hint: "Pickup / drop verification flows",
    domain: "tripops",
    anyOfCaps: DISP,
    requires: "tripops.trips.detail",
  },
  {
    id: "tripops.trips.simulate",
    group: "Trip execution",
    label: "Simulate trip status",
    hint: "Business-simulated status advances",
    domain: "tripops",
    anyOfCaps: DISP,
    requires: "tripops.trips.detail",
  },
  {
    id: "tripops.trips.ratings",
    group: "Trip execution",
    label: "Trip ratings",
    hint: "View / submit trip ratings",
    domain: "tripops",
    anyOfCaps: DISP,
    requires: "tripops.trips.detail",
  },
  {
    id: "tripops.indents.view",
    group: "Indents",
    label: "View indents / pulse loads",
    hint: "Indent list & detail",
    domain: "sales",
    anyOfCaps: DISP,
    // tripops.tab, not sales.tab: /indent/:id is its own top-level route,
    // independent of the Network tab. Requiring sales.tab here meant granting
    // indent-view access also flipped MemberDomainGate's sales-domain check
    // (domainsFromSurfaces reads surfaces["sales.tab"]) and silently unlocked
    // the entire Network tab for a Trip Ops member who only needed to open
    // one awarded indent.
    requires: "tripops.tab",
  },
  {
    id: "tripops.indents.create",
    group: "Indents",
    label: "Create indent",
    hint: "Give-load create (aggregate / hybrid)",
    domain: "sales",
    anyOfCaps: ["dispatch"],
    requires: "tripops.indents.view",
  },
  {
    id: "tripops.indents.edit",
    group: "Indents",
    label: "Edit indent",
    hint: "Edit draft / open loads",
    domain: "sales",
    anyOfCaps: ["dispatch"],
    requires: "tripops.indents.view",
  },
  {
    id: "tripops.indents.cancel",
    group: "Indents",
    label: "Cancel indent",
    hint: "Cancel / close a load",
    domain: "sales",
    anyOfCaps: ["dispatch"],
    requires: "tripops.indents.view",
  },
  {
    id: "tripops.indents.broadcast",
    group: "Indents",
    label: "Broadcast / share load",
    hint: "Share draft to network / stories",
    domain: "sales",
    anyOfCaps: ["dispatch"],
    requires: "tripops.indents.view",
  },
  {
    id: "tripops.indents.bid",
    group: "Indents",
    label: "Bid on indent",
    hint: "Submit supplier quotes",
    domain: "sales",
    anyOfCaps: DISP,
    requires: "tripops.indents.view",
  },
  {
    id: "tripops.indents.award",
    group: "Indents",
    label: "Award bid",
    hint: "Accept a quote / award partner",
    domain: "sales",
    anyOfCaps: ["dispatch"],
    requires: "tripops.indents.view",
  },
  {
    id: "tripops.indents.allocate",
    group: "Indents",
    label: "Allocate indent",
    hint: "Indent allocation & supplier assign vehicle",
    domain: "sales",
    anyOfCaps: ["dispatch"],
    requires: "tripops.indents.view",
  },
  {
    id: "tripops.pulse_loads",
    group: "Indents",
    label: "Pulse loads hub",
    hint: "Pulse loads / load center home",
    domain: "sales",
    anyOfCaps: DISP,
    requires: "sales.tab",
  },

  // ── Trip Compliance (parallel Compliance + Settlement workflow) ────────────
  {
    id: "trip_compliance.tab",
    label: "Compliance tab",
    hint: "Open the Trip Compliance workspace",
    domain: "trip_compliance",
    // DISP is the org availability gate only. Opening the workspace confers no
    // capability of its own — the actions inside it are gated by their own
    // surfaces. Without this, granting a finance member the Compliance tab
    // handed them `dispatch` + `dispatch_for_own_fleet` (TC-06/TC-06b).
    anyOfCaps: DISP,
    grantsCaps: [],
  },
  {
    id: "trip_compliance.documents.view",
    label: "View compliance documents",
    hint: "Preview trip documents (LR, invoice, e-way bill, insurance, RC)",
    domain: "trip_compliance",
    anyOfCaps: DISP,
    requires: "trip_compliance.tab",
  },
  {
    id: "trip_compliance.documents.verify",
    label: "Verify / reject documents",
    hint: "Mark a trip document Verified or Rejected with a reason",
    domain: "trip_compliance",
    anyOfCaps: DISP,
    requires: "trip_compliance.documents.view",
  },
  {
    id: "trip_compliance.trip.mark_verified",
    label: "Mark Compliance Verified",
    hint: "Mark a trip's compliance fully verified once required documents pass",
    domain: "trip_compliance",
    anyOfCaps: DISP,
    requires: "trip_compliance.documents.verify",
  },
  {
    id: "trip_compliance.finance.view",
    label: "View compliance settlement",
    hint: "See advance/balance payment and POD settlement state on Compliance",
    domain: "trip_compliance",
    // FIN is a union gate (finance_view | finance_manage); a read-only surface
    // must not confer finance_manage. Mirrors finance.* read surfaces.
    anyOfCaps: FIN,
    grantsCaps: ["finance_view"],
    requires: "trip_compliance.tab",
  },
  {
    id: "trip_compliance.finance.manage",
    label: "Manage compliance payments",
    hint: "Initiate/update advance and balance payments from Compliance",
    domain: "trip_compliance",
    anyOfCaps: ["finance_manage"],
    requires: "trip_compliance.finance.view",
  },
  {
    id: "trip_compliance.pod.manage",
    label: "Record hard-copy POD",
    hint: "Mark hard-copy POD received with courier / AWB details",
    domain: "trip_compliance",
    anyOfCaps: DISP,
    requires: "trip_compliance.tab",
  },

  // ── Fleet ────────────────────────────────────────────────────────────────
  {
    id: "fleet.vehicles.view",
    group: "Vehicles",
    label: "View vehicles",
    hint: "Resources / party vehicles",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
    grantsCaps: [],
  },
  {
    id: "fleet.vehicles.create",
    group: "Vehicles",
    label: "Add vehicle",
    hint: "Create vehicle records",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
    requires: "fleet.vehicles.view",
  },
  {
    id: "fleet.vehicles.edit",
    group: "Vehicles",
    label: "Edit vehicle",
    hint: "Edit vehicle profile & docs",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
    requires: "fleet.vehicles.view",
  },
  {
    id: "fleet.vehicles.analytics",
    group: "Vehicles",
    label: "Vehicle analytics",
    hint: "Vehicle PnL / analytics",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
    requires: "fleet.vehicles.view",
  },
  {
    id: "fleet.vehicles.documents",
    group: "Vehicles",
    label: "Vehicle documents",
    hint: "RC / insurance / fitness vault",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
    requires: "fleet.vehicles.view",
  },
  {
    id: "fleet.drivers.view",
    group: "Drivers",
    label: "View drivers",
    hint: "Resources / party drivers",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
    grantsCaps: [],
  },
  {
    id: "fleet.drivers.create",
    group: "Drivers",
    label: "Add driver",
    hint: "Create driver records",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
    requires: "fleet.drivers.view",
  },
  {
    id: "fleet.drivers.edit",
    group: "Drivers",
    label: "Edit driver",
    hint: "Edit driver profile",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
    requires: "fleet.drivers.view",
  },
  {
    id: "fleet.drivers.invite",
    group: "Drivers",
    label: "Invite driver to app",
    hint: "Send fleet driver invite / OTP link",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
    requires: "fleet.drivers.view",
  },
  {
    id: "fleet.drivers.analytics",
    group: "Drivers",
    label: "Driver analytics",
    hint: "Driver ranking / analytics",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
    requires: "fleet.drivers.view",
  },
  {
    id: "fleet.drivers.assign_vehicle",
    group: "Drivers",
    label: "Assign vehicle to driver",
    hint: "Link driver ↔ vehicle on roster",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
    requires: "fleet.drivers.view",
  },

  // ── Team / workspace ─────────────────────────────────────────────────────
  // Not operating-model gated: every business org can invite/manage team.
  // `team_manage` is membership-role based and never emitted by getCapabilitiesFromProfile.
  {
    id: "team.manage",
    group: "Access control",
    label: "Manage team",
    hint: "Access control & member roles",
    domain: "team",
    anyOfCaps: [...DISP, ...FIN, "fleet_management"],
    grantsCaps: [],
  },
  {
    id: "team.invite",
    group: "Access control",
    label: "Invite members",
    hint: "Send team invites",
    domain: "team",
    anyOfCaps: [...DISP, ...FIN, "fleet_management"],
    grantsCaps: [],
    requires: "team.manage",
  },
  {
    id: "team.audit",
    group: "Access control",
    label: "Audit trail",
    hint: "Workspace audit log",
    domain: "team",
    anyOfCaps: [...DISP, ...FIN, "fleet_management"],
    grantsCaps: [],
    requires: "team.manage",
  },
  {
    id: "workspace.settings",
    group: "Workspace settings",
    label: "Workspace settings",
    hint: "Org settings / operating model (non-owner fields)",
    domain: "team",
    anyOfCaps: [...DISP, ...FIN, "fleet_management"],
    grantsCaps: [],
  },
  {
    id: "workspace.kyc",
    group: "Workspace settings",
    label: "Organization / verification",
    hint: "Organization home, business details, verification, and documents",
    domain: "team",
    anyOfCaps: [...DISP, ...FIN, "fleet_management"],
    grantsCaps: [],
  },
  {
    id: "workspace.products",
    group: "Workspace settings",
    label: "Workspace products",
    hint: "Product catalog / modules panel",
    domain: "team",
    anyOfCaps: [...DISP, ...FIN, "fleet_management"],
    grantsCaps: [],
  },
  {
    id: "workspace.notifications",
    group: "Workspace settings",
    label: "Notifications",
    hint: "Org notification center",
    domain: "team",
    anyOfCaps: [...DISP, ...FIN, "fleet_management"],
    grantsCaps: [],
  },
] as const;

const SURFACE_BY_ID: Record<MemberSurfaceId, MemberSurfaceDef> = MEMBER_SURFACE_CATALOG.reduce(
  (acc, def) => {
    acc[def.id] = def;
    return acc;
  },
  {} as Record<MemberSurfaceId, MemberSurfaceDef>,
);

export function memberSurfaceDef(id: MemberSurfaceId): MemberSurfaceDef {
  return SURFACE_BY_ID[id];
}

export function surfacesForDomain(
  domain: MemberSurfaceDef["domain"],
): MemberSurfaceDef[] {
  return MEMBER_SURFACE_CATALOG.filter((s) => s.domain === domain);
}

export type MemberSurfaceGroup = {
  /** `null` = ungrouped surfaces (domain-level basics), rendered first. */
  group: string | null;
  surfaces: MemberSurfaceDef[];
};

/**
 * Split a domain's surfaces into ordered sub-sections by `group`, preserving
 * catalog order. Ungrouped surfaces come back first under `group: null`.
 */
export function surfaceGroupsForDomains(
  domains: readonly MemberSurfaceDef["domain"][],
): MemberSurfaceGroup[] {
  const out: MemberSurfaceGroup[] = [];
  const byLabel = new Map<string, MemberSurfaceGroup>();
  for (const domain of domains) {
    for (const surface of surfacesForDomain(domain)) {
      const key = surface.group ?? null;
      if (key === null) {
        let bucket = byLabel.get(" ungrouped");
        if (!bucket) {
          bucket = { group: null, surfaces: [] };
          byLabel.set(" ungrouped", bucket);
          out.push(bucket);
        }
        bucket.surfaces.push(surface);
        continue;
      }
      let bucket = byLabel.get(key);
      if (!bucket) {
        bucket = { group: key, surfaces: [] };
        byLabel.set(key, bucket);
        out.push(bucket);
      }
      bucket.surfaces.push(surface);
    }
  }
  return out;
}

/**
 * Split an explicit surface-id list into ordered sub-sections by `group`,
 * preserving the given id order. Used by presentational sections (Supply,
 * Compliance, …) that cut across catalog `domain` buckets.
 */
export function surfaceGroupsForIds(
  ids: readonly MemberSurfaceId[],
): MemberSurfaceGroup[] {
  const out: MemberSurfaceGroup[] = [];
  const byLabel = new Map<string, MemberSurfaceGroup>();
  for (const id of ids) {
    const surface = SURFACE_BY_ID[id];
    if (!surface) continue;
    const key = surface.group ?? " ungrouped";
    let bucket = byLabel.get(key);
    if (!bucket) {
      bucket = { group: surface.group ?? null, surfaces: [] };
      byLabel.set(key, bucket);
      out.push(bucket);
    }
    bucket.surfaces.push(surface);
  }
  return out;
}

/**
 * Presentational sections for the member-permissions page.
 *
 * These are VIEWS over the existing catalog — every id below is already a real,
 * enforced surface. A section does not grant anything on its own and is not
 * persisted; only the underlying surface ids are stored. A surface may appear in
 * more than one section (e.g. trip docs under both Operations and Compliance) —
 * toggling it anywhere flips the same single grant.
 */
export type MemberSectionKey =
  | "supply"
  | "compliance"
  | "vendor_support"
  | "it";

export const MEMBER_SECTION_SURFACES: Record<
  MemberSectionKey,
  readonly MemberSurfaceId[]
> = {
  supply: [
    "sales.suppliers.view",
    "sales.suppliers.create",
    "sales.suppliers.edit",
    "sales.suppliers.detail",
    "sales.suppliers.analytics",
    "finance.subtab.suppliers",
    "finance.ledger.suppliers",
    "tripops.indents.bid",
    "tripops.indents.award",
    "tripops.indents.allocate",
  ],
  compliance: [
    "workspace.kyc",
    "team.audit",
    "tripops.trips.docs",
    "tripops.trips.verification",
    "fleet.vehicles.documents",
    "finance.pod_reconciliation",
    "finance.documents_center",
  ],
  vendor_support: [
    "sales.chat",
    "sales.network.connect",
    "sales.network.discover",
    "sales.network.stories",
    "sales.from_clients",
  ],
  it: [
    "workspace.settings",
    "workspace.products",
    "workspace.notifications",
    "team.manage",
    "team.invite",
  ],
};

/** Cash-tab ledger party filter → surface id (`all` uses cash sub-tab). */
export function ledgerCategorySurface(
  category: "all" | "customers" | "suppliers" | "vehicle" | "driver",
): MemberSurfaceId {
  switch (category) {
    case "customers":
      return "finance.ledger.customers";
    case "suppliers":
      return "finance.ledger.suppliers";
    case "vehicle":
      return "finance.ledger.vehicle";
    case "driver":
      return "finance.ledger.driver";
    case "all":
    default:
      return "finance.subtab.cash";
  }
}

/** Org allows this surface (capability / operating-model gate only). */
export function orgAllowsSurface(
  orgCaps: Capability[],
  id: MemberSurfaceId,
): boolean {
  const def = SURFACE_BY_ID[id];
  if (!def) return false;
  return def.anyOfCaps.some((c) => orgCaps.includes(c));
}

/**
 * For each explicitly-granted surface, ensure its full requires-chain exists
 * (fill in missing parents). Do NOT auto-add sibling surfaces that share a parent.
 *
 * Example: Ground Ops grants tripops.trips.docs, which requires tripops.trips.detail,
 * which requires tripops.trips.view, which requires tripops.tab. Hydration ensures
 * all parents exist. But tripops.trips.finance ALSO requires tripops.trips.detail —
 * it is NOT auto-added just because the parent is true. Only explicitly-set surfaces
 * get their requires-chain completed.
 *
 * Invariant: properly-formed data never has a parent explicitly false (false vs
 * undefined are equivalent; both mean "not granted") while its child is true.
 * This is enforced by applySurfaceToggle (cascades OFF to children when parent
 * turns OFF) and normalizeSurfaces (completes parent chain on save). But to be
 * defensive: only fill in missing parents, never overwrite an explicit false.
 */
export function hydrateMemberSurfaces(
  stored: MemberSurfaceMap,
  orgCaps: Capability[],
): MemberSurfaceMap {
  const out: MemberSurfaceMap = { ...stored };

  // For each explicitly-set true surface, walk up its requires chain
  // and ensure all parents are also true.
  for (const def of MEMBER_SURFACE_CATALOG) {
    if (out[def.id] !== true) continue;

    let cursor: MemberSurfaceId | undefined = def.requires;
    while (cursor) {
      // Only fill in missing parents; never overwrite an explicit false.
      if (out[cursor] === undefined && orgAllowsSurface(orgCaps, cursor)) {
        out[cursor] = true;
      }
      const parentDef = SURFACE_BY_ID[cursor];
      cursor = parentDef?.requires;
    }
  }

  return out;
}

/**
 * Safety net for the opposite direction from `hydrateMemberSurfaces`: force
 * every `true` surface's full `requires` chain to also be `true`.
 *
 * A surface can be individually `true` while its parent chain is missing or
 * `false` — e.g. a preset bundle (`defaultSurfacesForRole`) selecting a leaf
 * by `domain` without also including a differently-domained `requires` root
 * (the "sales" preset historically missed `tripops.tab` this way), or a
 * manual/legacy DB edit that wrote a flat map without walking the chain.
 * `memberHasSurface`'s recursive check then silently returns false for that
 * surface and everything gated on it, with no error anywhere.
 *
 * Call this on every surfaces map before it is persisted (preset apply,
 * manual toggle save, department-manager save) so the stored map can never
 * represent an unsatisfiable grant.
 */
export function normalizeSurfaces(
  stored: MemberSurfaceMap,
  orgCaps: Capability[],
): MemberSurfaceMap {
  const out: MemberSurfaceMap = { ...stored };
  for (const def of MEMBER_SURFACE_CATALOG) {
    if (out[def.id] !== true) continue;
    let cursor: MemberSurfaceId | undefined = def.requires;
    while (cursor) {
      if (orgAllowsSurface(orgCaps, cursor)) out[cursor] = true;
      cursor = SURFACE_BY_ID[cursor]?.requires;
    }
  }
  return out;
}

/**
 * Read-only surfaces outside the "finance" domain that the finance preset must
 * also grant. Each is either a chain parent (`*.tab`, `*.view`) required by a
 * finance screen, or a trip-level fiscal tab. Every id here has
 * `grantsCaps: []` in the catalog, so granting them confers no dispatch or
 * fleet capability — the member can look, not act.
 */
const FINANCE_CROSS_DOMAIN_SURFACES: readonly MemberSurfaceId[] = [
  // Party directories behind Finance → Customers / Suppliers.
  "sales.tab",
  "sales.clients.view",
  "sales.clients.detail",
  "sales.suppliers.view",
  "sales.suppliers.detail",
  // Trip path: finance opens a trip to reach its finance / expense tabs.
  "tripops.tab",
  "tripops.trips.view",
  "tripops.trips.detail",
  "tripops.trips.finance",
  "tripops.trips.expenses",
  "tripops.trips.docs",
  // Rosters behind Finance → Garage / Drivers.
  "fleet.vehicles.view",
  "fleet.drivers.view",
  // Compliance settlement: Finance initiates/updates advance & balance
  // payments from the Compliance page, but must not gain document
  // verify/reject or "mark verified" authority — those stay Compliance-only.
  "trip_compliance.tab",
  "trip_compliance.finance.view",
  "trip_compliance.finance.manage",
];

/**
 * Default surface map for a platform role preset.
 * Only surfaces the org allows should be persisted as true by the UI.
 */
export function defaultSurfacesForRole(
  role: PlatformTeamRole,
  orgCaps: Capability[],
): MemberSurfaceMap {
  const allOn = (ids: MemberSurfaceId[]) => {
    const map: MemberSurfaceMap = {};
    for (const id of ids) {
      if (orgAllowsSurface(orgCaps, id)) map[id] = true;
    }
    return map;
  };

  switch (role) {
    case "admin":
      return allOn(MEMBER_SURFACE_CATALOG.map((s) => s.id));
    case "finance":
      // Finance needs more than the finance domain: the Customers/Suppliers
      // sub-tabs read party directories (domain "sales"), Garage/Drivers read
      // the fleet rosters (domain "fleet"), and the trip finance/expense tabs
      // hang off the trip detail chain (domain "tripops"). A plain
      // domain === "finance" filter left every one of those unsatisfiable —
      // only the Cash sub-tab survived. All cross-domain additions below are
      // read-only and carry `grantsCaps: []`, so they widen reach without
      // handing finance `dispatch` / `fleet_management`.
      return allOn(
        MEMBER_SURFACE_CATALOG.filter(
          (s) =>
            s.domain === "finance" ||
            FINANCE_CROSS_DOMAIN_SURFACES.includes(s.id),
        ).map((s) => s.id),
      );
    case "sales":
      // tripops.indents.* and tripops.pulse_loads are catalogued under
      // domain:"sales" (give-load lives in the Network tab) but their
      // requires-chain root is tripops.tab (domain:"tripops") — a plain
      // domain==="sales" filter excludes tripops.tab, so a sales-preset
      // member gets indents.create/view=true with no way to satisfy the
      // chain, and every gated action silently no-ops. Mirrors the same
      // fix already applied to the "tripops" and "planner" cases below.
      return allOn(
        MEMBER_SURFACE_CATALOG.filter(
          (s) =>
            s.domain === "sales" ||
            s.id.startsWith("tripops.indents.") ||
            s.id === "tripops.tab" ||
            s.id === "tripops.pulse_loads",
        ).map((s) => s.id),
      );
    case "tripops":
      return allOn(
        MEMBER_SURFACE_CATALOG.filter(
          (s) =>
            s.domain === "tripops" ||
            s.domain === "fleet" ||
            s.id.startsWith("tripops.indents.") ||
            s.id === "tripops.pulse_loads",
        ).map((s) => s.id),
      );
    case "planner":
      return allOn(
        MEMBER_SURFACE_CATALOG.filter(
          (s) =>
            s.id.startsWith("sales.") ||
            s.id.startsWith("tripops.indents.") ||
            s.id === "tripops.tab" ||
            s.id === "tripops.pulse_loads",
        ).map((s) => s.id),
      );
    case "operator":
      return allOn([
        "tripops.tab",
        "tripops.trips.view",
        "tripops.trips.detail",
        "tripops.trips.assign",
        "tripops.trips.reassign",
        "tripops.trips.tracking",
        "tripops.trips.docs",
        "tripops.trips.expenses",
        "tripops.trips.verification",
        "fleet.drivers.view",
        "fleet.vehicles.view",
        // tripops.indents.view/allocate now require tripops.tab (already
        // granted above), not sales.tab — confirmed live: operator is
        // organization_members.role for legacy members, and this allowlist
        // predates the tripops.indents.* surfaces that indent detail/
        // allocation screens gate on. Without these, an operator assigned an
        // awarded indent cannot open it.
        "tripops.indents.view",
        "tripops.indents.allocate",
      ]);
    case "ground_ops":
      return allOn([
        "tripops.tab",
        "tripops.trips.view",
        "tripops.trips.detail",
        "tripops.trips.docs",
        // Note: Ground Ops intentionally excludes assign/reassign/tracking/expenses/finance
        // to prevent field staff from altering trip logistics or viewing financials.
      ]);
    case "restricted":
      return {};
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

/** Derive coarse domain flags from an enabled surface map. */
export function domainsFromSurfaces(surfaces: MemberSurfaceMap): MemberDomainFlags {
  return {
    finance: !!surfaces["finance.tab"],
    sales: !!surfaces["sales.tab"],
    tripops: !!surfaces["tripops.tab"],
  };
}

/**
 * Effective surface grant: org allows ∩ member map (default false if unset) ∩ parent chain.
 */
export function memberHasSurface(
  orgCaps: Capability[],
  surfaces: MemberSurfaceMap | null | undefined,
  id: MemberSurfaceId,
  bypass = false,
): boolean {
  if (bypass) return orgAllowsSurface(orgCaps, id);
  if (!orgAllowsSurface(orgCaps, id)) return false;
  if (!surfaces || surfaces[id] !== true) return false;
  const def = SURFACE_BY_ID[id];
  if (def.requires) {
    return memberHasSurface(orgCaps, surfaces, def.requires, false);
  }
  return true;
}

/**
 * Capabilities implied by the member's enabled surfaces, intersected with org caps.
 * Used so existing useCapabilities() helpers & nav grants soft-filter for members.
 */
export function capabilitiesFromMemberSurfaces(
  orgCaps: Capability[],
  surfaces: MemberSurfaceMap | null | undefined,
  bypass = false,
): Capability[] {
  if (bypass) return orgCaps;
  if (!surfaces) return [];
  const set = new Set<Capability>();
  for (const def of MEMBER_SURFACE_CATALOG) {
    if (!memberHasSurface(orgCaps, surfaces, def.id, false)) continue;
    for (const c of def.grantsCaps ?? def.anyOfCaps) {
      if (orgCaps.includes(c)) set.add(c);
    }
  }
  // Preserve finance_view if finance_manage granted via a manage surface.
  if (set.has("finance_manage")) set.add("finance_view");
  return orgCaps.filter((c) => set.has(c));
}

/** Toggle a surface and cascade children off when parent turns off. */
export function applySurfaceToggle(
  current: MemberSurfaceMap,
  id: MemberSurfaceId,
  next: boolean,
  orgCaps: Capability[],
): MemberSurfaceMap {
  const out: MemberSurfaceMap = { ...current, [id]: next };
  if (!next) {
    for (const def of MEMBER_SURFACE_CATALOG) {
      if (def.requires === id || dependsOn(def.id, id)) {
        out[def.id] = false;
      }
    }
  } else {
    // Ensure parent chain on
    let cursor: MemberSurfaceId | undefined = SURFACE_BY_ID[id]?.requires;
    while (cursor) {
      if (orgAllowsSurface(orgCaps, cursor)) out[cursor] = true;
      cursor = SURFACE_BY_ID[cursor]?.requires;
    }
  }
  return out;
}

/**
 * Section master switch — bulk-apply every org-allowed surface in a
 * presentational section (Supply, Compliance, …).
 *
 * Routes each surface through `applySurfaceToggle`, so turning a section ON also
 * turns on each surface's parent chain (a supplier ledger row needs finance.view
 * above it), and turning it OFF cascades that surface's own children off.
 * Off is applied in reverse so a parent's cascade cannot re-disable a row that
 * was already handled.
 */
export function applySectionToggle(
  current: MemberSurfaceMap,
  section: MemberSectionKey,
  next: boolean,
  orgCaps: Capability[],
): MemberSurfaceMap {
  const ids = MEMBER_SECTION_SURFACES[section].filter((id) =>
    orgAllowsSurface(orgCaps, id),
  );
  let out: MemberSurfaceMap = { ...current };
  for (const id of next ? ids : [...ids].reverse()) {
    out = applySurfaceToggle(out, id, next, orgCaps);
  }
  return out;
}

function dependsOn(child: MemberSurfaceId, parent: MemberSurfaceId): boolean {
  let cursor: MemberSurfaceId | undefined = SURFACE_BY_ID[child]?.requires;
  while (cursor) {
    if (cursor === parent) return true;
    cursor = SURFACE_BY_ID[cursor]?.requires;
  }
  return false;
}

export type SurfaceDomainKey = FunctionalRole | "team";

/** Sync domain master switches → surface bulk on/off for that domain. */
export function applyDomainToggle(
  current: MemberSurfaceMap,
  domain: SurfaceDomainKey,
  next: boolean,
  orgCaps: Capability[],
): MemberSurfaceMap {
  const out: MemberSurfaceMap = { ...current };
  const domains: MemberSurfaceDef["domain"][] =
    domain === "tripops"
      ? ["tripops", "fleet"]
      : domain === "team"
        ? ["team"]
        : [domain];
  const ids = MEMBER_SURFACE_CATALOG.filter((s) =>
    domains.includes(s.domain),
  ).map((s) => s.id);
  if (!next) {
    for (const id of ids) out[id] = false;
    return out;
  }
  if (domain === "team") {
    for (const id of ids) {
      if (orgAllowsSurface(orgCaps, id)) out[id] = true;
    }
    return out;
  }
  // A domain that already has any surface explicitly set has been individually
  // configured — re-enabling the tab must only flip the tab gate itself, never
  // bulk-restore role defaults over an admin's individual on/off choices
  // (that would silently undo a deliberate revoke — see TC-20).
  const alreadyConfigured = ids.some((id) => current[id] !== undefined);
  if (alreadyConfigured) {
    for (const id of ids) {
      if (id.endsWith(".tab") && orgAllowsSurface(orgCaps, id)) out[id] = true;
    }
    return out;
  }
  const defaults = defaultSurfacesForRole(domain, orgCaps);
  for (const id of ids) {
    if (defaults[id]) {
      out[id] = true;
      continue;
    }
    if (
      orgAllowsSurface(orgCaps, id) &&
      (id.endsWith(".tab") ||
        id.endsWith(".view") ||
        id === "finance.view" ||
        id === "finance.subtab.cash")
    ) {
      out[id] = true;
    }
  }
  return out;
}
