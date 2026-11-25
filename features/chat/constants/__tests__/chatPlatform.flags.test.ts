import {
  CHAT_TEAM_ROOMS_SIDEBAR_ENABLED,
  PULSE_CHAT_TEAM_ENABLED,
} from "@/features/chat/constants/chatPlatform.flags";

describe("chatPlatform.flags — Phase B gate", () => {
  it("shows workspace Team by default (opt-out with EXPO_PUBLIC_PULSE_CHAT_TEAM_ENABLED=false)", () => {
    // Backend Phase B RLS remains the security boundary; this only gates UI.
    expect(PULSE_CHAT_TEAM_ENABLED).toBe(true);
  });

  it("keeps legacy trip-room sidebar inbox disabled", () => {
    expect(CHAT_TEAM_ROOMS_SIDEBAR_ENABLED).toBe(false);
  });
});
