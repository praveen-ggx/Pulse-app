/**
 * Trip activity drawer / sheet — user-level actions on a trip.
 */
import { RegistryWebDrawer } from "@/components/RegistryWebDrawer";
import { useAuth } from "@/contexts/AuthContext";
import { TripAuditLogContent } from "@/features/trips/components/trip-detail/TripAuditLogContent";
import { resolveComplianceActorDetails } from "@/features/tripCompliance/services/complianceDocumentView.service";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { DriverActivityTimelineRow } from "@/features/trips/components/trip-detail/hooks/useTripDetail";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import type { TripHardCopyPodState } from "@/features/trips/services/tripDocumentLrPod.service";
import {
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { listTripActivityMilestones } from "@/features/trips/services/tripActivityMilestones.service";
import {
  applyDocumentActorsToMilestones,
  displayMapFromProfiles,
  loadTripActivityActorHydration,
  mergeLedgerCreatedBy,
  readCachedActivityProfiles,
  resolveActivityUserProfiles,
  type TripActivityActorHydration,
} from "@/lib/trips/hydrateTripActivityActors.util";
import {
  buildTripAuditLog,
  matchesTripAuditTab,
  type TripActivityUserProfile,
  type TripAuditLogScope,
  type TripAuditMilestone,
} from "@/lib/trips/buildTripAuditLog.util";
import type { TripAuditFilterTab } from "@/lib/trips/tripAuditLog.types";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const AUDIT_DRAWER_WIDTH = 420;

export type TripAuditLogPanelProps = {
  visible: boolean;
  onClose: () => void;
  trip: TripRow;
  organizationId?: string | null;
  currentUserId?: string | null;
  assignmentAuditRows: TripAssignmentAuditRow[];
  assignmentDriverNames: Record<string, string>;
  assignmentVehicleLabels: Record<string, string>;
  timelineRows: DriverActivityTimelineRow[];
  tripLedgerEntries: LedgerRow[];
  driverDisplayName?: string | null;
  hardCopyPod?: TripHardCopyPodState | null;
  loading?: boolean;
  scope?: TripAuditLogScope;
  milestones?: TripAuditMilestone[];
  complianceEnabled?: boolean;
  vaultDocuments?: Array<{
    id: string;
    document_type?: string | null;
    file_name?: string | null;
    uploaded_at?: string | null;
    uploaded_by?: string | null;
    status?: string | null;
    verified_at?: string | null;
    verified_by?: string | null;
    rejection_reason?: string | null;
  }>;
};

function collectActivityUserIds(
  trip: TripRow,
  assignmentAuditRows: TripAssignmentAuditRow[],
  transactions: LedgerRow[],
  milestones: TripAuditMilestone[] = [],
  currentUserId?: string | null,
  timelineRows: DriverActivityTimelineRow[] = [],
  hardCopyActorId?: string | null,
  vaultDocuments: TripAuditLogPanelProps["vaultDocuments"] = [],
): string[] {
  const ids = new Set<string>();
  const add = (id: string | null | undefined) => {
    const v = String(id ?? "").trim();
    if (v) ids.add(v);
  };
  add(currentUserId);
  add(trip.created_by_user_id);
  add(trip.created_by);
  add(trip.owner_user_id);
  add(trip.assigned_by_user_id);
  add(trip.status_updated_by);
  add(hardCopyActorId);
  for (const row of assignmentAuditRows) add(row.changed_by);
  for (const tx of transactions) add(tx.created_by);
  for (const mile of milestones) {
    add(mile.actorUserId);
    add(mile.originActorUserId);
  }
  for (const item of timelineRows) {
    if (item.kind === "status") add(item.actorUserId);
  }
  for (const doc of vaultDocuments ?? []) {
    add(doc.uploaded_by);
    add(doc.verified_by);
  }
  return Array.from(ids);
}

export function TripAuditLogPanel({
  visible,
  onClose,
  trip,
  organizationId,
  currentUserId,
  assignmentAuditRows,
  assignmentDriverNames,
  assignmentVehicleLabels,
  timelineRows,
  tripLedgerEntries,
  driverDisplayName,
  hardCopyPod = null,
  loading = false,
  scope = "all",
  milestones = [],
  complianceEnabled = false,
  vaultDocuments = [],
}: TripAuditLogPanelProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isCompact = width < 768;
  const { profile: sessionProfile, user: sessionUser } = useAuth();
  const sessionUserId = currentUserId ?? sessionUser?.uid ?? null;
  const [userDisplayById, setUserDisplayById] = useState<Record<string, string>>({});
  const [userProfileById, setUserProfileById] = useState<
    Record<string, TripActivityUserProfile>
  >({});
  const [capturedMilestones, setCapturedMilestones] = useState<TripAuditMilestone[]>(
    [],
  );
  const [loadingCaptured, setLoadingCaptured] = useState(false);
  const [actorHydration, setActorHydration] = useState<TripActivityActorHydration>({
    createdByByTxId: {},
    uploadedByByDocId: {},
    verifiedByByDocId: {},
    profiles: {},
  });

  const tripRef = getTripDisplayNumber(trip, organizationId ?? undefined);
  const route = [trip.pickup_area, trip.drop_location].filter(Boolean).join(" → ");
  const vaultDocumentsKey = vaultDocuments
    .map((doc) =>
      [doc.id, doc.uploaded_at, doc.uploaded_by, doc.verified_at, doc.status].join(":"),
    )
    .join("|");

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingCaptured(true);
    void listTripActivityMilestones(trip, vaultDocuments)
      .then((rows) => {
        if (cancelled) return;
        setCapturedMilestones(rows);
        setLoadingCaptured(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCapturedMilestones([]);
        setLoadingCaptured(false);
      });
    return () => {
      cancelled = true;
    };
    // vaultDocumentsKey is the stable identity for the live vault rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, trip.id, trip.organization_id, trip.indent_id, vaultDocumentsKey]);

  const knownUserIdsKey = [
    sessionUserId,
    trip.created_by_user_id,
    trip.created_by,
    trip.owner_user_id,
    trip.assigned_by_user_id,
    trip.status_updated_by,
    hardCopyPod?.actorId,
    ...assignmentAuditRows.map((row) => row.changed_by),
    ...tripLedgerEntries.map((row) => row.created_by),
    ...vaultDocuments.map((doc) => doc.uploaded_by ?? doc.verified_by),
  ]
    .map((id) => String(id ?? "").trim())
    .filter(Boolean)
    .join(",");

  const entityIdsKey = [trip.vehicle_id, trip.driver_id, trip.supplier_id]
    .map((id) => String(id ?? "").trim())
    .filter(Boolean)
    .join(",");

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void loadTripActivityActorHydration({
      tripId: trip.id,
      organizationId: organizationId ?? trip.organization_id,
      entityIds: entityIdsKey ? entityIdsKey.split(",") : [],
      extraUserIds: knownUserIdsKey.split(","),
    }).then((hydration) => {
      if (!cancelled) setActorHydration(hydration);
    });
    return () => {
      cancelled = true;
    };
  }, [
    visible,
    trip.id,
    trip.organization_id,
    organizationId,
    knownUserIdsKey,
    entityIdsKey,
  ]);

  const mergedMilestones = useMemo(() => {
    const byId = new Map<string, TripAuditMilestone>();
    for (const row of [...capturedMilestones, ...milestones]) {
      if (!row?.id) continue;
      byId.set(row.id, row);
    }
    return applyDocumentActorsToMilestones(
      Array.from(byId.values()),
      actorHydration.uploadedByByDocId,
      actorHydration.verifiedByByDocId,
    );
  }, [actorHydration.uploadedByByDocId, actorHydration.verifiedByByDocId, capturedMilestones, milestones]);

  const hydratedLedgerEntries = useMemo(
    () => mergeLedgerCreatedBy(tripLedgerEntries, actorHydration.createdByByTxId),
    [tripLedgerEntries, actorHydration.createdByByTxId],
  );

  const activityUserIds = useMemo(
    () =>
      collectActivityUserIds(
        trip,
        assignmentAuditRows,
        hydratedLedgerEntries,
        mergedMilestones,
        sessionUserId,
        timelineRows,
        hardCopyPod?.actorId,
        vaultDocuments,
      ),
    [
      trip,
      assignmentAuditRows,
      hydratedLedgerEntries,
      mergedMilestones,
      sessionUserId,
      timelineRows,
      hardCopyPod?.actorId,
      vaultDocuments,
    ],
  );
  // Stable primitive key: the effect below must only re-run when the actual set
  // of ids changes, not when the parent hands us a new array reference each
  // render (which otherwise re-fires resolution and flickers the empty state).
  const activityUserIdsKey = activityUserIds.join(",");

  const knownProfiles = useMemo(() => {
    const profiles: Record<string, TripActivityUserProfile> = {
      ...readCachedActivityProfiles(activityUserIds),
      ...actorHydration.profiles,
    };
    if (sessionUserId && sessionProfile) {
      const prev = profiles[sessionUserId];
      profiles[sessionUserId] = {
        full_name:
          sessionProfile.full_name?.trim() ||
          sessionProfile.displayName?.trim() ||
          prev?.full_name ||
          null,
        email: sessionProfile.email?.trim() || prev?.email || null,
        phone: sessionProfile.phone?.trim() || prev?.phone || null,
        avatar_url: sessionProfile.avatar_url ?? prev?.avatar_url ?? null,
        avatar_seed: sessionProfile.avatar_seed ?? prev?.avatar_seed ?? null,
      };
    }
    return profiles;
  }, [
    activityUserIds,
    actorHydration.profiles,
    sessionProfile,
    sessionUserId,
  ]);
  const knownNames = useMemo(
    () => ({ ...displayMapFromProfiles(knownProfiles), ...userDisplayById }),
    [knownProfiles, userDisplayById],
  );

  useEffect(() => {
    if (!visible) return;
    const orgId = organizationId ?? trip.organization_id;
    if (!orgId && activityUserIds.length === 0) {
      setUserDisplayById({});
      setUserProfileById({});
      return;
    }

    let cancelled = false;

    void (async () => {
      const resolved = await resolveActivityUserProfiles({
        userIds: activityUserIds,
        organizationId: orgId,
        seedProfiles: knownProfiles,
      });
      const profileMap: Record<string, TripActivityUserProfile> = { ...resolved };
      const displayMap = displayMapFromProfiles(profileMap);
      const unresolved = activityUserIds.filter((id) => !displayMap[id]);
      if (unresolved.length > 0) {
        const details = await resolveComplianceActorDetails(unresolved, orgId);
        for (const [id, detail] of Object.entries(details)) {
          if (!detail.name || detail.name === "Unknown") continue;
          profileMap[id] = {
            ...profileMap[id],
            full_name: detail.name,
          };
          displayMap[id] = detail.name;
        }
      }
      if (!cancelled) {
        setUserDisplayById(displayMap);
        setUserProfileById(profileMap);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visible,
    organizationId,
    trip.organization_id,
    activityUserIdsKey,
    sessionUserId,
    sessionProfile?.avatar_url,
    sessionProfile?.avatar_seed,
    sessionProfile?.full_name,
    sessionProfile?.displayName,
    actorHydration.profiles,
  ]);

  const entries = useMemo(
    () =>
      buildTripAuditLog({
        trip,
        tripRef,
        assignmentAuditRows,
        assignmentDriverNames,
        assignmentVehicleLabels,
        timelineRows,
        transactions: hydratedLedgerEntries,
        currentUserId: sessionUserId,
        userDisplayById: knownNames,
        userProfileById: { ...knownProfiles, ...userProfileById },
        driverDisplayName: driverDisplayName ?? trip.driver_display_name,
        hardCopyPod,
        scope,
        milestones: mergedMilestones,
      }),
    [
      trip,
      tripRef,
      assignmentAuditRows,
      assignmentDriverNames,
      assignmentVehicleLabels,
      timelineRows,
      hydratedLedgerEntries,
      sessionUserId,
      knownNames,
      knownProfiles,
      userProfileById,
      driverDisplayName,
      hardCopyPod,
      scope,
      mergedMilestones,
    ],
  );

  const tabs: TripAuditFilterTab[] =
    scope === "compliance"
      ? ["all", "documents", "compliance"]
      : complianceEnabled
        ? ["all", "documents", "compliance", "updates", "assignment", "payment"]
        : ["all", "documents", "updates", "assignment", "payment"];

  const panel = (
    <TripAuditLogContent
      title="Activity"
      subtitle={route ? `${tripRef} · ${route}` : tripRef}
      entries={entries}
      matchesTab={matchesTripAuditTab}
      loading={loading || loadingCaptured}
      onClose={onClose}
      shellStyle={styles.panelFullBleed}
      tabs={tabs}
      initialTab="all"
      organizationId={organizationId ?? trip.organization_id ?? null}
      emptyBody={
        scope === "compliance"
          ? "Document uploads, deletions, and compliance checks will appear here with the workspace member who did them."
          : "Document uploads, payments, assignments, and trip updates by your workspace will appear here."
      }
    />
  );

  if (Platform.OS === "web") {
    return (
      <RegistryWebDrawer
        visible={visible}
        onClose={onClose}
        width={AUDIT_DRAWER_WIDTH}
      >
        {panel}
      </RegistryWebDrawer>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={isCompact ? "fullScreen" : "pageSheet"}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.nativeSheet,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            maxHeight: height,
          },
        ]}
      >
        {panel}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  nativeSheet: {
    flex: 1,
    backgroundColor: "#fff",
  },
  panelFullBleed: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    maxHeight: "100%",
  },
});
