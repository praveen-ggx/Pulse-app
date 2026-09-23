/**
 * Connection requests — global bootstrap is the source of truth on cold start.
 * Avoids duplicate RPCs that were already fetched in `useGlobalSyncStore.bootstrap`.
 */
import type { ConnectionRequestRow } from '@/features/connections/services/connectionRequests.service';
import { getConnectionRequestsReceived, getConnectionRequestsSent } from '@/features/connections/services/connectionRequests.service';
import { useGlobalSyncStore } from '@/lib/globalSync/useGlobalSyncStore';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { shouldFallbackConnectionRequestFetch } from '@/lib/hooks/connectionRequestQueryGate.util';

type Options = {
  enabled?: boolean;
};

function useBootstrapReady(orgId: string | null): boolean {
  const bootstrapStatus = useGlobalSyncStore((s) => s.bootstrapStatus);
  const bootstrappedOrgId = useGlobalSyncStore((s) => s.bootstrappedOrgId);
  return bootstrapStatus === 'ready' && bootstrappedOrgId === orgId && !!orgId;
}

function useConnectionRequestsQuery(
  orgId: string | null,
  kind: 'received' | 'sent',
  options?: Options,
) {
  const bootstrapReady = useBootstrapReady(orgId);
  const bootstrapStatus = useGlobalSyncStore((s) => s.bootstrapStatus);
  const fromStore = useGlobalSyncStore((s) =>
    kind === 'received' ? s.connectionRequestsReceived : s.connectionRequestsSent,
  );
  const refreshInboundProtocol = useGlobalSyncStore((s) => s.refreshInboundProtocol);
  const { status: authStatus } = useAuth();

  const shouldFetch = shouldFallbackConnectionRequestFetch({
    orgId,
    enabled: options?.enabled,
    bootstrapReady,
    bootstrapStatus,
    authStatus,
  });

  const queryKey =
    kind === 'received'
      ? queryKeys.connectionRequests.received(orgId ?? '')
      : queryKeys.connectionRequests.sent(orgId ?? '');

  const fallback = useQuery<ConnectionRequestRow[]>({
    queryKey,
    queryFn: async () => {
      const res =
        kind === 'received'
          ? await getConnectionRequestsReceived(orgId!)
          : await getConnectionRequestsSent(orgId!);
      if (res.error) throw res.error;
      return res.requests;
    },
    enabled: shouldFetch,
    staleTime: STALE.moderate,
  });

  const data = useMemo(
    () => (bootstrapReady ? fromStore : (fallback.data ?? fromStore)),
    [bootstrapReady, fromStore, fallback.data],
  );

  const refetch = useCallback(async () => {
    if (!orgId) return fallback.refetch();
    await refreshInboundProtocol(orgId);
    if (!bootstrapReady) await fallback.refetch();
  }, [orgId, bootstrapReady, refreshInboundProtocol, fallback]);

  const isPending =
    bootstrapStatus === 'loading' ||
    (!bootstrapReady && fallback.isPending && data.length === 0);

  return {
    data,
    isPending,
    isLoading: isPending,
    isFetching: fallback.isFetching,
    error: fallback.error,
    refetch,
  };
}

export function useConnectionRequestsReceivedQuery(
  orgId: string | null,
  options?: Options,
) {
  return useConnectionRequestsQuery(orgId, 'received', options);
}

export function useConnectionRequestsSentQuery(
  orgId: string | null,
  options?: Options,
) {
  return useConnectionRequestsQuery(orgId, 'sent', options);
}
