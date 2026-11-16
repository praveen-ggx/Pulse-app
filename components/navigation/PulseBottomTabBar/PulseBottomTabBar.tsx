/**
 * Mobile bottom navigation — matte brown dock (same brown as Customers /
 * Suppliers). Main tabs share one pill with a sliding highlight; Marketplace
 * and Chat each sit in their own pill on the same tray.
 * Each slot follows the same member access as the desktop top nav.
 */
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
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

/** Side pill fill. Follows the open page, not the finger. */
function SideTrack({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <View style={styles.sideTrack}>
      {active ? <View style={[styles.sideFill, pe('none')]} /> : null}
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
  const marketplaceActive = routeKey === 'loadCenter';
  const chatActive = routeKey === 'chat';

  const [trackWidth, setTrackWidth] = useState(0);
  const slotWidth = tabs.length > 0 ? trackWidth / tabs.length : 0;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const slotWidthRef = useRef(slotWidth);
  slotWidthRef.current = slotWidth;
  const highlightX = useSharedValue(0);
  const highlightOpacity = useSharedValue(routeKey === 'chat' || routeKey === 'loadCenter' ? 0 : 1);
  const gestureOpened = useRef(false);

  const placeHighlight = useCallback(
    (key: string) => {
      const width = slotWidthRef.current;
      if (width <= 0) return;
      const index =
        key === 'chat' || key === 'loadCenter'
          ? -1
          : tabsRef.current.findIndex((tab) => tab.id === key);
      highlightOpacity.value = index >= 0 ? 1 : 0;
      if (index >= 0) highlightX.value = index * width + HIGHLIGHT_INSET;
    },
    [highlightOpacity, highlightX],
  );

  useEffect(() => {
    placeHighlight(routeKey);
  }, [placeHighlight, routeKey, slotWidth]);

  const openFromPress = useCallback((open: () => void) => {
    if (gestureOpened.current) return;
    gestureOpened.current = true;
    open();
    requestAnimationFrame(() => {
      gestureOpened.current = false;
    });
  }, []);

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
        if (tab !== 'compliance') warmTab(tab);
      });
    },
    [warmTab],
  );

  const rowHeight = pulseTabBarBodyHeight(isCompactMobile);

  const mainPress = (tab: DockTab) => ({
    onPressIn: () => {
      openFromPress(() => {
        switchTab(tab.id);
        warmAfterSelect(tab.id);
      });
    },
    onPress: () => {
      if (gestureOpened.current) {
        gestureOpened.current = false;
        return;
      }
      openFromPress(() => {
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
                const active = routeKey === tab.id;
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
                onPressIn={() => {
                  openFromPress(() => {
                    switchTab('loadCenter');
                    warmAfterSelect('loadCenter');
                  });
                }}
                onPress={() => {
                  if (gestureOpened.current) {
                    gestureOpened.current = false;
                    return;
                  }
                  openFromPress(() => {
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
                onPressIn={() => {
                  openFromPress(() => {
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
                  openFromPress(() => {
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.dockPillBorder,
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
