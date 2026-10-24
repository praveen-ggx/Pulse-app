import { CustomersTab } from "@/features/clients/components/CustomersTab";
import { ExchangeTripsLaneCard } from "@/features/marketplace/components/ExchangeTripsLaneCard";
import { StyleSheet, View } from "react-native";
import type { FinanceTabBodyProps } from "../FinanceTabBody.types";

export function FinanceCustomersTab(props: FinanceTabBodyProps) {
  const {
    organizationId: orgId,
    ledgerForEntityAggregation,
    ledgerTransactions,
    filteredLedgerForDisplay,
    clientRows,
    tripRows,
    tripsWhereOrgIsSupplier,
    clientsLoading,
    entitiesLoading,
    onTabTotals,
    onEntityRowSelect,
    searchQuery,
    entityFilter,
    connectionRequestsSent,
    tripPartyMap,
    tripDetailsMap,
    topContent,
    refreshing,
    onRefresh,
    bottomInset,
    tripFinanceAdjustmentsByTripId,
    financeSubTab,
    customerViewTab,
    onCustomerViewTabChange,
    embedInParentScroll,
    onAddPartyPress,
  } = props;

  const entityAggregationLedger =
    ledgerForEntityAggregation ?? ledgerTransactions ?? undefined;

  return (
    <View style={embedInParentScroll ? styles.embedWrap : styles.wrap}>
      <ExchangeTripsLaneCard organizationId={orgId} side="payee" />
      <CustomersTab
        organizationId={orgId}
        clients={clientRows}
        trips={tripRows}
        tripsWhereOrgIsSupplier={tripsWhereOrgIsSupplier}
        transactions={entityAggregationLedger}
        parentLoading={clientsLoading ?? entitiesLoading}
        onTotals={onTabTotals}
        onRowSelect={(data, entityType) =>
          onEntityRowSelect(data, entityType, financeSubTab)
        }
        searchQuery={searchQuery}
        entityFilter={entityFilter}
        pendingClientInvites={connectionRequestsSent.filter(
          (r) => r.request_shipper_client && r.status === "pending",
        )}
        tripPartyMap={tripPartyMap}
        ledgerRows={filteredLedgerForDisplay}
        tripDetailsMap={tripDetailsMap}
        topContent={topContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
        bottomInset={bottomInset}
        tripFinanceAdjustmentsByTripId={tripFinanceAdjustmentsByTripId}
        viewTab={customerViewTab}
        onViewTabChange={onCustomerViewTabChange}
        hideSummaryRow
        embedInParentScroll={embedInParentScroll}
        onAddPartyPress={onAddPartyPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  embedWrap: { width: "100%", minWidth: 0 },
});
