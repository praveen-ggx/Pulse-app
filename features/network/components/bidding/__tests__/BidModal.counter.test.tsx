import type { DirectQuoteRow, IndentRow } from "@/features/indents";
import { BidModal } from "@/features/network/components/bidding/BidModal";
import { act, render } from "@testing-library/react-native";

type MockEntryProps = {
  initialAmount: number | null;
  onSubmitAmount: (amount: number) => Promise<boolean>;
  validationError?: string;
  ownerName?: string;
};
const mockEntryProps: MockEntryProps[] = [];
jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@/features/indents/components/bidding/IndentBidAmountEntry", () => ({
  IndentBidAmountEntry: (props: MockEntryProps) => {
    mockEntryProps.push(props);
    return null;
  },
}));
jest.mock("@/features/indents", () => ({
  getIndentDisplayNumber: (row: { indent_number?: string }) => row.indent_number ?? "",
}));
jest.mock("@/lib/queries", () => ({ useInvalidateIndents: jest.fn() }));
const mockAcceptCounter = jest.fn();
jest.mock("@/features/indents/services/direct-quotes.service", () => ({
  acceptDirectQuoteCounter: (...args: unknown[]) => mockAcceptCounter(...args),
}));
const mockSubmitNetworkQuote = jest.fn();
jest.mock("@/features/network/services/networkPools.service", () => ({
  submitNetworkQuote: (...args: unknown[]) => mockSubmitNetworkQuote(...args),
}));

const LOAD = {
  id: "ind-1",
  indent_number: "IND-1",
  pickup_area: "Origin",
  drop_location: "DestNet",
  vehicle_type: "20FT",
  supplier_target: 20000,
} as unknown as IndentRow;

function quote(over: Partial<DirectQuoteRow> = {}): DirectQuoteRow {
  return {
    id: "q-1",
    indent_id: "ind-1",
    bidder_organization_id: "me",
    amount: 19500,
    counter_amount: 20500,
    status: "pending",
    notes: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

const queryClient = { setQueryData: jest.fn(), invalidateQueries: jest.fn(async () => {}) };
const refetchMyQuotes = jest.fn();

function renderModal(existing: DirectQuoteRow | null) {
  render(
    <BidModal
      visible
      load={LOAD}
      orgId="me"
      myQuoteByIndentId={new Map(existing ? [[LOAD.id, existing]] : [])}
      onClose={jest.fn()}
      onSuccess={jest.fn()}
      localBidHistoryByIndentId={{}}
      onUpdateLocalBidHistory={jest.fn()}
      queryClient={queryClient as never}
      invalidateIndents={jest.fn() as never}
      refetchMyQuotes={refetchMyQuotes}
      refetchMarketIndents={jest.fn()}
      insets={{ top: 0, bottom: 0 }}
    />,
  );
}
const entry = () => mockEntryProps[mockEntryProps.length - 1]!;
async function submit(amount: number) {
  let ok: boolean | undefined;
  await act(async () => {
    ok = await entry().onSubmitAmount(amount);
  });
  return ok;
}

beforeEach(() => {
  mockEntryProps.length = 0;
  mockAcceptCounter.mockReset().mockResolvedValue({ error: null });
  mockSubmitNetworkQuote.mockReset().mockResolvedValue({ error: null });
  queryClient.setQueryData.mockClear();
  refetchMyQuotes.mockClear();
});

describe("Load Center Respond to counter", () => {
  it("prefills the counter and accepts it through acceptDirectQuoteCounter", async () => {
    renderModal(quote());
    expect(entry().initialAmount).toBe(20500);
    expect(await submit(20500)).toBe(true);
    expect(mockAcceptCounter).toHaveBeenCalledWith("q-1", 20500);
    expect(mockSubmitNetworkQuote).not.toHaveBeenCalled();
  });

  it("patches the cached quote so the card stops showing the counter at once", async () => {
    renderModal(quote());
    await submit(20500);
    const [key, updater] = queryClient.setQueryData.mock.calls[0]!;
    expect(key).toEqual(expect.arrayContaining(["my-direct-quotes"]));
    expect(updater([quote()])).toEqual([
      expect.objectContaining({ id: "q-1", amount: 20500, counter_amount: 20500 }),
    ]);
    expect(refetchMyQuotes).toHaveBeenCalled();
  });

  it("a different amount on a countered quote never reaches submit_network_quote", async () => {
    renderModal(quote());
    expect(await submit(19800)).toBe(false);
    expect(mockSubmitNetworkQuote).not.toHaveBeenCalled();
    expect(mockAcceptCounter).not.toHaveBeenCalled();
    expect(entry().validationError).toMatch(/countered at ₹ ?20,500/);
  });

  it("a counter that was already accepted blocks any further change", async () => {
    renderModal(quote({ amount: 20500 }));
    expect(await submit(20500)).toBe(false);
    expect(mockSubmitNetworkQuote).not.toHaveBeenCalled();
    expect(mockAcceptCounter).not.toHaveBeenCalled();
  });

  it("a rejected accept refetches quotes so a changed counter shows up", async () => {
    mockAcceptCounter.mockResolvedValue({ error: new Error("quote_locked: no longer open") });
    renderModal(quote());
    expect(await submit(20500)).toBe(false);
    expect(refetchMyQuotes).toHaveBeenCalled();
    expect(queryClient.setQueryData).not.toHaveBeenCalled();
  });

  it("a pooled revise does not pass the shipper name", () => {
    render(
      <BidModal
        visible
        anonymous
        load={{
          ...LOAD,
          client_name: "SpaceXLogistics",
          creator_organization_name: "SpaceXLogistics",
        }}
        orgId="me"
        myQuoteByIndentId={new Map([[LOAD.id, quote({ counter_amount: null })]])}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        localBidHistoryByIndentId={{}}
        onUpdateLocalBidHistory={jest.fn()}
        queryClient={queryClient as never}
        invalidateIndents={jest.fn() as never}
        refetchMyQuotes={refetchMyQuotes}
        refetchMarketIndents={jest.fn()}
        insets={{ top: 0, bottom: 0 }}
      />,
    );
    expect(entry().ownerName).toBeUndefined();
    expect(entry().initialAmount).toBe(19500);
  });

  it("an identified bid still names the shipper", () => {
    render(
      <BidModal
        visible
        load={{ ...LOAD, client_name: "SpaceXLogistics" }}
        orgId="me"
        myQuoteByIndentId={new Map()}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        localBidHistoryByIndentId={{}}
        onUpdateLocalBidHistory={jest.fn()}
        queryClient={queryClient as never}
        invalidateIndents={jest.fn() as never}
        refetchMyQuotes={refetchMyQuotes}
        refetchMarketIndents={jest.fn()}
        insets={{ top: 0, bottom: 0 }}
      />,
    );
    expect(entry().ownerName).toBe("SpaceXLogistics");
  });

  it("uncountered and new bids still use submit_network_quote", async () => {
    renderModal(quote({ counter_amount: null }));
    expect(entry().initialAmount).toBe(19500);
    await submit(21000);
    expect(mockSubmitNetworkQuote).toHaveBeenCalledWith("ind-1", "me", 21000);
    mockEntryProps.length = 0;
    mockSubmitNetworkQuote.mockClear();
    renderModal(null);
    await submit(21000);
    expect(mockSubmitNetworkQuote).toHaveBeenCalledWith("ind-1", "me", 21000);
    expect(mockAcceptCounter).not.toHaveBeenCalled();
  });
});
