import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { nextMarketBidExpiryMs } from "@/features/network/utils/marketBidExpiry.util";

type ExpiringBid = { id: string; status?: string | null; expires_at?: string | null };

/** setTimeout overflows above ~24.8 days; re-arm instead. */
const MAX_TIMER_MS = 6 * 60 * 60 * 1000;

export type MarketBidClock = {
  nowMs: number;
  /**
   * The server refused a bid as expired, so server time is at least its
   * expires_at. Moves this clock forward when the device clock lags.
   */
  noteServerExpired: (expiresAt: string | null | undefined) => void;
};

/**
 * Clock used to show Marketplace bid expiry. Re-read when the bid list
 * changes, when the app returns to the foreground (and `onResume` runs, so
 * the caller can refetch), and when the next pending bid's expires_at
 * passes. Display only: the award RPC is the authority.
 */
export function useMarketBidNow(bids: readonly ExpiringBid[], onResume?: () => void): MarketBidClock {
  const [deviceNow, setDeviceNow] = useState(() => Date.now());
  const [skewMs, setSkewMs] = useState(0);
  const nowMs = deviceNow + skewMs;
  const bidsRef = useRef(bids);
  bidsRef.current = bids;
  const signature = bids.map((b) => `${b.id}:${b.status ?? ""}:${b.expires_at ?? ""}`).join("|");

  useEffect(() => {
    setDeviceNow(Date.now());
  }, [signature]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      setDeviceNow(Date.now());
      onResume?.();
    });
    return () => sub.remove();
  }, [onResume]);

  useEffect(() => {
    const next = nextMarketBidExpiryMs(bidsRef.current, nowMs);
    if (next == null) return;
    const timer = setTimeout(() => setDeviceNow(Date.now()), Math.min(next - nowMs + 50, MAX_TIMER_MS));
    return () => clearTimeout(timer);
  }, [signature, nowMs]);

  const noteServerExpired = useCallback((expiresAt: string | null | undefined) => {
    const at = Date.parse(expiresAt ?? "");
    if (!Number.isFinite(at)) return;
    const device = Date.now();
    setDeviceNow(device);
    setSkewMs((prev) => Math.max(prev, at - device));
  }, []);

  return { nowMs, noteServerExpired };
}
