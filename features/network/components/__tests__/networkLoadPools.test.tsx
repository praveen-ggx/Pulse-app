import type { IndentRow } from "@/features/indents/services/indents.service";
import { NetworkPoolQuoteModal } from "@/features/network/components/bidding/NetworkPoolQuoteModal";
import { LoadCenterKanbanBoard } from "@/features/network/components/LoadCenterKanbanBoard";
import { LoadCenterHubMobileIndentCard } from "@/features/network/components/LoadCenterHubMobileIndentCard";
import { LoadCenterKanbanColumnModal } from "@/features/network/components/LoadCenterKanbanColumnModal";
import { NetworkLoadPoolList } from "@/features/network/components/pooled/NetworkLoadPoolList";
import { buildNetworkLoadPools } from "@/features/network/utils/networkLoadPools.util";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
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
const mockSubmitNetworkQuote = jest.fn();
const mockGetOrgNetworkPool = jest.fn();
jest.mock("@/features/network/services/networkPools.service", () => ({
  submitNetworkQuote: (...args: unknown[]) => mockSubmitNetworkQuote(...args),
  getOrgNetworkPool: (...args: unknown[]) => mockGetOrgNetworkPool(...args),
}));
let mockServerPoolIds: ReadonlySet<string> | null = null;
jest.mock("@/features/network/hooks/useNetworkPoolLanesQuery", () => ({
  useServerNetworkPoolIds: () => mockServerPoolIds,
}));
jest.mock("@/lib/queries", () => ({ useInvalidateIndents: () => jest.fn() }));
const mockMutualsFor = jest.fn();
jest.mock("@/lib/queries/useMutualConnectionsQuery", () => ({
  useMutualConnectionsQuery: (viewer: string, target: string) => {
    mockMutualsFor(viewer, target);
    return {
      data: [{ id: "m1", name: "Mira Freight", avatar_seed: null, avatar_url: null }],
    };
  },
}));

type EntryProps = {
  onSubmitAmount: (n: number) => Promise<boolean>;
  contextLine?: string;
  ownerName?: string;
  submitLabel?: string;
  validationError?: string;
  confirmCopy?: { scopeNote?: string };
  initialAmount?: number | null;
  isUpdate?: boolean;
};
let lastEntry: EntryProps | null = null;
jest.mock("@/features/indents/components/bidding/IndentBidAmountEntry", () => ({
  IndentBidAmountEntry: (props: EntryProps) => {
    lastEntry = props;
    const { Text: T } = jest.requireActual("react-native");
    return (
      <>
        <T>{props.ownerName}</T>
        <T>{props.contextLine}</T>
        <T>{props.confirmCopy?.scopeNote}</T>
        {props.validationError ? <T>{props.validationError}</T> : null}
      </>
    );
  },
}));

function indent(
  id: string,
  org: string,
  pickup: string,
  drop: string,
  vehicle: string | null,
): IndentRow {
  return {
    id,
    organization_id: org,
    creator_organization_name: org === "acme" ? "Acme Steel" : "Bolt Logistics",
    indent_number: `IND-${id}`,
    pickup_area: pickup,
    drop_location: drop,
    vehicle_type: vehicle,
    client_name: "",
    client_price: 0,
    supplier_target: 20000,
    status: "open",
    load_type: "FTL",
    pickup_date: "2026-10-08",
    circulation_target: "integrated_supplier",
    weight: 12000,
    created_at: "2026-10-01T00:00:00Z",
  } as IndentRow;
}

const LOADS: IndentRow[] = [
  indent("a", "acme", "Pune", "Mumbai", "32 FT"),
  indent("b", "acme", " pune", "MUMBAI ", "32 ft"),
  indent("c", "bolt", "Pune", "Mumbai", "32 FT"),
  indent("d", "acme", "Delhi", "Hyderabad", "24 MT"),
  indent("e", "acme", "Pune", "Mumbai", null),
];

const column = {
  id: "OPEN",
  label: "Network Loads",
  accent: "#000",
  loads: LOADS,
  pageSize: 15,
} as never;

describe("NetworkLoadPoolList (phone Network Loads)", () => {
  const memberCard = (load: IndentRow) => (
    <Pressable accessibilityLabel={`Card ${load.indent_number}`} />
  );
  function renderList(shownLoads = LOADS, onQuotePool = jest.fn()) {
    render(
      <NetworkLoadPoolList
        orgId="me"
        openLoads={LOADS}
        shownLoads={shownLoads}
        canQuote
        onQuotePool={onQuotePool}
        renderPoolMemberCard={memberCard}
      />,
    );
    return onQuotePool;
  }

  it("lists canonical pools across shippers, with one quote per pool", () => {
    renderList();
    expect(screen.getByText("2 pools · one quote per pool")).toBeTruthy();
    expect(screen.getByLabelText("Quote for pool, 3 loads")).toBeTruthy();
    expect(screen.queryByLabelText("Card IND-a")).toBeNull();
    expect(screen.queryByLabelText(/^Bid now/)).toBeNull();
  });

  it("a load without a complete lane is review-only — no individual Bid", () => {
    renderList();
    expect(screen.getByText("Incomplete lane")).toBeTruthy();
    expect(
      screen.getByText("Pickup, drop and vehicle are required before this load can be quoted."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Card IND-e")).toBeTruthy();
    expect(screen.queryByLabelText("Bid now IND-e")).toBeNull();
  });

  it("an opened pool shows both shippers' indents with no per-indent Bid now", () => {
    const onQuotePool = renderList();
    fireEvent.press(screen.getAllByLabelText("View 3 indents in this pool")[0]!);
    expect(screen.getByText("Indents in this pool")).toBeTruthy();
    for (const ref of ["IND-a", "IND-b", "IND-c"]) {
      expect(screen.getByLabelText(`Card ${ref}`)).toBeTruthy();
    }
    expect(screen.queryByLabelText(/^Bid now/)).toBeNull();
    fireEvent.press(screen.getByLabelText("Quote for pool, 3 loads"));
    expect(onQuotePool.mock.calls[0][0].members.map((m: IndentRow) => m.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    fireEvent.press(screen.getByLabelText("Back to all pools"));
    expect(screen.queryByText("Indents in this pool")).toBeNull();
  });

  it("a search that matches one indent still quotes the whole pool", () => {
    const onQuotePool = renderList([LOADS[0]!]);
    expect(screen.getByText("1 pool · one quote per pool")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Quote for pool, 3 loads"));
    expect(onQuotePool.mock.calls[0][0].members).toHaveLength(3);
    expect(screen.queryByText("Incomplete lane")).toBeNull();
  });

  describe("server lane list", () => {
    afterEach(() => {
      mockServerPoolIds = null;
    });

    it("shows only pools the server lists for this organization", () => {
      const pools = buildNetworkLoadPools(LOADS).pools;
      const puneMumbai = pools.find((p) => p.members.length === 3)!;
      mockServerPoolIds = new Set([puneMumbai.id]);
      renderList();
      expect(screen.getByText("1 pool · one quote per pool")).toBeTruthy();
      expect(screen.getByLabelText("Quote for pool, 3 loads")).toBeTruthy();
      expect(screen.queryByLabelText("Quote for pool, 1 load")).toBeNull();
    });

    it("an empty server list hides every locally grouped pool", () => {
      mockServerPoolIds = new Set();
      renderList();
      expect(screen.queryByLabelText(/^Quote for pool/)).toBeNull();
    });
  });
});

const bidCard = (load: IndentRow) => (
  <>
    <Pressable accessibilityLabel={`Card ${load.indent_number}`} />
    <Pressable accessibilityLabel={`Bid now ${load.indent_number}`} />
  </>
);
const detailCard = (load: IndentRow) => (
  <Pressable accessibilityLabel={`Card ${load.indent_number}`} />
);
const poolLabels = () =>
  screen
    .getAllByLabelText(/^Network pool, /)
    .map((el) => el.props.accessibilityLabel as string)
    .sort();
const POOLED_REFS = ["IND-a", "IND-b", "IND-c", "IND-d"];

/** Mirrors the LoadCenterView desktop wiring: OPEN column body = Network pools. */
function renderBoard(
  openColumnLoads: IndentRow[] = LOADS,
  onViewIndents = jest.fn(),
  onQuotePool = jest.fn(),
) {
  const quoted = indent("q", "acme", "Pune", "Mumbai", "32 FT");
  render(
    <LoadCenterKanbanBoard
      title="Market opportunities by stage"
      columns={[
        { id: "OPEN", label: "Network Loads", accent: "#000", loads: openColumnLoads },
        { id: "QUOTED", label: "My Bids", accent: "#000", loads: [quoted] },
      ]}
      renderCard={bidCard}
      renderColumnBody={(col) =>
        col.id === "OPEN" ? (
          <NetworkLoadPoolList
            orgId="me"
            openLoads={LOADS}
            shownLoads={col.loads}
            canQuote
            onQuotePool={onQuotePool}
            renderPoolMemberCard={detailCard}
            onViewIndents={onViewIndents}
          />
        ) : null
      }
    />,
  );
  return { onViewIndents, onQuotePool };
}

describe("desktop Network Loads column preview", () => {
  it("shows pools, not quotable indent cards; incomplete lanes are review-only", () => {
    renderBoard();
    expect(screen.getByLabelText("Quote for pool, 3 loads")).toBeTruthy();
    for (const ref of [...POOLED_REFS, "IND-e"]) {
      expect(screen.queryByLabelText(`Bid now ${ref}`)).toBeNull();
    }
    expect(screen.getByLabelText("Card IND-e")).toBeTruthy();
  });

  it("leaves other stages (My Bids) as indent cards", () => {
    renderBoard();
    expect(screen.getByLabelText("Card IND-q")).toBeTruthy();
  });

  it("uses the same pool representation as the opened column", () => {
    renderBoard();
    const preview = poolLabels();
    screen.unmount();
    renderModal(jest.fn(), { poolLoads: LOADS });
    expect(poolLabels()).toEqual(preview);
  });

  it("View N indents opens that pool in the column view, still without Bid", () => {
    const { onViewIndents } = renderBoard();
    fireEvent.press(screen.getAllByLabelText("View 3 indents in this pool")[0]!);
    const pool = onViewIndents.mock.calls[0][0];
    expect(pool.members.map((m: IndentRow) => m.id)).toEqual(["a", "b", "c"]);
    screen.unmount();
    renderModal(jest.fn(), { poolLoads: LOADS, initialOpenPoolId: pool.id });
    expect(screen.getByText("Indents in this pool")).toBeTruthy();
    expect(screen.getByLabelText("Card IND-a")).toBeTruthy();
    expect(screen.getByLabelText("Card IND-c")).toBeTruthy();
    expect(screen.queryByLabelText(/^Bid now/)).toBeNull();
  });

  it("a search that hits one indent still offers the whole pool, in preview and column", () => {
    const { onQuotePool } = renderBoard([LOADS[0]!]);
    fireEvent.press(screen.getByLabelText("Quote for pool, 3 loads"));
    expect(onQuotePool.mock.calls[0][0].members).toHaveLength(3);
    screen.unmount();
    renderModal(jest.fn(), {
      poolLoads: LOADS,
      column: { ...(column as object), loads: [LOADS[0]!] } as never,
    });
    expect(screen.getByLabelText("Quote for pool, 3 loads")).toBeTruthy();
  });
});

function renderModal(
  onQuotePool = jest.fn(),
  extra: {
    /** null: caller passes no complete source (column loads only). */
    poolLoads?: IndentRow[] | null;
    initialOpenPoolId?: string | null;
    column?: never;
  } = {},
) {
  render(
    <LoadCenterKanbanColumnModal
      visible
      column={extra.column ?? column}
      poolLoads={extra.poolLoads === null ? undefined : (extra.poolLoads ?? LOADS)}
      initialOpenPoolId={extra.initialOpenPoolId ?? null}
      onClose={jest.fn()}
      renderCard={(load) => (
        <>
          <Pressable accessibilityLabel={`Card ${load.indent_number}`}>
            <Text>{load.indent_number}</Text>
          </Pressable>
          <Pressable accessibilityLabel={`Bid now ${load.indent_number}`} />
        </>
      )}
      renderPoolMemberCard={(load) => (
        <Pressable accessibilityLabel={`Card ${load.indent_number}`}>
          <Text>{load.indent_number}</Text>
        </Pressable>
      )}
      onQuotePool={onQuotePool}
      canQuotePools
    />,
  );
  return onQuotePool;
}

describe("Network Loads as pools", () => {
  it("lists one canonical pool per lane across shippers, including a pool of one", () => {
    renderModal();
    expect(
      screen.getByLabelText("Network pool, Pune to Mumbai, 32 Ft, 3 loads"),
    ).toBeTruthy();
    expect(
      screen.queryByLabelText("Network pool, Pune to Mumbai, 32 Ft, 1 load"),
    ).toBeNull();
    expect(
      screen.getByLabelText("Network pool, Delhi to Hyderabad, 24 Mt, 1 load"),
    ).toBeTruthy();
    expect(screen.getByText("3 LOADS")).toBeTruthy();
    expect(screen.queryByLabelText("Card IND-a")).toBeNull();
    expect(screen.getByTestId("network-incomplete-lane-notice")).toBeTruthy();
    expect(screen.getByLabelText("Card IND-e")).toBeTruthy();
    expect(screen.queryByLabelText("Bid now IND-e")).toBeNull();
  });

  it("opens a pool to show every shipper's indents on the lane", () => {
    renderModal();
    fireEvent.press(screen.getAllByLabelText("View 3 indents in this pool")[0]!);
    expect(screen.getByText("Indents in this pool")).toBeTruthy();
    for (const ref of ["IND-a", "IND-b", "IND-c"]) {
      expect(screen.getByLabelText(`Card ${ref}`)).toBeTruthy();
    }
    expect(screen.queryByLabelText("Card IND-d")).toBeNull();
    fireEvent.press(screen.getByLabelText("Back to all pools"));
    expect(screen.queryByText("Indents in this pool")).toBeNull();
  });

  it("an opened pool has no per-indent commercial action — only Quote for pool", () => {
    const onQuotePool = renderModal();
    fireEvent.press(screen.getAllByLabelText("View 3 indents in this pool")[0]!);
    expect(screen.queryByLabelText(/^Bid now/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.press(screen.getByLabelText("Quote for pool, 3 loads"));
    expect(onQuotePool.mock.calls[0][0].members.map((m: IndentRow) => m.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  describe("opened pool stays anonymous down to the member indent cards", () => {
    const shipperName = (load: IndentRow) =>
      String((load as { creator_organization_name?: string }).creator_organization_name);
    const onOpenMember = jest.fn();
    const realMemberCard = (anonymous: boolean) => (load: IndentRow) => (
      <LoadCenterHubMobileIndentCard
        indent={load}
        titleName={shipperName(load)}
        avatarPartyName={shipperName(load)}
        clientFaces={[
          { id: "x1", name: shipperName(load) },
          { id: "x2", name: "Other Client" },
        ]}
        statusLabel="open market"
        origin={String(load.pickup_area)}
        dest={String(load.drop_location)}
        pickupIso={load.pickup_date}
        leftFooterLabel={String(load.vehicle_type ?? "—")}
        rightFooterLabel="FTL"
        sourceTag="network"
        onPress={() => onOpenMember(load.id)}
        anonymous={anonymous}
      />
    );

    function openAcmePool(anonymous: boolean) {
      render(
        <LoadCenterKanbanColumnModal
          visible
          column={column}
          poolLoads={LOADS}
          onClose={jest.fn()}
          renderCard={() => null}
          renderPoolMemberCard={realMemberCard(anonymous)}
          onQuotePool={jest.fn()}
          canQuotePools
        />,
      );
      fireEvent.press(screen.getAllByLabelText("View 3 indents in this pool")[0]!);
    }

    it("shows no shipper/party name, avatar or client faces anywhere in the opened pool", () => {
      openAcmePool(true);
      expect(screen.getByText("Indents in this pool")).toBeTruthy();
      expect(screen.queryByText(/Acme Steel|Bolt Logistics|Other Client/)).toBeNull();
      expect(screen.queryByLabelText(/Acme Steel|Bolt Logistics|Other Client/)).toBeNull();
      expect(screen.queryByLabelText(/clients on this load/)).toBeNull();
      expect(
        screen.getAllByTestId("network-pool-member-mark", { includeHiddenElements: true }),
      ).toHaveLength(3);
    });

    it("keeps indent ID, route, vehicle, tonnage, pickup, status and details", () => {
      openAcmePool(true);
      expect(screen.getByText("IND-a")).toBeTruthy();
      expect(screen.getByText("IND-b")).toBeTruthy();
      expect(screen.getAllByText("PICKUP").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("DROP").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText(/^pune$/i).length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText(/^mumbai$/i).length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText(/^32 ft$/i).length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("12 t").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByLabelText("open market").length).toBeGreaterThanOrEqual(2);
      fireEvent.press(screen.getByLabelText("IND-a, Pune to Mumbai"));
      expect(onOpenMember).toHaveBeenCalledWith("a");
      expect(screen.queryByLabelText(/^Bid now/)).toBeNull();
    });

    it("offers Review to open the detail, with no Share and no View & bid", () => {
      onOpenMember.mockClear();
      openAcmePool(true);
      expect(screen.getAllByText("Review")).toHaveLength(3);
      fireEvent.press(screen.getByLabelText("Review IND-b"));
      expect(onOpenMember).toHaveBeenCalledWith("b");
      expect(screen.queryByText(/View & bid/)).toBeNull();
      expect(screen.queryByLabelText(/share/i)).toBeNull();
    });

    it("outside a pool the same card still shows the party (control)", () => {
      openAcmePool(false);
      expect(screen.getAllByText("Acme Steel").length).toBeGreaterThan(0);
      expect(
        screen.queryByTestId("network-pool-member-mark", { includeHiddenElements: true }),
      ).toBeNull();
    });
  });

  it("an incomplete-lane load in the column is review-only, with no individual Bid", () => {
    renderModal();
    expect(screen.getByLabelText("Card IND-e")).toBeTruthy();
    expect(screen.queryByLabelText("Bid now IND-e")).toBeNull();
  });

  it("other stages keep their own card actions (existing workflows)", () => {
    renderModal(jest.fn(), {
      column: { id: "QUOTED", label: "My Bids", accent: "#000", loads: [LOADS[0]!], pageSize: 15 } as never,
    });
    expect(screen.getByLabelText("Bid now IND-a")).toBeTruthy();
  });

  it("pool cards carry no party identity — only lane and load facts", () => {
    renderModal();
    expect(screen.queryByText(/Acme Steel|Bolt Logistics/)).toBeNull();
    expect(screen.queryByLabelText(/Acme Steel|Bolt Logistics/)).toBeNull();
    expect(screen.getAllByLabelText("Tonnage: 12 t")).toHaveLength(2);
    expect(screen.getAllByLabelText("Vehicle: 32 Ft")).toHaveLength(1);
  });

  it("pool cards show no mutual-connections facepile and never query it", () => {
    mockMutualsFor.mockClear();
    renderModal();
    expect(screen.queryByTestId("network-pool-mutuals")).toBeNull();
    expect(screen.queryByText(/mutual/i)).toBeNull();
    expect(mockMutualsFor).not.toHaveBeenCalled();
  });

  it("search-filtered column loads alone never form a pool that can be quoted", () => {
    const onQuotePool = renderModal(jest.fn(), {
      poolLoads: null,
      column: { ...(column as object), loads: [LOADS[0]!] } as never,
    });
    expect(screen.queryByLabelText(/^Network pool, /)).toBeNull();
    expect(screen.queryByLabelText(/^Quote for pool/)).toBeNull();
    expect(screen.queryByLabelText(/^Bid now/)).toBeNull();
    expect(onQuotePool).not.toHaveBeenCalled();
  });

  it("a filtered column with the complete source quotes the whole pool, never a slice", () => {
    const onQuotePool = renderModal(jest.fn(), {
      column: { ...(column as object), loads: [LOADS[1]!] } as never,
    });
    expect(screen.queryByLabelText(/^Quote for pool, 1 load$/)).toBeNull();
    fireEvent.press(screen.getByLabelText("Quote for pool, 3 loads"));
    expect(onQuotePool.mock.calls[0][0].members.map((m: IndentRow) => m.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("quotes the whole pool from the list", () => {
    const onQuotePool = renderModal();
    fireEvent.press(screen.getByLabelText("Quote for pool, 3 loads"));
    expect(onQuotePool).toHaveBeenCalledTimes(1);
    expect(onQuotePool.mock.calls[0][0].members.map((m: IndentRow) => m.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("NetworkPoolQuoteModal", () => {
  const pool = buildNetworkLoadPools(LOADS).pools[0]!;
  const memberIds = pool.members.map((m) => m.id);

  function manifest(over: Partial<Record<string, unknown>> = {}) {
    return {
      pool_key: pool.id,
      viewing_organization_id: "me",
      as_of: "2026-10-07T00:00:00Z",
      max_members: 150,
      member_count: memberIds.length,
      shipper_count: 2,
      excluded_sponsored_count: 0,
      complete: true,
      fingerprint: "fp-1",
      members: pool.members,
      quotable_ids: memberIds,
      org_quotes: [],
      ...over,
    };
  }

  let queryClient: QueryClient;
  const baseProps = () => ({
    pool,
    orgId: "me",
    onClose: jest.fn(),
    onSuccess: jest.fn(),
    queryClient,
    invalidateIndents: jest.fn() as never,
    refetchMyQuotes: jest.fn(),
    refetchMarketIndents: jest.fn(),
  });

  async function renderQuoteModal() {
    render(
      <QueryClientProvider client={queryClient}>
        <NetworkPoolQuoteModal {...baseProps()} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.queryByText("Preparing pool…")).toBeNull());
  }

  async function submit(amount = 18000) {
    let ok = false;
    await act(async () => {
      ok = await lastEntry!.onSubmitAmount(amount);
    });
    return ok;
  }

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockSubmitNetworkQuote.mockReset();
    mockGetOrgNetworkPool.mockReset();
    mockGetOrgNetworkPool.mockResolvedValue({ error: null, pool: manifest() });
    lastEntry = null;
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("shows what the rate applies to, without naming the shipper", async () => {
    await renderQuoteModal();
    expect(screen.getByText("Network pool")).toBeTruthy();
    expect(screen.queryByText(/Acme Steel/)).toBeNull();
    expect(screen.queryByText(/Bolt Logistics/)).toBeNull();
    expect(screen.getByText("Applies to all 3 loads in this pool")).toBeTruthy();
    expect(
      screen.getByText(/Each shipper reviews, counters and awards its own load/),
    ).toBeTruthy();
    expect(lastEntry?.submitLabel).toBe("Quote for pool");
    expect(lastEntry?.initialAmount ?? null).toBeNull();
    expect(lastEntry?.isUpdate).toBeFalsy();
  });

  it("a first-time quote does not prefill an amount", async () => {
    await renderQuoteModal();
    expect(lastEntry?.initialAmount ?? null).toBeNull();
    expect(lastEntry?.isUpdate).toBeFalsy();
    expect(lastEntry?.submitLabel).toBe("Quote for pool");
  });

  it("prefills the existing pool bid when revising", async () => {
    mockGetOrgNetworkPool.mockResolvedValue({
      error: null,
      pool: manifest({
        org_quotes: memberIds.map((id) => ({
          id: `q-${id}`,
          indent_id: id,
          status: "pending",
          amount: 56000,
          counter_amount: null,
          quotable: true,
          updated_at: "2026-10-07T00:00:00Z",
        })),
      }),
    });
    await renderQuoteModal();
    expect(lastEntry?.initialAmount).toBe(56000);
    expect(lastEntry?.isUpdate).toBe(true);
    expect(lastEntry?.submitLabel).toBe("Revise bid");
  });

  it("prefills from the My Bids card rate before the manifest returns quotes", async () => {
    const bidPool = { ...pool, rateMin: 56000, rateMax: 56000 };
    render(
      <QueryClientProvider client={queryClient}>
        <NetworkPoolQuoteModal {...baseProps()} pool={bidPool} />
      </QueryClientProvider>,
    );
    expect(lastEntry?.initialAmount).toBe(56000);
    expect(lastEntry?.isUpdate).toBe(true);
    await waitFor(() => expect(screen.queryByText("Preparing pool…")).toBeNull());
    expect(lastEntry?.initialAmount).toBe(56000);
  });

  it("reads the pool from the server by its lane key", async () => {
    await renderQuoteModal();
    expect(mockGetOrgNetworkPool).toHaveBeenCalledWith("me", pool.key);
  });

  it("quotes every server-quotable member through submit_network_quote, sequentially, at the same rate", async () => {
    mockSubmitNetworkQuote.mockResolvedValue({ error: null, quote: null });
    await renderQuoteModal();
    expect(await submit()).toBe(true);
    expect(mockSubmitNetworkQuote.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([
      ["a", "me", 18000],
      ["b", "me", 18000],
      ["c", "me", 18000],
    ]);
  });

  it("skips members the server does not list as quotable (countered or decided)", async () => {
    mockGetOrgNetworkPool.mockResolvedValue({
      error: null,
      pool: manifest({ quotable_ids: ["a", "c"] }),
    });
    mockSubmitNetworkQuote.mockResolvedValue({ error: null, quote: null });
    await renderQuoteModal();
    expect(screen.getByText("Applies to all 2 loads in this pool")).toBeTruthy();
    expect(await submit()).toBe(true);
    expect(mockSubmitNetworkQuote.mock.calls.map((c) => c[0])).toEqual(["a", "c"]);
  });

  it("submits nothing when the pool changed since it was shown", async () => {
    await renderQuoteModal();
    mockGetOrgNetworkPool.mockResolvedValue({
      error: null,
      pool: manifest({ fingerprint: "fp-2" }),
    });
    expect(await submit()).toBe(false);
    expect(mockSubmitNetworkQuote).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "This pool changed while you were quoting. Nothing was submitted — review the updated pool and submit again.",
      ),
    ).toBeTruthy();
  });

  it("submits nothing when the pool is larger than Network can process", async () => {
    mockGetOrgNetworkPool.mockResolvedValue({
      error: null,
      pool: manifest({ complete: false, fingerprint: null, members: [], quotable_ids: [] }),
    });
    await renderQuoteModal();
    expect(
      screen.getAllByText(
        "This pool contains more loads than Network can currently process. Nothing was submitted.",
      ).length,
    ).toBeGreaterThan(0);
    expect(await submit()).toBe(false);
    expect(mockSubmitNetworkQuote).not.toHaveBeenCalled();
  });

  it("submits nothing when the pool cannot be re-read", async () => {
    await renderQuoteModal();
    mockGetOrgNetworkPool.mockResolvedValue({ error: new Error("boom"), pool: null });
    expect(await submit()).toBe(false);
    expect(mockSubmitNetworkQuote).not.toHaveBeenCalled();
    expect(
      screen.getByText("Couldn't load this pool. Nothing was submitted — try again."),
    ).toBeTruthy();
  });

  it("explains a quote that was countered or decided meanwhile", async () => {
    mockSubmitNetworkQuote
      .mockResolvedValueOnce({ error: null, quote: null })
      .mockResolvedValueOnce({ error: null, quote: null })
      .mockResolvedValueOnce({
        error: new Error("quote_locked: quote has been countered or decided"),
        quote: null,
      });
    await renderQuoteModal();
    expect(await submit()).toBe(false);
    expect(screen.getByText(/^Quoted 2 of 3 loads\. 1 load could not be quoted/)).toBeTruthy();
    expect(screen.queryByText(/quote_locked/)).toBeNull();
  });

  it("cross-shipper isolation: each quote targets only its own indent, never the pool", async () => {
    mockSubmitNetworkQuote.mockResolvedValue({ error: null, quote: null });
    await renderQuoteModal();
    await submit();
    const byShipper = new Map<string, string[]>();
    for (const call of mockSubmitNetworkQuote.mock.calls) {
      const indentId = call[0] as string;
      const owner = LOADS.find((l) => l.id === indentId)!.organization_id as string;
      byShipper.set(owner, [...(byShipper.get(owner) ?? []), indentId]);
      expect(JSON.stringify(call)).not.toContain(pool.id);
      expect(JSON.stringify(call)).not.toMatch(/"(acme|bolt)"/);
    }
    expect(Object.fromEntries(byShipper)).toEqual({ acme: ["a", "b"], bolt: ["c"] });
  });

  it("a failure on one shipper's indent does not undo the other shipper's quotes", async () => {
    mockSubmitNetworkQuote
      .mockResolvedValueOnce({ error: null, quote: null })
      .mockResolvedValueOnce({ error: null, quote: null })
      .mockResolvedValueOnce({ error: new Error("indent_not_open"), quote: null });
    await renderQuoteModal();
    expect(await submit()).toBe(false);
    expect(mockSubmitNetworkQuote).toHaveBeenCalledTimes(3);
    expect(
      screen.getByText(
        "Quoted 2 of 3 loads. 1 load could not be quoted because the indent is no longer open.",
      ),
    ).toBeTruthy();
  });

  it("keeps an unknown backend reason as-is", async () => {
    mockSubmitNetworkQuote
      .mockResolvedValueOnce({ error: null, quote: null })
      .mockResolvedValueOnce({ error: null, quote: null })
      .mockResolvedValueOnce({ error: new Error("permission denied for table direct_quotes"), quote: null });
    await renderQuoteModal();
    await submit();
    expect(
      screen.getByText(
        "Quoted 2 of 3 loads. 1 load could not be quoted: permission denied for table direct_quotes",
      ),
    ).toBeTruthy();
  });

  it("reports zero success without claiming a pool quote", async () => {
    mockSubmitNetworkQuote.mockResolvedValue({ error: new Error("indent_not_open"), quote: null });
    await renderQuoteModal();
    expect(await submit()).toBe(false);
    expect(
      screen.getByText(
        "Not quoted: none of the 3 loads took your rate. 3 loads could not be quoted because the indent is no longer open.",
      ),
    ).toBeTruthy();
  });
});
