import { memo, useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import Theme from '@/constants/Theme';
import { TAB_PRESS_SCALE_ACTIVE, TAB_PRESS_SCALE_REST } from '@/lib/mobileTabNav/constants';
import { PULSE_BOTTOM_TAB_DOCK } from './dockMetrics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PulseBottomTabSlotProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  onPressIn?: () => void;
  badgeCount?: number;
  compact?: boolean;
  icon: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** One tab inside a dock pill. The active highlight is drawn by the bar. */
export const PulseBottomTabSlot = memo(function PulseBottomTabSlot({
  label,
  active,
  onPress,
  onPressIn,
  badgeCount,
  compact,
  icon,
  style,
}: PulseBottomTabSlotProps) {
  const pressSV = useSharedValue(TAB_PRESS_SCALE_REST);
  const activeSV = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    activeSV.value = active ? 1 : 0;
  }, [active, activeSV]);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: activeSV.value * -1 },
      { scale: pressSV.value * (1 + activeSV.value * 0.04) },
    ],
  }));

  const showBadge = (badgeCount ?? 0) > 0;

  return (
    <AnimatedPressable
      style={[styles.slot, style]}
      onPressIn={() => {
        pressSV.value = TAB_PRESS_SCALE_ACTIVE;
        onPressIn?.();
      }}
      onPressOut={() => {
        pressSV.value = TAB_PRESS_SCALE_REST;
      }}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.content, contentStyle]}>
        <View style={styles.iconWrap}>
          {icon}
          {showBadge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {(badgeCount ?? 0) > 9 ? '9+' : badgeCount}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[styles.label, compact && styles.labelCompact, active && styles.labelActive]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {label}
        </Text>
      </Animated.View>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  iconWrap: {
    position: 'relative',
    width: 30,
    height: PULSE_BOTTOM_TAB_DOCK.dockIconHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: Theme.accentGold,
    borderWidth: 1.5,
    borderColor: Theme.dockFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: Theme.brandBlueInk,
    lineHeight: 10,
    textAlign: 'center',
  },
  label: {
    marginTop: PULSE_BOTTOM_TAB_DOCK.dockLabelGap,
    height: PULSE_BOTTOM_TAB_DOCK.labelLineHeight,
    fontSize: PULSE_BOTTOM_TAB_DOCK.labelFontSize,
    lineHeight: PULSE_BOTTOM_TAB_DOCK.labelLineHeight,
    fontWeight: '500',
    color: Theme.dockIconMuted,
    letterSpacing: 0.1,
    textAlign: 'center',
    width: '100%',
  },
  labelCompact: {
    height: PULSE_BOTTOM_TAB_DOCK.labelLineHeightCompact,
    fontSize: PULSE_BOTTOM_TAB_DOCK.labelFontSizeCompact,
    lineHeight: PULSE_BOTTOM_TAB_DOCK.labelLineHeightCompact,
  },
  labelActive: {
    color: Theme.dockIconActive,
    fontWeight: '700',
  },
});
