/**
 * The driver must never call `mark_conversation_read`: it is the dispatcher's RPC
 * (zeroes unread_dispatcher_count, marks the driver's own messages read). And the
 * driver's unread must not be the dispatcher's counter.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import {
  DriverChatProvider,
  useDriverChat,
} from "@/features/chat/contexts/DriverChatContext";
import * as chatService from "@/features/chat/services/chat.service";

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { uid: "driver-user-1" } }),
}));
jest.mock("@/lib/queries/useDriverHomeDriversQuery", () => ({
  useDriverHomeDriversQuery: () => ({
    activeLinkedDrivers: [{ id: "driver-1" }],
    driverIdsKey: "driver-1",
  }),
}));
jest.mock("@/features/chat/hooks/useDriverChatConversationsQuery", () => ({
  driverChatConversationsQueryKey: (key: string) => ["driver-chat", key],
  useDriverChatConversationsQuery: () => ({
    conversations: [
      { id: "conv-1", trip_id: "trip-1", organization_id: "org-1", unread_dispatcher_count: 5 },
      { id: "conv-2", trip_id: "trip-2", organization_id: "org-1", unread_dispatcher_count: 2 },
    ],
    isLoading: false,
    refreshConversations: jest.fn(),
  }),
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: jest.fn(), getQueryData: jest.fn() }),
}));
jest.mock("@/features/trips/services/trips.service", () => ({}));
jest.mock("@/features/drivers/services/drivers.service", () => ({
  getLinkedDriversForCurrentUser: jest.fn(),
}));
jest.mock("@/features/operations/display", () => ({ getTripOperationalDisplay: jest.fn() }));
jest.mock("@/lib/tripChatInvalidate", () => ({ notifyTripChatMessagesChanged: jest.fn() }));
jest.mock("@/features/chat/services/chat.service", () => ({
  markConversationRead: jest.fn(() => Promise.resolve()),
  sendDriverChatMessage: jest.fn(),
  getOrCreateConversation: jest.fn(),
}));

type Ctx = ReturnType<typeof useDriverChat>;

function renderProvider() {
  const seen: { ctx: Ctx | null } = { ctx: null };
  function Probe() {
    seen.ctx = useDriverChat();
    return null;
  }
  const utils = render(
    <DriverChatProvider>
      <Probe />
    </DriverChatProvider>,
  );
  return { ...utils, seen };
}

describe("DriverChatContext read state", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("exposes no mark-read action to driver screens", () => {
    const { seen } = renderProvider();
    expect(seen.ctx).not.toBeNull();
    expect((seen.ctx as unknown as Record<string, unknown>).markAsRead).toBeUndefined();
  });

  it("never calls the dispatcher mark_conversation_read, even after timers and unmount", () => {
    const { unmount } = renderProvider();
    jest.advanceTimersByTime(60_000);
    unmount();
    jest.advanceTimersByTime(60_000);
    expect(chatService.markConversationRead).not.toHaveBeenCalled();
  });

  it("does not report the dispatcher's unread counter as the driver's unread", () => {
    const { seen } = renderProvider();
    expect(seen.ctx?.getTotalUnreadCount()).toBe(0);
  });
});
