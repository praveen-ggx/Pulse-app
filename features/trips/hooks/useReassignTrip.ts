import { useCallback, useRef, useState } from 'react';
import {
  assignAggregateTripDriverByPhone,
  assignTripDriverByPhone,
  getActiveDriverAssignments,
  getActiveVehicleAssignments,
  getTripUpdatedAt,
  updateTripAssignment,
  type ActiveDriverAssignmentMap,
  type TripRow,
} from '@/features/trips/services/trips.service';
import {
  isTripReassignStaleError,
  TRIP_REASSIGN_STALE_ERROR,
} from '@/features/trips/utils/tripReassignConflict.util';
import { useInvalidateDrivers } from '@/lib/queries/useDriversQuery';
import { useInvalidateVehicles } from '@/lib/queries/useVehiclesQuery';

export type ReassignPayload = {
  driverId: string;
  vehicleId: string | null;
  vehicleDisplayNumber?: string | null;
  driverDisplayName?: string | null;
};

export type ReassignByPhonePayload = {
  phone: string;
  /** Required display name (min 2 chars) for assign-by-phone / aggregate. */
  driverName: string;
  vehicleId?: string | null;
  vehicleDisplayNumber?: string | null;
};

export type ReassignByPhoneResult = {
  ok: boolean;
  trip: TripRow | null;
  otpCode?: string | null;
  driverUpdatedVehicleFailed?: boolean;
  vehicleError?: string;
  staleConflict?: boolean;
};

type Options = {
  trip: TripRow;
  organizationId: string;
  currentUserId: string | null;
  isAggregate: boolean;
  driverAssignOrgId?: string | null;
  /** Snapshot from sheet open / confirm — optimistic lock for concurrent dispatchers. */
  expectedUpdatedAt?: string | null;
};

/**
 * Combined driver + vehicle reassignment.
 * Reassign preserves trip stage — only driver_id and vehicle_id change.
 */
export function useReassignTrip({
  trip,
  organizationId,
  currentUserId,
  isAggregate,
  driverAssignOrgId,
  expectedUpdatedAt,
}: Options) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const invalidateDrivers = useInvalidateDrivers();
  const invalidateVehicles = useInvalidateVehicles();

  const auditOptions =
    currentUserId != null
      ? {
          changedBy: currentUserId,
          driverIdPrev: trip.driver_id ?? null,
          vehicleIdPrev: trip.vehicle_id ?? null,
          forceOtpClaim: isAggregate,
          trackingOnly: isAggregate,
          expectedUpdatedAt: expectedUpdatedAt ?? undefined,
        }
      : expectedUpdatedAt
        ? { expectedUpdatedAt }
        : undefined;

  const assertTripNotStale = useCallback(async (): Promise<string | null> => {
    const expected = expectedUpdatedAt?.trim();
    if (!expected) return null;
    const { error: readErr, updatedAt } = await getTripUpdatedAt(trip.id);
    if (readErr) return readErr.message;
    if (updatedAt !== expected) {
      return TRIP_REASSIGN_STALE_ERROR;
    }
    return null;
  }, [expectedUpdatedAt, trip.id]);

  const reassignCombined = useCallback(
    async (payload: ReassignPayload): Promise<{ ok: boolean; trip: TripRow | null; staleConflict?: boolean }> => {
      if (savingRef.current) return { ok: false, trip: null };
      savingRef.current = true;
      setSaving(true);
      setError(null);
      try {
        const update: Parameters<typeof updateTripAssignment>[1] = {
          driver_id: payload.driverId,
          vehicle_id: payload.vehicleId,
        };
        if (payload.driverDisplayName !== undefined) {
          update.driver_display_name = payload.driverDisplayName;
        }
        if (payload.vehicleId == null && payload.vehicleDisplayNumber) {
          update.vehicle_id = null;
          update.vehicle_display_number = payload.vehicleDisplayNumber;
        }

        const { error: saveErr, trip: updated } = await updateTripAssignment(
          trip.id,
          update,
          auditOptions,
        );
        if (saveErr) {
          setError(saveErr.message);
          return {
            ok: false,
            trip: null,
            staleConflict: isTripReassignStaleError(saveErr.message),
          };
        }
        invalidateDrivers(organizationId);
        invalidateVehicles(organizationId);
        return { ok: true, trip: updated };
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [
      auditOptions,
      invalidateDrivers,
      invalidateVehicles,
      organizationId,
      trip.id,
    ],
  );

  const applyFleetVehicleAfterPhone = useCallback(
    async (
      updated: TripRow,
      vehicleId: string,
    ): Promise<{ ok: boolean; trip: TripRow | null; vehicleError?: string; staleConflict?: boolean }> => {
      if (updated.vehicle_id === vehicleId) {
        return { ok: true, trip: updated };
      }
      const { error: vErr, trip: withVehicle } = await updateTripAssignment(
        trip.id,
        { vehicle_id: vehicleId },
        auditOptions,
      );
      if (vErr) {
        return {
          ok: false,
          trip: updated,
          vehicleError: vErr.message,
          staleConflict: isTripReassignStaleError(vErr.message),
        };
      }
      return { ok: true, trip: withVehicle ?? updated };
    },
    [auditOptions, trip.id],
  );

  const reassignByPhone = useCallback(
    async (payload: ReassignByPhonePayload): Promise<ReassignByPhoneResult> => {
      if (savingRef.current) return { ok: false, trip: null };
      savingRef.current = true;
      setSaving(true);
      setError(null);
      try {
        const nameTrimmed = payload.driverName.trim();
        if (!nameTrimmed || nameTrimmed.length < 2) {
          setError('Enter driver name (at least 2 characters).');
          return { ok: false, trip: null };
        }

        const orgForDriver = (driverAssignOrgId ?? organizationId).trim() || organizationId;
        if (isAggregate) {
          const stale = await assertTripNotStale();
          if (stale) {
            setError(stale);
            return { ok: false, trip: null, staleConflict: true };
          }
          const { error: rpcErr, trip: updated } = await assignAggregateTripDriverByPhone(
            trip.id,
            orgForDriver,
            payload.phone,
            payload.vehicleDisplayNumber ?? null,
            payload.vehicleId ?? null,
            trip.driver_id ?? null,
            nameTrimmed,
          );
          if (rpcErr) {
            setError(rpcErr.message);
            return { ok: false, trip: null };
          }
          if (!updated) {
            setError('Assignment failed');
            return { ok: false, trip: null };
          }

          let finalTrip = updated;
          if (
            payload.vehicleId &&
            updated.vehicle_id !== payload.vehicleId
          ) {
            const vehicleStep = await applyFleetVehicleAfterPhone(
              updated,
              payload.vehicleId,
            );
            if (!vehicleStep.ok) {
              setError(null);
              return {
                ok: false,
                trip: vehicleStep.trip,
                driverUpdatedVehicleFailed: true,
                vehicleError:
                  vehicleStep.vehicleError ??
                  'Vehicle update failed after driver was assigned.',
                staleConflict: vehicleStep.staleConflict,
              };
            }
            finalTrip = vehicleStep.trip ?? updated;
          }

          invalidateDrivers(organizationId);
          invalidateVehicles(organizationId);
          return { ok: true, trip: finalTrip };
        }

        const { error: phoneErr, trip: updated, otp } = await assignTripDriverByPhone(
          trip.id,
          orgForDriver,
          payload.phone,
          {
            ...auditOptions,
            driverName: nameTrimmed,
          },
        );
        if (phoneErr || !updated) {
          setError(phoneErr?.message ?? 'Assignment failed');
          return {
            ok: false,
            trip: null,
            staleConflict: isTripReassignStaleError(phoneErr?.message),
          };
        }
        let finalTrip = updated;
        if (payload.vehicleId && updated.vehicle_id !== payload.vehicleId) {
          const vehicleStep = await applyFleetVehicleAfterPhone(
            updated,
            payload.vehicleId,
          );
          if (!vehicleStep.ok) {
            setError(null);
            return {
              ok: false,
              trip: vehicleStep.trip,
              driverUpdatedVehicleFailed: true,
              vehicleError:
                vehicleStep.vehicleError ??
                'Vehicle update failed after driver was assigned.',
              staleConflict: vehicleStep.staleConflict,
            };
          }
          finalTrip = vehicleStep.trip ?? updated;
        }
        invalidateDrivers(organizationId);
        invalidateVehicles(organizationId);
        return { ok: true, trip: finalTrip, otpCode: otp?.code ?? null };
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [
      applyFleetVehicleAfterPhone,
      assertTripNotStale,
      auditOptions,
      driverAssignOrgId,
      invalidateDrivers,
      isAggregate,
      organizationId,
      trip.id,
    ],
  );

  const retryVehicleOnly = useCallback(
    async (vehicleId: string): Promise<{ ok: boolean; trip: TripRow | null; staleConflict?: boolean }> => {
      if (savingRef.current) return { ok: false, trip: null };
      savingRef.current = true;
      setSaving(true);
      setError(null);
      try {
        const { error: vErr, trip: updated } = await updateTripAssignment(
          trip.id,
          { vehicle_id: vehicleId },
          auditOptions,
        );
        if (vErr) {
          setError(vErr.message);
          return {
            ok: false,
            trip: null,
            staleConflict: isTripReassignStaleError(vErr.message),
          };
        }
        invalidateVehicles(organizationId);
        return { ok: true, trip: updated };
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [
      auditOptions,
      invalidateVehicles,
      organizationId,
      trip.id,
    ],
  );

  const loadBusyDriverIds = useCallback(async (): Promise<ActiveDriverAssignmentMap> => {
    const { map } = await getActiveDriverAssignments(organizationId, trip.id);
    return map;
  }, [organizationId, trip.id]);

  const loadBusyVehicleAssignments = useCallback(async () => {
    const { error: loadErr, map } = await getActiveVehicleAssignments(
      organizationId,
      trip.id,
    );
    if (loadErr) {
      return {
        busyVehicleIds: new Set<string>(),
        tripLabelByVehicleId: {} as Record<string, string>,
      };
    }
    return map;
  }, [organizationId, trip.id]);

  return {
    saving,
    error,
    setError,
    reassignCombined,
    reassignByPhone,
    retryVehicleOnly,
    loadBusyDriverIds,
    loadBusyVehicleAssignments,
  };
}
