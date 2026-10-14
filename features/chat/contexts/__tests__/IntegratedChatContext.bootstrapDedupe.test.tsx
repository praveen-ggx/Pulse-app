/**
 * Covers the IntegratedChatProvider audit finding: the provider is mounted
 * more than once at a time (app-wide via LazyChatProviders, and again inside
 * NetworkDesktopChatFlexPanel), and its bootstrap guard (bootstrappedOrgRef)
 * is local per instance, so two instances for the same org could each
 * independently call getNetworkConversationsByOrg + getIntegratedPartners.
 * Fixed by deduping the fetch itself (fetchNetworkChatBootstrapShared, a
 * module-level in-flight-promise + short-lived cache keyed by org) rather
 * than adding another local boolean. These tests cover only the bootstrap
 * REST-call dedup — not a claim about the production DB incident.
 */
import React from "react";
import { render, waitFor, act } from "@testing-library/react-native";

jest.mock("react-native", () => jest.requireActual("react-native"));
import {
  IntegratedChatProvider,
  __resetNetworkChatBootstrapForTests,
} from "../IntegratedChatContext";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";
import * as chatService from "../../services/chat.service";

jest.mock("@/contexts/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("@/contexts/OrganizationContext", () => ({
  useOptionalOrganization: jest.fn(),
}));
jest.mock("@/lib/realtimeRegistry", () => ({
  subscribeSharedPostgresChanges: jest.fn(() => () => {}),
}));
jest.mock("@/lib/chatUnreadSignal", () => ({ setNetworkUnreadCount: jest.fn() }));
jest.mock("@/features/network/utils/storyReplyPreview.util", () => ({
  networkMetadataToReplyPreview: jest.fn(() => null),
}));
jest.mock("../../services/chat.service", () => ({
  getNetworkConversationsByOrg: jest.fn(),
  getIntegratedPartners: jest.fn(),
  getNetworkMessagesByConversation: jest.fn(),
  getOrCreateNetworkConversation: jest.fn(),
  markNetworkConversationRead: jest.fn(),
  NETWORK_CHAT_HISTORY_PAGE: 30,
}));

const mockGetConvs = chatService.getNetworkConversationsByOrg as jest.Mock;
const mockGetPartners = chatService.getIntegratedPartners as jest.Mock;
const mockSubscribe = subscribeSharedPostgresChanges as jest.Mock;

function setOrg(id: string) {
  (useOptionalOrganization as jest.Mock).mockReturnValue({
    currentOrganization: { id, name: `Org ${id}` },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetNetworkChatBootstrapForTests();
  (useAuth as jest.Mock).mockReturnValue({ profile: { uid: "user-1" }, status: "authenticated" });
  setOrg("org-1");
  mockGetConvs.mockResolvedValue([]);
  mockGetPartners.mockResolvedValue([]);
});

describe("IntegratedChatProvider — cross-instance bootstrap dedupe", () => {
  it("two simultaneous provider instances for the same org result in exactly one bootstrap fetch", async () => {
    render(
      <>
        <IntegratedChatProvider>{null}</IntegratedChatProvider>
        <IntegratedChatProvider>{null}</IntegratedChatProvider>
      </>,
    );

    await waitFor(() => expect(mockGetConvs).toHaveBeenCalled());

    expect(mockGetConvs).toHaveBeenCalledTimes(1);
    expect(mockGetPartners).toHaveBeenCalledTimes(1);
  });

  it("a second instance mounting shortly after the first (same org, within the freshness window) reuses the cached result instead of refetching", async () => {
    render(<IntegratedChatProvider>{null}</IntegratedChatProvider>);
    await waitFor(() => expect(mockGetConvs).toHaveBeenCalledTimes(1));

    render(<IntegratedChatProvider>{null}</IntegratedChatProvider>);
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetConvs).toHaveBeenCalledTimes(1);
    expect(mockGetPartners).toHaveBeenCalledTimes(1);
  });

  it("switching org bootstraps the new org exactly once", async () => {
    const { rerender } = render(<IntegratedChatProvider>{null}</IntegratedChatProvider>);
    await waitFor(() => expect(mockGetConvs).toHaveBeenCalledTimes(1));
    expect(mockGetConvs).toHaveBeenCalledWith("org-1");

    setOrg("org-2");
    rerender(<IntegratedChatProvider>{null}</IntegratedChatProvider>);

    await waitFor(() => expect(mockGetConvs).toHaveBeenCalledTimes(2));
    expect(mockGetConvs).toHaveBeenLastCalledWith("org-2");
  });

  it("a legitimate re-bootstrap after the staleness window still refetches (e.g. app foregrounded again)", async () => {
    jest.useFakeTimers();
    try {
      const { rerender } = render(
        <IntegratedChatProvider isActive={false}>{null}</IntegratedChatProvider>,
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockGetConvs).toHaveBeenCalledTimes(1);

      act(() => {
        jest.advanceTimersByTime(5 * 60_000 + 1_000);
      });

      rerender(<IntegratedChatProvider isActive={true}>{null}</IntegratedChatProvider>);
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockGetConvs).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not change realtime subscription behavior — one conversations-channel subscription per mounted instance, same as before", async () => {
    render(
      <>
        <IntegratedChatProvider>{null}</IntegratedChatProvider>
        <IntegratedChatProvider>{null}</IntegratedChatProvider>
      </>,
    );
    await waitFor(() => expect(mockGetConvs).toHaveBeenCalled());

    // subscribeSharedPostgresChanges itself already dedupes real channels
    // (see lib/realtimeRegistry.ts) — this fix only touches the REST
    // bootstrap fetch, so the call count into it is unchanged: one
    // subscription attempt per mounted instance (2), not doubled or halved.
    expect(mockSubscribe).toHaveBeenCalledTimes(2);
  });
});
