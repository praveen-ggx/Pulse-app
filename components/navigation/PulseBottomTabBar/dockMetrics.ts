/**
 * Canonical metrics for the dispatcher mobile bottom tab dock.
 *
 * Source of truth for:
 * - `PulseBottomTabBar` / `PulseBottomTabSlot` StyleSheets
 * - `lib/layoutInsets` clearance (`tabBarDockHeight`, FAB / peek / scroll padding)
 *
 * DemoTabBar passes `isCompactMobile={!isDesktopWeb}` — mobile always uses compact.
 * Do not duplicate these numbers in consumers; import from here.
 */

export const PULSE_BOTTOM_TAB_DOCK = {
  /** `footerWrap.paddingTop` */
  shellPaddingTop: 4,
  /** `bar.paddingTop` */
  barPaddingTop: 2,
  /** `PulseBottomTabSlot` vertical padding */
  slotPaddingTop: 4,
  slotPaddingBottom: 2,
  /** `iconWrap` height */
  iconHeight: 24,
  labelMarginTop: 2,
  /** Explicit line heights so dock height is deterministic across platforms */
  labelLineHeight: 12,
  labelLineHeightCompact: 11,
  labelFontSize: 10,
  labelFontSizeCompact: 9,
  underlineMarginTop: 4,
  underlineHeight: 2,
  /** Floating pill dock: icon box, icon→label gap, inner inset, side gap, outer margin, max row width. */
  dockIconSize: 18,
  dockIconHeight: 22,
  dockLabelGap: 3,
  dockPillInset: 4,
  dockSideGap: 8,
  dockHorizontalMargin: 12,
  dockMaxWidth: 460,
  /**
   * Minimum footer pad inside the dock (home indicator / gesture band).
   * Actual pad = max(scaledSafeArea, this).
   */
  footerPaddingMin: 10,
  /** Gap between floating UI (peek / FAB / scroll end) and the dock top edge */
  contentGap: 12,
  /**
   * Native tab-shell extra when safe-area bottom is 0
   * (`app/(tabs)/_layout.tsx` → `paddingBottom: layout.bottom > 0 ? 0 : 4`).
   */
  nativeZeroInsetShellPad: 4,
  /**
   * Stacking: dock above peek so nav stays tappable if anything overlaps.
   * Peek must stay below these.
   */
  tabBarZIndexWeb: 1000,
  tabBarZIndexNative: 100,
  peekZIndexWeb: 990,
  peekZIndexNative: 90,
} as const;

/** Height of the icon+label+underline slot column (inside the bar). */
export function pulseTabBarSlotHeight(compact: boolean): number {
  const d = PULSE_BOTTOM_TAB_DOCK;
  const labelLh = compact ? d.labelLineHeightCompact : d.labelLineHeight;
  return (
    d.slotPaddingTop +
    d.iconHeight +
    d.labelMarginTop +
    labelLh +
    d.underlineMarginTop +
    d.underlineHeight +
    d.slotPaddingBottom
  );
}

/** Bar row height (paddingTop + slot column). Fixed so styles cannot drift from clearance math. */
export function pulseTabBarBodyHeight(compact: boolean): number {
  return PULSE_BOTTOM_TAB_DOCK.barPaddingTop + pulseTabBarSlotHeight(compact);
}

/**
 * Content height of the dock chrome above the dynamic footer safe-area pad
 * (shell padding + bar body). Does not include footerPad or native shell pad.
 */
export function pulseTabBarChromeHeight(compact: boolean): number {
  return PULSE_BOTTOM_TAB_DOCK.shellPaddingTop + pulseTabBarBodyHeight(compact);
}
