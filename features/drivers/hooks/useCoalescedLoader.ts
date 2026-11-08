import { useCallback, useEffect, useRef } from "react";

export type CoalescedLoad = (opts?: { force?: boolean }) => Promise<void>;

/**
 * Wraps a screen loader so overlapping triggers share one request.
 *
 * Unforced calls (mount, focus, dependency churn) join an in-flight load,
 * and are skipped when the last completed load is younger than `minIntervalMs`.
 * Forced calls (after a mutation) always produce a load that starts after
 * the call: if one is already in flight, exactly one follow-up run is queued,
 * so a mutation never resolves against data read before it.
 */
export function useCoalescedLoader(
  run: () => Promise<void>,
  { minIntervalMs }: { minIntervalMs: number },
): CoalescedLoad {
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const inFlight = useRef<Promise<void> | null>(null);
  const followUp = useRef<Promise<void> | null>(null);
  const lastCompletedAt = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback((): Promise<void> => {
    if (!mounted.current) return Promise.resolve();
    const p = (async () => {
      await runRef.current();
      // A rejected load must stay stale so the next focus can retry.
      // An unmounted screen must not record a completion it never painted.
      if (mounted.current) lastCompletedAt.current = Date.now();
    })();
    inFlight.current = p;
    const clear = () => {
      if (inFlight.current === p) inFlight.current = null;
    };
    p.then(clear, clear);
    return p;
  }, []);

  return useCallback(
    (opts?: { force?: boolean }) => {
      const force = opts?.force === true;
      const current = inFlight.current;
      if (current) {
        if (!force) return current;
        if (!followUp.current) {
          const next = current
            .catch(() => undefined)
            .then(() => {
              followUp.current = null;
              if (!mounted.current) return;
              return start();
            });
          followUp.current = next;
        }
        return followUp.current;
      }
      if (!force && Date.now() - lastCompletedAt.current < minIntervalMs) {
        return Promise.resolve();
      }
      return start();
    },
    [minIntervalMs, start],
  );
}
