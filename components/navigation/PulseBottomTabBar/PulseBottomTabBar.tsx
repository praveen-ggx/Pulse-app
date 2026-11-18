/**
 * Mobile bottom navigation — Verify-pill colour: light blue fill, brown
 * border, brown icons. Layout unchanged. Main tabs share one pill; Marketplace
 * and Chat each sit in their own pill on the same tray.
 * Each slot follows the same member access as the desktop top nav.
 */
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
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
/** Short glide. Starts on press so the page and the thumb move together. */
const FLOW = { duration: 70, easing: Easing.out(Easing.cubic) } as const;

/** Even top-to-bottom tone on the Marketplace pill. No outline, no highlight bar. */
function MarketFill() {
  return (
    <View style={styles.mirror} pointerEvents="none">
      <LinearGradient
        colors={[Theme.accentBrownLight, Theme.accentBrown, Theme.accentBrownDeep]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/** Apple-style mirror thumb: glass falloff and a hairline specular. */
function MirrorFill() {
  return (
    <View style={styles.mirror} pointerEvents="none">
      <LinearGradient
        colors={[
          Theme.pulseTabClusterThumbGlassTop,
          Theme.pulseTabClusterThumbSolid,
          Theme.pulseTabClusterThumbGlassBottom,
        ]}
        locations={[0, 0.42, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.mirrorSpecular} />
    </View>
  );
}

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
  /** Resting colour for a feature pill (Marketplace). Active is dock ink. */
  tint?: string;
}) {
  return (
    <Icon
      size={size}
      color={tint ?? (active ? Theme.dockIconActive : Theme.dockIconMuted)}
      fill={fill && active ? Theme.dockIconActive : 'transparent'}
      strokeWidth={active ? 2.05 : 1.75}
    />
  );
}

/** Side pill mirror. Same glass as the sliding thumb. */
function SideTrack({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <View style={styles.sideTrack}>
      {active ? <View style={[styles.sideFill, pe('none')]}><MirrorFill /></View> : null}
      {children}
    </View>
  );
}

/** One pill on the shared tray. No per-pill shadow — that made the row look uneven. */
function DockPill({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.pill, style]}>{children}</View>;
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
  const highlightOpacity = useSharedValue(routeKey === 'chat' || routeKey === 'loadCenter' ? 0 : 1);
  const gestureOpened = useRef(false);
  const laidOut = useRef(false);

  const placeHighlight = useCallback(
    (key: string, flow: boolean) => {
      const width = slotWidthRef.current;
      if (width <= 0) return;
      const index =
        key === 'chat' || key === 'loadCenter'
          ? -1
          : tabsRef.current.findIndex((tab) => tab.id === key);
      const shown = index >= 0 ? 1 : 0;
      highlightOpacity.value = flow ? withTiming(shown, FLOW) : shown;
      if (index >= 0) {
        const target = index * width + HIGHLIGHT_INSET;
        highlightX.value = flow ? withTiming(target, FLOW) : target;
      }
    },
    [highlightOpacity, highlightX],
  );

  useEffect(() => {
    setPressedKey((current) => (current == null || current === routeKey ? null : current));
  }, [routeKey]);

  useEffect(() => {
    if (pressedKey != null) return;
    placeHighlight(routeKey, laidOut.current);
    laidOut.current = true;
  }, [placeHighlight, pressedKey, routeKey, slotWidth]);

  const openFromPress = useCallback(
    (key: string, open: () => void) => {
      if (gestureOpened.current) return;
      gestureOpened.current = true;
      setPressedKey(key);
      placeHighlight(key, true);
      open();
      requestAnimationFrame(() => {
        gestureOpened.current = false;
      });
    },
    [placeHighlight],
  );

  const highlightStyle = useAnimatedStyle(() => ({
    opacity: highlightOpacity.value,
    transform: [{ translateX: highlightX.value }],
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
        warmTab(tab);
      });
    },
    [warmTab],
  );

  const rowHeight = pulseTabBarBodyHeight(isCompactMobile);

  const mainPress = (tab: DockTab) => ({
    onPressIn: () => {
      openFromPress(tab.id, () => {
        switchTab(tab.id);
        warmAfterSelect(tab.id);
      });
    },
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
                >
                  <MirrorFill />
                </Animated.View>
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
            <MarketFill />
            <View style={styles.sideTrack}>
              <PulseBottomTabSlot
                label="Marketplace"
                tone="market"
                active={marketplaceActive}
                badgeCount={activeLoadCount}
                compact={isCompactMobile}
                onPressIn={() => {
                  openFromPress('loadCenter', () => {
                    switchTab('loadCenter');
                    warmAfterSelect('loadCenter');
                  });
                }}
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
                    tint={marketplaceActive ? Theme.accentGold : Theme.accentBrownWash}
                  />
                }
              />
            </View>
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
                onPressIn={() => {
                  openFromPress('chat', () => {
                    onCollapseNetworkDock();
                    onOpenChat();
                    requestAnimationFrame(() => onOpenChatWarm?.());
                  });
                }}
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
  pill: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: Theme.dockPillFill,
    padding: D.dockPillInset,
  },
  mainPill: {
    flex: 1,
    minWidth: 0,
  },
  featurePill: {
    width: 96,
    flexShrink: 0,
    overflow: 'visible',
    backgroundColor: Theme.accentBrown,
  },
  track: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative',
  },
  highlight: {
    position: 'absolute',
    top: 1,
    bottom: 1,
    left: 0,
    borderRadius: 999,
    overflow: 'hidden',
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
    position: 'absolute',
    top: 2,
    right: 2,
    bottom: 2,
    left: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  mirror: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    overflow: 'hidden',
  },
  mirrorSpecular: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.pulseTabClusterThumbSpecular,
  },
});
