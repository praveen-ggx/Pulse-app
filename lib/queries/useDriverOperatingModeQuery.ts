import { useAuth } from '@/contexts/AuthContext';
import {
  DEFAULT_DRIVER_OPERATING_MODE,
  canAddDcoShippers,
  canManageDcoSelfBook,
  canTagOfflineParty,
  canManageOwnerVehicles,
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

/** Server-resolved Driver vs DCO mode. Fails closed (plain driver, no Marketplace) until loaded. */
export function useDriverOperatingModeQuery(userId?: string | null) {
  const { status: authStatus, profile } = useAuth();
  const uid = userId ?? profile?.uid ?? '';
  const isDriver = profile?.role === 'driver';

  const query = useQuery({
    queryKey: queryKeys.driverApp.driverOperatingMode(uid),
    queryFn: async (): Promise<DriverOperatingMode> => {
      const { error, mode } = await getMyDriverOperatingMode();
      if (error) throw error;
      return mode ?? DEFAULT_DRIVER_OPERATING_MODE;
    },
    enabled: !!uid && isDriver && authStatus !== 'restoring',
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

  const operatingMode = query.data ?? DEFAULT_DRIVER_OPERATING_MODE;
  const ready = query.isSuccess;
  return {
    ...query,
    operatingMode,
    isDco: isDcoOperatingMode(operatingMode),
    canManageOwnerVehicles: ready && canManageOwnerVehicles(operatingMode),
    canAddDcoShippers: ready && canAddDcoShippers(operatingMode),
    canManageDcoSelfBook: ready && canManageDcoSelfBook(operatingMode),
    canTagOfflineParty: ready && canTagOfflineParty(operatingMode),
    marketplaceAllowed: ready && operatingMode.marketplaceAllowed,
    invalidate,
  };
}
