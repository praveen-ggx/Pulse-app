import {
  buildRegistryFeed,
  entryMatchesRegistryFilter,
  type RegistryFeedEntry,
} from "@/lib/globalSync/registryFeed.util";
import type { NetworkNotificationRow } from "@/features/network/services/networkNotifications.service";

function netRow(
  over: Partial<NetworkNotificationRow> = {},
): NetworkNotificationRow {
  return {
    id: "n1",
    organization_id: "org-supplier",
    actor_org_id: "org-owner",
    event_type: "indent_created",
    status: "open",
    title: "IND0001 is open for bids",
    subtitle: "CHENNAI → DELHI",
    amount_meta: 30000,
    indent_id: "ind-1",
    quote_id: null,
    bid_id: null,
    payload_json: {},
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: null,
    read_at: null,
    handled_at: null,
    ...over,
  };
}

const EMPTY = {
  opsAlerts: [],
  activeSalary: [],
  historySalary: [],
  activeShared: [],
  historyShared: [],
};

describe("registry feed — network lane", () => {
  it("adds open network rows to the active feed", () => {
    const feed = buildRegistryFeed({
      ...EMPTY,
      tab: "active",
      activeNetwork: [netRow()],
    });
    expect(feed).toHaveLength(1);
    expect(feed[0].kind).toBe("network");
    expect(feed[0].id).toBe("network:n1");
    expect(feed[0].network?.event_type).toBe("indent_created");
  });

  it("puts read/handled rows in the history feed only", () => {
    const read = netRow({ id: "n2", status: "read" });
    expect(
      buildRegistryFeed({ ...EMPTY, tab: "history", historyNetwork: [read] }),
    ).toHaveLength(1);
    // Active tab must not surface history rows.
    expect(
      buildRegistryFeed({ ...EMPTY, tab: "active", historyNetwork: [read] }),
    ).toHaveLength(0);
  });

  it("stays backward compatible when the network lane is absent", () => {
    // Existing callers pass no activeNetwork/historyNetwork at all.
    expect(buildRegistryFeed({ ...EMPTY, tab: "active" })).toEqual([]);
    expect(buildRegistryFeed({ ...EMPTY, tab: "history" })).toEqual([]);
  });

  it("sorts newest network row first", () => {
    const feed = buildRegistryFeed({
      ...EMPTY,
      tab: "active",
      activeNetwork: [
        netRow({ id: "old", created_at: "2026-07-01T10:00:00.000Z" }),
        netRow({ id: "new", created_at: "2026-08-01T10:00:00.000Z" }),
      ],
    });
    expect(feed.map((e) => e.id)).toEqual(["network:new", "network:old"]);
  });

  it("shows network rows under All and Indent, not Trip, Driver, or Payment", () => {
    const entry = buildRegistryFeed({
      ...EMPTY,
      tab: "active",
      activeNetwork: [netRow()],
    })[0] as RegistryFeedEntry;

    expect(entryMatchesRegistryFilter(entry, "all")).toBe(true);
    expect(entryMatchesRegistryFilter(entry, "indent")).toBe(true);
    expect(entryMatchesRegistryFilter(entry, "trip")).toBe(false);
    expect(entryMatchesRegistryFilter(entry, "driver")).toBe(false);
    expect(entryMatchesRegistryFilter(entry, "payment")).toBe(false);
    expect(entryMatchesRegistryFilter(entry, "received")).toBe(false);
  });
});
