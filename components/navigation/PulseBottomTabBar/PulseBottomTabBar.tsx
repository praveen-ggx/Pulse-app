/**
 * Mobile bottom navigation — solid dark floating dock. Main tabs share one
 * pill with a sliding highlight; Marketplace and Chat each sit in their own pill.
 * Each slot follows the same member access as the desktop top nav.
 */
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  DollarSign,
  Home,
  MessageSquare,
  ShieldCheck,
  Signpost,
  Store,
  type LucideIcon,
} from 'lucide-react-native';

import type { DemoTabId, DemoTabVisibility } from '@/components/demo/DemoTabBar';
import Theme from '@/constants/Theme';
import { pe } from '@/lib/platformViewStyle.util';
import { preloadPulseLoadsRoute, preloadTabScreen } from '@/lib/preloadRoutes';
import type { PreloadableTab } from '@/lib/preloadRoutes';

import { PULSE_BOTTOM_TAB_DOCK, pulseTabBarBodyHeight } from './dockMetrics';
import { PulseBottomTabSlot } from './PulseBottomTabSlot';

export type PulseBottomTabBarProps = {
  activeTab: DemoTabId;
  /** Per-domain tab visibility (functional member roles). Omitted → all visible. */
  visibility?: DemoTabVisibility;
  isChatRoute: boolean;
  /** `sales.chat` grant — without it the Chat slot is a dead end, so it is hidden. */
  showChat?: boolean;
  isCompactMobile: boolean;
  footerPadBottom: number;
  messageUnreadCount: number;
  pendingInvites: number;
  activeLoadCount: number;
  onTabChange: (tab: DemoTabId) => void;
  onOpenChat: () => void;
  /** Finger-down: prefetch chat chunks + bootstrap before navigation. */
  onOpenChatWarm?: () => void;
  onCollapseNetworkDock: () => void;
  onWarmTab?: (tab: DemoTabId) => void;
};

type DockTab = {
  id: DemoTabId;
  label: string;
  Icon: LucideIcon;
  badgeCount?: number;
  /** Solid fill when active (Home). */
  fillWhenActive?: boolean;
};

const HIGHLIGHT_INSET = 3;
/** Fast travel inside the existing pill. Stretches slightly, then settles. */
const FLOW_SPRING = { damping: 24, stiffness: 620, mass: 0.38 } as const;
const FLOW_SETTLE = { damping: 16, stiffness: 480, mass: 0.35 } as const;
const FLOW_STRETCH = { duration: 70, easing: Easing.out(Easing.quad) } as const;

function DockIcon({
  Icon,
  active,
  size,
  fill,
  tint,
}: {
  Icon: LucideIcon;
  active: boolean;
  size: number;
  fill?: boolean;
  /** Resting colour for a feature pill (Marketplace); active is always white. */
  tint?: string;
}) {
  return (
    <Icon
      size={size}
      color={active ? Theme.dockIconActive : (tint ?? Theme.dockIconMuted)}
      fill={fill && active ? Theme.dockIconActive : 'transparent'}
      strokeWidth={active ? 2.2 : 1.8}
    />
  );
}

/** Side pill fill. Fades with the same short motion as the sliding thumb. */
function SideTrack({ active, children }: { active: boolean; children: ReactNode }) {
  const fill = useSharedValue(active ? 1 : 0);
  const ready = useRef(false);
  useEffect(() => {
    if (!ready.current) {
      fill.value = active ? 1 : 0;
      ready.current = true;
      return;
    }
    fill.value = withTiming(active ? 1 : 0, FLOW_STRETCH);
  }, [active, fill]);
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value }));
  return (
    <View style={styles.sideTrack}>
      <Animated.View style={[styles.sideFill, fillStyle, pe('none')]} />
      {children}
    </View>
  );
}

/** Shadow on the outer view so the solid pill can float without a tray behind it. */
function DockPill({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <View style={[styles.pillShadow, style]}>
      <View style={styles.pill}>{children}</View>
    </View>
  );
}

function PulseBottomTabBarInner({
  activeTab,
  visibility,
  isChatRoute,
  showChat = true,
  isCompactMobile,
  footerPadBottom,
  messageUnreadCount,
  pendingInvites,
  activeLoadCount,
  onTabChange,
  onOpenChat,
  onOpenChatWarm,
  onCollapseNetworkDock,
  onWarmTab,
}: PulseBottomTabBarProps) {
  const iconSize = PULSE_BOTTOM_TAB_DOCK.dockIconSize;

  const tabs: DockTab[] = [
    (visibility?.network ?? true) && {
      id: 'network' as const,
      label: 'Home',
      Icon: Home,
      badgeCount: pendingInvites,
      fillWhenActive: true,
    },
    (visibility?.finance ?? true) && { id: 'finance' as const, label: 'Cash', Icon: DollarSign },
    (visibility?.trips ?? true) && { id: 'trips' as const, label: 'Trips', Icon: Signpost },
    (visibility?.compliance ?? true) && {
      id: 'compliance' as const,
      label: 'Comply',
      Icon: ShieldCheck,
    },
  ].filter(Boolean) as DockTab[];
  const showMarketplace = visibility?.loadCenter ?? true;

  const routeKey = isChatRoute ? 'chat' : activeTab;
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const selectedKey = pressedKey ?? routeKey;
  const marketplaceActive = selectedKey === 'loadCenter';
  const chatActive = selectedKey === 'chat';

  const [trackWidth, setTrackWidth] = useState(0);
  const slotWidth = tabs.length > 0 ? trackWidth / tabs.length : 0;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const slotWidthRef = useRef(slotWidth);
  slotWidthRef.current = slotWidth;
  const highlightX = useSharedValue(0);
  const highlightScaleX = useSharedValue(1);
  const highlightOpacity = useSharedValue(routeKey === 'chat' || routeKey === 'loadCenter' ? 0 : 1);
  const flowingTo = useRef<string | null>(null);
  const flowingTarget = useRef<number | null>(null);
  const laidOut = useRef(false);
  const gestureOpened = useRef(false);

  const moveHighlight = useCallback(
    (key: string, flow: boolean) => {
      const width = slotWidthRef.current;
      if (width <= 0) return;
      const index =
        key === 'chat' || key === 'loadCenter'
          ? -1
          : tabsRef.current.findIndex((tab) => tab.id === key);
      const shown = index >= 0 ? 1 : 0;
      const target = index >= 0 ? index * width + HIGHLIGHT_INSET : null;
      if (flow && flowingTo.current === key && flowingTarget.current === target) return;
      flowingTo.current = key;
      flowingTarget.current = target;
      if (index >= 0 && target != null) {
        if (flow) {
          const slots = Math.abs(target - highlightX.value) / width;
          const stretch = 1 + Math.min(slots, 3) * 0.12;
          highlightScaleX.value = withSequence(
            withTiming(stretch, FLOW_STRETCH),
            withSpring(1, FLOW_SETTLE),
          );
          highlightX.value = withSpring(target, FLOW_SPRING);
        } else {
          highlightX.value = target;
          highlightScaleX.value = 1;
        }
      }
      highlightOpacity.value = flow ? withTiming(shown, FLOW_STRETCH) : shown;
    },
    [highlightOpacity, highlightScaleX, highlightX],
  );

  useEffect(() => {
    setPressedKey((current) => (current == null || current === routeKey ? null : current));
  }, [routeKey]);

  useEffect(() => {
    if (slotWidth <= 0 || pressedKey != null) return;
    moveHighlight(routeKey, laidOut.current);
    laidOut.current = true;
  }, [moveHighlight, pressedKey, routeKey, slotWidth]);

  const selectKey = useCallback(
    (key: string) => {
      setPressedKey(key);
      moveHighlight(key, true);
    },
    [moveHighlight],
  );

  const openFromPress = useCallback(
    (key: string, open: () => void) => {
      selectKey(key);
      if (gestureOpened.current) return;
      gestureOpened.current = true;
      open();
    },
    [selectKey],
  );

  const highlightStyle = useAnimatedStyle(() => ({
    opacity: highlightOpacity.value,
    transform: [{ translateX: highlightX.value }, { scaleX: highlightScaleX.value }],
  }));

  const onTrackLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const switchTab = useCallback(
    (tab: DemoTabId) => {
      onCollapseNetworkDock();
      onTabChange(tab);
    },
    [onCollapseNetworkDock, onTabChange],
  );

  const warmTab = useCallback(
    (tab: DemoTabId) => {
      if (tab === 'loadCenter') {
        preloadPulseLoadsRoute();
      } else if (tab === 'finance' || tab === 'trips' || tab === 'network') {
        preloadTabScreen(tab as PreloadableTab);
      }
      onWarmTab?.(tab);
    },
    [onWarmTab],
  );

  const warmAfterSelect = useCallback(
    (tab: DemoTabId) => {
      requestAnimationFrame(() => {
        if (tab !== 'compliance') warmTab(tab);
      });
    },
    [warmTab],
  );

  const rowHeight = pulseTabBarBodyHeight(isCompactMobile);

  const mainPress = (tab: DockTab) => ({
    onPressIn: () =>
      openFromPress(tab.id, () => {
        switchTab(tab.id);
        warmAfterSelect(tab.id);
      }),
    onPress: () => {
      if (gestureOpened.current) {
        gestureOpened.current = false;
        return;
      }
      openFromPress(tab.id, () => {
        switchTab(tab.id);
        warmAfterSelect(tab.id);
      });
    },
  });

  return (
    <View style={[styles.footerWrap, { paddingBottom: footerPadBottom }, pe('box-none')]}>
      <View style={[styles.row, { height: rowHeight }, pe('box-none')]}>
        {tabs.length > 0 ? (
          <DockPill style={styles.mainPill}>
            <View style={styles.track} onLayout={onTrackLayout}>
              {slotWidth > 0 ? (
                <Animated.View
                  style={[
                    styles.highlight,
                    { width: Math.max(slotWidth - HIGHLIGHT_INSET * 2, 0) },
                    highlightStyle,
                    pe('none'),
                  ]}
                />
              ) : null}
              {tabs.map((tab) => {
                const active = selectedKey === tab.id;
                const press = mainPress(tab);
                return (
                  <PulseBottomTabSlot
                    key={tab.id}
                    label={tab.label}
                    active={active}
                    badgeCount={tab.badgeCount}
                    compact={isCompactMobile}
                    onPressIn={press.onPressIn}
                    onPress={press.onPress}
                    icon={
                      <DockIcon
                        Icon={tab.Icon}
                        active={active}
                        size={iconSize}
                        fill={tab.fillWhenActive}
                      />
                    }
                  />
                );
              })}
            </View>
          </DockPill>
        ) : null}
        {showMarketplace ? (
          <DockPill style={styles.featurePill}>
            <SideTrack active={marketplaceActive}>
              <PulseBottomTabSlot
                label="Marketplace"
                active={marketplaceActive}
                badgeCount={activeLoadCount}
                compact={isCompactMobile}
                onPressIn={() =>
                  openFromPress('loadCenter', () => {
                    switchTab('loadCenter');
                    warmAfterSelect('loadCenter');
                  })
                }
                onPress={() => {
                  if (gestureOpened.current) {
                    gestureOpened.current = false;
                    return;
                  }
                  openFromPress('loadCenter', () => {
                    switchTab('loadCenter');
                    warmAfterSelect('loadCenter');
                  });
                }}
                icon={
                  <DockIcon
                    Icon={Store}
                    active={marketplaceActive}
                    size={iconSize}
                    tint={Theme.dockAccent}
                  />
                }
              />
            </SideTrack>
          </DockPill>
        ) : null}
        {showChat ? (
          <DockPill style={styles.sidePill}>
            <SideTrack active={chatActive}>
              <PulseBottomTabSlot
                label="Chat"
                active={chatActive}
                badgeCount={messageUnreadCount}
                compact={isCompactMobile}
                onPressIn={() =>
                  openFromPress('chat', () => {
                    onCollapseNetworkDock();
                    onOpenChat();
                    requestAnimationFrame(() => onOpenChatWarm?.());
                  })
                }
                onPress={() => {
                  if (gestureOpened.current) {
                    gestureOpened.current = false;
                    return;
                  }
                  openFromPress('chat', () => {
                    onCollapseNetworkDock();
                    onOpenChat();
                    requestAnimationFrame(() => onOpenChatWarm?.());
                  });
                }}
                icon={<DockIcon Icon={MessageSquare} active={chatActive} size={iconSize} />}
              />
            </SideTrack>
          </DockPill>
        ) : null}
      </View>
    </View>
  );
}

function propsEqual(prev: PulseBottomTabBarProps, next: PulseBottomTabBarProps): boolean {
  return (
    prev.activeTab === next.activeTab &&
    prev.visibility?.finance === next.visibility?.finance &&
    prev.visibility?.trips === next.visibility?.trips &&
    prev.visibility?.network === next.visibility?.network &&
    prev.visibility?.loadCenter === next.visibility?.loadCenter &&
    prev.visibility?.compliance === next.visibility?.compliance &&
    prev.isChatRoute === next.isChatRoute &&
    prev.showChat === next.showChat &&
    prev.isCompactMobile === next.isCompactMobile &&
    prev.footerPadBottom === next.footerPadBottom &&
    prev.messageUnreadCount === next.messageUnreadCount &&
    prev.pendingInvites === next.pendingInvites &&
    prev.activeLoadCount === next.activeLoadCount &&
    prev.onTabChange === next.onTabChange &&
    prev.onOpenChat === next.onOpenChat &&
    prev.onOpenChatWarm === next.onOpenChatWarm &&
    prev.onCollapseNetworkDock === next.onCollapseNetworkDock &&
    prev.onWarmTab === next.onWarmTab
  );
}

export const PulseBottomTabBar = memo(PulseBottomTabBarInner, propsEqual);

const D = PULSE_BOTTOM_TAB_DOCK;

const styles = StyleSheet.create({
  footerWrap: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    paddingTop: D.shellPaddingTop,
    paddingHorizontal: D.dockHorizontalMargin,
  },
  row: {
    width: '100%',
    maxWidth: D.dockMaxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: D.dockSideGap,
  },
  pillShadow: {
    borderRadius: 999,
    shadowColor: Theme.dockShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 10,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: Theme.dockFill,
    padding: D.dockPillInset,
  },
  mainPill: {
    flex: 1,
    minWidth: 0,
  },
  featurePill: {
    width: 96,
    flexShrink: 0,
  },
  track: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative',
  },
  highlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
    backgroundColor: Theme.dockActiveFill,
  },
  sidePill: {
    width: 62,
    flexShrink: 0,
  },
  sideTrack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  sideFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    backgroundColor: Theme.dockActiveFill,
  },
});
