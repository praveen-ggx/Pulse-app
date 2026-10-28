import { getDoubleEntryDisplayLabel } from "@/features/finance/accounting/accountingModel";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import type { TripHardCopyPodState } from "@/features/trips/services/tripDocumentLrPod.service";
import { formatCourierLrRemarks } from "@/features/trips/utils/lrReceiptStatus.util";
import type { TripRow } from "@/features/trips/services/trips.service";
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
  fallback = "Workspace member",
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
      context === "assigned" ? "Dispatcher" : "Workspace member",
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
      "Workspace member",
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
    context === "assigned" ? "Dispatcher" : "Workspace member",
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
      : `${actor} created ${tripRef}`;
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

export type TripAuditMilestone = {
  id: string;
  at: string;
  title: string;
  actorUserId?: string | null;
  detail: string;
  contextLabel?: string;
  lane?: "document" | "activity";
  category?: TripAuditLogCategory;
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
  const time = Date.parse(entry.at);
  const bucket = Number.isFinite(time) ? Math.floor(time / 60_000) : entry.at;
  return `${activityFamily(entry.title)}|${bucket}`;
}

function preferAuditEntry(
  current: TripAuditLogEntry,
  incoming: TripAuditLogEntry,
): TripAuditLogEntry {
  const score = (row: TripAuditLogEntry) =>
    (row.people?.length ?? 0) * 3 +
    (row.detailLines?.length ?? 0) * 2 +
    (row.recordedBy !== "Staff" && row.recordedBy !== "Workspace member" ? 2 : 0) +
    (row.detail && !row.detail.includes(".") ? 1 : 0);
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
  } = params;
  const complianceOnly = scope === "compliance";

  const entries: TripAuditLogEntry[] = [];

  for (const row of complianceOnly ? [] : assignmentAuditRows) {
    const driver =
      row.driver_name_new?.trim() ||
      (row.driver_id_new
        ? assignmentDriverNames[row.driver_id_new]?.trim()
        : null) ||
      null;
    const vehicle =
      row.vehicle_number_new?.trim() ||
      (row.vehicle_id_new
        ? assignmentVehicleLabels[row.vehicle_id_new]?.trim()
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

    const actorUserId = isDriverDeclined
      ? null
      : row.changed_by ?? trip.assigned_by_user_id ?? null;
    const actor = isDriverDeclined
      ? driverPrev?.trim() || "Driver"
      : resolveTripActivityUserLabel(
          actorUserId,
          currentUserId,
          userDisplayById,
          "Dispatcher",
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
        `${actor} updated assignment on ${tripRef}`,
      detailLines: detailLines.length > 0 ? detailLines : undefined,
      people: people.length > 0 ? people : undefined,
    });
  }

  for (const item of timelineRows) {
    if (item.kind !== "status") continue;
    if (item.status_context === "assigned" && assignmentAuditRows.length > 0) {
      continue;
    }
    if (item.status_context === "pod_received" && hardCopyPod) continue;
    if (
      complianceOnly &&
      item.status_context !== "pod_received"
    ) {
      continue;
    }

    const actor = resolveStatusActor(
      item,
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
      item.status_context === "created"
        ? trip.created_by_user_id ?? trip.created_by ?? trip.owner_user_id ?? null
        : item.status_context === "accepted" ||
            trip.status_updated_role === "driver"
          ? null
          : trip.status_updated_by ?? null;
    const statusEntityType: PartyEntityType =
      item.status_context === "accepted" ||
      trip.status_updated_role === "driver"
        ? "driver"
        : "client";

    entries.push({
      id: item.id,
      at: item.changed_at,
      category,
      categoryLabel: categoryLabel(category),
      title: statusActivityTitle(item.status_context, label),
      recordedAtLabel: formatAuditTimestamp(item.changed_at),
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
      "Workspace member",
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
      "Workspace member",
      userProfileById,
    );
    const category: TripAuditLogCategory =
      mile.category ??
      (mile.lane === "document" ? "document" : "status");
    const detail = mile.detail?.trim() || "";
    entries.push({
      id: mile.id,
      at: mile.at,
      category,
      categoryLabel: categoryLabel(category),
      title: mile.title,
      recordedAtLabel: formatAuditTimestamp(mile.at),
      recordedBy: actor,
      actorAvatar: resolveActivityActorAvatar(
        actor,
        mile.actorUserId,
        userProfileById,
        "client",
      ),
      contextLabel: mile.contextLabel ?? "Compliance",
      detail,
      detailLines: detail ? [detail] : undefined,
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
      "Workspace member",
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
      detail: `${creator} created ${tripRef}`,
    });
  }

  const updatedAt = String(trip.updated_at ?? "").trim();
  const createdAt = String(trip.created_at ?? "").trim();
  if (
    !complianceOnly &&
    updatedAt &&
    createdAt &&
    updatedAt > createdAt &&
    !entries.some((entry) => {
      const delta = Math.abs(Date.parse(entry.at) - Date.parse(updatedAt));
      return Number.isFinite(delta) && delta < 60_000;
    })
  ) {
    const editorId =
      trip.status_updated_by ??
      trip.assigned_by_user_id ??
      trip.owner_user_id ??
      trip.created_by_user_id ??
      null;
    const editor = resolveTripActivityUserLabel(
      editorId,
      currentUserId,
      userDisplayById,
      "Workspace member",
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
      "Workspace member",
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
      detail: detail || `${actor} updated hard copy POD for ${tripRef}`,
    });
  }

  return dedupeTripAuditEntries(entries).sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}
