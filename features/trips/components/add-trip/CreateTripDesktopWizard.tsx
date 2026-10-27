import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  Switch,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { MotiView } from "moti";
import { Easing } from "react-native-reanimated";
import { AlertCircle, ListTodo } from "lucide-react-native";

import {
  fullPageWizardStyles,
  WizardPriorSelections,
  type WizardPriorSelectionItem,
} from "@/components/full-page-wizard";
import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { getClientById } from "@/features/clients/services/clients.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { AddTripSourceIndent } from "@/features/trips/components/add-trip/types";
import type { AddTripFormState } from "@/features/trips/components/add-trip/types";
import type { AddTripValidationIssue } from "@/features/trips/components/add-trip/useAddTripForm";
import type { useAddTripForm } from "@/features/trips/components/add-trip/useAddTripForm";
import type { AddTripWizardStep } from "@/features/trips/components/add-trip/addTripWizardSteps";
import type { AddTripIssueField } from "@/features/trips/components/add-trip/useAddTripForm";
import type { AllocationSubStep } from "@/features/trips/components/add-trip/allocationWizardSteps";
import { IndentAllocationConfirmSummary } from "@/features/indents/components/IndentAllocationConfirmSummary";
import { formatIndianVehicleNumber, formatMobileNumber } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useClientWarehousesQuery } from "@/lib/queries/useClientWarehousesQuery";
import { useClientLaneRatesQuery } from "@/lib/queries/useClientLaneRatesQuery";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useLinkedClientOrgLocationsQuery } from "@/lib/queries/useLinkedClientOrgLocationsQuery";
import type { ClientLaneRate } from "@/features/clients/types/clientManagement.types";
import {
  buildClientLanePrefill,
  repriceLaneForTons,
} from "@/features/clients/utils/clientLanePrefill.util";
import {
  computeClientPrice,
  formatSaleAmount,
  parsePositiveAmount,
  parsePositiveTons,
  type SaleRateBasis,
} from "@/features/clients/utils/saleRateSnapshot.util";
import { AggregateTrackingMobileStep } from "./AggregateTrackingMobileStep";
import { CreateTripDesktopAllocationStep } from "./CreateTripDesktopAllocationStep";
import { CreateTripDesktopAsideArt } from "./CreateTripDesktopAsideArt";
import { CreateTripDesktopClientStep } from "./CreateTripDesktopClientStep";
import { CreateTripDesktopCommodityStep } from "./CreateTripDesktopCommodityStep";
import {
  CreateTripDesktopEntityList,
  CreateTripDesktopListSection,
} from "./CreateTripDesktopPickers";
import { CreateTripDesktopRouteStep } from "./CreateTripDesktopRouteStep";
import { CreateTripDesktopSourceStep } from "./CreateTripDesktopSourceStep";
import { CreateTripMarketFulfillmentStep } from "./CreateTripMarketFulfillmentStep";
import { CreateIndentShareDestinationStep } from "@/features/indents/components/create-indent/CreateIndentShareDestinationStep";
import { CreateIndentNetworkTargetStep } from "@/features/indents/components/create-indent/CreateIndentNetworkTargetStep";
import { entityInitials } from "./CreateTripDesktopUi";
import { createTripDesktopStyles as s } from "./createTripDesktop.styles";
import {
  buildPickupRecommendations,
  preferredPickupRecommendation,
} from "./pickupRecommendations.util";
import type { PickupRecommendation } from "./pickupRecommendations.util";
import { useAddTripFleetResources } from "./useAddTripFleetResources";
import { RouteExtraStopsCommercials } from "@/features/trips/components/RouteExtraStopsCommercials";
import {
  routeExtraStopInputs,
  summarizeRouteExtraStops,
} from "@/features/trips/utils/routeExtraStops.util";

const STEP_FADE_EASE = Easing.bezier(0.16, 1, 0.3, 1);

export type CreateTripDesktopWizardProps = {
  wizardStep: AddTripWizardStep;
  state: AddTripFormState;
  setters: ReturnType<typeof useAddTripForm>["setters"];
  clients: ClientRow[];
  clientsLoading: boolean;
  organizationId: string | null;
  validationIssues: readonly AddTripValidationIssue[];
  sourceIndent?: AddTripSourceIndent | null;
  /** Mobile full-page wizard — same steps as desktop, no side rail. */
  layout?: "desktop" | "mobile";
  /** Mobile aggregate fleet entry — party-style keypad sub-step. */
  allocationSubStep?: AllocationSubStep;
  /** Jump back within phone → name → vehicle (summary chip taps). */
  onAllocationSubStepChange?: (step: AllocationSubStep) => void;
  /** True while client step is on the contract/adhoc lane gate. */
  onLaneGateActiveChange?: (active: boolean) => void;
  /** True when a contract lane is selected (route step becomes date-first). */
  onContractLaneLockedChange?: (locked: boolean) => void;
  /** Navigate back to the client / lane-gate step (Change lane on route). */
  onRequestChangeLane?: () => void;
  allowedSupplyModes?: readonly ("asset" | "aggregate")[];
  canAggregateTrip?: boolean;
  canShareIndent?: boolean;
};

export function CreateTripDesktopWizard({
  wizardStep,
  state,
  setters,
  clients,
  clientsLoading,
  organizationId,
  validationIssues,
  sourceIndent = null,
  layout = "desktop",
  allocationSubStep,
  onAllocationSubStepChange,
  onLaneGateActiveChange,
  onContractLaneLockedChange,
  onRequestChangeLane,
  allowedSupplyModes = ["asset", "aggregate"],
  canAggregateTrip = true,
  canShareIndent = true,
}: CreateTripDesktopWizardProps) {
  const isMobileLayout = layout === "mobile";
  const router = useRouter();
  const [pickupDropdownOpen, setPickupDropdownOpen] = useState(false);
  const [dropDropdownOpen, setDropDropdownOpen] = useState(false);

  const [clientListExpanded, setClientListExpanded] = useState(() => !state.clientId);
  const [driverListExpanded, setDriverListExpanded] = useState(() => !state.driverId);
  const [vehicleListExpanded, setVehicleListExpanded] = useState(() => !state.vehicleId);
  const [partnerListExpanded, setPartnerListExpanded] = useState(() => !state.supplierId);
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null);
  const [laneSearch, setLaneSearch] = useState("");
  const [laneGateActive, setLaneGateActive] = useState(false);
  const debouncedLaneSearch = useDebouncedValue(laneSearch, 250);

  useEffect(() => {
    if (!state.clientId) setClientListExpanded(true);
  }, [state.clientId]);
  useEffect(() => {
    if (!state.driverId) setDriverListExpanded(true);
  }, [state.driverId]);
  useEffect(() => {
    if (!state.vehicleId) setVehicleListExpanded(true);
  }, [state.vehicleId]);
  useEffect(() => {
    if (!state.supplierId) setPartnerListExpanded(true);
  }, [state.supplierId]);

  const invalidSet = useMemo(
    () => new Set(validationIssues.map((i) => i.field)),
    [validationIssues],
  );
  const invalid = useCallback(
    (field: AddTripIssueField) => invalidSet.has(field),
    [invalidSet],
  );

  /**
   * Client sale total for the margin reference on the target step.
   *
   * Per-MT lanes leave `clientPrice` empty on purpose (the lane rate is ₹/MT,
   * not a trip total), which would leave the margin strip and the % presets
   * with nothing to work from. Rebuild the total from the unit rate and tons
   * so the reference shows; without a usable weight there is still no total.
   */
  const clientSaleTotalForTarget = useMemo(() => {
    if (state.clientPrice.trim()) return state.clientPrice;
    if (state.saleRateBasis !== "per_mt") return state.clientPrice;
    const unit = Number(state.saleUnitRate);
    const tons = Number(state.tons);
    if (!Number.isFinite(unit) || unit <= 0) return state.clientPrice;
    if (!Number.isFinite(tons) || tons <= 0) return state.clientPrice;
    return String(unit * tons);
  }, [state.clientPrice, state.saleRateBasis, state.saleUnitRate, state.tons]);

  const fleet = useAddTripFleetResources(organizationId, state, setters);

  const extraStopSummary = useMemo(
    () => summarizeRouteExtraStops(routeExtraStopInputs(state.extraStops)),
    [state.extraStops],
  );

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === state.clientId) ?? null,
    [clients, state.clientId],
  );
  const { data: clientDetail } = useQuery({
    queryKey: queryKeys.clients.detail(organizationId ?? "", state.clientId ?? ""),
    enabled: Boolean(organizationId && state.clientId),
    queryFn: async () => {
      const { client } = await getClientById(organizationId!, state.clientId!);
      return client;
    },
    staleTime: 60_000,
  });
  const clientForPickup = clientDetail ?? selectedClient;
  const isIntegratedClient =
    clientForPickup?.is_integrated === true ||
    Boolean(clientForPickup?.linked_organization_id);
  const { data: clientWarehouses = [], isLoading: warehousesLoading } =
    useClientWarehousesQuery(organizationId, state.clientId);
  const {
    data: contractLanes = [],
    isLoading: lanesLoading,
    isPlaceholderData: lanesPlaceholder,
  } = useClientLaneRatesQuery(organizationId, state.clientId, debouncedLaneSearch);
  const { data: linkedOrgLocations = [], isLoading: linkedLocLoading } =
    useLinkedClientOrgLocationsQuery(
      organizationId,
      state.clientId,
      isIntegratedClient,
    );
  const pickupRecommendations = useMemo(
    () =>
      buildPickupRecommendations(
        clientForPickup,
        clientWarehouses,
        linkedOrgLocations,
      ),
    [clientForPickup, clientWarehouses, linkedOrgLocations],
  );
  const pickupLocationsLoading =
    Boolean(state.clientId) &&
    (warehousesLoading || (isIntegratedClient && linkedLocLoading));

  const handleSelectPickupRecommendation = useCallback(
    (rec: PickupRecommendation) => {
      setters.setPickupArea(rec.address);
      setters.setPickupCoords(rec.lat, rec.lon);
    },
    [setters],
  );

  // Prefer registered office, then any office, then warehouse when pickup is empty.
  useEffect(() => {
    if (wizardStep !== "route") return;
    if (state.pickupArea.trim()) return;
    if (pickupLocationsLoading) return;
    const preferred = preferredPickupRecommendation(pickupRecommendations);
    if (!preferred) return;
    setters.setPickupArea(preferred.address);
    setters.setPickupCoords(preferred.lat, preferred.lon);
  }, [
    wizardStep,
    state.pickupArea,
    pickupRecommendations,
    pickupLocationsLoading,
    setters,
  ]);

  const handleSelectClient = useCallback(
    (client: ClientRow) => {
      if (state.clientId === client.id) return;
      Keyboard.dismiss();
      setters.setClientSelection(client.id, client.name);
      // Fresh client → clear prior pickup / lane so warehouse chips can be chosen anew.
      setters.setPickupArea("");
      setters.setLaneId(null);
      setSelectedLaneId(null);
      setLaneSearch("");
      setClientListExpanded(false);
    },
    [setters, state.clientId],
  );

  const handleClearClient = useCallback(() => {
    setters.setClientSelection(null, "");
    setters.setLaneId(null);
    setSelectedLaneId(null);
    setLaneSearch("");
    setClientListExpanded(true);
  }, [setters]);

  const handleSelectLane = useCallback(
    (lane: ClientLaneRate) => {
      const prefill = buildClientLanePrefill(lane);
      setSelectedLaneId(lane.id);
      setters.setLaneId(lane.id);
      setters.setSaleRateBasis(prefill.saleRateBasis);
      // A ₹/MT lane is almost always sourced per MT too — preselect the
      // matching supplier basis so the target is quoted in the same unit.
      if (prefill.saleRateBasis === "per_mt") {
        setters.setSupplierRateBasis("per_mt");
      }
      setters.setSaleUnitRate(
        prefill.saleUnitRate != null ? String(prefill.saleUnitRate) : "",
      );
      if (prefill.pickup) setters.setPickupArea(prefill.pickup);
      if (prefill.drop) setters.setDropLocation(prefill.drop);
      if (prefill.vehicleType) setters.setVehicleType(prefill.vehicleType);
      if (prefill.loadType) setters.setLoadType(prefill.loadType);
      if (prefill.tons) setters.setTons(prefill.tons);
      if (prefill.clientPrice) setters.setClientPrice(prefill.clientPrice);
      else if (prefill.saleRateBasis === "per_mt") setters.setClientPrice("");
      const wh = clientWarehouses.find((w) => w.id === prefill.originWarehouseId);
      if (wh?.latitude != null && wh?.longitude != null) {
        setters.setPickupCoords(wh.latitude, wh.longitude);
      }
    },
    [clientWarehouses, setters],
  );

  const handleClearLane = useCallback(() => {
    setSelectedLaneId(null);
    setters.setLaneId(null);
    setters.setSaleRateBasis("per_trip");
    setters.setSaleUnitRate("");
  }, [setters]);

  const handleLaneGateActiveChange = useCallback(
    (active: boolean) => {
      setLaneGateActive((prev) => (prev === active ? prev : active));
      onLaneGateActiveChange?.(active);
    },
    [onLaneGateActiveChange],
  );

  const syncPerMtTotal = useCallback(
    (unitRaw: string, tonsRaw: string) => {
      const total = computeClientPrice({
        basis: "per_mt",
        unitRate: parsePositiveAmount(unitRaw),
        tons: parsePositiveTons(tonsRaw),
      });
      setters.setClientPrice(formatSaleAmount(total));
    },
    [setters],
  );

  const handleSaleRateBasisChange = useCallback(
    (basis: SaleRateBasis) => {
      setters.setSaleRateBasis(basis);
      if (basis === "per_mt") {
        const tons = parsePositiveTons(state.tons);
        const total = parsePositiveAmount(state.clientPrice);
        if (tons && total && !parsePositiveAmount(state.saleUnitRate)) {
          const unit = Math.round((total / tons) * 100) / 100;
          setters.setSaleUnitRate(String(unit));
        }
        syncPerMtTotal(state.saleUnitRate, state.tons);
        return;
      }
      if (parsePositiveAmount(state.saleUnitRate) && parsePositiveTons(state.tons)) {
        syncPerMtTotal(state.saleUnitRate, state.tons);
      }
    },
    [setters, state.clientPrice, state.saleUnitRate, state.tons, syncPerMtTotal],
  );

  const handleSaleUnitRateChange = useCallback(
    (value: string) => {
      setters.setSaleUnitRate(value);
      syncPerMtTotal(value, state.tons);
    },
    [setters, state.tons, syncPerMtTotal],
  );

  /**
   * Weight drives the price on per-MT lanes, so editing tons must re-derive
   * the client price from the stored unit rate.
   */
  const handleTonsChange = useCallback(
    (value: string) => {
      setters.setTons(value);
      if (state.saleRateBasis === "per_mt") {
        syncPerMtTotal(state.saleUnitRate, value);
        return;
      }
      const lane = selectedLaneId
        ? contractLanes.find((l) => l.id === selectedLaneId)
        : undefined;
      if (!lane) return;
      const repriced = repriceLaneForTons(lane, value);
      if (repriced) setters.setClientPrice(repriced);
    },
    [contractLanes, selectedLaneId, setters, state.saleRateBasis, state.saleUnitRate, syncPerMtTotal],
  );

  const handleChangeLaneFromRoute = useCallback(() => {
    setSelectedLaneId(null);
    onRequestChangeLane?.();
  }, [onRequestChangeLane]);

  const lastContractLockedRef = useRef<boolean | null>(null);
  useEffect(() => {
    const locked = Boolean(selectedLaneId);
    if (lastContractLockedRef.current === locked) return;
    lastContractLockedRef.current = locked;
    onContractLaneLockedChange?.(locked);
  }, [selectedLaneId, onContractLaneLockedChange]);

  useEffect(() => {
    if (!state.laneId) {
      if (selectedLaneId != null) setSelectedLaneId(null);
      return;
    }
    if (state.laneId !== selectedLaneId) {
      setSelectedLaneId(state.laneId);
    }
  }, [state.laneId, selectedLaneId]);

  const handleAddClient = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-client",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);

  const handleAddPartner = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-supplier",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);

  const handleSelectPartner = useCallback(
    (supplier: SupplierRow) => {
      const primary =
        supplier.company_name?.trim() || supplier.name?.trim() || "—";
      setters.setSupplierSelection(supplier.id, primary);
      setPartnerListExpanded(false);
    },
    [setters],
  );

  const handleAddDriver = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-driver",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);

  const handleAddVehicle = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-vehicle",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);

  const handleSelectAssetDriver = useCallback(
    (id: string) => {
      const row = fleet.driverOptions.find((d) => d.id === id);
      if (row?.isBusy) return;
      const newId = state.driverId === id ? null : id;
      const dr = newId
        ? fleet.driverOptions.find((d) => d.id === newId)
        : null;
      setters.setDriver(
        newId,
        dr?.commission_percent ?? null,
        dr?.commission_per_km ?? null,
      );
      if (newId) setDriverListExpanded(false);
    },
    [fleet.driverOptions, setters, state.driverId],
  );

  const handleSelectAssetVehicle = useCallback(
    (id: string) => {
      const row = fleet.vehicleOptions.find((v) => v.id === id);
      if (row?.isBusy) return;
      setters.setVehicleId(state.vehicleId === id ? null : id);
      if (state.vehicleId !== id) setVehicleListExpanded(false);
    },
    [fleet.vehicleOptions, setters, state.vehicleId],
  );

  const driverListItems = useMemo(
    () =>
      fleet.driverOptions.map((driver) => ({
        id: driver.id,
        title: driver.name ?? "Driver",
        subtitle: driver.phone ?? driver.email ?? undefined,
        initials: entityInitials(driver.name ?? "DR"),
        entityType: "driver" as const,
        avatarUrl: driver.avatar_url ?? null,
        avatarSeed: driver.avatar_seed ?? null,
        disabled: driver.isBusy,
        statusLabel: driver.isBusy ? "On trip" : "Available",
        statusTone: driver.isBusy ? ("busy" as const) : ("available" as const),
      })),
    [fleet.driverOptions],
  );

  const vehicleListItems = useMemo(
    () =>
      fleet.vehicleOptions.map((vehicle) => {
        const tag =
          formatIndianVehicleNumber(vehicle.vehicle_number || "") ||
          vehicle.vehicle_number ||
          "Vehicle";
        const type = vehicle.vehicle_body_type || vehicle.vehicle_type || "—";
        return {
          id: vehicle.id,
          title: tag,
          subtitle: type,
          initials: tag.slice(0, 2).toUpperCase(),
          entityType: "vehicle" as const,
          disabled: vehicle.isBusy,
          statusLabel: vehicle.isBusy ? "On trip" : "Available",
          statusTone: vehicle.isBusy ? ("busy" as const) : ("available" as const),
        };
      }),
    [fleet.vehicleOptions],
  );

  const selectedDriverLabel = useMemo(() => {
    const row = fleet.driverOptions.find((d) => d.id === state.driverId);
    return row?.name?.trim() || "—";
  }, [fleet.driverOptions, state.driverId]);

  const selectedVehicleLabel = useMemo(() => {
    const row = fleet.vehicleOptions.find((v) => v.id === state.vehicleId);
    if (!row) return "—";
    return (
      formatIndianVehicleNumber(row.vehicle_number || "") ||
      row.vehicle_number ||
      "—"
    );
  }, [fleet.vehicleOptions, state.vehicleId]);

  const partnerLabel = useMemo(() => {
    const row = fleet.selectedSupplierRow;
    if (!row) return state.supplierDisplayName?.trim() || "—";
    return row.company_name?.trim() || row.name?.trim() || "—";
  }, [fleet.selectedSupplierRow, state.supplierDisplayName]);

  const mobileConfirmRows = useMemo(() => {
    if (
      !isMobileLayout ||
      wizardStep !== "allocation" ||
      state.assignLater ||
      allocationSubStep !== "confirm"
    ) {
      return [];
    }

    const rows: {
      id: string;
      label: string;
      value: string;
      onEdit?: () => void;
    }[] = [];

    if (selectedClient) {
      rows.push({
        id: "client",
        label: "Client",
        value: selectedClient.name?.trim() || "Client",
      });
    }

    if (state.supplySource === "aggregate") {
      rows.push({
        id: "partner",
        label: "Partner",
        value: state.supplierId ? partnerLabel : "—",
      });
      const rateRaw = state.supplierRate.trim();
      rows.push({
        id: "rate",
        label: "Rate",
        value: rateRaw
          ? `₹${Number(rateRaw).toLocaleString("en-IN")}`
          : "—",
      });
      rows.push({
        id: "phone",
        label: "Driver phone",
        value: state.driverPhone.trim() || "—",
        onEdit: () => onAllocationSubStepChange?.("driverPhone"),
      });
      rows.push({
        id: "driver",
        label: "Driver",
        value: state.aggregateDriverName.trim() || "—",
        onEdit: () => onAllocationSubStepChange?.("driverName"),
      });
      rows.push({
        id: "vehicle",
        label: "Vehicle",
        value:
          formatIndianVehicleNumber(state.aggregateVehicleText.trim()) ||
          state.aggregateVehicleText.trim() ||
          "—",
        onEdit: () => onAllocationSubStepChange?.("vehicle"),
      });
      return rows;
    }

    rows.push({
      id: "driver",
      label: "Driver",
      value: state.driverId ? selectedDriverLabel : "—",
      onEdit: () => onAllocationSubStepChange?.("fleetDriver"),
    });
    rows.push({
      id: "vehicle",
      label: "Vehicle",
      value: state.vehicleId ? selectedVehicleLabel : "—",
      onEdit: () => onAllocationSubStepChange?.("fleetVehicle"),
    });
    return rows;
  }, [
    isMobileLayout,
    wizardStep,
    state.assignLater,
    state.supplySource,
    state.supplierId,
    state.supplierRate,
    state.driverPhone,
    state.aggregateDriverName,
    state.aggregateVehicleText,
    state.driverId,
    state.vehicleId,
    allocationSubStep,
    selectedClient,
    partnerLabel,
    selectedDriverLabel,
    selectedVehicleLabel,
    onAllocationSubStepChange,
  ]);

  let stepContent: ReactNode = null;
  switch (wizardStep) {
    case "client":
      stepContent = (
        <CreateTripDesktopClientStep
          compact={isMobileLayout}
          clients={clients}
          clientsLoading={clientsLoading}
          clientId={state.clientId}
          clientListExpanded={clientListExpanded}
          onExpandClientList={() => setClientListExpanded(true)}
          onToggleClientList={() => setClientListExpanded((prev) => !prev)}
          onSelectClient={handleSelectClient}
          onAddClient={handleAddClient}
          clientError={invalid("client")}
          clientPrice={state.clientPrice}
          onClientPriceChange={setters.setClientPrice}
          clientPriceError={invalid("clientPrice")}
          onClearClient={handleClearClient}
          contractLanes={contractLanes}
          contractLanesLoading={lanesLoading}
          contractLanesPlaceholder={lanesPlaceholder}
          selectedLaneId={selectedLaneId}
          onSelectLane={handleSelectLane}
          onClearLane={handleClearLane}
          laneSearch={laneSearch}
          onLaneSearchChange={setLaneSearch}
          onLaneGateActiveChange={handleLaneGateActiveChange}
          saleRateBasis={state.saleRateBasis}
          saleUnitRate={state.saleUnitRate}
          onSaleRateBasisChange={handleSaleRateBasisChange}
          onSaleUnitRateChange={handleSaleUnitRateChange}
        />
      );
      break;
    case "route":
      stepContent = (
        <CreateTripDesktopRouteStep
          compact={isMobileLayout}
          state={state}
          setters={setters}
          fieldInvalid={invalid}
          onPickupDropdownOpenChange={setPickupDropdownOpen}
          onDropDropdownOpenChange={setDropDropdownOpen}
          pickupRecommendations={pickupRecommendations}
          onSelectPickupRecommendation={handleSelectPickupRecommendation}
          pickupLocationsLoading={pickupLocationsLoading}
          contractRouteLocked={Boolean(selectedLaneId)}
          onChangeLane={selectedLaneId ? handleChangeLaneFromRoute : undefined}
          extraStops={sourceIndent ? undefined : state.extraStops}
          onExtraStopsChange={sourceIndent ? undefined : setters.setExtraStops}
        />
      );
      break;
    case "commodity":
      stepContent = (
        <CreateTripDesktopCommodityStep
          compact={isMobileLayout}
          vehicleType={state.vehicleType}
          loadType={state.loadType}
          tons={state.tons}
          onVehicleTypeChange={setters.setVehicleType}
          onLoadTypeChange={setters.setLoadType}
          onTonsChange={handleTonsChange}
          vehicleTypeError={invalid("vehicleType")}
          loadTypeError={invalid("loadType")}
          tonsError={invalid("tons")}
          indentVehicleType={sourceIndent?.vehicle_type}
          indentLoadType={sourceIndent?.load_type}
        />
      );
      break;
    case "source":
      stepContent = (
        <CreateTripDesktopSourceStep
          compact={isMobileLayout}
          state={state}
          setters={setters}
          invalid={invalid}
          suppliers={fleet.suppliers}
          suppliersLoading={fleet.suppliersLoading}
          partnerListExpanded={partnerListExpanded}
          onExpandPartnerList={() => setPartnerListExpanded(true)}
          onTogglePartnerList={() => setPartnerListExpanded((prev) => !prev)}
          onSelectPartner={handleSelectPartner}
          onAddPartner={handleAddPartner}
          variant="source"
          allowedSupplyModes={allowedSupplyModes}
        />
      );
      break;
    case "market_fulfillment":
      stepContent = (
        <CreateTripMarketFulfillmentStep
          compact={isMobileLayout}
          value={state.marketFulfillment}
          onChange={setters.setMarketFulfillment}
          showExistingSupplier={canAggregateTrip}
          showShareForBidding={canShareIndent}
        />
      );
      break;
    case "market_partner":
      stepContent = (
        <CreateTripDesktopSourceStep
          compact={isMobileLayout}
          state={state}
          setters={setters}
          invalid={invalid}
          suppliers={fleet.suppliers}
          suppliersLoading={fleet.suppliersLoading}
          partnerListExpanded={partnerListExpanded}
          onExpandPartnerList={() => setPartnerListExpanded(true)}
          onTogglePartnerList={() => setPartnerListExpanded((prev) => !prev)}
          onSelectPartner={handleSelectPartner}
          onAddPartner={handleAddPartner}
          variant="partner"
          allowedSupplyModes={["aggregate"]}
        />
      );
      break;
    case "share_destination":
      stepContent = (
        <CreateIndentShareDestinationStep
          compact={isMobileLayout}
          value={state.circulationTarget}
          onChange={setters.setCirculationTarget}
        />
      );
      break;
    case "share_target":
      stepContent = (
        <CreateIndentNetworkTargetStep
          compact={isMobileLayout}
          supplierTarget={state.supplierTarget}
          onSupplierTargetChange={setters.setSupplierTarget}
          clientPrice={clientSaleTotalForTarget}
          supplierRateBasis={state.supplierRateBasis}
          weightTons={state.tons}
          clientUnitRatePerMt={state.saleUnitRate}
          onSupplierRateBasisChange={setters.setSupplierRateBasis}
          extraStops={extraStopSummary}
          errorMessage={
            invalid("supplierTarget")
              ? "Enter a supplier target rate greater than 0"
              : undefined
          }
        />
      );
      break;
    case "allocation": {
      const mobileFleetKeypad =
        isMobileLayout &&
        state.supplySource === "aggregate" &&
        !state.assignLater &&
        (allocationSubStep === "driverPhone" ||
          allocationSubStep === "driverName" ||
          allocationSubStep === "vehicle");

      const mobileAssetFleet =
        isMobileLayout &&
        state.supplySource === "asset" &&
        !state.assignLater &&
        (allocationSubStep === "fleetDriver" ||
          allocationSubStep === "fleetVehicle");

      if (mobileFleetKeypad && allocationSubStep) {
        const summaryItems: WizardPriorSelectionItem[] = [];
        if (selectedClient) {
          summaryItems.push({
            id: "client",
            label: "Client",
            name: selectedClient.name?.trim() || "Client",
          });
        }
        const rateRaw = state.supplierRate.trim();
        if (rateRaw) {
          summaryItems.push({
            id: "rate",
            label: "Rate",
            name: `₹${Number(rateRaw).toLocaleString("en-IN")}`,
          });
        }
        if (
          (allocationSubStep === "driverName" ||
            allocationSubStep === "vehicle") &&
          state.driverPhone.trim()
        ) {
          summaryItems.push({
            id: "phone",
            label: "Phone",
            name: state.driverPhone.trim(),
            onPress: () => onAllocationSubStepChange?.("driverPhone"),
          });
        }
        if (
          allocationSubStep === "vehicle" &&
          state.aggregateDriverName.trim()
        ) {
          summaryItems.push({
            id: "name",
            label: "Driver",
            name: state.aggregateDriverName.trim(),
            onPress: () => onAllocationSubStepChange?.("driverName"),
          });
        }

        stepContent = (
          <View style={s.saleMobileKeypadRoot}>
            <View style={fullPageWizardStyles.wizardKeypadChromePad}>
              {summaryItems.length > 0 ? (
                <WizardPriorSelections items={summaryItems} compact />
              ) : null}
              {allocationSubStep === "driverPhone" ? (
                <View
                  style={[
                    s.inputBoxClean,
                    s.allocAssignLaterBox,
                    s.compactAssignLaterBox,
                  ]}
                >
                  <ListTodo
                    size={16}
                    color={Theme.textRouteCard}
                    strokeWidth={2}
                  />
                  <View style={s.allocAssignLaterCopy}>
                    <Text style={s.allocAssignLaterTitle}>Assign later</Text>
                    <Text style={s.allocAssignLaterSub}>
                      Pick vehicle & driver on trip detail
                    </Text>
                  </View>
                  <Switch
                    value={state.assignLater}
                    onValueChange={setters.setAssignLater}
                    disabled={fleet.assignLaterSwitchDisabled}
                    trackColor={{
                      false: Theme.borderLight,
                      true: Theme.textPrimaryDark,
                    }}
                    thumbColor={Theme.cardWhite}
                  />
                </View>
              ) : null}
            </View>
            <AggregateTrackingMobileStep
              step={allocationSubStep}
              driverName={state.aggregateDriverName}
              onDriverNameChange={setters.setAggregateDriverName}
              driverPhone={state.driverPhone}
              onDriverPhoneChange={(v) =>
                setters.setDriverPhone(formatMobileNumber(v))
              }
              vehicleText={state.aggregateVehicleText}
              onVehicleTextChange={setters.setAggregateVehicleText}
              invalid={invalid}
              driverPhoneMatches={fleet.driverPhoneMatches}
              driverPhoneLookupLoading={fleet.driverPhoneLookupLoading}
              selectedDriverMatchId={fleet.selectedDriverMatchId}
              onSelectDriverMatch={fleet.applyDriverPhoneMatch}
              driverPhoneInTrip={state.driverPhoneTripConflict}
              driverNameFromPlatform={state.driverPhoneName?.trim() || null}
              fleetDrivers={fleet.drivers}
            />
          </View>
        );
        break;
      }

      if (
        isMobileLayout &&
        !state.assignLater &&
        allocationSubStep === "confirm" &&
        mobileConfirmRows.length > 0
      ) {
        stepContent = (
          <View style={[s.stepBody, s.compactStepBody]}>
            <IndentAllocationConfirmSummary
              title="Confirm trip"
              hint="Tap Edit to change a detail before creating."
              rows={mobileConfirmRows}
            />
          </View>
        );
        break;
      }

      if (mobileAssetFleet && allocationSubStep) {
        const summaryItems: WizardPriorSelectionItem[] = [];
        if (selectedClient) {
          summaryItems.push({
            id: "client",
            label: "Client",
            name: selectedClient.name?.trim() || "Client",
          });
        }
        if (
          allocationSubStep === "fleetVehicle" &&
          state.driverId &&
          selectedDriverLabel !== "—"
        ) {
          summaryItems.push({
            id: "driver",
            label: "Driver",
            name: selectedDriverLabel,
            onPress: () => onAllocationSubStepChange?.("fleetDriver"),
          });
        }

        stepContent = (
          <View style={[s.stepBody, s.compactStepBody]}>
            <View style={fullPageWizardStyles.wizardKeypadChromePad}>
              {summaryItems.length > 0 ? (
                <WizardPriorSelections items={summaryItems} compact />
              ) : null}
              {allocationSubStep === "fleetDriver" ? (
                <View
                  style={[
                    s.inputBoxClean,
                    s.allocAssignLaterBox,
                    s.compactAssignLaterBox,
                  ]}
                >
                  <ListTodo
                    size={16}
                    color={Theme.textRouteCard}
                    strokeWidth={2}
                  />
                  <View style={s.allocAssignLaterCopy}>
                    <Text style={s.allocAssignLaterTitle}>Assign later</Text>
                    <Text style={s.allocAssignLaterSub}>
                      Pick vehicle & driver on trip detail
                    </Text>
                  </View>
                  <Switch
                    value={state.assignLater}
                    onValueChange={setters.setAssignLater}
                    disabled={fleet.assignLaterSwitchDisabled}
                    trackColor={{
                      false: Theme.borderLight,
                      true: Theme.textPrimaryDark,
                    }}
                    thumbColor={Theme.cardWhite}
                  />
                </View>
              ) : null}
            </View>

            {fleet.assetFleetWarningLines.length > 0 ? (
              <View style={s.allocationWarnCompact}>
                <AlertCircle size={14} color={Theme.warning} strokeWidth={2.5} />
                <Text style={s.allocationWarnCompactText}>
                  {fleet.assetFleetWarningLines[0]}
                </Text>
              </View>
            ) : null}

            {fleet.fleetLoading ? (
              <ActivityIndicator
                color={Theme.iconPrimary}
                style={{ marginVertical: 24 }}
              />
            ) : allocationSubStep === "fleetDriver" ? (
              <CreateTripDesktopListSection
                heading="Select driver"
                count={fleet.driverOptions.length}
                onAddPress={handleAddDriver}
                addAccessibilityLabel="Add driver"
              >
                <CreateTripDesktopEntityList
                  items={driverListItems}
                  selectedId={state.driverId}
                  listExpanded
                  onExpandList={() => setDriverListExpanded(true)}
                  onSelect={handleSelectAssetDriver}
                  compact
                />
              </CreateTripDesktopListSection>
            ) : (
              <CreateTripDesktopListSection
                heading="Select vehicle"
                count={fleet.vehicleOptions.length}
                onAddPress={handleAddVehicle}
                addAccessibilityLabel="Add vehicle"
              >
                <CreateTripDesktopEntityList
                  items={vehicleListItems}
                  selectedId={state.vehicleId}
                  listExpanded
                  onExpandList={() => setVehicleListExpanded(true)}
                  onSelect={handleSelectAssetVehicle}
                  compact
                />
              </CreateTripDesktopListSection>
            )}
          </View>
        );
        break;
      }

      const allocationExtraStops =
        extraStopSummary.count > 0 ? (
          <RouteExtraStopsCommercials
            summary={extraStopSummary}
            clientBase={Number(String(clientSaleTotalForTarget).replace(/[^\d.]/g, "")) || 0}
            supplierBase={
              state.supplySource === "aggregate"
                ? Number(String(state.supplierRate).replace(/[^\d.]/g, "")) || 0
                : null
            }
            style={{ marginBottom: 12 }}
          />
        ) : null;
      stepContent = (
        <>
        {allocationExtraStops}
        <CreateTripDesktopAllocationStep
          compact={isMobileLayout}
          state={state}
          setters={setters}
          invalid={invalid}
          drivers={fleet.driverOptions}
          vehicles={fleet.vehicleOptions}
          fleetLoading={fleet.fleetLoading}
          selectedSupplierRow={fleet.selectedSupplierRow}
          assignLaterSwitchDisabled={fleet.assignLaterSwitchDisabled}
          assetFleetWarningLines={fleet.assetFleetWarningLines}
          driverPhoneMatches={fleet.driverPhoneMatches}
          driverPhoneLookupLoading={fleet.driverPhoneLookupLoading}
          selectedDriverMatchId={fleet.selectedDriverMatchId}
          onSelectDriverMatch={fleet.applyDriverPhoneMatch}
          driverListExpanded={driverListExpanded}
          vehicleListExpanded={vehicleListExpanded}
          onExpandDriverList={() => setDriverListExpanded(true)}
          onExpandVehicleList={() => setVehicleListExpanded(true)}
          onSelectDriver={handleSelectAssetDriver}
          onSelectVehicle={handleSelectAssetVehicle}
          onAddDriver={handleAddDriver}
          onAddVehicle={handleAddVehicle}
        />
        </>
      );
      break;
    }
    default:
      stepContent = null;
  }

  void pickupDropdownOpen;
  void dropDropdownOpen;

  const mobileKeypadFill =
    isMobileLayout &&
    ((wizardStep === "client" && Boolean(state.clientId) && !laneGateActive) ||
      (wizardStep === "source" &&
        state.supplySource === "aggregate" &&
        Boolean(state.supplierId)) ||
      (wizardStep === "market_partner" && Boolean(state.supplierId)) ||
      (wizardStep === "share_target") ||
      (wizardStep === "allocation" &&
        state.supplySource === "aggregate" &&
        !state.assignLater &&
        (allocationSubStep === "driverPhone" ||
          allocationSubStep === "driverName" ||
          allocationSubStep === "vehicle")));

  const workspaceStyle =
    isMobileLayout
      ? mobileKeypadFill
        ? s.wizardWorkspaceSoloFill
        : s.wizardWorkspaceSolo
      : wizardStep === "allocation"
        ? s.wizardWorkspaceFill
        : s.wizardWorkspace;

  return (
    <View style={workspaceStyle}>
      <View
        style={[
          isMobileLayout ? s.wizardWorkspaceMainSolo : s.wizardWorkspaceMain,
          !isMobileLayout &&
            wizardStep === "allocation" &&
            s.wizardWorkspaceMainFill,
          isMobileLayout && s.wizardWorkspaceMainMobile,
          mobileKeypadFill && s.wizardWorkspaceMainMobileFill,
        ]}
      >
        <MotiView
          key={`${wizardStep}-${allocationSubStep ?? ""}`}
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 280, easing: STEP_FADE_EASE }}
          style={[
            s.stepFadeWrap,
            isMobileLayout &&
              (mobileKeypadFill ? s.saleMobileKeypadRoot : s.compactRouteBody),
          ]}
        >
          {stepContent}
        </MotiView>
      </View>
      {!isMobileLayout ? (
        <View style={s.wizardWorkspaceAside}>
          <MotiView
            key={`aside-${wizardStep}-${selectedLaneId ? "lane" : "adhoc"}`}
            from={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "timing", duration: 260, easing: STEP_FADE_EASE }}
          >
            <CreateTripDesktopAsideArt
              wizardStep={wizardStep}
              contractRouteLocked={Boolean(selectedLaneId)}
            />
          </MotiView>
        </View>
      ) : null}
    </View>
  );
}
