import { type Href, useRouter } from "expo-router";
import { ChevronRight, Gauge } from "lucide-react-native";
import { useCallback, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Theme from "@/constants/Theme";
import { useDriverThemeColors } from "@/contexts/DriverThemeContext";
import { tripHistoryDetailStyles as td } from "@/features/driver/tripHistory/tripHistoryDetail.styles";
import type { TripRow } from "@/features/trips/services/trips.service";
import { DistanceComparisonCard } from "@/features/trips/verification/DistanceComparisonCard";
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

        <View style={styles.compareBlock}>
          <DistanceComparisonCard
            odometerDistanceKm={snapshot.odometerDistanceKm}
            gpsDistanceKm={gpsDistanceKm}
            discrepancyKm={distanceDiscrepancyKm}
          />
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
        ) : hasWarn ? null : odometerComparisonHint?.text ? (
          <Text style={[styles.hint, { color: colors.textMuted }]} numberOfLines={2}>
            {odometerComparisonHint.text}
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
  compareBlock: {
    marginTop: 10,
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
