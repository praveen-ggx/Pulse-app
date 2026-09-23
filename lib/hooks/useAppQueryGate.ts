import {
  APP_QUERY_GATE_QUIET_MS,
  getMsSinceBootstrapReady,
} from "@/lib/hooks/appQueryGateState";
import {
  APP_QUERY_GATE_DEFAULT_MAX_WAIT_MS,
  APP_QUERY_GATE_URGENT_MAX_WAIT_MS,
  isAppQueryGateOpen,
} from "@/lib/hooks/appQueryGate.util";
import { useBootstrapReady } from "@/lib/hooks/useQueryBootDefer";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { useEffect, useState } from "react";

export {
  APP_QUERY_GATE_QUIET_MS,
  getMsSinceBootstrapReady,
  isWithinAppQueryBootQuietPeriod,
  markAppQueryGateBootstrapReady,
} from "@/lib/hooks/appQueryGateState";

type Options = {
  /** Skip quiet gate (user opened Loads hub, etc.). */
  urgent?: boolean;
  /** Indent review — fetch this screen's bids without waiting on bootstrap. */
  immediate?: boolean;
};

/**
 * Returns true when list queries may hit the network.
 * Healthy bootstrap still gets a short quiet window. Failed / hung bootstrap
 * must not leave Loads (or other hubs) on an infinite spinner.
 */
export function useAppQueryGate(orgId: string | null, options?: Options): boolean {
  const bootstrapReady = useBootstrapReady(orgId);
  const bootstrapStatus = useGlobalSyncStore((s) => s.bootstrapStatus);
  const urgent = options?.urgent === true;
  const immediate = options?.immediate === true;
  const [quietElapsed, setQuietElapsed] = useState(false);
  const [waitExpired, setWaitExpired] = useState(false);

  useEffect(() => {
    if (!orgId) {
      setWaitExpired(false);
      return;
    }
    if (immediate || bootstrapReady || bootstrapStatus === "error") {
      setWaitExpired(true);
      return;
    }
    const maxWait = urgent
      ? APP_QUERY_GATE_URGENT_MAX_WAIT_MS
      : APP_QUERY_GATE_DEFAULT_MAX_WAIT_MS;
    const t = setTimeout(() => setWaitExpired(true), maxWait);
    return () => clearTimeout(t);
  }, [orgId, bootstrapReady, bootstrapStatus, urgent, immediate]);

  useEffect(() => {
    if (!orgId || !bootstrapReady || urgent) {
      setQuietElapsed(false);
      return;
    }
    const remaining = Math.max(0, APP_QUERY_GATE_QUIET_MS - getMsSinceBootstrapReady());
    if (remaining === 0) {
      setQuietElapsed(true);
      return;
    }
    const t = setTimeout(() => setQuietElapsed(true), remaining);
    return () => clearTimeout(t);
  }, [orgId, bootstrapReady, urgent]);

  return isAppQueryGateOpen({
    orgId,
    bootstrapReady,
    bootstrapStatus,
    urgent,
    quietElapsed,
    waitExpired,
    immediate,
  });
}
