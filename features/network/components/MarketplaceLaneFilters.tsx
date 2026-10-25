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
import {
  canonicalPoolField,
  poolFieldOptions,
  poolKey,
} from "@/features/network/utils/pooledOpportunity.util";
import { Check, ChevronDown, Flag, MapPin, Search, Truck, X } from "lucide-react-native";
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
    listTitle: "Pickup locations",
    placeholder: "Where it starts",
    search: "Search pickup",
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
    listTitle: "Drop locations",
    placeholder: "Where it ends",
    search: "Search drop",
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
    listTitle: "Vehicle types",
    placeholder: "What can haul it",
    search: "Search vehicle",
    noun: "Vehicle",
    a11y: "Vehicle type",
    iconBg: Theme.surfaceGray,
    iconOn: Theme.brandBlueSoft,
    chipOn: Theme.brandBlueWashSubtle,
    borderOn: Theme.primary,
  },
};

type Props = {
  lanes: MarketplaceSearchLane[];
  value: MarketplaceLoadSearch | null;
  onChange: (next: MarketplaceLoadSearch) => void;
  autoOpenFirst?: boolean;
  /** Full-width rows so selected cities stay readable on a phone. */
  stacked?: boolean;
  /** Dense 44pt fields for embedded, data-heavy surfaces (Indent Pool). */
  density?: "comfortable" | "compact";
};

export function MarketplaceLaneFilters({
  lanes,
  value,
  onChange,
  autoOpenFirst = false,
  stacked = false,
  density = "comfortable",
}: Props) {
  const compact = density === "compact";
  const insets = useSafeAreaInsets();
  const draft = poolKey(value);
  const [openField, setOpenField] = useState<Field | null>(null);
  const [menuQuery, setMenuQuery] = useState("");

  useEffect(() => {
    if (!autoOpenFirst) return;
    if (!draft.pickup) setOpenField("pickup");
  }, [autoOpenFirst, draft.pickup]);

  const options = useMemo(
    () =>
      openField
        ? poolFieldOptions(lanes, draft, openField, menuQuery)
        : [],
    [lanes, draft, openField, menuQuery],
  );

  const pickupLocked = false;
  const dropLocked = !draft.pickup;
  const vehicleLocked = !draft.pickup || !draft.drop;

  const open = (field: Field, locked: boolean) => {
    if (locked) return;
    setMenuQuery("");
    setOpenField(field);
  };

  const pick = (field: Field, label: string) => {
    setMenuQuery("");
    if (field === "pickup") {
      onChange({ pickup: label, drop: "", vehicleType: "" });
      setOpenField("drop");
      return;
    }
    if (field === "drop") {
      onChange({ pickup: draft.pickup, drop: label, vehicleType: "" });
      setOpenField("vehicle");
      return;
    }
    onChange({
      pickup: draft.pickup,
      drop: draft.drop,
      vehicleType: label,
    });
    setOpenField(null);
  };

  const clearField = (field: Field) => {
    if (field === "pickup") {
      onChange({ pickup: "", drop: "", vehicleType: "" });
      return;
    }
    if (field === "drop") {
      onChange({ pickup: draft.pickup, drop: "", vehicleType: "" });
      return;
    }
    onChange({ pickup: draft.pickup, drop: draft.drop, vehicleType: "" });
  };

  const copy = openField ? FIELD_META[openField] : null;

  return (
    <View
      style={[
        styles.bar,
        stacked && styles.barStacked,
        compact && styles.barCompact,
      ]}
    >
      <FilterChip
        field="pickup"
        value={draft.pickup}
        locked={pickupLocked}
        open={openField === "pickup"}
        stacked={stacked}
        compact={compact}
        onOpen={() => open("pickup", pickupLocked)}
        onClear={() => clearField("pickup")}
      />
      {!stacked ? <LaneRail filled={Boolean(draft.pickup)} /> : null}
      <FilterChip
        field="drop"
        value={draft.drop}
        locked={dropLocked}
        open={openField === "drop"}
        stacked={stacked}
        compact={compact}
        onOpen={() => open("drop", dropLocked)}
        onClear={() => clearField("drop")}
      />
      {!stacked ? <LaneRail filled={Boolean(draft.drop)} /> : null}
      <FilterChip
        field="vehicle"
        value={draft.vehicleType}
        locked={vehicleLocked}
        open={openField === "vehicle"}
        stacked={stacked}
        compact={compact}
        onOpen={() => open("vehicle", vehicleLocked)}
        onClear={() => clearField("vehicle")}
      />

      <Modal
        visible={openField != null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenField(null)}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpenField(null)}
          />
          <View
            style={[
              styles.sheet,
              stacked && styles.sheetMobile,
              {
                paddingBottom: Math.max(insets.bottom, 14),
                marginTop: stacked ? Math.max(insets.top, 12) : undefined,
              },
            ]}
          >
            <View style={styles.sheetHead}>
              <View style={styles.sheetHeadCopy}>
                {openField ? (
                  <Text style={styles.sheetStep}>Step {FIELD_META[openField].step}</Text>
                ) : null}
                <Text style={styles.sheetTitle}>{copy?.listTitle}</Text>
              </View>
              <Pressable
                onPress={() => setOpenField(null)}
                style={styles.sheetClose}
                accessibilityRole="button"
                accessibilityLabel="Close list"
                hitSlop={Layout.touchTargetHitSlop}
              >
                <X size={16} color={Theme.textPrimaryDark} strokeWidth={2.2} />
              </Pressable>
            </View>
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
            <ScrollView
              style={styles.menuList}
              keyboardShouldPersistTaps="handled"
            >
              {options.length === 0 ? (
                <Text style={styles.emptyOption}>No matching live loads</Text>
              ) : (
                options.map((option) => {
                  const current =
                    openField === "pickup"
                      ? draft.pickup
                      : openField === "drop"
                        ? draft.drop
                        : draft.vehicleType;
                  const selected =
                    canonicalPoolField(option.label) ===
                    canonicalPoolField(current);
                  return (
                    <Pressable
                      key={`${openField}-${option.label}`}
                      onPress={() => openField && pick(openField, option.label)}
                      style={({ pressed }) => [
                        styles.option,
                        pressed && styles.pressed,
                        selected && styles.optionActive,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${copy?.noun} ${option.label}, ${option.count} available`}
                    >
                      <View style={styles.optionLead}>
                        {openField ? <FieldIcon field={openField} /> : null}
                        <Text
                          style={[
                            styles.optionLabel,
                            selected && styles.optionLabelActive,
                          ]}
                          numberOfLines={2}
                        >
                          {option.label}
                        </Text>
                      </View>
                      <View style={styles.optionMeta}>
                        <View style={styles.countPill}>
                          <Text style={styles.optionCount}>
                            {option.count}{" "}
                            {option.count === 1 ? "load" : "loads"}
                          </Text>
                        </View>
                        {selected ? (
                          <Check
                            size={14}
                            color={Theme.primary}
                            strokeWidth={2.4}
                          />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
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

function FilterChip({
  field,
  value,
  locked,
  open,
  stacked,
  compact = false,
  onOpen,
  onClear,
}: {
  field: Field;
  value: string;
  locked: boolean;
  open: boolean;
  stacked: boolean;
  compact?: boolean;
  onOpen: () => void;
  onClear: () => void;
}) {
  const meta = FIELD_META[field];
  const filled = Boolean(value) && !locked;
  return (
    <View
      style={[
        styles.chip,
        stacked && styles.chipStacked,
        compact && styles.chipCompact,
        filled && { backgroundColor: meta.chipOn, borderColor: Theme.borderLight },
        open && { borderColor: meta.borderOn, backgroundColor: meta.chipOn },
        locked && styles.chipLocked,
      ]}
    >
      <Pressable
        onPress={onOpen}
        disabled={locked}
        style={[styles.chipMain, compact && styles.chipMainCompact]}
        accessibilityRole="button"
        accessibilityLabel={meta.a11y}
        accessibilityState={{ disabled: locked, expanded: open }}
      >
        <View
          style={[
            styles.chipIcon,
            compact && styles.chipIconCompact,
            { backgroundColor: filled || open ? meta.iconOn : meta.iconBg },
          ]}
        >
          <FieldIcon field={field} size={compact ? 13 : 15} />
        </View>
        <View style={styles.chipCopy}>
          <View style={styles.chipLabelRow}>
            <Text style={[styles.chipStep, compact && styles.chipStepCompact]}>{meta.step}</Text>
            <Text style={[styles.chipLabel, compact && styles.chipLabelCompact]}>
              {meta.label}
            </Text>
          </View>
          <Text
            style={[
              styles.chipValue,
              compact && styles.chipValueCompact,
              !value && styles.chipPlaceholder,
            ]}
            numberOfLines={stacked && !compact ? 2 : 1}
          >
            {locked
              ? field === "drop"
                ? "Choose pickup first"
                : "Choose drop first"
              : value || meta.placeholder}
          </Text>
        </View>
        <ChevronDown size={14} color={Theme.textMuted} strokeWidth={2.2} />
      </Pressable>
      {value ? (
        <Pressable
          onPress={onClear}
          style={styles.chipClear}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${meta.label}`}
          hitSlop={6}
        >
          <X size={12} color={Theme.textSecondary} strokeWidth={2.4} />
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
  chipLocked: { opacity: 0.5 },
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
  sheetMobile: {
    maxWidth: "100%",
    maxHeight: "88%",
  },
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
    marginHorizontal: 12,
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
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
  },
  optionCount: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  emptyOption: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 13,
    color: Theme.textSecondary,
  },
  pressed: { opacity: 0.88 },
});
