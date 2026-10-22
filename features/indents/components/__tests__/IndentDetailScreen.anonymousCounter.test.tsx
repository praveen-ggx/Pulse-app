import type { IndentRow } from "@/features/indents/services/indents.service";
import { IndentDetailScreen } from "@/features/indents/components/IndentDetailScreen";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

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

let mockMyQuotes: Array<Record<string, unknown>> = [];
const mockRefetchMyQuotes = jest.fn(async () => ({}));
const mockSetQueryData = jest.fn();
const mockInvalidateQueries = jest.fn();

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
  useMyDirectQuotesQuery: () => ({ data: mockMyQuotes, refetch: mockRefetchMyQuotes }),
}));
jest.mock("@/lib/queries/usePostsQuery", () => ({
  useInvalidatePosts: () => jest.fn(),
  useIndentStoryStatesQuery: () => ({ data: {} }),
}));
jest.mock("@tanstack/react-query", () => {
  // One client for every render, like the real QueryClientProvider; a new object
  // per render re-fires effects that depend on the client.
  const mockClient = {
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
    setQueryData: (...args: unknown[]) => mockSetQueryData(...args),
    getQueryData: () => undefined,
  };
  return {
    useQuery: () => ({ data: null }),
    useQueryClient: () => mockClient,
  };
});
jest.mock("@/features/indents/services/indents.service", () => ({
  getVisibleIndentById: jest.fn(async () => ({ indent: { ...INDENT }, error: null })),
  getIndentDisplayNumber: (row: { indent_number?: string }) => row.indent_number ?? "",
  cancelIndent: jest.fn(),
  shareDraftIndent: jest.fn(),
  updateIndent: jest.fn(),
}));
const mockAcceptCounter = jest.fn();
jest.mock("@/features/indents/services/direct-quotes.service", () => ({
  acceptDirectQuoteCounter: (...args: unknown[]) => mockAcceptCounter(...args),
  createDirectQuote: jest.fn(),
  submitDirectQuoteCounterOffer: jest.fn(),
  updateDirectQuoteStatus: jest.fn(),
}));
const mockSubmitNetworkQuote = jest.fn();
jest.mock("@/features/network/services/networkPools.service", () => ({
  submitNetworkQuote: (...args: unknown[]) => mockSubmitNetworkQuote(...args),
}));
jest.mock("@/features/indents/initialIndentForDetail", () => ({
  getInitialIndentForDetail: () => ({ ...INDENT }),
  clearInitialIndentForDetail: jest.fn(),
  setInitialIndentForDetail: jest.fn(),
}));
jest.mock("@/features/indents/hooks/useIndentClientEntityAvatar", () => ({
  useIndentClientEntityAvatar: () => ({
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
  }),
}));
type MockEntryProps = {
  visible: boolean;
  onSubmitAmount: (amount: number) => Promise<boolean>;
  validationError?: string;
};
const mockBidEntryProps: MockEntryProps[] = [];
jest.mock("@/features/indents/components/bidding/IndentBidAmountEntry", () => ({
  IndentBidAmountEntry: (props: MockEntryProps) => {
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

const IDENTITY = /Acme|Ravi Kumar|98400|acme\.png/;
const LAYOUTS = [
  { name: "phone (stacked)", dims: { width: 390, height: 844, scale: 2, fontScale: 1 } },
  { name: "desktop (split)", dims: { width: 1280, height: 900, scale: 1, fontScale: 1 } },
];
const ACCEPT = /^accept ₹ ?20,500$/i;
const EDIT_ACTION = /update bid|bid now|submit bid/i;

function myQuote(over: Record<string, unknown> = {}) {
  return {
    id: "q-1",
    indent_id: "ind-77",
    bidder_organization_id: "viewer-org",
    amount: 19500,
    counter_amount: 20500,
    status: "pending",
    ...over,
  };
}

async function renderDetail(anonymous = true) {
  render(<IndentDetailScreen indentId="ind-77" onBack={jest.fn()} anonymous={anonymous} />);
  await act(async () => {});
}

const lastEntry = () => mockBidEntryProps[mockBidEntryProps.length - 1]!;

beforeEach(() => {
  mockAcceptCounter.mockReset();
  mockAcceptCounter.mockResolvedValue({ error: null });
  mockSubmitNetworkQuote.mockReset();
  mockRefetchMyQuotes.mockClear();
  mockSetQueryData.mockClear();
  mockInvalidateQueries.mockClear();
  mockBidEntryProps.length = 0;
});

describe.each(LAYOUTS)("pooled bid member detail — $name", ({ dims }) => {
  beforeEach(() => {
    mockDims = dims;
  });

  it("a shipper's counter on this load can be accepted, still anonymously", async () => {
    mockMyQuotes = [myQuote()];
    await renderDetail();
    expect(screen.queryByText(IDENTITY)).toBeNull();
    expect(screen.queryByLabelText(IDENTITY)).toBeNull();
    expect(screen.queryByText(EDIT_ACTION)).toBeNull();
    const accept = screen.getAllByText(ACCEPT);
    expect(accept.length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.press(accept[0]!);
    });
    expect(mockAcceptCounter).toHaveBeenCalledWith("q-1", 20500);
    expect(mockSubmitNetworkQuote).not.toHaveBeenCalled();
    expect(mockBidEntryProps.every((p) => !p.visible)).toBe(true);
  });

  it("after accepting, the status updates at once and the quotes cache is patched and refetched", async () => {
    mockMyQuotes = [myQuote()];
    await renderDetail();
    await act(async () => {
      fireEvent.press(screen.getAllByText(ACCEPT)[0]!);
    });
    expect(screen.queryByText(ACCEPT)).toBeNull();
    expect(screen.queryByText(/^accept/i)).toBeNull();
    expect(screen.queryByText(EDIT_ACTION)).toBeNull();
    if (dims.width >= 1024) expect(screen.getByText("COUNTER ACCEPTED")).toBeTruthy();

    const [key, updater] = mockSetQueryData.mock.calls[0]!;
    expect(key).toEqual(expect.arrayContaining(["my-direct-quotes"]));
    expect(updater([myQuote(), myQuote({ id: "q-2", amount: 1 })])).toEqual([
      expect.objectContaining({ id: "q-1", amount: 20500, counter_amount: 20500, status: "pending" }),
      expect.objectContaining({ id: "q-2", amount: 1 }),
    ]);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: key });
    expect(mockRefetchMyQuotes).toHaveBeenCalled();
  });

  it("an already accepted counter (amount = counter, still pending) offers nothing more", async () => {
    mockMyQuotes = [myQuote({ amount: 20500 })];
    await renderDetail();
    expect(screen.queryByText(/^accept/i)).toBeNull();
    expect(screen.queryByText(EDIT_ACTION)).toBeNull();
    if (dims.width >= 1024) expect(screen.getByText("COUNTER ACCEPTED")).toBeTruthy();
  });

  it("a failed accept is reported even though the amount sheet is closed", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockAcceptCounter.mockResolvedValue({ error: new Error("quote_locked: no longer open") });
    mockMyQuotes = [myQuote()];
    await renderDetail();
    await act(async () => {
      fireEvent.press(screen.getAllByText(ACCEPT)[0]!);
    });
    expect(alertSpy).toHaveBeenCalledWith("Could not accept counter", expect.any(String));
    expect(mockRefetchMyQuotes).toHaveBeenCalled();
    expect(screen.getAllByText(ACCEPT).length).toBeGreaterThan(0);
    alertSpy.mockRestore();
  });

  it("an uncountered pooled quote offers no individual action", async () => {
    mockMyQuotes = [myQuote({ counter_amount: null })];
    await renderDetail();
    expect(screen.queryByText(/^accept/i)).toBeNull();
    expect(screen.queryByText(EDIT_ACTION)).toBeNull();
  });
});

describe.each(LAYOUTS)("identified bidder detail with a counter — $name", ({ dims }) => {
  beforeEach(() => {
    mockDims = dims;
  });

  it("offers Accept, never Update bid, and accepts through acceptDirectQuoteCounter", async () => {
    mockMyQuotes = [myQuote()];
    await renderDetail(false);
    expect(screen.queryByText(/update bid/i)).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getAllByText(ACCEPT)[0]!);
    });
    expect(mockAcceptCounter).toHaveBeenCalledWith("q-1", 20500);
    expect(mockSubmitNetworkQuote).not.toHaveBeenCalled();
  });

  it("any other amount from the entry sheet is blocked before a write", async () => {
    mockMyQuotes = [myQuote()];
    await renderDetail(false);
    let ok: boolean | undefined;
    await act(async () => {
      ok = await lastEntry().onSubmitAmount(19000);
    });
    expect(ok).toBe(false);
    expect(mockAcceptCounter).not.toHaveBeenCalled();
    expect(mockSubmitNetworkQuote).not.toHaveBeenCalled();
    expect(lastEntry().validationError).toMatch(/countered at ₹ ?20,500/);
  });

  it("uncountered quotes still update through submit_network_quote", async () => {
    mockSubmitNetworkQuote.mockResolvedValue({ error: null });
    mockMyQuotes = [myQuote({ counter_amount: null })];
    await renderDetail(false);
    await act(async () => {
      await lastEntry().onSubmitAmount(21000);
    });
    expect(mockSubmitNetworkQuote).toHaveBeenCalledWith("ind-77", "viewer-org", 21000);
    expect(mockAcceptCounter).not.toHaveBeenCalled();
  });
});
