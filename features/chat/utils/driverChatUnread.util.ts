import type { TripConversation } from "@/features/chat/types/chat.types";

/**
 * Unread count to show the driver for a trip conversation.
 *
 * trip_conversations only tracks `unread_dispatcher_count`, which the DB increments
 * for messages where sender_role NOT IN ('dispatcher','system') — the dispatcher's
 * unread, including the driver's own messages. There is no driver-side counter yet
 * (needs a column + RPC, deferred with the schema freeze), so the driver sees none
 * rather than a wrong number. Same reasoning as DriverHeader's badge-less icon.
 */
export function driverConversationUnreadCount(
  _conversation: Pick<TripConversation, "unread_dispatcher_count">,
): number {
  return 0;
}
