import { AwardModal } from "@/features/network/components/AwardModal";
import type { MarketBidForIndentRow } from "@/features/network/services/marketBids.service";
import { queryKeys } from "@/lib/queryKeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ComponentProps, ReactNode } from "react";

const mockAwardMarketBid = jest.fn();
const mockCreateTrip = jest.fn();
const mockShowAppAlert = jest.fn();
const mockConfirmDialog = jest.fn();
let mockMarketBids: MarketBidForIndentRow[] = [];

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("lucide-react-native", () => ({ X: () => null }));
jest.mock("@expo/vector-icons/FontAwesome", () => () => null);
jest.mock("@/components/EntityAvatar", () => ({ EntityAvatar: () => null }));
jest.mock("@/components/ResponsiveDrawer", () => ({
  ResponsiveDrawer: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? children : null,
}));
jest.mock("@/features/indents", () => ({ getIndentDisplayNumber: () => "IND-1" }));
jest.mock("@/features/indents/components/bidding/IndentCounterOfferEntry", () => ({
  IndentCounterOfferEntry: () => null,
}));
jest.mock("@/features/indents/components/bidding/IndentLiveBidsPanel", () => ({
  IndentLiveBidsPanel: () => null,
}));
jest.mock("@/features/network/components/laneOffers/LaneOffersSection", () => ({
  LaneOffersSection: () => null,
}));
jest.mock("@/features/network/hooks/useAwardQuote", () => ({}));
jest.mock("@/features/indents/services/direct-quotes.service", () => ({
  submitDirectQuoteCounterOffer: jest.fn(),
}));
jest.mock("@/features/network/services/bids.service", () => ({
  submitDriverDirectBidCounterOffer: jest.fn(),
}));
jest.mock("@/features/indents/services/indents.service", () => ({ updateIndent: jest.fn() }));
jest.mock("@/features/network/services/marketBids.service", () => ({
  awardMarketBid: (...args: unknown[]) => mockAwardMarketBid(...args),
  calculateMarketplacePlatformFee: jest.fn().mockResolvedValue({ calc: null }),
  createMarketTripAfterFeePayment: (...args: unknown[]) => mockCreateTrip(...args),
  rejectMarketBid: jest.fn(),
  refundTestMarketplaceFeeAndRevokeIndent: jest.fn(),
  revokeIndentAward: jest.fn(),
}));
jest.mock("@/lib/queries/useBidsQuery", () => ({
  useMarketBidsForIndentQuery: () => ({ data: mockMarketBids, isLoading: false }),
}));
jest.mock("@/lib/queries", () => ({ useInvalidateIndents: () => jest.fn() }));
jest.mock("@/lib/appAlert", () => ({
  showAppAlert: (...args: unknown[]) => mockShowAppAlert(...args),
}));
jest.mock("@/lib/confirmDialog", () => ({
  confirmDialog: (...args: unknown[]) => mockConfirmDialog(...args),
}));

const NOW = Date.now();

function marketBid(overrides: Partial<MarketBidForIndentRow> = {}): MarketBidForIndentRow {
  return {
    id: "mb-1",
    indent_id: "ind-1",
    bidder_type: "dco",
    bidder_user_id: "user-1",
    bidder_display_name: "Ravi",
    bidder_organization_id: null,
    bidder_organization_name: null,
    bidder_masked_phone: null,
    bidder_phone: null,
    is_fleet_owner: false,
    amount: 32000,
    note: null,
    status: "pending",
    fee_payment_status: "not_required",
    platform_fee_amount: null,
    created_at: new Date(NOW - 3_600_000).toISOString(),
    updated_at: new Date(NOW - 3_600_000).toISOString(),
    accepted_at: null,
    vehicle_number: null,
    vehicle_brand: null,
    vehicle_model: null,
    vehicle_body_type: null,
    vehicle_capacity: null,
    expires_at: new Date(NOW + 3_600_000).toISOString(),
    ...overrides,
  } as MarketBidForIndentRow;
}

type Award = ComponentProps<typeof AwardModal>["award"];

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(queryClient, "invalidateQueries");
  const award = {
    currentLoad: {
      id: "ind-1",
      organization_id: "org-shipper",
      status: "open",
      pickup_area: "Chennai",
      drop_location: "Nagpur",
      client_price: 40000,
      supplier_target: null,
      pickup_date: null,
      award_revoked_at: null,
    },
    selectedQuoteId: null,
    awarding: false,
    sortedQuotes: [],
    pendingCount: 0,
    lowestPendingAmount: null,
    quotesLoading: false,
    connectedSupplierOrgIds: new Set<string>(),
    selectedBidderNeedsInvite: false,
    selectedBidderInviteStatus: "idle",
    selectQuote: jest.fn(),
    close: jest.fn(),
    open: jest.fn(),
    award: jest.fn(),
    inviteSelectedBidder: jest.fn(),
  } as unknown as Award;
  render(
    <QueryClientProvider client={queryClient}>
      <AwardModal visible award={award} onViewIndent={jest.fn()} insets={{ top: 0, bottom: 0 }} />
    </QueryClientProvider>,
  );
  return { invalidate };
}

const marketForIndentRefresh = {
  queryKey: queryKeys.bids.marketForIndent("ind-1"),
};

describe("AwardModal Market bid expiry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfirmDialog.mockResolvedValue(true);
    mockMarketBids = [marketBid()];
  });

  it("refreshes and shows the expired state when the server refuses with bid_expired", async () => {
    mockAwardMarketBid.mockResolvedValue({
      error: { message: "bid_expired: bid mb-1 is no longer acceptable" },
      feePaymentStatus: null,
    });
    const { invalidate } = renderModal();
    expect(screen.getByText(/^Valid until /)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Accept this Market bid"));
    });

    await waitFor(() =>
      expect(mockShowAppAlert).toHaveBeenCalledWith(
        "Bid expired",
        "This bid has expired and can no longer be accepted.",
      ),
    );
    expect(mockShowAppAlert).not.toHaveBeenCalledWith("Could not accept bid", expect.anything());
    expect(invalidate).toHaveBeenCalledWith(marketForIndentRefresh);
    expect(mockCreateTrip).not.toHaveBeenCalled();
    expect(screen.getByText("Bid expired")).toBeTruthy();
    expect(screen.getByTestId("market-bid-accept-disabled")).toBeTruthy();
  });

  it("does not call the award RPC for a bid already past its expiry", async () => {
    mockMarketBids = [marketBid({ expires_at: new Date(NOW - 60_000).toISOString() })];
    renderModal();

    expect(screen.getByText("Bid expired")).toBeTruthy();
    expect(screen.queryByLabelText("Accept this Market bid")).toBeNull();
    fireEvent.press(screen.getByTestId("market-bid-accept-disabled"));
    expect(mockConfirmDialog).not.toHaveBeenCalled();
    expect(mockAwardMarketBid).not.toHaveBeenCalled();
  });

  it("accepts a valid bid through the existing award path", async () => {
    mockAwardMarketBid.mockResolvedValue({ error: null, feePaymentStatus: "not_required" });
    mockCreateTrip.mockResolvedValue({ error: null });
    const { invalidate } = renderModal();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Accept this Market bid"));
    });

    await waitFor(() =>
      expect(mockShowAppAlert).toHaveBeenCalledWith("Bid accepted", "Trip created from this Market bid."),
    );
    expect(mockConfirmDialog).toHaveBeenCalledTimes(1);
    expect(mockAwardMarketBid).toHaveBeenCalledWith("mb-1");
    expect(mockCreateTrip).toHaveBeenCalledWith("mb-1");
    expect(invalidate).toHaveBeenCalledWith(marketForIndentRefresh);
  });

  it("keeps an accepted bid shown as Accepted after its expiry", () => {
    mockMarketBids = [
      marketBid({
        status: "accepted",
        accepted_at: new Date(NOW - 7_200_000).toISOString(),
        expires_at: new Date(NOW - 3_600_000).toISOString(),
      }),
    ];
    renderModal();

    expect(screen.getByText("ACCEPTED")).toBeTruthy();
    expect(screen.queryByText("Bid expired")).toBeNull();
  });
});
