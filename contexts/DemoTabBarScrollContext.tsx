// @refresh reset
/**
 * Scroll-driven visibility for the demo tab bar (hide while scrolling, show after idle).
 * Native: hide on drag begin, show after drag/momentum end.
 * Mobile web: hide on scroll in either direction, show after idle, via ScrollView onScroll — no window scroll listener.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { pe } from "@/lib/platformViewStyle.util";
import {
  Platform,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/** Glide off-screen — ease-in so it accelerates away naturally. */
const HIDE_TIMING = {
  duration: 360,
  easing: Easing.inOut(Easing.cubic),
} as const;
/** Glide back — timing only (no spring bounce on dock return). */
const SHOW_TIMING = {
  duration: 280,
  easing: Easing.out(Easing.cubic),
} as const;
const SHOW_DELAY_MS = 0;
const WEB_IDLE_MS = 380;
/** Ignore hide until user has scrolled past top bounce. */
const WEB_HIDE_MIN_OFFSET_Y = 50;
/** Min delta (px) per scroll tick to count as scrolling. */
const WEB_SCROLL_DIRECTION_DELTA = 8;

type ScrollControls = {
  onScrollBeginDrag: () => void;
  onScrollEnd: () => void;
  onMomentumScrollEnd: () => void;
  resetBarVisible: () => void;
};

const ScrollCtx = createContext<ScrollControls | null>(null);
const ProgressCtx = createContext<{ progress: SharedValue<number> } | null>(
  null,
);

let scrollHideVersion = 0;
const scrollHideListeners = new Set<() => void>();
let scrollInProgress = false;
const scrollProgressListeners = new Set<() => void>();

function emitScrollHideStart() {
  scrollHideVersion += 1;
  scrollHideListeners.forEach((listener) => listener());
}

let rootDockHidden = false;
const rootDockListeners = new Set<() => void>();

/** Hide the floating dock on a route that otherwise keeps it (compliance review). */
export function setRootDockHidden(next: boolean): void {
  if (rootDockHidden === next) return;
  rootDockHidden = next;
  rootDockListeners.forEach((listener) => listener());
}

export function useRootDockHidden(): boolean {
  return React.useSyncExternalStore(
    (listener) => {
      rootDockListeners.add(listener);
      return () => rootDockListeners.delete(listener);
    },
    () => rootDockHidden,
    () => false,
  );
}

function setScrollInProgress(next: boolean) {
  if (scrollInProgress === next) return;
  scrollInProgress = next;
  scrollProgressListeners.forEach((listener) => listener());
}

function isMobileWebAutoHide(width: number): boolean {
  return Platform.OS === "web" && width < 1024;
}

export function DemoTabBarScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const progress = useSharedValue(1);
  const scrollEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const autoHideEnabledRef = useRef(
    Platform.OS !== "web" || isMobileWebAutoHide(width),
  );
  autoHideEnabledRef.current =
    Platform.OS !== "web" || isMobileWebAutoHide(width);

  const clearSchedule = useCallback(() => {
    if (scrollEndTimeoutRef.current) {
      clearTimeout(scrollEndTimeoutRef.current);
      scrollEndTimeoutRef.current = null;
    }
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    if (!autoHideEnabledRef.current) return;
    clearSchedule();
    setScrollInProgress(true);
    emitScrollHideStart();
    progress.value = withTiming(0, HIDE_TIMING);
  }, [clearSchedule, progress]);

  const scheduleShow = useCallback(() => {
    if (!autoHideEnabledRef.current) return;
    clearSchedule();
    scrollEndTimeoutRef.current = setTimeout(() => {
      setScrollInProgress(false);
      progress.value = withTiming(1, SHOW_TIMING);
      scrollEndTimeoutRef.current = null;
    }, SHOW_DELAY_MS);
  }, [clearSchedule, progress]);

  const onScrollEnd = useCallback(() => {
    scheduleShow();
  }, [scheduleShow]);

  const onMomentumScrollEnd = useCallback(() => {
    scheduleShow();
  }, [scheduleShow]);

  const resetBarVisible = useCallback(() => {
    if (!autoHideEnabledRef.current) return;
    clearSchedule();
    setScrollInProgress(false);
    progress.value = withTiming(1, SHOW_TIMING);
  }, [clearSchedule, progress]);

  useEffect(() => () => clearSchedule(), [clearSchedule]);

  const scrollValue = useMemo(
    () => ({
      onScrollBeginDrag,
      onScrollEnd,
      onMomentumScrollEnd,
      resetBarVisible,
    }),
    [
      onScrollBeginDrag,
      onScrollEnd,
      onMomentumScrollEnd,
      resetBarVisible,
    ],
  );

  return (
    <ProgressCtx.Provider value={{ progress }}>
      <ScrollCtx.Provider value={scrollValue}>{children}</ScrollCtx.Provider>
    </ProgressCtx.Provider>
  );
}

const NOOP_SCROLL_CONTROLS: ScrollControls = {
  onScrollBeginDrag: () => {},
  onScrollEnd: () => {},
  onMomentumScrollEnd: () => {},
  resetBarVisible: () => {},
};

export function useDemoTabBarScroll(): ScrollControls {
  return useContext(ScrollCtx) ?? NOOP_SCROLL_CONTROLS;
}

export function useDemoTabBarScrollOptional(): ScrollControls | null {
  return useContext(ScrollCtx);
}

export function useDemoTabBarVisibilityProgressOptional(): SharedValue<number> | null {
  return useContext(ProgressCtx)?.progress ?? null;
}

export function useDemoTabBarScrollHideVersion(): number {
  return React.useSyncExternalStore(
    (listener) => {
      scrollHideListeners.add(listener);
      return () => scrollHideListeners.delete(listener);
    },
    () => scrollHideVersion,
    () => 0,
  );
}

export function useDemoTabBarScrollInProgress(): boolean {
  return React.useSyncExternalStore(
    (listener) => {
      scrollProgressListeners.add(listener);
      return () => scrollProgressListeners.delete(listener);
    },
    () => scrollInProgress,
    () => false,
  );
}

/** Full slide distance (dock + safe area). Slightly over-travel avoids edge peek. */
const OFF_TRANSLATE = 128;

export function DemoTabBarAutoHideShell({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  const ctx = useContext(ProgressCtx);
  // useAnimatedStyle must run unconditionally: returning early when there is no
  // provider changed the hook count between renders (React error #310). The
  // no-provider case is handled after the hook instead.
  const progress = ctx?.progress;
  const animatedStyle = useAnimatedStyle(() => {
    const p = progress ? progress.value : 1;
    return {
      opacity: interpolate(p, [0, 0.4, 1], [0, 0.92, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(
            p,
            [0, 1],
            [OFF_TRANSLATE, 0],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(p, [0, 1], [0.94, 1], Extrapolation.CLAMP),
        },
      ],
    };
  });
  if (!ctx) return <>{children}</>;
  return (
    <Animated.View style={[style, animatedStyle, pe("box-none")]}>
      {children}
    </Animated.View>
  );
}

/** Merge into primary vertical ScrollViews so the tab bar hides during scroll. */
export function useTabBarAwareScrollProps(): {
  onScrollBeginDrag?: () => void;
  onScrollEndDrag?: () => void;
  onMomentumScrollEnd?: () => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
} {
  const ctx = useDemoTabBarScrollOptional();
  const { width } = useWindowDimensions();
  const mobileWebAutoHide = isMobileWebAutoHide(width);
  const lastOffsetYRef = useRef(0);
  const webIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (webIdleRef.current) clearTimeout(webIdleRef.current);
    },
    [],
  );

  return useMemo(() => {
    if (!ctx) return {};

    if (Platform.OS !== "web") {
      return {
        onScrollBeginDrag: ctx.onScrollBeginDrag,
        onScrollEndDrag: ctx.onScrollEnd,
        onMomentumScrollEnd: ctx.onMomentumScrollEnd,
      };
    }

    if (!mobileWebAutoHide) return {};

    return {
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = event.nativeEvent.contentOffset.y;
        const dy = y - lastOffsetYRef.current;
        lastOffsetYRef.current = y;

        if (Math.abs(dy) > WEB_SCROLL_DIRECTION_DELTA && y > WEB_HIDE_MIN_OFFSET_Y) {
          ctx.onScrollBeginDrag();
        }

        if (webIdleRef.current) clearTimeout(webIdleRef.current);
        webIdleRef.current = setTimeout(() => {
          ctx.onScrollEnd();
          webIdleRef.current = null;
        }, WEB_IDLE_MS);
      },
      scrollEventThrottle: 16,
    };
  }, [ctx, mobileWebAutoHide]);
}
