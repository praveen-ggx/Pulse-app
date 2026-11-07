import { useAuth } from '@/contexts/AuthContext';
import {
  DEFAULT_DRIVER_OPERATING_MODE,
  canAddDcoShippers,
  canAttributeToEmployer,
  canManageDcoSelfBook,
  canManageIndieBook,
  canTagOfflineParty,
  canManageOwnerVehicles,
  canTagOfflineParty,
  isDcoOperatingMode,
  type DriverOperatingMode,
} from '@/features/drivers/domain/driverOperatingMode';
import { getMyDriverOperatingMode } from '@/features/driver/services/driverOperatingMode.service';
import { queryKeys } from '@/lib/queryKeys';
import {
  infrastructureRetryDelay,
  infrastructureShouldRetry,
} from '@/lib/queryRetry';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Server-resolved Driver vs DCO mode.
 *
 * Important: TanStack Query v5 sets `isLoading=false` while a query is
 * `enabled:false` (e.g. auth still restoring). Screens must use `modeLoading`
 * from this hook — not raw `isLoading` — before gating redirects on
 * `canTagOfflineParty` / book flags, or indie DRIVERs get bounced home.
 */
export function useDriverOperatingModeQuery(userId?: string | null) {
  const { status: authStatus, profile } = useAuth();
  const uid = userId ?? profile?.uid ?? '';
  const isDriver = profile?.role === 'driver';
  const authSettled = authStatus !== 'restoring';

  const query = useQuery({
    queryKey: queryKeys.driverApp.driverOperatingMode(uid),
    queryFn: async (): Promise<DriverOperatingMode> => {
      const { error, mode } = await getMyDriverOperatingMode();
      if (error) throw error;
      return mode ?? DEFAULT_DRIVER_OPERATING_MODE;
    },
    enabled: !!uid && isDriver && authSettled,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    retry: infrastructureShouldRetry,
    retryDelay: infrastructureRetryDelay,
    refetchOnWindowFocus: true,
  });

  const queryClient = useQueryClient();
  const invalidate = useCallback(() => {
    if (!uid) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.driverApp.driverOperatingMode(uid),
    });
  }, [queryClient, uid]);

  // Still resolving identity or first mode fetch — do not treat as "denied".
  const modeLoading =
    !authSettled ||
    (isDriver && !!uid && !query.isFetched) ||
    (isDriver && !!uid && query.isFetching && !query.isFetched);

  const operatingMode = query.data ?? DEFAULT_DRIVER_OPERATING_MODE;
  // Capabilities apply once the first fetch has settled (success or error).
  // On error we keep DEFAULT (plain independent DRIVER) — fail closed for DCO /
  // Marketplace via parse defaults, but do not strip indie tagging.
  const ready = isDriver && query.isFetched;

  return {
    ...query,
    /** Prefer this over `isLoading` for route/screen gates. */
    modeLoading,
    isLoading: modeLoading,
    operatingMode,
    isDco: ready && isDcoOperatingMode(operatingMode),
    canManageOwnerVehicles: ready && canManageOwnerVehicles(operatingMode),
    canAddDcoShippers: ready && canAddDcoShippers(operatingMode),
    canManageDcoSelfBook: ready && canManageDcoSelfBook(operatingMode),
    canManageIndieBook: ready && canManageIndieBook(operatingMode),
    canAttributeToEmployer: ready && canAttributeToEmployer(operatingMode),
    canTagOfflineParty: ready && canTagOfflineParty(operatingMode),
    marketplaceAllowed: ready && operatingMode.marketplaceAllowed,
    invalidate,
  };
}
