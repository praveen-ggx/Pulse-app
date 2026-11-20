import { flushDriverIndieOutbox } from "@/features/driver-indie/offline/driverIndieSync";
import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

/** One flush at a time across the app (the outbox is a read-modify-write list). */
let flushInFlight: Promise<unknown> | null = null;

function flushOnce(): void {
  if (flushInFlight) return;
  flushInFlight = flushDriverIndieOutbox()
    .catch(() => undefined)
    .finally(() => {
      flushInFlight = null;
    });
}

/**
 * Send offline-saved driver book entries (parties, tags, receivables,
 * collections) to the server. Runs on mount, when the app comes back to the
 * foreground, when the network reconnects, and on web window focus — so a
 * payment recorded with no signal reaches the office once signal returns.
 */
export function useDriverIndieOutboxFlush(enabled: boolean) {
  const flush = useCallback(() => {
    if (!enabled) return;
    flushOnce();
  }, [enabled]);

  useEffect(() => {
    flush();
  }, [flush]);

  // App back to foreground (native) — the window "focus" event never fires there.
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") flush();
    });
    return () => sub.remove();
  }, [enabled, flush]);

  // Network reconnect: flush on the offline → online edge only.
  const wasOnlineRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      if (online && wasOnlineRef.current === false) flush();
      wasOnlineRef.current = online;
    });
    return () => unsubscribe();
  }, [enabled, flush]);

  useEffect(() => {
    if (
      !enabled ||
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function"
    ) {
      return;
    }
    const onFocus = () => flush();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, flush]);

  return flush;
}
