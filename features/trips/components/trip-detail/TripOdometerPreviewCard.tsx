import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import Theme from "@/constants/Theme";
import type { TripRow } from "@/features/trips/services/trips.service";
import { useGPSDistanceEstimate } from "@/features/trips/verification/GPSDistanceHook";
import { VerificationStatusChip } from "@/features/trips/verification/VerificationStatusChip";
import { useTripVerification } from "@/features/trips/verification/queries/useTripVerification";
import {
  computeDistanceDiscrepancy,
  computeOdometerDistance,
  deriveVerificationState,
} from "@/features/trips/verification/verification.service";
import { formatKm } from "@/features/trips/verification/selectors/verificationSelectors";
import { queryKeys } from "@/lib/queryKeys";

type Props = {
  trip: TripRow;
  onRecordStart: () => void;
  onRecordEnd: () => void;
  /** Tighter card when nested under trip detail tabs. */
  compact?: boolean;
  /** Desktop trip detail — larger type/touch targets than mobile compact. */
  density?: "compact" | "comfortable";
  /** Stretch to the sibling card height in the 50/50 Expense Hub grid. */
  fillHeight?: boolean;
};

function odometerReading(km: number | null): string {
  if (km == null || !Number.isFinite(Number(km))) return "—";
  return Number(km).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export const TripOdometerPreviewCard = memo(function TripOdometerPreviewCard({
  trip,
  onRecordStart,
  onRecordEnd,
  compact = false,
  density = "compact",
  fillHeight = false,
}: Props) {
  const qc = useQueryClient();
  const verificationQuery = useTripVerification(trip.id);
  const gpsEstimate = useGPSDistanceEstimate(trip);
  const comfortable = density === "comfortable";

  useFocusEffect(
    useCallback(() => {
      void qc.invalidateQueries({ queryKey: queryKeys.trips.verification(trip.id) });
    }, [qc, trip.id]),
  );

  const metrics = useMemo(() => {
    const snap = verificationQuery.data;
    const startKm = snap?.startOdometerKm ?? trip.start_odometer_km ?? null;
    const endKm = snap?.endOdometerKm ?? trip.end_odometer_km ?? null;
    const odometerDistanceKm =
      snap?.odometerDistanceKm ??
      trip.odometer_distance_km ??
      computeOdometerDistance(startKm, endKm);
    const gpsDistanceKm = snap?.gpsDistanceKm ?? trip.gps_distance_km ?? gpsEstimate;
    const distanceDiscrepancyKm =
      snap?.distanceDiscrepancyKm ??
      trip.distance_discrepancy_km ??
      computeDistanceDiscrepancy(odometerDistanceKm, gpsDistanceKm);
    const state = deriveVerificationState({
      start_odometer_km: startKm,
      end_odometer_km: endKm,
      gps_distance_km: gpsDistanceKm,
      distance_discrepancy_km: distanceDiscrepancyKm,
      odometer_verification_state: trip.odometer_verification_state,
    });

    return {
      startKm,
      endKm,
      odometerDistanceKm,
      gpsDistanceKm,
      distanceDiscrepancyKm,
      state,
    };
  }, [gpsEstimate, trip, verificationQuery.data]);

  const hasWarn =
    metrics.distanceDiscrepancyKm != null && metrics.distanceDiscrepancyKm >= 10;
  const loading = verificationQuery.isLoading && !verificationQuery.data;
  const distanceLine =
    metrics.odometerDistanceKm != null
      ? `${formatKm(metrics.odometerDistanceKm)} trip`
      : metrics.gpsDistanceKm != null
        ? `${formatKm(metrics.gpsDistanceKm)} GPS`
        : "Record start & end";

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        comfortable && styles.cardComfortable,
        fillHeight && styles.cardFill,
      ]}
    >
      <View
        style={[
          styles.header,
          compact && styles.headerCompact,
          comfortable && styles.headerComfortable,
        ]}
      >
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.iconWrap,
              compact && styles.iconWrapCompact,
              comfortable && styles.iconWrapComfortable,
            ]}
          >
            <Feather
              name="navigation"
              size={comfortable ? 15 : compact ? 12 : 12}
              color={Theme.primary}
            />
          </View>
          <Text
            style={[
              styles.title,
              compact && styles.titleCompact,
              comfortable && styles.titleComfortable,
            ]}
          >
            Odometer
          </Text>
        </View>
        <VerificationStatusChip
          state={metrics.state}
          compact={!comfortable}
        />
      </View>

      <View
        style={[
          compact ? styles.compactBody : undefined,
          comfortable && styles.compactBodyComfortable,
        ]}
      >
      <View
        style={[
          styles.readingsRow,
          compact && styles.readingsRowCompact,
          comfortable && styles.readingsRowComfortable,
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.readingCell,
            compact && styles.readingCellCompact,
            comfortable && styles.readingCellComfortable,
            pressed && styles.readingCellPressed,
          ]}
          onPress={onRecordStart}
          accessibilityRole="button"
          accessibilityLabel="Record start odometer"
        >
          <Text
            style={[
              styles.readingLabel,
              compact && styles.readingLabelCompact,
              comfortable && styles.readingLabelComfortable,
            ]}
          >
            Start
          </Text>
          <Text
            style={[
              styles.readingValue,
              compact && styles.readingValueCompact,
              comfortable && styles.readingValueComfortable,
            ]}
          >
            {odometerReading(metrics.startKm)}
          </Text>
          {(compact || comfortable) && metrics.startKm == null ? (
            <Text style={[styles.tapHint, comfortable && styles.tapHintComfortable]}>
              Tap to set
            </Text>
          ) : null}
        </Pressable>
        <View style={styles.readingSep} />
        {comfortable ? (
          <View style={[styles.readingCell, styles.readingMidComfortable]}>
            <Text style={[styles.readingLabel, styles.readingLabelComfortable]}>
              Distance
            </Text>
            <Text style={[styles.readingValue, styles.readingValueComfortable]}>
              {metrics.odometerDistanceKm != null
                ? formatKm(metrics.odometerDistanceKm)
                : "—"}
            </Text>
          </View>
        ) : compact ? (
          <View style={styles.readingMid}>
            <Feather name="chevrons-right" size={10} color={Theme.textMuted} />
          </View>
        ) : null}
        {compact || comfortable ? <View style={styles.readingSep} /> : null}
        <Pressable
          style={({ pressed }) => [
            styles.readingCell,
            compact && styles.readingCellCompact,
            comfortable && styles.readingCellComfortable,
            pressed && styles.readingCellPressed,
          ]}
          onPress={onRecordEnd}
          accessibilityRole="button"
          accessibilityLabel="Record end odometer"
        >
          <Text
            style={[
              styles.readingLabel,
              compact && styles.readingLabelCompact,
              comfortable && styles.readingLabelComfortable,
            ]}
          >
            End
          </Text>
          <Text
            style={[
              styles.readingValue,
              compact && styles.readingValueCompact,
              comfortable && styles.readingValueComfortable,
            ]}
          >
            {odometerReading(metrics.endKm)}
          </Text>
          {(compact || comfortable) && metrics.endKm == null ? (
            <Text style={[styles.tapHint, comfortable && styles.tapHintComfortable]}>
              Tap to set
            </Text>
          ) : null}
        </Pressable>
      </View>

      <View style={[styles.footer, comfortable && styles.footerComfortable]}>
        {loading ? (
          <ActivityIndicator size="small" color={Theme.primary} />
        ) : (
          <View
            style={[
              styles.footerIcon,
              comfortable && styles.footerIconComfortable,
              hasWarn && styles.footerIconWarn,
            ]}
          >
            <Feather
              name={hasWarn ? "alert-circle" : "activity"}
              size={comfortable ? 14 : 10}
              color={hasWarn ? Theme.warning : Theme.primary}
            />
          </View>
        )}
        <Text
          style={[
            styles.meta,
            compact && styles.metaCompact,
            comfortable && styles.metaComfortable,
            hasWarn && styles.metaWarn,
          ]}
          numberOfLines={1}
        >
          {loading
            ? "Syncing readings…"
            : hasWarn
              ? `${distanceLine} · Δ ${formatKm(metrics.distanceDiscrepancyKm)}`
              : distanceLine}
        </Text>
      </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 14,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
      },
      android: { elevation: 2 },
      default: { boxShadow: "0 8px 24px rgba(15,23,42,0.06)" } as object,
    }),
  },
  cardCompact: {
    marginBottom: 0,
    borderColor: Theme.borderLight,
    borderRadius: 14,
    padding: 10,
    gap: 8,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  headerCompact: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 8,
    backgroundColor: "transparent",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  titleCompact: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "none",
    letterSpacing: -0.15,
    color: Theme.textPrimaryDark,
  },
  iconWrapCompact: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: Theme.brandBlueSoft,
  },
  readingsRow: {
    flexDirection: "row",
    borderWidth: 0,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  readingsRowCompact: {
    marginHorizontal: 0,
    marginTop: 0,
    backgroundColor: Theme.surface,
    borderWidth: 0,
    borderRadius: 12,
  },
  compactBody: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    gap: 8,
  },
  readingMid: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  readingCellPressed: {
    backgroundColor: Theme.brandBlueWashSubtle,
  },
  tapHint: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.primary,
    marginTop: 1,
  },
  readingCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "flex-start",
    gap: 3,
    minHeight: 52,
    justifyContent: "center",
  },
  readingCellCompact: {
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "flex-start",
  },
  readingSep: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderMedium,
    alignSelf: "stretch",
    marginVertical: 8,
  },
  readingLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  readingLabelCompact: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    lineHeight: 12,
    color: Theme.textMuted,
  },
  readingValue: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.2,
  },
  readingValueCompact: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  footerIcon: {
    width: 20,
    height: 20,
    borderRadius: 7,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  footerIconWarn: {
    backgroundColor: "#fffbeb",
  },
  meta: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  metaCompact: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
    color: Theme.textMutedDemo,
  },
  metaWarn: {
    color: Theme.warning,
    fontWeight: "600",
  },
  cardComfortable: {
    marginBottom: 0,
    borderRadius: 16,
    width: "100%",
    padding: 14,
    gap: 12,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  cardFill: {
    flex: 1,
    alignSelf: "stretch",
    height: "100%",
    justifyContent: "space-between",
  },
  headerComfortable: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 10,
    backgroundColor: "transparent",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  iconWrapComfortable: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.brandBlueSoft,
  },
  titleComfortable: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
    textTransform: "none",
    color: Theme.textPrimaryDark,
  },
  compactBodyComfortable: {
    paddingBottom: 0,
    gap: 10,
  },
  readingsRowComfortable: {
    marginHorizontal: 0,
    marginTop: 0,
    borderRadius: 14,
    borderWidth: 0,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  readingCellComfortable: {
    minHeight: 72,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 4,
    alignItems: "flex-start",
  },
  readingLabelComfortable: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    lineHeight: 14,
    color: Theme.textMuted,
  },
  readingValueComfortable: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 26,
    letterSpacing: -0.4,
    color: Theme.textPrimaryDark,
  },
  tapHintComfortable: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  readingMidComfortable: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "transparent",
    paddingHorizontal: 12,
  },
  footerComfortable: {
    gap: 8,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  footerIconComfortable: {
    width: 24,
    height: 24,
    borderRadius: 8,
  },
  metaComfortable: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
});
