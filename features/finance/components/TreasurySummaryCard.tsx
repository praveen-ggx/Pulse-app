/**
 * Single card: summary (Total In / Out) + toolbar (search, report icon, filter).
 * Animated icons, report icon-only, used on Treasury and Entity detail.
 */
import {
    CHAT_FILTER_MUTED,
    chatFilterChromeStyles as chatChrome,
} from "@/constants/ChatFilterChrome";
import { ChatFilterMirrorToggle } from "@/components/ChatFilterMirrorToggle";
import Theme from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ComponentProps,
    type ReactNode,
} from 'react';
import {
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    useWindowDimensions,
    View,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    runOnJS,
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FinancePeriodFilter, LedgerCategory } from '../types';

export type EntityListFilter = 'all' | 'has_due' | 'no_due';

export interface TreasurySummaryCardProps {
  /** When provided, summary row is shown at top of card */
  totalIn?: number;
  totalOut?: number;
  labelIn?: string;
  labelOut?: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  /** Omitted when the viewer lacks `finance.reports` — hides the Report action. */
  onReportPress?: () => void;
  entityFilter?: EntityListFilter;
  onEntityFilterChange?: (f: EntityListFilter) => void;
  showPeriodFilter?: boolean;
  periodFilter?: FinancePeriodFilter;
  onPeriodFilterChange?: (p: FinancePeriodFilter) => void;
  /** Ledger tab only: source filter (All / Asset / Aggregate) shown next to period filter. */
  sourceFilter?: 'all' | 'asset' | 'aggregate';
  onSourceFilterChange?: (s: 'all' | 'asset' | 'aggregate') => void;
  /** Rendered at top of card (e.g. merged tabs) */
  topContent?: ReactNode;
  /** When true, card has no horizontal margin and fits width */
  fullWidth?: boolean;
  /** When true, report/ledger icon is not shown in toolbar (e.g. moved to header). */
  hideReportInToolbar?: boolean;
  /** Override entity filter labels (e.g. Garage: "Has expense" / "No expense" instead of "Has due" / "No due"). */
  entityFilterLabels?: Partial<Record<EntityListFilter, string>>;
  /** Garage tab: period options (YTD 2026, MAR 2026, etc.) shown in same filter dropdown. */
  garagePeriodOptions?: { value: string; label: string }[];
  garagePeriod?: string;
  onGaragePeriodChange?: (value: string) => void;
  /** Garage tab: view/sort (Vehicle | Trips | Revenue | Profit | Analytics) in same filter dropdown. */
  garageViewTab?: 'vehicle' | 'trips' | 'revenue' | 'profit' | 'analytics';
  onGarageViewTabChange?: (value: 'vehicle' | 'trips' | 'revenue' | 'profit' | 'analytics') => void;
  /** Drivers tab: view mode (list | analytics) shown in filter dropdown. */
  driverViewTab?: 'list' | 'analytics';
  onDriverViewTabChange?: (value: 'list' | 'analytics') => void;
  /** Customers tab: view mode (list | analytics) shown in filter dropdown. */
  customerViewTab?: 'list' | 'analytics';
  onCustomerViewTabChange?: (value: 'list' | 'analytics') => void;
  /** Suppliers tab: view mode (list | analytics) shown in filter dropdown. */
  supplierViewTab?: 'list' | 'analytics';
  onSupplierViewTabChange?: (value: 'list' | 'analytics') => void;
  /** Vehicle detail: show margin % in the card (e.g. +90.5%) */
  marginPercent?: number | null;
  /** Ledger tab: filter by cash direction. When set, one of the summary cells is highlighted. */
  cashDirectionFilter?: 'all' | 'in' | 'out';
  /** Ledger tab: called when user taps the cash-in (left) summary cell. Toggle filter to in/all. */
  onCashInPress?: () => void;
  /** Ledger tab: called when user taps the cash-out (right) summary cell. Toggle filter to out/all. */
  onCashOutPress?: () => void;
  /** Cash tab: filter by ledger party category (All / Customers / Suppliers / Vehicle / Driver). */
  ledgerCategory?: LedgerCategory;
  onLedgerCategoryChange?: (c: LedgerCategory) => void;
  /** RBAC-allowed ledger categories for the type filter. */
  allowedLedgerCategories?: readonly LedgerCategory[];
  /** When entity filter row is shown, optional content to render on the right (e.g. view mode icons). */
  filterRowRight?: ReactNode;
  /**
   * When set (e.g. Finance sub-tab id), changing this restarts the summary amount count-up from 0.
   * Without it, amounts only animate when the numeric total changes (entity detail / other embeds).
   */
  amountAnimationResetKey?: string;
  /** Cash tab: match Network hub — fiscal tabs, then search row, then totals (flex order; same controls). */
  cashNetworkLayout?: boolean;
  /** When true, a "Clear" button is shown to reset filters. */
  onClearFilters?: () => void;
  isAnyFilterActive?: boolean;
  /** Optional container override for host-specific theming (e.g. desktop dock). */
  containerStyle?: StyleProp<ViewStyle>;
  /** Optional toolbar skin override for desktop-light surfaces. */
  toolbarTheme?: 'dark' | 'light';
}

const ENTITY_FILTER_LABELS: Record<EntityListFilter, string> = {
  all: 'All',
  has_due: 'Has due',
  no_due: 'No due',
};

const SOURCE_FILTER_LABELS: Record<'all' | 'asset' | 'aggregate', string> = {
  all: 'All',
  asset: 'Asset',
  aggregate: 'Aggregate',
};

const LEDGER_CATEGORY_LABELS: Record<LedgerCategory, string> = {
  all: 'All',
  customers: 'Customers',
  suppliers: 'Suppliers',
  vehicle: 'Vehicle',
  driver: 'Driver',
};

function formatAmount(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

const springConfig = { damping: 14, stiffness: 180 };

const AMOUNT_ANIMATION_DURATION = 420;

function AnimatedAmount({
  value,
  style,
  animationResetKey,
}: {
  value: number;
  style?: object;
  /** When defined, a change restarts the count from 0 (e.g. switching Finance sub-tabs). */
  animationResetKey?: string;
}) {
  const target = Number.isFinite(value) ? Math.round(value) : 0;
  const [displayValue, setDisplayValue] = useState(0);
  const shared = useSharedValue(0);
  const prevResetKeyRef = useRef<string | undefined>(undefined);

  const syncDisplay = useCallback((n: number) => {
    setDisplayValue(n);
  }, []);

  useEffect(() => {
    cancelAnimation(shared);

    const useResetKey = animationResetKey !== undefined;
    const segmentChanged =
      useResetKey && prevResetKeyRef.current !== animationResetKey;

    if (useResetKey) {
      prevResetKeyRef.current = animationResetKey;
    }

    if (segmentChanged) {
      shared.value = 0;
      setDisplayValue(0);
    }

    shared.value = withTiming(target, {
      duration: AMOUNT_ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
    });
  }, [target, animationResetKey, shared]);

  useAnimatedReaction(
    () => Math.round(shared.value),
    (current, previous) => {
      if (current !== previous) {
        runOnJS(syncDisplay)(current);
      }
    },
  );

  return <Text style={[styles.summaryValue, style]}>{formatAmount(displayValue)}</Text>;
}

function AnimatedIcon({
  name,
  size,
  color,
  style,
  pulse,
}: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  size: number;
  color: string;
  style?: object;
  pulse?: boolean;
}) {
  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (!pulse) return;
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * pulseScale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      <FontAwesome name={name} size={size} color={color} />
    </Animated.View>
  );
}

function PressableIcon({
  name,
  size,
  color,
  onPress,
  pulse,
  style,
}: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  size: number;
  color: string;
  onPress: () => void;
  pulse?: boolean;
  style?: object;
}) {
  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (!pulse) return;
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * pulseScale.value }],
  }));

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={1}
      onPressIn={() => {
        scale.value = withSpring(0.88, springConfig);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, springConfig);
      }}
      style={style}
    >
      <Animated.View style={animatedStyle}>
        <FontAwesome name={name} size={size} color={color} />
      </Animated.View>
    </TouchableOpacity>
  );
}

export function TreasurySummaryCard({
  totalIn = 0,
  totalOut = 0,
  labelIn,
  labelOut,
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search entities…',
  onReportPress,
  entityFilter = 'all',
  onEntityFilterChange,
  showPeriodFilter,
  periodFilter = 'MONTH',
  onPeriodFilterChange,
  sourceFilter = 'all',
  onSourceFilterChange,
  topContent,
  fullWidth = false,
  hideReportInToolbar = false,
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
  marginPercent,
  cashDirectionFilter = 'all',
  onCashInPress,
  onCashOutPress,
  ledgerCategory = 'all',
  onLedgerCategoryChange,
  allowedLedgerCategories,
  filterRowRight,
  amountAnimationResetKey,
  cashNetworkLayout = false,
  onClearFilters,
  isAnyFilterActive = false,
  containerStyle,
  toolbarTheme = 'dark',
}: TreasurySummaryCardProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  /** Stack search + filters; horizontal scroll for filters on narrow widths */
  const ledgerCategoryOptions = allowedLedgerCategories ??
    (['all', 'customers', 'suppliers', 'vehicle', 'driver'] as const);
  const compactToolbar = windowWidth < 560;
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const [showLedgerCategoryDropdown, setShowLedgerCategoryDropdown] = useState(false);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [dropdownAnchorY, setDropdownAnchorY] = useState(0);
  const refPeriodFilter = useRef<View>(null);
  const refSourceFilter = useRef<View>(null);

  const effectiveEntityFilterLabels = { ...ENTITY_FILTER_LABELS, ...entityFilterLabels };
  const showSummary = labelIn != null && labelOut != null;
  const isLightToolbar = toolbarTheme === 'light';
  const showInlineSourceChips =
    isLightToolbar &&
    cashNetworkLayout &&
    onEntityFilterChange == null &&
    onSourceFilterChange != null;
  /** Cash tab: Network-style toolbar (search above totals, entity chips in toolbar). */
  const cashNetworkToolbar =
    cashNetworkLayout &&
    (showSummary || showInlineSourceChips);
  const filterLabel =
    onEntityFilterChange != null
      ? effectiveEntityFilterLabels[entityFilter]
      : showPeriodFilter && onPeriodFilterChange
        ? periodFilter === 'MONTH'
          ? 'This month'
          : periodFilter === 'TODAY'
            ? 'Today'
            : periodFilter === 'YESTERDAY'
              ? 'Yesterday'
              : periodFilter === 'WEEK'
                ? 'This week'
                : periodFilter === 'RANGE'
                  ? 'All time'
                  : periodFilter === 'CUSTOM'
                    ? 'Custom'
                    : String(periodFilter)
        : cashNetworkToolbar &&
            onLedgerCategoryChange &&
            !showPeriodFilter &&
            !showInlineSourceChips
          ? LEDGER_CATEGORY_LABELS[ledgerCategory]
          : null;
  const sourceFilterLabel = onSourceFilterChange != null ? SOURCE_FILTER_LABELS[sourceFilter] : null;
  const showFilterDropdownOpen =
    (onEntityFilterChange != null && showFilterDropdown) ||
    (showPeriodFilter && onPeriodFilterChange && showPeriodDropdown) ||
    (onLedgerCategoryChange != null &&
      showLedgerCategoryDropdown &&
      cashNetworkToolbar &&
      !showPeriodFilter) ||
    (onSourceFilterChange != null && showSourceDropdown);

  const filterBtnScale = useSharedValue(1);
  const filterAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: filterBtnScale.value }],
  }));

  /** Entity filter is shown as Network-style chips in the toolbar; skip duplicate dropdown. */
  const hideEntityFilterDropdown =
    cashNetworkToolbar && onEntityFilterChange != null;

  const showLedgerCategoryInPeriodDropdown =
    cashNetworkToolbar && onEntityFilterChange == null && onLedgerCategoryChange != null;

  const periodAndSourceFilters = (
    <>
      {filterLabel != null && !hideEntityFilterDropdown && (
        <View
          ref={refPeriodFilter}
          style={styles.filterBlock as ViewStyle}
          collapsable={false}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              refPeriodFilter.current?.measureInWindow((_x, y, _w, h) => {
                setDropdownAnchorY(y + h + 6);
                if (onEntityFilterChange) {
                  setShowPeriodDropdown(false);
                  setShowSourceDropdown(false);
                  setShowLedgerCategoryDropdown(false);
                  setShowFilterDropdown((v) => !v);
                } else if (showPeriodFilter && onPeriodFilterChange) {
                  setShowFilterDropdown(false);
                  setShowSourceDropdown(false);
                  setShowLedgerCategoryDropdown(false);
                  setShowPeriodDropdown((v) => !v);
                } else if (
                  cashNetworkToolbar &&
                  onLedgerCategoryChange &&
                  !showPeriodFilter
                ) {
                  setShowFilterDropdown(false);
                  setShowPeriodDropdown(false);
                  setShowSourceDropdown(false);
                  setShowLedgerCategoryDropdown((v) => !v);
                }
              });
            }}
            onPressIn={() => {
              filterBtnScale.value = withSpring(0.92, springConfig);
            }}
            onPressOut={() => {
              filterBtnScale.value = withSpring(1, springConfig);
            }}
            style={styles.filterTrigger as ViewStyle}
          >
            <Animated.View
              style={[
                styles.filterTriggerInner as ViewStyle,
                isLightToolbar && (styles.filterTriggerInnerLight as ViewStyle),
                filterAnimatedStyle,
              ]}
            >
              <FontAwesome
                name="filter"
                size={11}
                color={isLightToolbar ? Theme.textPrimary : Theme.textOnDark}
              />
              <Text
                style={[
                  styles.filterTriggerText as TextStyle,
                  isLightToolbar && (styles.filterTriggerTextLight as TextStyle),
                ]}
                numberOfLines={1}
              >
                {filterLabel}
              </Text>
            </Animated.View>
          </TouchableOpacity>
          {showFilterDropdownOpen && (
            <Modal
              visible
              transparent
              animationType="fade"
              onRequestClose={() => {
                setShowFilterDropdown(false);
                setShowPeriodDropdown(false);
                setShowLedgerCategoryDropdown(false);
                setShowSourceDropdown(false);
              }}
            >
              <View style={styles.filterModalOverlay as ViewStyle}>
                <TouchableWithoutFeedback
                  onPress={() => {
                    setShowFilterDropdown(false);
                    setShowPeriodDropdown(false);
                    setShowLedgerCategoryDropdown(false);
                    setShowSourceDropdown(false);
                  }}
                >
                  <View style={StyleSheet.absoluteFill} />
                </TouchableWithoutFeedback>
                <View
                  style={[
                    styles.filterModalCardWrap as ViewStyle,
                    {
                      top:
                        dropdownAnchorY > 0
                          ? Math.max(insets.top + 12, dropdownAnchorY - 40)
                          : insets.top + 60,
                    },
                  ]}
                >
                  <View style={styles.filterModalCard}>
                    <View style={styles.filterModalHandle} />
                    {onEntityFilterChange && showFilterDropdown && (
                      <>
                        <View style={styles.filterModalSectionRow}>
                          <FontAwesome name="sitemap" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                          <Text style={styles.filterModalSectionLabel}>Entity</Text>
                        </View>
                        {(['all', 'has_due', 'no_due'] as const).map((f) => (
                          <TouchableOpacity
                            key={f}
                            style={[styles.dropdownItem, entityFilter === f && styles.dropdownItemActive]}
                            onPress={() => {
                              onEntityFilterChange(f);
                              setShowFilterDropdown(false);
                            }}
                            activeOpacity={0.75}
                          >
                            {entityFilter === f && <View style={styles.dropdownItemAccent} />}
                            <View style={[styles.dropdownItemIconWrap, entityFilter === f && styles.dropdownItemIconWrapActive]}>
                              <FontAwesome
                                name={f === 'all' ? 'list' : f === 'has_due' ? 'exclamation-circle' : 'check-circle'}
                                size={14}
                                color={entityFilter === f ? Theme.teslaRed : Theme.textMutedDemo}
                              />
                            </View>
                            <Text style={[styles.dropdownItemText, entityFilter === f && styles.dropdownItemTextActive]}>
                              {effectiveEntityFilterLabels[f]}
                            </Text>
                            {entityFilter === f && (
                              <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />
                            )}
                          </TouchableOpacity>
                        ))}
                        <View style={styles.filterModalDivider} />
                      </>
                    )}
                    {showFilterDropdown && garagePeriodOptions != null && garagePeriodOptions.length > 0 && onGaragePeriodChange != null && (
                      <>
                        <View style={styles.filterModalSectionRow}>
                          <FontAwesome name="calendar" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                          <Text style={styles.filterModalSectionLabel}>Period</Text>
                        </View>
                        {garagePeriodOptions.map((opt) => (
                          <TouchableOpacity
                            key={opt.value}
                            style={[styles.dropdownItem, garagePeriod === opt.value && styles.dropdownItemActive]}
                            onPress={() => {
                              onGaragePeriodChange(opt.value);
                              setShowFilterDropdown(false);
                            }}
                            activeOpacity={0.75}
                          >
                            {garagePeriod === opt.value && <View style={styles.dropdownItemAccent} />}
                            <View style={[styles.dropdownItemIconWrap, garagePeriod === opt.value && styles.dropdownItemIconWrapActive]}>
                              <FontAwesome
                                name="calendar"
                                size={14}
                                color={garagePeriod === opt.value ? Theme.teslaRed : Theme.textMutedDemo}
                              />
                            </View>
                            <Text style={[styles.dropdownItemText, garagePeriod === opt.value && styles.dropdownItemTextActive]}>
                              {opt.label}
                            </Text>
                            {garagePeriod === opt.value && (
                              <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />
                            )}
                          </TouchableOpacity>
                        ))}
                        <View style={styles.filterModalDivider} />
                      </>
                    )}
                    {showFilterDropdown && onGarageViewTabChange != null && garageViewTab != null && (
                      <>
                        <View style={styles.filterModalSectionRow}>
                          <FontAwesome name="sort" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                          <Text style={styles.filterModalSectionLabel}>View / Sort</Text>
                        </View>
                        {(['vehicle', 'trips', 'revenue', 'profit', 'analytics'] as const).map((v) => (
                          <TouchableOpacity
                            key={v}
                            style={[styles.dropdownItem, garageViewTab === v && styles.dropdownItemActive]}
                            onPress={() => {
                              onGarageViewTabChange(v);
                              setShowFilterDropdown(false);
                            }}
                            activeOpacity={0.75}
                          >
                            {garageViewTab === v && <View style={styles.dropdownItemAccent} />}
                            <View style={[styles.dropdownItemIconWrap, garageViewTab === v && styles.dropdownItemIconWrapActive]}>
                              <FontAwesome
                                name={v === 'vehicle' ? 'truck' : v === 'trips' ? 'road' : v === 'revenue' ? 'money' : v === 'analytics' ? 'line-chart' : 'bar-chart'}
                                size={14}
                                color={garageViewTab === v ? Theme.teslaRed : Theme.textMutedDemo}
                              />
                            </View>
                            <Text style={[styles.dropdownItemText, garageViewTab === v && styles.dropdownItemTextActive]}>
                              {v.charAt(0).toUpperCase() + v.slice(1)}
                            </Text>
                            {garageViewTab === v && (
                              <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />
                            )}
                          </TouchableOpacity>
                        ))}
                        <View style={styles.filterModalDivider} />
                      </>
                    )}
                    {showFilterDropdown && onDriverViewTabChange != null && driverViewTab != null && (
                      <>
                        <View style={styles.filterModalSectionRow}>
                          <FontAwesome name="sort" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                          <Text style={styles.filterModalSectionLabel}>Driver View</Text>
                        </View>
                        {(['list', 'analytics'] as const).map((v) => (
                          <TouchableOpacity
                            key={v}
                            style={[styles.dropdownItem, driverViewTab === v && styles.dropdownItemActive]}
                            onPress={() => {
                              onDriverViewTabChange(v);
                              setShowFilterDropdown(false);
                            }}
                            activeOpacity={0.75}
                          >
                            {driverViewTab === v && <View style={styles.dropdownItemAccent} />}
                            <View style={[styles.dropdownItemIconWrap, driverViewTab === v && styles.dropdownItemIconWrapActive]}>
                              <FontAwesome
                                name={v === 'analytics' ? 'line-chart' : 'list'}
                                size={14}
                                color={driverViewTab === v ? Theme.teslaRed : Theme.textMutedDemo}
                              />
                            </View>
                            <Text style={[styles.dropdownItemText, driverViewTab === v && styles.dropdownItemTextActive]}>
                              {v === 'analytics' ? 'Analytics' : 'Driver List'}
                            </Text>
                            {driverViewTab === v && (
                              <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />
                            )}
                          </TouchableOpacity>
                        ))}
                        <View style={styles.filterModalDivider} />
                      </>
                    )}
                    {showFilterDropdown && onCustomerViewTabChange != null && customerViewTab != null && (
                      <>
                        <View style={styles.filterModalSectionRow}>
                          <FontAwesome name="sort" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                          <Text style={styles.filterModalSectionLabel}>Customer View</Text>
                        </View>
                        {(['list', 'analytics'] as const).map((v) => (
                          <TouchableOpacity key={v} style={[styles.dropdownItem, customerViewTab === v && styles.dropdownItemActive]}
                            onPress={() => { onCustomerViewTabChange(v); setShowFilterDropdown(false); }} activeOpacity={0.75}>
                            {customerViewTab === v && <View style={styles.dropdownItemAccent} />}
                            <View style={[styles.dropdownItemIconWrap, customerViewTab === v && styles.dropdownItemIconWrapActive]}>
                              <FontAwesome name={v === 'analytics' ? 'line-chart' : 'users'} size={14}
                                color={customerViewTab === v ? Theme.teslaRed : Theme.textMutedDemo} />
                            </View>
                            <Text style={[styles.dropdownItemText, customerViewTab === v && styles.dropdownItemTextActive]}>
                              {v === 'analytics' ? 'Analytics' : 'Client List'}
                            </Text>
                            {customerViewTab === v && <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />}
                          </TouchableOpacity>
                        ))}
                        <View style={styles.filterModalDivider} />
                      </>
                    )}
                    {showFilterDropdown && onSupplierViewTabChange != null && supplierViewTab != null && (
                      <>
                        <View style={styles.filterModalSectionRow}>
                          <FontAwesome name="sort" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                          <Text style={styles.filterModalSectionLabel}>Supplier View</Text>
                        </View>
                        {(['list', 'analytics'] as const).map((v) => (
                          <TouchableOpacity key={v} style={[styles.dropdownItem, supplierViewTab === v && styles.dropdownItemActive]}
                            onPress={() => { onSupplierViewTabChange(v); setShowFilterDropdown(false); }} activeOpacity={0.75}>
                            {supplierViewTab === v && <View style={styles.dropdownItemAccent} />}
                            <View style={[styles.dropdownItemIconWrap, supplierViewTab === v && styles.dropdownItemIconWrapActive]}>
                              <FontAwesome name={v === 'analytics' ? 'line-chart' : 'truck'} size={14}
                                color={supplierViewTab === v ? Theme.teslaRed : Theme.textMutedDemo} />
                            </View>
                            <Text style={[styles.dropdownItemText, supplierViewTab === v && styles.dropdownItemTextActive]}>
                              {v === 'analytics' ? 'Analytics' : 'Supplier List'}
                            </Text>
                            {supplierViewTab === v && <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />}
                          </TouchableOpacity>
                        ))}
                        <View style={styles.filterModalDivider} />
                      </>
                    )}
                    {showPeriodFilter && onPeriodFilterChange && showPeriodDropdown && (
                      <>
                        <View style={styles.filterModalSectionRow}>
                          <FontAwesome name="calendar" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                          <Text style={styles.filterModalSectionLabel}>Date range</Text>
                        </View>
                        {(['TODAY', 'MONTH', 'RANGE'] as const).map((p) => (
                          <TouchableOpacity
                            key={p}
                            style={[styles.dropdownItem, periodFilter === p && styles.dropdownItemActive]}
                            onPress={() => {
                              onPeriodFilterChange(p);
                              setShowPeriodDropdown(false);
                              setShowLedgerCategoryDropdown(false);
                            }}
                            activeOpacity={0.75}
                          >
                            {periodFilter === p && <View style={styles.dropdownItemAccent} />}
                            <View style={[styles.dropdownItemIconWrap, periodFilter === p && styles.dropdownItemIconWrapActive]}>
                              <FontAwesome
                                name={p === 'TODAY' ? 'calendar' : p === 'MONTH' ? 'calendar-check-o' : 'calendar-plus-o'}
                                size={14}
                                color={periodFilter === p ? Theme.teslaRed : Theme.textMutedDemo}
                              />
                            </View>
                            <Text style={[styles.dropdownItemText, periodFilter === p && styles.dropdownItemTextActive]}>
                              {p === 'MONTH' ? 'This month' : p.charAt(0) + p.slice(1).toLowerCase()}
                            </Text>
                            {periodFilter === p && (
                              <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />
                            )}
                          </TouchableOpacity>
                        ))}

                        {showLedgerCategoryInPeriodDropdown && (
                          <>
                            <View style={styles.filterModalDivider} />
                            <View style={styles.filterModalSectionRow}>
                              <FontAwesome name="users" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                              <Text style={styles.filterModalSectionLabel}>Type</Text>
                            </View>
                            {ledgerCategoryOptions.map((c) => (
                              <TouchableOpacity
                                key={c}
                                style={[styles.dropdownItem, ledgerCategory === c && styles.dropdownItemActive]}
                                onPress={() => {
                                  onLedgerCategoryChange?.(c);
                                  setShowFilterDropdown(false);
                                  setShowPeriodDropdown(false);
                                  setShowSourceDropdown(false);
                                }}
                                activeOpacity={0.75}
                              >
                                {ledgerCategory === c && <View style={styles.dropdownItemAccent} />}
                                <View style={[styles.dropdownItemIconWrap, ledgerCategory === c && styles.dropdownItemIconWrapActive]}>
                                  <FontAwesome
                                    name={
                                      (c === "all"
                                        ? "list"
                                        : c === "customers"
                                          ? "building"
                                          : c === "suppliers"
                                            ? "warehouse"
                                            : c === "vehicle"
                                              ? "truck"
                                              : "user") as ComponentProps<
                                        typeof FontAwesome
                                      >["name"]
                                    }
                                    size={14}
                                    color={ledgerCategory === c ? Theme.teslaRed : Theme.textMutedDemo}
                                  />
                                </View>
                                <Text style={[styles.dropdownItemText, ledgerCategory === c && styles.dropdownItemTextActive]}>
                                  {LEDGER_CATEGORY_LABELS[c]}
                                </Text>
                                {ledgerCategory === c && (
                                  <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />
                                )}
                              </TouchableOpacity>
                            ))}
                          </>
                        )}
                      </>
                    )}
                    {showLedgerCategoryDropdown &&
                      onLedgerCategoryChange &&
                      !showPeriodFilter && (
                      <>
                        <View style={styles.filterModalSectionRow}>
                          <FontAwesome name="users" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                          <Text style={styles.filterModalSectionLabel}>Type</Text>
                        </View>
                        {ledgerCategoryOptions.map((c) => (
                          <TouchableOpacity
                            key={c}
                            style={[styles.dropdownItem, ledgerCategory === c && styles.dropdownItemActive]}
                            onPress={() => {
                              onLedgerCategoryChange(c);
                              setShowFilterDropdown(false);
                              setShowPeriodDropdown(false);
                              setShowLedgerCategoryDropdown(false);
                              setShowSourceDropdown(false);
                            }}
                            activeOpacity={0.75}
                          >
                            {ledgerCategory === c && <View style={styles.dropdownItemAccent} />}
                            <View style={[styles.dropdownItemIconWrap, ledgerCategory === c && styles.dropdownItemIconWrapActive]}>
                              <FontAwesome
                                name={
                                  (c === "all"
                                    ? "list"
                                    : c === "customers"
                                      ? "building"
                                      : c === "suppliers"
                                        ? "warehouse"
                                        : c === "vehicle"
                                          ? "truck"
                                          : "user") as ComponentProps<
                                    typeof FontAwesome
                                  >["name"]
                                }
                                size={14}
                                color={ledgerCategory === c ? Theme.teslaRed : Theme.textMutedDemo}
                              />
                            </View>
                            <Text style={[styles.dropdownItemText, ledgerCategory === c && styles.dropdownItemTextActive]}>
                              {LEDGER_CATEGORY_LABELS[c]}
                            </Text>
                            {ledgerCategory === c && (
                              <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </>
                    )}
                    {onSourceFilterChange && showSourceDropdown && (
                      <>
                        <View style={styles.filterModalSectionRow}>
                          <FontAwesome name="database" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                          <Text style={styles.filterModalSectionLabel}>Source</Text>
                        </View>
                        {(['all', 'asset', 'aggregate'] as const).map((s) => (
                          <TouchableOpacity
                            key={s}
                            style={[styles.dropdownItem, sourceFilter === s && styles.dropdownItemActive]}
                            onPress={() => {
                              onSourceFilterChange(s);
                              setShowSourceDropdown(false);
                            }}
                            activeOpacity={0.75}
                          >
                            {sourceFilter === s && <View style={styles.dropdownItemAccent} />}
                            <View style={[styles.dropdownItemIconWrap, sourceFilter === s && styles.dropdownItemIconWrapActive]}>
                              <FontAwesome
                                name={s === 'all' ? 'list' : s === 'asset' ? 'truck' : 'sitemap'}
                                size={14}
                                color={sourceFilter === s ? Theme.teslaRed : Theme.textMutedDemo}
                              />
                            </View>
                            <Text style={[styles.dropdownItemText, sourceFilter === s && styles.dropdownItemTextActive]}>
                              {SOURCE_FILTER_LABELS[s]}
                            </Text>
                            {sourceFilter === s && (
                              <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </>
                    )}
                  </View>
                </View>
              </View>
            </Modal>
          )}
        </View>
      )}
      {sourceFilterLabel != null && !showInlineSourceChips && (
        <View
          ref={refSourceFilter}
          style={styles.filterBlock as ViewStyle}
          collapsable={false}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              refSourceFilter.current?.measureInWindow((_x, y, _w, h) => {
                setDropdownAnchorY(y + h + 6);
                setShowFilterDropdown(false);
                setShowPeriodDropdown(false);
                setShowLedgerCategoryDropdown(false);
                setShowSourceDropdown((v) => !v);
              });
            }}
            onPressIn={() => {
              filterBtnScale.value = withSpring(0.92, springConfig);
            }}
            onPressOut={() => {
              filterBtnScale.value = withSpring(1, springConfig);
            }}
            style={styles.filterTrigger as ViewStyle}
          >
            <Animated.View
              style={[
                styles.filterTriggerInner as ViewStyle,
                isLightToolbar && (styles.filterTriggerInnerLight as ViewStyle),
                filterAnimatedStyle,
              ]}
            >
              <FontAwesome
                name="database"
                size={11}
                color={isLightToolbar ? Theme.textPrimary : Theme.textOnDark}
              />
              <Text
                style={[
                  styles.filterTriggerText as TextStyle,
                  isLightToolbar && (styles.filterTriggerTextLight as TextStyle),
                ]}
                numberOfLines={1}
              >
                {sourceFilterLabel}
              </Text>
            </Animated.View>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  const toolbarOnly = fullWidth && !showSummary;
  return (
    <View style={[
      styles.card,
      fullWidth && styles.cardFullWidth,
      toolbarOnly && styles.cardFullWidthToolbarOnly,
      containerStyle,
    ]}>
      {topContent != null && (
        <View style={[styles.topContent, cashNetworkLayout && styles.topContentNetwork]}>
          {topContent}
        </View>
      )}
      {!cashNetworkLayout && showSummary && onEntityFilterChange != null &&
        (filterRowRight != null ? (
          <View style={styles.filterRowWrap}>
            <View style={[styles.statusPillRow, styles.statusPillRowInWrap]}>
              {(['all', 'has_due', 'no_due'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.statusPill, entityFilter === f && styles.statusPillActive]}
                  onPress={() => onEntityFilterChange(f)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.statusPillText, entityFilter === f && styles.statusPillTextActive]}>
                    {effectiveEntityFilterLabels[f]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.filterRowRight}>{filterRowRight}</View>
          </View>
        ) : (
          <View style={styles.statusPillRow}>
            {(['all', 'has_due', 'no_due'] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.statusPill, entityFilter === f && styles.statusPillActive]}
                onPress={() => onEntityFilterChange(f)}
                activeOpacity={0.8}
              >
                <Text style={[styles.statusPillText, entityFilter === f && styles.statusPillTextActive]}>
                  {effectiveEntityFilterLabels[f]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      <View
        style={[
          styles.summaryToolbarStack,
          cashNetworkLayout && showSummary && styles.cashNetworkOrderedWrap,
        ]}
      >
      {showSummary && (
        <>
          <View
            style={[
              styles.summaryRow,
              cashNetworkLayout && showSummary && styles.summaryRowNetwork,
              cashNetworkLayout && showSummary && styles.summaryOrderAfterToolbar,
            ]}
          >
            {onCashInPress != null ? (
              <Pressable
                style={[
                  styles.summaryCell,
                  marginPercent != null && !Number.isNaN(marginPercent) && styles.summaryCellThird,
                  cashDirectionFilter === 'in' && styles.summaryCellActive,
                ]}
                onPress={onCashInPress}
                android_ripple={undefined}
              >
                <View style={styles.labelRow}>
                  <AnimatedIcon
                    name="arrow-circle-up"
                    size={14}
                    color={Theme.darkGreen}
                    pulse
                  />
                  <Text style={styles.summaryLabel}>{labelIn}</Text>
                </View>
                <AnimatedAmount value={totalIn} animationResetKey={amountAnimationResetKey} />
              </Pressable>
            ) : (
              <View style={[styles.summaryCell, marginPercent != null && !Number.isNaN(marginPercent) && styles.summaryCellThird]}>
                <View style={styles.labelRow}>
                  <AnimatedIcon
                    name="arrow-circle-up"
                    size={14}
                    color={Theme.darkGreen}
                    pulse
                  />
                  <Text style={styles.summaryLabel}>{labelIn}</Text>
                </View>
                <AnimatedAmount value={totalIn} animationResetKey={amountAnimationResetKey} />
              </View>
            )}
            {marginPercent != null && !Number.isNaN(marginPercent) && (
              <View style={[styles.summaryCell, styles.summaryCellCenter]}>
                <Text style={styles.summaryLabel}>Margin</Text>
                <Text
                  style={[
                    styles.summaryValue,
                    styles.marginValue,
                    marginPercent > 0 && styles.marginValuePositive,
                    marginPercent < 0 && styles.marginValueNegative,
                  ]}
                >
                  {marginPercent > 0 ? '+' : ''}{marginPercent.toFixed(1)}%
                </Text>
              </View>
            )}
            {onCashOutPress != null ? (
              <Pressable
                style={[
                  styles.summaryCell,
                  styles.summaryCellRight,
                  marginPercent != null && !Number.isNaN(marginPercent) && styles.summaryCellThird,
                  cashDirectionFilter === 'out' && styles.summaryCellActive,
                ]}
                onPress={onCashOutPress}
                android_ripple={undefined}
              >
                <View style={styles.labelRowRight}>
                  <Text style={styles.summaryLabel}>{labelOut}</Text>
                  <AnimatedIcon
                    name="arrow-circle-down"
                    size={14}
                    color={Theme.teslaRed}
                    pulse
                  />
                </View>
                <AnimatedAmount value={totalOut} animationResetKey={amountAnimationResetKey} />
              </Pressable>
            ) : (
              <View style={[
                styles.summaryCell,
                styles.summaryCellRight,
                marginPercent != null && !Number.isNaN(marginPercent) && styles.summaryCellThird,
              ]}>
                <View style={styles.labelRowRight}>
                  <Text style={styles.summaryLabel}>{labelOut}</Text>
                  <AnimatedIcon
                    name="arrow-circle-down"
                    size={14}
                    color={Theme.teslaRed}
                    pulse
                  />
                </View>
                <AnimatedAmount value={totalOut} animationResetKey={amountAnimationResetKey} />
              </View>
            )}
          </View>
          <View
            style={[
              styles.divider,
              fullWidth && styles.dividerInFullWidth,
              cashNetworkLayout && showSummary && styles.dividerCashNetwork,
              cashNetworkLayout && showSummary && styles.dividerOrderBetween,
            ]}
          />
        </>
      )}

      {cashNetworkToolbar ? (
        <View
          style={[
            styles.toolbarRow,
            styles.toolbarRowNetwork,
            styles.toolbarOrderFirst,
          ]}
        >
          <View style={[styles.toolbarLeft, styles.toolbarLeftNetwork]}>
            <View
              style={[
                chatChrome.toolbarStack,
                showInlineSourceChips && styles.toolbarStackInlineChips,
              ]}
            >
              {showInlineSourceChips ? (
                <ChatFilterMirrorToggle
                  style={styles.toolbarStackInlineChipsTabRow}
                  activeId={sourceFilter}
                  onSelect={(id) => onSourceFilterChange?.(id as typeof sourceFilter)}
                  items={(["all", "asset", "aggregate"] as const).map((s) => ({
                    id: s,
                    label: SOURCE_FILTER_LABELS[s],
                    icon:
                      s === "all" ? "list" : s === "asset" ? "truck" : "sitemap",
                  }))}
                />
              ) : null}

              <View
                style={[
                  chatChrome.searchScopeStrip,
                  showInlineSourceChips && styles.toolbarStackInlineChipsSearch,
                ]}
              >
                <View style={chatChrome.searchWrap}>
                  <AnimatedIcon
                    name="search"
                    size={12}
                    color="#94a3b8"
                    style={styles.searchIcon}
                  />
                  <TextInput
                    style={[
                      chatChrome.searchInput,
                      Platform.OS === "web" &&
                        ({ outlineStyle: "none" } as unknown as TextStyle),
                    ]}
                    value={searchQuery}
                    onChangeText={onSearchChange}
                    placeholder={searchPlaceholder}
                    placeholderTextColor="#94a3b8"
                    returnKeyType="search"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  {searchQuery !== "" ? (
                    <TouchableOpacity
                      onPress={() => onSearchChange("")}
                      style={styles.searchClearIcon}
                      hitSlop={8}
                    >
                      <FontAwesome
                        name="times-circle"
                        size={12}
                        color="#94a3b8"
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {onEntityFilterChange != null ? (
                  <View style={chatChrome.scopeSegment}>
                    {(["all", "has_due", "no_due"] as const).map((f) => {
                      const active = entityFilter === f;
                      return (
                        <TouchableOpacity
                          key={f}
                          style={[
                            chatChrome.scopePill,
                            active && chatChrome.scopePillActive,
                          ]}
                          onPress={() => onEntityFilterChange(f)}
                          activeOpacity={0.82}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: active }}
                        >
                          <Text
                            style={[
                              chatChrome.scopePillText,
                              active && chatChrome.scopePillTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {effectiveEntityFilterLabels[f]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}

                {onEntityFilterChange == null ? periodAndSourceFilters : null}

                {isAnyFilterActive ? (
                  <TouchableOpacity
                    onPress={onClearFilters}
                    activeOpacity={0.7}
                    style={[
                      chatChrome.scopePill,
                      styles.clearFiltersBtnChat,
                    ]}
                  >
                    <FontAwesome name="times" size={10} color={CHAT_FILTER_MUTED} />
                  </TouchableOpacity>
                ) : null}

                {filterRowRight != null ? (
                  <View style={styles.filterRowRight}>{filterRowRight}</View>
                ) : null}
              </View>
            </View>

            {onEntityFilterChange != null ? periodAndSourceFilters : null}
          </View>

          {!hideReportInToolbar && onReportPress && (
            <PressableIcon
              name="file-text-o"
              size={11}
              color={isLightToolbar ? Theme.textPrimary : Theme.textOnDark}
              onPress={onReportPress}
              pulse
              style={[
                styles.reportIconBtn,
                isLightToolbar && styles.reportIconBtnLight,
              ]}
            />
          )}
        </View>
      ) : (
        <View style={[styles.toolbarRow, compactToolbar && styles.toolbarRowStacked]}>
          <View style={[styles.searchWrap, compactToolbar && styles.searchWrapStacked]}>
            <AnimatedIcon name="search" size={11} color={Theme.textMutedDemo} style={styles.searchIcon} />
            <TextInput
              style={[
                styles.searchInput,
                isLightToolbar && styles.searchInputLight,
                Platform.OS === "web" &&
                  ({ outlineStyle: "none" } as unknown as TextStyle),
              ]}
              value={searchQuery}
              onChangeText={onSearchChange}
              placeholder={searchPlaceholder}
              placeholderTextColor={Theme.textMutedDemo}
              returnKeyType="search"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.toolbarFiltersScroll, compactToolbar && styles.toolbarFiltersScrollStacked]}
            contentContainerStyle={styles.toolbarFiltersContent}
          >
            {periodAndSourceFilters}
            {isAnyFilterActive && (
              <TouchableOpacity
                onPress={onClearFilters}
                activeOpacity={0.7}
                style={[
                  styles.clearFiltersBtn,
                  isLightToolbar && styles.clearFiltersBtnLight,
                ]}
              >
                <FontAwesome
                  name="times"
                  size={10}
                  color={isLightToolbar ? Theme.textPrimary : Theme.textOnDark}
                />
                <Text
                  style={[
                    styles.clearFiltersText,
                    isLightToolbar && styles.clearFiltersTextLight,
                  ]}
                >
                  Clear
                </Text>
              </TouchableOpacity>
            )}
            {!hideReportInToolbar && onReportPress && (
              <PressableIcon
                name="file-text-o"
                size={11}
                color={isLightToolbar ? Theme.textPrimary : Theme.textOnDark}
                onPress={onReportPress}
                pulse
                style={[
                  styles.reportIconBtn,
                  isLightToolbar && styles.reportIconBtnLight,
                ]}
              />
            )}
          </ScrollView>
        </View>
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 8,
    marginBottom: 8,
    backgroundColor: Theme.financeHeroBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    overflow: 'visible',
    padding: 12,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0px 2px 6px 0px rgba(0, 0, 0, 0.15)" } as ViewStyle)
      : ({
          shadowColor: Theme.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 6,
          elevation: 4,
        } as ViewStyle)),
  },
  cardFullWidth: {
    marginHorizontal: 0,
    marginBottom: 0,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  cardFullWidthToolbarOnly: {
    paddingTop: 0,
  },
  topContent: {
    marginBottom: 10,
    marginHorizontal: -12,
  },
  /** Network hub: spacing under horizontal segment tabs (fiscal tabs). */
  topContentNetwork: {
    marginBottom: 8,
    paddingTop: 8,
  },
  /** Wraps summary + divider + toolbar so Cash can reorder like Network (search before totals). */
  summaryToolbarStack: {
    flexDirection: 'column',
  },
  cashNetworkOrderedWrap: {},
  summaryOrderAfterToolbar: {
    order: 1,
  },
  dividerOrderBetween: {
    order: 2,
  },
  toolbarOrderFirst: {
    order: 3,
  },
  /** Network searchRowDark-style toolbar row */
  toolbarRowNetwork: {
    paddingTop: 10,
    gap: 8,
  },
  toolbarLeft: {
    flex: 1,
    minWidth: 0,
  },
  toolbarLeftNetwork: {
    gap: 8,
  },
  /** Cash-network toolbar override: when the ALL / Asset / Aggregate
   *  source chips are inline, lay them out side-by-side with the search
   *  field on a single row instead of stacking. Equal flex weights keep
   *  the tab tray and search field visually balanced. */
  toolbarStackInlineChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolbarStackInlineChipsTabRow: {
    flex: 1,
    minWidth: 0,
  },
  toolbarStackInlineChipsSearch: {
    flex: 1,
    minWidth: 0,
    width: 'auto',
  },
  /** Same row as Network hub: search (flex) + pill group + optional trailing actions. */
  networkSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    minWidth: 0,
  },
  /** Network `typeFilterWrapDark`: single pill rail for ALL / … filters. */
  networkEntityChipsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    backgroundColor: Theme.darkSurface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 3,
  },
  /** Matches `app/(tabs)/network.tsx` typeFilterChipDark. */
  networkTypeChip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
  },
  networkTypeChipActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  networkTypeChipText: {
    fontSize: 8,
    fontWeight: '500',
    color: Theme.textOnDarkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  networkTypeChipTextActive: {
    color: Theme.textOnDark,
  },
  statusPillRowNetwork: {
    marginBottom: 0,
    gap: 3,
  },
  statusPillNetwork: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillTextNetwork: {
    fontSize: 8,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  /** Network searchWrapDark */
  searchWrapNetwork: {
    minHeight: 38,
    borderRadius: 11,
    backgroundColor: Theme.darkSurface,
    borderWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  searchWrapNetworkLight: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  searchInputNetwork: {
    fontSize: 11,
    lineHeight: 14,
    color: Theme.textOnDark,
  },
  searchInputNetworkLight: {
    color: Theme.textPrimary,
  },
  /** Totals band sits below search (Network: content below black block). */
  summaryRowNetwork: {
    marginTop: 0,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.separatorDark,
  },
  dividerCashNetwork: {},
  filterRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    marginHorizontal: 0,
  },
  filterRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusPillRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
    marginHorizontal: 0,
  },
  statusPillRowInWrap: {
    marginBottom: 0,
  },
  statusPill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statusPillActive: {
    backgroundColor: Theme.teslaRed,
    borderColor: Theme.teslaRed,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '600',
    color: Theme.textOnDarkMuted,
  },
  statusPillTextActive: {
    color: '#fff',
  },
  summaryRow: {
    flexDirection: 'row',
  },
  summaryCell: {
    flex: 1,
    paddingVertical: 2,
    paddingRight: 12,
  },
  summaryCellRight: {
    alignItems: 'flex-end',
    paddingRight: 0,
    paddingLeft: 12,
  },
  summaryCellThird: {
    flex: 1,
    maxWidth: undefined,
  },
  summaryCellCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 12,
    paddingRight: 0,
  },
  summaryCellActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  labelRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: Theme.textOnDark,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.textOnDark,
    letterSpacing: -0.3,
  },
  marginValue: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginTop: 4,
  },
  marginValuePositive: {
    color: Theme.darkGreen,
  },
  marginValueNegative: {
    color: Theme.teslaRed,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.separatorDark,
    marginVertical: 4,
  },
  dividerInFullWidth: {
    height: 0,
    marginVertical: 0,
    backgroundColor: 'transparent',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
  },
  /** Narrow screens: search full width, filters in horizontal row below */
  toolbarRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  toolbarFiltersScroll: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    maxWidth: '100%',
  },
  toolbarFiltersScrollStacked: {
    width: '100%',
    maxWidth: '100%',
  },
  toolbarFiltersContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    paddingRight: 4,
  },
  searchWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    borderWidth: 0,
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 6,
  },
  searchWrapStacked: {
    flex: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textOnDark,
    paddingVertical: 0,
    minWidth: 0,
  },
  /** Light toolbar (finance desktop dock): dark text, like the Clear / Report buttons. */
  searchInputLight: {
    color: Theme.textPrimary,
  },
  reportIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportIconBtnLight: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.borderLight,
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 4,
  },
  clearFiltersBtnLight: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.borderLight,
  },
  clearFiltersText: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.textOnDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearFiltersTextLight: {
    color: Theme.textPrimary,
  },
  searchClearIcon: {
    padding: 4,
    marginRight: -4,
  },
  filterBlock: {
    position: 'relative',
    minWidth: 72,
    zIndex: 1000,
    elevation: 1000,
  },
  filterTrigger: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  filterTriggerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.financeHeroBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 5,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0px 1px 2px 0px rgba(0, 0, 0, 0.12)" } as ViewStyle)
      : ({
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.12,
          shadowRadius: 2,
          elevation: 2,
        } as ViewStyle)),
  },
  filterTriggerInnerLight: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.borderLight,
  },
  filterTriggerText: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.textOnDark,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  filterTriggerTextLight: {
    color: Theme.textPrimary,
  },
  inlineSourceChipRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  inlineSourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  inlineSourceChipLight: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.borderLight,
  },
  inlineSourceChipActive: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.28)',
  },
  inlineSourceChipActiveLight: {
    backgroundColor: Theme.surface,
    borderColor: Theme.textSecondary,
  },
  inlineSourceChipText: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.textOnDarkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  inlineSourceChipTextLight: {
    color: Theme.textSecondary,
  },
  inlineSourceChipTextActive: {
    color: Theme.textOnDark,
  },
  inlineSourceChipTextActiveLight: {
    color: Theme.textPrimary,
  },
  clearFiltersBtnChat: {
    minWidth: 34,
    maxWidth: 34,
    paddingHorizontal: 0,
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  filterModalCardWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  filterModalCard: {
    width: 280,
    maxWidth: '100%',
    alignSelf: 'center',
    backgroundColor: Theme.financeHeroBg,
    borderTopWidth: 2,
    borderTopColor: Theme.teslaRed,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0px 3px 8px 0px rgba(0, 0, 0, 0.22)" } as ViewStyle)
      : ({
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.22,
          shadowRadius: 8,
          elevation: 12,
        } as ViewStyle)),
    overflow: 'hidden',
  },
  filterModalHandle: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 8,
  },
  filterModalSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 0,
  },
  filterModalSectionIcon: {
    marginRight: 6,
  },
  filterModalSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textMutedDemo,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  filterModalDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 10,
    marginLeft: -20,
    marginRight: -20,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 6,
    minWidth: 132,
    backgroundColor: Theme.financeHeroBg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    padding: 8,
    zIndex: 10000,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0px 4px 12px 0px rgba(0, 0, 0, 0.3)" } as ViewStyle)
      : ({
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 10000,
        } as ViewStyle)),
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 0,
    position: 'relative' as const,
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dropdownItemAccent: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
    backgroundColor: Theme.teslaRed,
  },
  dropdownItemIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  dropdownItemIconWrapActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  dropdownItemText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textOnDark,
    textTransform: 'capitalize',
    letterSpacing: 0.2,
  },
  dropdownItemTextActive: {
    color: Theme.textOnDark,
    fontWeight: '700',
  },
  dropdownItemCheck: {
    marginLeft: 6,
  },
  // Web boxShadow + mixed View/Text styles: RN StyleSheet inference widens every key
  // to ViewStyle|TextStyle|ImageStyle without this assertion (151 TS errors at use sites).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- StyleSheet.create key widening
} as any);
