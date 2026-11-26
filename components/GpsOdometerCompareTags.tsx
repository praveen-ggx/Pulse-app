/**
 * Compact GPS vs odometer tags for driver job / history cards.
 * Keeps sources labeled so planned / odo / GPS never conflate into one number.
 */
import Theme from "@/constants/Theme";
import type { GpsOdometerCompareModel } from "@/features/drivers/utils/driverDisplayDistance.util";
import { AlertTriangle, Gauge, Navigation } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

function fmt(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "—";
  return `${Math.round(km).toLocaleString("en-IN")} km`;
}

type Props = {
  model: GpsOdometerCompareModel;
  /** Planned-only fallback when compare isn't available (offer cards). */
  plannedLabel?: string | null;
};

export function GpsOdometerCompareTags({ model, plannedLabel }: Props) {
  if (!model.canCompare) {
    if (plannedLabel && plannedLabel !== "—") {
      return (
        <View style={styles.row}>
          <View style={[styles.tag, styles.tagMuted]}>
            <Text style={styles.tagMutedText} numberOfLines={1}>
              {plannedLabel}
            </Text>
          </View>
        </View>
      );
    }
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.tag, styles.tagOdo]}>
          <Gauge size={10} color={Theme.textPrimaryDark} strokeWidth={2.3} />
          <Text style={styles.tagOdoText} numberOfLines={1}>
            Odo {fmt(model.odometerKm)}
          </Text>
        </View>
        <View style={[styles.tag, styles.tagGps]}>
          <Navigation size={10} color={Theme.primary} strokeWidth={2.3} />
          <Text style={styles.tagGpsText} numberOfLines={1}>
            GPS {fmt(model.gpsKm)}
          </Text>
        </View>
        {model.discrepancyKm != null ? (
          <View
            style={[
              styles.tag,
              model.hasConflict ? styles.tagDiffWarn : styles.tagDiff,
            ]}
          >
            {model.hasConflict ? (
              <AlertTriangle size={10} color={Theme.warning} strokeWidth={2.3} />
            ) : null}
            <Text
              style={[
                styles.tagDiffText,
                model.hasConflict && styles.tagDiffTextWarn,
              ]}
              numberOfLines={1}
            >
              Δ {fmt(model.discrepancyKm)}
            </Text>
          </View>
        ) : null}
      </View>
      {model.hasConflict && model.alertText ? (
        <Text style={styles.alert} numberOfLines={2}>
          {model.alertText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    maxWidth: "100%",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
  },
  tagMuted: {
    backgroundColor: "rgba(15, 23, 42, 0.06)",
    borderColor: "transparent",
  },
  tagMutedText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  tagOdo: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderMedium,
  },
  tagOdoText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  tagGps: {
    backgroundColor: Theme.brandBlueSoft,
    borderColor: Theme.brandBlueRing,
  },
  tagGpsText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
    fontVariant: ["tabular-nums"],
  },
  tagDiff: {
    backgroundColor: Theme.cardWhite,
    borderColor: Theme.borderMedium,
  },
  tagDiffWarn: {
    backgroundColor: Theme.warningMuted,
    borderColor: "rgba(180, 83, 9, 0.35)",
  },
  tagDiffText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  tagDiffTextWarn: {
    color: Theme.warning,
  },
  alert: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.warning,
    lineHeight: 13,
  },
});
