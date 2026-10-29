import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
import {
  getDriversByOrganization,
  type DriverRow,
  type ExistingDriverMatch,
} from "@/features/drivers/services/drivers.service";
import {
  getSuppliersByOrganization,
  type SupplierRow,
} from "@/features/suppliers/services/suppliers.service";
import { manuallySelectableSuppliers } from "@/features/marketplace/utils/marketplaceParty.util";
import {
  getDriverAvailabilityByPhoneGlobal,
  getTripsByOrganization,
} from "@/features/trips/services/trips.service";
import {
  getVehiclesByOrganization,
  type VehicleRow,
} from "@/features/vehicles/services/vehicles.service";
import { lookupDriversByPhoneVariants, normalizeIndianMobileLast10, enrichDriverMatchesWithFleetAvatars } from "@/features/trips/utils/driverPhoneLookup.util";
import type { AddTripFormState } from "@/features/trips/components/add-trip/types";
import type { useAddTripForm } from "@/features/trips/components/add-trip/useAddTripForm";

const TRIP_TERMINAL_STATUSES = new Set([
  "completed",
  "cancelled",
  "canceled",
  "done",
  "delivered",
]);

export function useAddTripFleetResources(
  organizationId: string | null,
  state: AddTripFormState,
  setters: ReturnType<typeof useAddTripForm>["setters"],
) {
  const { status } = useAuth();
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [driverIdsOnActiveTrip, setDriverIdsOnActiveTrip] = useState<string[]>([]);
  const [vehicleIdsOnActiveTrip, setVehicleIdsOnActiveTrip] = useState<string[]>([]);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [driverPhoneMatches, setDriverPhoneMatches] = useState<ExistingDriverMatch[]>([]);
  const [driverPhoneLookupLoading, setDriverPhoneLookupLoading] = useState(false);
  const [selectedDriverMatchId, setSelectedDriverMatchId] = useState<string | null>(null);
  const driverPhoneLookupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const driverPhoneLookupGenRef = useRef(0);

  const fetchFleet = useCallback(() => {
    if (!organizationId || status === "restoring") return;
    setFleetLoading(true);
    void Promise.all([
      getDriversByOrganization(organizationId),
      getVehiclesByOrganization(organizationId),
      getTripsByOrganization(organizationId),
    ]).then(([dRes, vRes, tRes]) => {
      const allDrivers = dRes.error ? [] : (dRes.drivers ?? []);
      setDrivers(allDrivers.filter((d) => !d.left_at));
      setVehicles(vRes.error ? [] : vRes.vehicles);
      const trips = tRes.error ? [] : (tRes.trips ?? []);
      const activeTrips = trips.filter((t) => {
        const status = String(t.status ?? "").trim().toLowerCase();
        return !TRIP_TERMINAL_STATUSES.has(status);
      });
      setDriverIdsOnActiveTrip(
        Array.from(
          new Set(
            activeTrips.filter((t) => t.driver_id).map((t) => t.driver_id as string),
          ),
        ),
      );
      setVehicleIdsOnActiveTrip(
        Array.from(
          new Set(
            activeTrips.filter((t) => t.vehicle_id).map((t) => t.vehicle_id as string),
          ),
        ),
      );
      setFleetLoading(false);
    });
  }, [organizationId, status]);

  /** Org id we successfully loaded suppliers for (null = none / last load failed). */
  const suppliersFetchedForOrgRef = useRef<string | null>(null);
  /** Org id with an in-flight supplier request — blocks double-fetch on mount. */
  const suppliersInFlightOrgRef = useRef<string | null>(null);
  const organizationIdRef = useRef(organizationId);
  organizationIdRef.current = organizationId;
  const supplySourceRef = useRef(state.supplySource);
  supplySourceRef.current = state.supplySource;

  const fetchSuppliers = useCallback((opts?: { force?: boolean }) => {
    const orgId = organizationIdRef.current;
    if (!orgId) return;
    // Focus refresh clears a successful cache entry, but still coalesces with
    // an in-flight request for the same org (avoids double mount fetch).
    if (opts?.force) {
      suppliersFetchedForOrgRef.current = null;
    }
    if (suppliersFetchedForOrgRef.current === orgId) return;
    if (suppliersInFlightOrgRef.current === orgId) return;
    // Claim the slot when the request starts so focus + aggregate effects
    // in the same commit do not both hit the network.
    suppliersInFlightOrgRef.current = orgId;
    suppliersFetchedForOrgRef.current = orgId;
    setSuppliersLoading(true);
    void getSuppliersByOrganization(orgId)
      .then((r) => {
        // Staleness: ignore a late response after an org switch.
        if (organizationIdRef.current !== orgId) return;
        if (r.error) {
          // Failed load must not stick in the de-dupe cache — allow retry.
          if (suppliersFetchedForOrgRef.current === orgId) {
            suppliersFetchedForOrgRef.current = null;
          }
          setSuppliers([]);
          return;
        }
        setSuppliers(manuallySelectableSuppliers(r.suppliers));
      })
      .finally(() => {
        if (suppliersInFlightOrgRef.current === orgId) {
          suppliersInFlightOrgRef.current = null;
        }
        if (organizationIdRef.current === orgId) {
          setSuppliersLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    if (organizationId && status !== "restoring") fetchFleet();
  }, [organizationId, status, fetchFleet]);

  useFocusEffect(
    useCallback(() => {
      if (!organizationId || status === "restoring") return;
      fetchFleet();
      // Asset-only flows do not need the supplier list; Aggregate refreshes on focus.
      if (supplySourceRef.current === "aggregate") {
        fetchSuppliers({ force: true });
      }
    }, [organizationId, status, fetchFleet, fetchSuppliers]),
  );

  useEffect(() => {
    if (!organizationId || state.supplySource !== "aggregate") return;
    fetchSuppliers();
  }, [organizationId, state.supplySource, fetchSuppliers]);

  useEffect(() => {
    if (
      state.driverId &&
      driverIdsOnActiveTrip.length > 0 &&
      driverIdsOnActiveTrip.includes(state.driverId)
    ) {
      setters.setDriverId(null);
    }
  }, [state.driverId, driverIdsOnActiveTrip, setters]);

  useEffect(() => {
    if (
      state.vehicleId &&
      vehicleIdsOnActiveTrip.length > 0 &&
      vehicleIdsOnActiveTrip.includes(state.vehicleId)
    ) {
      setters.setVehicleId(null);
    }
  }, [state.vehicleId, vehicleIdsOnActiveTrip, setters]);

  const applyDriverPhoneMatch = useCallback(
    (match: ExistingDriverMatch) => {
      const name = match.full_name?.trim() || "";
      setSelectedDriverMatchId(match.user_id);
      setters.setDriverPhoneName(name || null);
      if (name) setters.setAggregateDriverName(name);
      setters.setDriverPhoneConfirmed(Boolean(name));
    },
    [setters],
  );

  useEffect(() => {
    if (state.supplySource !== "aggregate" || state.assignLater) {
      // Always-new [] / false would re-render forever (Maximum update depth).
      setDriverPhoneMatches((prev) => (prev.length === 0 ? prev : []));
      setDriverPhoneLookupLoading((prev) => (prev ? false : prev));
      setSelectedDriverMatchId((prev) => (prev == null ? prev : null));
      return;
    }
    const trimmed = state.driverPhone.trim();
    const last10 = normalizeIndianMobileLast10(trimmed);
    if (last10.length < 10) {
      setDriverPhoneMatches((prev) => (prev.length === 0 ? prev : []));
      setDriverPhoneLookupLoading((prev) => (prev ? false : prev));
      setSelectedDriverMatchId((prev) => (prev == null ? prev : null));
      // Setters no-op when already cleared — avoids Maximum update depth.
      setters.setDriverPhoneName(null);
      setters.setDriverPhoneConfirmed(false);
      setters.setDriverPhoneTripConflict(false, null);
      return;
    }
    if (driverPhoneLookupTimeoutRef.current) {
      clearTimeout(driverPhoneLookupTimeoutRef.current);
    }
    const gen = ++driverPhoneLookupGenRef.current;
    setDriverPhoneLookupLoading(true);
    // Reset platform suggestion until this lookup finishes (allows free-text name).
    setSelectedDriverMatchId(null);
    setters.setDriverPhoneName(null);
    setters.setDriverPhoneConfirmed(false);

    driverPhoneLookupTimeoutRef.current = setTimeout(() => {
      void lookupDriversByPhoneVariants(trimmed).then(async ({ error: err, matches }) => {
        if (driverPhoneLookupGenRef.current !== gen) return;
        setDriverPhoneLookupLoading(false);
        if (err) {
          setDriverPhoneMatches([]);
          setters.setDriverPhoneName(null);
          setters.setDriverPhoneConfirmed(false);
          return;
        }
        setDriverPhoneMatches(matches);

        if (matches.length === 0) {
          // No profile — dispatcher can type the name freely.
          setSelectedDriverMatchId(null);
          setters.setDriverPhoneName(null);
          setters.setDriverPhoneConfirmed(false);
          setters.setDriverPhoneTripConflict(false, null);
          return;
        }

        const { error: avErr, result } = await getDriverAvailabilityByPhoneGlobal(last10, {
          anyOpenTripBlocks: true,
          requireAuthoritativeRpc: true,
        });
        if (driverPhoneLookupGenRef.current !== gen) return;
        if (avErr) {
          setters.setDriverPhoneTripConflict(true, "Busy check unavailable");
          // Soft warning — still auto-select single match so Create Trip is not blocked.
          if (matches.length === 1) applyDriverPhoneMatch(matches[0]);
          return;
        }
        setters.setDriverPhoneTripConflict(result.isBusy, result.ongoingTripLabel);
        if (matches.length === 1) applyDriverPhoneMatch(matches[0]);
      });
    }, 400);
    return () => {
      if (driverPhoneLookupTimeoutRef.current) {
        clearTimeout(driverPhoneLookupTimeoutRef.current);
      }
    };
  }, [
    state.supplySource,
    state.assignLater,
    state.driverPhone,
    setters,
    applyDriverPhoneMatch,
  ]);

  const driverOptions = useMemo(
    () =>
      drivers.map((d) => ({
        ...d,
        isBusy: driverIdsOnActiveTrip.includes(d.id),
      })),
    [drivers, driverIdsOnActiveTrip],
  );

  const vehicleOptions = useMemo(
    () =>
      vehicles.map((v) => ({
        ...v,
        isBusy: vehicleIdsOnActiveTrip.includes(v.id),
      })),
    [vehicles, vehicleIdsOnActiveTrip],
  );

  const availableDrivers = drivers.filter((d) => !driverIdsOnActiveTrip.includes(d.id));
  const availableVehicles = vehicles.filter((v) => !vehicleIdsOnActiveTrip.includes(v.id));

  const selectedDriverRow =
    driverOptions.find((d) => String(d.id) === String(state.driverId)) ?? null;
  const selectedVehicleRow =
    vehicleOptions.find((v) => String(v.id) === String(state.vehicleId)) ?? null;
  const selectedSupplierRow =
    suppliers.find((s) => s.id === state.supplierId) ?? null;

  const assignLaterSwitchDisabled = useMemo(() => {
    const aggregateDriverFoundByPhone = !!(
      state.driverPhoneName && state.driverPhone.trim()
    );
    const aggregateBothSet =
      state.supplySource === "aggregate" &&
      !state.assignLater &&
      state.driverPhone.trim().length > 0 &&
      state.aggregateVehicleText.trim().length > 0 &&
      (!aggregateDriverFoundByPhone || state.driverPhoneConfirmed);
    const assetBothSet =
      state.supplySource === "asset" &&
      !state.assignLater &&
      Boolean(state.driverId && state.vehicleId);
    return state.supplySource === "asset" ? assetBothSet : aggregateBothSet;
  }, [state]);

  const assetFleetWarningLines = useMemo(() => {
    if (state.supplySource !== "asset" || state.assignLater || fleetLoading) return [];
    const lines: string[] = [];
    if (availableDrivers.length === 0) {
      lines.push(
        drivers.length === 0
          ? "No drivers yet — add drivers from Resources first."
          : "Some drivers are on active trips — pick an available driver or use Assign later.",
      );
    }
    if (availableVehicles.length === 0) {
      lines.push(
        vehicles.length === 0
          ? "No vehicles yet — add vehicles from Resources first."
          : "Busy vehicles are on trip — pick an available vehicle or use Assign later.",
      );
    }
    return lines;
  }, [
    state.supplySource,
    state.assignLater,
    fleetLoading,
    availableDrivers.length,
    availableVehicles.length,
    drivers.length,
    vehicles.length,
  ]);

  const enrichedDriverPhoneMatches = useMemo(
    () => enrichDriverMatchesWithFleetAvatars(driverPhoneMatches, drivers),
    [driverPhoneMatches, drivers],
  );

  return {
    drivers,
    vehicles,
    suppliers,
    fleetLoading,
    suppliersLoading,
    driverOptions,
    vehicleOptions,
    availableDrivers,
    availableVehicles,
    selectedDriverRow,
    selectedVehicleRow,
    selectedSupplierRow,
    driverPhoneMatches: enrichedDriverPhoneMatches,
    driverPhoneLookupLoading,
    selectedDriverMatchId,
    applyDriverPhoneMatch,
    assignLaterSwitchDisabled,
    assetFleetWarningLines,
    refetchFleet: fetchFleet,
    refetchSuppliers: fetchSuppliers,
  };
}
