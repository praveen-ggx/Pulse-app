/**
 * Alert Registry bell — WhatsApp bootstrap & patch (no tab-scoped DB polls).
 *
 * Flow: `GlobalSyncProvider.bootstrap()` hydrates slices once → Realtime patches store
 * → UI actions patch local state first → DB RPC/table write → Realtime confirms.
 *
 * Open `network_notifications` (incl. driver_disconnected) also bump the bell so
 * fleet owners see when a driver leaves the fleet.
 */
import { useMemo } from 'react';
import { useGlobalSync } from '@/lib/globalSync/GlobalSyncContext';
import { useGlobalSyncStore } from '@/lib/globalSync/useGlobalSyncStore';
import type { SalaryRequestWithDriverRow } from '@/features/drivers/services/salaryRequests.service';
import { useNetworkNotificationsCountQuery } from '@/lib/queries/useNetworkNotificationsQuery';

export function selectRegistryBellCount(
  salaryRows: SalaryRequestWithDriverRow[],
  openNetworkCount = 0,
): number {
  const pendingSalary = salaryRows.filter((r) => r.status === 'pending').length;
  return pendingSalary + Math.max(0, openNetworkCount);
}

export function useAlertRegistryNotifications(orgId: string | null) {
  const { refresh } = useGlobalSync();
  const salaryRequestRows = useGlobalSyncStore((s) => s.salaryRequestRows);
  const bootstrapStatus = useGlobalSyncStore((s) => s.bootstrapStatus);
  const rejectSalaryRequest = useGlobalSyncStore((s) => s.rejectSalaryRequest);
  const networkOpenCountQ = useNetworkNotificationsCountQuery(orgId);
  const openNetworkCount = networkOpenCountQ.data ?? 0;

  const activeSalaryRequests = useMemo(
    () => salaryRequestRows.filter((r) => r.status === 'pending'),
    [salaryRequestRows],
  );
  const historySalaryRequests = useMemo(
    () => salaryRequestRows.filter((r) => r.status !== 'pending'),
    [salaryRequestRows],
  );
  const notificationCount = useMemo(
    () => selectRegistryBellCount(salaryRequestRows, openNetworkCount),
    [salaryRequestRows, openNetworkCount],
  );

  return {
    bootstrapStatus,
    notificationCount,
    activeSalaryRequests,
    historySalaryRequests,
    refreshRegistry: () => {
      if (!orgId) return;
      void useGlobalSyncStore.getState().bootstrap(orgId, { force: true });
    },
    refresh,
    rejectSalaryRequest: (requestId: string) => {
      if (!orgId) return Promise.resolve({ error: new Error('no_org') });
      return rejectSalaryRequest(requestId, orgId);
    },
  };
}
