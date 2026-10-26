/**
 * Illustrated empty state for Give/Get Load left-rail find panels.
 */
import Theme from "@/constants/Theme";
import {
  fitNetworkLoadsIllustration,
} from "@/lib/networkLoadsQuickCardsAssets";
import Illustration4 from "@/assets/illustrations/4.svg";
import Illustration20 from "@/assets/illustrations/20.svg";
import { StyleSheet, Text, View } from "react-native";

const ILLUS_BOX_W = 132;
const ILLUS_BOX_H = 96;

type Props = {
  /** give → No vehicle found · get → No load found */
  mode: "give" | "get";
  /** Skip card chrome when nested inside an existing sidebar card. */
  plain?: boolean;
};

export function LoadCenterSidebarFindEmpty({ mode, plain = false }: Props) {
  const isGet = mode === "get";
  const Illustration = isGet ? Illustration20 : Illustration4;
  const aspect = isGet ? 600 / 480 : 600 / 463;
  const size = fitNetworkLoadsIllustration(ILLUS_BOX_W, ILLUS_BOX_H, aspect);
  const label = isGet ? "No load found" : "No vehicle found";

  return (
    <View
      style={[styles.panel, plain && styles.panelPlain]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <View style={styles.art}>
        <Illustration width={size.width} height={size.height} />
      </View>
      <Text style={styles.title}>{label}</Text>
      <Text style={styles.sub} numberOfLines={2}>
        {isGet
          ? "Sponsored Pulse Boost loads will show here."
          : "Try Find vehicles to search idle capacity."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 18,
    borderRadius: 14,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    gap: 8,
  },
  panelPlain: {
    minHeight: 140,
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  art: {
    width: ILLUS_BOX_W,
    height: ILLUS_BOX_H,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    letterSpacing: 0.1,
  },
  sub: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 15,
    maxWidth: 200,
  },
});
