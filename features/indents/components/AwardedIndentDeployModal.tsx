import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react-native";

/** Same cutoff as Network public profile (`isMobileLayout`). */
const NETWORK_MOBILE_MAX_WIDTH = 820;

import Theme from "@/constants/Theme";
import { AwardedIndentDeployModalPage } from "@/features/indents/components/AwardedIndentDeployModalPage";
import { deployModalStyles as styles } from "@/features/indents/components/AwardedIndentDeployModal.styles";
import type { PendingAwardedDeployItem } from "@/features/indents/utils/pendingAwardedDeploy.util";

export type AwardedIndentDeployModalProps = {
  visible: boolean;
  items: PendingAwardedDeployItem[];
  pageIndex: number;
  onPageChange: (index: number) => void;
  onAssign: () => void;
  onLater: () => void;
  /** Collapse to bottom peek — same outcome as Later. */
  onMinimize: () => void;
  onViewLoad?: () => void;
};

const MINIMIZE_DRAG_PX = 72;
const MINIMIZE_VELOCITY = 0.65;

function clampPageIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

export const AwardedIndentDeployModal = memo(function AwardedIndentDeployModal({
  visible,
  items,
  pageIndex,
  onPageChange,
  onAssign,
  onLater,
  onMinimize,
  onViewLoad,
}: AwardedIndentDeployModalProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isMobileLayout = screenWidth < NETWORK_MOBILE_MAX_WIDTH;
  const isWebDesktop = Platform.OS === "web" && !isMobileLayout;
  const isNativePage = Platform.OS !== "web";
  const pagerRef = useRef<ScrollView>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const isScrollingRef = useRef(false);
  const dragY = useRef(new Animated.Value(0)).current;
  const dismissingRef = useRef(false);
  const [shellVisible, setShellVisible] = useState(visible);
  const [isDragging, setIsDragging] = useState(false);

  const safeIndex = clampPageIndex(pageIndex, items.length);
  const pageTotal = items.length;
  const showPager = pageTotal > 1 && pageWidth > 0;

  const resetDrag = useCallback(() => {
    Animated.spring(dragY, {
      toValue: 0,
      useNativeDriver: true,
      friction: 9,
      tension: 120,
    }).start();
    setIsDragging(false);
  }, [dragY]);

  const runSheetExit = useCallback(
    (onComplete: () => void) => {
      if (dismissingRef.current) return;
      dismissingRef.current = true;
      // Parent first — prevents visible=true + shellVisible=false reopen race.
      onComplete();
      Animated.timing(dragY, {
        toValue: 420,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        dragY.setValue(0);
        setIsDragging(false);
        setShellVisible(false);
      });
    },
    [dragY],
  );

  const finishMinimize = useCallback(() => {
    runSheetExit(onMinimize);
  }, [onMinimize, runSheetExit]);

  const finishLater = useCallback(() => {
    runSheetExit(onLater);
  }, [onLater, runSheetExit]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onPanResponderGrant: () => setIsDragging(true),
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0) {
            dragY.setValue(gesture.dy);
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (
            gesture.dy >= MINIMIZE_DRAG_PX ||
            gesture.vy >= MINIMIZE_VELOCITY
          ) {
            finishMinimize();
            return;
          }
          resetDrag();
        },
        onPanResponderTerminate: resetDrag,
      }),
    [dragY, finishMinimize, resetDrag],
  );

  const syncScrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      if (pageWidth <= 0) return;
      pagerRef.current?.scrollTo({ x: index * pageWidth, animated });
    },
    [pageWidth],
  );

  useEffect(() => {
    if (!visible || !showPager) return;
    syncScrollToIndex(safeIndex, false);
  }, [visible, showPager, safeIndex, syncScrollToIndex]);

  useEffect(() => {
    if (visible) {
      dismissingRef.current = false;
      setShellVisible(true);
      dragY.setValue(0);
      setIsDragging(false);
      return;
    }
    dismissingRef.current = false;
    setShellVisible(false);
    dragY.setValue(0);
    setIsDragging(false);
  }, [visible, dragY]);

  const handlePagerLayout = useCallback((width: number) => {
    if (width > 0) setPageWidth(width);
  }, []);

  const reportPageFromOffset = useCallback(
    (offsetX: number) => {
      if (pageWidth <= 0) return;
      const next = clampPageIndex(Math.round(offsetX / pageWidth), pageTotal);
      if (next !== safeIndex) onPageChange(next);
    },
    [onPageChange, pageTotal, pageWidth, safeIndex],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!showPager || pageWidth <= 0) return;
      const offsetX = event.nativeEvent.contentOffset.x;
      const next = clampPageIndex(Math.round(offsetX / pageWidth), pageTotal);
      if (next !== safeIndex && !isScrollingRef.current) {
        onPageChange(next);
      }
    },
    [onPageChange, pageTotal, pageWidth, safeIndex, showPager],
  );

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isScrollingRef.current = false;
      reportPageFromOffset(event.nativeEvent.contentOffset.x);
    },
    [reportPageFromOffset],
  );

  const handleScrollBeginDrag = useCallback(() => {
    isScrollingRef.current = true;
  }, []);

  const goToPage = useCallback(
    (index: number) => {
      const next = clampPageIndex(index, pageTotal);
      if (next === safeIndex) return;
      onPageChange(next);
      syncScrollToIndex(next, true);
    },
    [onPageChange, pageTotal, safeIndex, syncScrollToIndex],
  );

  if ((!shellVisible && !visible) || items.length === 0) return null;

  const pagerContent = items.map((item, index) => (
    <View key={item.indent.id} style={{ width: pageWidth || "100%" }}>
      <AwardedIndentDeployModalPage
        item={item}
        pageNumber={index + 1}
        pageTotal={pageTotal}
        enabled={visible && index === safeIndex}
      />
    </View>
  ));

  const sheetTranslate = dragY.interpolate({
    inputRange: [0, 400],
    outputRange: [0, 400],
    extrapolate: "clamp",
  });

  return (
    <Modal
      visible={shellVisible}
      transparent={!isNativePage}
      animationType={isNativePage ? "slide" : "fade"}
      presentationStyle={isNativePage ? "fullScreen" : "overFullScreen"}
      onRequestClose={finishMinimize}
      statusBarTranslucent={!isNativePage}
    >
      <View
        style={[
          isNativePage ? styles.pageNative : styles.backdrop,
          !isNativePage && (isWebDesktop ? styles.backdropWebDesktop : styles.backdropWebMobile),
          isNativePage && { paddingTop: insets.top },
        ]}
      >
        {isNativePage ? null : (
        <Pressable
          style={styles.backdropTap}
          onPress={finishMinimize}
          accessibilityRole="button"
          accessibilityLabel="Minimize deploy card"
        />
        )}
        <Animated.View
          style={[
            styles.sheet,
            isNativePage
              ? styles.sheetNativePage
              : isWebDesktop
                ? styles.sheetWebDesktop
                : styles.sheetMobile,
            { paddingBottom: Math.max(insets.bottom, 10) },
            !isNativePage && !isWebDesktop && { transform: [{ translateY: sheetTranslate }] },
            isDragging && styles.sheetDragging,
          ]}
        >
          {isNativePage ? null : (
          <View
            style={styles.sheetDragCapture}
            {...panResponder.panHandlers}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          )}
          <Pressable
            onPress={finishMinimize}
            style={styles.closeBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={15} color={Theme.textPrimaryDark} strokeWidth={2.4} />
          </Pressable>

          <View
            style={[styles.pagerMeasure, isNativePage && styles.pagerMeasureFill]}
            onLayout={(event) => handlePagerLayout(event.nativeEvent.layout.width)}
          >
            {showPager ? (
              <ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                bounces={pageTotal > 1}
                style={styles.pagerScroll}
                onScroll={handleScroll}
                onScrollBeginDrag={handleScrollBeginDrag}
                onScrollEndDrag={handleMomentumScrollEnd}
                onMomentumScrollEnd={handleMomentumScrollEnd}
              >
                {pagerContent}
              </ScrollView>
            ) : (
              pagerContent[0] ?? null
            )}
          </View>

          {showPager ? (
            <View style={styles.pageDots}>
              <TouchableOpacity
                style={[
                  styles.pageNavBtn,
                  safeIndex <= 0 ? styles.pageNavBtnDisabled : null,
                ]}
                onPress={() => goToPage(safeIndex - 1)}
                disabled={safeIndex <= 0}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Previous awarded trip"
              >
                <ChevronLeft
                  size={18}
                  color={safeIndex <= 0 ? Theme.borderMedium : Theme.buttonMatteBlack}
                  strokeWidth={2.4}
                />
              </TouchableOpacity>

              {items.map((item, index) => {
                const active = index === safeIndex;
                return (
                  <TouchableOpacity
                    key={item.indent.id}
                    style={styles.pageDotHit}
                    onPress={() => goToPage(index)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Awarded trip ${index + 1} of ${pageTotal}`}
                    accessibilityState={{ selected: active }}
                  >
                    <View
                      style={[styles.pageDot, active ? styles.pageDotActive : null]}
                    />
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[
                  styles.pageNavBtn,
                  safeIndex >= pageTotal - 1 ? styles.pageNavBtnDisabled : null,
                ]}
                onPress={() => goToPage(safeIndex + 1)}
                disabled={safeIndex >= pageTotal - 1}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Next awarded trip"
              >
                <ChevronRight
                  size={18}
                  color={
                    safeIndex >= pageTotal - 1
                      ? Theme.borderMedium
                      : Theme.buttonMatteBlack
                  }
                  strokeWidth={2.4}
                />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.footer}>
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.laterBtnOutline}
                onPress={finishLater}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Later"
                accessibilityHint="Hides all pending award alerts for now"
              >
                <Text style={styles.laterBtnOutlineText} numberOfLines={1}>
                  Later
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.assignBtn}
                onPress={onAssign}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Assign vehicle"
              >
                <Check size={14} color={Theme.actionBtnInk} strokeWidth={2.4} />
                <Text style={styles.assignText} numberOfLines={1}>
                  Assign vehicle
                </Text>
              </TouchableOpacity>

              {onViewLoad ? (
                <TouchableOpacity
                  onPress={onViewLoad}
                  style={styles.viewLoadBtn}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="View load details"
                >
                  <Text style={styles.viewLoadText} numberOfLines={1}>
                    View load
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.viewLoadBtn} />
              )}
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
});
