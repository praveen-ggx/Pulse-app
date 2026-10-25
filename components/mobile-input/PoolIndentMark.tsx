import Theme from "@/constants/Theme";
import { Layers } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

/** Stacked-lane mark for a Network pool indent — not party initials. */
export function PoolIndentMark({ size = 64 }: { size?: number }) {
  const icon = Math.round(size * 0.42);
  return (
    <View
      accessibilityLabel="Network pool"
      style={[
        styles.plate,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <View style={[styles.fan, { width: size * 0.62, height: size * 0.42 }]}>
        <View style={[styles.card, styles.cardBack]} />
        <View style={[styles.card, styles.cardMid]} />
        <View style={[styles.card, styles.cardFront]} />
      </View>
      <View style={styles.iconLift}>
        <Layers size={icon} color={Theme.primary} strokeWidth={2.2} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.brandBlue,
    overflow: "hidden",
  },
  fan: {
    position: "absolute",
    bottom: "18%",
  },
  card: {
    position: "absolute",
    left: "8%",
    right: "8%",
    height: "42%",
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.brandBlueInk,
  },
  cardBack: {
    top: "0%",
    transform: [{ rotate: "-14deg" }],
    backgroundColor: Theme.brandBlue,
    opacity: 0.7,
  },
  cardMid: {
    top: "18%",
    transform: [{ rotate: "10deg" }],
    backgroundColor: Theme.cardWhite,
    opacity: 0.9,
  },
  cardFront: {
    top: "36%",
    backgroundColor: Theme.actionAccent,
  },
  iconLift: {
    zIndex: 1,
  },
});
