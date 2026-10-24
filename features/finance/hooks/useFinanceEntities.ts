/**
 * Loads and holds all entity data for the Finance screen from TanStack Query cache.
 * Single source of truth: clients, trips, suppliers, vehicles, drivers, etc. read from cache.
 * No duplicate fetch on sub-tab change; refreshKey no longer triggers refetch (cache staleTime handles refocus).
 */
import type { PartyOption, TripOption } from "@/components/AddTransactionModal";
import { type ClientRow } from "@/features/clients/services/clients.service";
import { type DriverOffer, type DriverRow } from "@/features/drivers/services/drivers.service";
import { type SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { getTripDisplayNumber, type TripRow } from "@/features/trips/services/trips.service";
import { overlayViewerTripSubcontract } from "@/features/trips/utils/overlayViewerTripSubcontract.util";
import { type VehicleRow } from "@/features/vehicles/services/vehicles.service";
import { getAvailablePeriodOptions } from "@/features/vehicles/pnl";
import { formatLedgerDate } from "@/lib/format";
import type { ConnectionRequestRow } from "@/features/connections/services/connectionRequests.service";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salaryRequests.service";
import { useConnectionRequestsSentQuery } from '@/lib/hooks/useConnectionRequestsFromGlobalSync';
import {
  useClientsQuery,
  useDriverOffersQuery,
  useDriversQuery,
  useSalaryRequestsQuery,
  useSuppliersQuery,
  useTripsQuery,
  useTripsWhereOrgIsClientQuery,
  useTripsWhereOrgIsSupplierQuery,
  useVehiclesQuery,
  useTripSubcontractsQuery,
} from "@/lib/queries";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface UseFinanceEntitiesArgs {
  organizationId: string | null;
  canAccess: boolean;
  /** No longer triggers refetch; kept for API compatibility. Cache handles staleness. */
  refreshKey?: number;
  /** Loads vehicles/pnl period helpers only when the garage tab needs them. */
  includeGaragePeriodOptions?: boolean;
}

export interface UseFinanceEntitiesResult {
  clients: PartyOption[];
  clientRows: ClientRow[];
  trips: TripOption[];
  tripRows: TripRow[];
  tripsWhereOrgIsClient: TripRow[];
  /** Trips from other orgs where this org is the supplier/carrier (load-board + direct trips). */
  tripsWhereOrgIsSupplier: TripRow[];
  supplierRows: SupplierRow[];
  suppliersList: PartyOption[];
  vehicleRows: VehicleRow[];
  driverRows: DriverRow[];
  driverOffers: Record<string, DriverOffer>;
  connectionRequestsSent: ConnectionRequestRow[];
  pendingDriverSalaryRequests: SalaryRequestWithDriverRow[];
  entitiesLoading: boolean;
  clientsLoading: boolean;
  suppliersLoading: boolean;
  /** True when the trips fetch (get_trips_for_org) failed — party ledgers may show zero trips even though trips exist. */
  tripsError: boolean;
  refetchTrips: () => void;
  garagePeriodOptions: { value: string; label: string }[];
  setPendingDriverSalaryRequests: React.Dispatch<
    React.SetStateAction<SalaryRequestWithDriverRow[]>
  >;
}

export function useFinanceEntities({
  organizationId,
  canAccess,
  includeGaragePeriodOptions = false,
}: UseFinanceEntitiesArgs): UseFinanceEntitiesResult {
  const orgId = canAccess ? organizationId : null;

  const { data: clientRows = [], isPending: clientsLoading } = useClientsQuery(orgId);
  const { data: tripRows = [], isPending: tripsLoading, isError: tripsError, refetch: refetchTrips } = useTripsQuery(orgId);
  const { data: supplierRows = [], isPending: suppliersLoading } = useSuppliersQuery(orgId);
  const { data: vehicleRows = [], isPending: vehiclesLoading } = useVehiclesQuery(orgId);
  const { data: driverRows = [], isPending: driversLoading } = useDriversQuery(orgId, {
    membership: "ledger",
  });
  const { data: driverOffers = {} } = useDriverOffersQuery(orgId);
  const { data: connectionRequestsSent = [] } =
    useConnectionRequestsSentQuery(orgId);
  const { data: tripsWhereOrgIsClient = [] } =
    useTripsWhereOrgIsClientQuery(orgId);
  const { data: tripsWhereOrgIsSupplier = [] } =
    useTripsWhereOrgIsSupplierQuery(orgId);
  const { data: salaryRequestsFromQuery = [] } = useSalaryRequestsQuery(orgId, "pending");

  const allVisibleTripIds = useMemo(
    () => [...new Set([...tripRows, ...tripsWhereOrgIsSupplier].map((t) => t.id))],
    [tripRows, tripsWhereOrgIsSupplier],
  );
  const { data: tripSubcontracts = [] } =
    useTripSubcontractsQuery(orgId, allVisibleTripIds);

  const supplierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of supplierRows) {
      const label = (
        s.company_name ||
        (s as { name?: string }).name ||
        s.contact_person ||
        ""
      ).trim();
      if (label) map.set(s.id, label);
    }
    return map;
  }, [supplierRows]);

  const overlayTripPartner = useCallback(
    (trip: TripRow, applyRate = false): TripRow => {
      const sub = tripSubcontracts.find((row) => row.trip_id === trip.id);
      if (!sub) return trip;
      return overlayViewerTripSubcontract(
        trip,
        orgId,
        { supplier_id: sub.supplier_id, rate: sub.rate },
        supplierNameById.get(sub.supplier_id) ?? null,
        { applyRate },
      );
    },
    [tripSubcontracts, orgId, supplierNameById],
  );

  const tripRowsWithPartner = useMemo(
    () => tripRows.map(overlayTripPartner),
    [tripRows, overlayTripPartner],
  );

  const tripsWhereOrgIsSupplierWithSubcontracts = useMemo(
    () => tripsWhereOrgIsSupplier.map((trip) => overlayTripPartner(trip, true)),
    [tripsWhereOrgIsSupplier, overlayTripPartner],
  );

  const [pendingDriverSalaryRequests, setPendingDriverSalaryRequests] = useState<
    SalaryRequestWithDriverRow[]
  >([]);

  const prevSalaryIdsKeyRef = useRef<string>("");
  useEffect(() => {
    const key = salaryRequestsFromQuery.map((r) => r.id).sort().join(",");
    if (key === prevSalaryIdsKeyRef.current) return;
    prevSalaryIdsKeyRef.current = key;
    setPendingDriverSalaryRequests(salaryRequestsFromQuery);
  }, [salaryRequestsFromQuery]);

  // Only block party tabs on the core entity queries — offers, connections, indents, and
  // cross-org trips are supplementary and must not prevent tabs from rendering.
  // tripsAsSupplierLoading is omitted intentionally: it's derived from useTripsQuery,
  // so tripsLoading already covers it.
  const entitiesLoading =
    clientsLoading ||
    tripsLoading ||
    suppliersLoading ||
    vehiclesLoading ||
    driversLoading;

  const clients = useMemo(
    () =>
      clientRows.map((c) => ({
        id: c.id,
        name: c.name || c.contact_person || "",
        linked_organization_id: c.linked_organization_id ?? null,
        is_integrated: c.is_integrated === true,
        avatar_url: c.avatar_url ?? null,
        avatar_seed: c.avatar_seed ?? null,
      })),
    [clientRows]
  );

  const trips = useMemo(
    () =>
      tripRowsWithPartner.map((t) => ({
        id: t.id,
        trip_number: getTripDisplayNumber(t),
        client_id: t.client_id ?? null,
        client_name: t.client_name ?? null,
        supplier_id: t.supplier_id ?? null,
        driver_id: t.driver_id ?? null,
        vehicle_id: t.vehicle_id ?? null,
        indent_id: t.indent_id ?? null,
        route_label:
          [t.pickup_area, t.drop_location].filter(Boolean).join(" → ") || null,
        trip_date: formatLedgerDate(t.pickup_date || t.created_at),
        organization_id: t.organization_id ?? null,
        supplier_name: t.supplier_name ?? null,
        driver_display_name: t.driver_display_name ?? null,
        client_price: t.client_price ?? null,
        supplier_rate: t.supplier_rate ?? null,
        driver_commission: t.driver_commission ?? null,
        distance: t.distance ?? null,
        is_cross_org_supplier: false,
        trip_payout_mode: t.trip_payout_mode ?? null,
        status: t.status ?? null,
        completed_at: t.completed_at ?? null,
      })),
    [tripRowsWithPartner]
  );

  const suppliersList = useMemo(
    () =>
      supplierRows.map((s) => ({
        id: s.id,
        name:
          (s.company_name ||
            (s as { name?: string }).name ||
            s.contact_person ||
            ""),
        linked_organization_id: s.linked_organization_id ?? null,
        supplier_type: s.supplier_type ?? null,
        avatar_url: s.avatar_url ?? null,
        avatar_seed: s.avatar_seed ?? null,
      })),
    [supplierRows]
  );

  const [garagePeriodOptions, setGaragePeriodOptions] = useState<
    { value: string; label: string }[]
  >([]);

  useEffect(() => {
    if (
      (includeGaragePeriodOptions && tripRows.length > 0) ||
      garagePeriodOptions.length === 0
    ) {
      return;
    }
    setGaragePeriodOptions([]);
  }, [
    includeGaragePeriodOptions,
    tripRows.length,
    garagePeriodOptions.length,
  ]);

  useEffect(() => {
    if (!includeGaragePeriodOptions || tripRows.length === 0) {
      return;
    }
    const next = getAvailablePeriodOptions(tripRows) ?? [];
    setGaragePeriodOptions((prev) => {
      if (
        prev.length === next.length &&
        prev.every(
          (opt, idx) =>
            opt.value === next[idx]?.value && opt.label === next[idx]?.label,
        )
      ) {
        return prev;
      }
      return next;
    });
  }, [includeGaragePeriodOptions, tripRows]);

  return {
    clients,
    clientRows,
    trips,
    tripRows: tripRowsWithPartner,
    // Keep full partner-owned client-perspective set (load + aggregate) so shared-ledger
    // and supplier remap can include cross-org aggregate trips too.
    tripsWhereOrgIsClient,
    tripsWhereOrgIsSupplier: tripsWhereOrgIsSupplierWithSubcontracts,
    supplierRows,
    suppliersList,
    vehicleRows,
    driverRows,
    driverOffers,
    connectionRequestsSent,
    pendingDriverSalaryRequests,
    entitiesLoading,
    clientsLoading,
    suppliersLoading,
    tripsError,
    refetchTrips: () => refetchTrips(),
    garagePeriodOptions,
    setPendingDriverSalaryRequests,
  };
}
