import { act, renderHook } from "@testing-library/react-native";

import type { TripConversation } from "@/features/chat/types/chat.types";
import { useDispatcherIncomingUnreadAlert } from "../useDispatcherIncomingUnreadAlert";

function conv(
  partial: Partial<TripConversation> & { id: string },
): TripConversation {
  return {
    id: partial.id,
    organization_id: "org-1",
    trip_id: partial.trip_id ?? "trip-1",
    party_type: "driver",
    party_name: "Driver",
    unread_dispatcher_count: partial.unread_dispatcher_count ?? 0,
    last_message_at: partial.last_message_at ?? "2026-11-26T00:00:00Z",
    last_message_preview: partial.last_message_preview ?? "Hello",
    pickup_area: partial.pickup_area ?? "Delhi",
    drop_location: partial.drop_location ?? "Hyderabad",
    messages: [],
    ...partial,
  } as TripConversation;
}

describe("useDispatcherIncomingUnreadAlert", () => {
  it("baselines first snapshot then alerts on unread increase", () => {
    const initial = [
      conv({ id: "c1", unread_dispatcher_count: 0 }),
    ];
    const { result, rerender } = renderHook(
      (props: {
        conversations: TripConversation[];
        selectedConversationId: string | null;
      }) =>
        useDispatcherIncomingUnreadAlert({
          conversations: props.conversations,
          selectedConversationId: props.selectedConversationId,
          enabled: true,
        }),
      {
        initialProps: {
          conversations: initial,
          selectedConversationId: null as string | null,
        },
      },
    );

    expect(result.current.alert).toBeNull();

    act(() => {
      rerender({
        conversations: [
          conv({
            id: "c1",
            unread_dispatcher_count: 2,
            last_message_preview: "Where are you?",
            last_message_at: "2026-11-26T00:01:00Z",
          }),
        ],
        selectedConversationId: null,
      });
    });

    expect(result.current.alert?.conversationId).toBe("c1");
    expect(result.current.alert?.unread).toBe(2);
    expect(result.current.alert?.preview).toBe("Where are you?");
  });

  it("does not alert for the open conversation", () => {
    const { result, rerender } = renderHook(
      (props: {
        conversations: TripConversation[];
        selectedConversationId: string | null;
      }) =>
        useDispatcherIncomingUnreadAlert({
          conversations: props.conversations,
          selectedConversationId: props.selectedConversationId,
          enabled: true,
        }),
      {
        initialProps: {
          conversations: [conv({ id: "c1", unread_dispatcher_count: 0 })],
          selectedConversationId: "c1" as string | null,
        },
      },
    );

    act(() => {
      rerender({
        conversations: [conv({ id: "c1", unread_dispatcher_count: 3 })],
        selectedConversationId: "c1",
      });
    });

    expect(result.current.alert).toBeNull();
  });
});
