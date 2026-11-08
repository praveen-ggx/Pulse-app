import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

export type CoalescedRunScope = {
  /** False after unmount or after a newer connection/mutation generation. */
  isCurrent: () => boolean;
};

export type CoalescedLoad = (opts?: {
  force?: boolean;
  /** Bump the generation and start one replacement without waiting out the old request. */
  supersede?: boolean;
}) => Promise<void>;

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
  run: (scope: CoalescedRunScope) => Promise<void>,
  { minIntervalMs }: { minIntervalMs: number },
): CoalescedLoad {
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const inFlight = useRef<Promise<void> | null>(null);
  const followUp = useRef<Promise<void> | null>(null);
  const lastCompletedAt = useRef(0);
  const epoch = useRef(0);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current += 1;
    };
  }, []);

  const start = useCallback((): Promise<void> => {
    if (!mounted.current) return Promise.resolve();
    const ticket = epoch.current;
    const isCurrent = () => mounted.current && epoch.current === ticket;
    const p = (async () => {
      await runRef.current({ isCurrent });
      // A rejected or superseded load must stay stale so the next focus can retry.
      if (isCurrent()) lastCompletedAt.current = Date.now();
    })();
    inFlight.current = p;
    const clear = () => {
      if (inFlight.current === p) inFlight.current = null;
    };
    p.then(clear, clear);
    return p;
  }, []);

  return useCallback(
    (opts?: { force?: boolean; supersede?: boolean }) => {
      const force = opts?.force === true;
      const supersede = opts?.supersede === true;
      if (supersede) epoch.current += 1;
      const current = inFlight.current;
      if (current && supersede) {
        if (!followUp.current) {
          const next = Promise.resolve().then(() => {
            followUp.current = null;
            if (!mounted.current) return;
            return start();
          });
          followUp.current = next;
        }
        return followUp.current;
      }
      if (current) {
        if (!force) return current;
        epoch.current += 1;
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
      if (!force && !supersede && Date.now() - lastCompletedAt.current < minIntervalMs) {
        return Promise.resolve();
      }
      return start();
    },
    [minIntervalMs, start],
  );
}
