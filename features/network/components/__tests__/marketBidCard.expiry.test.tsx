import { MarketBidCard } from "@/features/network/components/MarketBidCard";
import type { MarketBidForIndentRow } from "@/features/network/services/marketBids.service";
import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("react-native", () => jest.requireActual("react-native"));

const EXPIRES = new Date(2026, 10, 18, 10, 30).toISOString();
const EXPIRES_MS = Date.parse(EXPIRES);

function bid(overrides: Partial<MarketBidForIndentRow> = {}): MarketBidForIndentRow {
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
    created_at: new Date(2026, 10, 16, 10, 30).toISOString(),
    updated_at: new Date(2026, 10, 16, 10, 30).toISOString(),
    accepted_at: null,
    vehicle_number: null,
    vehicle_brand: null,
    vehicle_model: null,
    vehicle_body_type: null,
    vehicle_capacity: null,
    expires_at: EXPIRES,
    ...overrides,
  } as MarketBidForIndentRow;
}

describe("MarketBidCard expiry", () => {
  it("shows an active bid's own expiry and keeps Accept enabled", () => {
    const onAccept = jest.fn();
    render(<MarketBidCard bid={bid()} nowMs={EXPIRES_MS - 60_000} onAccept={onAccept} onReject={jest.fn()} />);

    expect(screen.getByText("Valid until 18 Nov, 10:30 AM")).toBeTruthy();
    expect(screen.getByText("PENDING")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Accept this Market bid"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("shows a pending bid as expired at its expiry and disables Accept", () => {
    const onAccept = jest.fn();
    const onReject = jest.fn();
    render(<MarketBidCard bid={bid()} nowMs={EXPIRES_MS} onAccept={onAccept} onReject={onReject} />);

    expect(screen.getByText("Bid expired")).toBeTruthy();
    expect(screen.getByText("EXPIRED")).toBeTruthy();
    expect(screen.queryByText(/Valid until/)).toBeNull();
    expect(screen.queryByLabelText("Accept this Market bid")).toBeNull();

    const accept = screen.getByTestId("market-bid-accept-disabled");
    expect(accept.props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(accept);
    expect(onAccept).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("Reject this Market bid"));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("keeps an accepted bid Accepted after its expiry, with no expiry line", () => {
    render(
      <MarketBidCard
        bid={bid({ status: "accepted", accepted_at: new Date(2026, 10, 17, 9, 0).toISOString() })}
        nowMs={EXPIRES_MS + 86_400_000}
      />,
    );

    expect(screen.getByText("ACCEPTED")).toBeTruthy();
    expect(screen.queryByText("Bid expired")).toBeNull();
    expect(screen.queryByText(/Valid until/)).toBeNull();
    expect(screen.queryByTestId("market-bid-accept-disabled")).toBeNull();
  });
});
