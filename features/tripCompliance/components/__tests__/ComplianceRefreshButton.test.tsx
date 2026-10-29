jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("lucide-react-native", () => ({ RefreshCw: "RefreshCw" }));

import { ComplianceRefreshButton } from "@/features/tripCompliance/components/ComplianceRefreshButton";
import { formatComplianceUpdatedAgo } from "@/features/tripCompliance/utils/complianceUpdatedAgo.util";
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

describe("formatComplianceUpdatedAgo", () => {
  const now = 1_000_000_000_000;
  it("formats the age of the last successful read", () => {
    expect(formatComplianceUpdatedAgo(0, now)).toBeNull();
    expect(formatComplianceUpdatedAgo(now - 20_000, now)).toBe("Updated just now");
    expect(formatComplianceUpdatedAgo(now - 3 * 60_000, now)).toBe("Updated 3 min ago");
    expect(formatComplianceUpdatedAgo(now - 125 * 60_000, now)).toBe("Updated 2 h ago");
    expect(formatComplianceUpdatedAgo(now + 5_000, now)).toBe("Updated just now"); // clock skew
  });
});

describe("ComplianceRefreshButton", () => {
  it("shows the data age and refreshes on press", () => {
    const onRefresh = jest.fn();
    render(<ComplianceRefreshButton updatedAt={Date.now() - 4 * 60_000} refreshing={false} onRefresh={onRefresh} />);
    expect(screen.getByText("Updated 4 min ago")).toBeTruthy();
    fireEvent.press(screen.getByTestId("compliance-refresh"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("is disabled while a refresh is running", () => {
    const onRefresh = jest.fn();
    render(<ComplianceRefreshButton updatedAt={Date.now()} refreshing onRefresh={onRefresh} />);
    expect(screen.getByText("Refreshing…")).toBeTruthy();
    fireEvent.press(screen.getByTestId("compliance-refresh"));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("compact mode keeps the age in the accessibility label", () => {
    render(<ComplianceRefreshButton compact updatedAt={Date.now() - 2 * 60_000} refreshing={false} onRefresh={jest.fn()} />);
    expect(screen.queryByText("Updated 2 min ago")).toBeNull();
    expect(screen.getByLabelText("Refresh Compliance. Updated 2 min ago")).toBeTruthy();
  });
});
