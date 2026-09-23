import {
  isNetworkOrgHubMode,
  shouldLoadNetworkFeed,
} from "@/features/network/utils/networkModeLoading.util";

describe("isNetworkOrgHubMode", () => {
  it("detects the /network/hub stack segment", () => {
    expect(
      isNetworkOrgHubMode({
        segments: ["(tabs)", "network", "hub"],
      }),
    ).toBe(true);
  });

  it("detects legacy ?hub=1", () => {
    expect(
      isNetworkOrgHubMode({
        segments: ["(tabs)", "network"],
        hub: "1",
      }),
    ).toBe(true);
  });

  it("detects hub tab query params", () => {
    expect(
      isNetworkOrgHubMode({
        segments: ["(tabs)", "network"],
        tab: "sales",
      }),
    ).toBe(true);
  });

  it("is false for classic Network landing", () => {
    expect(
      isNetworkOrgHubMode({
        segments: ["(tabs)", "network"],
      }),
    ).toBe(false);
  });
});

describe("shouldLoadNetworkFeed", () => {
  it("loads feed only after secondary ready on classic Network", () => {
    expect(
      shouldLoadNetworkFeed({
        secondaryNetworkReady: false,
        showDesktopHub: false,
      }),
    ).toBe(false);
    expect(
      shouldLoadNetworkFeed({
        secondaryNetworkReady: true,
        showDesktopHub: false,
      }),
    ).toBe(true);
  });

  it("never loads feed in org hub, even after secondary ready", () => {
    expect(
      shouldLoadNetworkFeed({
        secondaryNetworkReady: true,
        showDesktopHub: true,
      }),
    ).toBe(false);
  });
});
