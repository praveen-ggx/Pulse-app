import type { ExistingDriverMatch } from "@/features/drivers/services/drivers.service";
import {
  getDriverAvailabilityByPhone,
  getDriverAvailabilityByPhoneGlobal,
} from "@/features/trips/services/trips.service";
import { isBusyOnExcludedTrip } from "@/features/trips/utils/assignmentLookupGate.util";
import {
  lookupDriversByPhoneVariants,
  normalizeIndianMobileLast10,
} from "@/features/trips/utils/driverPhoneLookup.util";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useCallback, useEffect, useRef, useState } from "react";

export type AggregateDriverPhoneLookupOptions = {
  phone: string;
  tripId: string;
  organizationId: string;
  driverAssignOrgId: string | null;
  enabled?: boolean;
};

export function useAggregateDriverPhoneLookup({
  phone,
  tripId,
  organizationId,
  driverAssignOrgId,
  enabled = true,
}: AggregateDriverPhoneLookupOptions) {
  const debouncedPhone = useDebouncedValue(phone, 400);
  const [matches, setMatches] = useState<ExistingDriverMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [inTrip, setInTrip] = useState(false);
  const [busyTripLabel, setBusyTripLabel] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const phoneLast10 = normalizeIndianMobileLast10(debouncedPhone);
  const phoneComplete = phoneLast10.length >= 10;

  useEffect(() => {
    if (!enabled) {
      setMatches([]);
      setLoading(false);
      setInTrip(false);
      setBusyTripLabel(null);
      setSelectedUserId(null);
      setLookupError(null);
      return;
    }

    if (!phoneComplete) {
      setMatches([]);
      setLoading(false);
      setInTrip(false);
      setBusyTripLabel(null);
      setSelectedUserId(null);
      setLookupError(null);
      return;
    }

    const requestId = ++requestRef.current;
    setLoading(true);
    setLookupError(null);

    void (async () => {
      try {
        const normalized = debouncedPhone.trim().replace(/\s+/g, "");
        const orgForDriver =
          (driverAssignOrgId ?? organizationId).trim() || organizationId;
        const [foundResult, availability] = await Promise.all([
          lookupDriversByPhoneVariants(debouncedPhone),
          driverAssignOrgId
            ? getDriverAvailabilityByPhoneGlobal(normalized, {
                excludeTripId: tripId,
                anyOpenTripBlocks: true,
                requireAuthoritativeRpc: true,
              })
            : getDriverAvailabilityByPhone(orgForDriver, normalized, {
                excludeTripId: tripId,
              }),
        ]);
        if (requestId !== requestRef.current) return;

        const found = foundResult.matches;
        setMatches(found);
        setSelectedUserId(found.length === 1 ? (found[0]?.user_id ?? null) : null);

        if (availability.error) {
          setLookupError(availability.error.message);
          setInTrip(false);
          setBusyTripLabel(null);
          return;
        }

        const result = availability.result;
        if (isBusyOnExcludedTrip(result.ongoingTripId, tripId)) {
          setInTrip(false);
          setBusyTripLabel(null);
          return;
        }

        setInTrip(result.isBusy);
        setBusyTripLabel(result.ongoingTripLabel ?? null);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setLookupError(
          err instanceof Error ? err.message : "Could not verify driver availability.",
        );
        setInTrip(false);
        setBusyTripLabel(null);
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      requestRef.current += 1;
    };
  }, [
    debouncedPhone,
    phoneComplete,
    tripId,
    organizationId,
    driverAssignOrgId,
    enabled,
  ]);

  const applyMatch = useCallback((match: ExistingDriverMatch) => {
    setSelectedUserId(match.user_id ?? null);
  }, []);

  const suggestedName =
    matches.find((m) => m.user_id === selectedUserId)?.full_name?.trim() ?? null;

  return {
    matches,
    loading,
    inTrip,
    busyTripLabel,
    lookupError,
    selectedUserId,
    setSelectedUserId,
    applyMatch,
    phoneComplete,
    phoneLast10,
    suggestedName,
  };
}
