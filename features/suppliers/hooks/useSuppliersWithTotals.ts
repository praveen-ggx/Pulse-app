/**
 * Reusable hook: suppliers + trips for an org with computed totals.
 * Reads from the shared TanStack Query cache — no redundant network requests.
 */
import { useCallback, useMemo } from 'react';
import { useSuppliersQuery } from '@/lib/queries/useSuppliersQuery';
import { useCompleteTripsQuery } from '@/lib/queries/useTripsQuery';
import {
  computeSupplierTotalsFromTrips,
  computeTripSummary,
} from '@/features/suppliers/utils/totals.util';

export function useSuppliersWithTotals(organizationId: string | null) {
  const suppliersQuery = useSuppliersQuery(organizationId);
  const tripsQuery = useCompleteTripsQuery(organizationId);

  const suppliers = suppliersQuery.data ?? [];
  const trips = tripsQuery.data ?? [];
  const loading = suppliersQuery.isLoading || tripsQuery.isLoading;
  const error = suppliersQuery.error ? (suppliersQuery.error as Error).message : null;

  const { totalRevenue, totalCost } = useMemo(() => computeTripSummary(trips), [trips]);
  const supplierTotals = useMemo(() => computeSupplierTotalsFromTrips(trips), [trips]);

  const refetch = useCallback(() => {
    suppliersQuery.refetch();
    tripsQuery.refetch();
  }, [suppliersQuery, tripsQuery]);

  return {
    suppliers,
    trips,
    supplierTotals,
    totalRevenue,
    totalCost,
    loading,
    error,
    refetch,
  };
}
