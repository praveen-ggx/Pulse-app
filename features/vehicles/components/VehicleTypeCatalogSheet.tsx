import { useEffect, useState } from "react";
import {
  Image,
  useWindowDimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Truck, X } from "lucide-react-native";

import Theme from "@/constants/Theme";
import {
  LCV_SUB_CATEGORIES,
  VEHICLE_MAIN_CATEGORIES,
  formatVehicleTypeSelection,
  parseVehicleTypeSelection,
  passingTonForTons,
  passingTonsFor,
  vehicleTypesForGroup,
  type VehicleCategoryKey,
  type VehicleGroupLabel,
} from "@/features/vehicles/utils/vehicleTypeCatalog.model";

const CATEGORY_IMAGES: Record<VehicleCategoryKey, ImageSourcePropType> = {
  trailer: require("../../../assets/trucks/OpenBody.png") as ImageSourcePropType,
  open: require("../../../assets/trucks/OpenBody.png") as ImageSourcePropType,
  container: require("../../../assets/trucks/32FT_Container.png") as ImageSourcePropType,
  lcv: require("../../../assets/trucks/LCV.png") as ImageSourcePropType,
  tipper: require("../../../assets/trucks/Tipper.png") as ImageSourcePropType,
  tanker: require("../../../assets/trucks/LCV.png") as ImageSourcePropType,
  bulker: require("../../../assets/trucks/LCV.png") as ImageSourcePropType,
  reefer: require("../../../assets/trucks/32FT_Container.png") as ImageSourcePropType,
  car_carrier: require("../../../assets/trucks/OpenBody.png") as ImageSourcePropType,
};

const CATEGORY_GROUP_MAP: Record<VehicleCategoryKey, VehicleGroupLabel> = {
  trailer: "Trailer",
  open: "Open",
  container: "Container",
  lcv: "LCV Open",
  tipper: "Tipper",
  tanker: "Tanker",
  bulker: "Bulker",
  reefer: "Reefer",
  car_carrier: "Car Carrier",
};

function formatPassingTonLabel(label: string): string {
  const plus = label.match(/^\s*([\d.]+)\+\s*Ton\s*$/i);
  if (plus) return `${plus[1]}+ MT`;
  const range = label.match(/^\s*[\d.]+\s*-\s*([\d.]+)\s*Ton\s*$/i);
  if (range) return `Upto ${range[1]} MT`;
  const single = label.match(/^\s*([\d.]+)\s*Ton\s*$/i);
  if (single) return `Upto ${single[1]} MT`;
  return label.replace(/Ton$/i, "").trim();
}

function categoryOfGroup(group: VehicleGroupLabel): VehicleCategoryKey {
  if (group === "Trailer") return "trailer";
  if (group === "Open") return "open";
  if (group === "Container") return "container";
  if (group === "Tipper") return "tipper";
  if (group === "Tanker") return "tanker";
  if (group === "Bulker") return "bulker";
  if (group === "Reefer") return "reefer";
  if (group === "Car Carrier") return "car_carrier";
  return "lcv";
}

type Props = {
  visible: boolean;
  /** Current stored value (catalog string or legacy free text). */
  value: string;
  /** Current load tons, used to preselect the matching passing ton. */
  tons?: string;
  onClose: () => void;
  /**
   * Receives "Open 20 Feet" style value ("" when cleared) and the picked
   * passing ton label, which is not part of the stored name.
   */
  onChange: (value: string, passingTon: string | null) => void;
};

export function VehicleTypeCatalogSheet({ visible, value, tons: loadTons, onClose, onChange }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const [group, setGroup] = useState<VehicleGroupLabel>("Open");
  const [type, setType] = useState<string | null>(null);
  const [passingTon, setPassingTon] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const parsed = parseVehicleTypeSelection(value);
    setGroup(parsed?.group ?? "Open");
    setType(parsed?.type ?? null);
    setPassingTon(parsed ? passingTonForTons(parsed, loadTons) : null);
    // Only re-seed when the sheet opens or the stored value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, value]);

  const category = categoryOfGroup(group);
  const types = vehicleTypesForGroup(group);
  const tons = passingTonsFor(group, type);
  const canApply = type != null;

  const pickCategory = (key: VehicleCategoryKey) => {
    const next: VehicleGroupLabel = CATEGORY_GROUP_MAP[key];
    if (categoryOfGroup(group) === key) return;
    setGroup(next);
    setType(null);
    setPassingTon(null);
  };

  const pickGroup = (next: VehicleGroupLabel) => {
    if (next === group) return;
    setGroup(next);
    setType(null);
    setPassingTon(null);
  };

  const pickType = (t: string) => {
    setType(t);
    const options = passingTonsFor(group, t);
    // Auto-select the passing ton for the truck's range (keep a still-valid pick).
    setPassingTon((prev) => (prev && options.includes(prev) ? prev : options[0] ?? null));
  };

  const clearAll = () => {
    setGroup("Open");
    setType(null);
    setPassingTon(null);
    onChange("", null);
    onClose();
  };

  const apply = () => {
    if (type == null) return;
    onChange(formatVehicleTypeSelection({ group, type }), passingTon);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, isWide && styles.backdropWide]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, isWide && styles.sheetWide, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Vehicle type</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <X size={22} color={Theme.textPrimaryDark} />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
            style={styles.categoryScrollOuter}
          >
            {VEHICLE_MAIN_CATEGORIES.map((c) => {
              const active = c.key === category;
              return (
                <Pressable
                  key={c.key}
                  style={[styles.categoryCard, active && styles.categoryActive]}
                  onPress={() => pickCategory(c.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Image source={CATEGORY_IMAGES[c.key]} style={styles.categoryImage} resizeMode="contain" />
                  <Text style={[styles.categoryName, active && styles.textActive]}>{c.name}</Text>
                  <Text style={styles.categoryRange}>{c.capacityRange}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

            {category === "lcv" ? (
              <View style={styles.chipRow}>
                {LCV_SUB_CATEGORIES.map((s) => {
                  const active = s.name === group;
                  return (
                    <Pressable
                      key={s.key}
                      style={[styles.chip, active && styles.tileActive]}
                      onPress={() => pickGroup(s.name as VehicleGroupLabel)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.chipText, active && styles.textActive]}>{s.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>{category === "lcv" ? "Truck length" : "Vehicle type"}</Text>
            <View style={styles.grid}>
              {types.map((t) => {
                const active = t === type;
                return (
                  <Pressable
                    key={t}
                    style={[styles.typeTile, active && styles.tileActive]}
                    onPress={() => pickType(t)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Truck size={22} color={Theme.textPrimaryDark} strokeWidth={1.5} />
                    <Text style={[styles.typeText, active && styles.textActive]} numberOfLines={2}>
                      {t}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {tons.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Passing Ton</Text>
                <View style={styles.grid}>
                  {tons.map((t) => {
                    const active = t === passingTon;
                    return (
                      <Pressable
                        key={t}
                        style={[styles.tonTile, active && styles.tileActive]}
                        onPress={() => setPassingTon(active ? null : t)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.typeText, active && styles.textActive]}>{formatPassingTonLabel(t)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.clearBtn} onPress={clearAll} accessibilityRole="button">
              <Text style={styles.clearText}>CLEAR ALL</Text>
            </Pressable>
            <Pressable
              style={[styles.applyBtn, !canApply && styles.applyBtnDisabled]}
              onPress={apply}
              disabled={!canApply}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canApply }}
            >
              <Text style={styles.applyText}>DONE</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const TILE_BASIS = "23%";

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: Theme.overlayBackdrop,
  },
  backdropWide: {
    justifyContent: "center",
    padding: 24,
  },
  sheetWide: {
    borderRadius: 20,
    maxHeight: "90%",
  },
  sheet: {
    maxHeight: "88%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  body: {
    padding: 16,
    gap: 12,
  },
  categoryScrollOuter: {
    flexGrow: 0,
    marginTop: 4,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryCard: {
    width: 100,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    minHeight: 44,
  },
  categoryImage: {
    width: 56,
    height: 32,
    marginBottom: 4,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  categoryRange: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 2,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  chipText: {
    fontSize: 14,
    color: Theme.textPrimaryDark,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginTop: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeTile: {
    flexBasis: TILE_BASIS,
    flexGrow: 0,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    ...Platform.select({ web: { cursor: "pointer" as const }, default: {} }),
  },
  tonTile: {
    flexBasis: TILE_BASIS,
    flexGrow: 0,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    ...Platform.select({ web: { cursor: "pointer" as const }, default: {} }),
  },
  categoryActive: {
    backgroundColor: Theme.cardWhite,
    borderColor: Theme.textPrimaryDark,
    borderWidth: 2,
  },
  tileActive: {
    backgroundColor: Theme.primaryLight,
    borderColor: Theme.primary,
  },
  typeText: {
    fontSize: 13,
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  textActive: {
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  clearBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  clearText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  applyBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: Theme.primary,
  },
  applyBtnDisabled: {
    opacity: 0.4,
  },
  applyText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.cardWhite,
  },
});
