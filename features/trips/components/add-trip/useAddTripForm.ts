/**
 * Add Trip — form state, validation, and payload builder.
 * Keeps modal component thin and makes it easy to add steps/fields later.
 * Validation: single O(n) pass over fields.
 */
import { validatePhone } from '@/lib/phoneValidation';
import {
    VALIDATION,
    maxLength,
    nonNegativeAmount,
    positiveAmount,
    required,
    runValidators,
} from '@/lib/validation';
import { getOptimalRoute } from '@/lib/routingService';
import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react';
import { computeClientPrice } from "@/features/clients/utils/saleRateSnapshot.util";
import type { AddTripFormData, AddTripFormState } from './types';
import { tonsOutsideVehicleRange } from '@/features/vehicles/utils/vehicleTypeCatalog.model';
import {
  routeExtraStopInputs,
  type RouteExtraStopDraft,
} from '@/features/trips/utils/routeExtraStops.util';

export type AddTripIssueField =
  | 'pickup'
  | 'drop'
  | 'tripDate'
  | 'tons'
  | 'vehicleType'
  | 'loadType'
  | 'client'
  | 'clientPrice'
  | 'partner'
  | 'partnerRate'
  | 'vehicleNumber'
  | 'driverName'
  | 'driverPhone'
  | 'driverConfirm'
  | 'advancePaid'
  | 'notes'
  | 'assetDriver'
  | 'assetVehicle'
  | 'marketFulfillment'
  | 'circulation'
  | 'supplierTarget';

export interface AddTripValidationIssue {
  field: AddTripIssueField;
  message: string;
}

/** Collects every blocking validation issue (same rules as legacy single-message validation). */
export function getAddTripValidationIssues(
  state: AddTripFormState,
): AddTripValidationIssue[] {
  return computeValidationIssues(state);
}

function computeValidationIssues(state: AddTripFormState): AddTripValidationIssue[] {
  const issues: AddTripValidationIssue[] = [];
  const push = (field: AddTripIssueField, message: string) => {
    issues.push({ field, message });
  };

  const errPick = runValidators(state.pickupArea, [required(), maxLength(255)]);
  if (errPick) push('pickup', `Pickup area: ${errPick}`);

  const errDrop = runValidators(state.dropLocation, [required(), maxLength(255)]);
  if (errDrop) push('drop', `Drop location: ${errDrop}`);

  if (state.tripStartDate.trim()) {
    const dateIsoRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateIsoRe.test(state.tripStartDate.trim())) {
      push('tripDate', 'Trip start date: use YYYY-MM-DD');
    }
  }

  if (state.tons.trim()) {
    const tonsNum = Number(state.tons);
    if (!Number.isFinite(tonsNum) || tonsNum < 0) {
      push('tons', 'Tons: enter a valid non-negative number');
    }
  }

  const errClient = runValidators(state.clientName, [required(), maxLength(VALIDATION.CLIENT_SUPPLIER_NAME_MAX_LENGTH)]);
  if (errClient) push('client', `Client: ${errClient}`);

  const isPerMtSale = state.saleRateBasis === "per_mt";
  const isBidShareDraft =
    state.supplySource === 'aggregate' && state.marketFulfillment === 'bid';

  if (isPerMtSale) {
    const errUnit = positiveAmount()(state.saleUnitRate);
    if (errUnit) push("clientPrice", `Per-MT rate: ${errUnit}`);
    else if (!isBidShareDraft) {
      // A trip needs a real client price, and on a ₹/MT lane that total only
      // exists once a weight is known — without it the price settles at 0.
      // An indent shared for bidding is exempt: the ₹/MT rate is the price,
      // and the actual weight is not known until the truck is loaded.
      const tonsTrim = state.tons.trim();
      const tonsNum = Number(tonsTrim);
      if (!tonsTrim || !Number.isFinite(tonsNum) || tonsNum <= 0) {
        push(
          "tons",
          `This lane is priced at ₹${state.saleUnitRate}/MT — enter load weight in tons to calculate the client price`,
        );
      }
    }
  } else {
    const errPrice = positiveAmount()(state.clientPrice);
    if (errPrice) push("clientPrice", `Client price: ${errPrice}`);
  }

  const isBidShare = state.supplySource === 'aggregate' && state.marketFulfillment === 'bid';

  if (state.supplySource === 'aggregate' && !isBidShare) {
    if (!state.supplierId) {
      push('partner', 'Select a transport partner');
    }
    const err5 = nonNegativeAmount()(state.supplierRate);
    if (err5) push('partnerRate', `Partner rate: ${err5}`);

    if (!state.assignLater) {
      const vehicleTrimmed = state.aggregateVehicleText.trim();
      if (!vehicleTrimmed) push('vehicleNumber', 'Vehicle: required for aggregate trips');
      const nameTrimmed = state.aggregateDriverName.trim();
      if (!nameTrimmed) push('driverName', 'Driver name: required for aggregate trips');
      else if (nameTrimmed.length < 2) push('driverName', 'Driver name: enter at least 2 characters');
      else if (/^driver$/i.test(nameTrimmed)) {
        push('driverName', 'Driver name: enter the driver’s real name');
      }
      const driverPhoneTrimmed = state.driverPhone.trim();
      if (!driverPhoneTrimmed) push('driverPhone', 'Driver for tracking: required for aggregate trips');
    }
  }

  if (isBidShare) {
    const circ = state.circulationTarget;
    if (
      circ !== 'integrated_supplier' &&
      circ !== 'marketplace' &&
      circ !== 'both'
    ) {
      push('circulation', 'Choose Network, Marketplace, or both');
    }
    const errTarget = positiveAmount()(state.supplierTarget);
    if (errTarget) push('supplierTarget', `Supplier target rate: ${errTarget}`);
    const vt = state.vehicleType.trim();
    if (!vt) push('vehicleType', 'Vehicle type: required to share for bidding');
    const lt = state.loadType.trim();
    if (!lt) push('loadType', 'Load type: required to share for bidding');
    // Per-MT lanes already raise a rate-aware weight message above; adding the
    // generic one here would surface two `tons` errors for the same field.
    if (state.saleRateBasis !== 'per_mt') {
      const tonsTrim = state.tons.trim();
      if (!tonsTrim) push('tons', 'Weight: required to share for bidding');
      else {
        const tonsNum = Number(tonsTrim);
        if (!Number.isFinite(tonsNum) || tonsNum <= 0) {
          push('tons', 'Tons: enter a valid weight greater than 0');
        }
      }
    }
  }

  if (state.supplySource === 'asset' && !state.assignLater) {
    if (!state.driverId) push('assetDriver', 'Driver: required');
    if (!state.vehicleId) push('assetVehicle', 'Vehicle: required');
  }

  if (state.advancePaid.trim()) {
    const err6 = nonNegativeAmount()(state.advancePaid);
    if (err6) push('advancePaid', `Advance paid: ${err6}`);
  }

  const notesWithVehicle =
    state.supplySource === 'aggregate' &&
    !isBidShare &&
    state.aggregateVehicleText.trim()
      ? (state.notes.trim() ? state.notes.trim() + '\n' : '') + 'Vehicle: ' + state.aggregateVehicleText.trim()
      : state.notes;
  const err7 = maxLength(VALIDATION.NOTES_MAX_LENGTH)(notesWithVehicle);
  if (err7) push('notes', `Notes: ${err7}`);

  if (
    state.supplySource === 'aggregate' &&
    !isBidShare &&
    state.driverPhone.trim()
  ) {
    const err8 = validatePhone(state.driverPhone.trim());
    if (err8) push('driverPhone', `Driver for tracking: ${err8}`);
  }

  // Trip-conflict is a soft warning (PRD: dispatcher can still create / force-assign).
  // Do not push a blocking validation issue — UI shows the warning separately.

  // Platform phone lookup suggested a name — require picking it (or matching typed name).
  // When there is no platform match, free-text aggregateDriverName is enough.
  if (
    state.supplySource === 'aggregate' &&
    !isBidShare &&
    !state.assignLater &&
    state.driverPhoneName &&
    !state.driverPhoneConfirmed
  ) {
    const typed = state.aggregateDriverName.trim();
    const suggested = state.driverPhoneName.trim();
    if (!typed || typed.toLowerCase() !== suggested.toLowerCase()) {
      push('driverConfirm', 'Select a driver name from the recommendations');
    }
  }

  return issues;
}

/** Mobile wizard commodity step — optional fields; validate tons only when provided. */
export function computeCommodityStepIssues(
  state: AddTripFormState,
): AddTripValidationIssue[] {
  const issues: AddTripValidationIssue[] = [];
  if (state.tons.trim()) {
    const tonsNum = Number(state.tons);
    if (!Number.isFinite(tonsNum) || tonsNum <= 0) {
      issues.push({ field: 'tons', message: 'Tons: enter a valid weight greater than 0' });
    } else {
      const range = tonsOutsideVehicleRange(state.vehicleType, state.tons);
      if (range) {
        issues.push({
          field: 'tons',
          message: `Tons: must be within this vehicle's ${range.min === range.max ? range.min : `${range.min}–${range.max}`} tons`,
        });
      }
    }
  }
  return issues;
}

const initialState: AddTripFormState = {
  pickupArea: '',
  dropLocation: '',
  extraStops: [],
  tripStartDate: '',
  tons: '',
  vehicleType: '',
  loadType: '',
  pickupLat: null,
  pickupLon: null,
  dropLat: null,
  dropLon: null,
  routeDistanceKm: null,
  routeEtaInterval: null,
  routeEtaLabel: null,
  routeLoading: false,
  clientName: '',
  clientId: null,
  clientPrice: '',
  saleRateBasis: 'per_trip',
  saleUnitRate: '',
  laneId: null,
  supplierRate: '',
  supplySource: 'asset',
  marketFulfillment: null,
  circulationTarget: 'integrated_supplier',
  supplierTarget: '',
  supplierRateBasis: 'per_trip',
  supplierId: null,
  supplierDisplayName: '',
  advancePaid: '',
  assignLater: false,
  notes: '',
  driverId: null,
  driverCommissionPercent: null,
  driverCommissionPerKm: null,
  vehicleId: null,
  driverPhone: '',
  aggregateDriverName: '',
  driverPhoneName: null,
  driverPhoneConfirmed: false,
  driverPhoneTripConflict: false,
  driverPhoneTripConflictLabel: null,
  aggregateVehicleText: '',
  aggregateDriverCommissionPercent: '',
};

export const ADD_TRIP_FORM_INITIAL_STATE: AddTripFormState = initialState;

export function buildAddTripPayload(state: AddTripFormState): AddTripFormData {
  const parseAmount = (raw: string) => {
    const n = parseFloat(String(raw ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const unitRate = parseAmount(state.saleUnitRate);
  const tonsNum = parseAmount(state.tons);
  const clientPrice =
    state.saleRateBasis === "per_mt"
      ? computeClientPrice({
          basis: "per_mt",
          unitRate,
          tons: tonsNum,
        })
      : parseAmount(state.clientPrice);
  const supplierRate =
    state.supplySource === "asset" ? 0 : parseAmount(state.supplierRate);
  const extraStops = routeExtraStopInputs(state.extraStops);
  const advancePaid = parseAmount(state.advancePaid);
  let notes = state.notes.trim();
  if (state.vehicleType.trim()) {
    notes =
      (notes ? notes + "\n" : "") + `Vehicle type: ${state.vehicleType.trim()}`;
  }
  if (state.tons.trim()) {
    notes = (notes ? notes + "\n" : "") + `Load: ${state.tons.trim()} Tons`;
  }
  if (state.supplySource === "aggregate" && state.aggregateDriverName.trim()) {
    notes =
      (notes ? notes + "\n" : "") +
      "Driver name (tracking): " +
      state.aggregateDriverName.trim();
  }
  if (state.supplySource === "aggregate" && state.aggregateVehicleText.trim()) {
    notes =
      (notes ? notes + "\n" : "") +
      "Vehicle: " +
      state.aggregateVehicleText.trim();
  }
  return {
    pickup_area: state.pickupArea.trim(),
    drop_location: state.dropLocation.trim(),
    pickup_lat: state.pickupLat ?? undefined,
    pickup_lon: state.pickupLon ?? undefined,
    drop_lat: state.dropLat ?? undefined,
    drop_lon: state.dropLon ?? undefined,
    pickup_date: state.tripStartDate.trim() || null,
    distance: state.routeDistanceKm ?? undefined,
    estimated_duration: state.routeEtaInterval ?? undefined,
    client_name: state.clientName.trim(),
    client_id: state.clientId,
    client_price: clientPrice,
    sale_rate_basis: state.saleRateBasis,
    sale_unit_rate:
      state.saleRateBasis === "per_mt" && unitRate > 0 ? unitRate : null,
    lane_id: state.laneId,
    supplier_rate: supplierRate,
    supplier_id:
      state.supplySource === "aggregate" ? state.supplierId || null : null,
    supplier_name:
      state.supplySource === "aggregate" && state.supplierId
        ? state.supplierDisplayName.trim() || null
        : null,
    advance_paid:
      state.supplySource === "aggregate" && advancePaid > 0
        ? advancePaid
        : undefined,
    notes: notes || null,
    driver_id:
      state.supplySource === "asset" && !state.assignLater
        ? state.driverId || null
        : null,
    driver_commission_percent:
      state.supplySource === "asset" && !state.assignLater
        ? state.driverCommissionPercent ?? null
        : state.supplySource === "aggregate" && !state.assignLater
          ? Number(state.aggregateDriverCommissionPercent) || null
          : null,
    driver_commission_per_km:
      state.supplySource === "asset" && !state.assignLater
        ? state.driverCommissionPerKm ?? null
        : null,
    vehicle_id:
      state.supplySource === "asset" && !state.assignLater
        ? state.vehicleId || null
        : null,
    vehicle_display_number:
      state.supplySource === "aggregate" && state.aggregateVehicleText.trim()
        ? state.aggregateVehicleText.trim()
        : undefined,
    tons: state.tons.trim() || null,
    load_type: state.loadType.trim() || null,
    vehicle_type: state.vehicleType.trim() || null,
    ...(extraStops.length > 0 ? { extra_stops: extraStops } : {}),
  };
}

export function useAddTripForm(options?: {
  initialSupplySource?: AddTripFormState["supplySource"];
}) {
  const [state, setState] = useState<AddTripFormState>(() => ({
    ...initialState,
    supplySource: options?.initialSupplySource ?? initialState.supplySource,
  }));

  useEffect(() => {
    const next = options?.initialSupplySource;
    if (!next) return;
    setState((s) => (s.supplySource === next ? s : { ...s, supplySource: next }));
  }, [options?.initialSupplySource]);

  const setPickupArea = useCallback((v: string) => setState((s) => ({
    ...s,
    pickupArea: v,
    ...(v.trim() ? {} : { pickupLat: null, pickupLon: null }),
  })), []);
  const setDropLocation = useCallback((v: string) => setState((s) => ({
    ...s,
    dropLocation: v,
    ...(v.trim() ? {} : { dropLat: null, dropLon: null }),
  })), []);
  const setPickupCoords = useCallback(
    (lat: number | null, lon: number | null) =>
      setState((s) => ({ ...s, pickupLat: lat, pickupLon: lon })),
    [],
  );
  const setExtraStops = useCallback(
    (next: SetStateAction<RouteExtraStopDraft[]>) =>
      setState((s) => ({
        ...s,
        extraStops: typeof next === "function" ? next(s.extraStops) : next,
      })),
    [],
  );
  const setDropCoords = useCallback((lat: number, lon: number) => setState((s) => ({ ...s, dropLat: lat, dropLon: lon })), []);
  const setTripStartDate = useCallback((v: string) => setState((s) => ({ ...s, tripStartDate: v })), []);
  const setTons = useCallback((v: string) => setState((s) => ({ ...s, tons: v })), []);
  const setVehicleType = useCallback(
    (v: string) => setState((s) => ({ ...s, vehicleType: v })),
    [],
  );
  const setLoadType = useCallback(
    (v: string) => setState((s) => ({ ...s, loadType: v })),
    [],
  );
  const applyPrefill = useCallback((partial: Partial<AddTripFormState>) => {
    setState((s) => ({ ...s, ...partial }));
  }, []);
  const resetForm = useCallback(() => setState(initialState), []);
  const setClientName = useCallback((v: string) => setState((s) => ({ ...s, clientName: v, clientId: null })), []);
  const setClientId = useCallback((id: string | null) => setState((s) => ({ ...s, clientId: id })), []);
  const setClientSelection = useCallback((id: string | null, name: string) => setState((s) => ({ ...s, clientId: id, clientName: name })), []);
  const setClientPrice = useCallback((v: string) => setState((s) => ({ ...s, clientPrice: v })), []);
  const setSaleRateBasis = useCallback(
    (v: AddTripFormState["saleRateBasis"]) =>
      setState((s) => ({ ...s, saleRateBasis: v })),
    [],
  );
  const setSaleUnitRate = useCallback(
    (v: string) => setState((s) => ({ ...s, saleUnitRate: v })),
    [],
  );
  const setLaneId = useCallback(
    (v: string | null) => setState((s) => ({ ...s, laneId: v })),
    [],
  );
  const setSupplierRate = useCallback((v: string) => setState((s) => ({ ...s, supplierRate: v })), []);
  const setSupplySource = useCallback((v: AddTripFormState['supplySource']) => setState((s) => ({
    ...s,
    supplySource: v,
    marketFulfillment: v === 'asset' ? null : s.marketFulfillment,
    supplierId: v === 'aggregate' ? s.supplierId : null,
    supplierDisplayName: v === 'aggregate' ? s.supplierDisplayName : '',
    driverId: v === 'asset' ? s.driverId : null,
    vehicleId: v === 'asset' ? s.vehicleId : null,
    driverPhone: v === 'asset' ? '' : s.driverPhone,
    driverPhoneName: v === 'asset' ? null : s.driverPhoneName,
    driverPhoneConfirmed: v === 'asset' ? false : s.driverPhoneConfirmed,
    driverPhoneTripConflict: v === 'asset' ? false : s.driverPhoneTripConflict,
    driverPhoneTripConflictLabel: v === 'asset' ? null : s.driverPhoneTripConflictLabel,
    aggregateVehicleText: v === 'asset' ? '' : s.aggregateVehicleText,
    aggregateDriverCommissionPercent:
      v === 'asset' ? '' : s.aggregateDriverCommissionPercent,
  })), []);
  const setMarketFulfillment = useCallback(
    (v: AddTripFormState['marketFulfillment']) =>
      setState((s) => ({ ...s, marketFulfillment: v })),
    [],
  );
  const setCirculationTarget = useCallback(
    (v: AddTripFormState['circulationTarget']) =>
      setState((s) => ({ ...s, circulationTarget: v })),
    [],
  );
  const setSupplierTarget = useCallback(
    (v: string) => setState((s) => ({ ...s, supplierTarget: v })),
    [],
  );
  const setSupplierRateBasis = useCallback(
    (v: AddTripFormState['supplierRateBasis']) =>
      setState((s) => ({ ...s, supplierRateBasis: v })),
    [],
  );
  const setSupplierSelection = useCallback(
    (id: string | null, displayName?: string | null) =>
      setState((s) => ({
        ...s,
        supplierId: id,
        supplierDisplayName: id ? String(displayName ?? '').trim() : '',
      })),
    [],
  );
  const setAdvancePaid = useCallback((v: string) => setState((s) => ({ ...s, advancePaid: v })), []);
  const setAssignLater = useCallback((v: boolean) =>
    setState((s) => ({
      ...s,
      assignLater: v,
      ...(v && s.supplySource === 'asset'
        ? { driverId: null as string | null, vehicleId: null as string | null }
        : {}),
      ...(v && s.supplySource === 'aggregate'
        ? {
            driverPhone: '',
            aggregateDriverName: '',
            driverPhoneName: null as string | null,
            driverPhoneConfirmed: false,
            driverPhoneTripConflict: false,
            driverPhoneTripConflictLabel: null as string | null,
            aggregateVehicleText: '',
            aggregateDriverCommissionPercent: '',
          }
        : {}),
    })),
  []);
  const setNotes = useCallback((v: string) => setState((s) => ({ ...s, notes: v })), []);
  const setDriverId = useCallback((v: string | null) => setState((s) => ({
    ...s,
    driverId: v,
    driverCommissionPercent: null,
    driverCommissionPerKm: null,
  })), []);
  const setDriver = useCallback((
    id: string | null,
    commissionPercent: number | null,
    commissionPerKm: number | null,
  ) => setState((s) => ({
    ...s,
    driverId: id,
    driverCommissionPercent: commissionPercent ?? null,
    driverCommissionPerKm: commissionPerKm ?? null,
  })), []);
  const setVehicleId = useCallback((v: string | null) => setState((s) => ({ ...s, vehicleId: v })), []);
  const setDriverPhone = useCallback(
    (v: string) =>
      setState((s) => ({
        ...s,
        driverPhone: v,
        // A new lookup must be re-confirmed by the user.
        driverPhoneConfirmed: false,
        driverPhoneTripConflict: false,
        driverPhoneTripConflictLabel: null,
      })),
    [],
  );
  const setDriverPhoneTripConflict = useCallback(
    (conflict: boolean, label: string | null) =>
      setState((s) => ({
        ...s,
        driverPhoneTripConflict: conflict,
        driverPhoneTripConflictLabel: label,
      })),
    [],
  );
  const setDriverPhoneName = useCallback((v: string | null) => setState((s) => ({ ...s, driverPhoneName: v })), []);
  const setDriverPhoneConfirmed = useCallback((v: boolean) => setState((s) => ({ ...s, driverPhoneConfirmed: v })), []);
  const setAggregateVehicleText = useCallback((v: string) => setState((s) => ({ ...s, aggregateVehicleText: v })), []);
  const setAggregateDriverCommissionPercent = useCallback(
    (v: string) => setState((s) => ({ ...s, aggregateDriverCommissionPercent: v })),
    [],
  );
  const setAggregateDriverName = useCallback((v: string) => {
    setState((s) => {
      const typed = v.trim();
      const suggested = s.driverPhoneName?.trim() ?? "";
      const confirmed =
        s.driverPhoneConfirmed ||
        (!suggested && typed.length > 0) ||
        (suggested.length > 0 &&
          typed.length > 0 &&
          typed.toLowerCase() === suggested.toLowerCase());
      return {
        ...s,
        aggregateDriverName: v,
        driverPhoneConfirmed: confirmed,
      };
    });
  }, []);

  const clearClientSelection = useCallback(() => setState((s) => ({ ...s, clientId: null, clientName: '' })), []);

  const computeEtaInterval = (durationSeconds: number): string => {
    const totalSeconds = Math.max(0, Math.round(durationSeconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const computeEtaLabel = (durationSeconds: number): string => {
    const totalSeconds = Math.max(0, Math.round(durationSeconds));
    const totalMinutes = Math.ceil(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes}M`;
    if (minutes <= 0) return `${hours}H`;
    return `${hours}H ${minutes}M`;
  };

  const computeHaversineDistanceKm = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
    // Approx distance on WGS84 sphere (metres), used only as a fallback.
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371000; // Earth radius metres
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const meters = R * c;
    return meters / 1000;
  };

  const isValidCoord = (n: number | null | undefined) => {
    if (n == null) return false;
    if (!Number.isFinite(n)) return false;
    // Our custom address flow uses (0,0). Treat that as "unset".
    if (Math.abs(n) < 0.000001) return false;
    return true;
  };

  // Auto-calculate route distance + ETA for route preview + persistence.
  useEffect(() => {
    const canCompute =
      isValidCoord(state.pickupLat) &&
      isValidCoord(state.pickupLon) &&
      isValidCoord(state.dropLat) &&
      isValidCoord(state.dropLon);

    if (!canCompute) {
      setState((s) => ({
        ...s,
        routeDistanceKm: null,
        routeEtaInterval: null,
        routeEtaLabel: null,
        routeLoading: false,
      }));
      return;
    }

    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      setState((s) => ({ ...s, routeLoading: true }));
      try {
        const from = { latitude: state.pickupLat as number, longitude: state.pickupLon as number };
        const to = { latitude: state.dropLat as number, longitude: state.dropLon as number };
        const route = await getOptimalRoute(from, to);

        if (cancelled) return;

        if (route) {
          const distanceKmRaw = route.distance / 1000;
          const distanceKm = distanceKmRaw > 0 ? Math.round(distanceKmRaw) : 0;
          const etaSeconds = route.duration;

          setState((s) => ({
            ...s,
            routeDistanceKm: distanceKm > 0 ? distanceKm : 0,
            routeEtaInterval: computeEtaInterval(etaSeconds),
            routeEtaLabel: computeEtaLabel(etaSeconds),
          }));
          return;
        }

        // Fallback when routing APIs fail.
        const distanceKmFallbackRaw = computeHaversineDistanceKm(
          from.latitude,
          from.longitude,
          to.latitude,
          to.longitude,
        );
        const distanceKmFallback = Math.max(1, Math.round(distanceKmFallbackRaw));
        // Assume avg speed 40km/h => ~1.5 min per km.
        const etaSecondsFallback = (distanceKmFallback * 60) / 40;

        setState((s) => ({
          ...s,
          routeDistanceKm: distanceKmFallback,
          routeEtaInterval: computeEtaInterval(etaSecondsFallback),
          routeEtaLabel: computeEtaLabel(etaSecondsFallback),
        }));
      } catch {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          routeDistanceKm: null,
          routeEtaInterval: null,
          routeEtaLabel: null,
        }));
      } finally {
        if (cancelled) return;
        setState((s) => ({ ...s, routeLoading: false }));
      }
    };

    run();
    return () => {
      cancelled = true;
    };
    // Intentionally use pickup/drop coords only; other fields don't affect route calculation.
  }, [state.pickupLat, state.pickupLon, state.dropLat, state.dropLon]);

  const validationIssues = useMemo(() => computeValidationIssues(state), [state]);

  /** Single source of truth with field-level validation (see `computeValidationIssues`). */
  const canSubmit = validationIssues.length === 0;

  /** First blocking message (footer / alerts); full list is `validationIssues`. */
  const getValidationError = useCallback((): string | null => {
    return validationIssues[0]?.message ?? null;
  }, [validationIssues]);

  const buildPayload = useCallback(
    (): AddTripFormData => buildAddTripPayload(state),
    [state],
  );

  const setters = useMemo(
    () => ({
      setPickupArea,
      setDropLocation,
      setExtraStops,
      setPickupCoords,
      setDropCoords,
      setTripStartDate,
      setTons,
      setVehicleType,
      setLoadType,
      applyPrefill,
      resetForm,
      setClientName,
      setClientId,
      setClientSelection,
      setClientPrice,
      setSaleRateBasis,
      setSaleUnitRate,
      setLaneId,
      setSupplierRate,
      setSupplySource,
      setMarketFulfillment,
      setCirculationTarget,
      setSupplierTarget,
      setSupplierRateBasis,
      setSupplierSelection,
      setAdvancePaid,
      setAssignLater,
      setNotes,
      setDriverId,
      setDriver,
      setVehicleId,
      setDriverPhone,
      setDriverPhoneName,
      setDriverPhoneConfirmed,
      setDriverPhoneTripConflict,
      setAggregateVehicleText,
      setAggregateDriverName,
      setAggregateDriverCommissionPercent,
      clearClientSelection,
    }),
    [
      setPickupArea,
      setDropLocation,
      setExtraStops,
      setPickupCoords,
      setDropCoords,
      setTripStartDate,
      setTons,
      setVehicleType,
      setLoadType,
      applyPrefill,
      resetForm,
      setClientName,
      setClientId,
      setClientSelection,
      setClientPrice,
      setSaleRateBasis,
      setSaleUnitRate,
      setLaneId,
      setSupplierRate,
      setSupplySource,
      setMarketFulfillment,
      setCirculationTarget,
      setSupplierTarget,
      setSupplierRateBasis,
      setSupplierSelection,
      setAdvancePaid,
      setAssignLater,
      setNotes,
      setDriverId,
      setDriver,
      setVehicleId,
      setDriverPhone,
      setDriverPhoneName,
      setDriverPhoneConfirmed,
      setDriverPhoneTripConflict,
      setAggregateVehicleText,
      setAggregateDriverName,
      setAggregateDriverCommissionPercent,
      clearClientSelection,
    ],
  );

  return {
    state,
    setters,
    canSubmit,
    buildPayload,
    getValidationError,
    validationIssues,
  };
}
