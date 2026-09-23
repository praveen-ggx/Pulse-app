/**
 * Network landing vs org-hub presentation.
 * Hub does not render Stories — skip posts.feed / get_network_feed there.
 */

const HUB_TAB_VALUES = new Set([
  "details",
  "team",
  "profile",
  "sales",
  "goals",
  "asset",
  "network",
  "connections",
  "grow",
  "chat",
]);

function firstParam(
  value: string | string[] | undefined | null,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

export function isNetworkOrgHubMode(input: {
  segments: readonly string[];
  hub?: string | string[] | undefined;
  hubTab?: string | string[] | undefined;
  tab?: string | string[] | undefined;
}): boolean {
  if (input.segments.includes("hub")) return true;
  const hub = firstParam(input.hub);
  if (hub === "1" || hub === "true") return true;
  const tab = firstParam(input.hubTab) ?? firstParam(input.tab);
  return tab != null && HUB_TAB_VALUES.has(tab);
}

/** Classic Stories only: after secondary defer, never in org hub. */
export function shouldLoadNetworkFeed(input: {
  secondaryNetworkReady: boolean;
  showDesktopHub: boolean;
}): boolean {
  return input.secondaryNetworkReady && !input.showDesktopHub;
}
