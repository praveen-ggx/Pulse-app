/**
 * Transport partner (supplier) picker — same sheet pattern as FleetEntityPickerModal +
 * shared CreateTripSheetSearchInput.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { CreateTripSheetSearchInput } from "@/components/CreateTripSheetSearchInput";
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { getBlacklistedSupplierIds } from "@/features/suppliers/services/supplierVendorOnboarding.service";
import { X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
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

function supplierPrimary(s: SupplierRow): string {
  return (
    (s.company_name && s.company_name.trim()) ||
    (s.name && s.name.trim()) ||
    (s.contact_person && s.contact_person.trim()) ||
    "—"
  );
}

function supplierTypeLabel(t?: string | null): string {
  if (!t) return "";
  const map: Record<string, string> = {
    integrated: "Integrated",
    offline: "Offline",
    marketplace: "Marketplace",
  };
  return map[t] ?? t;
}

function supplierSecondary(s: SupplierRow): string {
  const bits = [supplierTypeLabel(s.supplier_type), s.phone, s.email].filter(
    Boolean,
  ) as string[];
  return bits.join(" · ");
}

function normalizeSearch(s: string): string {
  return s.trim().toLowerCase();
}

export interface PartnerSupplierPickerModalProps {
  visible: boolean;
  suppliers: SupplierRow[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}

export function PartnerSupplierPickerModal({
  visible,
  suppliers,
  loading,
  selectedId,
  onSelect,
  onClose,
}: PartnerSupplierPickerModalProps) {
  const { width: winW } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [blacklistedIds, setBlacklistedIds] = useState<Set<string>>(() => new Set());
  const orgId = suppliers[0]?.organization_id ?? null;

  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  useEffect(() => {
    if (!visible || !orgId) return;
    let cancelled = false;
    void getBlacklistedSupplierIds(orgId).then((ids) => {
      if (!cancelled) setBlacklistedIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, orgId]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return suppliers;
    return suppliers.filter((s) => {
      const blob = [
        s.company_name,
        s.name,
        s.contact_person,
        s.phone,
        s.email,
        s.address,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        blob.includes(q) ||
        supplierPrimary(s).toLowerCase().includes(q)
      );
    });
  }, [suppliers, query]);

  const cardMaxW = Math.min(winW - 48, 520);
  const webCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

  const emptyMessage = (() => {
    if (loading && suppliers.length === 0) return "";
    if (suppliers.length === 0) {
      return "No partners yet. Add the party from Suppliers first.";
    }
    if (filtered.length === 0) {
      return "No partners match your search.";
    }
    return "";
  })();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable style={styles.backdropPress} onPress={onClose}>
          <View style={styles.backdropDim} />
        </Pressable>

        <View style={styles.centerWrap} pointerEvents="box-none">
          <View style={[styles.sheet, { maxWidth: cardMaxW }]}>
            <View style={styles.sheetHead}>
              <View style={styles.sheetTitles}>
                <Text style={styles.sheetTitle}>Select partner</Text>
                <Text style={styles.sheetSubtitle}>
                  Choose a transport partner for this trip
                </Text>
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
              placeholder="Search partner by name, phone, or email…"
              shellStyle={styles.searchShell}
              accessibilityLabel="Search partners"
            />

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                loading && suppliers.length === 0 ? (
                  <View style={styles.loadingState}>
                    <LoadingIndicator size="small" color={Theme.primary} />
                    <Text style={[styles.loadingHint, { marginTop: 12 }]}>
                      Loading partners…
                    </Text>
                  </View>
                ) : emptyMessage ? (
                  <Text style={styles.emptyText}>{emptyMessage}</Text>
                ) : null
              }
              renderItem={({ item }) => (
                <SupplierPickerRow
                  supplier={item}
                  selected={selectedId === item.id}
                  blacklisted={blacklistedIds.has(item.id)}
                  onSelect={() => {
                    onSelect(selectedId === item.id ? null : item.id);
                  }}
                />
              )}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SupplierPickerRow({
  supplier,
  selected,
  blacklisted,
  onSelect,
}: {
  supplier: SupplierRow;
  selected: boolean;
  /** Blacklisted vendors can't be picked (deselecting stays allowed). */
  blacklisted: boolean;
  onSelect: () => void;
}) {
  const locked = blacklisted && !selected;
  const webCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;
  const primary = supplierPrimary(supplier);
  const secondary = supplierSecondary(supplier);
  return (
    <View style={[styles.row, selected && styles.rowSelected]}>
      <PartyAvatar
        name={primary}
        organizationImageUrl={
          (supplier as { organization_avatar_url?: string | null }).organization_avatar_url ??
          null
        }
        organizationAvatarSeed={
          (supplier as { organization_avatar_seed?: string | null }).organization_avatar_seed ??
          null
        }
        avatarUrl={(supplier as { avatar_url?: string | null }).avatar_url ?? null}
        avatarSeed={(supplier as { avatar_seed?: string | null }).avatar_seed ?? null}
        entityType="supplier"
        size={44}
        borderStyle={styles.rowAvatar}
      />
      <View style={styles.rowTextBlock}>
        <Text style={styles.rowPrimary} numberOfLines={2}>
          {primary}
        </Text>
        {secondary ? (
          <Text style={styles.rowSecondary} numberOfLines={2}>
            {secondary.toUpperCase()}
          </Text>
        ) : null}
        {blacklisted ? <Text style={styles.rowBlacklisted}>BLACKLISTED</Text> : null}
      </View>
      <TouchableOpacity
        style={[
          styles.selectPill,
          selected && styles.selectPillSelected,
          locked && styles.selectPillLocked,
          !locked && webCursor,
        ]}
        onPress={onSelect}
        disabled={locked}
        activeOpacity={0.8}
        accessibilityState={{ disabled: locked, selected }}
      >
        <Text
          style={[styles.selectPillText, selected && styles.selectPillTextSelected]}
        >
          {selected ? "Selected" : locked ? "Blocked" : "Select"}
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
    borderRadius: 22,
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
    paddingBottom: 10,
  },
  sheetTitles: {
    flex: 1,
    paddingRight: 12,
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.6,
  },
  sheetSubtitle: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  loadingState: {
    alignItems: "center",
    paddingVertical: 36,
  },
  loadingHint: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textMuted,
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
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 12,
  },
  rowSelected: {
    backgroundColor: Theme.surfaceLight,
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
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  rowSecondary: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.6,
    color: Theme.textMuted,
  },
  rowBlacklisted: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: Theme.negative,
  },
  selectPillLocked: {
    opacity: 0.45,
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
    fontWeight: "700",
    letterSpacing: 1,
    color: Theme.textPrimaryDark,
  },
  selectPillTextSelected: {
    color: Theme.darkGreen,
  },
});
