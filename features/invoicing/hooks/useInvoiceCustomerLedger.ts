/**
 * The customer figures already shown on Finance → Customers.
 * Invoice Receivables and Customer Ledger read this instead of a second balance.
 */
import { deriveCustomerPartyLedger } from "@/features/finance/utils/customerLedgerContract.util";
import { useFinanceCustomerLedgerInputs } from "@/lib/queries/useLedgerAggregationQuery";
import { queryKeys } from "@/lib/queryKeys";
import type { QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

export function useInvoiceCustomerLedger(orgId: string | null, clientId: string | null) {
  const query = useFinanceCustomerLedgerInputs(orgId);
  const linkedId = clientId && !clientId.startsWith("name:") ? clientId : null;
  const party = useMemo(() => {
    if (!linkedId || !query.data) return null;
    return deriveCustomerPartyLedger(linkedId, query.data);
  }, [linkedId, query.data]);
  return { party, ready: query.isSuccess && party != null, loading: query.isPending };
}

export function invalidateSharedCustomerLedger(queryClient: QueryClient, orgId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.financeAggregation.customer(orgId, true) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all(orgId) }),
    queryClient.invalidateQueries({ queryKey: ["customer-receipts", orgId] }),
  ]);
}
