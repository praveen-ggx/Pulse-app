/**
 * Centralized route constants.
 *
 * Use these instead of hardcoded string literals everywhere in the app.
 * Benefits: find-all-references, rename-safety, and a single place to update paths.
 */
import * as Linking from "expo-linking";

export type TripDetailRouteTab = "trip" | "finance" | "expenses" | "docs";
export type TripDetailRouteFinanceSubTab = "summary" | "transactions";

export type TripDetailRouteOptions = {
  tab?: TripDetailRouteTab;
  financeSubTab?: TripDetailRouteFinanceSubTab;
  entryContext?: "supplier" | "vehicle" | "client";
  clientIdFromContext?: string;
  clientNameFromContext?: string;
};

function tripDetailRouteQuery(options?: TripDetailRouteOptions): string {
  if (!options) return "";
  const params = new URLSearchParams();
  if (options.tab) params.set("tab", options.tab);
  if (options.financeSubTab) params.set("financeSubTab", options.financeSubTab);
  if (options.entryContext) params.set("entryContext", options.entryContext);
  if (options.clientIdFromContext) {
    params.set("clientIdFromContext", options.clientIdFromContext);
  }
  if (options.clientNameFromContext) {
    params.set("clientNameFromContext", options.clientNameFromContext);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const ROUTES = {
  INDEX: '/',
  /** Marketing landing (web). */
  TERMINAL_WEBSITE: '/terminal-website',
  /** Legacy alias — redirects to {@link ROUTES.ONBOARDING.HUB}. */
  WELCOME: '/welcome',
  SIGN_IN: '/sign-in',
  /** Same as {@link ROUTES.SIGN_IN} — kept for existing call sites (logout, guards). */
  SIGN_IN_DIRECT: '/sign-in',
  /** Phone + OTP entry for existing drivers — verifies number then redirects to {@link ROUTES.SIGN_IN} (email prefilled when known). */
  DRIVER_SIGN_IN: '/driver-sign-in',
  /** Request a Supabase password reset email; allow-list `/auth/reset-password` on the same origin in Supabase Auth. */
  FORGOT_PASSWORD: '/forgot-password',
  /** Deep link / web URL target after user taps the reset link in email. */
  AUTH_RESET_PASSWORD: '/auth/reset-password',
  SIGN_UP: '/sign-up',
  /** Persona-first onboarding hub (Phase 2). Legacy `/sign-up` remains valid. */
  ONBOARDING: {
    HUB: '/onboarding',
    BUSINESS: '/onboarding/business',
    DRIVER: '/onboarding/driver',
    JOIN_TEAM: '/onboarding/join-team',
  },

  TABS: {
    /** Fiscal / Cash ledger tab */
    FINANCE:  '/(tabs)/finance'   as const,
    /** Trips management tab */
    TRIPS:    '/(tabs)/trips'     as const,
    /** Network / connections tab */
    NETWORK:  '/(tabs)/network'   as const,
    /** Profile settings (not in main dock) */
    PROFILE:  '/(tabs)/profile'   as const,
    /** Resources / More (not in main dock) */
    RESOURCES:'/(tabs)/resources' as const,
  },

  DRIVER_ROOT: '/(driver)' as const,

  /** Driver expense mode chooser (active trip vs general). */
  driverExpenseCapture: () => '/(driver)/expense-capture' as const,
  /** Device-local general expense (no trip) + WhatsApp share. */
  driverGeneralExpense: () => '/(driver)/general-expense' as const,
  /** Become Fleet Owner (Phase 1 capability enablement). */
  driverBecomeFleetOwner: () => '/(driver)/become-fleet-owner' as const,
  /** DCO (driver-cum-owner) admin-approval status request/view. */
  driverDcoStatus: () => '/(driver)/dco-status' as const,
  /** My Fleet list (personal owner vehicles). */
  driverMyFleet: () => '/(driver)/my-fleet' as const,
  driverMyFleetAdd: () => '/(driver)/my-fleet/add' as const,
  driverMyFleetVehicle: (vehicleId: string) =>
    `/(driver)/my-fleet/${encodeURIComponent(vehicleId)}` as const,
  /** Market: open marketplace loads for Fleet Owner / DCO bidding. */
  driverAvailableLoads: () => '/(driver)/available-loads' as const,
  driverAvailableLoad: (indentId: string, opts?: { bid?: boolean }) => {
    const path = `/(driver)/available-loads/${encodeURIComponent(indentId)}`;
    return (opts?.bid ? `${path}?bid=1` : path) as `/(driver)/available-loads/${string}`;
  },
  /** Phase A/B: this bidder's own market_bids rows. */
  driverMyBids: () => '/(driver)/my-bids' as const,
  /** Read-only Commerce delivery mission (Primitive A). */
  driverCommerceMission: (tripId: string) =>
    `/(driver)/commerce-mission/${encodeURIComponent(tripId)}` as const,
  /** Phase A/B: awarded Market trips (source='market_bid'). */
  driverMarketAwards: () => '/(driver)/market-awards' as const,
  /** Phase 3B.1: FO capacity Story composer (optional vehicleId). */
  driverCapacityStory: (vehicleId?: string) =>
    vehicleId
      ? (`/(driver)/capacity-story?vehicleId=${encodeURIComponent(vehicleId)}` as const)
      : ('/(driver)/capacity-story' as const),

  /** Full-screen Pulse Chat (root stack — preferred entry). */
  CHAT: '/chat' as const,

  MODALS: {
    TEAM:           '/(modals)/team'           as const,
    /** Owner-only member role & access control. */
    ACCESS_CONTROL: '/(modals)/access-control' as const,
    /** Owner-only per-member domain permission detail. */
    MEMBER_PERMISSIONS: '/(modals)/member-permissions' as const,
    INVITE_MEMBER:  '/(modals)/invite-member'  as const,
    LANGUAGE_SETTINGS: '/(modals)/language-settings' as const,
    /** @deprecated Use {@link ROUTES.CHAT}; kept for deep links — redirects to `/chat`. */
    CHAT:           '/(modals)/chat'           as const,
  },

  // Settings flows (root-level stack)
  /** @deprecated Route replaced by WORKSPACE. branding-settings now redirects there. */
  BRANDING_SETTINGS: '/branding-settings' as const,
  /** Canonical org hub: logo, name, KYC, team, invoice branding. */
  WORKSPACE:         '/workspace'         as const,
  /** Personal account inside the workspace flex-card. */
  WORKSPACE_ACCOUNT: '/workspace?panel=account' as const,
  /** Organization overview (logo, trust, admin sections). */
  WORKSPACE_ORGANIZATION: '/workspace?panel=profile' as const,
  /** Organization verification / business identity hub. */
  WORKSPACE_KYC:     '/workspace?panel=kyc' as const,
  WORKSPACE_KYC_VERIFICATION: '/workspace?panel=kyc&section=verification' as const,
  /** Workspace operational settings (logo, name, operating model, invoice branding). */
  WORKSPACE_SETTINGS: '/workspace?panel=settings' as const,
  /** Pulse Scan usage (org OCR quota and quality). */
  WORKSPACE_OCR_USAGE: '/workspace?panel=ocr-usage' as const,
  /** Pulse POD product — operational POD workflow. */
  POD_RECONCILIATION: '/pod-reconciliation' as const,
  /** Incoming POD logging (Pulse POD / Finance Pro shell). */
  LOG_INCOMING_PODS: '/log-incoming-pods' as const,
  /** Pulse Finance Pro intelligence layer (launches Invoice / POD / Core Finance). */
  FINANCE_PRO: '/finance-pro' as const,
  FINANCE_PRO_RECEIVABLES: '/finance-pro/receivables' as const,
  FINANCE_PRO_TRIPS_POD: '/finance-pro/trips-pod' as const,
  FINANCE_PRO_INVOICES: '/finance-pro/invoices' as const,
  FINANCE_PRO_PAYMENTS: '/finance-pro/payments' as const,
  FINANCE_PRO_ANALYTICS: '/finance-pro/analytics' as const,
  financeProClient: (clientId: string) =>
    `/finance-pro/client/${encodeURIComponent(clientId)}` as const,
  financeProTrip: (tripId: string) =>
    `/finance-pro/trip/${encodeURIComponent(tripId)}` as const,
  financeProInvoice: (invoiceId: string) =>
    `/finance-pro/invoice/${encodeURIComponent(invoiceId)}` as const,
  financeProCash: (transactionId: string) =>
    `/finance-pro/cash/${encodeURIComponent(transactionId)}` as const,
  /** Pulse Invoice product landing. */
  PULSE_INVOICE: '/pulse-invoice' as const,
  /** Invoice-shell POD tab — hands off to Pulse POD. */
  PULSE_INVOICE_POD: '/pulse-invoice/pod' as const,
  /** Invoice execution module (existing live-schema execute flow). */
  INVOICING_EXECUTE: '/invoicing-execute' as const,
  /** Full-page invoice draft / issue form (opened from Pending Billing). */
  INVOICING_EXECUTE_CREATE: '/invoicing-execute/create' as const,
  /** Commerce order → one invoice (no trip selection). */
  pulseInvoiceOrder: (orderId: string) =>
    `/pulse-invoice/order/${encodeURIComponent(orderId)}` as const,
  /** Finance Pro Manual Invoice — typed lines against a selected client. */
  INVOICING_MANUAL: "/pulse-invoice/manual" as const,
  /** Members & access inside the workspace flex-card (not `MODALS.TEAM`). */
  WORKSPACE_TEAM:    '/workspace?panel=team' as const,
  /** Step-through business verification wizard (Sprint 1). */
  BUSINESS_VERIFY:   '/business-verify'   as const,
  /** Own-org network profile hub (Team / My Profile / Sales tabs on desktop). */
  networkOrgHub: (
    tab:
      /** @deprecated Removed — aliases to My Profile. */
      | "details"
      | "team"
      | "profile"
      | "sales"
      | "goals"
      /** @deprecated Alias for Sales with Asset view (`?tab=asset`). */
      | "asset"
      | "network"
      | "connections"
      | "grow"
      | "chat" = "profile",
  ) => {
    const normalized =
      tab === "connections" || tab === "grow"
        ? "network"
        : tab === "details"
          ? "profile"
          : tab;
    return normalized === "profile"
      ? ("/(tabs)/network/hub" as const)
      : (`/(tabs)/network/hub?tab=${normalized}` as const);
  },
  /** @deprecated Intelligence dashboard removed — `/business-pulse` redirects to Network hub. */
  BUSINESS_PULSE:    '/business-pulse'    as const,
  /** Personal identity: name, email, phone, personal avatar. Redirects to WORKSPACE_ACCOUNT. */
  MY_ACCOUNT:        '/account'           as const,

  /** Compliance & Document Intelligence hub — opened from header icons. */
  DOCUMENTS_CENTER: '/documents-center' as const,

  /** Full-screen alert detail (registry → ledger-style detail + wizard CTAs). */
  alertDetail: (
    kind: "salary" | "shared" | "ops",
    id: string,
    mode: "active" | "archive" = "active",
  ) => {
    const q = new URLSearchParams({ kind, alertId: id, mode });
    return `/alert-detail?${q.toString()}` as const;
  },

  vehicleAnalytics: (vehicleId: string) =>
    `/vehicle/${encodeURIComponent(vehicleId)}/analytics` as const,
  clientAnalytics: (clientId: string) =>
    `/client/${encodeURIComponent(clientId)}/analytics` as const,
  /** Customer management hub (Overview, KYC, Warehouses, Contracts, …). */
  clientProfile: (clientId: string, tab?: string) => {
    const base = `/party/customers/${encodeURIComponent(clientId)}` as const;
    if (!tab) return base;
    return `${base}?tab=${encodeURIComponent(tab)}` as const;
  },
  /** Party directory — customers, suppliers, drivers, vehicles. */
  partyDirectory: (kind: "customers" | "suppliers" | "drivers" | "vehicles") =>
    `/party/${kind}` as const,
  supplierProfile: (supplierId: string, tab?: string) => {
    const base = `/supplier/${encodeURIComponent(supplierId)}/profile` as const;
    if (!tab) return base;
    return `${base}?tab=${encodeURIComponent(tab)}` as const;
  },
  driverProfile: (driverId: string, tab?: string) => {
    const base = `/driver/${encodeURIComponent(driverId)}/profile` as const;
    if (!tab) return base;
    return `${base}?tab=${encodeURIComponent(tab)}` as const;
  },
  vehicleProfile: (vehicleId: string, tab?: string) => {
    const base = `/vehicle/${encodeURIComponent(vehicleId)}/profile` as const;
    if (!tab) return base;
    return `${base}?tab=${encodeURIComponent(tab)}` as const;
  },
  /** Read-only party profile (client / supplier / driver) — connections hub avatar, chat, etc. */
  publicProfile: (
    type: "client" | "supplier" | "driver",
    partyId: string,
  ) => `/public-profile/${type}/${encodeURIComponent(partyId)}` as const,
  /** Finance entity detail (trips, cash flow). */
  clientDetail: (clientId: string, tab?: 'trips' | 'cash') => {
    const base = `/client/${encodeURIComponent(clientId)}` as const;
    if (!tab) return base;
    return `${base}?tab=${encodeURIComponent(tab)}` as const;
  },
  /** Finance entity detail (trips, cash flow). */
  supplierDetail: (supplierId: string, tab?: 'trips' | 'cash') => {
    const base = `/supplier/${encodeURIComponent(supplierId)}` as const;
    if (!tab) return base;
    return `${base}?tab=${encodeURIComponent(tab)}` as const;
  },
  /** Fleet driver detail (trips, cash flow / ledger, earnings). */
  driverDetail: (
    driverId: string,
    tab?: "trips" | "ledger" | "statement" | "ranking" | "earnings" | "cash",
  ) => {
    const base = `/driver/${encodeURIComponent(driverId)}` as const;
    if (!tab || tab === "trips") return base;
    const normalized = tab === "cash" ? "ledger" : tab;
    return `${base}?tab=${encodeURIComponent(normalized)}` as const;
  },
  /**
   * Vehicle detail (trips, P&L, operations). Pass tripId when navigating from
   * a trip so the page can fall back to a read-only cross-org view if the
   * vehicle belongs to a vendor rather than the viewer's own org.
   */
  vehicleDetail: (vehicleId: string, tripId?: string) => {
    const base = `/vehicle/${encodeURIComponent(vehicleId)}`;
    return (tripId ? `${base}?tripId=${encodeURIComponent(tripId)}` : base) as `/vehicle/${string}`;
  },
  supplierAnalytics: (supplierId: string) =>
    `/supplier/${encodeURIComponent(supplierId)}/analytics` as const,
  driverAnalytics: (driverId: string) =>
    `/driver/${encodeURIComponent(driverId)}/analytics` as const,

  // Full-screen flows (root-level stack)
  ADD_TRIP:       '/add-trip'       as const,
  /** User-local vehicle or product type label (device-only). */
  addCommodityType: (kind: 'vehicle' | 'product') =>
    `/add-commodity-type?kind=${kind}` as const,
  /** Trip detail (operations hub). */
  tripDetail: (tripId: string, options?: TripDetailRouteOptions) =>
    `/trip/${encodeURIComponent(tripId)}${tripDetailRouteQuery(options)}` as const,
  /** Contact Support — Create Ticket. Optional context params, only set when the
   * originating screen actually has them (trip/indent/vehicle/market-bid). */
  support: (context?: {
    tripId?: string;
    indentId?: string;
    ownerVehicleId?: string;
    marketBidId?: string;
    sourceScreen?: string;
  }) => {
    const params = new URLSearchParams();
    if (context?.tripId) params.set('tripId', context.tripId);
    if (context?.indentId) params.set('indentId', context.indentId);
    if (context?.ownerVehicleId) params.set('ownerVehicleId', context.ownerVehicleId);
    if (context?.marketBidId) params.set('marketBidId', context.marketBidId);
    if (context?.sourceScreen) params.set('sourceScreen', context.sourceScreen);
    const qs = params.toString();
    return qs ? (`/support?${qs}` as const) : ('/support' as const);
  },
  /** My Support Tickets — list of the current user's own tickets. */
  SUPPORT_TICKETS: '/support-tickets' as const,
  /** Support Ticket Detail — conversation + reply. */
  supportTicket: (ticketId: string) =>
    `/support-ticket/${encodeURIComponent(ticketId)}` as const,
  /** Customer Track & Trace — simplified read-only view for the linked client org. */
  trackTrip: (tripId: string) => `/track/${encodeURIComponent(tripId)}` as const,
  /** Fleet-wide operations dashboard (active alerts, dwell/transit outliers, stage distribution). */
  FLEET_OPERATIONS: '/fleet-operations' as const,
  /** Trip detail → Finance Hub → Transactions (ledger rows for the trip). */
  tripDetailFinanceTransactions: (tripId: string) =>
    `/trip/${encodeURIComponent(tripId)}?tab=finance&financeSubTab=transactions` as const,
  /** Full-screen driver & vehicle assignment from trip detail (Change). */
  tripAssignment: (tripId: string, focus?: 'driver' | 'vehicle') => {
    const base = `/trip/${encodeURIComponent(tripId)}/assignment` as const;
    if (!focus) return base;
    return `${base}?focus=${focus}` as const;
  },
  /** Load / indent detail (GET LOAD hub, review, deploy entry). */
  indentDetail: (indentId: string) =>
    `/indent/${encodeURIComponent(indentId)}` as const,
  /** Awarded indent → deploy trip (asset roster or aggregate partner flow). */
  indentAllocation: (indentId: string, focus?: "driver" | "vehicle") => {
    const base = `/indent/${encodeURIComponent(indentId)}/allocation` as const;
    if (!focus) return base;
    return `${base}?focus=${focus}` as const;
  },
  /** Optional trip odometer verification (start/end/both). */
  tripVerification: (tripId: string, side: "start" | "end" | "both" = "start") =>
    `/trip/${encodeURIComponent(tripId)}/verification?side=${side}` as const,
  /** Optional operations entries (fuel/toll). */
  tripFuelEntry: (tripId: string, entryId?: string) => {
    const base = `/trip/${encodeURIComponent(tripId)}/operations/fuel`;
    return entryId ? `${base}?entryId=${encodeURIComponent(entryId)}` : base;
  },
  tripTollEntry: (tripId: string, entryId?: string) => {
    const base = `/trip/${encodeURIComponent(tripId)}/operations/toll`;
    return entryId ? `${base}?entryId=${encodeURIComponent(entryId)}` : base;
  },
  tripOtherExpenseEntry: (tripId: string, entryId?: string) => {
    const base = `/trip/${encodeURIComponent(tripId)}/operations/other`;
    return entryId ? `${base}?entryId=${encodeURIComponent(entryId)}` : base;
  },
  tripExpenses: (tripId: string) =>
    `/trip/${encodeURIComponent(tripId)}/operations/expenses` as const,
  /** Unified fuel / toll / other expense launcher. */
  tripExpenseLauncher: (tripId: string) =>
    `/trip/${encodeURIComponent(tripId)}/operations/launcher` as const,
  /** Modal: same add-client UX as Create Trip (PartyRegistrationPortal on web). */
  ADD_CLIENT:     '/(modals)/add-client' as const,
  CREATE_INDENT:  '/create-indent'  as const,
  LOAD_BOARD:     '/load-board'     as const,
  /** Load Center + share indent to Pulse (story); use when Network is story-only. */
  PULSE_LOADS:   '/pulse-loads'   as const,
  /** Trip Compliance + Finance settlement parallel workflow. */
  COMPLIANCE:    '/compliance'    as const,
  COMPLIANCE_BULK_PAYMENT: '/compliance/bulk-payment' as const,
  COMPLIANCE_REPORT:       '/compliance/report'       as const,
  complianceDetail: (tripId: string) =>
    `/compliance/${encodeURIComponent(tripId)}` as const,
  /** A4 — Business Find Loads: open Marketplace discovery, separate from
   * Load Center's relationship-based Get Load tab. */
  FIND_LOADS:    '/find-loads'    as const,
  /** DBA audit tool — web only. */
  DBA_AUDIT:     '/audit'          as const,
  /** Workspace audit trail — who changed what (KYC, members, branding, trips). */
  AUDIT_LOG:     '/audit-log'      as const,
  /** Scalability & Reliability Platform Health (P0 engineering homepage). */
  PLATFORM_HEALTH: '/platform-health' as const,
  REACH: {
    /** Product home — Credits Balance, Reach Delivered, Active Campaigns,
     * Quick Actions, Recent Campaigns. The discovery entry point (Phase 2.2). */
    HOME: '/reach' as const,
    /** Org's Reach campaigns with Impressions/Views/Bids/Credits Used — not
     * load-only long-term (RFQs, hiring, fleet requirements can all become
     * Reach campaigns later), hence "Reach" not "Boost" in the screen name. */
    HISTORY: '/reach/history' as const,
    /** Placeholder only (Phase 2.2) — no referral/verification backend yet;
     * every card reads "Coming Soon". Educational, not functional. */
    EARN_CREDITS: '/reach/earn-credits' as const,
    /** Opportunities (Boost V2) — business opportunities recommended by
     * drivers, priority-scored; approval hands off to a pre-filled bid in the
     * normal bid flow. */
    INBOX: '/reach/inbox' as const,
    /** Single campaign — identity (from its snapshot_* columns), plan/spend,
     * metrics, status/countdown, and actions (View Original Story / Boost
     * Again / Share). The single source of truth for one campaign. */
    campaignDetail: (campaignId: string) => `/reach/campaign/${campaignId}` as const,
  },
  /** Story-detail share landing (Broadcast Load / Pulse story bidding page). */
  storyDetail: (
    postId: string,
    orgId: string,
    storyType: "LOAD" | "VEHICLE_AVAILABILITY" | "UPDATE",
    queue?: string,
  ) => {
    const q = new URLSearchParams({ postId, orgId, storyType, queue: queue ?? postId });
    return `/story-detail?${q.toString()}` as const;
  },
} as const;

/**
 * Public shareable URL for a story-detail post (Broadcast Load "bidding page" link).
 * Uses EXPO_PUBLIC_WEB_BASE_URL when set (real https link for external shares);
 * falls back to an Expo deep link in dev/native builds without a configured web base.
 */
export function buildPulseStoryPublicUrl(
  postId: string,
  orgId: string,
  storyType: "LOAD" | "VEHICLE_AVAILABILITY" | "UPDATE",
): string {
  const webBase = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "") || "";
  const qs = ROUTES.storyDetail(postId, orgId, storyType).slice("/story-detail?".length);
  if (webBase !== "") {
    return `${webBase}/story-detail?${qs}`;
  }
  return Linking.createURL(`/story-detail?${qs}`);
}

function routeParamOne(
  raw: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = raw[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

/** Parse `/trip/[id]` search params into trip detail screen props. */
export function parseTripDetailRouteParams(
  raw: Record<string, string | string[] | undefined>,
): TripDetailRouteOptions & { tripId: string } {
  const tripId = routeParamOne(raw, "id") ?? "";
  const tab = routeParamOne(raw, "tab");
  const financeSubTab = routeParamOne(raw, "financeSubTab");
  const entryContext = routeParamOne(raw, "entryContext");
  const clientIdFromContext = routeParamOne(raw, "clientIdFromContext");
  const clientNameFromContext = routeParamOne(raw, "clientNameFromContext");

  return {
    tripId,
    tab:
      tab === "finance" || tab === "expenses" || tab === "docs" || tab === "trip"
        ? tab
        : undefined,
    financeSubTab:
      financeSubTab === "summary" || financeSubTab === "transactions"
        ? financeSubTab
        : undefined,
    entryContext:
      entryContext === "supplier" ||
      entryContext === "vehicle" ||
      entryContext === "client"
        ? entryContext
        : undefined,
    clientIdFromContext,
    clientNameFromContext,
  };
}

/** True when the user is on the full-screen indent deploy / allocation wizard. */
export function isIndentAllocationPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /\/indent\/[^/]+\/allocation(?:\/|$|\?)/.test(pathname);
}

export function parseIndentIdFromAllocationPath(
  pathname: string | null | undefined,
): string | null {
  if (!pathname) return null;
  const m = pathname.match(/\/indent\/([^/]+)\/allocation/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** True on `/indent/[id]` detail — not allocation sub-route. */
export function isIndentDetailPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (isIndentAllocationPath(pathname)) return false;
  const path = pathname.split("?")[0] ?? "";
  return /\/indent\/[^/]+$/.test(path);
}

export function parseIndentIdFromDetailPath(
  pathname: string | null | undefined,
): string | null {
  if (!pathname || !isIndentDetailPath(pathname)) return null;
  const path = pathname.split("?")[0] ?? "";
  const m = path.match(/\/indent\/([^/]+)$/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** Allocation wizard or indent detail — hide global deploy prompt while focused. */
export function isIndentDeployFlowPath(pathname: string | null | undefined): boolean {
  return isIndentAllocationPath(pathname) || isIndentDetailPath(pathname);
}

export function parseIndentIdFromDeployFlowPath(
  pathname: string | null | undefined,
): string | null {
  return (
    parseIndentIdFromAllocationPath(pathname) ??
    parseIndentIdFromDetailPath(pathname)
  );
}

/**
 * Surfaces where the awarded-deploy interrupt (full modal or bottom peek) may appear.
 * Everywhere else: quiet — Loads tab badge / Claimed list only (no stalking overlay).
 *
 * Ops home bases: Trips hub, Load Center (`/pulse-loads`), trip detail, legacy indents.
 * Excludes Finance, Chat, Network connections, Settings, profile, wizards.
 */
export function isAwardedDeployOpsSurfacePath(
  pathname: string | null | undefined,
): boolean {
  if (!pathname) return false;
  const path = (pathname.split("?")[0] ?? "").replace(/\/+$/, "") || "/";

  if (path.includes("/chat")) return false;
  if (path.includes("/finance")) return false;
  if (path.includes("/profile") || path.includes("/workspace")) return false;
  if (path.includes("/resources") || path.includes("/report")) return false;
  // Network connections / hub — not Load Center
  if (
    path === "/network" ||
    path.endsWith("/network") ||
    path.includes("/network/")
  ) {
    return false;
  }

  if (path === "/pulse-loads" || path.endsWith("/pulse-loads")) return true;
  if (path === "/indents" || path.endsWith("/indents")) return true;
  if (
    path === "/trips" ||
    path.endsWith("/trips") ||
    path.includes("/(tabs)/trips")
  ) {
    return true;
  }
  // Trip detail intentionally excluded — working a trip should not re-interrupt;
  // Loads badge + Claimed remain the reminder home base.

  return false;
}

/** Navigate to fuel/toll/other entry screen for editing an existing line item (`fuel:uuid`, etc.). */
export function tripExpenseEntryEditRoute(tripId: string, costEventId: string): string | null {
  const [kind, sourceId] = costEventId.split(":");
  if (!sourceId) return null;
  if (kind === "fuel") return ROUTES.tripFuelEntry(tripId, sourceId);
  if (kind === "toll") return ROUTES.tripTollEntry(tripId, sourceId);
  if (kind === "other") return ROUTES.tripOtherExpenseEntry(tripId, sourceId);
  return null;
}

/** The three tabs that live in the bottom dock and are valid startup landing pages. */
export const BOOKMARKABLE_TABS = [
  ROUTES.TABS.TRIPS,
  ROUTES.TABS.FINANCE,
  ROUTES.TABS.NETWORK,
] as const;

export type BookmarkableTab = (typeof BOOKMARKABLE_TABS)[number];

/**
 * Default landing route for dispatcher / admin users (non-driver).
 * Trips is the primary operational view; Finance is secondary.
 */
export const DEFAULT_DISPATCHER_ROUTE: BookmarkableTab = ROUTES.TABS.TRIPS;

/** Default landing route for the driver role. */
export const DEFAULT_DRIVER_ROUTE = ROUTES.DRIVER_ROOT;
