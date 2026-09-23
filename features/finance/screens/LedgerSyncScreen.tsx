/**
 * Full-page Ledger Sync — add or edit a ledger entry (double-entry aligned).
 * Reuses AddTransactionModal in fullPage mode; data flow per docs/CORE_ACCOUNTING_MODEL.md.
 */
import { AppLoadingSplash } from "@/components/AppLoadingSplash";
import type { PartyOption, VehicleOption } from "@/components/AddTransactionModal";
import {
  AddTransactionModal,
  DRIVER_PAYMENT_TYPES,
  VEHICLE_CATEGORIES,
  type AddTransactionData,
  type AddTransactionSubmitOptions,
} from "@/components/AddTransactionModal";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import type { ClientRow } from "@/features/clients/services/clients.service";
import {
  createDriverLedgerEntry,
} from "@/features/drivers/services/drivers.service";
import type { DriverOffer } from "@/features/drivers/services/drivers.service";
import {
  createLedgerEntry,
  updateLedgerEntry,
  type LedgerRow,
} from "@/features/finance/services/finance.service";
import { buildLedgerSyncDescriptionLine } from "@/features/finance/ledger/ledgerEntryModel";
import { getTripLedgerEntries } from "@/features/finance/utils/getTripLedgerEntries";
import {
  hydrateLedgerDriverOffers,
  loadLedgerEntryBootstrap,
  type TripDueMeta,
  type TripOptionWithOrg,
} from "@/features/finance/utils/ledgerEntryBootstrap.util";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import { getTripDisplayNumber, type TripRow } from "@/features/trips/services/trips.service";
import { buildUniqueLinkedOrgIdMap, isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";
import { updateSalaryRequestStatus } from "@/features/drivers/services/salaryRequests.service";
import { useLanguage } from "@/contexts/LanguageContext";
import { normalizeVehicleNumberForMatch } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { useSafeBack } from "@/lib/useSafeBack";
import { ROUTES } from "@/lib/routes";
import { useInvalidateTransactions } from "@/lib/queries/useTransactionsQuery";
import { useQueryClient } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showAppAlert } from "@/lib/appAlert";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { WEB_APP_VIEWPORT_STYLE } from "@/lib/webViewportHeight";

function getSupplierDisplayName(
  supplier: Pick<
    SupplierRow,
    "name" | "company_name" | "contact_person" | "owner_full_name"
  > | null | undefined,
  fallback = "Supplier",
): string {
  const value =
    supplier?.name?.trim() ||
    supplier?.company_name?.trim() ||
    supplier?.contact_person?.trim() ||
    supplier?.owner_full_name?.trim() ||
    "";
  return value || fallback;
}

export default function LedgerSyncScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useLanguage();
  const raw = useLocalSearchParams<{
    entryId?: string;
    partyContext?: string;
    partyId?: string;
    partyName?: string;
    entityType?: string;
    entityId?: string;
    /** Pre-select trip (e.g. from trip detail page Record cash in / Add expense). */
    tripId?: string;
    /** Trip display (e.g. MSN-001) when opening from trip detail — shown before trips load. */
    tripNumber?: string;
    /** Pre-select IN or OUT when opening from trip detail. */
    defaultType?: string;
    /** When "trip-ledger", after submit navigate back to trip-ledger/[tripId] instead of trip/[tripId]. */
    returnTo?: string;
    /** Pre-fill amount (e.g. from Pay Now / driver salary request). */
    salaryAmount?: string;
    /** Driver payment type when opening from Pay Now (advance | settlement). */
    defaultDriverPaymentType?: string;
    /** Salary request id to mark as paid after successful submit (Pay Now flow). */
    salaryRequestId?: string;
    /** Suggested receivable for Cash IN amount placeholder (from entity or trip). */
    dueAmountIn?: string;
    /** Suggested payable for Cash OUT amount placeholder. */
    dueAmountOut?: string;
  }>();
  /** Stable object when query values unchanged — avoids downstream memo churn from new object identity each render. */
  const params = useMemo(
    () => ({
      entryId: typeof raw.entryId === "string" ? raw.entryId : undefined,
      partyContext: typeof raw.partyContext === "string" ? raw.partyContext : undefined,
      partyId: typeof raw.partyId === "string" ? raw.partyId : undefined,
      partyName: typeof raw.partyName === "string" ? raw.partyName : undefined,
      entityType: typeof raw.entityType === "string" ? raw.entityType : undefined,
      entityId: typeof raw.entityId === "string" ? raw.entityId : undefined,
      tripId: typeof raw.tripId === "string" ? raw.tripId : undefined,
      tripNumber: typeof raw.tripNumber === "string" ? raw.tripNumber : undefined,
      defaultType:
        typeof raw.defaultType === "string" && (raw.defaultType === "in" || raw.defaultType === "out")
          ? raw.defaultType
          : undefined,
      returnTo: typeof raw.returnTo === "string" ? raw.returnTo : undefined,
      salaryAmount: typeof raw.salaryAmount === "string" ? raw.salaryAmount : undefined,
      defaultDriverPaymentType:
        typeof raw.defaultDriverPaymentType === "string" &&
        ["advance", "settlement", "salary", "bonus", "deduction", "reimbursement", "adjustment"].includes(
          raw.defaultDriverPaymentType,
        )
          ? raw.defaultDriverPaymentType
          : undefined,
      salaryRequestId: typeof raw.salaryRequestId === "string" ? raw.salaryRequestId : undefined,
      dueAmountIn: typeof raw.dueAmountIn === "string" ? raw.dueAmountIn : undefined,
      dueAmountOut: typeof raw.dueAmountOut === "string" ? raw.dueAmountOut : undefined,
    }),
    [
      raw.entryId,
      raw.partyContext,
      raw.partyId,
      raw.partyName,
      raw.entityType,
      raw.entityId,
      raw.tripId,
      raw.tripNumber,
      raw.defaultType,
      raw.returnTo,
      raw.salaryAmount,
      raw.defaultDriverPaymentType,
      raw.salaryRequestId,
      raw.dueAmountIn,
      raw.dueAmountOut,
    ],
  );

  const parseDueQueryAmount = (s: string | undefined): number | null => {
    if (s == null || s.trim() === "") return null;
    const n = parseFloat(s.replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const dueAmountInFromQuery = parseDueQueryAmount(params.dueAmountIn);
  const dueAmountOutFromQuery = parseDueQueryAmount(params.dueAmountOut);
  const { currentOrganization } = useOrganization();
  const { profile } = useAuth();
  const fallbackRouteForClose = useMemo(() => {
    if (params.tripId) {
      if (params.returnTo === "trip-ledger") {
        const q = new URLSearchParams();
        if (params.entityType) q.set("entityType", params.entityType);
        if (params.entityId) q.set("entityId", params.entityId);
        if (params.partyName) q.set("partyName", params.partyName);
        const query = q.toString();
        return query ? `/trip-ledger/${params.tripId}?${query}` : `/trip-ledger/${params.tripId}`;
      }
      return `/trip/${params.tripId}`;
    }

    if (params.entityType && params.entityId) {
      switch (params.entityType) {
        case "CLIENT":
          return `/client/${params.entityId}`;
        case "SUPPLIER":
          return `/supplier/${params.entityId}`;
        case "DRIVER":
          return `/driver/${params.entityId}`;
        case "VEHICLE":
          return `/vehicle/${params.entityId}`;
      }
    }

    return "/(tabs)/finance";
  }, [params.tripId, params.returnTo, params.entityType, params.entityId, params.partyName]);

  const safeBack = useSafeBack(fallbackRouteForClose);

  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [drivers, setDrivers] = useState<PartyOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [trips, setTrips] = useState<TripOptionWithOrg[]>([]);
  const [tripDueMetaById, setTripDueMetaById] = useState<Record<string, TripDueMeta>>({});
  const [tripAdjustmentsByTripId, setTripAdjustmentsByTripId] = useState<
    Record<string, TripAdjustment[]>
  >({});
  const [transactions, setTransactions] = useState<LedgerRow[] | null>(null);
  const [driverOffers, setDriverOffers] = useState<Record<string, DriverOffer>>({});
  const [editingEntry, setEditingEntry] = useState<LedgerRow | null>(null);
  // Edit mode is reachable via the ?entryId deep link — gate it on the surface
  // so a member without edit rights lands on a blank add form instead.
  const { can: canSurface } = useMemberAccess();
  const canEditFinanceTx = canSurface("finance.edit_transaction");

  const orgId = currentOrganization?.id ?? null;
  const queryClient = useQueryClient();
  const invalidateTransactions = useInvalidateTransactions();

  const partyKnown = Boolean(
    (params.partyId ?? "").trim() ||
      (["CLIENT", "SUPPLIER", "DRIVER"].includes(String(params.entityType ?? "").toUpperCase()) &&
        (params.entityId ?? "").trim()),
  );
  const duesFromQuery =
    dueAmountInFromQuery != null || dueAmountOutFromQuery != null;

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadLedgerEntryBootstrap(queryClient, {
      orgId,
      tripId: params.tripId,
      entryId: params.entryId,
      partyKnown,
      duesFromQuery,
    })
      .then((boot) => {
        if (cancelled) return;
        setClients(boot.clients);
        setSuppliers(boot.suppliers);
        setDrivers(boot.drivers);
        setVehicles(boot.vehicles);
        setTrips(boot.trips);
        setTripDueMetaById(boot.tripDueMeta);
        setTripAdjustmentsByTripId(boot.adjustmentsRecord);
        setTransactions(boot.transactions);
        setDriverOffers(boot.driverOffers);
        if (params.entryId && boot.transactions.length > 0) {
          const entry = boot.transactions.find((r) => r.id === params.entryId);
          if (entry) setEditingEntry(entry);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setClients([]);
        setSuppliers([]);
        setDrivers([]);
        setVehicles([]);
        setTrips([]);
        setTripDueMetaById({});
        setTripAdjustmentsByTripId({});
        setTransactions([]);
        setDriverOffers({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    orgId,
    params.entryId,
    params.tripId,
    partyKnown,
    duesFromQuery,
    queryClient,
  ]);

  useEffect(() => {
    if (!orgId || loading) return;
    let cancelled = false;
    void hydrateLedgerDriverOffers(queryClient, orgId).then((offers) => {
      if (!cancelled) setDriverOffers(offers);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, loading, queryClient]);

  const uniqueLinkedClientIdByOrgId = useMemo(
    () => buildUniqueLinkedOrgIdMap(clients),
    [clients],
  );
  const uniqueLinkedSupplierIdByOrgId = useMemo(
    () => buildUniqueLinkedOrgIdMap(suppliers),
    [suppliers],
  );

  /** When opened from entity detail (vehicle/driver/client/supplier), show that entity's trips. For SUPPLIER, include owned trips and trips where org is client (integrated supplier-created). */
  const filteredTrips = useMemo(() => {
    if (!params.entityType || !params.entityId) return trips;
    switch (params.entityType) {
      case "VEHICLE": {
        const selectedVehicle = vehicles.find((v) => v.id === params.entityId);
        const normalizedVehicleNumber = normalizeVehicleNumberForMatch(
          selectedVehicle?.vehicle_number ?? params.partyName ?? "",
        );
        return trips.filter((t) => {
          const byVehicleId =
            (t as { vehicle_id?: string | null }).vehicle_id === params.entityId;
          if (byVehicleId) return true;
          if (!normalizedVehicleNumber) return false;
          const displayNumber = normalizeVehicleNumberForMatch(
            (t as { vehicle_display_number?: string | null }).vehicle_display_number ?? "",
          );
          return displayNumber === normalizedVehicleNumber;
        });
      }
      case "DRIVER":
        return trips.filter((t) => t.driver_id === params.entityId);
      case "CLIENT":
        return trips.filter((t) => {
          const client = clients.find((c) => c.id === params.entityId) as {
            linked_organization_id?: string | null;
            is_integrated?: boolean;
          } | undefined;
          const linkedOrgId = client?.linked_organization_id ?? null;
          return (
            t.client_id === params.entityId ||
            (
              client?.is_integrated === true &&
              linkedOrgId != null &&
              isLoadBasedTrip(t) &&
              t.organization_id === linkedOrgId &&
              uniqueLinkedClientIdByOrgId.get(linkedOrgId) === params.entityId
            )
          );
        });
      case "SUPPLIER": {
        const supplier = suppliers.find((s) => s.id === params.entityId) as {
          linked_organization_id?: string | null;
          supplier_type?: string | null;
        } | undefined;
        const linkedOrgId = supplier?.linked_organization_id ?? null;
        return trips.filter(
          (t) =>
            t.supplier_id === params.entityId ||
            (
              supplier?.supplier_type === "integrated" &&
              linkedOrgId != null &&
              isLoadBasedTrip(t) &&
              t.organization_id === linkedOrgId &&
              uniqueLinkedSupplierIdByOrgId.get(linkedOrgId) === params.entityId
            ),
        );
      }
      default:
        return trips;
    }
  }, [
    trips,
    params.entityType,
    params.entityId,
    params.partyName,
    vehicles,
    suppliers,
    clients,
    uniqueLinkedClientIdByOrgId,
    uniqueLinkedSupplierIdByOrgId,
  ]);

  const clientPartyOptions: PartyOption[] = useMemo(
    () =>
      clients.map((c) => ({
        id: c.id,
        name: c.name ?? c.contact_person ?? t("client"),
        avatar_url: c.avatar_url ?? null,
        avatar_seed: c.avatar_seed ?? null,
        linked_organization_id: c.linked_organization_id ?? null,
        is_integrated: c.is_integrated === true,
      })),
    [clients, t],
  );
  const supplierPartyOptions: PartyOption[] = useMemo(
    () =>
      suppliers.map((s) => ({
        id: s.id,
        name: getSupplierDisplayName(s, t("supplier")),
        avatar_url: s.avatar_url ?? null,
        avatar_seed: s.avatar_seed ?? null,
        linked_organization_id: s.linked_organization_id ?? null,
        supplier_type: s.supplier_type ?? null,
      })),
    [suppliers, t],
  );

  /** Vehicle locked when opening from a Vehicle detail page (entityType=VEHICLE). */
  const lockedVehicleNumber = useMemo(() => {
    if (params.entityType !== "VEHICLE" || !params.entityId) return null;
    const fromList = vehicles.find((v) => v.id === params.entityId)?.vehicle_number;
    return fromList ?? params.partyName ?? null;
  }, [params.entityType, params.entityId, params.partyName, vehicles]);

  /** Map supplier/client id -> linked_organization_id so AddTransactionModal can show trips created by that org (org-as-client or integrated shipper). */
  const supplierLinkedOrgIds = useMemo(() => {
    const m: Record<string, string> = {};
    suppliers.forEach((s) => {
      const lid = (s as { linked_organization_id?: string | null }).linked_organization_id;
      if (lid) m[s.id] = lid;
    });
    clients.forEach((c) => {
      const lid = (c as { linked_organization_id?: string | null }).linked_organization_id;
      if (lid) m[c.id] = lid;
    });
    return m;
  }, [suppliers, clients]);

  /** Trip-level due for amount placeholder when trip is locked (aligns with mission row SALES/RECEIVED/DUE). */
  const tripComputedDues = useMemo(() => {
    const tid = params.tripId;
    if (!tid || transactions === null) {
      return { in: null as number | null, out: null as number | null };
    }
    const meta = tripDueMetaById[tid];
    if (!meta) return { in: null, out: null };
    const lockedTrip = trips.find((t) => t.id === tid);
    const lockedTripNumber = lockedTrip
      ? getTripDisplayNumber(lockedTrip as TripRow, orgId)
      : null;
    const entries = getTripLedgerEntries(transactions, tid, lockedTripNumber);

    // sales: what we are owed (Cash IN placeholder)
    const sales = meta.isCrossOrgSupplier
      ? Number(meta.supplier_rate ?? 0)
      : Number(meta.client_price ?? 0);

    const received = entries.reduce((s, tx) => s + Number(tx.amount_in ?? 0), 0);
    const pendingIn = Math.max(0, sales - received);

    // cost: what we owe others (Cash OUT placeholder)
    const isTripWhereWeAreClient =
      meta.organization_id != null && orgId != null && meta.organization_id !== orgId;

    const supplierCost = meta.isCrossOrgSupplier
      ? 0 // As integrated supplier, this record is our revenue, not our cost.
      : isTripWhereWeAreClient
        ? Number(meta.client_price ?? 0) || Number(meta.supplier_rate ?? 0)
        : Number(meta.supplier_rate ?? 0);

    const supplierPaid = entries.reduce((s, tx) => s + Number(tx.amount_out ?? 0), 0);
    const pendingOut = Math.max(0, supplierCost - supplierPaid);

    return {
      in: pendingIn > 0 ? pendingIn : null,
      out: pendingOut > 0 ? pendingOut : null,
    };
  }, [params.tripId, transactions, tripDueMetaById, orgId, trips]);

  const effectiveDueAmountIn = tripComputedDues.in ?? dueAmountInFromQuery;
  const effectiveDueAmountOut = tripComputedDues.out ?? dueAmountOutFromQuery;

  const lastSubmittedDataRef = useRef<AddTransactionData | null>(null);

  const navigateAfterLedgerSuccess = useCallback(
    (data: AddTransactionData) => {
      if (params.tripId && params.returnTo === "trip-ledger") {
        const q = new URLSearchParams();
        if (params.entityType) q.set("entityType", params.entityType);
        if (params.entityId) q.set("entityId", params.entityId);
        if (params.partyName) q.set("partyName", params.partyName);
        const query = q.toString();
        router.replace(
          query ? `/trip-ledger/${params.tripId}?${query}` : `/trip-ledger/${params.tripId}`,
        );
        return;
      }
      if (params.tripId) {
        router.replace(`/trip/${params.tripId}`);
        return;
      }
      if (params.entityType && params.entityId) {
        switch (params.entityType) {
          case "CLIENT":
            router.replace(`/client/${params.entityId}`);
            return;
          case "SUPPLIER":
            router.replace(`/supplier/${params.entityId}`);
            return;
          case "DRIVER":
            router.replace(`/driver/${params.entityId}`);
            return;
          case "VEHICLE":
            router.replace(`/vehicle/${params.entityId}`);
            return;
          default:
            router.replace(ROUTES.TABS.FINANCE as "/");
            return;
        }
      }
      const tripNavId = data.tripAllocations?.[0]?.tripId ?? data.tripId;
      if (tripNavId) {
        router.replace(`/trip/${tripNavId}`);
        return;
      }
      const partyId = data.partyId ?? null;
      const contactType = data.contactType ?? null;
      if (partyId && partyId !== "misc") {
        if (contactType === "client") {
          router.replace(`/client/${partyId}`);
          return;
        }
        if (contactType === "supplier") {
          router.replace(`/supplier/${partyId}`);
          return;
        }
        if (contactType === "driver") {
          const driverId =
            partyId === "driver-salary" ? (data.contactId ?? partyId) : partyId;
          if (driverId) router.replace(`/driver/${driverId}`);
          return;
        }
      }
      router.replace(ROUTES.TABS.FINANCE as "/");
    },
    [
      router,
      params.tripId,
      params.returnTo,
      params.entityType,
      params.entityId,
      params.partyName,
    ],
  );

  const handleSuccessDismiss = useCallback(() => {
    const data = lastSubmittedDataRef.current;
    if (data) navigateAfterLedgerSuccess(data);
    else safeBack();
  }, [navigateAfterLedgerSuccess, safeBack]);

  const handleSubmit = useCallback(
    async (data: AddTransactionData, options?: AddTransactionSubmitOptions) => {
      if (!orgId) return;
      const today = new Date().toISOString().slice(0, 10);
      const transactionDate =
        (data.transactionDate && /^\d{4}-\d{2}-\d{2}$/.test(data.transactionDate))
          ? data.transactionDate.slice(0, 10)
          : options?.entryId && editingEntry?.transaction_date
            ? editingEntry.transaction_date.slice(0, 10)
            : today;

      const ledgerRuns: {
        data: AddTransactionData;
        options?: AddTransactionSubmitOptions;
      }[] =
        data.tripAllocations &&
        data.tripAllocations.length > 0 &&
        !options?.entryId
          ? data.tripAllocations.map((alloc) => ({
              data: {
                ...data,
                tripId: alloc.tripId,
                amount: alloc.amount,
                tripNumber: alloc.tripNumber ?? null,
                indentId: alloc.indentId ?? null,
                tripAllocations: undefined,
              },
              options: undefined,
            }))
          : [{ data, options }];

      for (let runIdx = 0; runIdx < ledgerRuns.length; runIdx++) {
        const data = ledgerRuns[runIdx].data;
        const options = ledgerRuns[runIdx].options;

      const driverPaymentLabel =
        data.type === "out" &&
        data.driverPaymentType &&
        (DRIVER_PAYMENT_TYPES.find((t) => t.type === data.driverPaymentType)?.label ?? data.driverPaymentType);
      const isVehicleExpenseOut =
        data.type === "out" &&
        typeof data.category === "string" &&
        VEHICLE_CATEGORIES.includes(data.category as (typeof VEHICLE_CATEGORIES)[number]);

      // Ensure client cash-in entries are strongly linked so Customers/Client Detail can aggregate them.
      const linkedTrip = data.tripId
        ? trips.find((t) => t.id === data.tripId)
        : undefined;
      let resolvedContactId = data.contactId ?? null;
      let resolvedContactType = data.contactType ?? null;
      let resolvedPartyName = data.partyName || "—";

      if (data.type === "in") {
        if (!resolvedContactId || resolvedContactType !== "client") {
          // For integrated trips we don't own, the client_id on the record belongs to the other org.
          // We need to resolve our own local client ID that is linked to the trip owner.
          const fromTripClientId =
            linkedTrip && linkedTrip.organization_id && linkedTrip.organization_id !== orgId
              ? uniqueLinkedClientIdByOrgId.get(linkedTrip.organization_id) ?? null
              : linkedTrip?.client_id ?? null;

          const fromEntityClientId =
            params.entityType === "CLIENT" ? (params.entityId ?? null) : null;
          const fromContextClientId =
            params.partyContext === "customers" ? (params.partyId ?? null) : null;
          const candidateClientId =
            fromTripClientId || fromEntityClientId || fromContextClientId;
          if (candidateClientId) {
            resolvedContactId = candidateClientId;
            resolvedContactType = "client";
          }
        }

        if (!resolvedPartyName || resolvedPartyName === "—") {
          const fromClientIdName = resolvedContactId
            ? clients.find((c) => c.id === resolvedContactId)?.name ??
              clients.find((c) => c.id === resolvedContactId)?.contact_person ??
              null
            : null;
          // For integrated trips, we want our local client name (the shipper), not the end customer name from the trip.
          const fromTripName =
            linkedTrip && linkedTrip.organization_id !== orgId
              ? fromClientIdName
              : linkedTrip?.client_name ?? null;

          resolvedPartyName = fromTripName || fromClientIdName || params.partyName || "—";
        }
      }

      // Similarly for Cash OUT: if it's an integrated trip we don't own, resolve the correct supplier.
      if (
        data.type === "out" &&
        !isVehicleExpenseOut &&
        (!resolvedContactId || resolvedContactType === "driver")
      ) {
        // If it's a driver payment, we keep it as is. But if it's a generic OUT or we're looking for a supplier:
        if (!resolvedContactId || resolvedContactType !== "driver") {
          const fromTripSupplierId =
            linkedTrip && linkedTrip.organization_id && linkedTrip.organization_id !== orgId
              ? uniqueLinkedSupplierIdByOrgId.get(linkedTrip.organization_id) ?? null
              : linkedTrip?.supplier_id ?? null;
          const fromEntitySupplierId =
            params.entityType === "SUPPLIER" ? (params.entityId ?? null) : null;
          const fromContextSupplierId =
            params.partyContext === "suppliers" ? (params.partyId ?? null) : null;
          const candidateSupplierId =
            fromTripSupplierId || fromEntitySupplierId || fromContextSupplierId;

          if (candidateSupplierId && !resolvedContactId) {
            resolvedContactId = candidateSupplierId;
            resolvedContactType = "supplier";
          }
        }

        if (!resolvedPartyName || resolvedPartyName === "—") {
          const fromSupplierName = resolvedContactId && resolvedContactType === "supplier"
            ? getSupplierDisplayName(
                suppliers.find((s) => s.id === resolvedContactId),
                "",
              ) || null
            : null;
          if (fromSupplierName) {
            resolvedPartyName = fromSupplierName;
          }
        }
      }

      // For integrated/cross-org supplier payouts, ensure contact_id is mapped to
      // the local supplier id in this org, even when a foreign supplier id is present.
      if (data.type === "out" && !isVehicleExpenseOut && resolvedContactType === "supplier") {
        const isCrossOrgTripForOut =
          !!linkedTrip?.organization_id &&
          !!orgId &&
          linkedTrip.organization_id !== orgId;
        const mappedLocalSupplierIdFromTripOrg =
          isCrossOrgTripForOut && linkedTrip?.organization_id
            ? uniqueLinkedSupplierIdByOrgId.get(linkedTrip.organization_id) ?? null
            : null;
        const currentResolvedSupplierExistsLocally =
          !!resolvedContactId &&
          suppliers.some((s) => s.id === resolvedContactId);
        if (
          mappedLocalSupplierIdFromTripOrg &&
          !currentResolvedSupplierExistsLocally
        ) {
          resolvedContactId = mappedLocalSupplierIdFromTripOrg;
          resolvedContactType = "supplier";
        }
      }

      if (
        data.type === "out" &&
        data.contactType === "driver" &&
        data.contactId
      ) {
        const fromDriverList =
          drivers.find((d) => d.id === data.contactId)?.name?.trim() || null;
        const fromPayload =
          (data.driverName || data.partyName || "").trim() || null;
        if (fromDriverList || fromPayload) {
          resolvedPartyName = fromDriverList || fromPayload || resolvedPartyName;
        }
      }

      const baseDescription = (data.type === "in"
        ? (data.category ?? "ENTRY")
        : data.type === "out"
          ? (driverPaymentLabel ?? data.category ?? "ENTRY")
          : "ENTRY") as string;

      const modeName = data.paymentMode
        ? data.paymentMode === "UPI"
          ? "UPI"
          : data.paymentMode === "BANK"
            ? "Bank Transfer"
            : data.paymentMode === "CHEQUE"
              ? "Cheque"
              : data.paymentMode === "CASH"
                ? "Cash"
                : data.paymentMode
        : null;

      const description = buildLedgerSyncDescriptionLine({
        categoryOrKind: baseDescription,
        paymentModeLabel: modeName,
        paymentModeId: data.paymentMode ?? null,
        paymentReference: data.paymentReference?.trim() || null,
      });

      const payload = {
        trip_id: data.tripId ?? null,
        trip_number: data.tripNumber ?? null,
        party_name: resolvedPartyName,
        description,
        amount_in: data.type === "in" ? data.amount : 0,
        amount_out: data.type === "out" ? data.amount : 0,
        transaction_date: transactionDate,
        contact_id: isVehicleExpenseOut ? null : resolvedContactId,
        contact_type: isVehicleExpenseOut ? null : resolvedContactType,
        indent_id: data.indentId ?? null,
        vehicle_number: data.vehicleNumber ?? null,
        driver_name: resolvedContactType === "driver" ? (data.driverName ?? null) : null,
        ...(data.tripId && !options?.entryId
          ? { ledgerWritePassthroughTripContext: true as const }
          : {}),
      };

      const doCreate = options?.entryId
        ? updateLedgerEntry(orgId, options.entryId, payload)
        : createLedgerEntry(orgId, payload);

      const { error } = await doCreate;
      if (error) {
        // In-app alert (non-blocking). RN Alert.alert → window.alert behind the
        // recon Modal freezes Confirm Sync loading on iPad Safari.
        showAppAlert(t("error"), error.message);
        throw new Error(error.message);
      }

      void invalidateTransactions(orgId);
      const refreshTripId = payload.trip_id ?? params.tripId ?? null;
      if (refreshTripId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(refreshTripId) });
      }
      if (resolvedContactId && orgId) {
        if (resolvedContactType === "client") {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.clients.detail(orgId, resolvedContactId),
          });
        } else if (resolvedContactType === "supplier") {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.suppliers.detail(orgId, resolvedContactId),
          });
        } else if (resolvedContactType === "driver") {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.drivers.detail(orgId, resolvedContactId),
          });
        }
      }

      if (
        !options?.entryId &&
        !isVehicleExpenseOut &&
        data.contactType === "driver" &&
        data.type === "out" &&
        data.driverPaymentType &&
        data.contactId
      ) {
        // Trip-based settlements are stored as "fleet pending" until the driver verifies.
        // This avoids instantly increasing driver's cash/balance from org entries.
        const baseDriverLedgerType = data.driverPaymentType === "bonus" ? "adjustment" : data.driverPaymentType;
        const shouldCreateFleetPending =
          data.driverPaymentType === "settlement" && data.tripId !== undefined && data.tripId !== null;

        const driverLedgerType = shouldCreateFleetPending ? "adjustment" : baseDriverLedgerType;
        await createDriverLedgerEntry(orgId, data.contactId, data.amount, driverLedgerType, {
          tripId: data.tripId ?? null,
          createdBy: profile?.uid ?? null,
          // Reuse the same description parts used for the finance ledger entry
          // (e.g. includes Mode + UTR when available) so driver wallet can show
          // correct payment pills on both the "pending verification" and "settled" views.
          description: (() => {
            const baseDescription = payload.description ?? (typeof driverPaymentLabel === "string" ? driverPaymentLabel : null);
            if (!shouldCreateFleetPending) return baseDescription;
            // Token used by the driver app to detect "fleet marked paid (awaiting verification)" entries.
            return baseDescription ? `${baseDescription} | Sync: FLEET_PAID_PENDING` : "Sync: FLEET_PAID_PENDING";
          })(),
        });
      }

      }

      if (params.salaryRequestId) {
        await updateSalaryRequestStatus(params.salaryRequestId, "paid");
      }

      lastSubmittedDataRef.current = data;
    },
    [
      orgId,
      queryClient,
      invalidateTransactions,
      editingEntry?.transaction_date,
      profile?.uid,
      router,
      params.tripId,
      params.entityType,
      params.entityId,
      params.returnTo,
      params.partyName,
      trips,
      clients,
      suppliers,
      drivers,
      uniqueLinkedClientIdByOrgId,
      uniqueLinkedSupplierIdByOrgId,
      params.partyContext,
      params.partyId,
      params.salaryRequestId,
      t,
      tripDueMetaById,
    ]
  );

  const handleClose = useCallback(() => {
    safeBack();
  }, [safeBack]);

  const partyContext =
    params.partyContext === "customers"
      ? "customers"
      : params.partyContext === "suppliers"
        ? "suppliers"
        : params.partyContext === "dco"
          ? "dco"
          : "all";

  const resolvedEntityPartyName = useMemo(() => {
    const rawName = (params.partyName ?? "").trim();
    const normalized = rawName.toLowerCase();
    const isGeneric =
      normalized === "" ||
      normalized === "supplier" ||
      normalized === "client" ||
      normalized === "driver" ||
      normalized === "entry";
    if (!isGeneric) return rawName;

    const candidateId = params.partyId ?? params.entityId ?? null;
    if (!candidateId) return rawName || null;
    if (params.entityType === "SUPPLIER") {
      const supplier = suppliers.find((s) => s.id === candidateId);
      return (
        getSupplierDisplayName(supplier, "") ||
        rawName ||
        null
      );
    }
    if (params.entityType === "CLIENT") {
      const row = clients.find((c) => c.id === candidateId);
      return row?.name?.trim() || row?.contact_person?.trim() || rawName || null;
    }
    if (params.entityType === "DRIVER") {
      return (
        drivers.find((d) => d.id === candidateId)?.name?.trim() ||
        rawName ||
        null
      );
    }
    if (params.entityType === "VEHICLE") {
      const row = vehicles.find((v) => v.id === candidateId);
      return row?.vehicle_number?.trim() || rawName || null;
    }
    return rawName || null;
  }, [
    params.partyName,
    params.partyId,
    params.entityId,
    params.entityType,
    vehicles,
    suppliers,
    clients,
    drivers,
  ]);

  const tripById = useMemo(() => {
    const m = new Map<string, TripOptionWithOrg>();
    for (const t of trips) m.set(t.id, t);
    return m;
  }, [trips]);

  const inferredSupplierFromTrip = useMemo(() => {
    const tripId = params.tripId ?? null;
    if (!tripId) return { id: null as string | null, name: null as string | null };
    const trip = tripById.get(tripId);
    if (!trip) return { id: null as string | null, name: null as string | null };

    const tripSupplierId = (trip.supplier_id ?? "").trim() || null;
    const byTripId = tripSupplierId
      ? suppliers.find((s) => s.id === tripSupplierId)
      : null;
    if (byTripId) {
      return { id: byTripId.id, name: getSupplierDisplayName(byTripId, "") || null };
    }

    // Cross-org integrated fallback: trip owner org -> unique linked local supplier.
    const linkedLocalSupplierId =
      trip.organization_id != null
        ? uniqueLinkedSupplierIdByOrgId.get(trip.organization_id) ?? null
        : null;
    const byLinkedOrg = linkedLocalSupplierId
      ? suppliers.find((s) => s.id === linkedLocalSupplierId)
      : null;
    if (byLinkedOrg) {
      return {
        id: byLinkedOrg.id,
        name: getSupplierDisplayName(byLinkedOrg, "") || null,
      };
    }

    const tripSupplierName = (trip.supplier_name ?? "").trim() || null;
    return { id: tripSupplierId, name: tripSupplierName };
  }, [params.tripId, tripById, suppliers, uniqueLinkedSupplierIdByOrgId]);

  const genericPartyName = useMemo(() => {
    const raw = (params.partyName ?? "").trim().toLowerCase();
    return raw === "" || raw === "supplier" || raw === "client" || raw === "driver";
  }, [params.partyName]);

  const resolvedModalPartyName = useMemo(() => {
    const base = (resolvedEntityPartyName ?? "").trim();
    if (base && base.toLowerCase() !== "supplier") return base;
    if (inferredSupplierFromTrip.name?.trim()) return inferredSupplierFromTrip.name.trim();
    if (!genericPartyName && (params.partyName ?? "").trim()) return (params.partyName ?? "").trim();
    return base || (params.partyName ?? "").trim() || null;
  }, [
    resolvedEntityPartyName,
    inferredSupplierFromTrip.name,
    genericPartyName,
    params.partyName,
  ]);

  /** Do not infer supplier as default party when capturing customer cash-in (`partyContext=customers`). */
  const defaultPartyIdForModal = useMemo(() => {
    const pid = (params.partyId ?? "").trim();
    if (pid) return params.partyId;
    const ctx = params.partyContext;
    if (ctx === "suppliers") {
      return inferredSupplierFromTrip.id ?? undefined;
    }
    if (ctx === "dco") {
      return pid || undefined;
    }
    if (!ctx || ctx === "all") {
      return inferredSupplierFromTrip.id ?? undefined;
    }
    return undefined;
  }, [params.partyId, params.partyContext, inferredSupplierFromTrip.id]);

  /**
   * Lock trip + hide party row only when the counterparty is already known (entity or party id).
   * Otherwise (e.g. capture payment with no `client_id`) user must pick the customer while the trip stays pre-selected.
   */
  const tripLedgerLocked = useMemo(
    () =>
      Boolean(params.tripId) &&
      (Boolean((params.partyId ?? "").trim()) ||
        (Boolean((params.entityId ?? "").trim()) &&
          ["CLIENT", "SUPPLIER", "DRIVER"].includes(
            String(params.entityType ?? "").toUpperCase(),
          ))),
    [params.tripId, params.partyId, params.entityId, params.entityType],
  );

  if (loading || !orgId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.backBtn} hitSlop={8}>
            <FontAwesome name="chevron-left" size={18} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ledger</Text>
        </View>
        <View style={[styles.centered, { flex: 1 }]}>
          <AppLoadingSplash variant="preparing" style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  /** When opened from entity detail, party is fixed (customer/supplier/driver) or context is vehicle; show in header. */
  const isFromDetail = Boolean(params.entityType && params.entityId);
  const entryContextLabel = isFromDetail ? (resolvedEntityPartyName || t("entry")) : null;

  /** Vehicle sync uses the same full-page AddTransactionModal as drivers/clients/suppliers, with vehicle locked. */
  const isVehicleEntity = params.entityType === "VEHICLE" && Boolean(params.entityId);

  return (
    <View style={styles.container}>
      <AddTransactionModal
        visible
        fullPage
        onClose={handleClose}
        onSubmit={handleSubmit}
        onSuccessDismiss={handleSuccessDismiss}
        clients={clientPartyOptions}
        suppliers={supplierPartyOptions}
        drivers={drivers}
        vehicles={vehicles}
        trips={filteredTrips}
        supplierLinkedOrgIds={supplierLinkedOrgIds}
        linkedClientIdByOrgId={uniqueLinkedClientIdByOrgId}
        linkedSupplierIdByOrgId={uniqueLinkedSupplierIdByOrgId}
        viewerOrgId={orgId}
        partyContext={partyContext}
        defaultPartyId={defaultPartyIdForModal}
        defaultPartyName={resolvedModalPartyName ?? undefined}
        lockedPartyId={
          params.partyContext === "dco"
            ? (params.partyId ?? params.entityId ?? undefined)
            : params.entityType === "CLIENT"
            ? (params.entityId ?? params.partyId ?? undefined)
            : params.entityType === "SUPPLIER"
              ? (params.entityId ?? params.partyId ?? inferredSupplierFromTrip.id ?? undefined)
              : params.entityType === "DRIVER"
                ? (params.entityId ?? params.partyId ?? undefined)
                : undefined
        }
        lockedPartyName={
          params.partyContext === "dco" ||
          params.entityType === "CLIENT" || params.entityType === "SUPPLIER" || params.entityType === "DRIVER"
            ? (resolvedModalPartyName ?? undefined)
            : undefined
        }
        lockedEntityType={
          params.partyContext === "dco"
            ? null
            : params.entityType === "CLIENT" ||
          params.entityType === "SUPPLIER" ||
          params.entityType === "DRIVER"
            ? params.entityType
            : null
        }
        lockedVehicleId={isVehicleEntity ? (params.entityId ?? null) : null}
        lockedVehicleNumber={isVehicleEntity ? lockedVehicleNumber : null}
        hidePartyForCashOut={isVehicleEntity}
        initialEntry={canEditFinanceTx ? editingEntry : null}
        entryContextLabel={entryContextLabel ?? undefined}
        lockedAmount={
          params.salaryAmount != null ? (parseFloat(params.salaryAmount) || undefined) : undefined
        }
        salaryAmount={
          params.entityId && params.entityType === "DRIVER"
            ? (params.salaryAmount != null
                ? (parseFloat(params.salaryAmount) || null)
                : driverOffers[params.entityId]?.payableAmount ?? null)
            : undefined
        }
        defaultDriverPaymentType={
          params.entityType === "DRIVER" && params.defaultDriverPaymentType
            ? (params.defaultDriverPaymentType as "advance" | "settlement")
            : undefined
        }
        defaultType={
          (params.defaultType ??
            (partyContext === "customers"
              ? "in"
              : isVehicleEntity
                ? "out"
                : undefined)) as "in" | "out" | undefined
        }
        defaultTripId={params.tripId ?? undefined}
        tripLocked={tripLedgerLocked}
        lockedTripDisplay={params.tripNumber ?? undefined}
        requireTripForSupplierOut={partyContext === "suppliers"}
        dueAmountIn={effectiveDueAmountIn}
        dueAmountOut={effectiveDueAmountOut}
        ledgerTransactions={transactions}
        driverOffersByDriverId={driverOffers}
        tripAdjustmentsByTripId={tripAdjustmentsByTripId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#FBFBFB",
    ...Platform.select({
      web: {
        width: "100%",
        alignSelf: "stretch",
        ...(WEB_APP_VIEWPORT_STYLE as object),
      },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    backgroundColor: Theme.screenBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    backgroundColor: Theme.surface,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 3,
    fontWeight: "500",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
