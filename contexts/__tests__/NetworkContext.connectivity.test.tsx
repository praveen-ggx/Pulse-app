/**
 * NetworkProvider is the single connectivity owner for the data layer: it tells the
 * Supabase circuit when the device is offline, drives TanStack's onlineManager, and
 * on offline → online sends one probe (only if the circuit asks for one).
 */
import React from "react";
import { act, render } from "@testing-library/react-native";
import { onlineManager } from "@tanstack/react-query";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { probeSupabaseOrigin } from "@/lib/supabase";
import {
  expediteSupabaseCircuitProbe,
  setSupabaseDeviceConnectivity,
} from "@/lib/supabaseHttp.util";

jest.mock("react-native", () => jest.requireActual("react-native"));

let mockEmit: ((state: NetInfoState) => void) | null = null;
const mockUnsubscribe = jest.fn();
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn((cb: (state: NetInfoState) => void) => {
      mockEmit = cb;
      return mockUnsubscribe;
    }),
    fetch: jest.fn(() => new Promise(() => {})),
  },
}));
jest.mock("@/lib/supabase", () => ({ probeSupabaseOrigin: jest.fn(() => Promise.resolve()) }));
jest.mock("@/lib/supabaseHttp.util", () => ({
  expediteSupabaseCircuitProbe: jest.fn(() => true),
  setSupabaseDeviceConnectivity: jest.fn(),
}));

const state = (isConnected: boolean | null, isInternetReachable: boolean | null = isConnected) =>
  ({ isConnected, isInternetReachable }) as NetInfoState;

function send(next: NetInfoState) {
  act(() => mockEmit?.(next));
}

describe("NetworkProvider connectivity integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEmit = null;
    onlineManager.setOnline(true);
  });

  it("reports device offline to the circuit and pauses queries", () => {
    render(<NetworkProvider>{null}</NetworkProvider>);
    send(state(false));
    expect(setSupabaseDeviceConnectivity).toHaveBeenLastCalledWith(false);
    expect(onlineManager.isOnline()).toBe(false);
  });

  it("treats connected-but-unreachable as offline", () => {
    render(<NetworkProvider>{null}</NetworkProvider>);
    send(state(true, false));
    expect(setSupabaseDeviceConnectivity).toHaveBeenLastCalledWith(false);
  });

  it("sends exactly one probe on offline → online", () => {
    render(<NetworkProvider>{null}</NetworkProvider>);
    send(state(false));
    send(state(true));
    expect(setSupabaseDeviceConnectivity).toHaveBeenLastCalledWith(true);
    expect(onlineManager.isOnline()).toBe(true);
    expect(expediteSupabaseCircuitProbe).toHaveBeenCalledTimes(1);
    expect(probeSupabaseOrigin).toHaveBeenCalledTimes(1);

    // Staying online sends nothing more.
    send(state(true));
    expect(probeSupabaseOrigin).toHaveBeenCalledTimes(1);
  });

  it("does not probe when the circuit does not ask for one", () => {
    (expediteSupabaseCircuitProbe as jest.Mock).mockReturnValueOnce(false);
    render(<NetworkProvider>{null}</NetworkProvider>);
    send(state(false));
    send(state(true));
    expect(probeSupabaseOrigin).not.toHaveBeenCalled();
  });

  it("does not probe on the first known state (no prior offline)", () => {
    render(<NetworkProvider>{null}</NetworkProvider>);
    send(state(true));
    expect(expediteSupabaseCircuitProbe).not.toHaveBeenCalled();
    expect(probeSupabaseOrigin).not.toHaveBeenCalled();
  });

  it("removes its NetInfo listener on unmount", () => {
    const { unmount } = render(<NetworkProvider>{null}</NetworkProvider>);
    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
