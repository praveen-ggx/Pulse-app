import { useMemo } from "react";
import {
  REGISTRY_ACCESS_NONE,
  entryAllowedByAccess,
  type RegistryNotificationAccess,
} from "@/lib/alertRegistry/registryNotificationAccess.util";
import { useRegistryFeed } from "@/lib/globalSync/useRegistryFeed";
import { useMemberAccess } from "@/lib/useMemberAccess";

/**
 * What this member may see in notifications and invites. One source for the
 * desktop drawer, the mobile top bar badge and the archive log.
 */
export function useRegistryNotificationAccess(): {
  access: RegistryNotificationAccess;
  loading: boolean;
  /** Bell: trip alerts or finance items. */
  canSeeNotifications: boolean;
  /** Invites inbox: only members who can connect with the network. */
  canSeeInvites: boolean;
} {
  const { can, isLoading } = useMemberAccess();
  return useMemo(() => {
    if (isLoading) {
      return {
        access: REGISTRY_ACCESS_NONE,
        loading: true,
        canSeeNotifications: false,
        canSeeInvites: false,
      };
    }
    const tripFinance = can("tripops.trips.finance") || can("finance.view");
    const driverLedger = can("finance.ledger.driver") || can("finance.subtab.drivers");
    const access: RegistryNotificationAccess = {
      trips: can("tripops.trips.view"),
      tripDetail: can("tripops.trips.detail"),
      tripAssign: can("tripops.trips.assign"),
      tripFinance,
      indents: can("tripops.indents.view"),
      indentBid: can("tripops.indents.bid"),
      indentAward: can("tripops.indents.award"),
      findLoads: can("tripops.pulse_loads"),
      received: can("finance.ledger.customers") || can("finance.subtab.customers") || tripFinance,
      paid:
        can("finance.ledger.suppliers") ||
        can("finance.subtab.suppliers") ||
        driverLedger ||
        tripFinance,
      driverPay: driverLedger || tripFinance,
    };
    return {
      access,
      loading: false,
      canSeeNotifications: can("tripops.trips.view") || can("finance.view"),
      canSeeInvites: can("sales.network.connect"),
    };
  }, [can, isLoading]);
}

/** Active notifications this member is allowed to see; drives the bell badge. */
export function useAccessibleNotificationCount(orgId: string | null): number {
  const { access } = useRegistryNotificationAccess();
  const { activeFeed } = useRegistryFeed(orgId);
  return useMemo(
    () => activeFeed.filter((entry) => entryAllowedByAccess(entry, access)).length,
    [activeFeed, access],
  );
}
