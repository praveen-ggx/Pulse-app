/**
 * Network context — uses @react-native-community/netinfo.
 * Exposes isConnected so the app can require internet before auth/API calls.
 *
 * Also the single owner of connectivity for the data layer: tells the Supabase
 * circuit when the device (not the origin) is offline, pauses TanStack queries
 * while offline, and on reconnect sends one probe so an open circuit can close
 * without waiting out its cooldown.
 */
import { createContext, useContext, useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { probeSupabaseOrigin } from '@/lib/supabase';
import {
  expediteSupabaseCircuitProbe,
  setSupabaseDeviceConnectivity,
} from '@/lib/supabaseHttp.util';

interface NetworkContextType {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}

/** True when we should allow network calls. Unknown state is treated as online so user can try. */
export function useIsOnline(): boolean {
  const { isConnected, isInternetReachable } = useNetwork();
  if (isConnected === false) return false;
  if (isConnected === true && isInternetReachable === false) return false;
  return true;
}

/** Same rule as useIsOnline, for a raw NetInfo state. null = not known yet. */
export function deviceOnlineFromNetInfo(state: NetInfoState | null): boolean | null {
  if (!state || state.isConnected == null) return null;
  if (state.isConnected === false) return false;
  return state.isInternetReachable !== false;
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NetInfoState | null>(null);
  const lastOnlineRef = useRef<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(setState);
    NetInfo.fetch().then(setState).catch(() => { /* non-fatal; addEventListener handles ongoing state */ });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const online = deviceOnlineFromNetInfo(state);
    const wasOnline = lastOnlineRef.current;
    lastOnlineRef.current = online;
    setSupabaseDeviceConnectivity(online);
    if (online != null) onlineManager.setOnline(online);
    // Reconnecting never closes the circuit by itself; it only lets one probe through.
    if (wasOnline === false && online === true && expediteSupabaseCircuitProbe()) {
      void probeSupabaseOrigin();
    }
  }, [state]);

  const value = useMemo<NetworkContextType>(
    () => ({
      isConnected: state?.isConnected ?? null,
      isInternetReachable: state?.isInternetReachable ?? null,
    }),
    [state?.isConnected, state?.isInternetReachable],
  );

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}
