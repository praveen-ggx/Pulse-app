import type { NetworkNotificationRow } from "@/features/network/services/networkNotifications.service";
import {
  collapsePoolNetworkNotifications,
  networkLaneDetail,
} from "@/lib/globalSync/networkLaneNotifications.util";
import { buildRegistryFeed } from "@/lib/globalSync/registryFeed.util";

function row(over: Partial<NetworkNotificationRow> = {}): NetworkNotificationRow {
  return {
    id: "n1",
    organization_id: "owner",
    actor_org_id: "bidder",
    event_type: "bid_received",
    status: "open",
    title: "PETTHU SELVAM R quoted on SAT812GOGIND003470",
    subtitle: "Periyapalayam, Tamil Nadu → Poonamallee, Tamil Nadu",
    amount_meta: 5250,
    indent_id: "ind-1",
    quote_id: "q1",
    bid_id: null,
    payload_json: {},
    created_at: "2026-11-03T10:00:00.000Z",
    updated_at: null,
    read_at: null,
    handled_at: null,
    ...over,
  };
}

describe("pool network notifications", () => {
  it("collapses the same quote fanned across a lane into one card", () => {
    const groups = collapsePoolNetworkNotifications([
      row(),
      row({
        id: "n2",
        indent_id: "ind-2",
        quote_id: "q2",
        title: "PETTHU SELVAM R quoted on SAT812GOGIND003472",
        created_at: "2026-11-03T10:05:00.000Z",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].loadCount).toBe(2);
    expect(groups[0].bidCount).toBe(1);
    expect(groups[0].lead.id).toBe("n2");
    expect(networkLaneDetail(groups[0])).toEqual({
      title: "Quoted on 2 loads",
      subtitle:
        "Periyapalayam, Tamil Nadu → Poonamallee, Tamil Nadu · 1 bid on this lane",
    });
  });

  it("keeps a second bidder as their own card and counts both bids on the lane", () => {
    const groups = collapsePoolNetworkNotifications([
      row(),
      row({
        id: "other",
        actor_org_id: "other-bidder",
        title: "OTHER quoted on SAT1",
        amount_meta: 6000,
      }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.bidCount === 2)).toBe(true);
  });

  it("ranks an awarded lane ahead of quotes and asks for allocation", () => {
    const award = row({
      id: "award",
      event_type: "awarded",
      title: "SAT1 awarded to you",
      created_at: "2026-11-01T10:00:00.000Z",
    });
    const quote = row({ id: "quote", created_at: "2026-11-04T10:00:00.000Z" });
    const feed = buildRegistryFeed({
      tab: "active",
      opsAlerts: [],
      activeSalary: [],
      historySalary: [],
      activeNetwork: [quote, award],
    });
    expect(feed.map((entry) => entry.network?.id)).toEqual(["award", "quote"]);
    expect(feed[0].networkLane?.critical).toBe(true);
    expect(networkLaneDetail(feed[0].networkLane!).subtitle).toBe("Waiting for allocation");
  });
});
