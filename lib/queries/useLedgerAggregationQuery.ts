/**
 * TanStack Query hooks for the server-side ledger aggregation RPCs. See
 * features/finance/services/ledgerAggregationRpc.service.ts.
 */
import { useQuery } from '@tanstack/react-query';
import {
  getDriverLedgerAggregation,
  getSupplierLedgerAggregation,
  getCustomerLedgerInputs,
  getDcoLedgerAggregation,
} from '@/features/finance/services/ledgerAggregationRpc.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

/** Matches get_customer_ledger_inputs default. Header, table, and detail share it. */
export const CUSTOMER_LEDGER_APPLY_ADJUSTMENTS = true;

export function useDriverLedgerAggregationQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.financeAggregation.driver(orgId ?? ''),
    queryFn: () => getDriverLedgerAggregation(orgId!),
    enabled: !!orgId,
    staleTime: STALE.realtime,
  });
}

export function useSupplierLedgerAggregationQuery(
  orgId: string | null,
  applyAdjustments: boolean,
) {
  return useQuery({
    queryKey: queryKeys.financeAggregation.supplier(orgId ?? '', applyAdjustments),
    queryFn: () => getSupplierLedgerAggregation(orgId!, applyAdjustments),
    enabled: !!orgId,
    staleTime: STALE.realtime,
  });
}

export function useDcoLedgerAggregationQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.financeAggregation.dco(orgId ?? ''),
    queryFn: () => getDcoLedgerAggregation(orgId!),
    enabled: !!orgId,
    staleTime: STALE.realtime,
  });
}

export function useCustomerLedgerInputsQuery(
  orgId: string | null,
  applyAdjustments: boolean,
) {
  return useQuery({
    queryKey: queryKeys.financeAggregation.customer(orgId ?? '', applyAdjustments),
    queryFn: () => getCustomerLedgerInputs(orgId!, applyAdjustments),
    enabled: !!orgId,
    staleTime: STALE.realtime,
  });
}

/** Single Finance Customers contract — header, table, and client detail share this key. */
export function useFinanceCustomerLedgerInputs(orgId: string | null) {
  return useCustomerLedgerInputsQuery(orgId, CUSTOMER_LEDGER_APPLY_ADJUSTMENTS);
}
