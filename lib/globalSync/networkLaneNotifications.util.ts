import type { NetworkNotificationRow } from "@/features/network/services/networkNotifications.service";

/** One inbox card for a pool quote, request, or award on a lane. */
export type NetworkLaneGroup = {
  lead: NetworkNotificationRow;
  memberIds: string[];
  indentIds: string[];
  loadCount: number;
  /** Distinct bidders who quoted this route. */
  bidCount: number;
  /** Awarded and still needing a vehicle or driver. */
  critical: boolean;
};

const POOL_EVENTS = new Set<NetworkNotificationRow["event_type"]>([
  "bid_received",
  "quote_requested",
  "counter_offered",
  "awarded",
]);

function routeKey(row: NetworkNotificationRow): string {
  return (row.subtitle ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function amountKey(row: NetworkNotificationRow): string {
  if (row.amount_meta == null || !Number.isFinite(Number(row.amount_meta))) return "";
  return String(Math.round(Number(row.amount_meta)));
}

/**
 * A pool bid is one rate for every load on the lane, so the same actor, route,
 * and amount is one card. An award is one allocation task for that lane.
 */
function poolGroupKey(row: NetworkNotificationRow): string | null {
  if (!POOL_EVENTS.has(row.event_type)) return null;
  const route = routeKey(row);
  if (!route) return null;
  const actor = row.actor_org_id ?? row.id;
  if (row.event_type === "awarded") return `awarded|${actor}|${route}`;
  return `${row.event_type}|${actor}|${route}|${amountKey(row)}`;
}

function bidsOnRoute(rows: readonly NetworkNotificationRow[]): Map<string, number> {
  const actors = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.event_type !== "bid_received") continue;
    const route = routeKey(row);
    if (!route) continue;
    const set = actors.get(route) ?? new Set<string>();
    set.add(row.actor_org_id ?? row.id);
    actors.set(route, set);
  }
  return new Map([...actors.entries()].map(([route, set]) => [route, set.size]));
}

export function collapsePoolNetworkNotifications(
  rows: readonly NetworkNotificationRow[],
): NetworkLaneGroup[] {
  const bidCounts = bidsOnRoute(rows);
  const groups = new Map<string, NetworkNotificationRow[]>();
  const singles: NetworkNotificationRow[] = [];

  for (const row of rows) {
    const key = poolGroupKey(row);
    if (!key) {
      singles.push(row);
      continue;
    }
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const toGroup = (members: NetworkNotificationRow[]): NetworkLaneGroup => {
    const ordered = [...members].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const lead = ordered[0];
    const indentIds = [
      ...new Set(ordered.map((row) => row.indent_id).filter((id): id is string => Boolean(id))),
    ];
    const route = routeKey(lead);
    return {
      lead,
      memberIds: ordered.map((row) => row.id),
      indentIds,
      loadCount: Math.max(1, indentIds.length),
      bidCount: lead.event_type === "bid_received" ? bidCounts.get(route) ?? 1 : 0,
      critical: lead.event_type === "awarded",
    };
  };

  return [...singles.map((row) => toGroup([row])), ...[...groups.values()].map(toGroup)];
}

export function networkLaneDetail(group: NetworkLaneGroup): { title: string; subtitle: string } {
  const lead = group.lead;
  const route = lead.subtitle?.trim() || "";
  if (group.critical) {
    const title =
      group.loadCount > 1
        ? `${group.loadCount} loads awarded on this lane`
        : lead.title;
    return { title, subtitle: "Waiting for allocation" };
  }
  if (group.loadCount > 1 && lead.event_type === "bid_received") {
    const bids =
      group.bidCount === 1 ? "1 bid on this lane" : `${group.bidCount} bids on this lane`;
    return {
      title: `Quoted on ${group.loadCount} loads`,
      subtitle: [route, bids].filter(Boolean).join(" · "),
    };
  }
  if (group.bidCount > 1 && lead.event_type === "bid_received") {
    return {
      title: lead.title,
      subtitle: [route, `${group.bidCount} bids on this lane`].filter(Boolean).join(" · "),
    };
  }
  if (group.loadCount > 1) {
    return {
      title: `${group.loadCount} loads on this lane`,
      subtitle: route,
    };
  }
  return { title: lead.title, subtitle: route };
}
