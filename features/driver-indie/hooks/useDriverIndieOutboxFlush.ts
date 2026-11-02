import { flushDriverIndieOutbox } from "@/features/driver-indie/offline/driverIndieSync";
import { useCallback, useEffect } from "react";

/** Flush independent DRIVER outbox on mount and when the window regains focus. */
export function useDriverIndieOutboxFlush(enabled: boolean) {
  const flush = useCallback(() => {
    if (!enabled) return;
    void flushDriverIndieOutbox();
  }, [enabled]);

  useEffect(() => {
    flush();
  }, [flush]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onFocus = () => flush();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, flush]);

  return flush;
}
