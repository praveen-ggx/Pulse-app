import { MarketplaceRouteGrid } from "@/features/network/components/MarketplaceLoadCardChrome";
import { render, screen } from "@testing-library/react-native";

jest.mock("react-native", () => jest.requireActual("react-native"));

describe("MarketplaceRouteGrid via stops", () => {
  it("omits the Via row when there are no extra stops", () => {
    render(<MarketplaceRouteGrid pickup="Delhi" drop="Hyderabad" />);
    expect(screen.queryByLabelText(/^Via /)).toBeNull();
    expect(screen.queryByText("Via")).toBeNull();
  });

  it("omits the Via row for blank or whitespace-only stop names", () => {
    render(
      <MarketplaceRouteGrid
        pickup="Delhi"
        drop="Hyderabad"
        viaStops={["  ", "", "\n"]}
      />,
    );
    expect(screen.queryByLabelText(/^Via /)).toBeNull();
  });

  it("shows place names in given order when extra stops exist", () => {
    render(
      <MarketplaceRouteGrid
        pickup="Delhi"
        drop="Hyderabad"
        viaStops={[" Hosur ", "Krishnagiri"]}
      />,
    );
    expect(screen.getByLabelText("Via Hosur · Krishnagiri")).toBeTruthy();
    expect(screen.getByText("Hosur · Krishnagiri")).toBeTruthy();
  });
});
