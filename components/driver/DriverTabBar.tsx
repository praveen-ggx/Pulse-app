import Layout from '@/constants/Layout';
import { withWebSafeShadows } from '@/lib/platformViewStyle.util';
import Theme from '@/constants/Theme';
import Typography from '@/constants/Typography';
import { driverTabMicroLabel } from '@/constants/DriverTypography';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useDriverOperatingModeQuery } from '@/lib/queries/useDriverOperatingModeQuery';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const springBounce = { damping: 14, stiffness: 400 };
const springSettle = { damping: 18, stiffness: 320 };
const DOCK_HEIGHT = Layout.tabBarHeight + 5;

/** Wraps content with a pop-in animation when selected. */
function AnimatedTabIcon({ selected, children }: { selected: boolean; children: React.ReactNode }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (selected) {
      scale.value = withSequence(
        withSpring(1.15, springBounce),
        withSpring(1.05, springSettle),
      );
    } else {
      scale.value = withSpring(1, springSettle);
    }
  }, [selected, scale]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={[animatedStyle, styles.animatedIconWrap]}>
      {children}
    </Animated.View>
  );
}

export const TAB_CONFIG = [
  { name: 'index', label: 'Dashboard', icon: 'crosshairs' as const },
  { name: 'available-loads', label: 'Market', icon: 'shopping-bag' as const },
  { name: 'trip-history', label: 'Trips', icon: 'history' as const },
  { name: 'wallet', label: 'Earnings', icon: 'wallet' as const },
];

export function DriverTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useDriverThemeColors();
  const { isDark } = useDriverTheme();
  const { isDco } = useDriverOperatingModeQuery();
  const focusedRoute = state.routes[state.index];
  const current = focusedRoute?.name;

  // Custom tab bars ignore React Navigation's default tabBarStyle handling.
  // Routes like chat set `tabBarStyle: { display: 'none' }` so the composer
  // can sit on the safe area (phone + iPad + web) without overlapping the dock.
  const focusedTabBarStyle = StyleSheet.flatten(
    focusedRoute ? descriptors[focusedRoute.key]?.options?.tabBarStyle : undefined,
  ) as ViewStyle | undefined;
  if (focusedTabBarStyle?.display === 'none') {
    return null;
  }

  // Matches React Navigation's own default tab-bar-button semantics (see
  // @react-navigation/bottom-tabs' BottomTabBar): always emit `tabPress` --
  // a focused tab's own nested stack listens for this to pop itself back to
  // its root screen on re-tap -- and only call `navigate` when the tab
  // isn't already focused, so re-tapping an already-active tab resets its
  // stack instead of being a no-op.
  const handlePress = (routeName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const routeIndex = state.routes.findIndex((r) => r.name === routeName);
    const route = routeIndex >= 0 ? state.routes[routeIndex] : undefined;
    if (!route) {
      navigation.navigate(routeName as never);
      return;
    }
    const isFocused = state.index === routeIndex;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name as never);
    }
  };

  const footerPadTop = 6;
  const footerPadBottom = Math.max(Math.round(insets.bottom * 0.35), 10);

  const dockSurface = {
    backgroundColor: isDark ? 'rgba(10,10,10,0.95)' : 'rgba(255,255,255,0.96)',
    borderColor: colors.border,
  };

  const renderTab = (tab: (typeof TAB_CONFIG)[number]) => {
    const isActive = current === tab.name;
    const label = tab.name === 'available-loads' && !isDco ? 'Loads' : tab.label;
    return (
      <View key={tab.name} style={styles.dockColumn}>
        <View
          style={[
            styles.activePill,
            isActive && styles.activePillVisible,
            {
              backgroundColor: isDark ? colors.surfaceElevated : colors.whiteMuted,
              borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            },
          ]}
        >
          <View style={[styles.activePillAccent, { backgroundColor: colors.primary }]} />
        </View>

        <TouchableOpacity
          onPress={() => handlePress(tab.name)}
          style={styles.dockButton}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected: isActive }}
          hitSlop={{
            top: Layout.touchTargetHitSlop,
            bottom: Layout.touchTargetHitSlop,
            left: Layout.touchTargetHitSlop,
            right: Layout.touchTargetHitSlop,
          }}
        >
          <AnimatedTabIcon selected={isActive}>
            <FontAwesome5
              name={tab.icon}
              size={16}
              color={isActive ? colors.text : colors.textMuted}
              solid={isActive}
            />
            <Text
              style={[
                styles.dockLabel,
                { color: isActive ? colors.text : colors.textMuted },
                isActive && styles.dockLabelActive,
              ]}
              numberOfLines={1}
            >
              {label.toUpperCase()}
            </Text>
          </AnimatedTabIcon>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View
      style={[
        styles.footerWrap,
        { paddingTop: footerPadTop, paddingBottom: footerPadBottom },
      ]}
    >
      <View style={[styles.glassDock, dockSurface]}>
        {TAB_CONFIG.map(renderTab)}
      </View>
    </View>
  );
}

const styles = withWebSafeShadows(
  StyleSheet.create({
  animatedIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  footerWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    zIndex: 1000,
  },
  glassDock: {
    height: DOCK_HEIGHT,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
    justifyContent: 'space-evenly',
  },
  dockColumn: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  activePill: {
    position: 'absolute',
    top: 2.5,
    left: 2.5,
    right: 2.5,
    bottom: 2.5,
    borderRadius: 18,
    borderTopWidth: 1,
    opacity: 0,
  },
  activePillVisible: {
    opacity: 1,
  },
  activePillAccent: {
    position: 'absolute',
    bottom: 0,
    left: '28%',
    right: '28%',
    height: 3,
    borderRadius: 999,
  },
  dockButton: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Layout.minTouchTargetSize,
  },
  dockLabel: {
    ...Typography.subTabLabel,
    ...driverTabMicroLabel,
    fontSize: 7,
    letterSpacing: 1,
  },
  dockLabelActive: {
    fontWeight: '900',
  },
  }),
);
