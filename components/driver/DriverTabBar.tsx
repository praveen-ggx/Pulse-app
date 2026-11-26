import Layout from '@/constants/Layout';
import { withWebSafeShadows } from '@/lib/platformViewStyle.util';
import Theme from '@/constants/Theme';
import { useDriverOperatingModeQuery } from '@/lib/queries/useDriverOperatingModeQuery';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import {
  History,
  LayoutList,
  Map as MapIcon,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { driverTabBarBottomPad } from './driverTabBarInsets';

const springChip = { damping: 18, stiffness: 320, mass: 0.65 };
/** Dock content height — keep in sync with `Layout.tabBarDockHeight`. */
const DOCK_HEIGHT = 64;

function AnimatedTabScale({
  selected,
  children,
}: {
  selected: boolean;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(selected ? 1 : 0.98);
  useEffect(() => {
    scale.value = withSpring(selected ? 1 : 0.98, springChip);
  }, [selected, scale]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={[styles.animWrap, animatedStyle]}>{children}</Animated.View>;
}

export const TAB_CONFIG: {
  name: string;
  label: string;
  Icon: LucideIcon;
}[] = [
  { name: 'index', label: 'Home', Icon: LayoutList },
  { name: 'available-loads', label: 'Market', Icon: MapIcon },
  { name: 'trip-history', label: 'Trips', Icon: History },
  { name: 'wallet', label: 'Earnings', Icon: Wallet },
];

export function DriverTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { canSeeMarketplace } = useDriverOperatingModeQuery();
  const focusedRoute = state.routes[state.index];
  const current = focusedRoute?.name;

  const focusedTabBarStyle = StyleSheet.flatten(
    focusedRoute ? descriptors[focusedRoute.key]?.options?.tabBarStyle : undefined,
  ) as ViewStyle | undefined;
  if (focusedTabBarStyle?.display === 'none') {
    return null;
  }

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
  const footerPadBottom = driverTabBarBottomPad(insets.bottom);
  const tabs = TAB_CONFIG.filter(
    (tab) => tab.name !== 'available-loads' || canSeeMarketplace,
  );

  return (
    <View
      style={[
        styles.footerWrap,
        { paddingTop: footerPadTop, paddingBottom: footerPadBottom },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.dock} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const isActive = current === tab.name;
          const Icon = tab.Icon;
          return (
            <TouchableOpacity
              key={tab.name}
              onPress={() => handlePress(tab.name)}
              style={styles.tabHit}
              activeOpacity={0.88}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
              hitSlop={{
                top: Layout.touchTargetHitSlop,
                bottom: Layout.touchTargetHitSlop,
                left: 2,
                right: 2,
              }}
            >
              <AnimatedTabScale selected={isActive}>
                <View style={[styles.chip, isActive && styles.chipActive]}>
                  <Icon
                    size={18}
                    color={isActive ? Theme.textOnPrimary : Theme.driverDockIcon}
                    strokeWidth={isActive ? 2.5 : 2.15}
                  />
                  <Text
                    style={[styles.chipLabel, isActive && styles.chipLabelActive]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </View>
              </AnimatedTabScale>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = withWebSafeShadows(
  StyleSheet.create({
    footerWrap: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'transparent',
      paddingHorizontal: 16,
      zIndex: 1000,
      alignItems: 'center',
    },
    dock: {
      height: DOCK_HEIGHT,
      maxWidth: 420,
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: Theme.driverDock,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.28,
      shadowRadius: 20,
      elevation: 14,
    },
    tabHit: {
      flex: 1,
      minWidth: 0,
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Layout.minTouchTargetSize,
    },
    animWrap: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chip: {
      width: '100%',
      maxWidth: 112,
      minHeight: 48,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 999,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    chipActive: {
      backgroundColor: Theme.driverPrimary,
      shadowColor: Theme.driverEmeraldDark,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.28,
      shadowRadius: 6,
      elevation: 2,
    },
    chipLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.78)',
      letterSpacing: 0.15,
      textAlign: 'center',
    },
    chipLabelActive: {
      color: Theme.textOnPrimary,
      fontWeight: '800',
    },
  }),
);
