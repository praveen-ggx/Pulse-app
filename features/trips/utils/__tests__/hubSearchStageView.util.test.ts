import {
  hubSearchViewOwnsMatch,
  preferTripHubSearchHint,
  type HubSearchStageHint,
} from "@/features/trips/utils/hubSearchStageView.util";

const view = (
  partial: Partial<{
    tripFilter: "Active" | "History";
    activeMetricTab:
      | "all"
      | "indent"
      | "unassigned"
      | "assigned"
      | "loading"
      | "in_transit"
      | "unloading"
      | "delivered_docs_pending";
    indentStatusTag: "pending" | "bids" | "awarded" | "failed" | null;
  }> = {},
) => ({
  tripFilter: "Active" as const,
  activeMetricTab: "indent" as const,
  indentStatusTag: null as "pending" | "bids" | "awarded" | "failed" | null,
  ...partial,
});

describe("hubSearchViewOwnsMatch", () => {
  it("ignores weak hits", () => {
    const hint: HubSearchStageHint = {
      kind: "indent",
      stage: "pending",
      id: "i1",
      strong: false,
    };
    expect(hubSearchViewOwnsMatch(hint, view())).toBe(false);
  });

  it("Live Indents (no chip) owns pending and bids only", () => {
    const pending: HubSearchStageHint = {
      kind: "indent",
      stage: "pending",
      id: "i1",
      strong: true,
    };
    const awarded: HubSearchStageHint = {
      kind: "indent",
      stage: "awarded",
      id: "i2",
      strong: true,
    };
    expect(hubSearchViewOwnsMatch(pending, view({ indentStatusTag: null }))).toBe(
      true,
    );
    expect(hubSearchViewOwnsMatch(awarded, view({ indentStatusTag: null }))).toBe(
      false,
    );
  });

  it("selected indent chip owns only that stage", () => {
    const bids: HubSearchStageHint = {
      kind: "indent",
      stage: "bids",
      id: "i1",
      strong: true,
    };
    expect(
      hubSearchViewOwnsMatch(bids, view({ indentStatusTag: "bids" })),
    ).toBe(true);
    expect(
      hubSearchViewOwnsMatch(bids, view({ indentStatusTag: "pending" })),
    ).toBe(false);
  });

  it("open trip stage owns only matching Active rail tile", () => {
    const assigned: HubSearchStageHint = {
      kind: "trip",
      stage: "assigned",
      id: "t1",
      strong: true,
    };
    expect(
      hubSearchViewOwnsMatch(
        assigned,
        view({ activeMetricTab: "assigned", indentStatusTag: null }),
      ),
    ).toBe(true);
    expect(
      hubSearchViewOwnsMatch(
        assigned,
        view({ activeMetricTab: "unassigned", indentStatusTag: null }),
      ),
    ).toBe(false);
    expect(
      hubSearchViewOwnsMatch(
        assigned,
        view({ activeMetricTab: "all", indentStatusTag: null }),
      ),
    ).toBe(false);
  });

  it("completed trips are owned by Delivered rail and History", () => {
    const done: HubSearchStageHint = {
      kind: "trip",
      stage: "delivered_docs_pending",
      id: "t1",
      strong: true,
    };
    expect(
      hubSearchViewOwnsMatch(
        done,
        view({
          activeMetricTab: "delivered_docs_pending",
          indentStatusTag: null,
        }),
      ),
    ).toBe(true);
    expect(
      hubSearchViewOwnsMatch(
        done,
        view({
          tripFilter: "History",
          activeMetricTab: "unassigned",
          indentStatusTag: null,
        }),
      ),
    ).toBe(true);
    expect(
      hubSearchViewOwnsMatch(
        done,
        view({ activeMetricTab: "unassigned", indentStatusTag: null }),
      ),
    ).toBe(false);
  });
});

describe("preferTripHubSearchHint", () => {
  it("prefers strong trip over strong indent", () => {
    const trip: HubSearchStageHint = {
      kind: "trip",
      stage: "loading",
      id: "t1",
      strong: true,
    };
    const indent: HubSearchStageHint = {
      kind: "indent",
      stage: "pending",
      id: "i1",
      strong: true,
    };
    expect(preferTripHubSearchHint({ trip, indent })).toEqual(trip);
  });

  it("prefers strong indent over weak trip", () => {
    const trip: HubSearchStageHint = {
      kind: "trip",
      stage: "loading",
      id: "t1",
      strong: false,
    };
    const indent: HubSearchStageHint = {
      kind: "indent",
      stage: "pending",
      id: "i1",
      strong: true,
    };
    expect(preferTripHubSearchHint({ trip, indent })).toEqual(indent);
  });
});
