import type { IndentRow } from "@/features/indents/services/indents.service";
import { LoadCenterHubMobileIndentCard } from "@/features/network/components/LoadCenterHubMobileIndentCard";
import { LoadCenterKanbanBoard } from "@/features/network/components/LoadCenterKanbanBoard";
import { LoadCenterKanbanColumnModal } from "@/features/network/components/LoadCenterKanbanColumnModal";
import { NetworkBidPoolList } from "@/features/network/components/pooled/NetworkBidPoolList";
import type { NetworkBidQuote } from "@/features/network/utils/networkBidPools.util";
import { poolKey, poolKeyId } from "@/features/network/utils/pooledOpportunity.util";
import { isSponsoredReachLoad } from "@/features/network/utils/sponsoredReach.util";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@/features/network/utils/storyDisplay", () => ({
  ...jest.requireActual("@/features/network/utils/storyDisplay"),
  formatStoryDate: (iso: string) => iso.slice(0, 10),
}));
jest.mock("@expo/vector-icons/FontAwesome", () => () => null);
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/features/network/components/LoadIndentTripPlanPreview", () => ({
  LoadIndentTripPlanPreview: () => null,
}));
jest.mock("@/features/indents/components/IndentDetailScreen", () => ({
  IndentDetailScreen: () => null,
}));
jest.mock("@/features/indents", () => ({
  getIndentDisplayNumber: (row: { indent_number?: string }) => row.indent_number ?? "",
}));
jest.mock("@/features/network/hooks/useNetworkPoolLanesQuery", () => ({
  useServerNetworkPoolIds: () => null,
}));
const mockMutualsFor = jest.fn();
jest.mock("@/lib/queries/useMutualConnectionsQuery", () => ({
  useMutualConnectionsQuery: (viewer: string, target: string) => {
    mockMutualsFor(viewer, target);
    return { data: [] };
  },
}));

const SHIPPER: Record<string, string> = {
  spacex: "SpaceXLogistics",
  acme: "Acme Steel",
};

function indent(
  id: string,
  org: "spacex" | "acme",
  pickup: string,
  drop: string,
  vehicle: string | null,
  extra: Partial<IndentRow> = {},
): IndentRow {
  return {
    id,
    organization_id: org,
    creator_organization_name: SHIPPER[org],
    client_name: SHIPPER[org],
    indent_number: `IND-${id}`,
    pickup_area: pickup,
    drop_location: drop,
    vehicle_type: vehicle,
    client_price: 0,
    supplier_target: 20000,
    status: "open",
    load_type: "FTL",
    pickup_date: "2026-10-20",
    circulation_target: "integrated_supplier",
    weight: 9000,
    created_at: "2026-10-01T00:00:00Z",
    ...extra,
  } as IndentRow;
}

const NET_1 = indent("n1", "spacex", "Origin", "DestNet", "20FT");
const NET_2 = indent("n2", "acme", " origin", "DESTNET ", "20ft");
const BOTH_1 = indent("b1", "spacex", "Origin", "DestBoth", "20FT");
const OTHER_VEHICLE = indent("v1", "acme", "Origin", "DestNet", "32FT");
const SPONSORED = indent("sp", "spacex", "Origin", "DestNet", "20FT", {
  is_sponsored: true,
} as Partial<IndentRow>);

const QUOTED = [NET_1, NET_2, BOTH_1, OTHER_VEHICLE, SPONSORED];
const QUOTES = new Map<string, NetworkBidQuote>([
  ["n1", { status: "pending", amount: 19500, counter_amount: 20500 }],
  ["n2", { status: "pending", amount: 19500 }],
  ["b1", { status: "pending", amount: 19800 }],
  ["v1", { status: "pending", amount: 25000 }],
  ["sp", { status: "pending", amount: 21000 }],
]);
const isPoolable = (load: IndentRow) => !isSponsoredReachLoad(load);
const NET_POOL_ID = poolKeyId(poolKey({ pickup: "Origin", drop: "DestNet", vehicleType: "20FT" }));

/** Stand-in for the existing individual card: shows the shipper, like production. */
const individualCard = (load: IndentRow) => (
  <Pressable accessibilityLabel={`Individual ${load.indent_number}`}>
    <Text>{SHIPPER[load.organization_id as string]}</Text>
  </Pressable>
);
const memberCard = (load: IndentRow) => (
  <Pressable accessibilityLabel={`Member ${load.indent_number}`} />
);

const IDENTITY = /SpaceXLogistics|Acme Steel/;
const NET_POOL_CARD =
  "Network pool bid, Origin to DestNet, 20ft, 2 loads, 1 pending";
const bidPoolLabels = () =>
  screen
    .getAllByLabelText(/^Network pool bid, /)
    .map((el) => el.props.accessibilityLabel as string);

function renderList(
  extra: {
    shownLoads?: IndentRow[];
    onRevisePool?: jest.Mock;
  } = {},
) {
  render(
    <NetworkBidPoolList
      quotedLoads={QUOTED}
      shownLoads={extra.shownLoads ?? QUOTED}
      quoteByIndentId={QUOTES}
      isPoolable={isPoolable}
      renderIndividualCard={individualCard}
      renderPoolMemberCard={memberCard}
      onRevisePool={extra.onRevisePool}
    />,
  );
}

describe("My Bids: pooled Network quotes render as pools", () => {
  it("two Network quotes in the same pool render as one anonymous pool card", () => {
    renderList();
    const labels = bidPoolLabels();
    expect(labels.filter((l) => l.startsWith("Network pool bid, Origin to DestNet, 20ft"))).toEqual([
      NET_POOL_CARD,
    ]);
    expect(screen.getAllByText("NETWORK POOL").length).toBe(3);
    expect(screen.getByText("2 LOADS")).toBeTruthy();
    expect(screen.queryByLabelText("Individual IND-n1")).toBeNull();
    expect(screen.queryByLabelText("Individual IND-n2")).toBeNull();
  });

  it("pool cards carry no party name, avatar, indent number or facepile", () => {
    mockMutualsFor.mockClear();
    renderList({ shownLoads: [NET_1, NET_2, BOTH_1, OTHER_VEHICLE] });
    expect(screen.queryByText(IDENTITY)).toBeNull();
    expect(screen.queryByLabelText(IDENTITY)).toBeNull();
    expect(screen.queryByText(/IND-/)).toBeNull();
    expect(screen.queryByTestId("network-pool-mutuals")).toBeNull();
    expect(mockMutualsFor).not.toHaveBeenCalled();
  });

  it("a one-load pool still renders as NETWORK POOL · 1 LOAD", () => {
    renderList({ shownLoads: [BOTH_1] });
    expect(bidPoolLabels()).toEqual([
      "Network pool bid, Origin to DestBoth, 20ft, 1 load, 1 pending",
    ]);
    expect(screen.getByText("NETWORK POOL")).toBeTruthy();
    expect(screen.getByText("1 LOAD")).toBeTruthy();
    expect(screen.queryByLabelText("Individual IND-b1")).toBeNull();
  });

  it("different pickup/drop/vehicle combinations stay separate pools", () => {
    renderList();
    expect(bidPoolLabels().sort()).toEqual([
      "Network pool bid, Origin to DestBoth, 20ft, 1 load, 1 pending",
      NET_POOL_CARD,
      "Network pool bid, Origin to DestNet, 32ft, 1 load, 1 pending",
    ]);
  });

  it("member statuses are shown per state, never as one status for every load", () => {
    renderList({ shownLoads: [NET_1] });
    expect(screen.getByText("1 pending")).toBeTruthy();
    expect(screen.getByText("MIXED")).toBeTruthy();
    expect(screen.queryByText("PENDING")).toBeNull();
    expect(screen.getByText("₹ 19,500")).toBeTruthy();
  });

  it("a uniform pool shows that status", () => {
    renderList({ shownLoads: [BOTH_1] });
    expect(screen.getByText("PENDING")).toBeTruthy();
    expect(screen.queryByText("MIXED")).toBeNull();
  });

  it("sponsored Reach stays on its individual card", () => {
    renderList();
    expect(screen.getByLabelText("Individual IND-sp")).toBeTruthy();
    expect(bidPoolLabels().every((l) => !l.includes("3 loads"))).toBe(true);
  });

  it("a search hitting one member still shows the whole pool", () => {
    renderList({ shownLoads: [NET_2] });
    expect(bidPoolLabels()).toEqual([
      NET_POOL_CARD,
    ]);
  });

  it("the pool card does not open a detail view — only Revise bid is tappable", () => {
    renderList();
    fireEvent.press(screen.getByLabelText(NET_POOL_CARD));
    expect(screen.queryByLabelText("Back to my bids")).toBeNull();
    expect(screen.queryByText("Indents in this pool")).toBeNull();
    expect(bidPoolLabels()).toContain(NET_POOL_CARD);
  });

  it("revises the pooled bid from the list card", () => {
    const onRevisePool = jest.fn();
    renderList({ onRevisePool });
    fireEvent.press(screen.getByLabelText("Revise bid, 2 loads"));
    expect(onRevisePool).toHaveBeenCalledTimes(1);
    expect(onRevisePool.mock.calls[0][0].id).toBe(NET_POOL_ID);
  });

  it("pressing the pool card does not hand the pool to a detail view", () => {
    const onRevisePool = jest.fn();
    renderList({ onRevisePool });
    fireEvent.press(screen.getByLabelText(NET_POOL_CARD));
    expect(onRevisePool).not.toHaveBeenCalled();
    expect(screen.queryByText("Indents in this pool")).toBeNull();
  });
});

const quotedColumn = {
  id: "QUOTED",
  label: "My Bids",
  accent: "#000",
  loads: QUOTED,
  pageSize: 15,
} as never;

function renderModal(
  extra: {
    initialOpenPoolId?: string | null;
    pooled?: boolean;
    columnLoads?: IndentRow[];
    bidPoolLoads?: IndentRow[] | null;
    onReviseBidPool?: jest.Mock;
  } = {},
) {
  const pooled = extra.pooled ?? true;
  render(
    <LoadCenterKanbanColumnModal
      visible
      column={
        extra.columnLoads
          ? ({ ...(quotedColumn as object), loads: extra.columnLoads } as never)
          : quotedColumn
      }
      bidPoolLoads={extra.bidPoolLoads === null ? undefined : (extra.bidPoolLoads ?? QUOTED)}
      onClose={jest.fn()}
      renderCard={(load) => (
        <>
          {individualCard(load)}
          <Pressable accessibilityLabel={`Update bid ${load.indent_number}`} />
        </>
      )}
      renderPoolMemberCard={memberCard}
      initialOpenPoolId={extra.initialOpenPoolId ?? null}
      bidPoolQuotes={pooled ? QUOTES : undefined}
      isBidPoolable={isPoolable}
      onReviseBidPool={extra.onReviseBidPool}
    />,
  );
}

describe("My Bids column view", () => {
  it("lists one anonymous card per pool and keeps sponsored Reach individual", () => {
    renderModal();
    expect(bidPoolLabels()).toHaveLength(3);
    expect(screen.getByText("3 pools · 5 loads")).toBeTruthy();
    expect(screen.getByLabelText("Individual IND-sp")).toBeTruthy();
    for (const ref of ["IND-n1", "IND-n2", "IND-b1", "IND-v1"]) {
      expect(screen.queryByLabelText(`Individual ${ref}`)).toBeNull();
      expect(screen.queryByLabelText(`Update bid ${ref}`)).toBeNull();
    }
    expect(screen.getAllByText(IDENTITY)).toHaveLength(1);
  });

  it("the pool card stays on the list — no pool detail view", () => {
    renderModal();
    fireEvent.press(screen.getByLabelText(NET_POOL_CARD));
    expect(screen.queryByText(/in this pool · your pooled bid/)).toBeNull();
    expect(screen.queryByLabelText("Back to my bids")).toBeNull();
    expect(bidPoolLabels()).toHaveLength(3);
  });

  it("a board search that narrowed the column cannot shrink a pool", () => {
    renderModal({ columnLoads: [NET_1] });
    expect(bidPoolLabels()).toEqual([
      NET_POOL_CARD,
    ]);
    expect(screen.queryByText("1 LOAD")).toBeNull();
    fireEvent.press(screen.getByLabelText(NET_POOL_CARD));
    expect(screen.queryByText(/in this pool · your pooled bid/)).toBeNull();
    expect(screen.getByText("2 LOADS")).toBeTruthy();
  });

  it("the column's own search only picks pools; the pool shown stays whole", () => {
    renderModal();
    fireEvent.changeText(screen.getByPlaceholderText("Search loads, route, ID…"), "IND-n2");
    expect(bidPoolLabels()).toEqual([
      NET_POOL_CARD,
    ]);
  });

  it("without the complete quoted list, no pool card is built from column loads", () => {
    renderModal({ columnLoads: [NET_1], bidPoolLoads: null });
    expect(screen.queryByLabelText(/^Network pool bid/)).toBeNull();
    expect(screen.queryByText("NETWORK POOL")).toBeNull();
  });

  it("without pool wiring the stage keeps its individual cards (existing workflow)", () => {
    renderModal({ pooled: false });
    expect(screen.queryByLabelText(/^Network pool bid/)).toBeNull();
    expect(screen.getByLabelText("Update bid IND-n1")).toBeTruthy();
  });
});

describe("desktop board My Bids preview", () => {
  it("shows pools in the My Bids column without opening a pool detail", () => {
    render(
      <LoadCenterKanbanBoard
        title="Market opportunities by stage"
        columns={[{ id: "QUOTED", label: "My Bids", accent: "#000", loads: QUOTED }]}
        renderCard={individualCard}
        renderColumnBody={(col) =>
          col.id === "QUOTED" ? (
            <NetworkBidPoolList
              quotedLoads={QUOTED}
              shownLoads={col.loads}
              quoteByIndentId={QUOTES}
              isPoolable={isPoolable}
              renderIndividualCard={individualCard}
              renderPoolMemberCard={memberCard}
            />
          ) : null
        }
      />,
    );
    expect(bidPoolLabels()).toHaveLength(3);
    expect(screen.queryByLabelText("Individual IND-n1")).toBeNull();
    fireEvent.press(screen.getByLabelText(NET_POOL_CARD));
    expect(screen.queryByLabelText("Back to my bids")).toBeNull();
  });
});

describe("an accepted counter is shown as agreed, not countered", () => {
  it("pool card reports the accepted counter per member", () => {
    render(
      <NetworkBidPoolList
        quotedLoads={[NET_1, NET_2]}
        shownLoads={[NET_1, NET_2]}
        quoteByIndentId={
          new Map<string, NetworkBidQuote>([
            ["n1", { status: "pending", amount: 20500, counter_amount: 20500 }],
            ["n2", { status: "pending", amount: 19500 }],
          ])
        }
        isPoolable={isPoolable}
        renderIndividualCard={individualCard}
        renderPoolMemberCard={memberCard}
      />,
    );
    expect(screen.getByText("1 pending")).toBeTruthy();
    expect(screen.queryByText(/countered/)).toBeNull();
  });

  it("a uniform agreed pool says COUNTER ACCEPTED", () => {
    render(
      <NetworkBidPoolList
        quotedLoads={[BOTH_1]}
        shownLoads={[BOTH_1]}
        quoteByIndentId={
          new Map<string, NetworkBidQuote>([
            ["b1", { status: "pending", amount: "19800.00", counter_amount: "19800" }],
          ])
        }
        isPoolable={isPoolable}
        renderIndividualCard={individualCard}
        renderPoolMemberCard={memberCard}
      />,
    );
    expect(screen.getByText("COUNTER ACCEPTED")).toBeTruthy();
  });

  it("the member card chip reads AGREED with no Update bid prompt", () => {
    render(
      <LoadCenterHubMobileIndentCard
        indent={NET_1}
        titleName=""
        statusLabel="counter accepted"
        origin="Origin"
        dest="DestNet"
        pickupIso={NET_1.pickup_date}
        leftFooterLabel="20FT"
        rightFooterLabel="FTL"
        sourceTag="network"
        onPress={jest.fn()}
        anonymous
      />,
    );
    expect(screen.getByText("AGREED")).toBeTruthy();
    expect(screen.queryByText(/update bid/i)).toBeNull();
    expect(screen.queryByText("COUNTER")).toBeNull();
  });
});

describe("opened My Bids pool revises the pooled bid", () => {
  it("revises from the pool card and does not list member indents", () => {
    const onRevisePool = jest.fn();
    render(
      <NetworkBidPoolList
        quotedLoads={QUOTED}
        shownLoads={QUOTED}
        quoteByIndentId={QUOTES}
        isPoolable={isPoolable}
        renderIndividualCard={individualCard}
        renderPoolMemberCard={memberCard}
        onRevisePool={onRevisePool}
      />,
    );
    expect(screen.queryByText("Indents in this pool")).toBeNull();
    expect(screen.queryByLabelText("Revise bid IND-n1")).toBeNull();
    fireEvent.press(screen.getByLabelText("Revise bid, 2 loads"));
    expect(onRevisePool).toHaveBeenCalledTimes(1);
    expect(onRevisePool.mock.calls[0][0].members.map((m: IndentRow) => m.id)).toEqual([
      "n1",
      "n2",
    ]);
  });
});
