/**
 * Trip activity drawer / sheet — user-level actions on a trip.
 */
import { RegistryWebDrawer } from "@/components/RegistryWebDrawer";
import { useAuth } from "@/contexts/AuthContext";
import { TripAuditLogContent } from "@/features/trips/components/trip-detail/TripAuditLogContent";
import { resolveComplianceActorDetails } from "@/features/tripCompliance/services/complianceDocumentView.service";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { getOrganizationMembers } from "@/features/organization/services/members.service";
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
  for (const mile of milestones) add(mile.actorUserId);
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
  const [resolvingUsers, setResolvingUsers] = useState(false);
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

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void loadTripActivityActorHydration({
      tripId: trip.id,
      extraUserIds: knownUserIdsKey.split(","),
    }).then((hydration) => {
      if (!cancelled) setActorHydration(hydration);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, trip.id, knownUserIdsKey]);

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

  useEffect(() => {
    if (!visible) return;
    const orgId = organizationId ?? trip.organization_id;
    if (!orgId && activityUserIds.length === 0) {
      setUserDisplayById({});
      setUserProfileById({});
      return;
    }

    let cancelled = false;
    setResolvingUsers(true);

    void (async () => {
      const displayMap: Record<string, string> = {};
      const profileMap: Record<string, TripActivityUserProfile> = {};

      const rememberProfile = (
        uid: string,
        profile: TripActivityUserProfile,
      ) => {
        const prev = profileMap[uid];
        const next: TripActivityUserProfile = {
          full_name: profile.full_name?.trim() || prev?.full_name || null,
          email: profile.email?.trim() || prev?.email || null,
          phone: profile.phone?.trim() || prev?.phone || null,
          avatar_url: profile.avatar_url?.trim() || prev?.avatar_url || null,
          avatar_seed: profile.avatar_seed?.trim() || prev?.avatar_seed || null,
        };
        profileMap[uid] = next;
        const name =
          next.full_name?.trim() ||
          next.phone?.trim() ||
          next.email?.trim() ||
          "";
        if (name) displayMap[uid] = name;
      };

      if (sessionUserId && sessionProfile) {
        rememberProfile(sessionUserId, {
          full_name: sessionProfile.full_name ?? sessionProfile.displayName ?? null,
          email: sessionProfile.email ?? null,
          phone: sessionProfile.phone ?? null,
          avatar_url: sessionProfile.avatar_url ?? null,
          avatar_seed: sessionProfile.avatar_seed ?? null,
        });
      }

      for (const [id, profile] of Object.entries(actorHydration.profiles)) {
        rememberProfile(id, profile);
      }
      for (const [id, name] of Object.entries(displayMapFromProfiles(actorHydration.profiles))) {
        if (name) displayMap[id] = name;
      }

      if (orgId) {
        const { members } = await getOrganizationMembers(orgId);
        for (const member of members) {
          const uid = String(member.user_id ?? "").trim();
          if (!uid) continue;
          rememberProfile(uid, {
            full_name:
              member.full_name?.trim() ||
              member.phone?.trim() ||
              member.email?.trim() ||
              null,
            email: member.email?.trim() || null,
            phone: member.phone?.trim() || null,
            avatar_url: member.avatar_url ?? null,
            avatar_seed: member.avatar_seed ?? null,
          });
        }
      }

      const missingName = (id: string) => {
        const existing = profileMap[id];
        return !(
          existing?.full_name?.trim() ||
          existing?.phone?.trim() ||
          existing?.email?.trim()
        );
      };
      const unresolved = activityUserIds.filter(missingName);
      if (unresolved.length > 0) {
        const details = await resolveComplianceActorDetails(unresolved, orgId);
        for (const [id, detail] of Object.entries(details)) {
          if (detail.name && detail.name !== "Unknown") {
            rememberProfile(id, {
              full_name: detail.name,
              email: null,
              phone: null,
              avatar_url: profileMap[id]?.avatar_url ?? null,
              avatar_seed: profileMap[id]?.avatar_seed ?? null,
            });
          }
        }
      }
      if (!cancelled) {
        setUserDisplayById(displayMap);
        setUserProfileById(profileMap);
        setResolvingUsers(false);
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
        userDisplayById,
        userProfileById,
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
      userDisplayById,
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
      loading={loading || resolvingUsers || loadingCaptured}
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
