import {
  channelDisplayTitle,
  formatChannelHandle,
  normalizeTeamChannelKey,
} from "../teamChannelSlug.util";

describe("teamChannelSlug.util", () => {
  it("normalizes Slack-like channel names", () => {
    expect(normalizeTeamChannelKey("Plan Tracker")).toBe("plan-tracker");
    expect(normalizeTeamChannelKey("#Ops!!")).toBe("ops");
    expect(normalizeTeamChannelKey("  finance_q1  ")).toBe("finance_q1");
    expect(normalizeTeamChannelKey("@@@")).toBe("");
  });

  it("formats handles and titles", () => {
    expect(formatChannelHandle("ops")).toBe("#ops");
    expect(formatChannelHandle("#ops")).toBe("#ops");
    expect(channelDisplayTitle(null, "plan-tracker")).toBe("Plan Tracker");
    expect(channelDisplayTitle("Ops desk", "ops")).toBe("Ops desk");
  });
});
