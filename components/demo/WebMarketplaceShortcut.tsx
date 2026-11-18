/**
 * Desktop header shortcut. Marketplace and Invoice sit beside Chat, outside the nav group.
 * Both pills share one compact size. The open page is the ink pill with a gold icon.
 */
import { WEB_TOP_NAV_ICON } from "@/components/demo/webTopNavIcon.tokens";
import Theme from "@/constants/Theme";
import { FileText, Truck, type LucideIcon } from "lucide-react-native";
import { useEffect } from "react";
import { Platform, Pressable, StyleSheet } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const MOTION = { duration: 220, easing: Easing.out(Easing.cubic) } as const;

type Props = {
  active: boolean;
  onPress: () => void;
  onPressIn?: () => void;
};

type ShortcutProps = Props & {
  label: string;
  Icon: LucideIcon;
};

function WebHeaderShortcut({ active, onPress, onPressIn, label, Icon }: ShortcutProps) {
  const progress = useSharedValue(active ? 1 : 0);
  const pressed = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, MOTION);
  }, [active, progress]);

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [Theme.cardWhite, Theme.buttonDark],
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [Theme.borderMedium, Theme.buttonDark],
    ),
    transform: [{ scale: 1 - pressed.value * 0.015 }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [WEB_TOP_NAV_ICON.active, Theme.buttonDarkText],
    ),
  }));

  const wellStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [Theme.brandBlueSoft, Theme.accentGold],
    ),
  }));

  const iconColor = active ? Theme.brandBlueInk : WEB_TOP_NAV_ICON.muted;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 80 });
        onPressIn?.();
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: 140 });
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={styles.hit}
    >
      <Animated.View style={[styles.pill, pillStyle]}>
        <Animated.View style={[styles.iconWell, wellStyle]}>
          <Icon size={13} color={iconColor} strokeWidth={2.15} />
        </Animated.View>
        <Animated.Text style={[styles.title, titleStyle]} numberOfLines={1}>
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export function WebMarketplaceShortcut(props: Props) {
  return <WebHeaderShortcut {...props} label="Marketplace" Icon={Truck} />;
}

export function WebInvoiceShortcut(props: Props) {
  return <WebHeaderShortcut {...props} label="Invoice" Icon={FileText} />;
}

const styles = StyleSheet.create({
  hit: {
    flexShrink: 0,
    ...Platform.select({ web: { cursor: "pointer" as const } }),
  },
  pill: {
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    paddingLeft: 4,
    paddingRight: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconWell: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 12.5,
    fontWeight: "600",
    letterSpacing: -0.1,
    lineHeight: 16,
    ...(Platform.OS === "web" ? { whiteSpace: "nowrap" as const } : null),
  },
});
