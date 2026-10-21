import { DcoPayeesTab } from "@/features/finance/components/DcoPayeesTab";
import {
  SUPPLIER_PARTY_KIND_OPTIONS,
} from "@/features/finance/domain/financeCounterpartyLane";
import { ExchangeTripsLaneCard } from "@/features/marketplace/components/ExchangeTripsLaneCard";
import { SuppliersTab } from "@/features/suppliers/components/SuppliersTab";
import Theme from "@/constants/Theme";
import {
  WEB_POINTER,
  WEB_TRANSITION,
  hoverRowWash,
  isHovered,
  type HoverPressState,
} from "@/constants/hoverSelection";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { FinanceTabBodyProps } from "../FinanceTabBody.types";

export function FinanceSuppliersTab(props: FinanceTabBodyProps) {
  const {
    organizationId: orgId,
    ledgerForEntityAggregation,
    ledgerTransactions,
    supplierRows,
    tripRows,
    tripsWhereOrgIsClient,
    entitiesLoading,
    onTabTotals,
    onEntityRowSelect,
    searchQuery,
    entityFilter,
    tripPartyMap,
    topContent,
    refreshing,
    onRefresh,
    bottomInset,
    tripFinanceAdjustmentsByTripId,
    financeSubTab,
    supplierViewTab,
    onSupplierViewTabChange,
    embedInParentScroll,
    onAddPartyPress,
    supplierPartyKind = "all",
    onSupplierPartyKindChange,
  } = props;

  const entityAggregationLedger =
    ledgerForEntityAggregation ?? ledgerTransactions ?? undefined;

  const [dcoTotals, setDcoTotals] = useState({ totalIn: 0, totalOut: 0 });
  const [supplierTotals, setSupplierTotals] = useState({
    totalIn: 0,
    totalOut: 0,
  });

  useEffect(() => {
    if (supplierPartyKind === "dco") {
      onTabTotals(dcoTotals);
      return;
    }
    if (supplierPartyKind === "supplier") {
      onTabTotals(supplierTotals);
      return;
    }
    onTabTotals({
      totalIn: dcoTotals.totalIn + supplierTotals.totalIn,
      totalOut: dcoTotals.totalOut + supplierTotals.totalOut,
    });
  }, [supplierPartyKind, dcoTotals, supplierTotals, onTabTotals]);

  const showDco = supplierPartyKind === "all" || supplierPartyKind === "dco";
  const showSupplier =
    supplierPartyKind === "all" || supplierPartyKind === "supplier";
  /** All: DCO rows and the supplier table share one scroll. */
  const scrollTogether = !embedInParentScroll && showDco && showSupplier;
  const tabBarScrollProps = useTabBarAwareScrollProps();

  const kindChips = (
    <View style={styles.kindRow}>
      {SUPPLIER_PARTY_KIND_OPTIONS.map((opt) => {
        const active = supplierPartyKind === opt.id;
        return (
          <Pressable
            key={opt.id}
            style={(state: HoverPressState) => [
              styles.kindChip,
              active && styles.kindChipActive,
              WEB_POINTER,
              WEB_TRANSITION,
              !active && isHovered(state) && hoverRowWash,
            ]}
            onPress={() => onSupplierPartyKindChange?.(opt.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.kindChipText, active && styles.kindChipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const lists = (
    <>
      <ExchangeTripsLaneCard organizationId={orgId} side="payer" contactFilter={supplierPartyKind} />
      {showDco ? (
        <DcoPayeesTab
          organizationId={orgId}
          onRowSelect={(data) =>
            onEntityRowSelect(
              { ...data, counterpartyKind: "dco" },
              "SUPPLIER",
              financeSubTab,
            )
          }
          searchQuery={searchQuery}
          entityFilter={entityFilter}
          topContent={supplierPartyKind === "dco" ? topContent : undefined}
          refreshing={refreshing}
          onRefresh={onRefresh}
          bottomInset={bottomInset}
          embedInParentScroll
          hideSummaryRow={supplierPartyKind === "all"}
          onTotals={setDcoTotals}
        />
      ) : null}
      {showSupplier ? (
        <SuppliersTab
          organizationId={orgId}
          suppliers={supplierRows}
          trips={tripRows}
          tripsWhereOrgIsClient={tripsWhereOrgIsClient}
          transactions={entityAggregationLedger}
          parentLoading={entitiesLoading}
          onTotals={setSupplierTotals}
          onRowSelect={(data, entityType) =>
            onEntityRowSelect(
              { ...data, counterpartyKind: "supplier" },
              entityType,
              financeSubTab,
            )
          }
          searchQuery={searchQuery}
          entityFilter={entityFilter}
          tripPartyMap={tripPartyMap}
          topContent={
            supplierPartyKind === "supplier" ? topContent : undefined
          }
          refreshing={refreshing}
          onRefresh={onRefresh}
          bottomInset={bottomInset}
          tripFinanceAdjustmentsByTripId={tripFinanceAdjustmentsByTripId}
          viewTab={supplierViewTab}
          onViewTabChange={onSupplierViewTabChange}
          hideSummaryRow
          embedInParentScroll={embedInParentScroll || scrollTogether}
          onAddPartyPress={onAddPartyPress}
        />
      ) : null}
    </>
  );

  if (scrollTogether) {
    return (
      <View style={styles.wrap}>
        {kindChips}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: bottomInset ?? 24 }}
          showsVerticalScrollIndicator={false}
          {...tabBarScrollProps}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing ?? false}
                onRefresh={onRefresh}
                tintColor={Theme.loaderAccent}
              />
            ) : undefined
          }
        >
          {lists}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={embedInParentScroll ? styles.embedWrap : styles.wrap}>
      {kindChips}
      {lists}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  scroll: { flex: 1, minHeight: 0 },
  embedWrap: { width: "100%", minWidth: 0 },
  kindRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  kindChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    minHeight: 44,
    justifyContent: "center",
  },
  kindChipActive: {
    borderColor: Theme.teslaRed,
    backgroundColor: Theme.surfaceGray,
  },
  kindChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  kindChipTextActive: {
    color: Theme.teslaRed,
  },
});
