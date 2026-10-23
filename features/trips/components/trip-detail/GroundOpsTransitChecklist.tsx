/**
 * Start Trip checklist in the Ground Ops "Update trip" dialog: every required
 * document (Trip · Vehicle · Driver) with attached / missing, so it is clear
 * what blocks the trip and what is already done. Built for the dark sim dialog;
 * rows wrap on narrow phones. The action opens Document Upload on this trip,
 * on the tab (Trip / Vehicle / Driver) of the first missing document.
 */
import { CheckCircle2, CircleAlert, FileUp } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import {
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  REQUIRED_VEHICLE_DOCUMENT_TYPES,
} from "@/features/tripCompliance/tripCompliance.types";
import {
  GROUND_OPS_TRANSIT_REQUIRED_TRIP_TYPES,
  groundOpsTransitDocLabel,
} from "@/features/tripCompliance/utils/groundOpsTransitGate.util";

const GROUPS: { title: string; types: readonly string[] }[] = [
  { title: "Trip", types: GROUND_OPS_TRANSIT_REQUIRED_TRIP_TYPES },
  { title: "Vehicle", types: REQUIRED_VEHICLE_DOCUMENT_TYPES },
  { title: "Driver", types: REQUIRED_DRIVER_DOCUMENT_TYPES },
];

const TOTAL = GROUPS.reduce((sum, group) => sum + group.types.length, 0);

/** Document Upload tab holding the first missing type. */
export function groundOpsTransitUploadTab(missing: readonly string[]): "trip" | "vehicle" | "driver" {
  const first = GROUPS.find((group) => group.types.some((type) => missing.includes(type)));
  return first?.title === "Vehicle" ? "vehicle" : first?.title === "Driver" ? "driver" : "trip";
}

export function GroundOpsTransitChecklist({
  missing,
  checking,
  onOpenDocumentUpload,
}: {
  /** Missing required types; null while not checked yet. */
  missing: readonly string[] | null;
  checking: boolean;
  onOpenDocumentUpload?: (tab: "trip" | "vehicle" | "driver") => void;
}) {
  if (checking || missing === null) {
    return <Text style={styles.checking}>Checking required documents…</Text>;
  }
  const missingSet = new Set(missing);
  const attached = TOTAL - missingSet.size;
  const ready = missingSet.size === 0;

  return (
    <View style={styles.root}>
      <View style={[styles.summary, ready ? styles.summaryReady : styles.summaryBlocked]}>
        {ready ? (
          <CheckCircle2 size={16} color={Theme.positive} strokeWidth={2.4} />
        ) : (
          <CircleAlert size={16} color={Theme.warning} strokeWidth={2.4} />
        )}
        <Text style={styles.summaryText}>
          {ready
            ? "All required documents are attached"
            : `${attached} of ${TOTAL} attached · upload ${missingSet.size} more to start`}
        </Text>
      </View>

      {GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          <View style={styles.chips}>
            {group.types.map((type) => {
              const isMissing = missingSet.has(type);
              return (
                <View
                  key={type}
                  style={[styles.chip, isMissing ? styles.chipMissing : styles.chipDone]}
                  accessibilityLabel={`${groundOpsTransitDocLabel(type)} ${isMissing ? "missing" : "attached"}`}
                >
                  {isMissing ? (
                    <CircleAlert size={13} color={Theme.warning} strokeWidth={2.4} />
                  ) : (
                    <CheckCircle2 size={13} color={Theme.positive} strokeWidth={2.4} />
                  )}
                  <Text style={[styles.chipText, isMissing && styles.chipTextMissing]}>
                    {groundOpsTransitDocLabel(type)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}

      {!ready && onOpenDocumentUpload ? (
        <Pressable
          style={({ pressed }) => [styles.vaultBtn, pressed && styles.vaultBtnPressed]}
          onPress={() => onOpenDocumentUpload(groundOpsTransitUploadTab(missing))}
          accessibilityRole="button"
          accessibilityLabel="Open Document Upload for this trip to upload the missing documents"
        >
          <FileUp size={15} color={Theme.textOnPrimary} strokeWidth={2.2} />
          <Text style={styles.vaultBtnText}>Upload in Document Upload</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
    marginBottom: 16,
  },
  checking: {
    fontSize: 13,
    color: Theme.textRouteCard,
    textAlign: "center",
    marginBottom: 16,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  summaryReady: {
    backgroundColor: Theme.positiveMutedDark,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  summaryBlocked: {
    backgroundColor: "rgba(245,158,11,0.10)",
    borderColor: "rgba(245,158,11,0.28)",
  },
  summaryText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    lineHeight: 18,
  },
  group: {
    gap: 6,
  },
  groupTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Theme.textRouteCard,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipDone: {
    backgroundColor: "rgba(21,128,61,0.12)",
    borderColor: "rgba(21,128,61,0.35)",
  },
  chipMissing: {
    backgroundColor: "rgba(245,158,11,0.10)",
    borderColor: "rgba(245,158,11,0.45)",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textOnPrimary,
  },
  chipTextMissing: {
    fontWeight: "700",
  },
  vaultBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  vaultBtnPressed: {
    opacity: 0.8,
  },
  vaultBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
});
