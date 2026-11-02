import { flushDcoSelfOutbox } from "@/features/dco-self/offline/dcoSelfSync";
import { useCallback, useEffect } from "react";

/** Flush DCO Self outbox on mount and when the window regains focus. */
export function useDcoSelfOutboxFlush(enabled: boolean) {
  const flush = useCallback(() => {
    if (!enabled) return;
    void flushDcoSelfOutbox();
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
