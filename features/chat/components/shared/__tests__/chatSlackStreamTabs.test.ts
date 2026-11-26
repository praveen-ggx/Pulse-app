import {
  getVisibleSlackStreamTabs,
  isTripStreamTab,
  normalizeChatStreamTab,
  SLACK_STREAM_TABS,
} from "@/features/chat/components/shared/chatSlackStreamTabs";

describe("chatSlackStreamTabs (Pulse Chat V2 Phase A)", () => {
  it("never exposes Integrated / indent as a visible tab", () => {
    const ids = getVisibleSlackStreamTabs(true).map((t) => t.id);
    expect(ids).not.toContain("indent");
    expect(ids).toEqual(["network", "trips", "team"]);
  });

  it("hides Team when the feature flag is off", () => {
    expect(getVisibleSlackStreamTabs(false).map((t) => t.id)).toEqual([
      "network",
      "trips",
    ]);
  });

  it("maps legacy Integrated deep links onto Trips", () => {
    expect(normalizeChatStreamTab("indent")).toBe("trips");
    expect(normalizeChatStreamTab("integrated")).toBe("trips");
    expect(normalizeChatStreamTab("dm")).toBe("network");
    expect(normalizeChatStreamTab("team", { teamEnabled: false })).toBe("trips");
    expect(normalizeChatStreamTab("team", { teamEnabled: true })).toBe("team");
  });

  it("treats only trips as the trip stream tab", () => {
    expect(isTripStreamTab("trips")).toBe(true);
    expect(isTripStreamTab("network")).toBe(false);
    expect(isTripStreamTab("team")).toBe(false);
    expect(isTripStreamTab("indent")).toBe(false);
  });

  it("keeps SLACK_STREAM_TABS aligned with the default visible set", () => {
    expect(SLACK_STREAM_TABS.map((t) => t.id)).toEqual(
      getVisibleSlackStreamTabs().map((t) => t.id),
    );
  });

  it("includes Team in the default visible set", () => {
    expect(getVisibleSlackStreamTabs().map((t) => t.id)).toEqual([
      "network",
      "trips",
      "team",
    ]);
    expect(getVisibleSlackStreamTabs(false).map((t) => t.id)).toEqual([
      "network",
      "trips",
    ]);
  });
});
