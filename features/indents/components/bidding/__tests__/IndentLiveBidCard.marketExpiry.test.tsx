import { render, screen } from "@testing-library/react-native";
import { IndentLiveBidCard } from "@/features/indents/components/bidding/IndentLiveBidCard";
import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@/components/EntityAvatar", () => ({ EntityAvatar: () => null }));

const EXPIRES = new Date(2026, 10, 18, 10, 30).toISOString();

const quote = (status: string): DirectQuoteRow => ({
  id: "mb-1",
  indent_id: "ind-1",
  bidder_organization_id: "",
  bidder_organization_name: "Pilot",
  amount: 32000,
  notes: null,
  status,
  created_at: new Date(2026, 10, 16, 10, 30).toISOString(),
  updated_at: new Date(2026, 10, 16, 10, 30).toISOString(),
  offer_source: "market_bid",
  expires_at: EXPIRES,
});

describe("IndentLiveBidCard with a Market bid's own expiry", () => {
  it("shows a pending bid as valid until its expiry", () => {
    render(<IndentLiveBidCard quote={quote("pending")} />);
    expect(screen.getByText("Valid until 18 Nov, 10:30 AM")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
  });

  it("shows an expired bid as Bid expired, never Pending", () => {
    render(<IndentLiveBidCard quote={quote("expired")} />);
    expect(screen.getByText("Bid expired")).toBeTruthy();
    expect(screen.queryByText("Pending")).toBeNull();
    expect(screen.queryByText(/Valid until/)).toBeNull();
  });

  it("keeps an accepted bid Awarded with no expiry line", () => {
    render(<IndentLiveBidCard quote={quote("accepted")} />);
    expect(screen.getByText("Awarded")).toBeTruthy();
    expect(screen.queryByText(/Valid until|Bid expired/)).toBeNull();
  });
});
