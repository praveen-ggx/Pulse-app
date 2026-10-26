import { type Href, useRouter } from "expo-router";
import { ChevronRight, Gauge } from "lucide-react-native";
import { useCallback, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Theme from "@/constants/Theme";
import { useDriverThemeColors } from "@/contexts/DriverThemeContext";
import { tripHistoryDetailStyles as td } from "@/features/driver/tripHistory/tripHistoryDetail.styles";
import type { TripRow } from "@/features/trips/services/trips.service";
import { useGPSDistanceEstimate } from "@/features/trips/verification/GPSDistanceHook";
import { VerificationStatusChip } from "@/features/trips/verification/components/VerificationStatusChip";
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
  trailing,
  colors,
}: {
  icon: ReactNode;
  title: string;
  trailing?: ReactNode;
  colors: ReturnType<typeof useDriverThemeColors>;
}) {
  return (
    <View style={td.tdTimelineHeader}>
      <View style={td.tdTimelineHeaderIcon}>{icon}</View>
      <Text style={[td.tdTimelineHeaderTitle, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      {trailing}
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

  const odometerMetrics = [
    { label: "Start", value: formatKm(snapshot.startOdometerKm) },
    { label: "End", value: formatKm(snapshot.endOdometerKm) },
    { label: "Trip", value: formatKm(snapshot.odometerDistanceKm) },
  ];

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
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        onPress={openOdometerCapture}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityLabel="Update odometer reading"
      >
        <View style={styles.odometerTopRow}>
          <VerificationStatusChip state={snapshot.state} compact />
          <View style={styles.odometerAction}>
            <Text style={[td.tdLogMetaV, { color: colors.emerald, fontWeight: "700" }]}>
              Update
            </Text>
            <ChevronRight size={14} color={colors.emerald} strokeWidth={2.4} />
          </View>
        </View>

        <View
          style={[
            td.tdLogDetailsBox,
            styles.metricsBox,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <View style={td.tdLogInTransitGrid}>
            {odometerMetrics.map((metric) => (
              <View key={metric.label} style={td.tdLogInTransitCol}>
                <Text style={[td.tdLogMetaK, { color: colors.textMuted }]}>{metric.label}</Text>
                <Text style={[td.tdLogMetaV, { color: colors.text }]} numberOfLines={1}>
                  {metric.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {odometerComparisonHint ? (
          <Text
            style={[
              styles.odometerCompareHint,
              {
                color: odometerComparisonHint.hasConflict
                  ? Theme.warning
                  : colors.textMuted,
              },
            ]}
            numberOfLines={2}
          >
            {odometerComparisonHint.text}
          </Text>
        ) : (
          <Text style={[td.tdEmptyTimeline, styles.odometerHint, { color: colors.textMuted }]}>
            Tap to enter start and end KM
          </Text>
        )}
      </TouchableOpacity>

      <Text style={[styles.opsHint, { color: colors.textMuted }]}>
        Expense log and reimbursements live on the Settlement tab.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 0,
  },
  metricsBox: {
    marginBottom: 10,
  },
  odometerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  odometerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  odometerHint: {
    marginTop: 10,
    paddingVertical: 0,
  },
  odometerCompareHint: {
    marginTop: 8,
    fontSize: 8,
    fontWeight: "600",
    lineHeight: 11,
    letterSpacing: 0.1,
    textAlign: "center",
  },
  opsHint: {
    marginTop: 12,
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 14,
    paddingHorizontal: 4,
  },
});
