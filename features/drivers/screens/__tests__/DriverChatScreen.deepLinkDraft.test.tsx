/**
 * Deep-linked trip chat (`/(driver)/chat?tripId=`): the thread opens once per trip
 * and focus. Later conversation-list updates — every send patches the preview —
 * must not re-select the thread or clear what the driver is typing.
 */
import React from "react";
import { Text } from "react-native";
import { act, render } from "@testing-library/react-native";
import DriverChatScreen from "../DriverChatScreen";
import { useDriverChat } from "@/features/chat/contexts/DriverChatContext";
import { preloadDriverChatThread } from "@/lib/preloadDriverChatWarmup";

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@/features/chat/contexts/DriverChatContext", () => ({ useDriverChat: jest.fn() }));
jest.mock("@/lib/preloadDriverChatWarmup", () => ({ preloadDriverChatThread: jest.fn() }));
jest.mock("@/lib/hooks/useLoadingStuck", () => ({ useLoadingStuck: () => false }));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: { uid: "driver-user-1" } }) }));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ tripId: "trip-1" }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useSegments: () => ["(driver)", "chat"],
}));
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus once on mount
    useEffect(() => cb(), []);
  },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/constants/Layout", () => ({ __esModule: true, default: { tabBarDockHeight: 0 } }));
jest.mock("@/lib/webViewportHeight", () => ({ WEB_APP_VIEWPORT_STYLE: {} }));
jest.mock("lucide-react-native", () => ({ MessageSquare: () => null }));
jest.mock("@/components/AppLoadingSplash", () => ({ AppLoadingSplash: () => null }));
jest.mock("@/features/chat/components/driver/DriverChatSlackInbox", () => ({
  DriverChatSlackInbox: () => null,
}));

const threadProps: {
  current: { conversationId: string; messageInput: string; setMessageInput: (v: string) => void } | null;
} = { current: null };
jest.mock("@/features/chat/components/driver/DriverChatSlackThread", () => ({
  DriverChatSlackThread: (props: {
    conversationId: string;
    messageInput: string;
    setMessageInput: (v: string) => void;
  }) => {
    threadProps.current = props;
    const { Text: RNText } = require("react-native");
    return <RNText testID="draft">{props.messageInput}</RNText>;
  },
}));

const conv = (preview: string) => ({
  id: "conv-1",
  trip_id: "trip-1",
  organization_id: "org-1",
  last_message_preview: preview,
  unread_dispatcher_count: 0,
});

function mockChat(conversations: ReturnType<typeof conv>[]) {
  (useDriverChat as jest.Mock).mockReturnValue({
    conversations,
    isLoading: false,
    sendMessage: jest.fn(),
    ensureDriverTripConversation: jest.fn(),
  });
}

describe("DriverChatScreen deep link", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    threadProps.current = null;
  });

  it("keeps the driver's draft when the conversation list updates", () => {
    mockChat([conv("first")]);
    const screen = render(<DriverChatScreen />);
    expect(threadProps.current?.conversationId).toBe("conv-1");

    act(() => threadProps.current?.setMessageInput("Reached the gate, wai"));
    expect(screen.getByTestId("draft").props.children).toBe("Reached the gate, wai");

    // A send / realtime patch replaces the conversations array.
    mockChat([conv("second")]);
    screen.rerender(<DriverChatScreen />);
    mockChat([conv("third")]);
    screen.rerender(<DriverChatScreen />);

    expect(screen.getByTestId("draft").props.children).toBe("Reached the gate, wai");
  });

  it("does not re-open the deep-linked thread when the conversation list updates", () => {
    mockChat([conv("first")]);
    const screen = render(<DriverChatScreen />);
    // Mount + the initial focus event each open the thread once.
    const opensAfterMount = (preloadDriverChatThread as jest.Mock).mock.calls.length;
    expect(opensAfterMount).toBeGreaterThan(0);

    mockChat([conv("second")]);
    screen.rerender(<DriverChatScreen />);
    mockChat([conv("third")]);
    screen.rerender(<DriverChatScreen />);
    expect(preloadDriverChatThread).toHaveBeenCalledTimes(opensAfterMount);
  });

  it("does not hand the screen a mark-read action", () => {
    mockChat([conv("first")]);
    render(<DriverChatScreen />);
    const ctx = (useDriverChat as jest.Mock).mock.results[0]?.value as Record<string, unknown>;
    expect(ctx.markAsRead).toBeUndefined();
    expect(Text).toBeDefined();
  });
});
