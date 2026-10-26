/**
 * Horizontal status stepper for the 4-stage trip lifecycle.
 * Confirmed → Picked Up → In Transit → Delivered
 *
 * State-driven: derives active step purely from trip.status.
 * Timestamp per stage shown when available.
 */
import Theme from "@/constants/Theme";
import { StyleSheet, Text, View } from "react-native";
import type { TripRow } from "../../../services/trips.service";

const STEPS: {
  key: string;
  short: string;
  full: string;
  statuses: string[];
  completedStatuses: string[];
}[] = [
  {
    key: "confirmed",
    short: "Assigned",
    full: "Confirmed",
    statuses: ["assigned", "confirmed", "draft"],
    completedStatuses: [
      "in_progress",
      "in_transit",
      "picked_up",
      "pickup",
      "dispatched",
      "arrived",
      "at_destination",
      "at_drop",
      "completed",
      "delivered",
      "done",
    ],
  },
  {
    key: "pickup",
    short: "Picked up",
    full: "Picked Up",
    statuses: ["in_progress", "picked_up", "pickup"],
    completedStatuses: [
      "in_transit",
      "dispatched",
      "arrived",
      "at_destination",
      "at_drop",
      "completed",
      "delivered",
      "done",
    ],
  },
  {
    key: "intransit",
    short: "In Transit",
    full: "In Transit",
    statuses: ["in_transit", "dispatched", "arrived", "at_destination", "at_drop"],
    completedStatuses: ["completed", "delivered", "done"],
  },
  {
    key: "delivered",
    short: "Delivered",
    full: "Delivered",
    statuses: ["completed", "delivered", "done"],
    completedStatuses: [],
  },
];

interface TimelineStepperProps {
  trip: TripRow;
  /** Optional custom timestamps per step key: confirmed, pickup, intransit, delivered */
  timestamps?: Partial<Record<string, string>>;
}

export function TimelineStepper({ trip, timestamps }: TimelineStepperProps) {
  const status = (trip.status ?? "").toLowerCase();
  const activeStepIndex = deriveActiveStep(status);

  // Auto-fill timestamps from trip fields where available
  const resolvedTimestamps: Record<string, string | undefined> = {
    confirmed: trip.pickup_date ?? trip.created_at,
    pickup: trip.started_at ?? undefined,
    delivered: trip.completed_at ?? undefined,
    ...timestamps,
  };

  return (
    <View style={styles.root}>
      {STEPS.map((step, idx) => {
        const isCompleted = idx < activeStepIndex;
        const isActive = idx === activeStepIndex;
        const isLast = idx === STEPS.length - 1;
        const ts = resolvedTimestamps[step.key];

        return (
          <View key={step.key} style={styles.stepWrapper}>
            <View style={styles.stepColumn}>
              {/* Connector line (left) */}
              {idx > 0 && (
                <View
                  style={[
                    styles.connectorLeft,
                    (isCompleted || isActive) && styles.connectorFilled,
                  ]}
                />
              )}

              {/* Dot */}
              <View
                style={[
                  styles.dot,
                  isCompleted && styles.dotCompleted,
                  isActive && styles.dotActive,
                ]}
              >
                {isCompleted && (
                  <Text style={styles.dotCheck}>✓</Text>
                )}
                {isActive && <View style={styles.dotActivePulse} />}
              </View>

              {/* Connector line (right) */}
              {!isLast && (
                <View
                  style={[
                    styles.connectorRight,
                    isCompleted && styles.connectorFilled,
                  ]}
                />
              )}
            </View>

            {/* Label */}
            <Text
              style={[
                styles.label,
                isCompleted && styles.labelCompleted,
                isActive && styles.labelActive,
              ]}
              numberOfLines={1}
            >
              {step.short}
            </Text>

            {/* Timestamp */}
            {ts ? (
              <Text style={styles.timestamp} numberOfLines={1}>
                {formatStepDate(ts)}
              </Text>
            ) : (
              <Text style={styles.timestampPlaceholder}>—</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function deriveActiveStep(status: string): number {
  for (let i = STEPS.length - 1; i >= 0; i--) {
    if (STEPS[i].statuses.includes(status)) return i;
    if (STEPS[i].completedStatuses.includes(status)) return i + 1;
  }
  return 0;
}

function formatStepDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

const DOT_SIZE = 24;
const CONNECTOR_H = 2;

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 12,
  },
  stepWrapper: {
    flex: 1,
    alignItems: "center",
  },
  stepColumn: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "center",
    marginBottom: 8,
  },
  connectorLeft: {
    flex: 1,
    height: CONNECTOR_H,
    backgroundColor: Theme.borderMedium,
  },
  connectorRight: {
    flex: 1,
    height: CONNECTOR_H,
    backgroundColor: Theme.borderMedium,
  },
  connectorFilled: {
    backgroundColor: Theme.buttonPrimary,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  dotCompleted: {
    borderColor: Theme.primary,
    backgroundColor: Theme.buttonPrimary,
  },
  dotActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.screenBackground,
  },
  dotCheck: {
    fontSize: 11,
    color: Theme.textOnPrimary,
    fontWeight: "700",
  },
  dotActivePulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.buttonPrimary,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
  },
  labelCompleted: {
    color: Theme.textSecondary,
  },
  labelActive: {
    color: Theme.primary,
    fontWeight: "800",
  },
  timestamp: {
    fontSize: 9,
    color: Theme.textMuted,
    textAlign: "center",
    marginTop: 2,
  },
  timestampPlaceholder: {
    fontSize: 9,
    color: Theme.borderMedium,
    textAlign: "center",
    marginTop: 2,
  },
});
