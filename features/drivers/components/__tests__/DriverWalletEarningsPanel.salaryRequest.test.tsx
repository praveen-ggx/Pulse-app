import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();

jest.mock("react-native", () => jest.requireActual("react-native"));

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: View };
});
jest.mock("lucide-react-native", () =>
  new Proxy(
    {},
    {
      get: () => "Icon",
    },
  ),
);
jest.mock("@/components/NativeHtmlWebView", () => ({ NativeHtmlWebView: () => null }));
jest.mock("@/features/drivers/components/DriverCapturePaymentButton", () => ({
  DriverCapturePaymentButton: () => null,
}));
jest.mock("@/features/drivers/components/DriverCollectFromSheet", () => ({
  DriverCollectFromSheet: () => null,
}));

import { DriverWalletEarningsPanel } from "../DriverWalletEarningsPanel";

const colors = {
  text: "#000",
  textMuted: "#555",
  surface: "#fff",
  background: "#fff",
  border: "#ddd",
  borderSubtle: "#eee",
  emerald: "#0a0",
  surfaceElevated: "#fff",
};

function renderPanel(showSalaryRequest?: boolean) {
  return render(
    <DriverWalletEarningsPanel
      completedTrips={[]}
      fleets={[]}
      tripEarnings={() => 0}
      hasAgreedPayoutTerms={() => false}
      receivedByTripId={{}}
      tripMeta={() => {
        throw new Error("no trips");
      }}
      onSendPulseReminder={async () => ({ ok: true })}
      onSendBulkPulseReminder={async () => ({ ok: true })}
      onSharePaymentPdf={async () => {}}
      colors={colors}
      isDark={false}
      {...(showSalaryRequest === undefined ? {} : { showSalaryRequest })}
    />,
  );
}

describe("DriverWalletEarningsPanel salary request", () => {
  beforeEach(() => mockPush.mockClear());

  it("employed (non-DCO) driver: the button opens the salary request screen", () => {
    const { getByLabelText } = renderPanel(true);
    fireEvent.press(getByLabelText("Salary request"));
    expect(mockPush).toHaveBeenCalledWith("/(driver)/salary-request");
  });

  it("is shown by default", () => {
    const { getByLabelText } = renderPanel();
    expect(getByLabelText("Salary request")).toBeTruthy();
  });

  it("DCO driver: the button is hidden", () => {
    const { queryByLabelText } = renderPanel(false);
    expect(queryByLabelText("Salary request")).toBeNull();
  });
});
