/**
 * Finance party add FAB.
 *
 * Renders the page-matching party chip (customer / supplier / vehicle / driver).
 * Desktop/web: compact icon + plus until hover, then the label slides open.
 * Mobile: same compact icon + plus; press expands the label, release collapses.
 */
import {
  PartyAddChip,
  type PartyAddChipIcon,
  type PartyAddChipTone,
} from "@/components/PartyAddChip";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useGlobalFabAnimation } from "@/lib/hooks/useGlobalFabAnimation";
import { pe } from "@/lib/platformViewStyle.util";
import * as Haptics from "expo-haptics";
import { Plus, X } from "lucide-react-native";
import { memo, useCallback, useEffect, useState } from "react";
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const DESKTOP_MIN_WIDTH = 768;
const ACTION_STAGGER_MS = 45;
const motion = { duration: 220, easing: Easing.out(Easing.cubic) };

export type PartySpeedDialActionId =
  | "customers"
  | "suppliers"
  | "garage"
  | "drivers";

export type PartySpeedDialAction = {
  id: PartySpeedDialActionId;
  label: string;
  icon: PartyAddChipIcon;
  onPress: () => void;
  accessibilityLabel?: string;
};

export type PartySpeedDialFabProps = {
  actions: readonly PartySpeedDialAction[];
  bottom: number;
  addPartyLabel: string;
  closeLabel: string;
  /** Match driver charcoal/lime dock on Earnings. Default brand (finance). */
  tone?: PartyAddChipTone;
};

function triggerHapticMedium() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function SpeedDialActionRow({
  action,
  indexFromFab,
  open,
  onPress,
  tone,
}: {
  action: PartySpeedDialAction;
  indexFromFab: number;
  open: boolean;
  onPress: () => void;
  tone: PartyAddChipTone;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = open
      ? withDelay(indexFromFab * ACTION_STAGGER_MS, withTiming(1, motion))
      : withTiming(0, { duration: 140, easing: Easing.in(Easing.cubic) });
  }, [indexFromFab, open, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [10, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.92, 1]) },
    ],
  }));

  return (
    <Animated.View
      style={[styles.actionRow, style, pe(open ? "auto" : "none")]}
      pointerEvents={open ? "auto" : "none"}
    >
      <PartyAddChip
        label={action.label}
        icon={action.icon}
        onPress={onPress}
        accessibilityLabel={action.accessibilityLabel ?? action.label}
        align="end"
        tone={tone}
        testID={`party-speed-dial-action-${action.id}`}
      />
    </Animated.View>
  );
}

export const PartySpeedDialFab = memo(function PartySpeedDialFab({
  actions,
  bottom,
  addPartyLabel,
  closeLabel,
  tone = "brand",
}: PartySpeedDialFabProps) {
  const isDriver = tone === "driver";
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= DESKTOP_MIN_WIDTH;
  const canHoverExpand = isDesktop && Platform.OS === "web";
  const { shellStyle, ringStyle } = useGlobalFabAnimation();
  const [open, setOpen] = useState(false);
  const plusProgress = useSharedValue(0);

  const setMenuOpen = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  useEffect(() => {
    plusProgress.value = withTiming(open ? 1 : 0, motion);
  }, [open, plusProgress]);

  useEffect(() => {
    if (!open || canHoverExpand) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setMenuOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [canHoverExpand, open, setMenuOpen]);

  const toggleMobileMenu = useCallback(() => {
    triggerHapticMedium();
    setMenuOpen(!open);
  }, [open, setMenuOpen]);

  const handleActionPress = useCallback(
    (action: PartySpeedDialAction) => {
      setMenuOpen(false);
      action.onPress();
    },
    [setMenuOpen],
  );

  const plusStyle = useAnimatedStyle(() => ({
    opacity: interpolate(plusProgress.value, [0, 1], [1, 0]),
    transform: [
      { rotate: `${interpolate(plusProgress.value, [0, 1], [0, 90])}deg` },
      { scale: interpolate(plusProgress.value, [0, 1], [1, 0.6]) },
    ],
  }));

  const closeStyle = useAnimatedStyle(() => ({
    opacity: plusProgress.value,
    transform: [
      { rotate: `${interpolate(plusProgress.value, [0, 1], [-90, 0])}deg` },
      { scale: interpolate(plusProgress.value, [0, 1], [0.6, 1]) },
    ],
  }));

  if (actions.length === 0) return null;

  if (actions.length === 1 || canHoverExpand) {
    return (
      <View
        testID="party-speed-dial"
        style={[styles.desktopAnchor, { bottom, right: Layout.fabRightOffset }]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[styles.desktopStack, shellStyle]}
          pointerEvents="box-none"
        >
          {[...actions].reverse().map((action) => (
            <PartyAddChip
              key={action.id}
              label={action.label}
              icon={action.icon}
              onPress={action.onPress}
              accessibilityLabel={action.accessibilityLabel ?? action.label}
              expandOnHover
              collapsedGlyph="icon"
              tone={tone}
              align="end"
              testID={`party-speed-dial-action-${action.id}`}
            />
          ))}
        </Animated.View>
      </View>
    );
  }

  const fabSize = isDriver ? 58 : Layout.minTouchTargetSize + 8;
  const fabInk = isDriver ? Theme.driverPrimary : Theme.brandBlueInk;

  return (
    <View
      testID="party-speed-dial"
      style={[styles.mobileOverlay, pe("box-none")]}
      pointerEvents="box-none"
    >
      {open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={() => setMenuOpen(false)}
          style={styles.scrim}
        />
      ) : null}
      <View
        style={[styles.mobileAnchor, { bottom, right: Layout.fabRightOffset }]}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.actionsFlyout,
            { bottom: fabSize + 10 },
            pe(open ? "box-none" : "none"),
          ]}
          pointerEvents={open ? "box-none" : "none"}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? "auto" : "no-hide-descendants"}
        >
          {[...actions].reverse().map((action, visualIndex) => {
            const indexFromFab = actions.length - 1 - visualIndex;
            return (
              <SpeedDialActionRow
                key={action.id}
                action={action}
                indexFromFab={indexFromFab}
                open={open}
                onPress={() => handleActionPress(action)}
                tone={tone}
              />
            );
          })}
        </View>
        <Animated.View style={[styles.fabShell, shellStyle]}>
          {isDriver ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.fabDriverHalo,
                {
                  width: fabSize + 16,
                  height: fabSize + 16,
                  borderRadius: (fabSize + 16) / 2,
                },
                ringStyle,
              ]}
            />
          ) : null}
          <AnimatedPressable
            testID="party-speed-dial-toggle"
            onPress={toggleMobileMenu}
            accessibilityRole="button"
            accessibilityLabel={open ? closeLabel : addPartyLabel}
            accessibilityState={{ expanded: open }}
            style={({ pressed }) => [
              styles.fabButton,
              isDriver && styles.fabButtonDriver,
              {
                width: fabSize,
                height: fabSize,
                borderRadius: fabSize / 2,
              },
              pressed && styles.fabPressed,
            ]}
          >
            <Animated.View style={[styles.fabGlyph, plusStyle]}>
              <Plus size={22} color={fabInk} strokeWidth={2.6} />
            </Animated.View>
            <Animated.View style={[styles.fabGlyph, closeStyle]}>
              <X size={20} color={fabInk} strokeWidth={2.6} />
            </Animated.View>
          </AnimatedPressable>
        </Animated.View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  desktopAnchor: {
    position: "absolute",
    zIndex: 100,
    elevation: 10,
  },
  desktopStack: {
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 10,
    overflow: "visible",
  },
  mobileOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 12,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Theme.overlayBackdrop,
  },
  mobileAnchor: {
    position: "absolute",
    zIndex: 101,
    alignItems: "flex-end",
  },
  actionsFlyout: {
    position: "absolute",
    right: 0,
    alignItems: "flex-end",
    gap: 10,
  },
  actionRow: {
    alignItems: "flex-end",
  },
  fabShell: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  fabDriverHalo: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(198,240,53,0.55)",
    backgroundColor: "transparent",
  },
  fabButton: {
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: Theme.brandBlueRing,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        boxShadow:
          "0 2px 6px rgba(77, 54, 54, 0.1), 0 8px 20px rgba(77, 54, 54, 0.1)",
        cursor: "pointer",
      } as object,
      default: {
        shadowColor: Theme.darkBackground,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.16,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  fabButtonDriver: {
    backgroundColor: Theme.driverDock,
    borderColor: "rgba(255,255,255,0.12)",
    ...Platform.select({
      web: {
        boxShadow:
          "0 4px 14px rgba(0, 0, 0, 0.28), 0 10px 28px rgba(0, 0, 0, 0.18)",
        cursor: "pointer",
      } as object,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 16,
        elevation: 10,
      },
    }),
  },
  fabPressed: {
    opacity: 0.92,
  },
  fabGlyph: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
