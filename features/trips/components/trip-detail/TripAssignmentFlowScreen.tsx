/**
 * Full-screen driver & vehicle assignment — opens the stepped wizard directly
 * (fleet picker or assign-by-phone flow). No intermediate "Current assignment" hub.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { isAggregateTrip } from "@/features/drivers/utils/driverUtils.util";
import { TripAssignmentBlock } from "@/features/trips/components/TripAssignmentBlock";
import { useTripDetail } from "@/features/trips/components/trip-detail/hooks/useTripDetail";
import { isTripCompleted } from "@/features/trips/services/trips.service";
import { formatIndianVehicleNumber } from "@/lib/format";

export type AssignmentFlowFocus = "driver" | "vehicle";

type FleetFlowStep = "driver" | "vehicle";

export interface TripAssignmentFlowScreenProps {
  tripId: string;
  initialFocus?: AssignmentFlowFocus;
  onBack: () => void;
}

export function TripAssignmentFlowScreen({
  tripId,
  initialFocus = "driver",
  onBack,
}: TripAssignmentFlowScreenProps) {
  const { currentOrganization } = useOrganization();
  const detail = useTripDetail({ tripId, onBack });
  const [fleetStep, setFleetStep] = useState<FleetFlowStep>(
    initialFocus === "vehicle" ? "vehicle" : "driver",
  );
  const [flowNonce, setFlowNonce] = useState(0);

  const trip = detail.trip;
  const orgId = currentOrganization?.id ?? trip?.organization_id ?? "";
  const isAggregate = trip ? isAggregateTrip(trip) : false;

  useEffect(() => {
    setFlowNonce((n) => n + 1);
  }, []);

  const handleFleetDriverSaved = useCallback(() => {
    setFleetStep("vehicle");
    setFlowNonce((n) => n + 1);
  }, []);

  if (detail.loading && !trip) {
    return <CenteredLoadingView message="Loading trip…" />;
  }

  if (detail.error || !trip || !orgId) {
    return (
      <View style={styles.fallback}>
        <Pressable onPress={onBack} style={styles.fallbackBack} hitSlop={8}>
          <Text style={styles.fallbackBackText}>Back</Text>
        </Pressable>
        <Text style={styles.unavailable}>
          {detail.error ?? "Trip not found"}
        </Text>
      </View>
    );
  }

  if (!detail.canAssign || isTripCompleted(trip)) {
    return (
      <View style={styles.fallback}>
        <Pressable onPress={onBack} style={styles.fallbackBack} hitSlop={8}>
          <Text style={styles.fallbackBackText}>Back</Text>
        </Pressable>
        <Text style={styles.unavailable}>
          This trip cannot be reassigned from here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <TripAssignmentBlock
        trip={trip}
        organizationId={orgId}
        canAssign={detail.canAssign}
        onUpdated={detail.handleAssignmentUpdated}
        partnerName={detail.partnerName}
        driverName={detail.driverName}
        assignedDriverPhone={detail.driverPhone}
        vehicleLabel={
          isAggregate
            ? detail.displayVehicleFromInput.trim() ||
              detail.vehicleLabel ||
              null
            : detail.vehicleLabel
        }
        driverAvatarUri={detail.driverAvatarUri}
        showAssignByPhone={detail.showAssignByPhone}
        assignmentSource={detail.assignmentSource}
        currentUserId={detail.currentUserId}
        previousDriverName={detail.previousDriverName}
        latestReassignmentSummary={detail.latestReassignmentSummary}
        driverAssignOrgId={
          isAggregate ? (currentOrganization?.id ?? null) : null
        }
        showManifestCard={false}
        fullPageFlow
        autoOpenPhoneWizard={isAggregate && detail.showAssignByPhone}
        autoOpenPhoneWizardNonce={flowNonce}
        autoOpenPickerMode={fleetStep}
        autoOpenPickerNonce={flowNonce}
        advanceToVehicleAfterDriverSave={false}
        onFleetDriverSaved={handleFleetDriverSaved}
        onFlowDismiss={onBack}
        onFlowComplete={onBack}
        onBeforeRegisterNavigate={onBack}
        onVehicleDisplayChange={(value) => {
          detail.setDisplayVehicleFromInput(
            formatIndianVehicleNumber(value ?? ""),
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  fallback: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  fallbackBack: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  fallbackBackText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.primary,
  },
  unavailable: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 20,
  },
});
