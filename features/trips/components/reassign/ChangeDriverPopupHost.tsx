import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { isAggregateTrip } from "@/features/drivers/utils/driverUtils.util";
import {
  changeDriverSheetTrip,
  interpretChangeDriverFetch,
  type ChangeDriverHostState,
} from "@/features/trips/components/reassign/changeDriverPopupHost.util";
import { ReassignSheet } from "@/features/trips/components/reassign/ReassignSheet";
import { assignmentShellStyles } from "@/features/trips/styles/assignmentShellShared";
import { getTripDriverPhones } from "@/features/tripCompliance/services/tripDriverPhones.service";
import { getTripById, type TripRow } from "@/features/trips/services/trips.service";
import { canAssignTrip } from "@/lib/capabilities";
import { useCapabilities } from "@/lib/useCapabilities";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { queryKeys } from "@/lib/queryKeys";

/** Vendor drivers are hidden by drivers RLS — resolve via trip-scoped RPC. */
async function resolveAssignedDriverPhone(
  trip: Pick<TripRow, "id" | "driver_id">,
): Promise<string | null> {
  if (!(trip.driver_id ?? "").trim()) return null;
  const map = await getTripDriverPhones([
    { id: trip.id, driver_id: trip.driver_id },
  ]);
  return (map.get(trip.id) ?? "").trim() || null;
}

export function ChangeDriverPopupHost({
  tripId,
  onClose,
}: {
  tripId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const capabilities = useCapabilities();
  const { can: canSurface } = useMemberAccess();
  const orgId = currentOrganization?.id ?? null;
  const canAssign =
    canAssignTrip(capabilities) && canSurface("tripops.trips.assign");

  const [state, setState] = useState<ChangeDriverHostState>({ status: "idle" });
  const [currentDriverPhone, setCurrentDriverPhone] = useState<string | null>(
    null,
  );
  const sheetTrip = changeDriverSheetTrip(tripId, state);

  useEffect(() => {
    if (!tripId) {
      setState({ status: "idle" });
      setCurrentDriverPhone(null);
      return;
    }

    let cancelled = false;
    setState({ status: "loading", tripId });
    setCurrentDriverPhone(null);

    void getTripById(tripId)
      .then(async ({ trip, error }) => {
        if (cancelled) return;
        const next = interpretChangeDriverFetch({
          tripId,
          canAssign,
          trip,
          error,
        });
        setState(next);
        if (next.status === "ready") {
          const phone = await resolveAssignedDriverPhone(next.trip);
          if (!cancelled) setCurrentDriverPhone(phone);
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        const error =
          caught instanceof Error ? caught : new Error(String(caught));
        setState(interpretChangeDriverFetch({ tripId, canAssign, trip: null, error }));
        setCurrentDriverPhone(null);
      });

    return () => {
      cancelled = true;
    };
  }, [tripId, canAssign]);

  const reloadTrip = useCallback(async () => {
    if (!tripId) return;
    const { trip, error } = await getTripById(tripId);
    const next = interpretChangeDriverFetch({ tripId, canAssign, trip, error });
    setState(next);
    if (next.status === "ready") {
      setCurrentDriverPhone(await resolveAssignedDriverPhone(next.trip));
    } else {
      setCurrentDriverPhone(null);
    }
  }, [tripId, canAssign]);
  const handleCompleted = useCallback(async () => {
    if (orgId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all(orgId) });
    }
    if (tripId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.trips.detail(tripId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.trips.bundle(tripId),
      });
    }
  }, [orgId, queryClient, tripId]);

  if (!tripId) return null;

  if (sheetTrip) {
    const organizationId = orgId ?? sheetTrip.organization_id ?? "";
    if (!organizationId) {
      return (
        <ChangeDriverStatusModal
          loading={false}
          message="Trip not found"
          onClose={onClose}
        />
      );
    }
    return (
      <ReassignSheet
        visible
        onClose={onClose}
        trip={sheetTrip}
        organizationId={organizationId}
        isAggregate={isAggregateTrip(sheetTrip)}
        canAssign
        currentUserId={user?.uid ?? null}
        driverAssignOrgId={isAggregateTrip(sheetTrip) ? orgId : null}
        currentDriverName={sheetTrip.driver_display_name ?? null}
        currentDriverPhone={currentDriverPhone}
        currentVehicleLabel={sheetTrip.vehicle_display_number ?? null}
        onCompleted={handleCompleted}
        onReloadTrip={reloadTrip}
      />
    );
  }

  return (
    <ChangeDriverStatusModal
      loading={state.status !== "error"}
      message={state.status === "error" ? state.message : "Loading trip…"}
      onClose={onClose}
    />
  );
}

function ChangeDriverStatusModal({
  loading,
  message,
  onClose,
}: {
  loading: boolean;
  message: string;
  onClose: () => void;
}) {
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={assignmentShellStyles.webModalBackdrop}>
        <Pressable
          style={assignmentShellStyles.webModalBackdropTap}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss change driver"
        />
        <View style={assignmentShellStyles.assignModalWrapPopup}>
          <View style={{ padding: 24, alignItems: "center", gap: 12 }}>
            {loading ? <ActivityIndicator color={Theme.primary} /> : null}
            <Text
              style={{
                fontSize: 13,
                fontWeight: "500",
                color: Theme.textSecondary,
                textAlign: "center",
              }}
            >
              {message}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Later"
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: Theme.textPrimaryDark,
                }}
              >
                Later
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
