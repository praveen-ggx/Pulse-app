import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@/components/LoadingIndicator", () => ({ LoadingIndicator: () => null }));

import { DM_RETENTION_NOTICE } from "@/features/chat/components/shared/ChatHistoryExpiryNotice";
import { DmThreadEmptyState } from "@/features/chat/components/shared/DmThreadEmptyState";

describe("DmThreadEmptyState", () => {
  it("explains a new DM and that only files expire", () => {
    const { getByText } = render(
      <DmThreadEmptyState status="ready" partnerName="idreeslogistics" />,
    );
    expect(getByText("No messages yet")).toBeTruthy();
    expect(getByText("Start the conversation with idreeslogistics.")).toBeTruthy();
    expect(getByText(DM_RETENTION_NOTICE)).toBeTruthy();
  });

  it("shows loading instead of an empty thread", () => {
    const { getByText, queryByText } = render(
      <DmThreadEmptyState status="loading" partnerName="Acme" />,
    );
    expect(getByText("Loading messages…")).toBeTruthy();
    expect(queryByText("No messages yet")).toBeNull();
  });

  it("offers a retry when messages fail to load", () => {
    const onRetry = jest.fn();
    const { getByLabelText, getByText } = render(
      <DmThreadEmptyState status="error" partnerName="Acme" onRetry={onRetry} />,
    );
    expect(getByText("Couldn’t load messages")).toBeTruthy();
    fireEvent.press(getByLabelText("Retry loading messages"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
