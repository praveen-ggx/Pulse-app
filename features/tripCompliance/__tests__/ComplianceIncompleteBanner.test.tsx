// A root __mocks__ stubs react-native; component tests need the real one.
jest.mock("react-native", () => jest.requireActual("react-native"));

import { ComplianceIncompleteBanner } from "@/features/tripCompliance/components/ComplianceIncompleteBanner";
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

describe("ComplianceIncompleteBanner", () => {
  it("loading: shows progress and no Retry", () => {
    const view = render(<ComplianceIncompleteBanner loaded={40} total={312} failed={false} onRetry={jest.fn()} />);
    expect(view.getByText("Loading trips… 40 of 312")).toBeTruthy();
    expect(view.queryByTestId("compliance-incomplete-retry")).toBeNull();
  });

  it("failed: shows loaded vs total and a Retry that calls back", () => {
    const onRetry = jest.fn();
    const view = render(<ComplianceIncompleteBanner loaded={40} total={312} failed onRetry={onRetry} />);
    expect(view.getByText("Showing 40 of 312 trips. Couldn't load the rest.")).toBeTruthy();
    fireEvent.press(view.getByTestId("compliance-incomplete-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
