import type { GlobalOperationAlert } from '@/lib/globalSync/priorityEngine.util';
import type { SalaryRequestWithDriverRow } from '@/features/drivers/services/salaryRequests.service';
import type { NetworkNotificationRow } from '@/features/network/services/networkNotifications.service';
import {
  collapsePoolNetworkNotifications,
  type NetworkLaneGroup,
} from '@/lib/globalSync/networkLaneNotifications.util';

export type RegistryFeedKind = 'ops' | 'salary' | 'network';

/** Metronic-style notification filter tabs. */
export type RegistryFilterTab =
  | 'all'
  | 'driver'
  | 'trip'
  | 'indent'
  | 'payment'
  | 'received'
  | 'archive';

export type RegistryFeedEntry = {
  id: string;
  kind: RegistryFeedKind;
  sortKey: number;
  createdAt: string;
  ops?: GlobalOperationAlert;
  salary?: SalaryRequestWithDriverRow;
  network?: NetworkNotificationRow;
  /** Pool quote / award collapsed from several indent rows on one lane. */
  networkLane?: NetworkLaneGroup;
};

function parseSortMs(iso: string | null | undefined, fallbackWeight = 0): number {
  const ts = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isNaN(ts)) return ts;
  return Date.now() - fallbackWeight;
}

export function buildRegistryFeed(input: {
  tab: 'active' | 'history';
  opsAlerts: GlobalOperationAlert[];
  activeSalary: SalaryRequestWithDriverRow[];
  historySalary: SalaryRequestWithDriverRow[];
  /** Cross-org indent/bid/award inbox. Optional: absent until the table ships. */
  activeNetwork?: NetworkNotificationRow[];
  historyNetwork?: NetworkNotificationRow[];
}): RegistryFeedEntry[] {
  const entries: RegistryFeedEntry[] = [];
  const pushNetwork = (rows: NetworkNotificationRow[] | undefined, weight: number) => {
    for (const lane of collapsePoolNetworkNotifications(rows ?? [])) {
      const network = lane.lead;
      const criticalBoost = lane.critical ? 90 * 24 * 60 * 60 * 1000 : 0;
      entries.push({
        id: `network:${network.id}`,
        kind: 'network',
        sortKey: parseSortMs(network.created_at, weight) + criticalBoost,
        createdAt: network.created_at,
        network,
        networkLane: lane,
      });
    }
  };

  if (input.tab === 'active') {
    for (const ops of input.opsAlerts) {
      entries.push({
        id: `ops:${ops.id}`,
        kind: 'ops',
        sortKey: parseSortMs(ops.created_at) + ops.priority_weight * 1_000,
        createdAt: ops.created_at,
        ops,
      });
    }
    for (const salary of input.activeSalary) {
      entries.push({
        id: `salary:${salary.id}`,
        kind: 'salary',
        sortKey: parseSortMs(salary.created_at, 50_000),
        createdAt: salary.created_at,
        salary,
      });
    }
    pushNetwork(input.activeNetwork, 30_000);
  } else {
    for (const salary of input.historySalary) {
      entries.push({
        id: `salary:${salary.id}`,
        kind: 'salary',
        sortKey: parseSortMs(salary.created_at),
        createdAt: salary.created_at,
        salary,
      });
    }
    pushNetwork(input.historyNetwork, 0);
  }

  return entries.sort((a, b) => b.sortKey - a.sortKey);
}

export function registryFeedLifecycleTab(filter: RegistryFilterTab): 'active' | 'history' {
  return filter === 'archive' ? 'history' : 'active';
}

export function entryMatchesRegistryFilter(
  entry: RegistryFeedEntry,
  filter: RegistryFilterTab,
): boolean {
  if (filter === 'all' || filter === 'archive') return true;
  if (filter === 'driver') {
    if (entry.kind === 'salary') return true;
    if (entry.kind === 'ops' && entry.ops?.category === 'unassigned_trip') return true;
    if (entry.kind === 'ops' && entry.ops?.category === 'salary') return true;
    return false;
  }
  if (filter === 'trip') {
    if (entry.kind === 'network') return false;
    if (entry.kind !== 'ops' || !entry.ops) return false;
    const cat = entry.ops.category;
    if (cat === 'unassigned_trip') return false;
    return cat !== 'payment_received' && cat !== 'payment_paid';
  }
  if (filter === 'indent') return entry.kind === 'network';
  if (filter === 'payment') {
    return entry.kind === 'ops' && entry.ops?.category === 'payment_paid';
  }
  if (filter === 'received') {
    return entry.kind === 'ops' && entry.ops?.category === 'payment_received';
  }
  return true;
}

export function filterRegistryFeed(
  entries: RegistryFeedEntry[],
  filter: RegistryFilterTab,
): RegistryFeedEntry[] {
  if (filter === 'all' || filter === 'archive') return entries;
  return entries.filter((entry) => entryMatchesRegistryFilter(entry, filter));
}
