import { render } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { TripFinanceAdjustmentsPanel } from "../TripFinanceAdjustmentsPanel";

jest.mock("react-native", () => jest.requireActual("react-native"));

jest.mock("@/components/EntityAvatar", () => ({
  EntityAvatar: () => null,
}));
jest.mock("@expo/vector-icons/Feather", () => "Feather");
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "user-1" }, profile: { uid: "user-1", full_name: "Ops User" } }),
}));

const base = {
  adjustments: [],
  sales: 43500,
  adjSales: 43500,
  revenueSideDelta: 0,
  cost: 43500,
  adjCost: 43500,
  costSideDelta: 0,
  clientName: "Apollo",
  supplierName: "DEVANATHAN TRANSPORT MANIVANNAN",
  lineMetaLabel: () => "",
  onOpenProvision: jest.fn(),
};

describe("TripFinanceAdjustmentsPanel — Pulse Exchange slot", () => {
  it("does not render an Exchange surface when the trip has no exchange slot", () => {
    const { queryByText, getByText } = render(
      <TripFinanceAdjustmentsPanel
        {...base}
        layout="desktop"
        capturePaymentSlot={<Text>Capture payment</Text>}
      />,
    );

    expect(getByText("Capture payment")).toBeTruthy();
    expect(queryByText("Pulse Exchange")).toBeNull();
  });

  it("places the Exchange slot on desktop with Capture payment and provision adjustments unchanged", () => {
    const { getByText, getByTestId, queryByText } = render(
      <TripFinanceAdjustmentsPanel
        {...base}
        layout="desktop"
        capturePaymentSlot={<Text>Capture payment</Text>}
        exchangeSlot={
          <View testID="exchange-payments-panel">
            <Text>Pulse Exchange</Text>
          </View>
        }
      />,
    );

    expect(getByText("Capture payment")).toBeTruthy();
    expect(getByTestId("exchange-payments-panel")).toBeTruthy();
    expect(getByText("Provision adjustments")).toBeTruthy();
    expect(queryByText("Record driver payout")).toBeNull();
  });

  it("keeps Capture payment on mobile when Exchange is mounted", () => {
    const { getByText } = render(
      <TripFinanceAdjustmentsPanel
        {...base}
        layout="mobile"
        capturePaymentSlot={<Text>Capture payment</Text>}
        exchangeSlot={
          <View testID="exchange-payments-panel">
            <Text>Pulse Exchange</Text>
          </View>
        }
      />,
    );

    expect(getByText("Capture payment")).toBeTruthy();
    expect(getByText("Pulse Exchange")).toBeTruthy();
  });
});
