/**
 * Layout constants for responsive design and consistent spacing.
 * Use these instead of magic numbers so the app adapts and stays consistent.
 *
 * Safe area is always applied via useSafeAreaInsets() — never hardcode
 * status bar or home indicator heights here.
 */

export const Layout = {
  /** Horizontal padding for screen content (matches common header padding) */
  screenPaddingHorizontal: 16,
  /** Base vertical spacing between sections */
  sectionSpacing: 24,
  /** Spacing: small (sectionSpacing * 0.25) */
  spacingSmall: 6,
  /** Spacing: medium (sectionSpacing * 0.35) */
  spacingMedium: 8,
  /** Spacing: large (sectionSpacing * 0.55) */
  spacingLarge: 14,
  /** Spacing: extra large (sectionSpacing * 0.75) */
  spacingExtraLarge: 18,
  /** Minimum touch target size (Apple HIG / Android: ~44–48dp) */
  minTouchTargetSize: 44,
  /** Extra hit area around tappable elements (hitSlop) */
  touchTargetHitSlop: 8,
  /** FAB distance from bottom (add to tab bar / safe area offset in component) */
  fabBottomOffset: 24,
  /** FAB horizontal offset from screen right (all screen sizes) */
  fabRightOffset: 20,
  /** Tab bar dock content height (DemoTabBar glassDock); total bar = this + padding from DemoTabBar */
  tabBarDockHeight: 61,
  /** Header content padding below safe area */
  headerPaddingBelowInset: 16,
  /** Driver header compact horizontal padding (dashboard + driver pages) */
  driverHeaderHorizontalPadding: 14,
  /** Driver header compact padding below the safe area inset */
  driverHeaderTopOffset: 8,
  /** Driver header compact bottom padding */
  driverHeaderBottomPadding: 8,
  /** Driver header compact gap between avatar and text */
  driverHeaderGap: 12,
  /** Driver header compact avatar size */
  driverHeaderAvatarSize: 40,
  /** Header action chips (invite / bell) — same footprint as avatar on History & Earnings */
  driverHeaderActionSize: 40,
  driverHeaderActionIconSize: 20,
  /** Modal / sheet bottom padding above home indicator (add insets.bottom in component) */
  modalBottomPadding: 24,
  /** Ledger-style bottom sheet: ratio of window height (same for Add Transaction, Add Client, Add Vehicle, Add Driver) */
  ledgerPanelHeightRatio: 0.56,
  /** Ledger-style bottom sheet: max height in px */
  ledgerPanelMaxHeight: 380,
  /** Extra padding at bottom of scroll content on auth/form screens so focused input can scroll above keyboard (physical devices) */
  keyboardAvoidScrollPadding: 280,
  /** Height of custom tab bar (FISCAL | OPS | TRIPS) for consistent layout */
  tabBarHeight: 56,
  /**
   * React Native Web: minimum width to treat the window as “desktop” for the Live
   * Operations sidebar, idle toast offset, and floating chat. Below the old 1024
   * breakpoint so a docked devtools panel still leaves enough usable width to preview.
   * (Chat hub and other screens may still use 1024 for their own split layouts.)
   */
  webDesktopMinWidth: 900,
  /**
   * Max width for the desktop hub shell (`#root` on web). Keeps finance / trips /
   * network / loads from stretching on ultrawide viewports; header + footers align.
   */
  desktopHubMaxWidth: 1680,
  /** @deprecated CSS zoom removed — always 1. Kept for callers that read the constant. */
  webDesktopUiScale: 1,
  /** Width of the Live Operations sidebar — keep `GlobalOperationsToast` `left` in sync */
  liveOpsShelfWidth: 300,
  /** Desktop web top navigation reserve height (layout px below fixed header). */
  desktopTopNavOffset: 84,
  /**
   * @deprecated Static estimate only — ignores safe area on mobile web.
   * Use `useLayoutInsets().scrollBottomPadding()` or `scrollClearanceAboveTabBar()` from `@/lib/layoutInsets`.
   */
  demoTabBarScrollBottomInset: 56 + 32 + 22,
  /** Bottom corner radius of demo tab bar (matches device curve) */
  tabBarBorderRadiusBottom: 20,
  /** Radius of each tab pill (FISCAL / OPS / TRIPS) */
  tabBarPillBorderRadius: 14,
  /** Min padding below tab bar (add to insets.bottom in component) */
  tabBarBottomPaddingMin: 8,
  /**
   * Left padding for `Text` that shows `formatINR` / ₹ on dark gradients.
   * Italic + negative letterSpacing draw glyphs past the box; `overflow: hidden` on
   * cards then clips the rupee — use on all currency `Text` styles.
   */
  currencyTextPaddingStart: 5,
  /** Large hero amounts (e.g. 64px web) need a bit more optical inset */
  currencyTextPaddingStartLarge: 7,
  /** Vertical inset so ₹ ascenders / italic aren’t clipped (esp. with overflow:hidden cards) */
  currencyTextPaddingVertical: 4,
  currencyTextPaddingVerticalTight: 2,
  /** Max width per tab item so labels don't stretch on tablets */
  tabItemMaxWidth: 120,
  /** Shadow: bar elevation (iOS shadowOffset Y) */
  tabBarShadowOffsetY: -2,
  tabBarShadowOpacity: 0.06,
  tabBarShadowRadius: 10,
  tabBarElevation: 12,
  /** Active OPS icon container */
  tabBarActiveIconBorderRadius: 10,
  tabBarActiveIconPadding: 4,
  tabBarIconSlotMinHeight: 28,
  tabBarActiveIconShadowOffsetY: 2,
  tabBarActiveIconShadowOpacity: 0.2,
  tabBarActiveIconShadowRadius: 4,
  tabBarActiveIconElevation: 6,
  /** FAB size and elevation */
  fabSize: 56,
  /**
   * Vertical offset between stacked FABs (chat lower, primary/action upper).
   * Upper FAB `bottom` = lower FAB `bottom` + fabStackOffset (~fabSize + gap).
   */
  fabStackOffset: 64,
  fabBorderRadius: 28,
  fabShadowOffsetY: 4,
  fabShadowOpacity: 0.3,
  fabShadowRadius: 12,
  fabElevation: 12,
  /** Full-page wizard: stepped layout max viewport (native + mobile web). */
  wizardSteppedMaxWidth: 600,
  /** Full-page wizard: centered body column max width. */
  wizardBodyMaxWidth: 860,
  /** Multi-card desktop grid (non-wizard forms only). */
  wizardDesktopGridMinWidth: 1080,
  /** Workspace flex card — min viewport to show the desktop drawer card. */
  workspaceSplitMinWidth: 720,
  /** Workspace flex card — fixed drawer width on desktop (hub and detail alike). */
  workspaceCardMaxWidth: 470,
  /** Detail sheet over a full-bleed map (live tracking): centered reading column. */
  trackingSheetMaxWidth: 720,
  /**
   * Entity detail hero (Client / Supplier / Driver / Vehicle): one system of sizes so
   * financial + profile columns align everywhere. Prefer compact density when content is heavy.
   */
  entityHero: {
    /** Desktop 70/30 split between gradient financial card and white profile card */
    financialFlex: 7,
    profileFlex: 3,
    /** Same row rhythm on every entity detail page */
    rowGap: 14,
    rowMarginBottom: 14,
    /** Shared minimum column height on desktop web (both cards stretch together) */
    columnMinHeightDesktop: 280,
    /** Financial gradient card (desktop) */
    scorecardRadiusDesktop: 34,
    scorecardPaddingHorizontal: 26,
    scorecardPaddingVertical: 28,
    /** Profile companion card shell */
    profileRadius: 24,
    profilePaddingHorizontal: 16,
    profilePaddingVertical: 16,
    profileGap: 8,
    /** Compact “trips handled” hero numeral — keeps profile card height aligned across entities */
    profileTripsNumberSize: 24,
    profileTripsNumberLineHeight: 26,
    /** Tight stack for name/phone rows (driver/vehicle) */
    profileDetailsPaddingVertical: 6,
    profileDetailsGap: 4,
    profileDetailsMaxHeight: 78,
    profileDetailValueFontSize: 9,
    /** Status pill + CTA (shared) */
    togglePaddingHorizontal: 10,
    togglePaddingVertical: 10,
    actionButtonMinHeight: 44,
    actionButtonPaddingVertical: 14,
  },
} as const;

export default Layout;
