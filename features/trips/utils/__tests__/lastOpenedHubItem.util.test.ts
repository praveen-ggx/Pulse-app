import {
  getLastOpenedHubItem,
  getLastOpenedHubItemId,
  setLastOpenedHubItem,
} from "../lastOpenedHubItem.util";

describe("lastOpenedHubItem", () => {
  beforeEach(() => {
    setLastOpenedHubItem(null);
  });

  it("stores an id from the detail route without wiping a prior tab", () => {
    setLastOpenedHubItem({
      id: "trip-1",
      tripFilter: "Active",
      metricTab: "in_transit",
    });
    setLastOpenedHubItem("trip-1");
    expect(getLastOpenedHubItem()).toEqual({
      id: "trip-1",
      tripFilter: "Active",
      metricTab: "in_transit",
    });
  });

  it("replaces the id when opening a different ticket", () => {
    setLastOpenedHubItem({
      id: "trip-1",
      tripFilter: "Active",
      metricTab: "assigned",
    });
    setLastOpenedHubItem({
      id: "trip-2",
      tripFilter: "Active",
      metricTab: "loading",
    });
    expect(getLastOpenedHubItemId()).toBe("trip-2");
    expect(getLastOpenedHubItem()?.metricTab).toBe("loading");
  });

  it("clears memory and storage", () => {
    setLastOpenedHubItem("trip-1");
    setLastOpenedHubItem(null);
    expect(getLastOpenedHubItem()).toBeNull();
  });
});
