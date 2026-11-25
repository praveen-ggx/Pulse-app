import { type Href, useRouter } from "expo-router";
import { ChevronRight, Gauge, Navigation } from "lucide-react-native";
import { useCallback, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Theme from "@/constants/Theme";
import { useDriverThemeColors } from "@/contexts/DriverThemeContext";
import { tripHistoryDetailStyles as td } from "@/features/driver/tripHistory/tripHistoryDetail.styles";
import type { TripRow } from "@/features/trips/services/trips.service";
import { useGPSDistanceEstimate } from "@/features/trips/verification/GPSDistanceHook";
import { VerificationStatusChip } from "@/features/trips/verification/VerificationStatusChip";
import { useTripVerification } from "@/features/trips/verification/queries/useTripVerification";
import {
  buildOdometerGpsComparisonHint,
  formatKm,
  toVerificationSnapshot,
} from "@/features/trips/verification/selectors/verificationSelectors";
import { computeDistanceDiscrepancy } from "@/features/trips/verification/verification.service";
import { ROUTES } from "@/lib/routes";

type Props = {
  trip: TripRow;
};

function TimelineSectionHeader({
  icon,
  title,
  colors,
}: {
  icon: ReactNode;
  title: string;
  colors: ReturnType<typeof useDriverThemeColors>;
}) {
  return (
    <View style={td.tdTimelineHeader}>
      <View style={td.tdTimelineHeaderIcon}>{icon}</View>
      <Text style={[td.tdTimelineHeaderTitle, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

export function DriverTripOperationsTab({ trip }: Props) {
  const router = useRouter();
  const colors = useDriverThemeColors();

  const openOdometerCapture = useCallback(() => {
    router.push(ROUTES.tripVerification(trip.id, "both") as Href);
  }, [router, trip.id]);

  const verificationQuery = useTripVerification(trip.id);
  const snapshot = verificationQuery.data ?? toVerificationSnapshot(trip);
  const gpsEstimate = useGPSDistanceEstimate(trip);

  const gpsDistanceKm = snapshot.gpsDistanceKm ?? gpsEstimate;
  const distanceDiscrepancyKm =
    snapshot.distanceDiscrepancyKm ??
    computeDistanceDiscrepancy(snapshot.odometerDistanceKm, gpsDistanceKm);
  const odometerComparisonHint = buildOdometerGpsComparisonHint({
    startOdometerKm: snapshot.startOdometerKm,
    endOdometerKm: snapshot.endOdometerKm,
    odometerDistanceKm: snapshot.odometerDistanceKm,
    gpsDistanceKm,
    distanceDiscrepancyKm,
  });

  const missingReadings =
    snapshot.startOdometerKm == null || snapshot.endOdometerKm == null;
  const hasWarn =
    distanceDiscrepancyKm != null &&
    Number.isFinite(distanceDiscrepancyKm) &&
    distanceDiscrepancyKm >= 10;

  const readingMetrics = [
    { key: "start", label: "Start", value: formatKm(snapshot.startOdometerKm) },
    { key: "end", label: "End", value: formatKm(snapshot.endOdometerKm) },
    { key: "trip", label: "Trip", value: formatKm(snapshot.odometerDistanceKm) },
  ];

  return (
    <View style={styles.wrap}>
      <TimelineSectionHeader
        icon={<Gauge size={13} color="#ffffff" strokeWidth={2.2} />}
        title="Odometer"
        colors={colors}
      />

      <TouchableOpacity
        style={[
          td.tdTimelineCard,
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        onPress={openOdometerCapture}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Update odometer reading"
      >
        <View style={styles.topRow}>
          <VerificationStatusChip state={snapshot.state} compact />
          <View style={styles.updatePill}>
            <Text style={[styles.updateText, { color: colors.emerald }]}>Update</Text>
            <ChevronRight size={14} color={colors.emerald} strokeWidth={2.4} />
          </View>
        </View>

        <View
          style={[
            styles.readingsPanel,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          {readingMetrics.map((metric, index) => (
            <View
              key={metric.key}
              style={[
                styles.readingCell,
                index < readingMetrics.length - 1 && styles.readingCellBorder,
                { borderColor: colors.border },
              ]}
            >
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                {metric.label}
              </Text>
              <Text
                style={[styles.metricValue, { color: colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {metric.value}
              </Text>
            </View>
          ))}
        </View>

        <View
          style={[
            styles.compareStrip,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.compareCell}>
            <View style={styles.compareHead}>
              <Gauge size={12} color={Theme.textRouteCard} strokeWidth={2.1} />
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                Odometer
              </Text>
            </View>
            <Text style={[styles.compareValue, { color: colors.text }]} numberOfLines={1}>
              {formatKm(snapshot.odometerDistanceKm)}
            </Text>
          </View>

          <View style={[styles.compareRule, { backgroundColor: colors.border }]} />

          <View style={styles.compareCell}>
            <View style={styles.compareHead}>
              <Navigation size={12} color={Theme.textRouteCard} strokeWidth={2.1} />
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>GPS</Text>
            </View>
            <Text style={[styles.compareValue, { color: colors.text }]} numberOfLines={1}>
              {formatKm(gpsDistanceKm)}
            </Text>
          </View>

          <View style={[styles.compareRule, { backgroundColor: colors.border }]} />

          <View style={styles.compareCell}>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Diff</Text>
            <Text
              style={[
                styles.compareValue,
                { color: hasWarn ? Theme.warning : colors.text },
              ]}
              numberOfLines={1}
            >
              {formatKm(distanceDiscrepancyKm)}
            </Text>
          </View>
        </View>

        {missingReadings ? (
          <Text
            style={[
              styles.hint,
              {
                color: odometerComparisonHint?.hasConflict
                  ? Theme.warning
                  : colors.textMuted,
              },
            ]}
            numberOfLines={2}
          >
            {odometerComparisonHint?.text ?? "Tap to enter start and end KM"}
          </Text>
        ) : hasWarn ? (
          <Text style={[styles.hint, { color: Theme.warning }]} numberOfLines={2}>
            Odometer and GPS differ by {formatKm(distanceDiscrepancyKm)}. Review when
            convenient.
          </Text>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 0,
  },
  card: {
    gap: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  updatePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
    minHeight: 32,
    paddingLeft: 8,
  },
  updateText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  readingsPanel: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    minHeight: 64,
  },
  readingCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  readingCellBorder: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.55,
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  compareStrip: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 58,
  },
  compareCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 4,
  },
  compareHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  compareRule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: 2,
  },
  compareValue: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: -0.15,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  hint: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
    textAlign: "center",
    letterSpacing: 0.1,
  },
});
