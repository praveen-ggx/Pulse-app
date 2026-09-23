import { useMemo } from "react";

import { useIndentsQuery } from "@/lib/queries/useIndentsQuery";

const TERMINAL = new Set(["completed", "cancelled"]);

/**
 * Loads tab badge count for the mobile footer only.
 * Own-indent list only — market/quotes RPCs belong on the Load page, not the dock.
 */
export function useTabBarActiveLoadCount(
  orgId: string | null,
  enabled: boolean,
): number {
  const org = enabled && orgId ? orgId : null;
  const dockIndentsQ = useIndentsQuery(org);

  return useMemo(() => {
    if (!org) return 0;
    let count = 0;
    for (const indent of dockIndentsQ.data ?? []) {
      const status = String(indent.status ?? "").toLowerCase();
      if (TERMINAL.has(status)) continue;
      if (indent.organization_id === org) count += 1;
    }
    return count;
  }, [org, dockIndentsQ.data]);
}
