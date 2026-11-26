/**
 * PoolBidCommitSheet must never let vehicle commit exceed pool load count.
 * Covers plus-button disable and typed entry clamping on blur (server 400 guard).
 */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { PoolBidCommitSheet } from "@/features/network/components/bidding/PoolBidCommitSheet";

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-calendars", () => ({ Calendar: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  onSubmit: jest.fn(),
  amount: 25000,
  poolSize: 2,
  routeLabel: "Chennai → Bangalore",
};

describe("PoolBidCommitSheet — pool size max", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("disables plus at the pool load count", () => {
    const { getByLabelText } = render(<PoolBidCommitSheet {...baseProps} />);
    const more = getByLabelText("More vehicles");
    fireEvent.press(more);
    expect(getByLabelText("Vehicles committed").props.value).toBe("2");
    expect(more.props.accessibilityState?.disabled ?? more.props.disabled).toBe(
      true,
    );
  });

  it("clamps typed entry to pool size on blur", () => {
    const { getByLabelText } = render(<PoolBidCommitSheet {...baseProps} />);
    const input = getByLabelText("Vehicles committed");
    fireEvent.changeText(input, "3");
    expect(input.props.value).toBe("3");
    fireEvent(input, "blur");
    expect(getByLabelText("Vehicles committed").props.value).toBe("2");
  });

  it("blocks submit when pool size is unknown", () => {
    const onSubmit = jest.fn();
    const { getByLabelText, getByText } = render(
      <PoolBidCommitSheet {...baseProps} poolSize={0} onSubmit={onSubmit} />,
    );
    expect(getByText(/Pool size is unavailable/i)).toBeTruthy();
    const submit = getByLabelText("Commit vehicles and send pool bid");
    expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBe(
      true,
    );
    fireEvent.press(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("re-clamps the shown count when poolSize shrinks while open", () => {
    const { getByLabelText, rerender } = render(
      <PoolBidCommitSheet {...baseProps} poolSize={5} />,
    );
    const more = getByLabelText("More vehicles");
    fireEvent.press(more);
    fireEvent.press(more);
    fireEvent.press(more);
    fireEvent.press(more);
    expect(getByLabelText("Vehicles committed").props.value).toBe("5");

    act(() => {
      rerender(<PoolBidCommitSheet {...baseProps} poolSize={3} />);
    });
    expect(getByLabelText("Vehicles committed").props.value).toBe("3");
  });
});
