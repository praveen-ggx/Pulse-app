import { getDoubleEntryDisplayLabel } from "@/features/finance/accounting/accountingModel";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import type { TripHardCopyPodState } from "@/features/trips/services/tripDocumentLrPod.service";
import { formatCourierLrRemarks } from "@/features/trips/utils/lrReceiptStatus.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  parseTripSimulationNotes,
  type ParsedBisimEntry,
  type ParsedBisimRevoke,
} from "@/features/trips/utils/simulateTripStage.util";
import type { DriverActivityTimelineRow } from "@/features/trips/components/trip-detail/hooks/useTripDetail";
import type { RegistryNotificationAvatar } from "@/lib/alertRegistry/registryNotificationAvatar.util";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import type {
  TripAuditFilterTab,
  TripAuditLogCategory,
  TripAuditLogEntry,
  TripAuditLogPerson,
} from "@/lib/trips/tripAuditLog.types";

export type TripActivityUserProfile = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  avatar_seed?: string | null;
};

function resolveActivityActorAvatar(
  displayName: string,
  userId: string | null | undefined,
  userProfileById: Record<string, TripActivityUserProfile>,
  entityType: PartyEntityType = "client",
  colorSeed?: string | null,
): RegistryNotificationAvatar {
  const profile = userId ? userProfileById[userId] : undefined;
  const name =
    displayName.trim() ||
    profile?.full_name?.trim() ||
    "Workspace member";
  return {
    name,
    entityType,
    avatarUrl: profile?.avatar_url ?? null,
    avatarSeed: profile?.avatar_seed ?? null,
    initialsColorSeed: colorSeed ?? userId ?? name,
  };
}

function formatAuditTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const day = d.getDate();
    const month = d.toLocaleString("en-IN", { month: "short" }).toUpperCase();
    const year = d.getFullYear();
    const time = d.toLocaleString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${day} ${month} ${year} · ${time}`;
  } catch {
    return "—";
  }
}

function formatAmount(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function profileDisplayName(
  profile: TripActivityUserProfile | undefined,
): string | null {
  if (!profile) return null;
  return (
    profile.full_name?.trim() ||
    profile.phone?.trim() ||
    profile.email?.trim() ||
    null
  );
}

const USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeUserId(value: string): boolean {
  return USER_ID_RE.test(value);
}

export function resolveTripActivityUserLabel(
  userId: string | null | undefined,
  currentUserId: string | null | undefined,
  userDisplayById: Record<string, string>,
  /** Prefer empty over generic labels like "Staff" / "Workspace member". */
  fallback = "",
  userProfileById?: Record<string, TripActivityUserProfile>,
): string {
  const id = String(userId ?? "").trim();
  if (!id) return fallback;
  const fromMap = userDisplayById[id]?.trim() || "";
  const fromProfile = profileDisplayName(userProfileById?.[id]) || "";
  const storedName = looksLikeUserId(id) ? "" : id;
  const name = fromMap || fromProfile || storedName;
  if (currentUserId && id === currentUserId) {
    return name ? `${name} (you)` : "You";
  }
  return name || fallback;
}

function samePartyLabel(left: string, right: string): boolean {
  return (
    left.trim().toLowerCase().replace(/\s+/g, " ") ===
    right.trim().toLowerCase().replace(/\s+/g, " ")
  );
}

export function resolveTripActivityParty(input: {
  partyName?: string | null;
  driverName?: string | null;
  contactType?: string | null;
  tripClientName?: string | null;
  tripSupplierName?: string | null;
}): {
  name: string;
  role: "Client" | "Supplier" | "Driver" | "Party";
  orgLabel: string | null;
} {
  const contactType = String(input.contactType ?? "").trim().toLowerCase();
  const role: "Client" | "Supplier" | "Driver" | "Party" =
    contactType === "driver"
      ? "Driver"
      : contactType === "client"
        ? "Client"
        : contactType === "supplier"
          ? "Supplier"
          : "Party";
  const raw = (input.partyName ?? input.driverName ?? "").trim();
  const tripParty =
    role === "Supplier"
      ? (input.tripSupplierName ?? "").trim()
      : role === "Client"
        ? (input.tripClientName ?? "").trim()
        : role === "Driver"
          ? (input.driverName ?? "").trim()
          : "";
  const name = raw && raw !== "—" ? raw : tripParty;
  const orgLabel =
    tripParty && name && !samePartyLabel(tripParty, name) ? tripParty : null;
  return {
    name: name || "—",
    role,
    orgLabel,
  };
}

/** Best-effort staff user when ledger / audit rows omit created_by. */
export function inferTripStaffUserId(
  trip: TripRow,
  explicitUserId?: string | null,
): string | null {
  const candidates = [
    explicitUserId,
    trip.owner_user_id,
    trip.assigned_by_user_id,
    trip.created_by_user_id,
    trip.created_by,
  ];
  for (const id of candidates) {
    const v = String(id ?? "").trim();
    if (v) return v;
  }
  return null;
}

function categoryLabel(category: TripAuditLogCategory): string {
  switch (category) {
    case "payment":
      return "Payment";
    case "assignment":
      return "Assignment";
    case "status":
      return "Journey";
    case "trip":
      return "Trip";
    case "document":
      return "Document";
    case "compliance":
      return "Compliance";
    default:
      return "Journey";
  }
}

type StatusActivityContext =
  | "started"
  | "pickup"
  | "in_transit"
  | "at_drop"
  | "completed"
  | "created"
  | "accepted"
  | "assigned"
  | "pod_received"
  | "sim_revoked";

/** One row from trip_status_audit. Who changed the status, and the instant they did. */
export type TripStatusAuditActivityRow = {
  id: string;
  status_from?: string | null;
  status_to: string;
  changed_by?: string | null;
  changed_at: string;
};

const GENERIC_SIM_ACTOR = /^(business|ground ops|staff|workspace member)$/i;

const STATUS_RANK: Record<string, number> = {
  draft: 0,
  pending_acceptance: 1,
  assigned: 2,
  in_progress: 3,
  picked_up: 3,
  pickup: 3,
  in_transit: 4,
  dispatched: 4,
  transit: 4,
  at_drop: 5,
  at_destination: 5,
  completed: 6,
  delivered: 6,
  done: 6,
};

function humanizeStatus(status: string): string {
  return status.trim().toLowerCase().replace(/_/g, " ");
}

function stageContextFromStatus(status: string): StatusActivityContext {
  const value = status.trim().toLowerCase();
  if (value === "assigned" || value === "pending_acceptance") return "accepted";
  if (value === "in_progress" || value === "picked_up" || value === "pickup") {
    return "pickup";
  }
  if (value === "in_transit" || value === "dispatched" || value === "transit") {
    return "in_transit";
  }
  if (value === "at_drop" || value === "at_destination") return "at_drop";
  if (value === "completed" || value === "delivered" || value === "done") {
    return "completed";
  }
  return "started";
}

function statusesForContext(context: StatusActivityContext): string[] {
  switch (context) {
    case "accepted":
      return ["assigned", "pending_acceptance"];
    case "pickup":
      return ["in_progress", "picked_up", "pickup"];
    case "in_transit":
      return ["in_transit", "dispatched", "transit"];
    case "at_drop":
      return ["at_drop", "at_destination"];
    case "completed":
      return ["completed", "delivered", "done"];
    default:
      return [];
  }
}

function isBackwardStatusMove(from: string, to: string): boolean {
  const fromRank = STATUS_RANK[from.trim().toLowerCase()];
  const toRank = STATUS_RANK[to.trim().toLowerCase()];
  return fromRank != null && toRank != null && toRank < fromRank;
}

function simulatedStageCopy(status: string): {
  title: string;
  stage: string;
  context: StatusActivityContext;
} {
  const context = stageContextFromStatus(status);
  switch (context) {
    case "accepted":
      return { title: "simulated driver acceptance", stage: "Driver acceptance", context };
    case "pickup":
      return { title: "simulated pickup", stage: "Pickup", context };
    case "in_transit":
      return { title: "simulated in transit", stage: "In transit", context };
    case "at_drop":
      return { title: "simulated drop-off", stage: "Drop-off", context };
    case "completed":
      return { title: "simulated delivery", stage: "Delivery", context };
    default: {
      const stage = humanizeStatus(status);
      return { title: `simulated ${stage}`, stage, context: "started" };
    }
  }
}

/** Note vs status-audit skew that is still the same action, not a backdated stage. */
const ACTION_TIME_SKEW_MS = 2 * 60_000;
/** Pair a BISIM save only with an audit from the same save window. */
const AUDIT_PAIR_WINDOW_MS = 2 * 60_000;

/**
 * Actual edit / save clock for Activity. Prefer the paired status-audit time;
 * then the note's editedAt; the note stage timestamp is shown separately.
 */
function recordedActionAt(
  noteAt: string | null | undefined,
  auditAt: string | null | undefined,
  editedAt?: string | null | undefined,
): string {
  return (
    String(auditAt ?? "").trim() ||
    String(editedAt ?? "").trim() ||
    String(noteAt ?? "").trim()
  );
}

function stageTimeClause(
  noteAt: string | null | undefined,
  actionAt: string,
): string | null {
  const note = String(noteAt ?? "").trim();
  if (!note || note === actionAt) return null;
  const noteMs = Date.parse(note);
  const actionMs = Date.parse(actionAt);
  if (!Number.isFinite(noteMs) || !Number.isFinite(actionMs)) return null;
  if (Math.abs(noteMs - actionMs) <= ACTION_TIME_SKEW_MS) return null;
  return `Stage time ${formatAuditTimestamp(note)}`;
}

function simulationRecordedBy(
  noteName: string | null | undefined,
  userId: string | null | undefined,
  currentUserId: string | null | undefined,
  userDisplayById: Record<string, string>,
  userProfileById: Record<string, TripActivityUserProfile>,
): string {
  const note = String(noteName ?? "").trim();
  const resolved = resolveTripActivityUserLabel(
    userId,
    currentUserId,
    userDisplayById,
    "",
    userProfileById,
  );
  const generic = !note || GENERIC_SIM_ACTOR.test(note);
  if (!generic) {
    if (
      userId &&
      currentUserId &&
      userId === currentUserId &&
      !/\(you\)$/i.test(note)
    ) {
      return `${note} (you)`;
    }
    return note;
  }
  return resolved || note;
}

/**
 * Earliest unused audit row for this status. A later revoke (status moves
 * backward onto the same status) is left in the pool so the revoke can claim it.
 */
function takeAuditForStatus(
  pool: TripStatusAuditActivityRow[],
  statusTo: string,
  statusFrom?: string | null,
  /** Prefer the audit closest to this instant (BISIM editedAt / save clock). */
  nearIso?: string | null,
): TripStatusAuditActivityRow | undefined {
  const to = statusTo.trim().toLowerCase();
  const from = String(statusFrom ?? "").trim().toLowerCase();
  const candidates: number[] = [];
  for (let i = 0; i < pool.length; i += 1) {
    const row = pool[i];
    if (!row) continue;
    if (row.status_to.trim().toLowerCase() !== to) continue;
    const rowFrom = String(row.status_from ?? "").trim().toLowerCase();
    if (from) {
      if (rowFrom !== from) continue;
    } else if (rowFrom && isBackwardStatusMove(rowFrom, to)) {
      continue;
    }
    candidates.push(i);
  }
  if (candidates.length === 0) return undefined;
  const nearMs = Date.parse(String(nearIso ?? "").trim());
  if (Number.isFinite(nearMs)) {
    // Only pair within the save window so an older BISIM cannot steal a later audit
    // (and show yesterday's Stage time under today's edit).
    let index = -1;
    let best = Number.POSITIVE_INFINITY;
    for (const i of candidates) {
      const ms = Date.parse(pool[i]!.changed_at);
      if (!Number.isFinite(ms)) continue;
      const skew = Math.abs(ms - nearMs);
      if (skew > AUDIT_PAIR_WINDOW_MS || skew >= best) continue;
      best = skew;
      index = i;
    }
    if (index < 0) return undefined;
    return pool.splice(index, 1)[0];
  }
  return pool.splice(candidates[0]!, 1)[0];
}

function takeAuditForContext(
  pool: TripStatusAuditActivityRow[],
  context: StatusActivityContext,
): TripStatusAuditActivityRow | undefined {
  // "assigned" is also the assignment itself. Only a pending → assigned
  // change is the driver accepting.
  if (context === "accepted") {
    return takeAuditForStatus(pool, "assigned", "pending_acceptance");
  }
  const statuses = statusesForContext(context);
  for (const status of statuses) {
    const row = takeAuditForStatus(pool, status);
    if (row) return row;
  }
  return undefined;
}

function statusActivityTitle(
  context: StatusActivityContext,
  fallbackLabel: string,
): string {
  switch (context) {
    case "created":
      return "created trip";
    case "accepted":
      return "accepted assignment";
    case "assigned":
      return "assigned this trip";
    case "pickup":
    case "started":
      return "arrived at pickup";
    case "in_transit":
      return "marked in transit";
    case "at_drop":
      return "arrived at drop-off";
    case "completed":
      return "marked delivered";
    case "pod_received":
      return "recorded hard copy POD";
    case "sim_revoked":
      return "revoked a simulated stage";
    default:
      return fallbackLabel.charAt(0).toLowerCase() + fallbackLabel.slice(1);
  }
}

function resolveStatusActor(
  item: Extract<DriverActivityTimelineRow, { kind: "status" }>,
  trip: TripRow,
  userDisplayById: Record<string, string>,
  currentUserId: string | null | undefined,
  driverDisplayName: string | null | undefined,
  userProfileById: Record<string, TripActivityUserProfile>,
): string {
  const context = item.status_context;
  if (item.actorUserId) {
    if (context === "accepted") {
      return driverDisplayName?.trim() || "Driver";
    }
    return resolveTripActivityUserLabel(
      item.actorUserId,
      currentUserId,
      userDisplayById,
      "",
      userProfileById,
    );
  }
  if (context === "created") {
    const creatorId =
      trip.created_by_user_id ?? trip.created_by ?? trip.owner_user_id ?? null;
    return resolveTripActivityUserLabel(
      creatorId,
      currentUserId,
      userDisplayById,
      "",
      userProfileById,
    );
  }
  if (context === "accepted") {
    return driverDisplayName?.trim() || "Driver";
  }
  if (trip.status_updated_role === "driver") {
    return (
      driverDisplayName?.trim() ||
      resolveTripActivityUserLabel(
        trip.status_updated_by,
        currentUserId,
        userDisplayById,
        "Driver",
        userProfileById,
      )
    );
  }
  return resolveTripActivityUserLabel(
    trip.status_updated_by,
    currentUserId,
    userDisplayById,
    "",
    userProfileById,
  );
}

function statusDetailLine(
  item: Extract<DriverActivityTimelineRow, { kind: "status" }>,
  tripRef: string,
  actor: string,
): string {
  const base = item.detail_line?.trim();
  if (item.status_context === "created") {
    return base && !base.toLowerCase().includes("system generated")
      ? base
      : actor ? `${actor} created ${tripRef}` : `Created ${tripRef}`;
  }
  return base || `${item.status_label} · ${tripRef}`;
}

export function matchesTripAuditTab(
  entry: TripAuditLogEntry,
  tab: TripAuditFilterTab,
): boolean {
  if (tab === "all") return true;
  if (tab === "payment") return entry.category === "payment";
  if (tab === "assignment") return entry.category === "assignment";
  if (tab === "updates") {
    return entry.category === "trip" || entry.category === "status";
  }
  if (tab === "documents") return entry.category === "document";
  if (tab === "compliance") return entry.category === "compliance";
  if (tab === "activity") {
    return true;
  }
  return true;
}

export type TripAuditLogScope = "all" | "compliance";

export type TripAuditDocPreview = {
  storagePath: string;
  fileName?: string | null;
  source?:
    | "trip"
    | "vehicle"
    | "vehicle-vault"
    | "compliance"
    | "entity"
    | "driver-kyc"
    | "supplier-kyc";
  organizationId?: string | null;
  entityId?: string | null;
  docType?: string | null;
};

export type TripAuditMilestone = {
  id: string;
  at: string;
  title: string;
  actorUserId?: string | null;
  detail: string;
  detailLines?: string[];
  contextLabel?: string;
  lane?: "document" | "activity";
  category?: TripAuditLogCategory;
  preview?: TripAuditDocPreview | null;
  /** Deleted docs: who first created/uploaded this document. */
  originActorUserId?: string | null;
  originAt?: string | null;
};

function activityFamily(title: string): string {
  const value = title.toLowerCase();
  if (/creat/.test(value)) return "created";
  if (/deliver|complet/.test(value)) return "delivered";
  if (/reassign/.test(value)) return "reassigned";
  if (/reject|declin/.test(value) && /assign/.test(value)) return "declined-assign";
  if (/assign/.test(value) && !/accept/.test(value)) return "assigned";
  if (/pickup|picked/.test(value)) return "pickup";
  if (/transit/.test(value)) return "transit";
  if (/drop/.test(value)) return "drop";
  if (/finance/.test(value) && /verif/.test(value)) return "finance-verified";
  if (/compliance/.test(value) && /verif/.test(value)) return "compliance-verified";
  return value.replace(/\s+/g, " ").trim();
}

function activityDedupeKey(entry: TripAuditLogEntry): string {
  // Each simulate / revoke / status-audit row is its own action, even when two
  // of the same stage share a minute. Collapsing those hid revoked history.
  if (
    entry.id.startsWith("bisim-") ||
    entry.id.startsWith("bisim-revoke-") ||
    entry.id.startsWith("status-audit-") ||
    entry.id.startsWith("assign-")
  ) {
    return entry.id;
  }
  const time = Date.parse(entry.at);
  const bucket = Number.isFinite(time) ? Math.floor(time / 60_000) : entry.at;
  return `${activityFamily(entry.title)}|${bucket}`;
}

function preferAuditEntry(
  current: TripAuditLogEntry,
  incoming: TripAuditLogEntry,
): TripAuditLogEntry {
  const score = (row: TripAuditLogEntry) => {
    const name = row.recordedBy.trim();
    const named =
      name.length > 0 && name !== "Staff" && name !== "Workspace member";
    return (
      (named ? 4 : 0) +
      (row.people?.length ?? 0) * 3 +
      (row.detailLines?.length ?? 0) * 2 +
      (row.detail && !row.detail.includes(".") ? 1 : 0)
    );
  };
  return score(incoming) > score(current) ? incoming : current;
}

export function dedupeTripAuditEntries(
  entries: TripAuditLogEntry[],
): TripAuditLogEntry[] {
  const byKey = new Map<string, TripAuditLogEntry>();
  for (const entry of entries) {
    const key = activityDedupeKey(entry);
    const prev = byKey.get(key);
    byKey.set(key, prev ? preferAuditEntry(prev, entry) : entry);
  }
  return Array.from(byKey.values());
}

export function buildTripAuditLog(params: {
  trip: TripRow;
  tripRef: string;
  assignmentAuditRows: TripAssignmentAuditRow[];
  assignmentDriverNames: Record<string, string>;
  assignmentVehicleLabels: Record<string, string>;
  timelineRows: DriverActivityTimelineRow[];
  transactions: LedgerRow[] | null | undefined;
  currentUserId?: string | null;
  userDisplayById?: Record<string, string>;
  userProfileById?: Record<string, TripActivityUserProfile>;
  driverDisplayName?: string | null;
  /** Current hard-copy POD record. Activity renders this; it is not a second copy. */
  hardCopyPod?: TripHardCopyPodState | null;
  /** Compliance card: skip trip lifecycle / assignment; keep payments + POD + milestones. */
  scope?: TripAuditLogScope;
  milestones?: TripAuditMilestone[];
  /**
   * Append-only status changes (who + when). Activity uses these so a later
   * trip edit cannot restamp an earlier stage with `updated_at`.
   */
  statusAuditRows?: TripStatusAuditActivityRow[];
}): TripAuditLogEntry[] {
  const {
    trip,
    tripRef,
    assignmentAuditRows,
    assignmentDriverNames,
    assignmentVehicleLabels,
    timelineRows,
    transactions,
    currentUserId,
    userDisplayById = {},
    userProfileById = {},
    driverDisplayName,
    hardCopyPod,
    scope = "all",
    milestones = [],
    statusAuditRows = [],
  } = params;
  const complianceOnly = scope === "compliance";

  const entries: TripAuditLogEntry[] = [];

  for (const row of complianceOnly ? [] : assignmentAuditRows) {
    const driver =
      row.driver_name_new?.trim() ||
      (row.driver_id_new
        ? assignmentDriverNames[row.driver_id_new]?.trim()
        : null) ||
      (row.driver_id_new && row.driver_id_new === trip.driver_id
        ? trip.driver_display_name?.trim()
        : null) ||
      null;
    const vehicle =
      row.vehicle_number_new?.trim() ||
      (row.vehicle_id_new
        ? assignmentVehicleLabels[row.vehicle_id_new]?.trim()
        : null) ||
      (row.vehicle_id_new && row.vehicle_id_new === trip.vehicle_id
        ? trip.vehicle_display_number?.trim()
        : null) ||
      null;
    const driverPrev =
      row.driver_id_prev != null
        ? (assignmentDriverNames[row.driver_id_prev] ??
          row.driver_name_prev ??
          null)
        : null;
    const vehiclePrev =
      row.vehicle_id_prev != null
        ? (assignmentVehicleLabels[row.vehicle_id_prev] ??
          row.vehicle_number_prev ??
          null)
        : null;

    const isReassign = row.event_type === "reassignment";
    const isDriverDeclined =
      isReassign && row.driver_id_prev != null && row.driver_id_new == null;

    const detailLines = [
      driverPrev != null && driver != null
        ? `Driver: ${driverPrev} → ${driver}`
        : driver != null
          ? `Driver: ${driver}`
          : driverPrev != null
            ? `Driver: ${driverPrev} (removed)`
            : null,
      vehiclePrev != null && vehicle != null
        ? `Vehicle: ${vehiclePrev} → ${vehicle}`
        : vehicle != null
          ? `Vehicle: ${vehicle}`
          : vehiclePrev != null
            ? `Vehicle: ${vehiclePrev} (removed)`
            : null,
    ].filter(Boolean) as string[];

    const actorUserId = isDriverDeclined ? null : row.changed_by ?? null;
    const actor = isDriverDeclined
      ? driverPrev?.trim() || "Driver"
      : resolveTripActivityUserLabel(
          actorUserId,
          currentUserId,
          userDisplayById,
          "",
          userProfileById,
        );
    const actorAvatar = isDriverDeclined
      ? resolveActivityActorAvatar(
          actor,
          null,
          userProfileById,
          "driver",
          row.driver_id_prev ?? actor,
        )
      : resolveActivityActorAvatar(
          actor,
          actorUserId,
          userProfileById,
          "client",
        );

    const people: TripAuditLogPerson[] = [];
    if (driver) {
      people.push({
        name: driver,
        role: "Driver",
        avatar: resolveActivityActorAvatar(
          driver,
          row.driver_id_new,
          userProfileById,
          "driver",
          row.driver_id_new ?? driver,
        ),
      });
    }
    if (vehicle) {
      people.push({
        name: vehicle,
        role: "Vehicle",
        avatar: resolveActivityActorAvatar(
          vehicle,
          row.vehicle_id_new,
          userProfileById,
          "vehicle",
          row.vehicle_id_new ?? vehicle,
        ),
      });
    }
    if (driverPrev && isReassign && driverPrev !== driver) {
      people.push({
        name: driverPrev,
        role: "Previous driver",
        avatar: resolveActivityActorAvatar(
          driverPrev,
          row.driver_id_prev,
          userProfileById,
          "driver",
          row.driver_id_prev ?? driverPrev,
        ),
      });
    }

    entries.push({
      id: `assign-${row.id}`,
      at: row.changed_at,
      category: "assignment",
      categoryLabel: categoryLabel("assignment"),
      title: isDriverDeclined
        ? "rejected assignment"
        : isReassign
          ? "reassigned"
          : "assigned",
      recordedAtLabel: formatAuditTimestamp(row.changed_at),
      recordedBy: actor,
      actorAvatar,
      headlineTarget: !isDriverDeclined && driver ? driver : undefined,
      contextLabel: isDriverDeclined
        ? "Assignment declined"
        : isReassign
          ? "Reassignment"
          : "Assignment",
      detail:
        detailLines.join(" · ") ||
        actor ? `${actor} updated assignment on ${tripRef}` : `Assignment updated on ${tripRef}`,
      detailLines: detailLines.length > 0 ? detailLines : undefined,
      people: people.length > 0 ? people : undefined,
    });
  }

  const auditPool: TripStatusAuditActivityRow[] = statusAuditRows.map((row) => ({
    ...row,
  }));
  const coveredContexts = new Set<StatusActivityContext>();
  if (!complianceOnly) {
    const { sims, revokes } = parseTripSimulationNotes(trip.notes);
    const pushSimulation = (
      entry: {
        id: string;
        at: string;
        title: string;
        recordedBy: string;
        userId?: string | null;
        detail: string;
      },
    ) => {
      entries.push({
        id: entry.id,
        at: entry.at,
        category: "status",
        categoryLabel: categoryLabel("status"),
        title: entry.title,
        recordedAtLabel: formatAuditTimestamp(entry.at),
        recordedBy: entry.recordedBy,
        actorAvatar: resolveActivityActorAvatar(
          entry.recordedBy.replace(/\s*\(you\)$/i, ""),
          entry.userId,
          userProfileById,
          "client",
        ),
        contextLabel: "Simulation",
        detail: entry.detail,
      });
    };
    sims.forEach((sim: ParsedBisimEntry, index) => {
      const copy = simulatedStageCopy(sim.status);
      // Pair by save clock (editedAt) so a re-simulate does not steal a later
      // audit and show another stage's "Stage time".
      const paired = takeAuditForStatus(
        auditPool,
        sim.status,
        sim.fromStatus,
        // Prefer the save clock on the note so each simulate pairs with its own audit.
        sim.editedAt ?? null,
      );
      // Headline = when the change was made. Detail may add Stage time (picker).
      const at = recordedActionAt(
        sim.timestamp,
        paired?.changed_at,
        sim.editedAt,
      );
      if (!at) return;
      coveredContexts.add(copy.context);
      const recordedBy = simulationRecordedBy(
        sim.userName,
        paired?.changed_by,
        currentUserId,
        userDisplayById,
        userProfileById,
      );
      const place = sim.locationLabel?.trim();
      const detail = [
        place ? `${copy.stage} · ${place}` : copy.stage,
        stageTimeClause(sim.timestamp, at),
      ]
        .filter(Boolean)
        .join(" · ");
      pushSimulation({
        id: `bisim-${index}-${sim.status}-${at}`,
        at,
        title: copy.title,
        recordedBy,
        userId: paired?.changed_by,
        detail,
      });
    });
    revokes.forEach((revoke: ParsedBisimRevoke, index) => {
      const paired = takeAuditForStatus(
        auditPool,
        revoke.toStatus,
        revoke.fromStatus,
        revoke.timestamp,
      );
      const at = recordedActionAt(revoke.timestamp, paired?.changed_at);
      if (!at) return;
      const recordedBy = simulationRecordedBy(
        revoke.userName,
        paired?.changed_by,
        currentUserId,
        userDisplayById,
        userProfileById,
      );
      // Revoke rows: action time only — no simulated "Stage time" on a revoke.
      const detail = `Reverted ${humanizeStatus(revoke.fromStatus)} → ${humanizeStatus(revoke.toStatus)}`;
      pushSimulation({
        id: `bisim-revoke-${index}-${revoke.fromStatus}-${revoke.toStatus}-${at}`,
        at,
        title: "revoked a simulated stage",
        recordedBy,
        userId: paired?.changed_by,
        detail,
      });
    });
  }

  for (const item of timelineRows) {
    if (item.kind !== "status") continue;
    if (item.status_context === "assigned" && assignmentAuditRows.length > 0) {
      continue;
    }
    // No per-event assigner: this row pairs the current assignee with created_at.
    if (item.id.startsWith("status-assigned-fallback")) continue;
    if (item.status_context === "pod_received" && hardCopyPod) continue;
    if (
      complianceOnly &&
      item.status_context !== "pod_received"
    ) {
      continue;
    }
    // Notes are the full simulate/revoke history, including stages later revoked.
    if (item.id.startsWith("status-sim-")) continue;
    if (
      item.status_context !== "created" &&
      item.status_context !== "assigned" &&
      item.status_context !== "pod_received" &&
      coveredContexts.has(item.status_context)
    ) {
      continue;
    }

    let changedAt = item.changed_at;
    let actorItem = item;
    let stampedUserId: string | null = null;
    if (
      !complianceOnly &&
      item.status_context !== "created" &&
      item.status_context !== "assigned" &&
      item.status_context !== "pod_received" &&
      item.status_context !== "sim_revoked"
    ) {
      const paired = takeAuditForContext(auditPool, item.status_context);
      if (paired?.changed_at) changedAt = paired.changed_at;
      if (paired?.changed_by) {
        stampedUserId = paired.changed_by;
        actorItem = { ...item, actorUserId: paired.changed_by };
      }
    }

    const actor = resolveStatusActor(
      actorItem,
      trip,
      userDisplayById,
      currentUserId,
      driverDisplayName ?? trip.driver_display_name,
      userProfileById,
    );
    const label = item.status_label?.trim() || "Trip update";
    const category: TripAuditLogCategory =
      item.status_context === "created" ? "trip" : "status";
    const statusUserId =
      stampedUserId ??
      (item.status_context === "created"
        ? trip.created_by_user_id ?? trip.created_by ?? trip.owner_user_id ?? null
        : item.status_context === "accepted" ||
            trip.status_updated_role === "driver"
          ? null
          : trip.status_updated_by ?? null);
    const statusEntityType: PartyEntityType =
      item.status_context === "accepted" ||
      trip.status_updated_role === "driver"
        ? "driver"
        : "client";

    entries.push({
      id: item.id,
      at: changedAt,
      category,
      categoryLabel: categoryLabel(category),
      title: statusActivityTitle(item.status_context, label),
      recordedAtLabel: formatAuditTimestamp(changedAt),
      recordedBy: actor,
      actorAvatar: resolveActivityActorAvatar(
        actor,
        statusUserId,
        userProfileById,
        statusEntityType,
        statusEntityType === "driver" ? trip.driver_id ?? actor : statusUserId,
      ),
      contextLabel:
        item.status_context === "created"
          ? "Trip created"
          : item.status_context === "accepted"
            ? "Driver accepted"
            : item.status_context === "pickup"
              ? "Pickup"
              : item.status_context === "in_transit"
                ? "In-transit"
                : item.status_context === "at_drop"
                  ? "Drop-off"
                  : item.status_context === "completed"
                    ? "Delivered"
                    : item.status_context === "sim_revoked"
                      ? "Simulation"
                      : "Status update",
      detail: statusDetailLine(item, tripRef, actor),
      people:
        statusEntityType === "driver" && driverDisplayName
          ? [
              {
                name: driverDisplayName,
                role: "Driver",
                avatar: resolveActivityActorAvatar(
                  driverDisplayName,
                  trip.driver_id,
                  userProfileById,
                  "driver",
                  trip.driver_id ?? driverDisplayName,
                ),
              },
            ]
          : undefined,
    });
  }

  if (!complianceOnly) {
    const hasAssignment = entries.some(
      (entry) =>
        entry.category === "assignment" || entry.id.startsWith("status-assigned"),
    );
    for (const row of auditPool) {
      const to = row.status_to.trim().toLowerCase();
      const from = String(row.status_from ?? "").trim().toLowerCase();
      const at = row.changed_at?.trim();
      if (!at || !to || to === "draft") continue;
      const backward = Boolean(from) && isBackwardStatusMove(from, to);
      if (
        (to === "assigned" || to === "pending_acceptance") &&
        !backward &&
        from !== "pending_acceptance" &&
        hasAssignment
      ) {
        continue;
      }
      const context: StatusActivityContext =
        to === "assigned" && from !== "pending_acceptance" && !backward
          ? "assigned"
          : from === "pending_acceptance" && to === "assigned"
            ? "accepted"
            : stageContextFromStatus(to);
      const recordedBy = resolveTripActivityUserLabel(
        row.changed_by,
        currentUserId,
        userDisplayById,
        "",
        userProfileById,
      );
      const detail = from
        ? `${humanizeStatus(from)} → ${humanizeStatus(to)}`
        : humanizeStatus(to);
      entries.push({
        id: `status-audit-${row.id}`,
        at,
        category: "status",
        categoryLabel: categoryLabel("status"),
        title: backward
          ? "reverted the stage"
          : statusActivityTitle(context, humanizeStatus(to)),
        recordedAtLabel: formatAuditTimestamp(at),
        recordedBy,
        actorAvatar: resolveActivityActorAvatar(
          recordedBy.replace(/\s*\(you\)$/i, ""),
          row.changed_by,
          userProfileById,
          context === "accepted" ? "driver" : "client",
        ),
        contextLabel: backward
          ? "Simulation"
          : context === "accepted"
            ? "Driver accepted"
            : context === "pickup"
              ? "Pickup"
              : context === "in_transit"
                ? "In-transit"
                : context === "at_drop"
                  ? "Drop-off"
                  : context === "completed"
                    ? "Delivered"
                    : "Status update",
        detail: backward ? `Reverted ${detail}` : detail,
      });
    }
  }

  for (const tx of transactions ?? []) {
    const inAmt = Number(tx.amount_in ?? 0);
    const outAmt = Number(tx.amount_out ?? 0);
    const amount = inAmt > 0 ? inAmt : outAmt;
    if (amount <= 0) continue;

    const isIn = inAmt > 0;
    const typeLabel =
      getDoubleEntryDisplayLabel(tx) ?? tx.description ?? "Payment";
    const party = resolveTripActivityParty({
      partyName: tx.party_name,
      driverName: tx.driver_name ?? driverDisplayName ?? trip.driver_display_name,
      contactType: tx.contact_type ?? (isIn ? "client" : undefined),
      tripClientName: trip.client_name,
      tripSupplierName: trip.supplier_name,
    });
    // Prefer created_at (full timestamptz) over transaction_date here: the timeline
    // renders a wall-clock time, but transaction_date is a date-only column, so
    // `new Date("YYYY-MM-DD")` parses as UTC midnight and shows e.g. 5:30 AM in IST.
    // (Ledger/statement views intentionally keep transaction_date-first for business date.)
    const at = tx.created_at ?? tx.transaction_date ?? "";
    const signedAmount = `${isIn ? "+" : "−"} ₹${formatAmount(amount)}`;
    const actorUserId = String(tx.created_by ?? "").trim() || null;
    const actor = resolveTripActivityUserLabel(
      actorUserId,
      currentUserId,
      userDisplayById,
      "",
      userProfileById,
    );

    const partyAvatar = resolveActivityActorAvatar(
      party.name,
      null,
      userProfileById,
      party.role === "Supplier"
        ? "supplier"
        : party.role === "Driver"
          ? "driver"
          : "client",
      party.name,
    );
    const partyDetail = [
      party.name !== "—" ? `${party.role}: ${party.name}` : null,
      party.orgLabel ? `Org: ${party.orgLabel}` : null,
      typeLabel && typeLabel !== "Payment" ? typeLabel : null,
    ].filter(Boolean) as string[];

    entries.push({
      id: `payment-${tx.id}`,
      at,
      category: "payment",
      categoryLabel: categoryLabel("payment"),
      title: isIn
        ? "recorded a customer payment"
        : party.role === "Driver"
          ? "recorded a driver payment"
          : "recorded a supplier payment",
      recordedAtLabel: formatAuditTimestamp(at),
      recordedBy: actor,
      headlineTarget: party.name !== "—" ? party.name : undefined,
      actorAvatar: resolveActivityActorAvatar(
        actor.replace(/ \(you\)$/i, ""),
        actorUserId,
        userProfileById,
        "client",
      ),
      contextLabel: isIn ? "Cash in" : "Cash out",
      detail: partyDetail.join(" · ") || typeLabel,
      detailLines: partyDetail.length > 0 ? partyDetail : undefined,
      amountLabel: signedAmount,
      people:
        party.name !== "—"
          ? [
              {
                name: party.name,
                role: party.role,
                orgLabel: party.orgLabel ?? undefined,
                avatar: partyAvatar,
              },
            ]
          : undefined,
    });
  }

  for (const mile of milestones) {
    if (!mile.at) continue;
    const actor = resolveTripActivityUserLabel(
      mile.actorUserId,
      currentUserId,
      userDisplayById,
      "",
      userProfileById,
    );
    const category: TripAuditLogCategory =
      mile.category ??
      (mile.lane === "document" ? "document" : "status");
    const detail = mile.detail?.trim() || "";
    const lines = [...(mile.detailLines ?? [])].map((line) => line.trim()).filter(Boolean);
    if (mile.originAt) {
      const originWho = resolveTripActivityUserLabel(
        mile.originActorUserId,
        currentUserId,
        userDisplayById,
        "",
        userProfileById,
      );
      const originLine = originWho
        ? `Created by ${originWho} · ${formatAuditTimestamp(mile.originAt)}`
        : `Created · ${formatAuditTimestamp(mile.originAt)}`;
      if (!lines.includes(originLine)) lines.push(originLine);
    }
    if (detail && !lines.includes(detail)) {
      lines.unshift(detail);
    }
    entries.push({
      id: mile.id,
      at: mile.at,
      category,
      categoryLabel: categoryLabel(category),
      title: mile.title,
      recordedAtLabel: formatAuditTimestamp(mile.at),
      recordedBy: actor,
      actorAvatar: resolveActivityActorAvatar(
        actor.replace(/\s*\(you\)$/i, ""),
        mile.actorUserId,
        userProfileById,
        "client",
      ),
      contextLabel: mile.contextLabel ?? "Compliance",
      detail: lines[0] ?? detail,
      detailLines: lines.length > 0 ? lines : undefined,
      preview: mile.preview?.storagePath
        ? {
            ...mile.preview,
            organizationId:
              mile.preview.organizationId ?? trip.organization_id ?? null,
          }
        : null,
    });
  }

  const hasCreated = entries.some((e) => e.id === "status-created" || e.title.toLowerCase().includes("created trip"));
  if (!complianceOnly && !hasCreated && trip.created_at) {
    const creatorId =
      trip.created_by_user_id ?? trip.created_by ?? trip.owner_user_id ?? null;
    const creator = resolveTripActivityUserLabel(
      creatorId,
      currentUserId,
      userDisplayById,
      "",
      userProfileById,
    );
    entries.push({
      id: "status-created-fallback",
      at: trip.created_at,
      category: "trip",
      categoryLabel: categoryLabel("trip"),
      title: "created trip",
      recordedAtLabel: formatAuditTimestamp(trip.created_at),
      recordedBy: creator,
      actorAvatar: resolveActivityActorAvatar(
        creator,
        creatorId,
        userProfileById,
        "client",
      ),
      contextLabel: "Trip created",
      detail: creator ? `${creator} created ${tripRef}` : `Created ${tripRef}`,
    });
  }

  const updatedAt = String(trip.updated_at ?? "").trim();
  const createdAt = String(trip.created_at ?? "").trim();
  const updatedMs = Date.parse(updatedAt);
  const nearUpdate = (iso: string | null | undefined, windowMs: number) => {
    const ms = Date.parse(String(iso ?? ""));
    return Number.isFinite(updatedMs) && Number.isFinite(ms) && Math.abs(ms - updatedMs) < windowMs;
  };
  // `updated_at` moves on every write. It is not itself an edit, and the last
  // assigner is not the editor. Only an explicit status editor counts, and
  // only when this timestamp is not already a status change or simulation.
  const simulationTouch =
    trip.status_change_origin === "business_simulated" ||
    trip.status_change_origin === "business_simulation_revoked";
  const explainedByEntry = entries.some((entry) => {
    const simulationEntry =
      entry.id.startsWith("bisim-") || entry.id.startsWith("bisim-revoke-");
    const windowMs = simulationTouch && simulationEntry ? 5 * 60_000 : 60_000;
    return nearUpdate(entry.at, windowMs);
  });
  const explainedByStatus = statusAuditRows.some((row) => nearUpdate(row.changed_at, 60_000));
  const editorId = String(trip.status_updated_by ?? "").trim();
  if (
    !complianceOnly &&
    editorId &&
    updatedAt &&
    createdAt &&
    updatedAt > createdAt &&
    !explainedByEntry &&
    !explainedByStatus
  ) {
    const editor = resolveTripActivityUserLabel(
      editorId,
      currentUserId,
      userDisplayById,
      "",
      userProfileById,
    );
    entries.push({
      id: `trip-edited-${trip.id}-${updatedAt}`,
      at: updatedAt,
      category: "trip",
      categoryLabel: categoryLabel("trip"),
      title: "edited this trip",
      recordedAtLabel: formatAuditTimestamp(updatedAt),
      recordedBy: editor,
      actorAvatar: resolveActivityActorAvatar(
        editor,
        editorId,
        userProfileById,
        "client",
      ),
      contextLabel: "Trip edited",
      detail: `${editor} edited ${tripRef}`,
    });
  }

  if (hardCopyPod && hardCopyPod.status !== "PENDING") {
    const at =
      hardCopyPod.receivedAt ??
      trip.pod_received_at ??
      trip.updated_at ??
      trip.created_at ??
      new Date().toISOString();
    const actorId = hardCopyPod.actorId;
    const actor = resolveTripActivityUserLabel(
      actorId,
      currentUserId,
      userDisplayById,
      "",
      userProfileById,
    );
    const methodLabel =
      hardCopyPod.receiptMethod === "person"
        ? "Received by Person"
        : hardCopyPod.receiptMethod === "courier"
          ? "Received by Courier"
          : null;
    const detail = [
      hardCopyPod.status === "RECEIVED" ? "RECEIVED" : "IN TRANSIT",
      methodLabel,
      hardCopyPod.receivedBy ? `Received by ${hardCopyPod.receivedBy}` : null,
      hardCopyPod.courier ? `Courier ${hardCopyPod.courier}` : null,
      hardCopyPod.receivedDate,
      hardCopyPod.receivedTime,
      formatCourierLrRemarks(hardCopyPod.remarks),
    ]
      .filter(Boolean)
      .join(" · ");
    entries.push({
      id: `hard-copy-pod-${trip.id}`,
      at,
      category: "status",
      categoryLabel: categoryLabel("status"),
      title:
        hardCopyPod.status === "RECEIVED"
          ? "recorded hard copy POD"
          : "logged hard copy POD",
      recordedAtLabel: formatAuditTimestamp(at),
      recordedBy: actor,
      actorAvatar: resolveActivityActorAvatar(
        actor,
        actorId,
        userProfileById,
        "client",
      ),
      contextLabel: "Hard copy POD",
      detail: detail || (actor ? `${actor} updated hard copy POD for ${tripRef}` : `Hard copy POD updated for ${tripRef}`),
    });
  }

  return dedupeTripAuditEntries(entries).sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}
