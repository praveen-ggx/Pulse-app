/**
 * Activity drawer for one compliance card — uploads, verify, POD, payments.
 */
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { toLedgerRow, type LedgerRow } from "@/features/finance/services/finance.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  complianceCardMilestones,
  milestoneFromDocumentAudit,
  milestoneFromWorkflowEvent,
} from "@/features/tripCompliance/utils/complianceCardActivity.util";
import { TripAuditLogPanel } from "@/features/trips/components/trip-detail/TripAuditLogPanel";
import {
  fetchTripHardCopyPodState,
  type TripHardCopyPodState,
} from "@/features/trips/services/tripDocumentLrPod.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import { supabase } from "@/lib/supabase";
import Feather from "@expo/vector-icons/Feather";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet } from "react-native";

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
  const [loading, setLoading] = useState(false);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [hardCopyPod, setHardCopyPod] = useState<TripHardCopyPodState | null>(null);
  const [workflowMiles, setWorkflowMiles] = useState<
    ReturnType<typeof milestoneFromWorkflowEvent>[]
  >([]);
  const [documentAuditMiles, setDocumentAuditMiles] = useState<
    ReturnType<typeof milestoneFromDocumentAudit>[]
  >([]);

  useEffect(() => {
    if (!visible || !activeTrip?.id) return;
    let cancelled = false;
    setLoading(true);
    const orgId = organizationId ?? activeTrip.organization_id ?? card?.trip.organization_id;
    const tripId = activeTrip.id;
    const liveDocIds = [
      ...(card?.documents.map((doc) => doc.id) ?? []),
      ...(card?.vehicleDocuments.map((doc) => doc.id) ?? []),
      ...(card?.driverDocuments.map((doc) => doc.id) ?? []),
    ].filter(Boolean);
    const entityIds = [tripId, ...liveDocIds];
    void (async () => {
      const [pod, tx, events, audits] = await Promise.all([
        fetchTripHardCopyPodState(tripId),
        supabase()
          .from("transactions")
          .select(
            "id, organization_id, trip_id, trip_number, party_name, description, amount_in, amount_out, transaction_date, created_at, contact_id, contact_type, vehicle_number, driver_name, ledger_entity_type, ledger_flow_type, ledger_category, payment_reference, created_by",
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
              .select("id, action, actor_id, created_at, entity_id, notes, metadata")
              .eq("organization_id", orgId)
              .in("action", ["deleted", "replaced"])
              .in("entity_id", entityIds)
              .order("created_at", { ascending: false })
              .limit(80)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (cancelled) return;
      setHardCopyPod(pod.state ?? null);
      setLedger(
        tx.error
          ? []
          : ((tx.data ?? []) as Array<Parameters<typeof toLedgerRow>[0]>).map((row) =>
              toLedgerRow({
                ...row,
                amount_in: Number(row.amount_in) || 0,
                amount_out: Number(row.amount_out) || 0,
              }),
            ),
      );
      setWorkflowMiles(
        events.error
          ? []
          : ((events.data ?? []) as Parameters<typeof milestoneFromWorkflowEvent>[0][])
              .map(milestoneFromWorkflowEvent)
              .filter((item): item is NonNullable<typeof item> => item != null),
      );
      setDocumentAuditMiles(
        audits.error
          ? []
          : ((audits.data ?? []) as Parameters<typeof milestoneFromDocumentAudit>[0][])
              .map(milestoneFromDocumentAudit)
              .filter((item): item is NonNullable<typeof item> => item != null),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeTrip?.id,
    activeTrip?.organization_id,
    card?.driverDocuments,
    card?.documents,
    card?.trip.organization_id,
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
    for (const item of card ? complianceCardMilestones(card) : []) add(item);
    for (const item of documentAuditMiles) add(item);
    for (const item of workflowMiles) add(item);
    return Array.from(merged.values());
  }, [card, documentAuditMiles, workflowMiles]);

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
      loading={loading}
      scope="compliance"
      milestones={milestones}
    />
  );
}

export function ComplianceActivityLogButton({
  onPress,
  compact = false,
  label,
}: {
  onPress: () => void;
  compact?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      onPress={(event) => {
        event?.stopPropagation?.();
        onPress();
      }}
      style={({ pressed }) => [styles.btn, compact && styles.btnCompact, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label ?? "View activity log"}
      hitSlop={6}
    >
      <Feather name="clock" size={compact ? 14 : 16} color={Theme.actionBtnInk} />
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
  pressed: { opacity: 0.8 },
});
