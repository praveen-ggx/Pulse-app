/**
 * Transport partner picker — matches TripClientPickerSection list UI.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import {
  WizardEntitySummaryCard,
  WizardSelectionGrid,
} from "@/components/full-page-wizard";
import Theme from "@/constants/Theme";
import { resolveWizardContactPhone } from "@/features/clients/utils/clientContactDisplay.util";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { CheckCircle2 } from "lucide-react-native";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export type TripPartnerPickerSectionProps = {
  suppliers: SupplierRow[];
  suppliersLoading: boolean;
  supplierId: string | null;
  partnerListExpanded: boolean;
  setPartnerListExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  onSelectPartner: (supplier: SupplierRow) => void;
  onClearPartner?: () => void;
  onAddPartner?: () => void;
  hasError?: boolean;
  wizardMode?: boolean;
  fieldLabelStyle?: StyleProp<TextStyle>;
  isDenseForm?: boolean;
  suppressCollapsedSummary?: boolean;
  listMaxHeight?: number;
  /**
   * Suppliers that cannot take this load, keyed by supplier id, with the reason
   * to show. Used by the load-chain loop guard to stop a load going back to the
   * cargo owner or an upstream broker. Shown greyed with the reason rather than
   * hidden — a silently missing partner reads as "deleted".
   */
  blockedReasonBySupplierId?: Record<string, string>;
};

function partnerDisplayName(supplier: SupplierRow): string {
  return (
    supplier.company_name?.trim() ||
    supplier.name?.trim() ||
    supplier.contact_person?.trim() ||
    "—"
  );
}

export function TripPartnerPickerSection({
  suppliers,
  suppliersLoading,
  supplierId,
  partnerListExpanded,
  setPartnerListExpanded,
  onSelectPartner,
  onClearPartner,
  onAddPartner,
  hasError = false,
  wizardMode = false,
  fieldLabelStyle,
  isDenseForm = false,
  listMaxHeight = 260,
  suppressCollapsedSummary = false,
  blockedReasonBySupplierId,
}: TripPartnerPickerSectionProps) {
  const selectedSupplier =
    suppliers.find((s) => s.id === supplierId) ?? null;
  // A blocked supplier (e.g. this load's own shipper) never counts as a valid
  // confirmed selection — fall back to the list instead of the summary card,
  // even if some earlier state left it selected.
  const selectedBlockedReason = supplierId
    ? blockedReasonBySupplierId?.[supplierId]
    : undefined;
  const showPartnerList =
    !supplierId || partnerListExpanded || Boolean(selectedBlockedReason);
  const showPartnerSummary = Boolean(
    supplierId && !partnerListExpanded && selectedSupplier && !selectedBlockedReason,
  );
  const showPicker =
    showPartnerList || (!suppressCollapsedSummary && showPartnerSummary);
  const webPointer =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

  const gridItems = useMemo(
    () =>
      [...suppliers]
        .sort((a, b) =>
          partnerDisplayName(a).localeCompare(partnerDisplayName(b), "en", {
            sensitivity: "base",
          }),
        )
        .map((supplier) => {
          const blockedReason = blockedReasonBySupplierId?.[supplier.id];
          return {
            id: supplier.id,
            name: partnerDisplayName(supplier),
            subtitle: resolveWizardContactPhone(supplier.phone),
            avatarUrl: supplier.avatar_url ?? null,
            avatarSeed: supplier.avatar_seed ?? null,
            entityType: "supplier" as const,
            organizationImageUrl:
              (supplier as { organization_avatar_url?: string | null })
                .organization_avatar_url ?? null,
            organizationAvatarSeed:
              (supplier as { organization_avatar_seed?: string | null })
                .organization_avatar_seed ?? null,
            disabled: Boolean(blockedReason),
            statusLabel: blockedReason,
          };
        }),
    [suppliers, blockedReasonBySupplierId],
  );

  if (wizardMode) {
    if (!showPicker) return null;

    return (
      <View style={styles.wrap}>
        {showPartnerSummary && !suppressCollapsedSummary && selectedSupplier ? (
          <WizardEntitySummaryCard
            label="Partner"
            name={partnerDisplayName(selectedSupplier)}
            subtitle={resolveWizardContactPhone(selectedSupplier.phone)}
            entityType="supplier"
            organizationImageUrl={
              (selectedSupplier as { organization_avatar_url?: string | null })
                .organization_avatar_url ?? null
            }
            organizationAvatarSeed={
              (selectedSupplier as { organization_avatar_seed?: string | null })
                .organization_avatar_seed ?? null
            }
            avatarUrl={selectedSupplier.avatar_url ?? null}
            avatarSeed={selectedSupplier.avatar_seed ?? null}
            onPress={() => setPartnerListExpanded(true)}
          />
        ) : suppliersLoading ? (
          <ActivityIndicator color={Theme.iconPrimary} />
        ) : showPartnerList || suppressCollapsedSummary ? (
          <>
            <WizardSelectionGrid
              items={gridItems}
              selectedId={selectedBlockedReason ? null : supplierId}
              onSelect={(id) => {
                const row = suppliers.find((s) => s.id === id);
                if (!row) return;
                if (supplierId === id) {
                  onClearPartner?.();
                  return;
                }
                onSelectPartner(row);
                setPartnerListExpanded(false);
              }}
              emptyMessage="No partners yet. Add the party from Suppliers first."
              listMaxHeight={listMaxHeight}
              columns={1}
              variant="partyCard"
              showListShell
            />
            {onAddPartner ? (
              <Pressable style={styles.addPartnerBtn} onPress={onAddPartner}>
                <Text style={styles.addPartnerBtnText}>+ Add partner</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
        {hasError ? (
          <Text style={styles.errorText}>Select a transport partner.</Text>
        ) : null}
      </View>
    );
  }

  if (!showPicker) return null;

  return (
    <View style={[styles.wrap, hasError && styles.fieldGroupRing]}>
      <View style={styles.sectionLabelRow}>
        <Text
          style={[
            styles.fieldLabel,
            styles.sectionLabelTight,
            fieldLabelStyle,
          ]}
        >
          Select transport partner
        </Text>
        <View style={styles.sectionLabelActions}>
          {supplierId ? (
            <TouchableOpacity
              style={styles.changeSelectionBtn}
              onPress={() => setPartnerListExpanded((p) => !p)}
              activeOpacity={0.85}
            >
              <Text style={styles.changeSelectionBtnText}>
                {partnerListExpanded ? "Collapse" : "Change"}
              </Text>
              <FontAwesome
                name={partnerListExpanded ? "chevron-up" : "chevron-down"}
                size={11}
                color={Theme.iconPrimary}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {suppliersLoading ? (
        <ActivityIndicator color={Theme.iconPrimary} />
      ) : suppliers.length === 0 ? (
        <Text style={styles.mutedSmall}>
          No partners yet. Add the party from Suppliers first.
        </Text>
      ) : showPartnerSummary && selectedSupplier ? (
        <TouchableOpacity
          style={[styles.partnerCard, styles.selectionSummaryCard]}
          onPress={() => setPartnerListExpanded(true)}
          activeOpacity={0.85}
        >
          <View style={styles.partnerMain}>
            <PartyAvatar
              name={partnerDisplayName(selectedSupplier)}
              organizationImageUrl={
                (selectedSupplier as { organization_avatar_url?: string | null })
                  .organization_avatar_url ?? null
              }
              organizationAvatarSeed={
                (selectedSupplier as { organization_avatar_seed?: string | null })
                  .organization_avatar_seed ?? null
              }
              avatarUrl={selectedSupplier.avatar_url ?? null}
              avatarSeed={selectedSupplier.avatar_seed ?? null}
              entityType="supplier"
              size={isDenseForm ? 32 : 38}
              borderStyle={styles.partnerAvatarOn}
            />
            <View style={styles.partnerTextCol}>
              <Text style={styles.selectionSummaryTitle} numberOfLines={1}>
                {partnerDisplayName(selectedSupplier)}
              </Text>
              {resolveWizardContactPhone(selectedSupplier.phone) ? (
                <Text style={styles.selectionSummarySub} numberOfLines={1}>
                  {resolveWizardContactPhone(selectedSupplier.phone)}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.selectionSummaryPill}>
            <Text style={styles.selectionSummaryPillText}>Change</Text>
          </View>
        </TouchableOpacity>
      ) : showPartnerList ? (
        <ScrollView
          style={[styles.partnerList, { maxHeight: listMaxHeight }]}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {suppliers.map((supplier) => {
            const selected = supplierId === supplier.id;
            const name = partnerDisplayName(supplier);
            const blockedReason = blockedReasonBySupplierId?.[supplier.id];
            const isBlocked = Boolean(blockedReason);
            return (
              <TouchableOpacity
                key={supplier.id}
                style={[
                  styles.partnerCard,
                  selected && styles.partnerCardRowSelected,
                  isBlocked && styles.partnerCardBlocked,
                  !isBlocked && webPointer,
                ]}
                disabled={isBlocked}
                accessibilityState={{ disabled: isBlocked }}
                onPress={() => {
                  if (isBlocked) return;
                  if (selected) {
                    onClearPartner?.();
                    return;
                  }
                  onSelectPartner(supplier);
                  setPartnerListExpanded(false);
                }}
                activeOpacity={0.85}
              >
                <View style={styles.partnerMain}>
                  <PartyAvatar
                    name={name}
                    organizationImageUrl={
                      (supplier as { organization_avatar_url?: string | null })
                        .organization_avatar_url ?? null
                    }
                    organizationAvatarSeed={
                      (supplier as { organization_avatar_seed?: string | null })
                        .organization_avatar_seed ?? null
                    }
                    avatarUrl={supplier.avatar_url ?? null}
                    avatarSeed={supplier.avatar_seed ?? null}
                    entityType="supplier"
                    size={isDenseForm ? 32 : 38}
                    borderStyle={
                      selected ? styles.partnerAvatarOn : styles.partnerAvatar
                    }
                  />
                  <View style={styles.partnerTextCol}>
                    <Text
                      style={[
                        styles.partnerName,
                        selected && styles.partnerNameOn,
                        isBlocked && styles.partnerNameBlocked,
                      ]}
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                    {isBlocked ? (
                      <Text style={styles.partnerBlockedReason}>
                        {blockedReason}
                      </Text>
                    ) : resolveWizardContactPhone(supplier.phone) ? (
                      <Text style={styles.partnerSub} numberOfLines={1}>
                        {resolveWizardContactPhone(supplier.phone)}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {isBlocked ? null : (
                  <View
                    style={[styles.radioOuter, selected && styles.radioOuterOn]}
                  >
                    {selected ? (
                      <CheckCircle2 size={16} color={Theme.primary} />
                    ) : null}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {hasError ? (
        <Text style={styles.errorText}>Select a transport partner.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    gap: 8,
  },
  fieldGroupRing: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.teslaRed,
    padding: 8,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 28,
  },
  sectionLabelTight: {
    marginBottom: 0,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  sectionLabelActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  changeSelectionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  changeSelectionBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  addPartnerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 36,
  },
  addPartnerBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  partnerList: {
    width: "100%",
  },
  partnerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    marginBottom: 6,
  },
  partnerCardRowSelected: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(79, 70, 229, 0.04)",
  },
  selectionSummaryCard: {
    marginBottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  partnerMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  partnerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  partnerAvatar: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  partnerAvatarOn: {
    borderWidth: 2,
    borderColor: Theme.primary,
  },
  partnerName: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  partnerNameOn: {
    color: Theme.primary,
  },
  partnerSub: {
    marginTop: 2,
    fontSize: 11,
    color: Theme.textMuted,
  },
  /** Load-chain loop guard: partner shown but not selectable. */
  partnerCardBlocked: {
    opacity: 0.55,
  },
  partnerNameBlocked: {
    color: Theme.textMuted,
  },
  partnerBlockedReason: {
    marginTop: 2,
    fontSize: 11,
    color: Theme.warning,
  },
  selectionSummaryTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  selectionSummarySub: {
    marginTop: 2,
    fontSize: 11,
    color: Theme.textMuted,
  },
  selectionSummaryPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  selectionSummaryPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterOn: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(79, 70, 229, 0.08)",
  },
  mutedSmall: {
    fontSize: 12,
    color: Theme.textMuted,
    lineHeight: 17,
  },
  errorText: {
    fontSize: 11,
    color: Theme.teslaRed,
    marginTop: 4,
  },
});
