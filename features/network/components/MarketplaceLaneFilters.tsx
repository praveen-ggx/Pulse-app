/**
 * Separate Pickup / Drop / Vehicle filters. Each chip opens the same
 * available-option list for that field (drop and vehicle stay cascade-narrowed).
 * Options and counts come from canonical pool membership, the same identity
 * Marketplace pools and Network Indent Pools use.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type {
  MarketplaceLoadSearch,
  MarketplaceSearchLane,
} from "@/features/network/utils/marketplaceSearch.util";
import { groupLocationOptions } from "@/features/network/utils/marketplaceLocationGroups.util";
import { groupVehicleOptions } from "@/features/network/utils/marketplaceVehicleGroups.util";
import {
  canonicalPoolField,
  laneSelectionFromSearch,
  laneSelectionToSearch,
  normalizeLaneSelection,
  selectionFieldOptions,
  type LaneSelection,
  type PoolFieldOption,
} from "@/features/network/utils/pooledOpportunity.util";
import { routeEndpointLines } from "@/features/network/utils/storyDisplay";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  Flag,
  Flame,
  MapPin,
  Search,
  Truck,
  X,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Field = "pickup" | "drop" | "vehicle";

const FIELD_META: Record<
  Field,
  {
    step: string;
    label: string;
    boardName: string;
    listTitle: string;
    placeholder: string;
    search: string;
    noun: string;
    a11y: string;
    iconBg: string;
    iconOn: string;
    chipOn: string;
    borderOn: string;
  }
> = {
  pickup: {
    step: "01",
    label: "Pickup",
    boardName: "From",
    listTitle: "Pickup locations",
    placeholder: "Where it starts",
    search: "Search city, state or region",
    noun: "Pickup",
    a11y: "Pickup city",
    iconBg: Theme.brandBlueSoft,
    iconOn: Theme.primaryLight,
    chipOn: Theme.brandBlueWashSubtle,
    borderOn: Theme.primary,
  },
  drop: {
    step: "02",
    label: "Drop",
    boardName: "To",
    listTitle: "Drop locations",
    placeholder: "Where it ends",
    search: "Search city, state or region",
    noun: "Drop",
    a11y: "Drop city",
    iconBg: Theme.positiveMuted,
    iconOn: Theme.positiveMuted,
    chipOn: Theme.positiveMuted,
    borderOn: Theme.positive,
  },
  vehicle: {
    step: "03",
    label: "Vehicle",
    boardName: "Vehicle",
    listTitle: "Vehicle types",
    placeholder: "What can haul it",
    search: "Search vehicle or type, e.g. container",
    noun: "Vehicle",
    a11y: "Vehicle type",
    iconBg: Theme.surfaceGray,
    iconOn: Theme.brandBlueSoft,
    chipOn: Theme.brandBlueWashSubtle,
    borderOn: Theme.primary,
  },
};

const FIELD_ORDER: Field[] = ["pickup", "drop", "vehicle"];

const FIELD_KEY: Record<Field, keyof MarketplaceLoadSearch> = {
  pickup: "pickup",
  drop: "drop",
  vehicle: "vehicleType",
};

type Props = {
  lanes: MarketplaceSearchLane[];
  value?: MarketplaceLoadSearch | null;
  onChange?: (next: MarketplaceLoadSearch) => void;
  /**
   * Several values per field. Uses `selection` / `onSelectionChange` instead of
   * `value` / `onChange`, and always confirms choices before applying them.
   */
  multiple?: boolean;
  selection?: LaneSelection | null;
  /** `apply` = confirmed from the picker; `edit` = a value cleared from a field. */
  onSelectionChange?: (next: LaneSelection, source: "apply" | "edit") => void;
  autoOpenFirst?: boolean;
  /** Full-width rows so selected cities stay readable on a phone. */
  stacked?: boolean;
  /** Dense 44pt fields for embedded, data-heavy surfaces (Indent Pool). */
  density?: "comfortable" | "compact";
  /** Flat fields for the Marketplace Loads board. Logic is unchanged. */
  appearance?: "default" | "board";
  /** Increment to open the From field. Search still covers every lane. */
  openPickupToken?: number;
  /**
   * Shown in the board fields when this org has no saved search.
   * It does not filter the list until a field is chosen.
   */
  suggestion?: MarketplaceLoadSearch | null;
};

function firstLine(value: string): string {
  return routeEndpointLines(value)[0] || value;
}

/** "Pune", or "Pune +2" when more than one value is chosen. */
function selectionSummary(values: readonly string[]): string {
  if (values.length === 0) return "";
  const head = firstLine(values[0]);
  return values.length > 1 ? `${head} +${values.length - 1}` : head;
}

function sameValue(a: string, b: string): boolean {
  return canonicalPoolField(a) === canonicalPoolField(b);
}

export function MarketplaceLaneFilters({
  lanes,
  value = null,
  onChange,
  multiple = false,
  selection = null,
  onSelectionChange,
  autoOpenFirst = false,
  stacked = false,
  density = "comfortable",
  appearance = "default",
  openPickupToken = 0,
  suggestion = null,
}: Props) {
  const board = appearance === "board";
  const compact = density === "compact";
  const multi = multiple && Boolean(onSelectionChange);
  /** Choices are held on the page and applied together on confirm. */
  const guided = stacked || multi;
  /**
   * The board already has From, To and Vehicle. Its sheet edits the opened
   * field only. The phone wizard still walks the three steps.
   */
  const fieldSheet = board && !stacked;
  const insets = useSafeAreaInsets();
  const applied = useMemo(
    () => (multi ? normalizeLaneSelection(selection) : laneSelectionFromSearch(value)),
    [multi, selection, value],
  );
  const [openField, setOpenField] = useState<Field | null>(null);
  const [menuQuery, setMenuQuery] = useState("");
  const [pending, setPending] = useState<LaneSelection | null>(null);
  const scope = guided && pending ? pending : applied;

  useEffect(() => {
    if (!autoOpenFirst) return;
    if (applied.pickup.length === 0) setOpenField("pickup");
  }, [autoOpenFirst, applied.pickup.length]);

  useEffect(() => {
    if (openPickupToken > 0) setOpenField("pickup");
  }, [openPickupToken]);

  const locationField = openField === "pickup" || openField === "drop";
  const groupedField = locationField || (board && openField === "vehicle");
  const options = useMemo(
    () =>
      openField
        ? selectionFieldOptions(lanes, scope, openField, groupedField ? "" : menuQuery)
        : [],
    [lanes, scope, openField, groupedField, menuQuery],
  );
  const locationGroups = useMemo(
    () =>
      locationField
        ? groupLocationOptions(options, menuQuery, { mergeSamePlace: multi })
        : groupedField
          ? groupVehicleOptions(options, menuQuery)
          : null,
    [locationField, groupedField, options, menuQuery],
  );

  const commit = (next: LaneSelection, source: "apply" | "edit" = "apply") => {
    if (multi) onSelectionChange?.(next, source);
    else onChange?.(laneSelectionToSearch(next));
  };

  const open = (field: Field) => {
    setMenuQuery("");
    setOpenField(field);
  };

  const closePage = () => {
    setMenuQuery("");
    setPending(null);
    setOpenField(null);
  };

  const applyAndClose = () => {
    // A remembered search confirmed unchanged still reopens its results.
    if (pending) commit(pending);
    else if (multi) commit(applied);
    closePage();
  };

  const goToStep = (field: Field) => {
    setMenuQuery("");
    setOpenField(field);
  };

  const confirmStep = () => {
    const at = openField ? FIELD_ORDER.indexOf(openField) : -1;
    const next = FIELD_ORDER[at + 1];
    if (next) goToStep(next);
    else applyAndClose();
  };

  const stepBack = () => {
    const at = openField ? FIELD_ORDER.indexOf(openField) : 0;
    if (at > 0) goToStep(FIELD_ORDER[at - 1]);
    else closePage();
  };

  /** Options are already narrowed by the other fields, so a pick keeps them. */
  const pick = (field: Field, label: string) => {
    const key = FIELD_KEY[field];
    const values = scope[key];
    const has = values.some((v) => sameValue(v, label));
    if (guided) {
      const nextValues = has
        ? values.filter((v) => !sameValue(v, label))
        : multi
          ? [...values, label]
          : [label];
      setPending({ ...scope, [key]: nextValues });
      return;
    }
    setMenuQuery("");
    const next = { ...applied, [key]: [label] };
    commit(next);
    const following = FIELD_ORDER.slice(FIELD_ORDER.indexOf(field) + 1).find(
      (f) => next[FIELD_KEY[f]].length === 0,
    );
    setOpenField(following ?? null);
  };

  /** Select every listed value in a group, or clear them when all are chosen. */
  const toggleMany = (field: Field, labels: readonly string[]) => {
    const key = FIELD_KEY[field];
    const values = scope[key];
    const allOn = labels.every((label) => values.some((v) => sameValue(v, label)));
    const nextValues = allOn
      ? values.filter((v) => !labels.some((label) => sameValue(v, label)))
      : [...values, ...labels.filter((label) => !values.some((v) => sameValue(v, label)))];
    setPending({ ...scope, [key]: nextValues });
  };

  const clearPendingField = (field: Field) => {
    setPending({ ...scope, [FIELD_KEY[field]]: [] });
  };

  const clearField = (field: Field) => {
    commit({ ...applied, [FIELD_KEY[field]]: [] }, "edit");
  };

  const removeValue = (field: Field, label: string) => {
    const key = FIELD_KEY[field];
    commit({ ...applied, [key]: applied[key].filter((v) => !sameValue(v, label)) }, "edit");
  };

  const copy = openField ? FIELD_META[openField] : null;
  const currentValues = openField ? scope[FIELD_KEY[openField]] : [];
  const lastStep = openField === FIELD_ORDER[FIELD_ORDER.length - 1];
  const nextField = openField ? FIELD_ORDER[FIELD_ORDER.indexOf(openField) + 1] : undefined;
  const isSelected = (label: string) => currentValues.some((v) => sameValue(v, label));
  const anyChosen = FIELD_ORDER.some((field) => scope[FIELD_KEY[field]].length > 0);

  /** A merged place ("Delhi" + "Delhi, NCR") toggles every pool label behind it. */
  const itemLabels = (option: PoolFieldOption): readonly string[] =>
    "labels" in option && Array.isArray(option.labels) && option.labels.length > 0
      ? (option.labels as string[])
      : [option.label];
  const isItemSelected = (option: PoolFieldOption) => itemLabels(option).every(isSelected);
  const pickItem = (option: PoolFieldOption) => {
    if (!openField) return;
    const labels = itemLabels(option);
    if (multi && labels.length > 1) toggleMany(openField, labels);
    else pick(openField, option.label);
  };

  const renderChip = (option: PoolFieldOption, place?: string, hot = false) => {
    const selected = isItemSelected(option);
    return (
      <Pressable
        key={`${openField}-${option.label}`}
        onPress={() => pickItem(option)}
        style={({ pressed }) => [
          styles.suggestChip,
          place != null && styles.suggestChipGrouped,
          selected && styles.suggestChipOn,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${copy?.noun} ${option.label}, ${option.count} available`}
        accessibilityHint={hot ? "One of the busiest locations right now" : undefined}
      >
        {selected ? (
          <Check size={12} color={Theme.buttonPrimaryText} strokeWidth={2.6} />
        ) : hot ? (
          <Flame size={11} color={Theme.textSecondary} strokeWidth={2.4} />
        ) : null}
        <Text
          style={[
            styles.suggestChipText,
            place != null && styles.suggestChipTextGrouped,
            selected && styles.suggestChipTextOn,
          ]}
          numberOfLines={1}
        >
          {place ?? option.label}
        </Text>
      </Pressable>
    );
  };

  const renderRow = (option: PoolFieldOption, place?: string, hot = false) => {
    const selected = isItemSelected(option);
    return (
      <Pressable
        key={`${openField}-${option.label}`}
        onPress={() => pickItem(option)}
        style={({ pressed }) => [styles.option, pressed && styles.pressed, selected && styles.optionActive]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${copy?.noun} ${option.label}, ${option.count} available`}
        accessibilityHint={hot ? "One of the busiest locations right now" : undefined}
      >
        <View style={styles.optionLead}>
          {openField ? <FieldIcon field={openField} /> : null}
          <Text style={[styles.optionLabel, selected && styles.optionLabelActive]} numberOfLines={2}>
            {place ?? option.label}
          </Text>
          {hot ? (
            <View style={styles.hotTag}>
              <Flame size={10} color={Theme.primaryText} strokeWidth={2.4} />
              <Text style={styles.hotTagText}>Busy</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.optionMeta}>
          {selected ? <Check size={14} color={Theme.primary} strokeWidth={2.4} /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.bar,
        stacked && styles.barStacked,
        compact && styles.barCompact,
        board && styles.barBoard,
        board && stacked && styles.barBoardStacked,
      ]}
    >
      <FilterChip
        field="pickup"
        value={applied.pickup[0] ?? ""}
        more={applied.pickup.slice(1)}
        suggestion={suggestion?.pickup ?? ""}
        locked={false}
        open={openField === "pickup"}
        accent={board && (openField === "pickup" || (openField == null && Boolean(applied.pickup.length || suggestion?.pickup)))}
        stacked={stacked}
        compact={compact}
        board={board}
        onOpen={() => open("pickup")}
        onClear={() => clearField("pickup")}
        onRemove={(label) => removeValue("pickup", label)}
      />
      {!stacked && !board ? <LaneRail filled={applied.pickup.length > 0} /> : null}
      <FilterChip
        field="drop"
        value={applied.drop[0] ?? ""}
        more={applied.drop.slice(1)}
        suggestion={suggestion?.drop ?? ""}
        locked={false}
        open={openField === "drop"}
        accent={openField === "drop"}
        stacked={stacked}
        compact={compact}
        board={board}
        onOpen={() => open("drop")}
        onClear={() => clearField("drop")}
        onRemove={(label) => removeValue("drop", label)}
      />
      {!stacked && !board ? <LaneRail filled={applied.drop.length > 0} /> : null}
      <FilterChip
        field="vehicle"
        value={applied.vehicleType[0] ?? ""}
        more={applied.vehicleType.slice(1)}
        suggestion={suggestion?.vehicleType ?? ""}
        locked={false}
        open={openField === "vehicle"}
        accent={openField === "vehicle"}
        stacked={stacked}
        compact={compact}
        board={board}
        onOpen={() => open("vehicle")}
        onClear={() => clearField("vehicle")}
        onRemove={(label) => removeValue("vehicle", label)}
      />

      <Modal
        visible={openField != null}
        transparent={!stacked}
        animationType={stacked ? "slide" : "fade"}
        presentationStyle={stacked ? "fullScreen" : undefined}
        onRequestClose={stacked ? stepBack : closePage}
      >
        <View style={stacked ? styles.pageRoot : styles.backdrop}>
          {stacked ? null : (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closePage}
            />
          )}
          <View
            style={[
              stacked ? styles.page : styles.sheet,
              {
                paddingTop: stacked ? insets.top : undefined,
                paddingBottom: Math.max(insets.bottom, 14),
              },
            ]}
          >
            {stacked ? (
              <View style={styles.pageHeadWrap}>
                <View style={styles.pageHead}>
                  <Pressable
                    onPress={stepBack}
                    style={styles.pageBack}
                    accessibilityRole="button"
                    accessibilityLabel={
                      openField === "pickup" ? "Back to marketplace loads" : "Previous step"
                    }
                    hitSlop={Layout.touchTargetHitSlop}
                  >
                    <ChevronLeft size={20} color={Theme.textPrimaryDark} strokeWidth={2.4} />
                  </Pressable>
                  <View style={styles.sheetHeadCopy}>
                    <Text style={styles.sheetStep}>
                      {openField ? `Step ${FIELD_META[openField].step} of 03` : ""}
                    </Text>
                    <Text style={styles.pageTitle}>{copy?.listTitle ?? ""}</Text>
                  </View>
                </View>
                <View style={styles.stepper}>
                  {FIELD_ORDER.map((field) => {
                    const chosen = selectionSummary(scope[FIELD_KEY[field]]);
                    const current = field === openField;
                    return (
                      <Pressable
                        key={field}
                        onPress={() => goToStep(field)}
                        style={styles.stepItem}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: current }}
                        accessibilityLabel={`${FIELD_META[field].boardName}: ${chosen || "any"}`}
                      >
                        <View
                          style={[
                            styles.stepBar,
                            chosen ? styles.stepBarDone : null,
                            current && styles.stepBarCurrent,
                          ]}
                        />
                        <View style={styles.stepCopy}>
                          {chosen && !current ? (
                            <Check size={11} color={Theme.textSecondary} strokeWidth={2.8} />
                          ) : null}
                          <Text
                            style={[styles.stepLabel, current && styles.stepLabelCurrent]}
                            numberOfLines={1}
                          >
                            {chosen || FIELD_META[field].boardName}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={styles.sheetHead}>
                <View style={styles.sheetHeadCopy}>
                  {openField && !board ? (
                    <Text style={styles.sheetStep}>Step {FIELD_META[openField].step}</Text>
                  ) : null}
                  <Text style={styles.sheetTitle}>
                    {board && openField ? FIELD_META[openField].boardName : copy?.listTitle}
                  </Text>
                </View>
                <Pressable
                  onPress={closePage}
                  style={styles.sheetClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close list"
                  hitSlop={Layout.touchTargetHitSlop}
                >
                  <X size={16} color={Theme.textPrimaryDark} strokeWidth={2.2} />
                </Pressable>
              </View>
            )}
            <View style={styles.menuSearch}>
              <Search size={14} color={Theme.textSecondary} />
              <TextInput
                value={menuQuery}
                onChangeText={setMenuQuery}
                placeholder={copy?.search}
                placeholderTextColor={Theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.menuSearchInput}
                accessibilityLabel={`${copy?.search ?? "Search"} in list`}
              />
            </View>
            {multi && openField && currentValues.length > 0 && !fieldSheet ? (
              <View style={styles.pickedRow}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pickedScroll}
                  keyboardShouldPersistTaps="handled"
                >
                  {currentValues.map((label) => (
                    <Pressable
                      key={label}
                      onPress={() => pick(openField, label)}
                      style={({ pressed }) => [styles.pickedChip, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${label}`}
                    >
                      <Text style={styles.pickedChipText} numberOfLines={1}>
                        {firstLine(label)}
                      </Text>
                      <X size={11} color={Theme.textSecondary} strokeWidth={2.4} />
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable
                  onPress={() => clearPendingField(openField)}
                  style={styles.pickedClear}
                  accessibilityRole="button"
                  accessibilityLabel={`Clear all ${copy?.noun.toLowerCase() ?? ""} choices`}
                  hitSlop={Layout.touchTargetHitSlop}
                >
                  <Text style={styles.pickedClearText}>Clear</Text>
                </Pressable>
              </View>
            ) : null}
            <ScrollView
              style={stacked ? styles.menuListPage : styles.menuList}
              contentContainerStyle={
                locationGroups ? styles.groupList : board ? styles.suggestWrap : undefined
              }
              keyboardShouldPersistTaps="handled"
            >
              {(locationGroups ? locationGroups.length === 0 : options.length === 0) ? (
                <Text style={styles.emptyOption}>No matching live loads</Text>
              ) : locationGroups ? (
                locationGroups.map((group) => (
                  <View key={group.key} style={styles.group}>
                    <View style={styles.groupHead}>
                      <Text style={styles.groupTitle} numberOfLines={1}>
                        {group.state}
                      </Text>
                      {group.region && !locationField ? (
                        <View style={styles.regionTag}>
                          <Text style={styles.regionTagText}>{group.region}</Text>
                        </View>
                      ) : null}
                      {multi && openField && group.items.length > 1 ? (
                        (() => {
                          const labels = group.items.flatMap((item) => itemLabels(item));
                          const allOn = labels.every((label) => isSelected(label));
                          return (
                            <Pressable
                              onPress={() => toggleMany(openField, labels)}
                              style={styles.groupToggle}
                              accessibilityRole="button"
                              accessibilityLabel={`${allOn ? "Clear" : "Select all"} in ${group.state}`}
                              hitSlop={Layout.touchTargetHitSlop}
                            >
                              <Text style={styles.groupToggleText}>{allOn ? "Clear" : "Select all"}</Text>
                            </Pressable>
                          );
                        })()
                      ) : null}
                    </View>
                    {board ? (
                      <View style={styles.groupChips}>
                        {group.items.map((item) => renderChip(item, item.place, item.hot))}
                      </View>
                    ) : (
                      group.items.map((item) => renderRow(item, item.place, item.hot))
                    )}
                  </View>
                ))
              ) : board ? (
                options.map((option) => renderChip(option))
              ) : (
                options.map((option) => renderRow(option))
              )}
            </ScrollView>
            {guided ? (
              <View style={styles.pageFoot}>
                <View style={styles.pageFootPick}>
                  <Text style={styles.pageFootLabel}>
                    {copy?.noun ?? ""}
                    {multi && currentValues.length > 1 ? ` · ${currentValues.length} selected` : ""}
                  </Text>
                  <Text
                    style={[styles.pageFootValue, currentValues.length === 0 && styles.pageFootValueEmpty]}
                    numberOfLines={1}
                  >
                    {currentValues.length > 0
                      ? selectionSummary(currentValues)
                      : `Any ${copy?.noun.toLowerCase() ?? ""}`}
                  </Text>
                </View>
                <View style={styles.pageFootActions}>
                  {fieldSheet ? (
                    <Pressable
                      onPress={applyAndClose}
                      style={({ pressed }) => [styles.footPrimary, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel="Show loads now"
                    >
                      <Text style={styles.footPrimaryText}>Show loads</Text>
                      <Check size={15} color={Theme.buttonPrimaryText} strokeWidth={2.6} />
                    </Pressable>
                  ) : (
                    <>
                  {lastStep || !anyChosen ? null : (
                    <Pressable
                      onPress={applyAndClose}
                      style={({ pressed }) => [styles.footGhost, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel="Show loads now"
                    >
                      <Text style={styles.footGhostText}>Show loads</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={confirmStep}
                    style={({ pressed }) => [styles.footPrimary, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      lastStep || !nextField
                        ? "Show loads"
                        : currentValues.length
                          ? `Next: ${FIELD_META[nextField].boardName}`
                          : `Any ${copy?.noun.toLowerCase() ?? ""}, next: ${FIELD_META[nextField].boardName}`
                    }
                  >
                    <Text style={styles.footPrimaryText}>{lastStep ? "Show loads" : "Next"}</Text>
                    {lastStep ? (
                      <Check size={15} color={Theme.buttonPrimaryText} strokeWidth={2.6} />
                    ) : (
                      <ArrowRight size={15} color={Theme.buttonPrimaryText} strokeWidth={2.6} />
                    )}
                  </Pressable>
                    </>
                  )}
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FieldIcon({ field, size = 14 }: { field: Field; size?: number }) {
  const color =
    field === "drop" ? Theme.positive : field === "vehicle" ? Theme.textPrimaryDark : Theme.primary;
  if (field === "pickup") return <MapPin size={size} color={color} strokeWidth={2.3} />;
  if (field === "drop") return <Flag size={size} color={color} strokeWidth={2.3} />;
  return <Truck size={size} color={color} strokeWidth={2.3} />;
}

function LaneRail({ filled }: { filled: boolean }) {
  return (
    <View style={styles.rail} importantForAccessibility="no-hide-descendants">
      <View style={[styles.railDot, filled && styles.railDotOn]} />
      <View style={[styles.railLine, filled && styles.railLineOn]} />
      <View style={[styles.railDot, filled && styles.railDotOn]} />
    </View>
  );
}

function boardFieldCopy(
  field: Field,
  value: string,
  suggestion: string,
  locked: boolean,
  more: readonly string[] = [],
): { headline: string; caption: string | null; suggested: boolean } {
  const meta = FIELD_META[field];
  const shown = value || suggestion;
  if (!shown) {
    return {
      headline: meta.placeholder,
      caption: locked ? (field === "drop" ? "Choose pickup first" : "Choose drop first") : null,
      suggested: false,
    };
  }
  const lines = field === "vehicle" ? [shown] : routeEndpointLines(shown);
  if (value && more.length > 0) {
    return {
      headline: `${lines[0] || shown} +${more.length}`,
      caption: more.map(firstLine).join(", "),
      suggested: false,
    };
  }
  const headline = lines[0] || shown;
  const caption =
    !value && suggestion
      ? lines[1] || "Suggested"
      : locked
        ? field === "drop"
          ? "Choose pickup first"
          : "Choose drop first"
        : lines[1] || null;
  return { headline, caption, suggested: !value && Boolean(suggestion) };
}

function FilterChip({
  field,
  value,
  suggestion = "",
  more = [],
  locked,
  open,
  accent = false,
  stacked,
  compact = false,
  board = false,
  onOpen,
  onClear,
  onRemove,
}: {
  field: Field;
  value: string;
  suggestion?: string;
  more?: readonly string[];
  locked: boolean;
  open: boolean;
  accent?: boolean;
  stacked: boolean;
  compact?: boolean;
  board?: boolean;
  onOpen: () => void;
  onClear: () => void;
  onRemove?: (label: string) => void;
}) {
  const meta = FIELD_META[field];
  const filled = Boolean(value) && !locked;
  const picked = value ? [value, ...more] : [];
  const showTokens = board && picked.length > 1 && Boolean(onRemove);
  const tokenRoom = stacked && field !== "vehicle" ? 1 : 2;
  const visibleTokens = picked.slice(0, tokenRoom);
  const hiddenTokens = picked.length - visibleTokens.length;
  const boardCopy = board ? boardFieldCopy(field, value, suggestion, locked, more) : null;
  return (
    <View
      style={[
        styles.chip,
        stacked && styles.chipStacked,
        compact && styles.chipCompact,
        filled && { backgroundColor: meta.chipOn, borderColor: Theme.borderLight },
        open && { borderColor: meta.borderOn, backgroundColor: meta.chipOn },
        filled && !board && { backgroundColor: meta.chipOn, borderColor: Theme.borderLight },
        open && { borderColor: meta.borderOn, backgroundColor: board ? Theme.cardWhite : meta.chipOn },
        locked && !boardCopy?.suggested && styles.chipLocked,
        board && styles.chipBoard,
        board && accent && !stacked && styles.chipBoardAccent,
        board && !stacked && styles.chipBoardSplit,
        board && stacked && styles.chipBoardStack,
        board && stacked && (field === "vehicle" ? styles.chipBoardStackWide : styles.chipBoardStackHalf),
        board && stacked && field === "pickup" && styles.chipBoardSplit,
      ]}
    >
      <View
        style={[
          styles.chipMain,
          compact && styles.chipMainCompact,
          board && styles.chipMainBoard,
          board && stacked && styles.chipMainBoardStacked,
          showTokens && styles.chipMainTokens,
        ]}
      >
        <Pressable
          onPress={onOpen}
          disabled={locked}
          style={[styles.chipOpen, showTokens && styles.chipOpenTokens]}
          accessibilityRole="button"
          accessibilityLabel={meta.a11y}
          accessibilityState={{ disabled: locked, expanded: open }}
        >
          {board ? null : (
          <View
            style={[
              styles.chipIcon,
              compact && styles.chipIconCompact,
              { backgroundColor: filled || open ? meta.iconOn : meta.iconBg },
            ]}
          >
            <FieldIcon field={field} size={compact ? 13 : 15} />
          </View>
          )}
          <View style={styles.chipCopy}>
            {board ? (
              <Text style={[styles.boardFieldLabel, stacked && styles.boardFieldLabelStacked]}>
                {meta.boardName}
                {showTokens ? ` · ${picked.length}` : ""}
              </Text>
            ) : (
            <View style={styles.chipLabelRow}>
              <Text style={[styles.chipStep, compact && styles.chipStepCompact]}>{meta.step}</Text>
              <Text style={[styles.chipLabel, compact && styles.chipLabelCompact]}>
                {meta.label}
              </Text>
            </View>
            )}
            {showTokens ? null : (
            <Text
              style={[
                styles.chipValue,
                compact && styles.chipValueCompact,
                board && styles.boardFieldValue,
                board && stacked && styles.boardFieldValueStacked,
                !value && !boardCopy?.suggested && styles.chipPlaceholder,
                board && !value && !boardCopy?.suggested && styles.boardFieldPlaceholder,
                board && stacked && !value && !boardCopy?.suggested && styles.boardFieldPlaceholderStacked,
              ]}
              numberOfLines={1}
            >
              {boardCopy
                ? boardCopy.headline
                : locked
                  ? field === "drop"
                    ? "Choose pickup first"
                    : "Choose drop first"
                  : value
                    ? more.length > 0
                      ? `${value} +${more.length}`
                      : value
                    : meta.placeholder}
            </Text>
            )}
            {!showTokens && boardCopy?.caption ? (
              <Text
                style={[styles.boardFieldCaption, stacked && styles.boardFieldCaptionStacked]}
                numberOfLines={1}
              >
                {boardCopy.caption}
              </Text>
            ) : null}
          </View>
          {value && board ? null : <ChevronDown size={14} color={Theme.textMuted} strokeWidth={2.2} />}
        </Pressable>
        {showTokens ? (
          <View style={styles.tokenRow}>
            {visibleTokens.map((label) => (
              <Pressable
                key={label}
                onPress={() => onRemove?.(label)}
                style={({ pressed }) => [styles.token, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${label} from ${meta.label}`}
                hitSlop={4}
              >
                <Text style={styles.tokenText} numberOfLines={1}>
                  {routeEndpointLines(label)[0] || label}
                </Text>
                <X size={10} color={Theme.textSecondary} strokeWidth={2.6} />
              </Pressable>
            ))}
            {hiddenTokens > 0 ? (
              <View style={styles.tokenMore}>
                <Text style={styles.tokenMoreText}>+{hiddenTokens}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {value ? (
        <Pressable
          onPress={onClear}
          style={({ pressed }) => [
            styles.chipClear,
            board && styles.chipClearTiny,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${meta.label}`}
          hitSlop={board ? 12 : 6}
        >
          <X size={board ? 10 : 12} color={Theme.textSecondary} strokeWidth={2.6} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 10,
    width: "100%",
  },
  barStacked: {
    flexDirection: "column",
    flexWrap: "nowrap",
    gap: 8,
  },
  barBoard: {
    flexWrap: "nowrap",
    gap: 0,
    alignItems: "stretch",
  },
  barBoardStacked: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chip: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: Platform.OS === "web" ? 0 : 200,
    minWidth: Platform.OS === "web" ? 0 : 180,
    minHeight: 72,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 6,
  },
  rail: {
    width: 18,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    flexShrink: 0,
  },
  railLine: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: Theme.borderInput,
  },
  railLineOn: { backgroundColor: Theme.primary },
  railDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Theme.borderInput,
  },
  railDotOn: { backgroundColor: Theme.primary },
  chipStacked: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: "100%",
    minWidth: 0,
    minHeight: 60,
  },
  chipOpen: {
    borderColor: Theme.primary,
    backgroundColor: Theme.brandBlueWashSubtle,
  },
  chipLocked: { opacity: 0.55 },
  chipBoardSplit: {
    borderRightWidth: 1,
    borderRightColor: Theme.borderLight,
  },
  chipBoardStack: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  chipBoardStackHalf: { width: "50%", minHeight: 58 },
  chipBoardStackWide: { width: "100%", minHeight: 58, borderBottomWidth: 0 },
  chipMainBoardStacked: { minHeight: 58, paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  boardFieldLabelStacked: { fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase" },
  boardFieldValueStacked: { fontSize: 15, lineHeight: 19, letterSpacing: -0.2 },
  boardFieldPlaceholderStacked: { fontSize: 13 },
  boardFieldCaptionStacked: { fontSize: 11 },
  chipBoardAccent: {
    backgroundColor: Theme.buttonPrimary,
  },
  boardFieldCaption: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  chipBoard: {
    minHeight: 78,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  boardFieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: Theme.textMuted,
  },
  boardFieldValue: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
    lineHeight: 22,
    color: Theme.textPrimaryDark,
  },
  boardFieldPlaceholder: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0,
  },
  suggestWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  suggestChip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    maxWidth: "100%",
  },
  suggestChipGrouped: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    gap: 4,
  },
  groupList: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 20, gap: 18 },
  group: { gap: 8 },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  groupTitle: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  regionTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: Theme.surfaceGray,
  },
  regionTagText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  groupChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hotTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.loadMainTabBg,
  },
  hotTagText: { fontSize: 10, fontWeight: "800", color: Theme.primaryText },
  suggestChipOn: {
    borderColor: Theme.buttonPrimaryBorder,
    backgroundColor: Theme.buttonPrimary,
  },
  suggestChipText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  suggestChipTextGrouped: { fontSize: 13, fontWeight: "600" },
  suggestChipTextOn: { color: Theme.buttonPrimaryText },
  chipMainBoard: { minHeight: 68, paddingHorizontal: 14 },
  chipMainTokens: {
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "center",
    gap: 0,
  },
  chipOpen: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chipOpenTokens: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chipMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 8,
  },
  chipIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  chipCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 2,
  },
  chipLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipStep: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: Theme.primary,
  },
  chipStepCompact: { fontSize: 8.5 },
  chipLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  chipValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 17,
  },
  chipPlaceholder: {
    fontWeight: "500",
    color: Theme.textMuted,
  },
  barCompact: { gap: 4 },
  chipCompact: { minHeight: 58, borderRadius: 14 },
  chipMainCompact: { minHeight: 54, paddingHorizontal: 8, gap: 8 },
  chipIconCompact: { width: 30, height: 30, borderRadius: 10 },
  chipLabelCompact: { fontSize: 9.5 },
  chipValueCompact: { fontSize: 12.5, lineHeight: 16 },
  chipClearTiny: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: Theme.surfaceGray,
  },
  tokenRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3, minWidth: 0 },
  token: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 22,
    paddingLeft: 8,
    paddingRight: 6,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    flexShrink: 1,
    minWidth: 0,
  },
  tokenText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark, flexShrink: 1 },
  tokenMore: {
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 999,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tokenMoreText: { fontSize: 11, fontWeight: "800", color: Theme.textSecondary },
  chipClear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "80%",
    alignSelf: "center",
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: `0 16px 40px ${Theme.brandBlueShadow}` } as object,
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 20,
        elevation: 12,
      },
    }),
  },
  pageRoot: { flex: 1, backgroundColor: Theme.cardWhite },
  page: { flex: 1, width: "100%", backgroundColor: Theme.cardWhite },
  pageHeadWrap: {
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 10,
  },
  pageHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  stepper: { flexDirection: "row", gap: 8, paddingHorizontal: 14 },
  stepItem: { flex: 1, minWidth: 0, gap: 5, minHeight: 36, justifyContent: "center" },
  stepBar: { height: 3, borderRadius: 2, backgroundColor: Theme.borderLight },
  stepBarDone: { backgroundColor: Theme.textMuted },
  stepBarCurrent: { backgroundColor: Theme.textPrimaryDark },
  stepCopy: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
  stepLabel: { flexShrink: 1, fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  stepLabelCurrent: { color: Theme.textPrimaryDark, fontWeight: "700" },
  pickedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 14,
    paddingRight: 8,
    marginBottom: 10,
  },
  pickedScroll: { flexDirection: "row", gap: 6, alignItems: "center" },
  pickedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 28,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
  },
  pickedChipText: { fontSize: 12, fontWeight: "600", color: Theme.textPrimaryDark, maxWidth: 140 },
  pickedClear: { paddingHorizontal: 6, minHeight: 28, justifyContent: "center", flexShrink: 0 },
  pickedClearText: { fontSize: 12, fontWeight: "700", color: Theme.textSecondary },
  groupToggle: { marginLeft: "auto", paddingVertical: 2, paddingLeft: 8 },
  groupToggleText: { fontSize: 12, fontWeight: "700", color: Theme.primary },
  pageFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  pageFootPick: { flex: 1, minWidth: 0, gap: 1 },
  pageFootLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  pageFootValue: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark },
  pageFootValueEmpty: { color: Theme.textSecondary, fontWeight: "600" },
  pageFootActions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  footGhost: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  footGhostText: { fontSize: 13, fontWeight: "700", color: Theme.textSecondary },
  footPrimary: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: 1,
    borderColor: Theme.buttonPrimaryBorder,
  },
  footPrimaryText: { fontSize: 13, fontWeight: "700", color: Theme.buttonPrimaryText },
  pageBack: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: { fontSize: 18, fontWeight: "800", color: Theme.textPrimaryDark },
  menuListPage: { flex: 1 },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sheetHeadCopy: { flex: 1, minWidth: 0, gap: 2 },
  sheetStep: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.primary,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  sheetClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  menuSearch: {
    marginHorizontal: 14,
    marginBottom: 8,
    minHeight: 40,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.surface,
  },
  menuSearchInput: {
    flex: 1,
    minHeight: 40,
    fontSize: 14,
    color: Theme.textPrimaryDark,
  },
  menuList: { maxHeight: 360 },
  option: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  optionLead: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  optionActive: { backgroundColor: Theme.brandBlueSoft },
  optionLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  optionLabelActive: { color: Theme.primary },
  optionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  emptyOption: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 13,
    color: Theme.textSecondary,
  },
  pressed: { opacity: 0.88 },
});
