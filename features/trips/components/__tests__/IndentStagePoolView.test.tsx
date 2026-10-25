import type { IndentRow } from "@/features/indents/services/indents.service";
import { useShipperPoolIndentView } from "@/features/network/hooks/useShipperPoolIndentView";
import {
  canonicalPoolLanes,
  poolKey,
  poolKeyId,
} from "@/features/network/utils/pooledOpportunity.util";
import { shipperPoolLanes } from "@/features/network/utils/shipperPoolIndents.util";
import { IndentStageViews } from "@/features/trips/components/IndentStagePoolView";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react-native";
import { Text } from "react-native";

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@/features/network/utils/storyDisplay", () => ({
  formatStoryDate: (iso: string) => iso.slice(0, 10),
  formatStoryDateTime: (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`,
}));
jest.mock("@/features/indents/services/indents.service", () => ({
  getIndentDisplayNumber: (row: { indent_number: string }) => row.indent_number,
}));

function indent(
  id: string,
  pickup: string,
  drop: string,
  vehicle: string | null,
  extra: Partial<IndentRow> = {},
): IndentRow {
  return {
    id,
    organization_id: "org-1",
    indent_number: `IND-${id}`,
    pickup_area: pickup,
    drop_location: drop,
    vehicle_type: vehicle,
    client_name: "Client",
    client_price: 0,
    supplier_target: 0,
    status: "open",
    load_type: "FTL",
    pickup_date: "2026-10-08",
    circulation_target: "marketplace",
    weight: 12000,
    created_at: "2026-10-01T00:00:00Z",
    ...extra,
  };
}

const FIXTURE: IndentRow[] = [
  indent("a", "Pune", "Mumbai", "32 FT", { client_name: "Tata Steel" }),
  indent("b", "pune", "MUMBAI ", "32 ft"),
  indent("c", "Pune", "Navi Mumbai", "32 FT"),
  indent("d", "Pune", "Mumbai", "20 FT"),
  indent("f", "Pune", "Mumbai", "32 FT"),
];

const onOpenIndent = jest.fn();

function Harness({
  indents = FIXTURE,
  allocated = [],
  canView = true,
  canSelect = true,
  snapshots,
}: {
  indents?: IndentRow[];
  allocated?: IndentRow[];
  canView?: boolean;
  canSelect?: boolean;
  snapshots?: Record<
    string,
    { count: number; lowestAmount: number | null; highestAmount?: number | null; latestAt: string | null }
  >;
}) {
  const state = useShipperPoolIndentView<IndentRow>({
    poolIndents: indents,
    visibleIndents: indents,
    allocatedIndents: allocated,
  });
  return (
    <IndentStageViews
      state={state}
      canView={canView}
      canSelect={canSelect}
      bidCountById={{ a: 2 }}
      bidSnapshotById={snapshots}
      listCapped={false}
      compact={false}
      onOpenIndent={onOpenIndent}
      cards={<Text>CARD VIEW BODY</Text>}
    />
  );
}

function openIndentPool() {
  fireEvent.press(screen.getByRole("tab", { name: "Indent Pool" }));
}

function openPool(route: string, vehicle: string, count: number) {
  fireEvent.press(
    screen.getByLabelText(
      `Open indent pool ${route}, ${vehicle}, ${count} indent${count === 1 ? "" : "s"}`,
    ),
  );
}

const openPuneMumbai = (count = 3) => openPool("Pune → Mumbai", "32 FT", count);

function textOf(testID: string): string {
  const flat = (c: unknown): string =>
    Array.isArray(c) ? c.map(flat).join("") : c == null || c === false ? "" : String(c);
  return flat(screen.getByTestId(testID).props.children);
}

const selectedCount = () => textOf("indent-pool-selected-count");

describe("IndentStageViews — Network Indent Pool", () => {
  it("defaults to Card View and toggles to Indent Pool in the same screen", () => {
    render(<Harness />);
    expect(screen.getByText("CARD VIEW BODY")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Card View" }).props.accessibilityState).toEqual({
      selected: true,
    });
    openIndentPool();
    expect(screen.queryByText("CARD VIEW BODY")).toBeNull();
    expect(screen.getByTestId("indent-pool-view")).toBeTruthy();
    fireEvent.press(screen.getByRole("tab", { name: "Card View" }));
    expect(screen.getByText("CARD VIEW BODY")).toBeTruthy();
  });

  it("shows a single indent as a one-member Indent Pool", () => {
    render(<Harness indents={[indent("solo", "Delhi", "Hyderabad", "24 MT")]} />);
    openIndentPool();
    openPool("Delhi → Hyderabad", "24 MT", 1);
    expect(screen.getByText("INDENT POOL")).toBeTruthy();
    expect(textOf("indent-pool-count")).toBe("1 indent in pool");
    expect(screen.getByTestId("indent-pool-row-solo")).toBeTruthy();
    expect(screen.getByLabelText("Waiting for bid: 1")).toBeTruthy();
  });

  it("groups several indents into one pool with canonical membership", () => {
    render(<Harness />);
    openIndentPool();
    openPuneMumbai();
    expect(textOf("indent-pool-count")).toBe("3 indents in pool");
    expect(screen.getByTestId("indent-pool-row-a")).toBeTruthy();
    expect(screen.getByTestId("indent-pool-row-b")).toBeTruthy();
    expect(screen.getByTestId("indent-pool-row-f")).toBeTruthy();
    expect(screen.queryByTestId("indent-pool-row-c")).toBeNull();
    expect(screen.queryByTestId("indent-pool-row-d")).toBeNull();
  });

  it("renders indent ids, party and bid status — the Network projection is not anonymous", () => {
    render(<Harness />);
    openIndentPool();
    openPuneMumbai();
    expect(screen.getByText("IND-a")).toBeTruthy();
    expect(screen.getByText(/Tata Steel/)).toBeTruthy();
    expect(screen.getByText("2 bids")).toBeTruthy();
    expect(screen.getAllByText("Waiting for bid").length).toBeGreaterThan(0);
  });

  it("filters pools to one client from the finder header", () => {
    render(
      <Harness
        indents={[
          indent("a", "Pune", "Mumbai", "32 FT", { client_name: "Tata Steel" }),
          indent("z", "Chennai", "Delhi", "20 FT", { client_name: "Paperkraft" }),
        ]}
      />,
    );
    openIndentPool();
    expect(screen.getByLabelText("Open indent pool Pune → Mumbai, 32 FT, 1 indent")).toBeTruthy();
    expect(screen.getByLabelText("Open indent pool Chennai → Delhi, 20 FT, 1 indent")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Client"));
    fireEvent.press(screen.getByLabelText("Paperkraft, 1 available"));
    expect(screen.queryByLabelText("Open indent pool Pune → Mumbai, 32 FT, 1 indent")).toBeNull();
    expect(screen.getByLabelText("Open indent pool Chennai → Delhi, 20 FT, 1 indent")).toBeTruthy();
    expect(screen.getByText("Paperkraft")).toBeTruthy();
  });

  it("returns to the pool list from an opened pool", () => {
    render(<Harness />);
    openIndentPool();
    openPuneMumbai();
    expect(screen.getByTestId("indent-pool-count")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Back to all pools"));
    expect(screen.getByTestId("indent-pool-summary-table")).toBeTruthy();
    expect(screen.queryByTestId("indent-pool-count")).toBeNull();
  });

  it("sorts opened pool indents by pickup date", () => {
    render(<Harness />);
    openIndentPool();
    openPuneMumbai();
    fireEvent.press(screen.getByLabelText("Sort by Pickup"));
    expect(screen.getByLabelText("Sort by Pickup, ascending")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Sort by Pickup, ascending"));
    expect(screen.getByLabelText("Sort by Pickup, descending")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Sort by Bid status"));
    expect(screen.getByLabelText("Sort by Bid status, descending")).toBeTruthy();
  });

  it("summarises the pool: waiting, bids received, awarded and on a trip", () => {
    render(
      <Harness
        indents={[
          ...FIXTURE,
          indent("w", "Pune", "Mumbai", "32 FT", { status: "awarded" }),
        ]}
        allocated={[
          indent("t1", "PUNE", "mumbai", "32 FT"),
          indent("t2", "Pune", "Chennai", "32 FT"),
        ]}
      />,
    );
    openIndentPool();
    openPuneMumbai(4);
    expect(screen.getByLabelText("Waiting for bid: 2")).toBeTruthy();
    expect(screen.getByLabelText("Bids received: 1")).toBeTruthy();
    expect(screen.getByLabelText("Awarded: 1")).toBeTruthy();
    expect(screen.getByLabelText("On a trip: 1")).toBeTruthy();
  });

  it("filters the opened pool list when a stage chip is pressed", () => {
    render(
      <Harness
        indents={[
          ...FIXTURE,
          indent("w", "Pune", "Mumbai", "32 FT", { status: "awarded" }),
        ]}
        allocated={[indent("t1", "PUNE", "mumbai", "32 FT")]}
      />,
    );
    openIndentPool();
    openPuneMumbai(4);
    fireEvent.press(screen.getByLabelText("Waiting for bid: 2"));
    expect(screen.getByTestId("indent-pool-row-b")).toBeTruthy();
    expect(screen.getByTestId("indent-pool-row-f")).toBeTruthy();
    expect(screen.queryByTestId("indent-pool-row-a")).toBeNull();
    expect(screen.queryByTestId("indent-pool-row-w")).toBeNull();
    fireEvent.press(screen.getByLabelText("Waiting for bid: 2"));
    expect(screen.getByTestId("indent-pool-row-a")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("On a trip: 1"));
    expect(screen.getByTestId("indent-pool-row-t1")).toBeTruthy();
    expect(screen.getAllByText("On trip").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("indent-pool-row-a")).toBeNull();
  });

  it("selection is operational only, with a live count", () => {
    render(<Harness />);
    openIndentPool();
    openPuneMumbai();
    expect(screen.getByText("Selecting indents does not change the pool.")).toBeTruthy();
    expect(selectedCount()).toBe("0 selected for bulk actions");
    fireEvent.press(screen.getByLabelText("Select indent IND-a"));
    expect(selectedCount()).toBe("1 selected for bulk actions");
    fireEvent.press(screen.getByLabelText("Select indent IND-a"));
    expect(selectedCount()).toBe("0 selected for bulk actions");
    fireEvent.press(screen.getByLabelText("Select all 3 shown indents"));
    expect(selectedCount()).toBe("3 selected for bulk actions");
    expect(textOf("indent-pool-count")).toBe("3 indents in pool");
    fireEvent.press(screen.getByLabelText("Clear selection"));
    expect(selectedCount()).toBe("0 selected for bulk actions");
  });

  it("switching pools clears the selection", () => {
    const { result } = renderHook(() =>
      useShipperPoolIndentView<IndentRow>({
        poolIndents: FIXTURE,
        visibleIndents: FIXTURE,
      }),
    );
    act(() =>
      result.current.setPoolSearch({ pickup: "Pune", drop: "Mumbai", vehicleType: "32 FT" }),
    );
    act(() => result.current.toggle("a"));
    expect(result.current.model.selectedIds).toEqual(["a"]);
    act(() =>
      result.current.setPoolSearch({ pickup: "pune", drop: "mumbai ", vehicleType: "32 ft" }),
    );
    expect(result.current.model.selectedIds).toEqual(["a"]);
    act(() =>
      result.current.setPoolSearch({ pickup: "Pune", drop: "Navi Mumbai", vehicleType: "32 FT" }),
    );
    expect(result.current.model.selectedIds).toEqual([]);
    expect(result.current.model.members.map((i) => i.id)).toEqual(["c"]);
  });

  it("keeps the pool and selection when switching views", () => {
    render(<Harness />);
    openIndentPool();
    openPuneMumbai();
    fireEvent.press(screen.getByLabelText("Select indent IND-b"));
    fireEvent.press(screen.getByRole("tab", { name: "Card View" }));
    openIndentPool();
    expect(textOf("indent-pool-count")).toBe("3 indents in pool");
    expect(selectedCount()).toBe("1 selected for bulk actions");
    expect(screen.getByLabelText("Select indent IND-b").props.accessibilityState).toEqual({
      checked: true,
    });
  });

  it("pages a large pool without auto-selecting the rest", () => {
    const many = Array.from({ length: 55 }, (_, n) =>
      indent(`m${n}`, "Pune", "Mumbai", "32 FT"),
    );
    render(<Harness indents={many} />);
    openIndentPool();
    openPuneMumbai(55);
    expect(textOf("indent-pool-shown")).toBe(
      "Top 10 of 55 · Select all only adds the rows shown",
    );
    fireEvent.press(screen.getByLabelText("Select all 10 shown indents"));
    expect(selectedCount()).toBe("10 selected for bulk actions");
    fireEvent.press(screen.getByLabelText("Show all 55 indents"));
    expect(textOf("indent-pool-shown")).toBe("Showing 55 of 55");
    expect(selectedCount()).toBe("10 selected for bulk actions");
    fireEvent.press(screen.getByLabelText("Show first 10 indents only"));
    expect(textOf("indent-pool-shown")).toBe(
      "Top 10 of 55 · Select all only adds the rows shown",
    );
  });

  it("pickup picker counts canonical pool membership, not raw strings", () => {
    render(
      <Harness
        indents={[
          indent("b1", "Bangalore", "Chennai", "32 FT"),
          indent("b2", " bangalore ", "CHENNAI", "32 ft"),
          indent("g1", "Bengaluru, Bangalore", "Chennai", "32 FT"),
        ]}
      />,
    );
    openIndentPool();
    fireEvent.press(screen.getByLabelText("Pickup city"));
    expect(screen.getByLabelText("Pickup Bangalore, 2 available")).toBeTruthy();
    expect(
      screen.getByLabelText("Pickup Bengaluru, Bangalore, 1 available"),
    ).toBeTruthy();
    expect(screen.queryByLabelText(/^Pickup bangalore,/)).toBeNull();
    fireEvent.press(screen.getByLabelText("Pickup Bangalore, 2 available"));
    fireEvent.press(screen.getByLabelText("Drop Chennai, 2 available"));
    fireEvent.press(screen.getByLabelText("Vehicle 32 FT, 2 available"));
    expect(textOf("indent-pool-count")).toBe("2 indents in pool");
    expect(screen.getByTestId("indent-pool-row-b1")).toBeTruthy();
    expect(screen.getByTestId("indent-pool-row-b2")).toBeTruthy();
    expect(screen.queryByTestId("indent-pool-row-g1")).toBeNull();
  });

  it("keeps Review per indent", () => {
    render(<Harness />);
    openIndentPool();
    openPuneMumbai();
    fireEvent.press(screen.getByLabelText("Review indent IND-b"));
    expect(onOpenIndent).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
    expect(screen.getByText("Award, vehicle and driver stay per indent in Review.")).toBeTruthy();
  });

  it("summarises every pool by stage before one is opened", () => {
    render(
      <Harness
        indents={[
          ...FIXTURE,
          indent("w", "Pune", "Mumbai", "32 FT", {
            status: "awarded",
            assigned_supplier_rate: 34000,
            awarded_amount: 36000,
          }),
        ]}
        allocated={[indent("t1", "PUNE", "mumbai", "32 FT")]}
        snapshots={{
          a: { count: 2, lowestAmount: 41000, highestAmount: 45000, latestAt: "2026-10-08T12:30:00Z" },
        }}
      />,
    );
    openIndentPool();
    expect(screen.getByTestId("indent-pool-summary-table")).toBeTruthy();
    expect(screen.getByLabelText("All pools Pools: 3")).toBeTruthy();
    expect(screen.getByLabelText("All pools Indents: 6")).toBeTruthy();
    expect(screen.getByLabelText("All pools Awarded: 1")).toBeTruthy();
    expect(screen.getByLabelText("All pools On trip: 1")).toBeTruthy();
    const pune = screen.getByLabelText("Open indent pool Pune → Mumbai, 32 FT, 4 indents");
    expect(pune.props.accessibilityHint).toBe(
      "2 waiting, 1 with bids, 1 awarded, 1 on trip",
    );
    expect(screen.getByText("₹ 41,000")).toBeTruthy();
    expect(screen.getByText("to ₹ 45,000")).toBeTruthy();
    expect(screen.getByText("₹ 34,000")).toBeTruthy();
    expect(screen.getByLabelText("Awarded average ₹ 34,000")).toBeTruthy();
  });

  it("shows a single awarded price in bid range when there are no live bids", () => {
    render(
      <Harness
        indents={[
          indent("x", "Chennai", "Delhi", "20 FT", {
            status: "awarded",
            assigned_supplier_rate: 5250,
          }),
        ]}
      />,
    );
    openIndentPool();
    expect(screen.getAllByText("₹ 5,250").length).toBeGreaterThanOrEqual(1);
  });

  it("shows awarded price on each opened-pool indent like Home", () => {
    render(
      <Harness
        indents={[
          indent("x", "Chennai", "Delhi", "20 FT", {
            status: "awarded",
            assigned_supplier_rate: 5250,
            client_price: 6000,
          }),
        ]}
      />,
    );
    openIndentPool();
    openPool("Chennai → Delhi", "20 FT", 1);
    expect(screen.getByText("Awarded ₹ 5,250")).toBeTruthy();
    expect(screen.getByText("Client ₹ 6,000")).toBeTruthy();
    expect(screen.getByLabelText("Awarded, Awarded ₹ 5,250")).toBeTruthy();
  });

  it("shows target rate on a waiting indent when there are no live bids", () => {
    render(
      <Harness
        indents={[
          indent("y", "Chennai", "Delhi", "20 FT", {
            supplier_target: 4800,
          }),
        ]}
      />,
    );
    openIndentPool();
    openPool("Chennai → Delhi", "20 FT", 1);
    expect(screen.getByText("Target ₹ 4,800")).toBeTruthy();
  });

  it("sorts the pool table when a column header is pressed", () => {
    render(
      <Harness
        indents={[...FIXTURE, indent("w", "Pune", "Mumbai", "32 FT", { status: "awarded" })]}
      />,
    );
    openIndentPool();
    fireEvent.press(screen.getByLabelText("Sort by Awarded"));
    expect(screen.getByLabelText("Sort by Awarded, descending")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Sort by Awarded, descending"));
    expect(screen.getByLabelText("Sort by Awarded, ascending")).toBeTruthy();
  });

  it("shows each indent's bid status: count, lowest offer and last bid time", () => {
    render(
      <Harness
        snapshots={{
          a: { count: 2, lowestAmount: 41000, highestAmount: 45000, latestAt: "2026-10-08T12:30:00Z" },
        }}
      />,
    );
    openIndentPool();
    openPuneMumbai();
    expect(screen.getByText("2 bids")).toBeTruthy();
    expect(screen.getByText("₹ 41,000–₹ 45,000")).toBeTruthy();
    expect(screen.getByText("Last bid · 2026-10-08 12:30")).toBeTruthy();
    expect(textOf("indent-pool-lowest")).toBe("Bids in pool · ₹ 41,000–₹ 45,000");
    expect(screen.getAllByLabelText("Stage Bids").length).toBe(1);
    expect(screen.getAllByLabelText("Stage Posted").length).toBe(2);
  });

  it("hides the toggle without indent view access", () => {
    render(<Harness canView={false} />);
    expect(screen.queryByRole("tab", { name: "Indent Pool" })).toBeNull();
    expect(screen.getByText("CARD VIEW BODY")).toBeTruthy();
  });

  it("is read-only without indent allocation access", () => {
    render(<Harness canSelect={false} />);
    openIndentPool();
    openPuneMumbai();
    expect(screen.getByTestId("indent-pool-row-a")).toBeTruthy();
    expect(screen.queryByLabelText("Select indent IND-a")).toBeNull();
    expect(screen.queryByLabelText(/Select all/)).toBeNull();
    expect(
      screen.getByText("View only. Selecting indents needs indent allocation access."),
    ).toBeTruthy();
  });
});

describe("Network and Marketplace share one pool identity", () => {
  it("a Marketplace lane and the shipper's indents resolve to the same pool id", () => {
    const [marketLane] = canonicalPoolLanes([
      { pickup_area: "Pune", drop_location: "Mumbai", vehicle_type: "32 FT", load_count: 3 },
    ]);
    const networkLanes = shipperPoolLanes(FIXTURE);
    const networkLane = networkLanes.find((l) => l.poolId === marketLane!.poolId);
    expect(networkLane?.load_count).toBe(3);
    expect(
      poolKeyId(poolKey({ pickup: " pune", drop: "MUMBAI", vehicleType: "32 ft " })),
    ).toBe(marketLane!.poolId);
  });

  it("a one-indent pool has the same id on both surfaces", () => {
    const solo = indent("solo", "Delhi", "Hyderabad", "24 MT");
    const [marketLane] = canonicalPoolLanes([
      { pickup_area: "delhi", drop_location: "Hyderabad ", vehicle_type: "24 mt", load_count: 1 },
    ]);
    expect(shipperPoolLanes([solo]).map((l) => l.poolId)).toEqual([marketLane!.poolId]);
  });
});
