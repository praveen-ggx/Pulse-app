/**
 * Broadcast idle-fleet picker — same ticket shell as Trips / Load lanes.
 */
import Theme from "@/constants/Theme";
import { TripsHubMobileTripCard } from "@/features/trips/components/TripsHubMobileTripCard";
import type { TripRow } from "@/features/trips/services/trips.service";
import { Platform, Pressable, StyleSheet, View } from "react-native";

export type BroadcastIdleVehicle = {
  id: string;
  vehicle_number: string;
  vehicle_type?: string | null;
  capacity?: string | null;
  vehicle_body_type?: string | null;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
};

type BroadcastIdleVehicleCardProps = {
  vehicle: BroadcastIdleVehicle;
  selected: boolean;
  orgName: string;
  origin?: string;
  destination?: string;
  hubGrid?: boolean;
  orgLogoUrl?: string | null;
  orgAvatarSeed?: string | null;
  onPress: () => void;
};

function vehicleAsHubTripShape(vehicle: BroadcastIdleVehicle): TripRow {
  return {
    id: vehicle.id,
    pickup_area: "Idle",
    drop_location: "Anywhere",
    client_name: "",
    created_at: new Date().toISOString(),
  } as TripRow;
}

function vehicleSpecLine(vehicle: BroadcastIdleVehicle): string {
  return [
    vehicle.vehicle_type?.trim(),
    vehicle.capacity?.trim(),
    vehicle.vehicle_body_type?.trim(),
    [vehicle.vehicle_brand?.trim(), vehicle.vehicle_model?.trim()]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function BroadcastIdleVehicleCard({
  vehicle,
  selected,
  orgName,
  origin,
  destination,
  hubGrid = false,
  orgLogoUrl,
  orgAvatarSeed,
  onPress,
}: BroadcastIdleVehicleCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        selected && styles.wrapSelected,
        pressed && styles.wrapPressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${vehicle.vehicle_number}, idle. ${selected ? "Selected" : "Tap to select"}`}
    >
      <View pointerEvents="none" style={styles.ticket}>
        <TripsHubMobileTripCard
          trip={vehicleAsHubTripShape(vehicle)}
          displayClientName={orgName || "Your organization"}
          stageLabel="IDLE"
          origin={origin?.trim() || "Current location"}
          dest={destination?.trim() || "Anywhere"}
          onPress={() => undefined}
          tr={(key) => key}
          hidePartyRow
          displayNumber={vehicle.vehicle_number}
          originTags={selected ? ["IDLE", "SELECTED"] : ["IDLE"]}
          specLine={vehicleSpecLine(vehicle) || "Vehicle type not set"}
          dense={hubGrid}
          fillGrid={hubGrid}
          clientOrganizationImageUrl={orgLogoUrl}
          clientOrganizationAvatarSeed={orgAvatarSeed}
          clientAvatarSeed={orgAvatarSeed ?? orgName}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "transparent",
    ...Platform.select({
      web: { cursor: "pointer" } as object,
      default: {},
    }),
  },
  wrapSelected: {
    borderColor: Theme.primary,
  },
  wrapPressed: { opacity: 0.92 },
  ticket: { minWidth: 0 },
});
