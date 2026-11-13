import { render, screen } from "@testing-library/react-native";
import type { MyNetworkQuoteRow } from "@/features/network/services/laneOffers.service";
import { NetworkMyQuotesList } from "@/features/network/components/laneOffers/NetworkMyQuotesList";

jest.mock("react-native", () => jest.requireActual("react-native"));

let mockQuotes: MyNetworkQuoteRow[] = [];
jest.mock("@/lib/queries/useLaneOffersQuery", () => ({
  useMyNetworkQuotesQuery: () => ({ data: mockQuotes, isLoading: false }),
}));

const quote = (p: Partial<MyNetworkQuoteRow>): MyNetworkQuoteRow => ({
  id: "q1",
  indent_id: "ind-1",
  amount: 30000,
  status: "pending",
  notes: "Accepted rate request",
  created_at: "2026-11-13T00:00:00Z",
  indent_number: "SAT812GOGIND003892",
  pickup_area: "Periya",
  drop_location: "Coimbatore",
  indent_status: "quoted",
  ...p,
});

describe("NetworkMyQuotesList", () => {
  it("shows a pending network quote and does not call it awarded", () => {
    mockQuotes = [quote({})];
    render(<NetworkMyQuotesList />);
    expect(screen.getByText("Periya → Coimbatore")).toBeTruthy();
    expect(screen.getByText("Network · SAT812GOGIND003892")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.queryByText("Awarded")).toBeNull();
    expect(screen.getByText(/does not award the load/)).toBeTruthy();
  });

  it("labels an accepted quote as awarded only after the shipper accepts it", () => {
    mockQuotes = [quote({ status: "accepted" })];
    render(<NetworkMyQuotesList />);
    expect(screen.getByText("Awarded")).toBeTruthy();
    expect(screen.queryByText("Pending")).toBeNull();
  });
});
