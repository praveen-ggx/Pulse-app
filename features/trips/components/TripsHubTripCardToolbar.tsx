/**
 * Desktop grid footer — e-way bill expiry in place of the sales / due chips.
 */
import Theme from "@/constants/Theme";
import { ewayExpiryTone } from "@/features/trips/services/ewayBillFields.util";
import { Platform, StyleSheet, Text, View } from "react-native";

export type TripsHubTripCardToolbarProps = {
  ewayExpiryLabel?: string | null;
  /** Post-loading trips keep E-LR on the card through later stages. */
  showElr?: boolean;
  dense?: boolean;
};

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap", letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

function splitEwayExpiryLabel(label: string): { kicker: string; detail: string } {
  if (label === "EW-Bill expired") {
    return { kicker: "EW-Bill", detail: "expired" };
  }
  if (label.startsWith("EW-Bill ")) {
    return { kicker: "EW-Bill", detail: label.slice("EW-Bill ".length) };
  }
  return { kicker: "EW-Bill", detail: label };
}

export function TripsHubTripCardToolbar({
  ewayExpiryLabel,
  showElr = false,
}: TripsHubTripCardToolbarProps) {
  const label = (ewayExpiryLabel ?? "").trim();
  if (!label && !showElr) return null;
  const tone = label ? ewayExpiryTone(label) : "ok";
  const split = label ? splitEwayExpiryLabel(label) : null;

  return (
    <View style={styles.wrap} accessibilityLabel={showElr ? "E-LR" : label}>
      {showElr ? (
        <View style={styles.tag}>
          <Text style={[styles.tagKicker, styles.tagTextElr]} numberOfLines={1}>
            E-LR
          </Text>
        </View>
      ) : null}
      {split ? (
        <View style={styles.tag}>
          <Text
            style={[
              styles.tagKicker,
              tone === "ok" && styles.tagTextOk,
              tone === "expired" && styles.tagTextExpired,
            ]}
            numberOfLines={1}
          >
            {split.kicker}
          </Text>
          <Text
            style={[
              styles.tagText,
              tone === "ok" && styles.tagTextOk,
              tone === "expired" && styles.tagTextExpired,
            ]}
            numberOfLines={1}
          >
            {split.detail}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    alignSelf: "center",
    gap: 6,
    backgroundColor: "transparent",
    maxWidth: "100%",
    marginTop: -2,
  },
  tag: {
    alignItems: "flex-end",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 1,
    backgroundColor: "transparent",
    maxWidth: "100%",
  },
  tagKicker: {
    color: Theme.warning,
    fontSize: 8,
    fontWeight: "600",
    lineHeight: 10,
    includeFontPadding: false,
    textAlign: "right",
    ...WEB_COPY,
  },
  tagText: {
    color: Theme.warning,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
    includeFontPadding: false,
    textAlign: "right",
    ...WEB_COPY,
  },
  tagTextOk: {
    color: Theme.positive,
  },
  tagTextExpired: {
    color: Theme.negative,
  },
  tagTextElr: {
    color: Theme.primary,
  },
});
