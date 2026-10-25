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
    "Staff";
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

export function resolveTripActivityUserLabel(
  userId: string | null | undefined,
  currentUserId: string | null | undefined,
  userDisplayById: Record<string, string>,
  fallback = "Staff",
  userProfileById?: Record<string, TripActivityUserProfile>,
): string {
  if (!userId) return fallback;
  if (currentUserId && userId === currentUserId) return "You";
  const fromMap = userDisplayById[userId]?.trim();
  if (fromMap) return fromMap;
  const fromProfile = profileDisplayName(userProfileById?.[userId]);
  if (fromProfile) return fromProfile;
  return fallback;
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
      return "Update";
    case "trip":
      return "Update";
    case "document":
      return "Document";
    default:
      return "Update";
  }
}

type StatusActivityContext =
  | "started"
  | "in_transit"
  | "completed"
  | "created"
  | "accepted"
  | "assigned"
  | "pod_received";

function statusActivityTitle(
  context: StatusActivityContext,
  fallbackLabel: string,
): string {
  switch (context) {
    case "created":
      return "created trip";
    case "accepted":
      return "accepted assignment";
    case "started":
    case "in_transit":
      return "marked in transit";
    case "completed":
      return "marked complete";
    case "pod_received":
      return "recorded hard copy POD";
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
      context === "assigned" ? "Dispatcher" : "Staff",
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
      "Staff",
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
    context === "assigned" ? "Dispatcher" : "Staff",
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
  if (tab === "activity") {
    return (
      entry.category === "status" ||
      entry.category === "trip" ||
      entry.category === "payment"
    );
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
};

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
    if (item.status_context === "assigned") continue;
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
          : item.status_context === "completed"
            ? "Completed"
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
    const party = (tx.party_name ?? tx.driver_name ?? "").trim() || "—";
    // Prefer created_at (full timestamptz) over transaction_date here: the timeline
    // renders a wall-clock time, but transaction_date is a date-only column, so
    // `new Date("YYYY-MM-DD")` parses as UTC midnight and shows e.g. 5:30 AM in IST.
    // (Ledger/statement views intentionally keep transaction_date-first for business date.)
    const at = tx.created_at ?? tx.transaction_date ?? "";
    const signedAmount = `${isIn ? "+" : "−"} ₹${formatAmount(amount)}`;
    const actorUserId = inferTripStaffUserId(trip, tx.created_by);
    const actor = resolveTripActivityUserLabel(
      actorUserId,
      currentUserId,
      userDisplayById,
      "Staff",
      userProfileById,
    );

    const partyAvatar = resolveActivityActorAvatar(
      party,
      null,
      userProfileById,
      tx.contact_type === "supplier"
        ? "supplier"
        : tx.contact_type === "driver"
          ? "driver"
          : "client",
      party,
    );

    entries.push({
      id: `payment-${tx.id}`,
      at,
      category: "payment",
      categoryLabel: categoryLabel("payment"),
      title: isIn
        ? "recorded customer payment for"
        : tx.contact_type === "driver"
          ? "recorded driver payment to"
          : "recorded supplier payment to",
      recordedAtLabel: formatAuditTimestamp(at),
      recordedBy: actor,
      headlineTarget: party !== "—" ? party : undefined,
      actorAvatar: resolveActivityActorAvatar(
        actor,
        actorUserId,
        userProfileById,
        "client",
      ),
      contextLabel: isIn ? "Cash in" : "Cash out",
      detail: typeLabel,
      amountLabel: signedAmount,
      people:
        party !== "—"
          ? [
              {
                name: party,
                role:
                  tx.contact_type === "driver"
                    ? "Driver"
                    : isIn
                      ? "Client"
                      : "Supplier",
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
      "Staff",
      userProfileById,
    );
    const category: TripAuditLogCategory =
      mile.lane === "document" ? "document" : "status";
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
      detail: mile.detail,
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
      "Staff",
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
      "Staff",
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

  return entries.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}
