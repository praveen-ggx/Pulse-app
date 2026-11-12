import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { LaneBidInvite } from "@/features/network/services/laneOffers.service";
import { LaneBidInvitesCard } from "@/features/network/components/laneOffers/LaneBidInvitesCard";

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@/components/LoadingIndicator", () => ({ LoadingIndicator: () => null }));

const mockRespond = jest.fn();
jest.mock("@/features/network/services/laneOffers.service", () => ({
  respondLaneBidInvite: (id: string, accept: boolean) => mockRespond(id, accept),
}));
const mockAlert = jest.fn();
jest.mock("@/lib/appAlert", () => ({
  showAppAlert: (...args: unknown[]) => mockAlert(...args),
}));
jest.mock("@/lib/confirmDialog", () => ({ confirmDialog: async () => true }));

let mockInvites: LaneBidInvite[] = [];
jest.mock("@/lib/queries/useLaneOffersQuery", () => ({
  useInvalidateLaneOffers: () => jest.fn(),
  useMyLaneBidInvitesQuery: () => ({
    data: { pages: [{ total_count: mockInvites.length, items: mockInvites }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
  }),
}));

const invite = (p: Partial<LaneBidInvite>): LaneBidInvite => ({
  invite_id: "inv-1",
  indent_id: "ind-1",
  indent_number: null,
  pickup_area: "Periya",
  drop_location: "Coimbatore",
  vehicle_type: "32FT",
  pickup_date: null,
  channel: "marketplace",
  bidder_type: "organization",
  bidder_organization_id: "b2",
  amount: 32000,
  shipper_name: null,
  created_at: "2026-11-12T00:00:00Z",
  ...p,
});

beforeEach(() => {
  mockRespond.mockReset();
  mockAlert.mockReset();
});

describe("LaneBidInvitesCard", () => {
  it("Marketplace invite: shows the lane and rate, never the shipper or load code", () => {
    // A row that wrongly carries identity must still not render it.
    mockInvites = [invite({ shipper_name: "Shipper One", indent_number: "SAT812GOGIND003892" })];
    render(<LaneBidInvitesCard />);
    expect(screen.getByText("Periya → Coimbatore")).toBeTruthy();
    expect(screen.getByText("32FT · Marketplace load")).toBeTruthy();
    expect(screen.queryByText(/Shipper One/)).toBeNull();
    expect(screen.queryByText(/SAT812GOGIND003892/)).toBeNull();
  });

  it("Network invite: shows the shipper and load code", () => {
    mockInvites = [
      invite({ channel: "network", shipper_name: "Shipper One", indent_number: "SAT812GOGIND003892" }),
    ];
    render(<LaneBidInvitesCard />);
    expect(screen.getByText("32FT · Shipper One · SAT812GOGIND003892")).toBeTruthy();
  });

  it("accept that hits an existing offer tells the carrier it was kept, not that a bid was placed", async () => {
    mockInvites = [invite({})];
    const onResponded = jest.fn();
    mockRespond.mockResolvedValue({
      error: null,
      result: { invite_id: "inv-1", status: "superseded", reason: "already_offered" },
    });
    render(<LaneBidInvitesCard onResponded={onResponded} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Bid .*32,000 on Periya/));
    });
    expect(mockRespond).toHaveBeenCalledWith("inv-1", true);
    expect(mockAlert).toHaveBeenCalledWith("Already offered", expect.stringContaining("kept unchanged"), undefined);
    expect(onResponded).not.toHaveBeenCalled();
  });

  it("fresh accept reports the placed bid", async () => {
    mockInvites = [invite({})];
    const onResponded = jest.fn();
    mockRespond.mockResolvedValue({ error: null, result: { invite_id: "inv-1", status: "accepted" } });
    render(<LaneBidInvitesCard onResponded={onResponded} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Bid .*32,000 on Periya/));
    });
    expect(mockAlert).toHaveBeenCalledWith("Bid placed", expect.any(String), { tone: "success" });
    expect(onResponded).toHaveBeenCalledTimes(1);
  });
});
