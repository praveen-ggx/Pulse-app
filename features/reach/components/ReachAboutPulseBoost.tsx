/**
 * What Pulse Boost does — live commercial explainer.
 */
import Theme from "@/constants/Theme";
import { Eye, Gavel, Globe2, Radio, Rocket, Route, Truck, X } from "lucide-react-native";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CHANNELS = [
  { Icon: Globe2, label: "Pulse Network" },
  { Icon: Radio, label: "Outside network" },
  { Icon: Truck, label: "Pilot / DCO" },
] as const;

const POINTS = [
  {
    Icon: Globe2,
    kicker: "01",
    title: "Reach across Pulse",
    body: "Sponsored story to people on Pulse — your Network and outside it.",
  },
  {
    Icon: Truck,
    kicker: "02",
    title: "Direct drivers",
    body: "Pulse Pilot / DCO see the same ad and can move the load.",
  },
  {
    Icon: Gavel,
    kicker: "03",
    title: "More bids",
    body: "More participation on this lane — dedicated bids, not a generic inbox.",
  },
  {
    Icon: Eye,
    kicker: "04",
    title: "Brand on air",
    body: "Fleets see your company on the sponsored story while you look for a truck.",
  },
] as const;

function LiveDot() {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={styles.liveDotWrap}>
      <Animated.View style={[styles.liveDotRing, { opacity: pulse, transform: [{ scale: pulse }] }]} />
      <View style={styles.liveDotCore} />
    </View>
  );
}

type ReachAboutPulseBoostProps = {
  visible: boolean;
  onClose: () => void;
};

export function ReachAboutPulseBoost({ visible, onClose }: ReachAboutPulseBoostProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const ticker = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    ticker.setValue(0);
    const loop = Animated.loop(
      Animated.timing(ticker, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [ticker, visible]);

  const tickerX = ticker.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -160],
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" />
        <View
          style={[
            styles.sheet,
            {
              width: Math.min(560, width - 24),
              marginTop: insets.top + 12,
              marginBottom: insets.bottom + 12,
            },
          ]}
        >
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={styles.onAir}>
                <LiveDot />
                <Text style={styles.onAirText}>On air</Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={16} color={Theme.textOnPrimary} />
              </Pressable>
            </View>
            <View style={styles.heroBrand}>
              <Rocket size={18} color={Theme.accentGold} />
              <Text style={styles.heroKicker}>Pulse Boost</Text>
            </View>
            <Text style={styles.heroTitle}>Your story, as a live sponsored ad</Text>
            <Text style={styles.heroLead}>
              Reach more people on Pulse and more drivers. Build bids on your route — and brand
              while the ad is running.
            </Text>
            <View style={styles.tickerClip}>
              <Animated.View style={[styles.tickerRow, { transform: [{ translateX: tickerX }] }]}>
                {[...CHANNELS, ...CHANNELS].map((ch, i) => (
                  <View key={`${ch.label}-${i}`} style={styles.tickerChip}>
                    <ch.Icon size={11} color={Theme.accentGold} />
                    <Text style={styles.tickerText}>{ch.label}</Text>
                  </View>
                ))}
              </Animated.View>
            </View>
          </View>

          <View style={styles.grid}>
            {POINTS.map((point) => (
              <View key={point.title} style={styles.tile}>
                <View style={styles.tileHead}>
                  <View style={styles.iconWrap}>
                    <point.Icon size={15} color={Theme.primary} strokeWidth={2.3} />
                  </View>
                  <Text style={styles.tileKicker}>{point.kicker}</Text>
                </View>
                <Text style={styles.tileTitle}>{point.title}</Text>
                <Text style={styles.tileBody}>{point.body}</Text>
              </View>
            ))}
          </View>

          <View style={styles.routeCard}>
            <View style={styles.routeIcon}>
              <Route size={16} color={Theme.textOnPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.routeKicker}>Dedicated bids</Text>
              <Text style={styles.routeText}>
                Every bid is for the pickup–drop you boosted — the lane you posted, only.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sheet: {
    maxWidth: 560,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    overflow: "hidden",
  },
  hero: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 10,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  onAir: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.driverOverlay,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  onAirText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textOnPrimary,
  },
  liveDotWrap: { width: 12, height: 12, alignItems: "center", justifyContent: "center" },
  liveDotRing: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Theme.accentGoldMuted,
  },
  liveDotCore: { width: 7, height: 7, borderRadius: 4, backgroundColor: Theme.accentGold },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.driverOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBrand: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroKicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.accentGold,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  heroLead: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textOnPrimary,
    opacity: 0.88,
    lineHeight: 18,
  },
  tickerClip: { overflow: "hidden", marginTop: 2 },
  tickerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tickerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: Theme.driverOverlay,
  },
  tickerText: { fontSize: 11, fontWeight: "700", color: Theme.textOnPrimary },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 8,
  },
  tile: {
    width: "48%",
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    padding: 12,
    gap: 6,
  },
  tileHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  tileKicker: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.4,
  },
  tileTitle: { fontSize: 14, fontWeight: "800", color: Theme.actionBtnInk },
  tileBody: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary, lineHeight: 16 },
  routeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 14,
    backgroundColor: Theme.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  routeIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Theme.driverOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  routeKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.accentGold,
  },
  routeText: { fontSize: 12, fontWeight: "600", color: Theme.textOnPrimary, lineHeight: 16, marginTop: 2 },
});
