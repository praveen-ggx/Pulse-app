import { DatePresetPillBar } from "@/components/DatePresetPillBar";
import {
  WEB_POINTER,
  WEB_TRANSITION,
  hoverOnDarkWash,
  isHovered,
  type HoverPressState,
} from "@/constants/hoverSelection";
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, type ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, {
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import type {
    FinancePeriodFilter,
    FinanceSubTab,
    LedgerCategory,
} from "../types";
import { styles } from "./FinanceScreen.styles";
import { FinanceTabRow } from "./FinanceTabRow";
import type { EntityListFilter } from "./TreasurySummaryCard";
import { TreasurySummaryCard } from "./TreasurySummaryCard";

export type LedgerViewMode = "table" | "transaction";

export interface FinanceSummarySectionProps {
  activeTab: FinanceSubTab;
  onTabPress: (tabId: FinanceSubTab) => void;
  screenWidth: number;
  totalIn: number;
  totalOut: number;
  labelIn: string;
  labelOut: string;
  cashDirectionFilter?: "all" | "in" | "out";
  onCashInPress?: () => void;
  onCashOutPress?: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  /** Omitted when the viewer lacks `finance.reports` — hides the Report button. */
  onReportPress?: () => void;
  entityFilter?: EntityListFilter;
  onEntityFilterChange?: (f: EntityListFilter) => void;
  entityFilterLabels?: Partial<Record<EntityListFilter, string>>;
  garagePeriodOptions?: { value: string; label: string }[];
  garagePeriod?: string;
  onGaragePeriodChange?: (v: string) => void;
  garageViewTab?: "vehicle" | "trips" | "revenue" | "profit" | "analytics";
  onGarageViewTabChange?: (
    v: "vehicle" | "trips" | "revenue" | "profit" | "analytics",
  ) => void;
  driverViewTab?: "list" | "analytics";
  onDriverViewTabChange?: (v: "list" | "analytics") => void;
  customerViewTab?: "list" | "analytics";
  onCustomerViewTabChange?: (v: "list" | "analytics") => void;
  supplierViewTab?: "list" | "analytics";
  onSupplierViewTabChange?: (v: "list" | "analytics") => void;
  onPartyAnalyticsPress?: () => void;
  showPeriodFilter?: boolean;
  periodFilter?: FinancePeriodFilter;
  onPeriodFilterChange?: (p: FinancePeriodFilter) => void;
  /** Date preset row under fiscal tabs (all Finance sub-tabs). */
  datePreset?: {
    period: FinancePeriodFilter;
    onPeriodChange: (p: FinancePeriodFilter) => void;
    onCustomRangePress: () => void;
    customFrom: string | null;
    customTo: string | null;
  } | null;
  sourceFilter?: "all" | "asset" | "aggregate";
  onSourceFilterChange?: (s: "all" | "asset" | "aggregate") => void;
  /** Ledger tab: Table | Transaction view. Shown in header when on Ledger. */
  ledgerViewMode?: LedgerViewMode;
  onLedgerViewModeChange?: (m: LedgerViewMode) => void;
  /** Customers tab only: view mode (matrix / table / ledger) — shown in summary. */
  customerViewMode?: "matrix" | "table" | "ledger";
  onCustomerViewModeChange?: (m: "matrix" | "table" | "ledger") => void;
  /** When set, shows plus button in header (e.g. Add transaction on cash tab, Add node on entity tabs). */
  onAddClick?: () => void;
  /** Cash tab: party category filter (All / Customers / Suppliers / Vehicle / Driver). */
  ledgerCategory?: LedgerCategory;
  onLedgerCategoryChange?: (c: LedgerCategory) => void;
  allowedLedgerCategories?: readonly LedgerCategory[];
  onClearFilters?: () => void;
  isAnyFilterActive?: boolean;
  auditedTotalIn?: number;
  auditedTotalOut?: number;
  onQuickCustomRange?: (fromIso: string, toIso: string) => void;
  desktopCardMetrics?: Partial<
    Record<
      "cash" | "customers" | "suppliers" | "garage" | "drivers",
      {
        value: string;
        count: number;
        secondaryLabel: string;
        secondaryValue: string;
      }
    >
  >;
  /** Mobile unified scroll: tab pills render in FinanceScreen fixed dock. */
  omitTabRow?: boolean;
  /** RBAC-filtered fiscal tabs. */
  visibleTabs?: readonly { id: FinanceSubTab; label: string }[];
}

function formatAmount(value: number): string {
  return `₹${value.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`;
}

function AnimatedFinanceHeroCard({
  desktop,
  onPress,
  children,
}: {
  desktop: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const hover = useSharedValue(0);
  const press = useSharedValue(0);
  const float = useSharedValue(0);

  useEffect(() => {
    if (!desktop) return;
    float.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [desktop, float]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(hover.value, [0, 1], [0, -2]) },
      {
        scale:
          interpolate(hover.value, [0, 1], [1, 1.006]) *
          interpolate(press.value, [0, 1], [1, 0.992]),
      },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(hover.value, [0, 1], [0.1, 0.24]),
    transform: [{ translateY: interpolate(float.value, [0, 1], [0, -4]) }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => {
        hover.value = withTiming(1, { duration: 150 });
      }}
      onHoverOut={() => {
        hover.value = withTiming(0, { duration: 160 });
      }}
      onPressIn={() => {
        press.value = withSpring(1, { damping: 16, stiffness: 260 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 16, stiffness: 260 });
      }}
      style={styles.financeBalanceCardPressable}
    >
      <Animated.View style={[styles.financeBalanceCardGlow, glowStyle]} />
      <Animated.View
        style={[styles.financeBalanceCardInnerWrap, animatedStyle]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

export function FinanceSummarySection({
  activeTab,
  onTabPress,
  screenWidth,
  totalIn,
  totalOut,
  labelIn,
  labelOut,
  cashDirectionFilter,
  onCashInPress,
  onCashOutPress,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  onReportPress,
  entityFilter,
  onEntityFilterChange,
  entityFilterLabels,
  garagePeriodOptions,
  garagePeriod,
  onGaragePeriodChange,
  garageViewTab,
  onGarageViewTabChange,
  driverViewTab,
  onDriverViewTabChange,
  customerViewTab,
  onCustomerViewTabChange,
  supplierViewTab,
  onSupplierViewTabChange,
  onPartyAnalyticsPress,
  showPeriodFilter,
  periodFilter,
  onPeriodFilterChange,
  sourceFilter,
  onSourceFilterChange,
  ledgerCategory,
  onLedgerCategoryChange,
  allowedLedgerCategories,
  onClearFilters,
  isAnyFilterActive,
  datePreset,
  auditedTotalIn,
  auditedTotalOut,
  onQuickCustomRange,
  desktopCardMetrics,
  omitTabRow = false,
  visibleTabs,
}: FinanceSummarySectionProps) {
  void desktopCardMetrics;
  const auditedIn = auditedTotalIn ?? totalIn;
  const auditedOut = auditedTotalOut ?? totalOut;
  const auditedNet = auditedIn - auditedOut;
  // Enable desktop hero + integrated pills at true desktop widths; keep mobile/tablet unchanged.
  const desktopParity = Platform.OS === "web" && screenWidth >= 1024;
  const heroDecorDrift = useSharedValue(0);
  const heroStatPulse = useSharedValue(0);
  const rangePills = [
    { id: "RANGE" as FinancePeriodFilter, label: "All" },
    { id: "TODAY" as FinancePeriodFilter, label: "Today" },
    { id: "WEEK" as FinancePeriodFilter, label: "Last 7 Days" },
    { id: "MONTH" as FinancePeriodFilter, label: "This Month" },
  ];

  useEffect(() => {
    if (!desktopParity) return;
    heroDecorDrift.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    heroStatPulse.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [desktopParity, heroDecorDrift, heroStatPulse]);

  const heroDecorAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(heroDecorDrift.value, [0, 1], [0, -6]) },
      { rotate: `${interpolate(heroDecorDrift.value, [0, 1], [10, 2])}deg` },
      { scale: interpolate(heroDecorDrift.value, [0, 1], [1, 1.04]) },
    ],
    opacity: interpolate(heroDecorDrift.value, [0, 1], [0.055, 0.1]),
  }));

  const heroStatPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(heroStatPulse.value, [0, 1], [1, 1.06]) }],
  }));

  if (!desktopParity) {
    return (
      <>
        <View style={[styles.darkBlock, { paddingTop: 0 }]}>
          <View style={styles.darkBlockContent}>
            <TreasurySummaryCard
              fullWidth
              topContent={
                omitTabRow ? undefined : (
                  <FinanceTabRow
                    treasuryInset
                    activeTab={activeTab}
                    onTabPress={onTabPress}
                    tabs={visibleTabs}
                  />
                )
              }
              totalIn={totalIn}
              totalOut={totalOut}
              labelIn={labelIn}
              labelOut={labelOut}
              cashDirectionFilter={cashDirectionFilter}
              onCashInPress={onCashInPress}
              onCashOutPress={onCashOutPress}
              ledgerCategory={ledgerCategory}
              onLedgerCategoryChange={onLedgerCategoryChange}
              allowedLedgerCategories={allowedLedgerCategories}
              searchQuery={searchQuery}
              onSearchChange={onSearchChange}
              searchPlaceholder={searchPlaceholder}
              onReportPress={onReportPress}
              entityFilter={entityFilter}
              onEntityFilterChange={onEntityFilterChange}
              entityFilterLabels={entityFilterLabels}
              garagePeriodOptions={garagePeriodOptions}
              garagePeriod={garagePeriod}
              onGaragePeriodChange={onGaragePeriodChange}
              garageViewTab={garageViewTab}
              onGarageViewTabChange={onGarageViewTabChange}
              driverViewTab={driverViewTab}
              onDriverViewTabChange={onDriverViewTabChange}
              customerViewTab={customerViewTab}
              onCustomerViewTabChange={onCustomerViewTabChange}
              supplierViewTab={supplierViewTab}
              onSupplierViewTabChange={onSupplierViewTabChange}
              onPartyAnalyticsPress={onPartyAnalyticsPress}
              showPeriodFilter={showPeriodFilter}
              periodFilter={periodFilter}
              onPeriodFilterChange={onPeriodFilterChange}
              sourceFilter={sourceFilter}
              onSourceFilterChange={onSourceFilterChange}
              amountAnimationResetKey={activeTab}
              cashNetworkLayout
              onClearFilters={onClearFilters}
              isAnyFilterActive={isAnyFilterActive}
            />
          </View>
        </View>
        {datePreset != null && (
          <View style={styles.financeDatePresetOutsideWrap}>
            <DatePresetPillBar
              variant="onLight"
              period={datePreset.period}
              onPeriodChange={datePreset.onPeriodChange}
              onCustomRangePress={datePreset.onCustomRangePress}
              customFrom={datePreset.customFrom}
              customTo={datePreset.customTo}
            />
          </View>
        )}
      </>
    );
  }

  return (
    <>
      <View style={styles.financeCardsBlock}>
        <View style={styles.financeCardsGrid}>
          <AnimatedFinanceHeroCard
            desktop={desktopParity}
            onPress={() => onTabPress("cash")}
          >
            <View
              style={[
                styles.financeBalanceCard,
                desktopParity && styles.financeBalanceCardDesktop,
                styles.financeBalanceCardHeroIntegrated,
              ]}
            >
              <Animated.View
                style={[
                  styles.financeBalanceDecorIconWrap,
                  heroDecorAnimatedStyle,
                ]}
              >
                <FontAwesome
                  name="briefcase"
                  size={desktopParity ? 118 : 92}
                  color={Theme.textOnDark}
                  style={styles.financeBalanceDecorIcon}
                />
              </Animated.View>
              <View style={styles.financeHeroPrimaryBlock}>
                <View style={styles.financeBalanceTopRow}>
                  <Text style={styles.financeBalanceEyebrow}>
                    Audited Operating Balance
                  </Text>
                  {datePreset != null && (
                    <View style={styles.financeRangeDesktopWrap}>
                      <View style={styles.financeRangeDesktopPillRow}>
                        {rangePills.map((pill) => {
                          const active = datePreset.period === pill.id;
                          return (
                            <Pressable
                              key={pill.id}
                              onPress={() => datePreset.onPeriodChange(pill.id)}
                              style={(state: HoverPressState) => [
                                styles.financeRangePill,
                                styles.financeRangePillDesktop,
                                active && styles.financeRangePillActive,
                                WEB_POINTER,
                                WEB_TRANSITION,
                                !active && isHovered(state) && hoverOnDarkWash,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.financeRangePillText,
                                  active && styles.financeRangePillTextActive,
                                ]}
                              >
                                {pill.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                        <Pressable
                          onPress={() => {
                            if (onQuickCustomRange) {
                              const now = new Date();
                              const from = new Date(
                                now.getFullYear(),
                                now.getMonth() - 1,
                                1,
                              );
                              const to = new Date(
                                now.getFullYear(),
                                now.getMonth(),
                                0,
                                23,
                                59,
                                59,
                              );
                              onQuickCustomRange(
                                from.toISOString(),
                                to.toISOString(),
                              );
                            }
                          }}
                          style={(state: HoverPressState) => [
                            styles.financeRangePill,
                            styles.financeRangePillDesktop,
                            datePreset.period === "CUSTOM" &&
                              styles.financeRangePillActive,
                            WEB_POINTER,
                            WEB_TRANSITION,
                            datePreset.period !== "CUSTOM" &&
                              isHovered(state) &&
                              hoverOnDarkWash,
                          ]}
                        >
                          <Text
                            style={[
                              styles.financeRangePillText,
                              datePreset.period === "CUSTOM" &&
                                styles.financeRangePillTextActive,
                            ]}
                          >
                            Last Month
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => datePreset.onCustomRangePress()}
                          style={(state: HoverPressState) => [
                            styles.financeRangePill,
                            styles.financeRangePillDesktop,
                            styles.financeRangePillCustom,
                            WEB_POINTER,
                            WEB_TRANSITION,
                            isHovered(state) && hoverOnDarkWash,
                          ]}
                        >
                          <FontAwesome
                            name="calendar"
                            size={10}
                            color={Theme.textOnDarkMuted}
                          />
                          <Text style={styles.financeRangePillText}>
                            Custom
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
                <Text style={styles.financeBalanceValue}>
                  {formatAmount(auditedNet)}
                </Text>
                <View style={styles.financeHeroFooterRow}>
                  <View style={styles.financeBalanceStatsRow}>
                    <View style={styles.financeBalanceStat}>
                      <Animated.View
                        style={[
                          styles.financeBalanceStatIconIn,
                          heroStatPulseStyle,
                        ]}
                      >
                        <FontAwesome
                          name="arrow-circle-down"
                          size={desktopParity ? 15 : 13}
                          color={Theme.textOnDark}
                        />
                      </Animated.View>
                      <View>
                        <Text style={styles.financeBalanceStatLabel}>
                          {labelIn}
                        </Text>
                        <Text style={styles.financeBalanceStatValue}>
                          {formatAmount(auditedIn)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.financeBalanceStat}>
                      <Animated.View
                        style={[
                          styles.financeBalanceStatIconOut,
                          heroStatPulseStyle,
                        ]}
                      >
                        <FontAwesome
                          name="arrow-circle-up"
                          size={desktopParity ? 15 : 13}
                          color={Theme.textOnDark}
                        />
                      </Animated.View>
                      <View>
                        <Text style={styles.financeBalanceStatLabel}>
                          {labelOut}
                        </Text>
                        <Text style={styles.financeBalanceStatValue}>
                          {formatAmount(auditedOut)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.financeHeroPillsDockInline}>
                    <FinanceTabRow
                      activeTab={activeTab}
                      onTabPress={onTabPress}
                      tabs={visibleTabs}
                    />
                  </View>
                </View>
              </View>
            </View>
          </AnimatedFinanceHeroCard>
        </View>
        <View style={styles.financeDesktopToolbarDock}>
          <TreasurySummaryCard
            fullWidth
            containerStyle={styles.financeDesktopToolbarCard}
            toolbarTheme="light"
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            searchPlaceholder={searchPlaceholder}
            onReportPress={onReportPress}
            entityFilter={entityFilter}
            onEntityFilterChange={onEntityFilterChange}
            entityFilterLabels={entityFilterLabels}
            garagePeriodOptions={garagePeriodOptions}
            garagePeriod={garagePeriod}
            onGaragePeriodChange={onGaragePeriodChange}
            garageViewTab={garageViewTab}
            onGarageViewTabChange={onGarageViewTabChange}
            driverViewTab={driverViewTab}
            onDriverViewTabChange={onDriverViewTabChange}
            customerViewTab={customerViewTab}
            onCustomerViewTabChange={onCustomerViewTabChange}
            supplierViewTab={supplierViewTab}
            onSupplierViewTabChange={onSupplierViewTabChange}
            onPartyAnalyticsPress={onPartyAnalyticsPress}
            showPeriodFilter={showPeriodFilter}
            periodFilter={periodFilter}
            onPeriodFilterChange={onPeriodFilterChange}
            sourceFilter={sourceFilter}
            onSourceFilterChange={onSourceFilterChange}
            ledgerCategory={ledgerCategory}
            onLedgerCategoryChange={onLedgerCategoryChange}
            allowedLedgerCategories={allowedLedgerCategories}
            cashNetworkLayout
            onClearFilters={onClearFilters}
            isAnyFilterActive={isAnyFilterActive}
          />
        </View>
      </View>
    </>
  );
}
