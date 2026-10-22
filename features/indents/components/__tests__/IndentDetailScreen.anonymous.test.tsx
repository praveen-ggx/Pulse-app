import type { IndentRow } from "@/features/indents/services/indents.service";
import { IndentDetailScreen } from "@/features/indents/components/IndentDetailScreen";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

let mockDims = { width: 390, height: 844, scale: 2, fontScale: 1 };
jest.mock("react-native", () => {
  const RN = jest.requireActual("react-native");
  return new Proxy(RN, {
    get: (target, prop) =>
      prop === "useWindowDimensions" ? () => mockDims : target[prop as keyof typeof target],
  });
});
jest.mock("@expo/vector-icons/FontAwesome", () => () => null);
jest.mock("expo-font", () => ({ isLoaded: () => true, loadAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

const INDENT = {
  id: "ind-77",
  indent_number: "IND-77",
  organization_id: "shipper-org",
  creator_organization_name: "Acme Steel Pvt Ltd",
  client_name: "Acme Steel",
  client_id: "client-acme",
  pickup_area: "Pune",
  drop_location: "Mumbai",
  vehicle_type: "32 FT",
  load_type: "Steel coils",
  weight: 12000,
  supplier_target: 20000,
  client_price: 26000,
  status: "open",
  circulation_target: "integrated_supplier",
  pickup_date: "2026-10-08",
  created_at: "2026-10-01T00:00:00Z",
} as unknown as IndentRow;

jest.mock("@/contexts/OrganizationContext", () => ({
  useOrganization: () => ({ currentOrganization: { id: "viewer-org" } }),
}));
jest.mock("@/lib/useCapabilities", () => ({ useCapabilities: () => [] }));
jest.mock("@/lib/useMemberAccess", () => ({ useMemberAccess: () => ({ can: () => true }) }));
jest.mock("@/lib/useLinkedOrgProfileMap", () => ({ useLinkedOrgProfileMap: () => new Map() }));
jest.mock("@/lib/queries", () => ({
  useClientsQuery: () => ({ data: [] }),
  useDriversQuery: () => ({ data: [] }),
  useSuppliersQuery: () => ({ data: [] }),
  useTripsQuery: () => ({ data: [] }),
  useVehiclesQuery: () => ({ data: [] }),
}));
jest.mock("@/lib/queries/useBidsQuery", () => ({
  useDriverDirectBidsForPostQuery: () => ({ data: [], isPending: false, isFetched: true }),
  useMarketBidsForIndentQuery: () => ({ data: [], isPending: false, isFetched: true }),
}));
jest.mock("@/lib/queries/useIndentsQuery", () => ({
  useIndentDirectQuotesQuery: () => ({
    data: [],
    refetch: jest.fn(),
    isPending: false,
    isFetched: true,
  }),
  useInvalidateIndents: () => jest.fn(),
  useMyDirectQuotesQuery: () => ({ data: [], refetch: jest.fn() }),
}));
jest.mock("@/lib/queries/usePostsQuery", () => ({
  useInvalidatePosts: () => jest.fn(),
  useIndentStoryStatesQuery: () => ({ data: {} }),
}));
jest.mock("@tanstack/react-query", () => {
  // One client for every render, like the real QueryClientProvider.
  const mockClient = { invalidateQueries: jest.fn(), getQueryData: () => undefined };
  return {
    useQuery: () => ({ data: null }),
    useQueryClient: () => mockClient,
  };
});
jest.mock("@/features/indents/services/indents.service", () => ({
  getVisibleIndentById: jest.fn(async () => ({ indent: mockIndent(), error: null })),
  getIndentDisplayNumber: (row: { indent_number?: string }) => row.indent_number ?? "",
  cancelIndent: jest.fn(),
  shareDraftIndent: jest.fn(),
  updateIndent: jest.fn(),
}));
jest.mock("@/features/indents/services/direct-quotes.service", () => ({
  createDirectQuote: jest.fn(),
  submitDirectQuoteCounterOffer: jest.fn(),
  updateDirectQuoteStatus: jest.fn(),
}));
jest.mock("@/features/indents/initialIndentForDetail", () => ({
  getInitialIndentForDetail: () => mockIndent(),
  clearInitialIndentForDetail: jest.fn(),
  setInitialIndentForDetail: jest.fn(),
}));

/** Party data the shipper avatar lookup would surface: contact line + profile link. */
const mockAvatarCalls: Array<{ enabled: boolean; shipperOrgId: unknown; clientId: unknown }> = [];
jest.mock("@/features/indents/hooks/useIndentClientEntityAvatar", () => ({
  useIndentClientEntityAvatar: (args: {
    enabled: boolean;
    shipperOrgId: unknown;
    clientId: unknown;
  }) => {
    mockAvatarCalls.push(args);
    return {
      fields: {
        avatarUrl: "https://cdn.example/acme.png",
        avatarSeed: "acme",
        organizationImageUrl: null,
        organizationAvatarSeed: null,
        detailLine: "Ravi Kumar · +91 98400 00000",
        isIntegrated: true,
      },
      canOpenPublicProfile: true,
      publicProfileClientId: null,
      publicProfileTarget: { type: "client", id: "shipper-org" },
    };
  },
}));

const mockBidEntryProps: Array<{ visible: boolean; ownerName?: string }> = [];
jest.mock("@/features/indents/components/bidding/IndentBidAmountEntry", () => ({
  IndentBidAmountEntry: (props: { visible: boolean; ownerName?: string }) => {
    mockBidEntryProps.push(props);
    return null;
  },
}));
jest.mock("@/features/indents/components/bidding/IndentCounterOfferEntry", () => ({
  IndentCounterOfferEntry: () => null,
}));
jest.mock("@/features/indents/components/bidding/IndentAwardCelebrationModal", () => ({
  IndentAwardCelebrationModal: () => null,
}));
jest.mock("@/features/network/components/ShareLoadSheet", () => ({ ShareLoadSheet: () => null }));
jest.mock("@/features/reach/components/BoostSheet", () => ({ BoostSheet: () => null }));
jest.mock("@/components/ThemedConfirmModal", () => ({ ThemedConfirmModal: () => null }));

function mockIndent(): IndentRow {
  return { ...INDENT };
}

const IDENTITY = /Acme|Ravi Kumar|98400|acme\.png/;
const LAYOUTS = [
  { name: "phone (stacked)", dims: { width: 390, height: 844, scale: 2, fontScale: 1 } },
  { name: "desktop (split)", dims: { width: 1280, height: 900, scale: 1, fontScale: 1 } },
];

async function renderDetail(anonymous: boolean) {
  render(<IndentDetailScreen indentId="ind-77" onBack={jest.fn()} anonymous={anonymous} />);
  await act(async () => {});
}

beforeEach(() => {
  mockAvatarCalls.length = 0;
  mockBidEntryProps.length = 0;
});

describe.each(LAYOUTS)("IndentDetailScreen from a Network pool — $name", ({ dims }) => {
  beforeEach(() => {
    mockDims = dims;
  });

  it("shows no shipper/party name, avatar, contact or profile link", async () => {
    await renderDetail(true);
    expect(screen.queryByText(IDENTITY)).toBeNull();
    expect(screen.queryByLabelText(IDENTITY)).toBeNull();
    expect(screen.queryByLabelText(/public profile|View details for/)).toBeNull();
    expect(screen.queryByText("Integrated")).toBeNull();
    // The party lookup never runs for an anonymous detail.
    expect(mockAvatarCalls.every((c) => !c.enabled && c.shipperOrgId == null && c.clientId == null)).toBe(
      true,
    );
  });

  it("exposes no individual Bid and no Share escape hatch", async () => {
    await renderDetail(true);
    expect(screen.queryByText(/bid now|submit bid|update bid|place your bid/i)).toBeNull();
    expect(screen.queryByLabelText(/submit bid|bid now/i)).toBeNull();
    expect(screen.queryByText(/share|whatsapp/i)).toBeNull();
    expect(screen.queryByLabelText(/share|whatsapp/i)).toBeNull();
    expect(mockBidEntryProps.every((p) => !p.visible && p.ownerName == null)).toBe(true);
  });

  it("keeps indent ID, route, vehicle, tonnage, material, pickup and status", async () => {
    await renderDetail(true);
    const more = screen.queryByLabelText("View more");
    if (more) fireEvent.press(more);
    expect(screen.getAllByText(/IND-77/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/pune/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/mumbai/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/32 FT/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/12000 KG/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Steel coils/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Oct 2026/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^(ACTIVE|Bidding open)$/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/participate/i)).toBeNull();
  });
});

describe("IndentDetailScreen outside a pool keeps its identity behavior", () => {
  it("desktop shows the shipper with avatar lookup and the individual Bid", async () => {
    mockDims = LAYOUTS[1]!.dims;
    await renderDetail(false);
    expect(screen.getAllByText(/Acme Steel/).length).toBeGreaterThan(0);
    expect(screen.getByText("Ravi Kumar · +91 98400 00000")).toBeTruthy();
    expect(mockAvatarCalls.some((c) => c.enabled && c.shipperOrgId === "shipper-org")).toBe(true);
    expect(screen.queryByTestId("indent-detail-anonymous-shipper")).toBeNull();
    expect(screen.getAllByText(/bid now|submit bid|place your bid/i).length).toBeGreaterThan(0);
  });

  it("phone keeps the individual Bid and the My bid header", async () => {
    mockDims = LAYOUTS[0]!.dims;
    await renderDetail(false);
    expect(screen.getAllByText(/bid now|submit bid|place your bid/i).length).toBeGreaterThan(0);
    expect(screen.getByText("My bid")).toBeTruthy();
  });

  it("phone keeps the read-only Your bid · Not submitted row", async () => {
    mockDims = LAYOUTS[0]!.dims;
    await renderDetail(false);
    fireEvent.press(screen.getByLabelText("View more"));
    expect(screen.getByText("Your bid")).toBeTruthy();
    expect(screen.getByText("Not submitted")).toBeTruthy();
    expect(screen.queryByText("Pool quote")).toBeNull();
  });
});

describe("IndentDetailScreen phone rate row in pool context", () => {
  it("reads Pool quote · Not submitted, read-only, with no Your bid wording", async () => {
    mockDims = LAYOUTS[0]!.dims;
    await renderDetail(true);
    fireEvent.press(screen.getByLabelText("View more"));
    const label = screen.getByText("Pool quote");
    expect(screen.getByText("Not submitted")).toBeTruthy();
    expect(screen.queryByText("Your bid")).toBeNull();
    let node: { props: Record<string, unknown>; parent: unknown } | null =
      label as unknown as { props: Record<string, unknown>; parent: unknown };
    while (node) {
      expect(node.props.onPress).toBeUndefined();
      node = node.parent as typeof node;
    }
  });

  it("desktop keeps the bid recommendation outside a pool", async () => {
    mockDims = LAYOUTS[1]!.dims;
    await renderDetail(false);
    expect(screen.getByText("Submit a bid to participate in this load")).toBeTruthy();
  });
});
