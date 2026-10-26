import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDriverStopExecution } from '@/features/driver/execution/fetchDriverStopExecution';
import type { DriverStopExecutionBundle } from '@/features/driver/execution/driverStopExecution.types';
import {
  deriveCurrentStop,
  deriveNextStop,
  emptyDriverStopExecution,
  isStaleDriverStopHydration,
} from '@/features/driver/execution/normalizeDriverStopExecution';
import {
  mergeStopExecutionRowIntoBundle,
  shouldApplyDriverStopMutationResult,
  type DriverStopTransition,
} from '@/features/driver/execution/resolveDriverStopTransition';
import { transitionDriverStopExecution } from '@/features/driver/execution/transitionDriverStopExecution';
import type { DriverCommandResult } from '@/features/driver/services/driverExecution.service';
import { logger } from '@/lib/logger';

export type DriverStopMutationKind = DriverStopTransition | null;

/** `command` carries the trip outcome (started / completed) decided by the server. */
export type DriverStopActionResult = {
  ok: boolean;
  ignored?: boolean;
  error?: Error;
  command?: DriverCommandResult;
};

export type DriverStopExecutionController = {
  tripId: string;
  stops: DriverStopExecutionBundle['stops'];
  currentStop: ReturnType<typeof deriveCurrentStop>;
  nextStop: ReturnType<typeof deriveNextStop>;
  mutating: DriverStopMutationKind;
  hydrated: boolean;
  arrive: () => Promise<DriverStopActionResult>;
  complete: () => Promise<DriverStopActionResult>;
};

/**
 * Background SES hydrate + arrive/complete on the current stop.
 * `hydrated` is false until the first fetch settles so Job Card can pick
 * legacy vs multi-order without flashing the wrong card.
 */
export function useDriverStopExecution(tripId: string | null | undefined): DriverStopExecutionController {
  const [bundle, setBundle] = useState<DriverStopExecutionBundle>(() =>
    emptyDriverStopExecution(tripId ?? ''),
  );
  const [hydrated, setHydrated] = useState(() => !tripId);
  const [mutating, setMutating] = useState<DriverStopMutationKind>(null);

  const tripIdRef = useRef(tripId);
  tripIdRef.current = tripId;
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;
  const mutationGenRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    const activeTripId = tripId ?? '';
    mutationGenRef.current += 1;
    busyRef.current = false;
    setMutating(null);
    setBundle(emptyDriverStopExecution(activeTripId));
    if (!activeTripId) {
      setHydrated(true);
      return;
    }
    setHydrated(false);

    let cancelled = false;
    const giveUp = setTimeout(() => {
      if (cancelled || isStaleDriverStopHydration(activeTripId, tripIdRef.current)) return;
      setHydrated(true);
    }, 4000);
    void fetchDriverStopExecution(activeTripId).then((result) => {
      if (cancelled || isStaleDriverStopHydration(activeTripId, tripIdRef.current)) return;
      if (!result.ok) {
        logger.error('driver stop execution hydrate failed', {
          tripId: activeTripId,
          error: result.error,
        });
        setBundle(emptyDriverStopExecution(activeTripId));
        setHydrated(true);
        return;
      }
      setBundle(result.bundle);
      setHydrated(true);
    });

    return () => {
      cancelled = true;
      clearTimeout(giveUp);
    };
  }, [tripId]);

  const runTransition = useCallback(async (transition: DriverStopTransition): Promise<DriverStopActionResult> => {
    if (busyRef.current) {
      return { ok: false, ignored: true as const };
    }
    const activeTripId = tripIdRef.current ?? '';
    const current = deriveCurrentStop(bundleRef.current.stops);
    const expected = transition === 'arrive' ? 'pending' : 'arrived';
    if (!activeTripId || !current || current.status !== expected) {
      return { ok: false, error: new Error('Stop is not ready for this action') };
    }

    const request = { tripId: activeTripId, stopId: current.stopId };
    const gen = mutationGenRef.current;
    busyRef.current = true;
    setMutating(transition);

    const result = await transitionDriverStopExecution({
      tripId: request.tripId,
      stopId: request.stopId,
      transition,
    });

    const stillActive =
      gen === mutationGenRef.current &&
      shouldApplyDriverStopMutationResult(request, tripIdRef.current);

    if (!stillActive) {
      busyRef.current = false;
      setMutating(null);
      return { ok: false, ignored: true as const };
    }

    if (!result.ok) {
      if (result.refetchedBundle) {
        setBundle(result.refetchedBundle);
      }
      busyRef.current = false;
      setMutating(null);
      logger.error('driver stop execution transition failed', {
        tripId: request.tripId,
        stopId: request.stopId,
        transition,
        error: result.error,
      });
      return { ok: false, error: result.error, command: result.command ?? undefined };
    }

    setBundle((prev) => {
      if (!shouldApplyDriverStopMutationResult(request, tripIdRef.current)) return prev;
      const base = result.refetchedBundle ?? prev;
      if (base.tripId !== request.tripId) return prev;
      return mergeStopExecutionRowIntoBundle(base, result.row);
    });
    busyRef.current = false;
    setMutating(null);
    return { ok: true, command: result.command };
  }, []);

  const arrive = useCallback(() => runTransition('arrive'), [runTransition]);
  const complete = useCallback(() => runTransition('complete'), [runTransition]);

  const currentStop = useMemo(() => deriveCurrentStop(bundle.stops), [bundle.stops]);
  const nextStop = useMemo(
    () => deriveNextStop(bundle.stops, currentStop),
    [bundle.stops, currentStop],
  );

  return {
    tripId: bundle.tripId,
    stops: bundle.stops,
    currentStop,
    nextStop,
    mutating,
    hydrated,
    arrive,
    complete,
  };
}
