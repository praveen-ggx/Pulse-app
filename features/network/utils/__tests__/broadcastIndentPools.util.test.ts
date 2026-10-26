import { poolKey, poolKeyId } from "@/features/network/utils/pooledOpportunity.util";
import {
  broadcastPoolId,
  canDeployBroadcastLane,
  filterBroadcastLanesByStory,
  formatBroadcastLaneClientTitle,
  groupBroadcastIndentsByPool,
  laneHasActiveStory,
  pickBroadcastLanePrimaryClient,
} from "@/features/network/utils/broadcastIndentPools.util";

function indent(
  id: string,
  extra: {
    pickup?: string;
    drop?: string;
    vehicle?: string;
    created?: string;
    clientId?: string;
    clientName?: string;
  } = {},
) {
  return {
    id,
    pickup_area: extra.pickup ?? "Delhi",
    drop_location: extra.drop ?? "Bengaluru",
    vehicle_type: extra.vehicle ?? "32 FT XL",
    created_at: extra.created ?? "2026-10-25T12:00:00Z",
    client_id: extra.clientId ?? null,
    client_name: extra.clientName ?? null,
  };
}

describe("broadcastPoolId", () => {
  it("matches Indent Pool identity when the lane is complete", () => {
    expect(broadcastPoolId(indent("a"))).toBe(
      poolKeyId(
        poolKey({
          pickup: "Delhi",
          drop: "Bengaluru",
          vehicleType: "32 FT XL",
        }),
      ),
    );
  });

  it("does not invent a pool when vehicle is missing", () => {
    expect(
      broadcastPoolId(indent("solo", { vehicle: "" })),
    ).toBe("indent:solo");
  });
});

describe("groupBroadcastIndentsByPool", () => {
  it("collapses same-lane indents to one option", () => {
    const lanes = groupBroadcastIndentsByPool([
      indent("old", { created: "2026-10-24T08:00:00Z" }),
      indent("new", { created: "2026-10-25T12:00:00Z" }),
      indent("other", {
        drop: "Hyderabad",
        created: "2026-10-25T10:00:00Z",
      }),
    ]);
    expect(lanes).toHaveLength(2);
    expect(lanes[0]?.representative.id).toBe("new");
    expect(lanes[0]?.indentCount).toBe(2);
    expect(lanes[0]?.members.map((row) => row.id)).toEqual(["new", "old"]);
    expect(lanes[1]?.indentCount).toBe(1);
  });

  it("faces the client with more indents and counts extras", () => {
    const lanes = groupBroadcastIndentsByPool([
      indent("apollo-old", {
        created: "2026-10-24T08:00:00Z",
        clientId: "apollo",
        clientName: "Apollo",
      }),
      indent("apollo-new", {
        created: "2026-10-25T12:00:00Z",
        clientId: "apollo",
        clientName: "Apollo",
      }),
      indent("zeta-new", {
        created: "2026-10-25T14:00:00Z",
        clientId: "zeta",
        clientName: "Zeta",
      }),
    ]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.representative.id).toBe("apollo-new");
    expect(lanes[0]?.extraClientCount).toBe(1);
    expect(
      formatBroadcastLaneClientTitle(
        lanes[0]?.representative.client_name,
        lanes[0]?.extraClientCount ?? 0,
      ),
    ).toBe("Apollo +1 client");
  });

  it("keeps a different vehicle as its own lane", () => {
    const lanes = groupBroadcastIndentsByPool([
      indent("xl"),
      indent("box", { vehicle: "32 FT BOX" }),
    ]);
    expect(lanes).toHaveLength(2);
  });
});

describe("broadcast story filter", () => {
  it("treats a lane as active when any member story is live", () => {
    expect(
      laneHasActiveStory(["a", "b"], { b: { isLive: true } }),
    ).toBe(true);
    expect(laneHasActiveStory(["a"], { a: { isLive: false } })).toBe(false);
  });

  it("blocks deploy when any member story is already live", () => {
    expect(canDeployBroadcastLane(["a", "b"], { b: { isLive: true } })).toBe(false);
    expect(canDeployBroadcastLane(["a"], { a: { isLive: false } })).toBe(true);
    expect(canDeployBroadcastLane([], {})).toBe(false);
  });

  it("keeps only inactive lanes when that filter is on", () => {
    const lanes = groupBroadcastIndentsByPool([
      indent("live", { created: "2026-10-25T12:00:00Z" }),
      indent("quiet", { drop: "Chennai", created: "2026-10-25T11:00:00Z" }),
    ]);
    const filtered = filterBroadcastLanesByStory(lanes, "inactive", {
      live: { isLive: true },
    });
    expect(filtered.map((lane) => lane.representative.id)).toEqual(["quiet"]);
  });
});

describe("pickBroadcastLanePrimaryClient", () => {
  it("labels two extra shippers as +2 clients", () => {
    const pick = pickBroadcastLanePrimaryClient([
      indent("a1", { clientId: "a", clientName: "A" }),
      indent("a2", { clientId: "a", clientName: "A" }),
      indent("b1", { clientId: "b", clientName: "B" }),
      indent("c1", { clientId: "c", clientName: "C" }),
    ]);
    expect(pick.indent.client_name).toBe("A");
    expect(pick.extraClientCount).toBe(2);
    expect(formatBroadcastLaneClientTitle(pick.indent.client_name, pick.extraClientCount)).toBe(
      "A +2 clients",
    );
  });
});
