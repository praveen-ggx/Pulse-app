import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as tripsService from "@/features/trips/services/trips.service";
import * as driversService from "@/features/drivers/services/drivers.service";
import {
  applyDriverCommandResult,
  executeDriverCommand,
} from "@/features/driver/services/driverExecution.service";
import {
  clearLrPhase,
  hasEnteredLrPhase,
  markLrPhaseEntered,
} from "@/features/drivers/services/tripControlProgress.storage";
import { useAuth } from "@/contexts/AuthContext";
import { useInvalidateDriverHomeDashboard } from "@/lib/queries/useInvalidateDriverHomeDashboard";
import { driverUiTripsQueryKey } from "@/lib/queries/useDriverUiTripsQuery";

export const STEPS = [
  { id: "accepted", label: "Start", icon: "compass" as const },
  { id: "pickup", label: "Pickup", icon: "archive" as const },
  { id: "transit", label: "Transit", icon: "truck" as const },
  { id: "completed", label: "Complete", icon: "check-circle" as const },
] as const;

export type StepId = (typeof STEPS)[number]["id"] | "reached" | "lr";

const STEP_RANK: Record<StepId, number> = {
  accepted: 0,
  pickup: 1,
  lr: 2,
  transit: 3,
  reached: 4,
  completed: 5,
};

export function useTripControl(tripId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const invalidateDriverHomeDashboard = useInvalidateDriverHomeDashboard();
  const [trip, setTrip] = useState<tripsService.TripRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<StepId>("accepted");
  const [stepLoading, setStepLoading] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [acceptedOffer, setAcceptedOffer] =
    useState<driversService.DriverOffer | null>(null);
  const [tripDriver, setTripDriver] = useState<driversService.DriverRow | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!tripId) {
      setLoading(false);
      return;
    }
    setStepError(null);
    setLoading(true);
    try {
      const res = await tripsService.getDriverTripById(tripId);
      setTrip(res.trip ? tripsService.driverRowToTripRow(res.trip) : null);

      if (res.trip) {
        const s = (res.trip.status ?? "").toLowerCase();

        let derived: StepId;
        if (s === "completed" || s === "delivered" || s === "done") {
          derived = "completed";
        } else if (s === "at_drop") {
          derived = "reached";
        } else if (s === "in_transit" || s === "transit") {
          derived = "transit";
        } else if (s === "picked_up" || s === "pickup" || s === "in_progress") {
          derived = "pickup";
        } else {
          derived = "accepted";
        }

        // The "LR" phase ("Package collected" → upload Lorry Receipt) has no
        // server-status representation — status stays `in_progress`, which maps
        // to "pickup". The in-memory reconciler below only protects the step
        // *within* a mounted hook instance; on any remount / background
        // re-sync `prev` resets to "accepted" and we would derive "pickup",
        // throwing the driver back onto the "Package collected" screen with no
        // interaction. Restore the LR phase from its persisted per-trip marker
        // so background status updates never change the route.
        if (derived === "pickup" && (await hasEnteredLrPhase(tripId))) {
          derived = "lr";
        } else if (
          (STEP_RANK[derived] ?? 0) > (STEP_RANK.lr ?? 0)
        ) {
          // Trip has genuinely advanced past LR on the server — drop the
          // now-obsolete marker so it can't resurrect a stale sub-step later.
          void clearLrPhase(tripId);
        }

        setStep((prev) => {
          // Keep the local-only LR sub-step while server status is still pickup.
          if (prev === "lr" && derived === "pickup") return prev;
          // Don't regress past a locally confirmed advance (e.g. a stale poll).
          if ((STEP_RANK[prev] ?? 0) > (STEP_RANK[derived] ?? 0)) return prev;
          return derived;
        });
      }
    } catch (error) {
      console.error("Failed to load trip:", error);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    if (!trip?.organization_id) {
      setAcceptedOffer(null);
      return;
    }
    driversService
      .getAcceptedDriverOfferForOrganization(trip.organization_id)
      .then((res) => {
        if (cancelled) return;
        if (res.error) return;
        setAcceptedOffer(res.offer ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [trip?.organization_id]);

  useEffect(() => {
    let cancelled = false;
    if (!trip?.driver_id || !trip?.organization_id) {
      setTripDriver(null);
      return;
    }
    driversService
      .getDriverById(trip.organization_id, trip.driver_id)
      .then((res) => {
        if (cancelled) return;
        setTripDriver(res.driver ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [trip?.driver_id, trip?.organization_id]);

  const confirmArrival = async () => {
    const id = trip?.id ?? tripId;
    if (!id || stepLoading) return;
    const now = new Date().toISOString();
    setStepError(null);
    setStepLoading(true);
    setStep("pickup");
    // Optimistic UI update for immediate feedback
    setTrip((prev) =>
      prev
        ? {
            ...prev,
            status: "in_progress",
            started_at: prev.started_at ?? now,
            updated_at: now,
          }
        : prev,
    );
    const { error, result } = await executeDriverCommand(
      { tripId: id, command: "START_TRIP", expectedStatus: trip?.status ?? null },
      trip,
    );
    setStepLoading(false);
    if (error || !result) {
      setStepError(error?.message ?? "Could not start the trip.");
      setStep("accepted");
      setTrip((prev) => (prev ? { ...prev, status: "assigned" } : prev));
      return;
    }
    setTrip((prev) => (prev ? applyDriverCommandResult(prev, result) : prev));
  };

  /**
   * Explicit driver action from the "Package collected" button. Advances into
   * the local-only LR sub-step and persists that entry so a later remount /
   * background status re-sync restores "lr" instead of regressing to "pickup".
   * No server write — LR upload must not change trip status.
   */
  const confirmPackageCollected = useCallback(() => {
    const id = trip?.id ?? tripId;
    setStep("lr");
    if (id) void markLrPhaseEntered(id);
  }, [trip?.id, tripId]);

  const engageTransit = async () => {
    const id = trip?.id ?? tripId;
    if (!id || stepLoading) return;
    setStepError(null);
    setStepLoading(true);
    const now = new Date().toISOString();
    setStep("transit");
    // Optimistic UI update for immediate feedback
    setTrip((prev) =>
      prev
        ? { ...prev, status: "in_transit", updated_at: now }
        : prev,
    );
    const { error, result } = await executeDriverCommand(
      { tripId: id, command: "DEPART_PICKUP", expectedStatus: trip?.status ?? null },
      trip,
    );
    setStepLoading(false);
    if (error || !result) {
      setStepError(error?.message ?? "Could not update the trip.");
      setStep("pickup");
      // Transit write failed — keep the LR-phase marker so a reload restores
      // the driver's place instead of the "Package collected" screen.
      // Fallback on error is handled by not calling setTrip with the partial update anymore
      // or we could revert here if needed. The current logic in the screen re-loads on error if trip is null.
      return;
    }
    // Left the LR phase for good — drop the persisted marker (success only).
    void clearLrPhase(id);
    setTrip((prev) => (prev ? applyDriverCommandResult(prev, result) : prev));
  };

  const confirmReached = async () => {
    const id = trip?.id ?? tripId;
    if (!id || stepLoading) return;
    setStepError(null);
    setStepLoading(true);
    const { error, result } = await executeDriverCommand(
      { tripId: id, command: "ARRIVE_DROP", expectedStatus: trip?.status ?? null },
      trip,
    );
    setStepLoading(false);
    if (error || !result) {
      setStepError(error?.message ?? "Could not update the trip.");
      return;
    }
    setStep("reached");
    setTrip((prev) => (prev ? applyDriverCommandResult(prev, result) : prev));
  };

  const completeTrip = async () => {
    const id = trip?.id ?? tripId;
    if (!id) return false;
    const now = new Date().toISOString();
    setStep("completed");
    setTrip((prev) =>
      prev
        ? { ...prev, status: "completed", completed_at: now, updated_at: now }
        : prev,
    );
    const { error, result } = await executeDriverCommand(
      { tripId: id, command: "COMPLETE_TRIP", expectedStatus: trip?.status ?? null },
      trip,
    );
    if (error || !result) {
      setStepError(error?.message ?? "Could not complete the trip.");
      setStep("reached");
      setTrip((prev) => (prev ? { ...prev, status: "at_drop", completed_at: null } : prev));
      return false;
    }
    setTrip((prev) => (prev ? applyDriverCommandResult(prev, result) : prev));

    // Neither cache was invalidated on completion before -- the Dashboard's
    // availability gate and DriverTripOpsContext's own "current active job"
    // query could both keep showing this trip as active until something
    // unrelated (backgrounding the app, a realtime ledger event) happened
    // to refresh them. is_driver_available() remains the sole backend
    // authority; this only catches the client's cache up to it promptly.
    if (profile?.uid) {
      void invalidateDriverHomeDashboard(profile.uid);
      void queryClient.invalidateQueries({ queryKey: driverUiTripsQueryKey(profile.uid) });
    }
    return true;
  };

  return {
    trip,
    setTrip,
    loading,
    step,
    setStep,
    stepLoading,
    stepError,
    setStepError,
    acceptedOffer,
    tripDriver,
    load,
    confirmArrival,
    confirmPackageCollected,
    engageTransit,
    confirmReached,
    completeTrip,
  };
}
