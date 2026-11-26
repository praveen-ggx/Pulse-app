/**
 * Centered fleet picker — reference layout: title, search, rich rows.
 */
import { KeyboardAwareLayout } from "@/components/KeyboardAwareLayout";
import { CreateTripSheetSearchInput } from "@/components/CreateTripSheetSearchInput";
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import { formatIndianVehicleNumber } from "@/lib/format";
import { Truck, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { FlashList } from "@shopify/flash-list";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";

export type FleetPickerMode = "driver" | "vehicle";

export interface FleetEntityPickerModalProps {
  visible: boolean;
  mode: FleetPickerMode;
  drivers: DriverRow[];
  vehicles: VehicleRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}

function vehicleSubtitle(v: VehicleRow): string {
  const parts = [
    v.vehicle_body_type || v.vehicle_type,
    [v.vehicle_size, v.vehicle_axle].filter(Boolean).join(" "),
  ].filter(Boolean) as string[];
  return parts.join(" • ").toUpperCase();
}

function normalizeSearch(s: string): string {
  return s.trim().toLowerCase();
}

export function FleetEntityPickerModal({
  visible,
  mode,
  drivers,
  vehicles,
  selectedId,
  onSelect,
  onClose,
}: FleetEntityPickerModalProps) {
  const { width: winW } = useWindowDimensions();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const filteredDrivers = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return drivers;
    return drivers.filter((d) => {
      const name = (d.name || "").toLowerCase();
      const phone = (d.phone || "").replace(/\s/g, "");
      const email = (d.email || "").toLowerCase();
      return (
        name.includes(q) ||
        phone.includes(q.replace(/\s/g, "")) ||
        email.includes(q)
      );
    });
  }, [drivers, query]);

  const filteredVehicles = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return vehicles;
    return vehicles.filter((v) => {
      const reg = formatIndianVehicleNumber(v.vehicle_number || "")
        .toLowerCase()
        .replace(/\s/g, "");
      const blob = [
        v.vehicle_number,
        v.vehicle_type,
        v.vehicle_body_type,
        v.vehicle_size,
        v.vehicle_axle,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        blob.includes(q) ||
        reg.includes(q.replace(/\s/g, "")) ||
        (v.vehicle_number || "").toLowerCase().includes(q)
      );
    });
  }, [vehicles, query]);

  const title = mode === "driver" ? "Select driver" : "Select Vehicle";
  const subtitle =
    mode === "driver"
      ? "Choose a driver from your fleet"
      : "Choose a vehicle";
  const searchPh =
    mode === "driver" ? "Search driver…" : "Search vehicle…";

  const cardMaxW = Math.min(winW - 48, 520);
  const listRows: (DriverRow | VehicleRow)[] =
    mode === "driver" ? filteredDrivers : filteredVehicles;

  const emptyCopy =
    mode === "driver"
      ? "No drivers match your search."
      : "No vehicles match your search.";

  const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Lift the card above the keyboard (Android APK is edge-to-edge). */}
      <KeyboardAwareLayout scroll={false}>
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable style={styles.backdropPress} onPress={onClose}>
          <View style={styles.backdropDim} />
        </Pressable>

        <View style={styles.centerWrap} pointerEvents="box-none">
          <View style={[styles.sheet, { maxWidth: cardMaxW }]}>
            <View style={styles.sheetHead}>
              <View style={styles.sheetTitles}>
                <Text style={styles.sheetTitle}>{title}</Text>
                <Text style={styles.sheetSubtitle}>{subtitle}</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.closeBtn, webCursor]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={18} color={Theme.primary} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <CreateTripSheetSearchInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPh}
              shellStyle={styles.searchShell}
              accessibilityLabel={
                mode === "driver" ? "Search drivers" : "Search vehicles"
              }
            />

            <FlashList<DriverRow | VehicleRow>
              data={listRows}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.emptyText}>{emptyCopy}</Text>
              }
              renderItem={({ item }) =>
                mode === "driver" ? (
                  <DriverPickerRow
                    driver={item as DriverRow}
                    selected={selectedId === item.id}
                    onSelect={() => {
                      onSelect(selectedId === item.id ? null : item.id);
                      onClose();
                    }}
                  />
                ) : (
                  <VehiclePickerRow
                    vehicle={item as VehicleRow}
                    selected={selectedId === item.id}
                    onSelect={() => {
                      onSelect(selectedId === item.id ? null : item.id);
                      onClose();
                    }}
                  />
                )
              }
            />
          </View>
        </View>
      </View>
      </KeyboardAwareLayout>
    </Modal>
  );
}

function DriverPickerRow({
  driver,
  selected,
  onSelect,
}: {
  driver: DriverRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const webCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;
  const sub = [driver.phone, driver.email].filter(Boolean).join(" · ");
  return (
    <View style={[styles.row, selected && styles.rowSelected]}>
      <PartyAvatar
        name={driver.name ?? "Driver"}
        avatarUrl={(driver as { avatar_url?: string | null }).avatar_url ?? null}
        avatarSeed={(driver as { avatar_seed?: string | null }).avatar_seed ?? null}
        entityType="driver"
        size={44}
        borderStyle={styles.rowAvatar}
      />
      <View style={styles.rowTextBlock}>
        <Text style={styles.rowPrimary} numberOfLines={1}>
          {driver.name || "—"}
        </Text>
        {sub ? (
          <Text style={styles.rowSecondary} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={[styles.selectPill, selected && styles.selectPillSelected, webCursor]}
        onPress={onSelect}
        activeOpacity={0.8}
      >
        <Text style={[styles.selectPillText, selected && styles.selectPillTextSelected]}>
          {selected ? "Selected" : "Select"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function VehiclePickerRow({
  vehicle,
  selected,
  onSelect,
}: {
  vehicle: VehicleRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const webCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;
  const primary = formatIndianVehicleNumber(vehicle.vehicle_number || "") || "—";
  const secondary = vehicleSubtitle(vehicle);
  return (
    <View style={[styles.row, selected && styles.rowSelected]}>
      <View style={styles.rowIconCircle}>
        <Truck size={18} color={Theme.iconPrimary} />
      </View>
      <View style={styles.rowTextBlock}>
        <Text style={styles.rowPrimary} numberOfLines={1}>
          {primary}
        </Text>
        {secondary ? (
          <Text style={styles.rowSecondary} numberOfLines={2}>
            {secondary}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={[styles.selectPill, selected && styles.selectPillSelected, webCursor]}
        onPress={onSelect}
        activeOpacity={0.8}
      >
        <Text style={[styles.selectPillText, selected && styles.selectPillTextSelected]}>
          {selected ? "Selected" : "Select"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropDim: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
  },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  sheet: {
    width: "100%",
    maxHeight: "82%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sheetTitles: {
    flex: 1,
    paddingRight: 12,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  searchShell: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  list: {
    maxHeight: 340,
    minHeight: 120,
  },
  listContent: {
    paddingBottom: 16,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 28,
    paddingHorizontal: 24,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 12,
  },
  rowSelected: {
    backgroundColor: Theme.surfaceLight,
  },
  rowIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  rowAvatar: {
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
  },
  rowTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  rowPrimary: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  rowSecondary: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: Theme.textMuted,
  },
  selectPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
  },
  selectPillSelected: {
    borderColor: Theme.darkGreen,
    backgroundColor: Theme.positiveMuted,
  },
  selectPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: Theme.textPrimaryDark,
  },
  selectPillTextSelected: {
    color: Theme.darkGreen,
  },
});
