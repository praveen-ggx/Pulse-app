/**
 * Reusable hook: clients + trips for an org with computed totals.
 * Reads from the shared TanStack Query cache — no redundant network requests.
 */
import { useCallback, useMemo } from 'react';
import { useClientsQuery } from '@/lib/queries/useClientsQuery';
import { useCompleteTripsQuery } from '@/lib/queries/useTripsQuery';
import { computeClientTotals, computeTripSummary } from '@/features/clients/utils/totals.util';

export function useClientsWithTotals(organizationId: string | null, enabled: boolean) {
  const clientsQuery = useClientsQuery(enabled ? organizationId : null);
  const tripsQuery = useCompleteTripsQuery(enabled ? organizationId : null);

  const clients = clientsQuery.data ?? [];
  const trips = tripsQuery.data ?? [];
  const loading = clientsQuery.isLoading || tripsQuery.isLoading;

  const { totalRevenue, totalCost } = useMemo(() => computeTripSummary(trips), [trips]);
  const clientTotals = useMemo(() => computeClientTotals(clients, trips), [clients, trips]);

  const refetch = useCallback(() => {
    clientsQuery.refetch();
    tripsQuery.refetch();
  }, [clientsQuery, tripsQuery]);

  return {
    clients,
    trips,
    clientTotals,
    totalRevenue,
    totalCost,
    loading,
    refetch,
  };
}
