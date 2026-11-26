import type { RegistryFeedEntry } from "@/lib/globalSync/registryFeed.util";
import type { RegistryFilterTab } from "@/lib/globalSync/registryFeed.util";
import type {
  NetworkNotificationEventType,
  NetworkNotificationRow,
} from "@/features/network/services/networkNotifications.service";
import { laneBidInviteChannel } from "@/lib/alertRegistry/networkNotificationParty.util";
import { ROUTES } from "@/lib/routes";

/**
 * Notification lanes use existing member surfaces. No new surface.
 * Owners and admins bypass via `useMemberAccess`.
 */
export type RegistryNotificationAccess = {
  trips: boolean;
  tripDetail: boolean;
  tripAssign: boolean;
  tripFinance: boolean;
  indents: boolean;
  indentBid: boolean;
  indentAward: boolean;
  /** Find Loads (My Bids → Rate requests). */
  findLoads: boolean;
  /** Client receipts (finance customers ledger or trip finance). */
  received: boolean;
  /** Payables the org initiates (suppliers, drivers, or trip finance). */
  paid: boolean;
  driverPay: boolean;
};

export const REGISTRY_ACCESS_NONE: RegistryNotificationAccess = {
  trips: false,
  tripDetail: false,
  tripAssign: false,
  tripFinance: false,
  indents: false,
  indentBid: false,
  indentAward: false,
  findLoads: false,
  received: false,
  paid: false,
  driverPay: false,
};

export function entryAllowedByAccess(
  entry: RegistryFeedEntry,
  access: RegistryNotificationAccess,
): boolean {
  if (entry.kind === "network") {
    // A driver leaving the fleet is a Driver-tab signal, not a load event.
    if (
      entry.network?.event_type === "driver_disconnected" ||
      entry.network?.event_type === "expense_reminder"
    ) {
      return access.trips || access.driverPay;
    }
    return access.indents;
  }
  if (entry.kind === "salary") return access.driverPay;
  const category = entry.ops?.category;
  if (category === "payment_received") return access.received;
  if (category === "payment_paid") return access.paid;
  if (category === "unassigned_trip" || category === "salary") {
    return access.trips || access.driverPay;
  }
  return access.trips;
}

export function registryTabVisible(
  tab: RegistryFilterTab,
  access: RegistryNotificationAccess,
): boolean {
  if (tab === "all" || tab === "archive") return true;
  if (tab === "indent") return access.indents;
  if (tab === "payment") return access.paid;
  if (tab === "received") return access.received;
  if (tab === "trip") return access.trips;
  if (tab === "driver") return access.trips || access.driverPay;
  return true;
}

export function indentPrimaryAction(
  eventType: NetworkNotificationEventType,
  access: RegistryNotificationAccess,
): { label: string; enabled: boolean } {
  const view = { label: "View indent", enabled: access.indents };
  if (eventType === "indent_created" || eventType === "quote_requested") {
    if (access.indentBid) {
      return {
        label: eventType === "indent_created" ? "Place bid" : "Send quote",
        enabled: access.indents,
      };
    }
    return view;
  }
  if (eventType === "bid_received" || eventType === "counter_offered") {
    if (access.indentAward) {
      return {
        label: eventType === "bid_received" ? "Review bid" : "Review offer",
        enabled: access.indents,
      };
    }
    return view;
  }
  if (eventType === "awarded") return { label: "Allocate", enabled: access.indents };
  return view;
}

export { laneBidInviteChannel };

/**
 * Primary action of a network notification card. Rate requests are answered in
 * My Bids → Rate requests: a Marketplace invite has no visible indent, and the
 * indent page's quote form would bypass the invite.
 */
export function networkNotificationAction(
  item: Pick<NetworkNotificationRow, "event_type" | "indent_id" | "payload_json">,
  access: RegistryNotificationAccess,
): { label: string; enabled: boolean; href: string | null } {
  if (laneBidInviteChannel(item)) {
    return {
      label: "Open rate requests",
      enabled: access.indents && access.indentBid && access.findLoads,
      href: ROUTES.FIND_LOADS_MY_BIDS,
    };
  }
  return {
    ...indentPrimaryAction(item.event_type, access),
    href: item.indent_id ? ROUTES.indentDetail(item.indent_id) : null,
  };
}

export function canOpenOpsAlert(
  category: string,
  access: RegistryNotificationAccess,
): boolean {
  if (category === "payment_received") return access.received && (access.tripDetail || access.tripFinance);
  if (category === "payment_paid") return access.paid && (access.tripDetail || access.tripFinance);
  if (category === "unassigned_trip") return access.tripAssign || access.tripDetail;
  return access.tripDetail;
}
