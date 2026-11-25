import Theme from "@/constants/Theme";
import { AlertTriangle, CheckCircle2, Gauge, Navigation } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

function km(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;
}

/**
 * Side-by-side GPS vs odometer — sources stay labeled separately so readings
 * never conflate. Alerts when Δ ≥ 10 km.
 */
export function DistanceComparisonCard({
  odometerDistanceKm,
  gpsDistanceKm,
  discrepancyKm,
}: {
  odometerDistanceKm: number | null | undefined;
  gpsDistanceKm: number | null | undefined;
  discrepancyKm: number | null | undefined;
}) {
  const hasBoth =
    odometerDistanceKm != null &&
    Number.isFinite(Number(odometerDistanceKm)) &&
    gpsDistanceKm != null &&
    Number.isFinite(Number(gpsDistanceKm));
  const hasWarn =
    discrepancyKm != null && Number.isFinite(discrepancyKm) && discrepancyKm >= 10;
  const aligned =
    hasBoth &&
    discrepancyKm != null &&
    Number.isFinite(discrepancyKm) &&
    discrepancyKm < 10;

  let leadHint: string | null = null;
  if (hasBoth && discrepancyKm != null && discrepancyKm >= 0.05) {
    const odo = Number(odometerDistanceKm);
    const gps = Number(gpsDistanceKm);
    leadHint =
      odo > gps
        ? `Odometer higher by ${km(discrepancyKm)}`
        : `GPS higher by ${km(discrepancyKm)}`;
  }

  return (
    <View style={[styles.card, hasWarn && styles.cardWarn, aligned && styles.cardOk]}>
      <View style={styles.kickerRow}>
        <Text style={styles.kicker}>Distance check</Text>
        {hasWarn ? (
          <View style={styles.badgeWarn}>
            <AlertTriangle size={11} color={Theme.warning} strokeWidth={2.4} />
            <Text style={styles.badgeWarnText}>Mismatch</Text>
          </View>
        ) : aligned ? (
          <View style={styles.badgeOk}>
            <CheckCircle2 size={11} color={Theme.darkGreen ?? "#15803d"} strokeWidth={2.4} />
            <Text style={styles.badgeOkText}>Aligned</Text>
          </View>
        ) : (
          <Text style={styles.kickerHint}>Compare sources</Text>
        )}
      </View>

      <View style={styles.metricsRow}>
        <View style={[styles.metricCell, styles.metricCellOdo]}>
          <View style={styles.metricHead}>
            <View style={styles.iconWellOdo}>
              <Gauge size={13} color={Theme.textRouteCard} strokeWidth={2.2} />
            </View>
            <Text style={styles.label}>Odometer</Text>
          </View>
          <Text style={styles.value} numberOfLines={1}>
            {km(odometerDistanceKm)}
          </Text>
          <Text style={styles.sourceHint}>Hub reading</Text>
        </View>

        <View style={styles.vsPill}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        <View style={[styles.metricCell, styles.metricCellGps]}>
          <View style={styles.metricHead}>
            <View style={styles.iconWellGps}>
              <Navigation size={13} color={Theme.primary} strokeWidth={2.2} />
            </View>
            <Text style={styles.label}>GPS</Text>
          </View>
          <Text style={styles.value} numberOfLines={1}>
            {km(gpsDistanceKm)}
          </Text>
          <Text style={styles.sourceHint}>Tracked path</Text>
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
          {leadHint ?? `Odometer and GPS differ by ${km(discrepancyKm)}.`} Review
          before settling.
        </Text>
      ) : aligned ? (
        <Text style={styles.okText}>
          Sources agree within {km(discrepancyKm)} — good to settle.
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
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  cardWarn: {
    borderColor: "rgba(180, 83, 9, 0.35)",
    backgroundColor: Theme.warningMuted,
  },
  cardOk: {
    borderColor: "rgba(21, 128, 61, 0.28)",
    backgroundColor: "rgba(240, 253, 244, 0.85)",
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  kickerHint: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  badgeWarn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(180, 83, 9, 0.12)",
  },
  badgeWarnText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.warning,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  badgeOk: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(21, 128, 61, 0.1)",
  },
  badgeOkText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#15803d",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  metricCell: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  metricCellOdo: {},
  metricCellGps: {},
  metricHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconWellOdo: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWellGps: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 10,
    color: Theme.textMuted,
    fontWeight: "800",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 16,
    color: Theme.textPrimaryDark,
    fontWeight: "800",
    letterSpacing: -0.25,
    fontVariant: ["tabular-nums"],
  },
  sourceHint: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  vsPill: {
    alignSelf: "center",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  vsText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: Theme.textMuted,
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
    fontWeight: "600",
  },
  okText: {
    color: "#166534",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
  },
});
