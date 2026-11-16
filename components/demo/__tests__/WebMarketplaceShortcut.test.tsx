import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("react-native-reanimated", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text, View } = require("react-native");
  const identity = (value: unknown) => value;
  return {
    __esModule: true,
    default: { View, Text },
    Easing: { out: identity, cubic: identity },
    interpolateColor: () => "#0f172a",
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withTiming: identity,
  };
});

import { WebMarketplaceShortcut } from "@/components/demo/WebMarketplaceShortcut";

describe("WebMarketplaceShortcut", () => {
  it("shows the Marketplace label and opens the load center", () => {
    const onPress = jest.fn();
    const onPressIn = jest.fn();
    const { getByLabelText } = render(
      <WebMarketplaceShortcut active={false} onPress={onPress} onPressIn={onPressIn} />,
    );
    const button = getByLabelText("Marketplace");
    expect(button.props.accessibilityState).toEqual({ selected: false });
    fireEvent(button, "pressIn");
    fireEvent.press(button);
    expect(onPressIn).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalled();
  });

  it("marks the shortcut selected on the marketplace page", () => {
    const { getByLabelText } = render(
      <WebMarketplaceShortcut active onPress={jest.fn()} />,
    );
    expect(getByLabelText("Marketplace").props.accessibilityState).toEqual({
      selected: true,
    });
  });
});
