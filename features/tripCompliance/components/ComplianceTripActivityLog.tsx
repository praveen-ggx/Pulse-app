/**
 * Activity drawer for one compliance card — uploads, verify, POD, payments.
 */
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { toLedgerRow, type LedgerRow } from "@/features/finance/services/finance.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  backfillMilestoneActors,
  complianceCardMilestones,
  milestoneFromWorkflowEvent,
  milestonesFromDocumentAuditRows,
} from "@/features/tripCompliance/utils/complianceCardActivity.util";
import { TripAuditLogPanel } from "@/features/trips/components/trip-detail/TripAuditLogPanel";
import {
  fetchTripHardCopyPodState,
  type TripHardCopyPodState,
} from "@/features/trips/services/tripDocumentLrPod.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import { getOrganizationMembersShared } from "@/features/organization/services/members.service";
import { resolveActivityUserProfiles } from "@/lib/trips/hydrateTripActivityActors.util";
import { supabase } from "@/lib/supabase";
import Feather from "@expo/vector-icons/Feather";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet } from "react-native";

type ActivityMiles = ReturnType<typeof milestoneFromWorkflowEvent>[];
type ActivityAuditMiles = ReturnType<typeof milestonesFromDocumentAuditRows>;

type ActivityBundle = {
  ledger: LedgerRow[];
  hardCopyPod: TripHardCopyPodState | null;
  workflowMiles: ActivityMiles;
  documentAuditMiles: ActivityAuditMiles;
  at: number;
};

const ACTIVITY_CACHE = new Map<string, ActivityBundle>();
const ACTIVITY_INFLIGHT = new Map<string, Promise<ActivityBundle | null>>();
const ACTIVITY_FRESH_MS = 20_000;

function activityEntityIds(tripId: string, card: ComplianceTripSummary | null, activeTrip: TripRow) {
  const liveDocIds = [
    ...(card?.documents.map((doc) => doc.id) ?? []),
    ...(card?.vehicleDocuments.map((doc) => doc.id) ?? []),
    ...(card?.driverDocuments.map((doc) => doc.id) ?? []),
  ].filter(Boolean);
  return [
    tripId,
    activeTrip.vehicle_id,
    activeTrip.driver_id,
    card?.trip.vehicle_id,
    card?.trip.driver_id,
    ...liveDocIds,
  ].filter((id): id is string => Boolean(id));
}

async function fetchComplianceActivityBundle(
  tripId: string,
  orgId: string | null | undefined,
  entityIds: string[],
): Promise<ActivityBundle | null> {
  if (orgId) void getOrganizationMembersShared(orgId);
  const [pod, tx, events, audits] = await Promise.all([
    fetchTripHardCopyPodState(tripId),
    supabase()
      .from("transactions")
      .select(
        // transactions has no trip_number column (42703 → 400, ledger tab empty).
        "id, organization_id, trip_id, party_name, description, amount_in, amount_out, transaction_date, created_at, contact_id, contact_type, vehicle_number, driver_name, ledger_entity_type, ledger_flow_type, ledger_category, payment_reference, created_by",
      )
      .eq("trip_id", tripId)
      .order("transaction_date", { ascending: false })
      .limit(80),
    supabase()
      .from("trip_workflow_events")
      .select("id, event_type, payload, created_at, actor_id")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .limit(80),
    orgId
      ? supabase()
          .from("document_audit_log")
          .select("id, document_id, action, actor_id, created_at, entity_id, entity_type, notes, metadata")
          .eq("organization_id", orgId)
          .in("entity_id", entityIds)
          .order("created_at", { ascending: false })
          .limit(80)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const bundle: ActivityBundle = {
    hardCopyPod: pod.state ?? null,
    ledger: tx.error
      ? []
      : ((tx.data ?? []) as Array<Parameters<typeof toLedgerRow>[0]>).map((row) =>
          toLedgerRow({
            ...row,
            amount_in: Number(row.amount_in) || 0,
            amount_out: Number(row.amount_out) || 0,
          }),
        ),
    workflowMiles: events.error
      ? []
      : ((events.data ?? []) as Parameters<typeof milestoneFromWorkflowEvent>[0][])
          .map(milestoneFromWorkflowEvent)
          .filter((item): item is NonNullable<typeof item> => item != null),
    documentAuditMiles: audits.error
      ? []
      : milestonesFromDocumentAuditRows(
          (audits.data ?? []) as Parameters<typeof milestonesFromDocumentAuditRows>[0],
        ),
    at: Date.now(),
  };
  const actorIds = [
    ...bundle.ledger.map((row) => row.created_by),
    ...bundle.workflowMiles.map((row) => row.actorUserId),
    ...bundle.documentAuditMiles.map((row) => row.actorUserId),
  ];
  void resolveActivityUserProfiles({ userIds: actorIds, organizationId: orgId });
  return bundle;
}

function loadComplianceActivity(
  tripId: string,
  orgId: string | null | undefined,
  entityIds: string[],
): Promise<ActivityBundle | null> {
  const pending = ACTIVITY_INFLIGHT.get(tripId);
  if (pending) return pending;
  const task = fetchComplianceActivityBundle(tripId, orgId, entityIds)
    .then((bundle) => {
      if (bundle) ACTIVITY_CACHE.set(tripId, bundle);
      return bundle;
    })
    .catch(() => ACTIVITY_CACHE.get(tripId) ?? null)
    .finally(() => {
      ACTIVITY_INFLIGHT.delete(tripId);
    });
  ACTIVITY_INFLIGHT.set(tripId, task);
  return task;
}

/** Drop a warm log so the next open rebuilds it after a compliance action. */
export function invalidateComplianceTripActivity(tripId: string): void {
  ACTIVITY_CACHE.delete(tripId);
}

/** Warm the activity drawer before it opens. Safe to call for every visible trip. */
export function prefetchComplianceTripActivity(
  summary: ComplianceTripSummary,
  organizationId?: string | null,
): void {
  const tripId = summary.trip.id;
  const cached = ACTIVITY_CACHE.get(tripId);
  if (cached && Date.now() - cached.at < ACTIVITY_FRESH_MS) return;
  const orgId = organizationId ?? summary.trip.organization_id;
  void loadComplianceActivity(tripId, orgId, activityEntityIds(tripId, summary, summary.trip));
}

export function ComplianceTripActivityLog({
  visible,
  trip,
  summary,
  organizationId,
  onClose,
}: {
  visible: boolean;
  trip?: TripRow | null;
  summary?: ComplianceTripSummary | null;
  organizationId?: string | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const card = summary ?? null;
  const activeTrip = card?.trip ?? trip ?? null;
  const tripId = activeTrip?.id ?? null;
  const cachedBundle = tripId ? ACTIVITY_CACHE.get(tripId) ?? null : null;
  const [paintedTripId, setPaintedTripId] = useState(tripId);
  const [loading, setLoading] = useState(false);
  const [ledger, setLedger] = useState<LedgerRow[]>(() => cachedBundle?.ledger ?? []);
  const [hardCopyPod, setHardCopyPod] = useState<TripHardCopyPodState | null>(
    () => cachedBundle?.hardCopyPod ?? null,
  );
  const [workflowMiles, setWorkflowMiles] = useState<ActivityMiles>(
    () => cachedBundle?.workflowMiles ?? [],
  );
  const [documentAuditMiles, setDocumentAuditMiles] = useState<ActivityAuditMiles>(
    () => cachedBundle?.documentAuditMiles ?? [],
  );
  if (tripId !== paintedTripId) {
    setPaintedTripId(tripId);
    const next = tripId ? ACTIVITY_CACHE.get(tripId) ?? null : null;
    setLedger(next?.ledger ?? []);
    setHardCopyPod(next?.hardCopyPod ?? null);
    setWorkflowMiles(next?.workflowMiles ?? []);
    setDocumentAuditMiles(next?.documentAuditMiles ?? []);
    setLoading(!next);
  }

  useEffect(() => {
    if (!visible || !activeTrip) return;
    let cancelled = false;
    const orgId = organizationId ?? activeTrip.organization_id ?? card?.trip.organization_id;
    const tripId = activeTrip.id;
    const entityIds = activityEntityIds(tripId, card, activeTrip);
    const cached = ACTIVITY_CACHE.get(tripId);
    if (cached) {
      setLedger(cached.ledger);
      setHardCopyPod(cached.hardCopyPod);
      setWorkflowMiles(cached.workflowMiles);
      setDocumentAuditMiles(cached.documentAuditMiles);
      setLoading(false);
      if (Date.now() - cached.at < ACTIVITY_FRESH_MS) return;
    } else {
      setLoading(true);
    }
    void loadComplianceActivity(tripId, orgId, entityIds).then((bundle) => {
      if (cancelled || !bundle) {
        if (!cancelled) setLoading(false);
        return;
      }
      setHardCopyPod(bundle.hardCopyPod);
      setLedger(bundle.ledger);
      setWorkflowMiles(bundle.workflowMiles);
      setDocumentAuditMiles(bundle.documentAuditMiles);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    activeTrip?.driver_id,
    activeTrip?.id,
    activeTrip?.organization_id,
    activeTrip?.vehicle_id,
    card?.driverDocuments,
    card?.documents,
    card?.trip.driver_id,
    card?.trip.organization_id,
    card?.trip.vehicle_id,
    card?.vehicleDocuments,
    organizationId,
    visible,
  ]);

  const milestones = useMemo(() => {
    const merged = new Map<string, NonNullable<(typeof documentAuditMiles)[number]>>();
    const add = (item: (typeof documentAuditMiles)[number] | null | undefined) => {
      if (!item?.at) return;
      const key = `${item.title}|${item.at.slice(0, 16)}`;
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, item);
        return;
      }
      if (!prev.actorUserId && item.actorUserId) {
        merged.set(key, { ...prev, actorUserId: item.actorUserId });
      }
    };
    const auditedCreates = new Set(
      documentAuditMiles
        .filter((item) => item?.title.startsWith("created "))
        .map((item) => `${item!.title}|${item!.detail}`),
    );
    for (const item of card ? complianceCardMilestones(card) : []) {
      // Prefer durable create audits over live upload milestones (same file).
      if (
        item.id.startsWith("doc-upload-") &&
        auditedCreates.has(`${item.title}|${item.detail}`)
      ) {
        continue;
      }
      add(item);
    }
    for (const item of documentAuditMiles) add(item);
    for (const item of workflowMiles) add(item);
    return backfillMilestoneActors(
      Array.from(merged.values()),
      ledger.map((row) => ({
        at: row.created_at ?? row.transaction_date ?? "",
        userId: row.created_by,
      })),
    );
  }, [card, documentAuditMiles, ledger, workflowMiles]);

  if (!activeTrip) return null;

  return (
    <TripAuditLogPanel
      visible={visible}
      onClose={onClose}
      trip={activeTrip}
      organizationId={organizationId ?? activeTrip.organization_id}
      currentUserId={user?.uid ?? null}
      assignmentAuditRows={[]}
      assignmentDriverNames={{}}
      assignmentVehicleLabels={{}}
      timelineRows={[]}
      tripLedgerEntries={ledger}
      driverDisplayName={activeTrip.driver_display_name}
      hardCopyPod={hardCopyPod}
      loading={loading && milestones.length === 0}
      scope="compliance"
      complianceEnabled
      milestones={milestones}
    />
  );
}

export function ComplianceActivityLogButton({
  onPress,
  compact = false,
  hub = false,
  inline = false,
  label,
}: {
  onPress: () => void;
  compact?: boolean;
  hub?: boolean;
  /** Sit on the status-tag row (same height as the pill). */
  inline?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      onPress={(event) => {
        event?.stopPropagation?.();
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        hub && styles.btnHub,
        inline && styles.btnInline,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label ?? "View activity log"}
      hitSlop={6}
    >
      <Feather
        name="clock"
        size={hub ? 15 : inline ? 12 : compact ? 14 : 16}
        color={Theme.actionBtnInk}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    minWidth: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceIconWash,
  },
  btnCompact: {
    width: 28,
    height: 28,
    minWidth: 28,
    borderRadius: 8,
  },
  btnHub: {
    width: 34,
    height: 34,
    minWidth: 34,
    borderRadius: 10,
    backgroundColor: "transparent",
  },
  btnInline: {
    width: 18,
    height: 18,
    minWidth: 18,
    borderRadius: 9,
    backgroundColor: Theme.complianceIconWash,
  },
  pressed: { opacity: 0.8 },
});
