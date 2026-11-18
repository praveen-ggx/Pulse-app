import { SmartFilterButton, type SmartFilterKind } from "@/components/SmartFilterButton";
import Theme from "@/constants/Theme";
import { formatCalendarPeriodRangeLabel } from "@/lib/dateRangePresets";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Calendar, Layers, Truck, Wallet } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
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
import {
  FinanceFilterDockContext,
  type FinanceFilterDockParts,
} from "./financeFilterDock";
import { TreasurySummaryCard } from "./TreasurySummaryCard";

const LEDGER_CHOICE_LABELS: Record<LedgerCategory, { name: string; meta: string }> = {
  all: { name: "All", meta: "Every party" },
  customers: { name: "Customers", meta: "Client ledger" },
  suppliers: { name: "Suppliers", meta: "Supplier ledger" },
  vehicle: { name: "Vehicle", meta: "Vehicle ledger" },
  driver: { name: "Driver", meta: "Driver ledger" },
};

type FinanceSheetKind = "date" | "type" | "status" | "source";

function FinanceSmartFilter({
  datePreset,
  ledgerCategory,
  onLedgerCategoryChange,
  allowedLedgerCategories,
  entityFilter,
  onEntityFilterChange,
  entityFilterLabels,
  sourceFilter,
  onSourceFilterChange,
}: Pick<
  FinanceSummarySectionProps,
  | "datePreset"
  | "ledgerCategory"
  | "onLedgerCategoryChange"
  | "allowedLedgerCategories"
  | "entityFilter"
  | "onEntityFilterChange"
  | "entityFilterLabels"
  | "sourceFilter"
  | "onSourceFilterChange"
>) {
  const kinds = useMemo(() => {
    const next: SmartFilterKind<FinanceSheetKind>[] = [];
    if (datePreset) {
      const range =
        formatCalendarPeriodRangeLabel("CUSTOM", {
          customFrom: datePreset.customFrom,
          customTo: datePreset.customTo,
        }) ?? "Choose a start and end";
      next.push({
        id: "date",
        label: "Date",
        allLabel: "All dates",
        hint: "Which period to show",
        icon: Calendar,
        searchPlaceholder: "Search periods",
        selectedId: datePreset.period === "RANGE" ? null : datePreset.period,
        choices: [
          { id: "TODAY", name: "Today", meta: "Records from today" },
          { id: "YESTERDAY", name: "Yesterday", meta: "The day before" },
          { id: "WEEK", name: "This week", meta: "This calendar week" },
          { id: "MONTH", name: "This month", meta: "This calendar month" },
          { id: "CUSTOM", name: "Custom range", meta: range },
        ],
      });
    }
    if (onLedgerCategoryChange && ledgerCategory != null) {
      const allowed = allowedLedgerCategories ?? (["all", "customers", "suppliers", "vehicle", "driver"] as const);
      next.push({
        id: "type",
        label: "Type",
        allLabel: "All types",
        hint: "Which ledger to show",
        icon: Layers,
        searchPlaceholder: "Search types",
        selectedId: ledgerCategory === "all" ? null : ledgerCategory,
        choices: allowed
          .filter((id) => id !== "all")
          .map((id) => ({ id, name: LEDGER_CHOICE_LABELS[id].name, meta: LEDGER_CHOICE_LABELS[id].meta })),
      });
    }
    if (onEntityFilterChange) {
      const pending = entityFilterLabels?.has_due ?? "Has due";
      const clear = entityFilterLabels?.no_due ?? "No due";
      next.push({
        id: "status",
        label: "Status",
        allLabel: "All statuses",
        hint: "What is still open",
        icon: Wallet,
        searchPlaceholder: "Search statuses",
        selectedId: !entityFilter || entityFilter === "all" ? null : entityFilter,
        choices: [
          { id: "has_due", name: pending, meta: "Still outstanding" },
          { id: "no_due", name: clear, meta: "Nothing outstanding" },
        ],
      });
    }
    if (onSourceFilterChange && sourceFilter) {
      next.push({
        id: "source",
        label: "Source",
        allLabel: "All sources",
        hint: "Whose fleet carried it",
        icon: Truck,
        searchPlaceholder: "Search sources",
        selectedId: sourceFilter === "all" ? null : sourceFilter,
        choices: [
          { id: "asset", name: "Asset", meta: "Own fleet" },
          { id: "aggregate", name: "Aggregate", meta: "Market fleet" },
        ],
      });
    }
    return next;
  }, [
    allowedLedgerCategories,
    datePreset,
    entityFilter,
    entityFilterLabels,
    ledgerCategory,
    onEntityFilterChange,
    onLedgerCategoryChange,
    onSourceFilterChange,
    sourceFilter,
  ]);
  const [kind, setKind] = useState<FinanceSheetKind>("date");
  const active = kinds.some((item) => item.id === kind) ? kind : (kinds[0]?.id ?? "date");
  if (kinds.length === 0) return null;
  const dateName =
    datePreset?.period === "TODAY"
      ? "Today"
      : datePreset?.period === "YESTERDAY"
        ? "Yesterday"
        : datePreset?.period === "WEEK"
          ? "This week"
          : datePreset?.period === "MONTH"
            ? "This month"
            : datePreset?.period === "CUSTOM"
              ? "Custom"
              : null;
  const typeName =
    ledgerCategory && ledgerCategory !== "all" ? LEDGER_CHOICE_LABELS[ledgerCategory].name : null;
  const statusName =
    entityFilter === "has_due"
      ? (entityFilterLabels?.has_due ?? "Has due")
      : entityFilter === "no_due"
        ? (entityFilterLabels?.no_due ?? "No due")
        : null;
  const sourceName =
    sourceFilter === "asset" ? "Asset" : sourceFilter === "aggregate" ? "Aggregate" : null;
  const triggerLabel = dateName
    ? `Date · ${dateName}`
    : typeName
      ? `Type · ${typeName}`
      : statusName
        ? `Status · ${statusName}`
        : sourceName
          ? `Source · ${sourceName}`
          : "Filter";
  return (
    <SmartFilterButton
      title="Filter finance"
      triggerLabel={triggerLabel}
      triggerActive={triggerLabel !== "Filter"}
      kinds={kinds}
      kind={active}
      onKindChange={setKind}
      onSelect={(selectedKind, id) => {
        if (selectedKind === "date" && datePreset) {
          if (id == null) datePreset.onPeriodChange("RANGE");
          else if (id === "CUSTOM") datePreset.onCustomRangePress();
          else datePreset.onPeriodChange(id as FinancePeriodFilter);
          return;
        }
        if (selectedKind === "type" && onLedgerCategoryChange) {
          onLedgerCategoryChange((id ?? "all") as LedgerCategory);
          return;
        }
        if (selectedKind === "status" && onEntityFilterChange) {
          onEntityFilterChange((id ?? "all") as EntityListFilter);
          return;
        }
        if (selectedKind === "source" && onSourceFilterChange) {
          onSourceFilterChange((id ?? "all") as "all" | "asset" | "aggregate");
        }
      }}
    />
  );
}

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

  const [dockedFilters, setDockedFilters] = useState<FinanceFilterDockParts | null>(null);
  const publishDockedFilters = useCallback((parts: FinanceFilterDockParts | null) => {
    setDockedFilters(parts);
  }, []);

  if (!desktopParity) {
    return (
      <FinanceFilterDockContext.Provider value={publishDockedFilters}>
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
              hideSearch
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
              suppressSmartChoices
            />
          </View>
        </View>
        <View style={styles.financeDatePresetOutsideWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.financeFilterAlignRow}
          >
            <View style={styles.financeDockedSearch}>
              <FontAwesome name="search" size={12} color={Theme.textRouteCard} />
              <TextInput
                style={styles.financeDockedSearchInput}
                value={searchQuery}
                onChangeText={onSearchChange}
                placeholder={searchPlaceholder ?? "Find by name..."}
                placeholderTextColor={Theme.textRouteCard}
                returnKeyType="search"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              {searchQuery !== "" ? (
                <Pressable
                  onPress={() => onSearchChange("")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <FontAwesome name="times-circle" size={12} color={Theme.textRouteCard} />
                </Pressable>
              ) : null}
            </View>
            <FinanceSmartFilter
              datePreset={datePreset}
              ledgerCategory={ledgerCategory}
              onLedgerCategoryChange={onLedgerCategoryChange}
              allowedLedgerCategories={allowedLedgerCategories}
              entityFilter={entityFilter}
              onEntityFilterChange={onEntityFilterChange}
              entityFilterLabels={entityFilterLabels}
              sourceFilter={sourceFilter}
              onSourceFilterChange={onSourceFilterChange}
            />
            {dockedFilters?.filters}
            {dockedFilters?.actions != null ? (
              <View style={styles.financeDockedActions}>{dockedFilters.actions}</View>
            ) : null}
          </ScrollView>
        </View>
      </FinanceFilterDockContext.Provider>
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
            hideSearch
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
            toolbarLeading={
              <FinanceSmartFilter
                datePreset={datePreset}
                ledgerCategory={ledgerCategory}
                onLedgerCategoryChange={onLedgerCategoryChange}
                allowedLedgerCategories={allowedLedgerCategories}
                entityFilter={entityFilter}
                onEntityFilterChange={onEntityFilterChange}
                entityFilterLabels={entityFilterLabels}
                sourceFilter={sourceFilter}
                onSourceFilterChange={onSourceFilterChange}
              />
            }
            suppressSmartChoices
          />
        </View>
      </View>
    </>
  );
}
