import { createElement, memo, useCallback, useRef, useState, type CSSProperties } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, Plus, X } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { fullPageWizardStyles as wizardChrome } from "@/components/full-page-wizard";
import { useRecentTonsRecommendations } from "@/features/trips/hooks/useRecentTonsRecommendations";
import { useUserCommodityTypes } from "@/features/trips/hooks/useUserCommodityTypes";
import type { CommodityTypeKind } from "@/features/trips/services/userCommodityTypes.storage";
import { ROUTES } from "@/lib/routes";
import { VehicleTypeCatalogSheet } from "@/features/vehicles/components/VehicleTypeCatalogSheet";
import {
  parseVehicleTypeSelection,
  passingTonRange,
  passingTonsFor,
  tonSuggestionsForRange,
  vehicleTonRange,
} from "@/features/vehicles/utils/vehicleTypeCatalog.model";

export type TripCommodityFieldsProps = {
  vehicleType: string;
  loadType: string;
  tons: string;
  onVehicleTypeChange: (value: string) => void;
  onLoadTypeChange: (value: string) => void;
  onTonsChange: (value: string) => void;
  vehicleTypeError?: boolean;
  loadTypeError?: boolean;
  tonsError?: boolean;
  /** Extra options from indent (prepended if not in catalog). */
  indentVehicleType?: string | null;
  indentLoadType?: string | null;
  showTons?: boolean;
  /** When false, only the vehicle picker is shown (e.g. contract lane forms). */
  showProductType?: boolean;
  /** Side-by-side vehicle + product (desktop / wide). */
  isWide?: boolean;
  /** Use Add Trip form label/input styles instead of mobile wizard chrome. */
  useFormChrome?: boolean;
  /** Web desktop: native `<select>` instead of bottom sheet. */
  preferWebSelect?: boolean;
  /** Rounded shell inputs matching desktop create-trip mockup. */
  desktopChrome?: boolean;
  fieldLabelStyle?: StyleProp<TextStyle>;
  fieldInputStyle?: StyleProp<TextStyle>;
  /** Use the global vehicle type catalog sheet (category → type → passing ton). */
  useVehicleCatalog?: boolean;
};

type PickerKind = "vehicle" | "load" | null;

function CommodityWebSelect({
  value,
  options,
  placeholder,
  onChange,
  hasError,
  minHeight,
  desktopChrome = false,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
  hasError?: boolean;
  minHeight: number;
  desktopChrome?: boolean;
}) {
  const selectStyle: CSSProperties = {
    width: "100%",
    minHeight,
    borderRadius: desktopChrome ? 16 : 12,
    border: `1px solid ${hasError ? Theme.destructive : Theme.borderLight}`,
    backgroundColor: Theme.surface,
    padding: desktopChrome ? "12px 14px" : "10px 12px",
    fontSize: 13,
    fontWeight: 600,
    color: value.trim() ? Theme.textPrimaryDark : Theme.placeholder,
    boxSizing: "border-box",
    cursor: "pointer",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
  };
  return createElement(
    "select",
    {
      value,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: selectStyle,
    },
    [
      createElement("option", { key: "__placeholder", value: "" }, placeholder),
      ...options.map((opt) => createElement("option", { key: opt, value: opt }, opt)),
    ],
  );
}

export const TripCommodityFields = memo(function TripCommodityFields({
  vehicleType,
  loadType,
  tons,
  onVehicleTypeChange,
  onLoadTypeChange,
  onTonsChange,
  vehicleTypeError = false,
  loadTypeError = false,
  tonsError = false,
  indentVehicleType,
  indentLoadType,
  showTons = true,
  showProductType = true,
  isWide = false,
  useFormChrome = false,
  preferWebSelect = false,
  desktopChrome = false,
  fieldLabelStyle,
  fieldInputStyle,
  useVehicleCatalog = false,
}: TripCommodityFieldsProps) {
  const router = useRouter();
  const [picker, setPicker] = useState<PickerKind>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  /** Passing ton picked in the catalog sheet (not stored in vehicle_type). */
  const [pickedPassingTon, setPickedPassingTon] = useState<string | null>(null);
  const tonsInputRef = useRef<TextInput>(null);

  const scrollTonsIntoView = useCallback(() => {
    if (Platform.OS !== "web") return;
    // KeyboardAvoidingView is disabled on web (no keyboard height events),
    // so the on-screen keyboard can cover this field without the browser
    // scrolling it into view. Nudge it manually once focused.
    requestAnimationFrame(() => {
      const node = tonsInputRef.current as unknown as { scrollIntoView?: (opts?: ScrollIntoViewOptions) => void } | null;
      node?.scrollIntoView?.({ block: "center" });
    });
  }, []);
  const { vehicleOptions, productOptions, consumePendingPick } = useUserCommodityTypes(
    indentVehicleType,
    indentLoadType,
  );
  const { chips: tonsChips, recent: recentTons, remember: rememberTons } =
    useRecentTonsRecommendations();

  // Catalog vehicle with a passing ton: suggest and check load weight within that range.
  // Hard limit = the vehicle's full range; chips narrow to the picked passing ton.
  const catalogTonRange = useVehicleCatalog ? vehicleTonRange(vehicleType) : null;
  const catalogSelection = useVehicleCatalog ? parseVehicleTypeSelection(vehicleType) : null;
  const pickedTonRange =
    catalogSelection &&
    pickedPassingTon &&
    passingTonsFor(catalogSelection.group, catalogSelection.type).includes(pickedPassingTon)
      ? passingTonRange(pickedPassingTon)
      : null;
  const chipsTonRange = pickedTonRange ?? catalogTonRange;
  const visibleTonsChips = chipsTonRange ? tonSuggestionsForRange(chipsTonRange) : tonsChips;
  const tonsNumber = Number(tons);
  const tonsOutOfRange =
    catalogTonRange != null &&
    tons.trim() !== "" &&
    Number.isFinite(tonsNumber) &&
    (tonsNumber < catalogTonRange.min || tonsNumber > catalogTonRange.max);
  const tonsInvalid = tonsError || tonsOutOfRange;

  const onCatalogChange = useCallback(
    (value: string, passingTon: string | null) => {
      onVehicleTypeChange(value);
      setPickedPassingTon(passingTon);
      // Pass the picked passing ton on to the tons (MT) field.
      const range = passingTonRange(passingTon);
      if (!range) return;
      const n = Number(tons);
      if (!tons.trim() || !Number.isFinite(n) || n < range.min || n > range.max) {
        onTonsChange(String(range.max));
      }
    },
    [onVehicleTypeChange, onTonsChange, tons],
  );

  const applyTons = useCallback(
    (value: string) => {
      onTonsChange(value);
      void rememberTons(value);
    },
    [onTonsChange, rememberTons],
  );

  const useWebSelect = preferWebSelect && Platform.OS === "web";
  const labelStyle =
    fieldLabelStyle ??
    (useFormChrome ? styles.formLabel : wizardChrome.wizardFieldLabel);
  const blockStyle = useFormChrome ? styles.fieldBlockForm : wizardChrome.wizardFieldBlock;
  const inputMinHeight = 44;
  const resolvedInputStyle =
    fieldInputStyle ??
    (useFormChrome ? styles.formInput : wizardChrome.wizardFieldInput);

  const applyPendingPick = useCallback(async () => {
    const pick = await consumePendingPick();
    if (!pick) return;
    if (pick.kind === "vehicle") onVehicleTypeChange(pick.name);
    else onLoadTypeChange(pick.name);
  }, [consumePendingPick, onVehicleTypeChange, onLoadTypeChange]);

  useFocusEffect(
    useCallback(() => {
      void applyPendingPick();
    }, [applyPendingPick]),
  );

  const openAddType = useCallback(
    (kind: CommodityTypeKind) => {
      setPicker(null);
      router.push(ROUTES.addCommodityType(kind));
    },
    [router],
  );

  const pickerTitle =
    picker === "vehicle" ? "Vehicle type" : picker === "load" ? "Product type" : "";
  const pickerOptions = picker === "vehicle" ? vehicleOptions : picker === "load" ? productOptions : [];
  const pickerValue = picker === "vehicle" ? vehicleType : loadType;
  const pickerAddKind: CommodityTypeKind = picker === "load" ? "product" : "vehicle";

  const onPick = (value: string) => {
    if (picker === "vehicle") onVehicleTypeChange(value);
    if (picker === "load") onLoadTypeChange(value);
    setPicker(null);
  };

  const renderLabelRow = (label: string, onAdd: () => void) => (
    <View style={styles.labelRow}>
      <Text style={[labelStyle, styles.labelRowText]}>{label}</Text>
      <Pressable
        style={styles.addTypeBtn}
        onPress={onAdd}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Add ${label}`}
      >
        <Plus size={16} color={Theme.primary} strokeWidth={2.5} />
      </Pressable>
    </View>
  );

  const renderVehicle = () => (
    <View style={blockStyle}>
      {useVehicleCatalog ? (
        <Text style={labelStyle}>Vehicle type</Text>
      ) : (
        renderLabelRow("Vehicle type", () => openAddType("vehicle"))
      )}
      {useWebSelect && !useVehicleCatalog ? (
        <CommodityWebSelect
          value={vehicleType}
          options={vehicleOptions}
          placeholder="Select vehicle type (optional)"
          onChange={onVehicleTypeChange}
          hasError={vehicleTypeError}
          minHeight={inputMinHeight}
          desktopChrome={desktopChrome}
        />
      ) : (
        <Pressable
          style={[
            useFormChrome ? styles.pickerBtn : wizardChrome.wizardPickerBtn,
            // Shared input layout style (padding/height/border) applied to a
            // Pressable container; the layout props are valid on ViewStyle too.
            fieldInputStyle as StyleProp<ViewStyle>,
            useFormChrome && styles.pickerBtnForm,
            vehicleTypeError && styles.pickerBtnError,
          ]}
          onPress={() => (useVehicleCatalog ? setCatalogOpen(true) : setPicker("vehicle"))}
          accessibilityRole="button"
        >
          <Text
            style={[
              useFormChrome ? styles.pickerBtnText : wizardChrome.wizardPickerBtnText,
              useFormChrome && styles.pickerBtnTextForm,
              !vehicleType.trim() &&
                (useFormChrome
                  ? styles.pickerBtnPlaceholder
                  : wizardChrome.wizardPickerBtnPlaceholder),
            ]}
            numberOfLines={2}
          >
            {vehicleType.trim() || "Select vehicle type (optional)"}
          </Text>
          <ChevronRight size={18} color={Theme.iconPrimary} />
        </Pressable>
      )}
    </View>
  );

  const renderProduct = () => (
    <View style={blockStyle}>
      {renderLabelRow("Product type", () => openAddType("product"))}
      {useWebSelect ? (
        <CommodityWebSelect
          value={loadType}
          options={productOptions}
          placeholder="Select product type (optional)"
          onChange={onLoadTypeChange}
          hasError={loadTypeError}
          minHeight={inputMinHeight}
          desktopChrome={desktopChrome}
        />
      ) : (
        <Pressable
          style={[
            useFormChrome ? styles.pickerBtn : wizardChrome.wizardPickerBtn,
            // Shared input layout style applied to a Pressable container.
            fieldInputStyle as StyleProp<ViewStyle>,
            useFormChrome && styles.pickerBtnForm,
            loadTypeError && styles.pickerBtnError,
          ]}
          onPress={() => setPicker("load")}
          accessibilityRole="button"
        >
          <Text
            style={[
              useFormChrome ? styles.pickerBtnText : wizardChrome.wizardPickerBtnText,
              useFormChrome && styles.pickerBtnTextForm,
              !loadType.trim() &&
                (useFormChrome
                  ? styles.pickerBtnPlaceholder
                  : wizardChrome.wizardPickerBtnPlaceholder),
            ]}
            numberOfLines={2}
          >
            {loadType.trim() || "Select product type (optional)"}
          </Text>
          <ChevronRight size={18} color={Theme.iconPrimary} />
        </Pressable>
      )}
    </View>
  );

  const renderTons = () =>
    showTons ? (
      <View style={blockStyle}>
        <Text style={labelStyle}>Tons (optional)</Text>
        {desktopChrome ? (
          <View style={[resolvedInputStyle as object, tonsInvalid && styles.inputError]}>
            <View style={styles.tonsInputRow}>
              <TextInput
                ref={tonsInputRef}
                style={styles.tonsInputField}
                value={tons}
                onChangeText={(t) => onTonsChange(t.replace(/[^\d.]/g, "").slice(0, 12))}
                onFocus={scrollTonsIntoView}
                onBlur={() => {
                  if (tons.trim()) void rememberTons(tons);
                }}
                placeholder="Load weight in tons"
                placeholderTextColor={Theme.placeholder}
                keyboardType="decimal-pad"
                inputMode="decimal"
              />
              <Text style={styles.tonsSuffix}>Tons</Text>
            </View>
          </View>
        ) : (
          <TextInput
            ref={tonsInputRef}
            style={[
              resolvedInputStyle,
              tonsInvalid && styles.inputError,
            ]}
            value={tons}
            onChangeText={(t) => onTonsChange(t.replace(/[^\d.]/g, "").slice(0, 12))}
            onFocus={scrollTonsIntoView}
            onBlur={() => {
              if (tons.trim()) void rememberTons(tons);
            }}
            placeholder="Load weight in tons"
            placeholderTextColor={Theme.placeholder}
            keyboardType="decimal-pad"
            inputMode="decimal"
          />
        )}
        <View style={styles.tonsSuggestRow}>
          {visibleTonsChips.map((value) => {
            const selected = tons.trim() === value;
            const isRecent = !catalogTonRange && recentTons.includes(value);
            return (
              <Pressable
                key={value}
                onPress={() => applyTons(value)}
                style={[styles.tonsSuggestChip, selected && styles.tonsSuggestChipSelected]}
                accessibilityRole="button"
                accessibilityLabel={`${value} tons`}
                accessibilityState={{ selected }}
                hitSlop={4}
              >
                <Text
                  style={[
                    styles.tonsSuggestChipText,
                    selected && styles.tonsSuggestChipTextSelected,
                    isRecent && !selected && styles.tonsSuggestChipTextRecent,
                  ]}
                >
                  {value}t
                </Text>
              </Pressable>
            );
          })}
        </View>
        {catalogTonRange ? (
          <Text style={[styles.tonsRangeHint, tonsOutOfRange && styles.tonsRangeHintError]}>
            {tonsOutOfRange ? "Outside this vehicle's range: " : "Vehicle range: "}
            {catalogTonRange.min === catalogTonRange.max
              ? `${catalogTonRange.min} tons`
              : `${catalogTonRange.min}–${catalogTonRange.max} tons`}
          </Text>
        ) : null}
      </View>
    ) : null;

  return (
    <View style={styles.root}>
      {isWide && showProductType ? (
        <>
          <View style={styles.gridRowWide}>
            <View style={styles.gridCol}>{renderVehicle()}</View>
            <View style={styles.gridCol}>{renderProduct()}</View>
          </View>
          {renderTons()}
        </>
      ) : (
        <>
          {renderVehicle()}
          {showProductType ? renderProduct() : null}
          {renderTons()}
        </>
      )}

      {useVehicleCatalog ? (
        <VehicleTypeCatalogSheet
          visible={catalogOpen}
          value={vehicleType}
          tons={tons}
          onClose={() => setCatalogOpen(false)}
          onChange={onCatalogChange}
        />
      ) : null}

      {!useWebSelect ? (
        <Modal visible={picker != null} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{pickerTitle}</Text>
                <TouchableOpacity onPress={() => setPicker(null)} hitSlop={12}>
                  <X size={20} color={Theme.textMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Pressable
                  style={styles.addOwnRow}
                  onPress={() => openAddType(pickerAddKind)}
                >
                  <View style={styles.addOwnIcon}>
                    <Plus size={18} color={Theme.primary} strokeWidth={2.5} />
                  </View>
                  <Text style={styles.addOwnText}>
                    Add your own {picker === "load" ? "product" : "vehicle"} type
                  </Text>
                </Pressable>
                {pickerOptions.map((opt) => {
                  const active =
                    pickerValue.trim().toLowerCase() === opt.toLowerCase();
                  return (
                    <Pressable
                      key={opt}
                      style={[styles.optionRow, active && styles.optionRowActive]}
                      onPress={() => onPick(opt)}
                    >
                      <Text
                        style={[styles.optionText, active && styles.optionTextActive]}
                      >
                        {opt}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: "100%",
    gap: 10,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 8,
  },
  labelRowText: {
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
  },
  addTypeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  formLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  fieldBlockForm: {
    marginBottom: 10,
    minWidth: 0,
    width: "100%",
  },
  formInput: {
    width: "100%",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    minHeight: 44,
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
    }),
  },
  gridRowWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  gridCol: {
    flex: 1,
    minWidth: 0,
  },
  pickerBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pickerBtnForm: {
    marginBottom: 6,
    backgroundColor: "#f8fafc",
  },
  pickerBtnError: {
    borderColor: Theme.negative,
  },
  pickerBtnText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  pickerBtnTextForm: {
    fontSize: 13,
    fontWeight: "500",
    fontStyle: "normal",
  },
  pickerBtnPlaceholder: {
    fontWeight: "400",
    color: Theme.placeholder,
  },
  inputError: {
    borderColor: Theme.negative,
  },
  tonsInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  tonsInputField: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    padding: 0,
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
    }),
  },
  tonsSuffix: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  tonsSuggestRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    alignContent: "flex-start",
    gap: 6,
    marginTop: 8,
    /** Cap visual height to ~2 chip rows. */
    maxHeight: 58,
    overflow: "hidden",
  },
  tonsRangeHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  tonsRangeHintError: {
    color: Theme.negative,
  },
  tonsSuggestChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    minHeight: 26,
    justifyContent: "center",
    ...Platform.select({ web: { cursor: "pointer" as const }, default: {} }),
  },
  tonsSuggestChipSelected: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
  },
  tonsSuggestChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  tonsSuggestChipTextSelected: {
    color: Theme.textPrimaryDark,
  },
  tonsSuggestChipTextRecent: {
    color: Theme.textRouteCard,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  modalSheet: {
    maxHeight: "70%",
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  addOwnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
  },
  addOwnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  addOwnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.primary,
  },
  optionRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  optionRowActive: {
    backgroundColor: Theme.surfaceLight,
  },
  optionText: {
    fontSize: 15,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  optionTextActive: {
    fontWeight: "700",
    color: Theme.primary,
  },
});
