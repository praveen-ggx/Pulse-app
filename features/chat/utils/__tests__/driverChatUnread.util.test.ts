import { driverConversationUnreadCount } from "@/features/chat/utils/driverChatUnread.util";

describe("driverConversationUnreadCount", () => {
  it("never shows the dispatcher's unread counter as the driver's", () => {
    expect(driverConversationUnreadCount({ unread_dispatcher_count: 7 })).toBe(0);
    expect(driverConversationUnreadCount({ unread_dispatcher_count: 0 })).toBe(0);
  });
});
