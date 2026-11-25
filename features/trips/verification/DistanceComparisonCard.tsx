import Theme from "@/constants/Theme";
import { Gauge, Navigation } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

function km(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;
}

export function DistanceComparisonCard({
  odometerDistanceKm,
  gpsDistanceKm,
  discrepancyKm,
}: {
  odometerDistanceKm: number | null | undefined;
  gpsDistanceKm: number | null | undefined;
  discrepancyKm: number | null | undefined;
}) {
  const hasWarn = discrepancyKm != null && Number.isFinite(discrepancyKm) && discrepancyKm >= 10;
  return (
    <View style={styles.card}>
      <View style={styles.metricsRow}>
        <View style={[styles.metricCell, styles.metricCellLeft]}>
          <View style={styles.metricHead}>
            <Gauge size={13} color={Theme.textRouteCard} strokeWidth={2} />
            <Text style={styles.label}>Odometer</Text>
          </View>
          <Text style={styles.value} numberOfLines={1}>
            {km(odometerDistanceKm)}
          </Text>
        </View>
        <View style={styles.metricRule} />
        <View style={styles.metricCell}>
          <View style={styles.metricHead}>
            <Navigation size={13} color={Theme.textRouteCard} strokeWidth={2} />
            <Text style={styles.label}>GPS</Text>
          </View>
          <Text style={styles.value} numberOfLines={1}>
            {km(gpsDistanceKm)}
          </Text>
        </View>
      </View>
      <View style={styles.discrepancyRow}>
        <Text style={styles.discrepancyLabel}>Difference</Text>
        <Text style={[styles.discrepancyValue, hasWarn && styles.warnValue]}>
          {km(discrepancyKm)}
        </Text>
      </View>
      {hasWarn ? (
        <Text style={styles.warnText}>
          Odometer and GPS differ by {km(discrepancyKm)}. Review when convenient.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderMedium,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  metricCell: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  metricCellLeft: {
    paddingRight: 10,
  },
  metricRule: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderMedium,
    marginHorizontal: 10,
  },
  metricHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  label: {
    fontSize: 10,
    color: Theme.textMuted,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 15,
    color: Theme.textPrimaryDark,
    fontWeight: "800",
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
  discrepancyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderMedium,
  },
  discrepancyLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  discrepancyValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  warnValue: {
    color: Theme.warning,
  },
  warnText: {
    color: Theme.warning,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
  },
});
