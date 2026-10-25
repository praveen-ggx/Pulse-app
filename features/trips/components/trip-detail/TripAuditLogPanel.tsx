/**
 * Trip activity drawer / sheet — user-level actions on a trip.
 */
import { RegistryWebDrawer } from "@/components/RegistryWebDrawer";
import { useAuth } from "@/contexts/AuthContext";
import { TripAuditLogContent } from "@/features/trips/components/trip-detail/TripAuditLogContent";
import { getProfile } from "@/features/auth/services/auth.service";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { getOrganizationMembers } from "@/features/organization/services/members.service";
import type { DriverActivityTimelineRow } from "@/features/trips/components/trip-detail/hooks/useTripDetail";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import type { TripHardCopyPodState } from "@/features/trips/services/tripDocumentLrPod.service";
import {
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";
import {
  buildTripAuditLog,
  inferTripStaffUserId,
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
};

function collectActivityUserIds(
  trip: TripRow,
  assignmentAuditRows: TripAssignmentAuditRow[],
  transactions: LedgerRow[],
  milestones: TripAuditMilestone[] = [],
  currentUserId?: string | null,
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
  for (const row of assignmentAuditRows) add(row.changed_by);
  for (const tx of transactions) {
    add(tx.created_by);
    add(inferTripStaffUserId(trip, tx.created_by));
  }
  for (const mile of milestones) add(mile.actorUserId);
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

  const tripRef = getTripDisplayNumber(trip, organizationId ?? undefined);
  const route = [trip.pickup_area, trip.drop_location].filter(Boolean).join(" → ");

  const activityUserIds = useMemo(
    () =>
      collectActivityUserIds(
        trip,
        assignmentAuditRows,
        tripLedgerEntries,
        milestones,
        sessionUserId,
      ),
    [trip, assignmentAuditRows, tripLedgerEntries, milestones, sessionUserId],
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

      const unresolved = activityUserIds.filter((id) => {
        const existing = profileMap[id];
        return !existing?.avatar_url?.trim() && !existing?.avatar_seed?.trim();
      });
      await Promise.all(
        unresolved.map(async (id) => {
          const profile = await getProfile(id);
          if (!profile) return;
          rememberProfile(id, {
            full_name:
              profile.full_name?.trim() ||
              profile.displayName?.trim() ||
              profile.phone?.trim() ||
              profile.email?.trim() ||
              null,
            email: profile.email?.trim() || null,
            phone: profile.phone?.trim() || null,
            avatar_url: profile.avatar_url ?? null,
            avatar_seed: profile.avatar_seed ?? null,
          });
        }),
      );

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
        transactions: tripLedgerEntries,
        currentUserId: sessionUserId,
        userDisplayById,
        userProfileById,
        driverDisplayName: driverDisplayName ?? trip.driver_display_name,
        hardCopyPod,
        scope,
        milestones,
      }),
    [
      trip,
      tripRef,
      assignmentAuditRows,
      assignmentDriverNames,
      assignmentVehicleLabels,
      timelineRows,
      tripLedgerEntries,
      sessionUserId,
      userDisplayById,
      userProfileById,
      driverDisplayName,
      hardCopyPod,
      scope,
      milestones,
    ],
  );

  const tabs: TripAuditFilterTab[] =
    scope === "compliance"
      ? ["all", "documents", "activity"]
      : ["all", "payment", "updates", "assignment"];

  const panel = (
    <TripAuditLogContent
      title="Activity"
      subtitle={route ? `${tripRef} · ${route}` : tripRef}
      entries={entries}
      matchesTab={matchesTripAuditTab}
      loading={loading || resolvingUsers}
      onClose={onClose}
      shellStyle={styles.panelFullBleed}
      tabs={tabs}
      emptyBody={
        scope === "compliance"
          ? "Document uploads, deletions, and compliance activity for this trip will appear here."
          : undefined
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
