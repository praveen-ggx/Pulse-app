import { Banknote } from "lucide-react-native";
import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Theme from "@/constants/Theme";

export const DRIVER_EXPENSE_FLOAT_SIZE = 52;
const GAP_ABOVE_SHEET = 12;

const BREATHE_UP = 1.03;
const BREATHE_MS = 2200;

type Props = {
  onPress: () => void;
  /**
   * Bottom-sheet Y from the top of the sheet container (gorhom `animatedPosition`).
   * FAB sits just above the sheet and moves as it snaps / minimizes.
   */
  animatedSheetTop: SharedValue<number>;
  accessibilityHint?: string;
  accessibilityLabel?: string;
};

/**
 * Floating capture-payment control that tracks the top edge of the job-card sheet.
 */
export function DriverExpenseCaptureFab({
  onPress,
  animatedSheetTop,
  accessibilityHint,
  accessibilityLabel = "Capture payment",
}: Props) {
  const insets = useSafeAreaInsets();
  const right = Math.max(insets.right, 16);

  const appear = useSharedValue(0);
  const breathe = useSharedValue(1);
  const press = useSharedValue(1);

  useEffect(() => {
    appear.value = withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
    breathe.value = withRepeat(
      withSequence(
        withTiming(BREATHE_UP, {
          duration: BREATHE_MS,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(1, {
          duration: BREATHE_MS,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(breathe);
      cancelAnimation(appear);
    };
  }, [appear, breathe]);

  const floatStyle = useAnimatedStyle(() => {
    const top =
      animatedSheetTop.value - DRIVER_EXPENSE_FLOAT_SIZE - GAP_ABOVE_SHEET;
    const visible = animatedSheetTop.value > 0 ? 1 : 0;
    return {
      top: Math.max(insets.top + 8, top),
      right,
      opacity: appear.value * visible,
      transform: [
        { scale: appear.value * 0.92 + 0.08 },
        { translateY: (1 - appear.value) * 6 },
      ],
    };
  }, [insets.top, right]);

  const fabMotionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.value * press.value }],
  }));

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, floatStyle]}>
      <Animated.View style={fabMotionStyle}>
        <Pressable
          onPress={onPress}
          onPressIn={() => {
            press.value = withSpring(0.94, { damping: 18, stiffness: 380 });
          }}
          onPressOut={() => {
            press.value = withSpring(1, { damping: 16, stiffness: 280 });
          }}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={
            accessibilityHint ?? "Opens payment capture for your active trip"
          }
          style={[
            styles.fab,
            {
              backgroundColor: Theme.driverPrimary,
              borderColor: "rgba(255,255,255,0.22)",
            },
          ]}
        >
          <View style={styles.iconFrame}>
            <Banknote
              size={22}
              color={Theme.textOnPrimary}
              strokeWidth={2.4}
            />
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    zIndex: 1400,
    elevation: 1400,
  },
  fab: {
    width: DRIVER_EXPENSE_FLOAT_SIZE,
    height: DRIVER_EXPENSE_FLOAT_SIZE,
    borderRadius: DRIVER_EXPENSE_FLOAT_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "visible",
    ...Platform.select({
      ios: {
        shadowColor: Theme.driverEmeraldDark,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.32,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  iconFrame: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
