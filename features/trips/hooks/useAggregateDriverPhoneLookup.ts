import type { ExistingDriverMatch } from "@/features/drivers/services/drivers.service";
import {
  getDriverAvailabilityByPhone,
  getDriverAvailabilityByPhoneGlobal,
} from "@/features/trips/services/trips.service";
import {
  lookupDriversByPhoneVariants,
  normalizeIndianMobileLast10,
} from "@/features/trips/utils/driverPhoneLookup.util";
import { isSameDriverPhone } from "@/features/trips/utils/reassignChangeDetection.util";
import { useCallback, useEffect, useRef, useState } from "react";

export type AggregateDriverPhoneLookupOptions = {
  phone: string;
  tripId: string;
  organizationId: string;
  driverAssignOrgId: string | null;
  /** When set, this trip's current driver is never treated as "already on a trip". */
  currentDriverPhone?: string | null;
  enabled?: boolean;
};

export function useAggregateDriverPhoneLookup({
  phone,
  tripId,
  organizationId,
  driverAssignOrgId,
  currentDriverPhone = null,
  enabled = true,
}: AggregateDriverPhoneLookupOptions) {
  const last10 = normalizeIndianMobileLast10(phone);
  const phoneComplete = last10.length >= 10;
  const [matches, setMatches] = useState<ExistingDriverMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [inTrip, setInTrip] = useState(false);
  const [busyTripLabel, setBusyTripLabel] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const fetchedKeyRef = useRef<string | null>(null);
  const busyRef = useRef<{ isBusy: boolean; label: string | null }>({
    isBusy: false,
    label: null,
  });

  const lookupKey = phoneComplete
    ? `${last10}|${tripId}|${organizationId}|${driverAssignOrgId ?? ""}`
    : "";

  useEffect(() => {
    if (!enabled || !phoneComplete) {
      fetchedKeyRef.current = null;
      setMatches([]);
      setLoading(false);
      setInTrip(false);
      setBusyTripLabel(null);
      setSelectedUserId(null);
      setLookupError(null);
      return;
    }

    if (fetchedKeyRef.current === lookupKey) {
      return;
    }

    const requestId = ++requestRef.current;
    setLoading(true);
    setLookupError(null);
    setSelectedUserId(null);

    void (async () => {
      try {
        const orgForDriver =
          (driverAssignOrgId ?? organizationId).trim() || organizationId;
        const [lookupResult, availability] = await Promise.all([
          lookupDriversByPhoneVariants(last10),
          driverAssignOrgId
            ? getDriverAvailabilityByPhoneGlobal(last10, {
                excludeTripId: tripId,
                anyOpenTripBlocks: true,
                requireAuthoritativeRpc: true,
              })
            : getDriverAvailabilityByPhone(orgForDriver, last10, {
                excludeTripId: tripId,
              }),
        ]);
        if (requestId !== requestRef.current) return;

        if (lookupResult.error && lookupResult.matches.length === 0) {
          setLookupError(lookupResult.error.message);
        }

        const found = lookupResult.matches;
        setMatches(found);
        const autoId = found.length === 1 ? (found[0]?.user_id ?? null) : null;
        setSelectedUserId(autoId);

        const { error: availabilityError, result } = availability;
        if (availabilityError) {
          setLookupError(availabilityError.message);
          busyRef.current = { isBusy: false, label: null };
          setInTrip(false);
          setBusyTripLabel(null);
          fetchedKeyRef.current = lookupKey;
          return;
        }

        busyRef.current = {
          isBusy: Boolean(result.isBusy),
          label: result.ongoingTripLabel ?? null,
        };
        const editingCurrent = isSameDriverPhone(last10, currentDriverPhone);
        setInTrip(Boolean(result.isBusy) && !editingCurrent);
        setBusyTripLabel(editingCurrent ? null : result.ongoingTripLabel ?? null);
        fetchedKeyRef.current = lookupKey;
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setLookupError(
          err instanceof Error ? err.message : "Could not verify driver availability.",
        );
        busyRef.current = { isBusy: false, label: null };
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
    driverAssignOrgId,
    enabled,
    last10,
    lookupKey,
    organizationId,
    phoneComplete,
    tripId,
  ]);

  useEffect(() => {
    if (!enabled || !phoneComplete) return;
    const editingCurrent = isSameDriverPhone(last10, currentDriverPhone);
    setInTrip(busyRef.current.isBusy && !editingCurrent);
    setBusyTripLabel(editingCurrent ? null : busyRef.current.label);
  }, [currentDriverPhone, enabled, last10, phoneComplete]);

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
    phoneLast10: last10,
    suggestedName,
  };
}
