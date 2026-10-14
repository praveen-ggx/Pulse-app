/**
 * Create Trip — sectioned form (route, client, allocation); Theme tokens only.
 */
import { resolveWizardClientPhone } from "@/features/clients/utils/clientContactDisplay.util";
import { fullPageWizardStyles, WizardClientSummaryCard, WizardEntitySummaryCard, WizardFormBody, WizardPartyContextRow, WizardPriorSelections, type WizardPriorSelectionItem } from "@/components/full-page-wizard";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import { PartyAvatar } from "@/components/PartyAvatar";
import { TypewriterText } from "@/components/TypewriterText";
import { SmartInput } from "@/components/mobile-input";
import { type ClientRow } from "@/features/clients/services/clients.service";
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
import { AssignmentEntityAvatarGrid } from "@/features/trips/components/AssignmentEntityAvatarGrid";
import {
  driverOptionsToAvatarGridItems,
  vehicleOptionsToAvatarGridItems,
} from "@/features/trips/utils/fleetAvatarGridItems.util";
import {
  clientsToAvatarGridItems,
  clientsToWizardAvatarGridItems,
} from "@/features/clients/utils/clientAvatarGridItems.util";
import { ClientSaleKeypadFlow } from "@/features/trips/components/add-trip/ClientSaleKeypadFlow";
import type { AddTripWizardStep } from "@/features/trips/components/add-trip/addTripWizardSteps";
import { CreateTripDesktopRouteStep } from "@/features/trips/components/add-trip/CreateTripDesktopRouteStep";
import { RouteExtraStopsEditor } from "@/features/trips/components/add-trip/RouteExtraStopsEditor";
import { CreateTripDesktopCommodityClientStep } from "@/features/trips/components/add-trip/CreateTripDesktopCommodityClientStep";
import { CreateTripDesktopSaleStep } from "@/features/trips/components/add-trip/CreateTripDesktopSaleStep";
import { CreateTripDesktopPartnerRatesSection } from "@/features/trips/components/add-trip/CreateTripDesktopPartnerRatesSection";
import { CreateTripDesktopAggregateFields } from "@/features/trips/components/add-trip/CreateTripDesktopAggregateFields";
import { CreateTripDesktopAsideArt } from "@/features/trips/components/add-trip/CreateTripDesktopAsideArt";
import { createTripDesktopStyles } from "@/features/trips/components/add-trip/createTripDesktop.styles";
import { TripPartnerPickerSection } from "@/features/trips/components/add-trip/TripPartnerPickerSection";
import { SupplyAllocationModeBar } from "@/features/trips/components/SupplyAllocationModeBar";
import { assignmentShellStyles } from "@/features/trips/styles/assignmentShellShared";
import {
    formatIndianVehicleNumber,
    formatMobileNumber,
} from "@/lib/format";
import {
  applyIndianVehicleKeystroke,
  getIndianVehicleFormatHint,
  getIndianVehicleTextInputKeyboardType,
} from "@/lib/indianVehicleInput.util";
import { validatePhone } from "@/lib/phoneValidation";
import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    FileText,
    Info,
    MapPin,
    Navigation,
    Truck,
    User,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import type { TextStyle, ViewStyle } from "react-native";
import {
    ActivityIndicator,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import LottieView from "lottie-react-native";
import { ROUTES } from "@/lib/routes";
import { ADD_TRIP_FORM } from "./addTripFormTokens";
import { AddTripWebCurrencyField } from "./AddTripWebCurrencyField";
import { PULSE_TRIP, PULSE_TRIP_RADIUS } from "./addTripPulseTheme";
import {
  allocationSubStepLabel,
  getAllocationSubSteps,
  type AllocationSubStep,
} from "./allocationWizardSteps";
import { AllocationMobileWizardShell } from "./AllocationMobileWizardShell";
import { PartnerRatesKeypadFlow } from "@/features/trips/components/allocation/PartnerRatesKeypadFlow";
import { supplierToNumericPartyPreview } from "@/features/suppliers/utils/supplierNumericPartyPreview.util";
import { useKeyboardAccessory } from "@/contexts/KeyboardAccessoryContext";
import { AggregateTrackingMobileStep } from "./AggregateTrackingMobileStep";
import { DriverPhoneRecommendations } from "./DriverPhoneRecommendations";
import { lookupDriversByPhoneVariants, enrichDriverMatchesWithFleetAvatars } from "@/features/trips/utils/driverPhoneLookup.util";
import { LocationSearchField } from "./LocationSearchField";
import { TripClientPickerSection } from "./TripClientPickerSection";
import { TripCommodityFields } from "./TripCommodityFields";
import type { AddTripFormState, AddTripSourceIndent } from "./types";
import type { AddTripIssueField, AddTripValidationIssue } from "./useAddTripForm";
import type { useAddTripForm } from "./useAddTripForm";

function routePreviewLine(s: string): string {
  const t = s.trim();
  return t || "—";
}

const ROUTE_INSTRUCTOR_ANIMATION = require("@/assets/Animated folder/reach the location.json");

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getToday(): string {
  return toISODate(new Date());
}

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISODate(d);
}

function getDayAfter(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return toISODate(d);
}

const inputStyle = {
  borderColor: Theme.borderInput,
  color: Theme.textPrimary,
  backgroundColor: Theme.surfaceForm,
};
/** Transaction-row label tint on Create Trip (FinanceTxnTypography.fieldLabel uses textSecondary). */
const labelStyle = { color: Theme.textMutedDemo };
const TRIP_TERMINAL_STATUSES = new Set([
  "completed",
  "cancelled",
  "done",
  "delivered",
]);

export interface AddTripFormFieldsProps {
  state: AddTripFormState;
  setters: ReturnType<typeof useAddTripForm>["setters"];
  clients: ClientRow[];
  clientsLoading: boolean;
  organizationId: string | null;
  refetchClients: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  validationMessage?: string | null;
  validationIssues?: AddTripValidationIssue[];
  submitting?: boolean;
  showInlineCta?: boolean;
  /** Keep Create Trip tappable while invalid; parent passes empty validationIssues until submit attempt. */
  enablePrimaryWhenInvalid?: boolean;
  /**
   * Mobile wizard mode: show a single section card at a time.
   * When unset, renders the full 01/02/03 cards.
   */
  wizardSection?: AddTripWizardStep;
  /** Wide desktop enterprise grid (matches Create Load / indent). */
  enterpriseFormGrid?: boolean;
  /** Stepped mobile wizard — indent-style flat steps + shell scroll. */
  mobileWizardMode?: boolean;
  /** Desktop overlay wizard — reference layout (CreateTripDesktopShell). */
  desktopWizardChrome?: boolean;
  sourceIndent?: AddTripSourceIndent | null;
  /** Mobile allocation sub-step (one screen at a time). */
  allocationSubStep?: AllocationSubStep;
  /** Jump back to a prior allocation sub-step (e.g. change partner from rates). */
  onAllocationSubStepChange?: (step: AllocationSubStep) => void;
  /** RBAC: which supply modes the org may use. */
  allowedSupplyModes?: readonly ("asset" | "aggregate")[];
}

function allocationProgressTabLabel(
  step: AllocationSubStep,
  supplySource: AddTripFormState["supplySource"],
): string {
  switch (step) {
    case "supply":
      return supplySource === "aggregate" ? "Partner" : supplySource === "asset" ? "Fleet" : "Mode";
    case "rates":
      return "Rates";
    case "driverPhone":
      return "Phone";
    case "driverName":
      return "Name";
    case "vehicle":
      return "Vehicle";
    case "fleetDriver":
      return "Driver";
    case "fleetVehicle":
      return "Vehicle";
    case "confirm":
      return "Confirm";
    default:
      return allocationSubStepLabel(step);
  }
}

export function AddTripFormFields({
  state,
  setters,
  clients,
  clientsLoading,
  organizationId,
  refetchClients,
  onSubmit,
  canSubmit,
  validationMessage = null,
  validationIssues = [],
  submitting = false,
  showInlineCta = true,
  enablePrimaryWhenInvalid = false,
  wizardSection,
  enterpriseFormGrid = false,
  mobileWizardMode = false,
  desktopWizardChrome = false,
  allocationSubStep,
  onAllocationSubStepChange,
  sourceIndent = null,
  allowedSupplyModes = ["asset", "aggregate"] as const,
}: AddTripFormFieldsProps) {
  void refetchClients;
  const invalidSet = useMemo(
    () => new Set(validationIssues.map((i) => i.field)),
    [validationIssues],
  );
  const invalid = useCallback(
    (field: AddTripIssueField) => invalidSet.has(field),
    [invalidSet],
  );
  const outlineErr = useCallback(
    (field: AddTripIssueField) =>
      invalid(field) ? styles.inputErrorOutline : undefined,
    [invalid],
  );

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const isCompactMobile = winW < 480;
  const isWeb = Platform.OS === "web";
  const useWebCurrencyField = isWeb && winW >= 720;
  /** Web only: CSS grid when not in stepped wizard (indent-style enterprise layout). */
  const desktopFormGrid =
    enterpriseFormGrid &&
    wizardSection == null &&
    Platform.OS === "web" &&
    !isCompactMobile;
  /** Tighter typography and fields (desktop grid + mobile). */
  const isDenseForm = !isWeb || desktopFormGrid || winW < 1280;
  const iconFieldInputStyle = [
    styles.iconInput,
    inputStyle,
    isDenseForm && styles.iconInputDense,
  ];
  const primaryCtaDisabled = enablePrimaryWhenInvalid
    ? submitting
    : !canSubmit || submitting;
  const isWide = winW >= 720;
  /** Partner + allocation panes side-by-side (aggregate). */
  const allocationWideLayout = winW >= 920;
  /**
   * Driver phone + vehicle reg (aggregate) or assign driver + vehicle (asset) in one row.
   * Higher than `allocationWideLayout` so laptops ~1024–1100px don’t split those fields in half.
   */
  const driverVehicleSideBySide = winW >= 1100;
  /** Desktop form shell: use viewport minus edge padding (aligned with Create Indent). */
  const desktopFormMaxWidth = Math.min(winW - 32, 1680);
  const showRouteCard = wizardSection == null || wizardSection === "route";
  const isMergedCommodityClient =
    wizardSection === "client" ||
    wizardSection === "commodity" ||
    (wizardSection == null && desktopFormGrid);
  const showStandaloneCommodityCard =
    wizardSection == null && !desktopFormGrid;
  const showCommodityCard = showStandaloneCommodityCard;
  const showCommodityClientCard = isMergedCommodityClient;
  const showClientCard = wizardSection == null && !desktopFormGrid;
  /** Sale value now lives under the billing client on Client step. */
  const showSaleCard = false;
  const showClientPickerOnly = isMergedCommodityClient;
  const showClientSaleOnly = false;
  const hideWizardCardHead = wizardSection != null || desktopWizardChrome;
  const hideTonsOnRouteStep = wizardSection === "route";
  const showAllocationCard =
    wizardSection == null ||
    wizardSection === "allocation" ||
    wizardSection === "source";
  const mobileAllocWizard = allocationSubStep != null;
  /** Enterprise desktop card — partner + rates grid (matches Client & Commercials). */
  const aggregateDesktopEnterprise = desktopFormGrid && !mobileAllocWizard;
  const isWizardRouteStep = wizardSection === "route";
  const isWizardSingleCard =
    wizardSection != null &&
    wizardSection !== "allocation" &&
    wizardSection !== "source";
  const isWizardAllocationCard = wizardSection === "allocation";
  const isWizardSourceCard = wizardSection === "source";
  /** When Source is a top-level step, allocation no longer edits mode/partner. */
  const hideModeOnAllocation = wizardSection === "allocation";
  const hideAssignLaterOnSource = wizardSection === "source";
  /** Compact currency / tracking fields in aggregate allocation pane. */
  const aggregateFieldDensity = isDenseForm || allocationWideLayout ? "compact" : "default";
  const showAlloc = useCallback(
    (step: AllocationSubStep) =>
      allocationSubStep == null || allocationSubStep === step,
    [allocationSubStep],
  );
  const showDriverNameField =
    !mobileAllocWizard || allocationSubStep === "driverName";
  const showDriverPhoneField =
    !mobileAllocWizard || allocationSubStep === "driverPhone";
  const showVehicleField =
    !mobileAllocWizard || allocationSubStep === "vehicle";
  /** Aggregate partner on Source step, or legacy supply when Source is not used. */
  const showAggregatePartnerInline =
    (isWizardSourceCard && state.supplySource === "aggregate") ||
    (!isWizardSourceCard &&
      !hideModeOnAllocation &&
      mobileAllocWizard &&
      allocationSubStep === "supply" &&
      state.supplySource === "aggregate");
  /** Partner rates on Source, or rates sub-step (not Allocation after Source). */
  const showPartnerRatesBlock =
    (isWizardSourceCard &&
      state.supplySource === "aggregate" &&
      Boolean(state.supplierId)) ||
    (!isWizardSourceCard &&
      !hideModeOnAllocation &&
      state.supplySource === "aggregate" &&
      (showAlloc("rates") || (!mobileAllocWizard && wizardSection == null)));
  const aggregateTrackingStep = showDriverPhoneField
    ? ("driverPhone" as const)
    : showDriverNameField
      ? ("driverName" as const)
      : showVehicleField
        ? ("vehicle" as const)
        : null;
  const isAggregateMobileWizard =
    mobileAllocWizard && state.supplySource === "aggregate";
  const allocKeypadFullscreen =
    isAggregateMobileWizard &&
    (aggregateTrackingStep != null || allocationSubStep === "rates");
  /** Keypad steps: flex column in modal body (footer stays below; no ScrollView overlap). */
  const isWizardSaleKeypad =
    wizardSection === "client" &&
    !desktopWizardChrome &&
    Boolean(state.clientId);
  const allocationFillBody =
    mobileAllocWizard && allocKeypadFullscreen && isWizardAllocationCard && !desktopWizardChrome;
  /** Sale + allocation keypad steps — flex column in modal body. */
  const wizardKeypadFill =
    (wizardSection != null && isWizardSaleKeypad) || allocationFillBody;
  /** Keypad-only steps use fillBody; entity pickers scroll in the shell. */
  const allocationShellFill = allocationFillBody;
  /** Shell owns scroll — desktop stepped wizard uses CreateTripDesktopShell scroll (no nested ScrollView). */
  const wizardShellScroll =
    desktopWizardChrome ||
    mobileWizardMode ||
    desktopFormGrid ||
    (wizardSection != null && !wizardKeypadFill);
  const desktopAllocFill =
    desktopWizardChrome && isWizardAllocationCard;
  /** Unified attribution-style labels/inputs on mobile wizard + stepped sections. */
  const isWizardTypography =
    (mobileWizardMode || wizardSection != null) && !wizardKeypadFill;
  const fieldLabelStyle = [
    isWizardTypography ? fullPageWizardStyles.wizardFieldLabel : styles.label,
    !isWizardTypography && labelStyle,
    isDenseForm && !isWizardTypography && styles.labelDense,
  ];
  const fieldInputStyle = [
    isWizardTypography ? fullPageWizardStyles.wizardFieldInput : styles.input,
    !isWizardTypography && inputStyle,
    isDenseForm && !isWizardTypography && styles.inputDense,
    isWizardTypography && styles.inputWizardDense,
  ];
  const wizardFooterPad = 24;
  const allocationWizardProgressSteps = useMemo(() => {
    if (!mobileAllocWizard || !isWizardAllocationCard) return [];
    return getAllocationSubSteps(state).map((id) => ({
      id,
      label: allocationProgressTabLabel(id, state.supplySource),
    }));
  }, [
    mobileAllocWizard,
    isWizardAllocationCard,
    state.supplySource,
    state.assignLater,
  ]);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  /** Expanded picker vs minimized summary chip — start collapsed when a value is already set. */
  const [clientListExpanded, setClientListExpanded] = useState(() => !state.clientId);
  const [driverListExpanded, setDriverListExpanded] = useState(() => !state.driverId);
  const [vehicleListExpanded, setVehicleListExpanded] = useState(() => !state.vehicleId);
  const [partnerListExpanded, setPartnerListExpanded] = useState(() => !state.supplierId);

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

  const openPartnerPicker = useCallback(() => {
    setPartnerListExpanded(true);
    if (mobileAllocWizard && allocationSubStep !== "supply") {
      onAllocationSubStepChange?.("supply");
    }
  }, [mobileAllocWizard, allocationSubStep, onAllocationSubStepChange]);

  const [pickupDropdownOpen, setPickupDropdownOpen] = useState(false);
  const [dropDropdownOpen, setDropDropdownOpen] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [driverIdsOnActiveTrip, setDriverIdsOnActiveTrip] = useState<string[]>(
    [],
  );
  const [vehicleIdsOnActiveTrip, setVehicleIdsOnActiveTrip] = useState<
    string[]
  >([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const clientPriceInputRef = useRef<TextInput>(null);
  const _supplierRateInputRef = useRef<TextInput>(null);
  const _advancePaidInputRef = useRef<TextInput>(null);
  const aggregateDriverNameInputRef = useRef<TextInput>(null);
  const driverPhoneInputRef = useRef<TextInput>(null);
  const aggregateVehicleInputRef = useRef<TextInput>(null);
  const notesModalInputRef = useRef<TextInput>(null);
  const {
    accessoryId: kbAccessoryId,
    registerKeyboardNext,
    releaseAccessoryBar,
    dismissKeyboard,
  } = useKeyboardAccessory();

  const focusPadField = useCallback(
    (onNext: () => void, preview: string, label = "Next") => {
      registerKeyboardNext(onNext, label, preview);
    },
    [registerKeyboardNext],
  );

  const onPadValueChange = useCallback((setter: (text: string) => void, text: string) => {
    setter(text);
  }, []);

  /** End numeric entry without opening notes — notes are opened only via the notes button. */
  const finishPadFieldEntry = useCallback(() => {
    dismissKeyboard();
  }, [dismissKeyboard]);

  const focusField = useCallback((ref: { current: TextInput | null }) => {
    requestAnimationFrame(() => {
      ref.current?.focus();
    });
  }, []);

  /** Keyboard Next only — never call from onFocus (avoids iOS accessory blur races). */
  const focusNextField = useCallback(
    (ref: { current: TextInput | null }) => {
      focusField(ref);
    },
    [focusField],
  );

  const _focusFieldAfterModalClose = useCallback(
    (ref: { current: TextInput | null }) => {
      // Web modal close/render timing can swallow immediate focus.
      // Retry shortly after close to make focus reliable.
      focusField(ref);
      setTimeout(() => {
        ref.current?.focus();
      }, 120);
    },
    [focusField],
  );

  const openNotesModal = useCallback(() => {
    setNotesModalOpen(true);
  }, []);

  useEffect(() => {
    if (!notesModalOpen) return;
    focusField(notesModalInputRef);
    const t = setTimeout(() => notesModalInputRef.current?.focus(), 160);
    return () => clearTimeout(t);
  }, [notesModalOpen, focusField]);

  const _openPickerNext = useCallback((_type: "driver" | "vehicle") => {}, []);

  const _openSupplierPickerNext = useCallback(() => {}, []);
  const fetchFleet = useCallback(() => {
    if (!organizationId) return;
    setFleetLoading(true);
    Promise.all([
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
        // Keep UI in sync with server-side guards: any non-terminal trip blocks assignment.
        return !TRIP_TERMINAL_STATUSES.has(status);
      });
      const busyDrivers = Array.from(
        new Set(
          activeTrips
            .filter((t) => t.driver_id)
            .map((t) => t.driver_id as string),
        ),
      );
      const busyVehicles = Array.from(
        new Set(
          activeTrips
            .filter((t) => t.vehicle_id)
            .map((t) => t.vehicle_id as string),
        ),
      );
      setDriverIdsOnActiveTrip(busyDrivers);
      setVehicleIdsOnActiveTrip(busyVehicles);
      setFleetLoading(false);
    });
  }, [organizationId]);

  const fetchSuppliers = useCallback(() => {
    if (!organizationId) return;
    setSuppliersLoading(true);
    void getSuppliersByOrganization(organizationId)
      .then((r) => {
        if (r.error) {
          if (__DEV__) {
            console.warn("[AddTrip] load suppliers:", r.error.message);
          }
          setSuppliers([]);
          return;
        }
        setSuppliers(manuallySelectableSuppliers(r.suppliers));
      })
      .catch((e) => {
        if (__DEV__) {
          console.warn(
            "[AddTrip] load suppliers:",
            e instanceof Error ? e.message : e,
          );
        }
        setSuppliers([]);
      })
      .finally(() => {
        setSuppliersLoading(false);
      });
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) fetchFleet();
  }, [organizationId, fetchFleet]);

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

  useEffect(() => {
    if (fleetLoading || !state.driverId) return;
    const exists = drivers.some((d) => String(d.id) === String(state.driverId));
    if (!exists) setters.setDriverId(null);
  }, [fleetLoading, state.driverId, drivers, setters]);

  useEffect(() => {
    if (fleetLoading || !state.vehicleId) return;
    const exists = vehicles.some((v) => String(v.id) === String(state.vehicleId));
    if (!exists) setters.setVehicleId(null);
  }, [fleetLoading, state.vehicleId, vehicles, setters]);

  useEffect(() => {
    if (!organizationId || state.supplySource !== "aggregate") return;
    fetchSuppliers();
    if (!state.supplierId) setPartnerListExpanded(true);
  }, [organizationId, state.supplySource, fetchSuppliers, state.supplierId]);

  useFocusEffect(
    useCallback(() => {
      if (!organizationId) return;
      fetchFleet();
      fetchSuppliers();
    }, [organizationId, fetchFleet, fetchSuppliers]),
  );

  const driverPhoneLookupTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const driverPhoneLookupGenRef = useRef(0);
  const [driverPhoneMatches, setDriverPhoneMatches] = useState<ExistingDriverMatch[]>(
    [],
  );
  const [driverPhoneLookupLoading, setDriverPhoneLookupLoading] = useState(false);
  const [selectedDriverMatchId, setSelectedDriverMatchId] = useState<string | null>(
    null,
  );

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

  const enrichedDriverPhoneMatches = useMemo(
    () => enrichDriverMatchesWithFleetAvatars(driverPhoneMatches, drivers),
    [driverPhoneMatches, drivers],
  );

  const renderDriverPhoneRecommendations = (
    phoneComplete: boolean,
    layout: "stack" | "aside" = "stack",
  ) => (
    <DriverPhoneRecommendations
      matches={enrichedDriverPhoneMatches}
      loading={driverPhoneLookupLoading}
      selectedUserId={selectedDriverMatchId}
      onSelect={applyDriverPhoneMatch}
      phoneComplete={phoneComplete}
      compact={isDenseForm}
      layout={layout}
      fleetDrivers={drivers}
    />
  );

  useEffect(() => {
    if (state.supplySource !== "aggregate" || state.assignLater) return;
    const trimmed = state.driverPhone.trim();
    if (!trimmed) {
      setDriverPhoneMatches([]);
      setDriverPhoneLookupLoading(false);
      setSelectedDriverMatchId(null);
      setters.setDriverPhoneName(null);
      setters.setDriverPhoneConfirmed(false);
      setters.setDriverPhoneTripConflict(false, null);
      return;
    }
    if (driverPhoneLookupTimeoutRef.current)
      clearTimeout(driverPhoneLookupTimeoutRef.current);
    driverPhoneLookupTimeoutRef.current = setTimeout(() => {
      driverPhoneLookupTimeoutRef.current = null;
      const last10 = trimmed.replace(/\D/g, "").slice(-10);
      if (last10.length < 10) {
        setDriverPhoneMatches([]);
        setDriverPhoneLookupLoading(false);
        setSelectedDriverMatchId(null);
        setters.setDriverPhoneName(null);
        setters.setDriverPhoneConfirmed(false);
        setters.setDriverPhoneTripConflict(false, null);
        return;
      }

      const gen = ++driverPhoneLookupGenRef.current;
      setDriverPhoneLookupLoading(true);
      setSelectedDriverMatchId(null);
      setters.setDriverPhoneName(null);
      setters.setDriverPhoneConfirmed(false);

      lookupDriversByPhoneVariants(trimmed).then(async ({ error: err, matches }) => {
        if (driverPhoneLookupGenRef.current !== gen) return;
        setDriverPhoneLookupLoading(false);
        if (err) {
          setDriverPhoneMatches([]);
          return;
        }
        setDriverPhoneMatches(matches);

        const { error: avErr, result } = await getDriverAvailabilityByPhoneGlobal(last10, {
          anyOpenTripBlocks: true,
          requireAuthoritativeRpc: true,
        });
        if (driverPhoneLookupGenRef.current !== gen) return;

        if (avErr) {
          setters.setDriverPhoneTripConflict(true, "Busy check unavailable");
          // Soft warning — still auto-select single match so Create Trip is not blocked.
          if (matches.length === 1) {
            applyDriverPhoneMatch(matches[0]);
          }
          return;
        }
        setters.setDriverPhoneTripConflict(result.isBusy, result.ongoingTripLabel);
        // Keep lookup selection even when busy — conflict is a soft warning; Create Trip stays enabled.
        if (matches.length === 1) {
          applyDriverPhoneMatch(matches[0]);
        } else if (matches.length === 0) {
          setSelectedDriverMatchId(null);
          setters.setDriverPhoneName(null);
          setters.setDriverPhoneConfirmed(false);
        }
      });
    }, 400);
    return () => {
      if (driverPhoneLookupTimeoutRef.current)
        clearTimeout(driverPhoneLookupTimeoutRef.current);
    };
  }, [
    organizationId,
    state.supplySource,
    state.assignLater,
    state.driverPhone,
    setters,
    applyDriverPhoneMatch,
  ]);

  const handleSelectClient = (c: ClientRow) => {
    if (state.clientId === c.id) return;
    releaseAccessoryBar();
    Keyboard.dismiss();
    setters.setClientSelection(c.id, c.name);
    setClientListExpanded(false);
  };

  const handleAddClientShortcut = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-client",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);
  const handleAddSupplierShortcut = useCallback(() => {
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
  const handleClearPartner = useCallback(() => {
    releaseAccessoryBar();
    Keyboard.dismiss();
    setters.setSupplierSelection(null);
  }, [setters, releaseAccessoryBar]);
  const handleAddDriverShortcut = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-driver",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);
  const handleAddVehicleShortcut = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-vehicle",
      params: { returnTo: ROUTES.ADD_TRIP },
    });
  }, [router]);
  const availableDrivers = drivers.filter(
    (d) => !driverIdsOnActiveTrip.includes(d.id),
  );
  const availableVehicles = vehicles.filter(
    (v) => !vehicleIdsOnActiveTrip.includes(v.id),
  );
  const driverOptions = drivers.map((d) => ({
    ...d,
    isBusy: driverIdsOnActiveTrip.includes(d.id),
  }));
  const vehicleOptions = vehicles.map((v) => ({
    ...v,
    isBusy: vehicleIdsOnActiveTrip.includes(v.id),
  }));
  const selectedDriverRow =
    driverOptions.find((d) => String(d.id) === String(state.driverId)) ?? null;
  const selectedVehicleRow =
    vehicleOptions.find((v) => String(v.id) === String(state.vehicleId)) ?? null;
  const showDriverFleetList =
    !state.driverId || driverListExpanded || !selectedDriverRow;
  const showVehicleFleetList =
    !state.vehicleId || vehicleListExpanded || !selectedVehicleRow;
  const showDriverFleetSummary =
    Boolean(state.driverId && !driverListExpanded && selectedDriverRow);
  const showVehicleFleetSummary =
    Boolean(state.vehicleId && !vehicleListExpanded && selectedVehicleRow);
  useEffect(() => {
    if (allocationSubStep !== "supply" || state.supplySource !== "asset" || state.assignLater)
      return;
    if (!state.driverId || !selectedDriverRow) setDriverListExpanded(true);
  }, [
    allocationSubStep,
    state.supplySource,
    state.assignLater,
    state.driverId,
    selectedDriverRow,
  ]);
  useEffect(() => {
    if (allocationSubStep !== "supply" || state.supplySource !== "asset" || state.assignLater)
      return;
    if (!state.vehicleId || !selectedVehicleRow) setVehicleListExpanded(true);
  }, [
    allocationSubStep,
    state.supplySource,
    state.assignLater,
    state.vehicleId,
    selectedVehicleRow,
  ]);
  const driverAvatarGridItems = useMemo(
    () =>
      driverOptionsToAvatarGridItems(
        drivers.map((d) => ({
          ...d,
          isBusy: driverIdsOnActiveTrip.includes(d.id),
        })),
      ),
    [drivers, driverIdsOnActiveTrip],
  );
  const vehicleAvatarGridItems = useMemo(
    () =>
      vehicleOptionsToAvatarGridItems(
        vehicles.map((v) => ({
          ...v,
          isBusy: vehicleIdsOnActiveTrip.includes(v.id),
        })),
      ),
    [vehicles, vehicleIdsOnActiveTrip],
  );

  const scrollBlocked =
    pickupDropdownOpen || dropDropdownOpen || notesModalOpen;

  const supplyIsAsset = state.supplySource === "asset";
  const showAssetFleetOnSupply =
    supplyIsAsset &&
    !state.assignLater &&
    mobileAllocWizard &&
    isWizardAllocationCard &&
    allocationSubStep === "supply";
  const selectedClientRow = clients.find((c) => c.id === state.clientId) ?? null;
  const selectedSupplierRow = suppliers.find((s) => s.id === state.supplierId) ?? null;
  const _clientAvatarGridItems = useMemo(
    () =>
      isWizardTypography
        ? clientsToWizardAvatarGridItems(clients)
        : clientsToAvatarGridItems(clients),
    [clients, isWizardTypography],
  );
  const showPartnerList = !state.supplierId || partnerListExpanded;
  const busyFleetHintAsset =
    supplyIsAsset &&
    !state.assignLater &&
    !fleetLoading &&
    availableDrivers.length === 0;
  const busyFleetHintVehicle =
    supplyIsAsset &&
    !state.assignLater &&
    !fleetLoading &&
    availableVehicles.length === 0;
  const assetFleetWarningLines = useMemo(() => {
    if (!supplyIsAsset || state.assignLater || fleetLoading) return [];
    const lines: string[] = [];
    if (busyFleetHintAsset) {
      lines.push(
        drivers.length === 0
          ? "No drivers yet — add drivers from Resources first."
          : "Some drivers are on active trips — pick an available driver or use Assign later.",
      );
    }
    if (busyFleetHintVehicle) {
      lines.push(
        vehicles.length === 0
          ? "No vehicles yet — add vehicles from Resources first."
          : "Busy vehicles are on trip — pick an available vehicle or use Assign later.",
      );
    }
    return lines;
  }, [
    supplyIsAsset,
    state.assignLater,
    fleetLoading,
    busyFleetHintAsset,
    busyFleetHintVehicle,
    drivers.length,
    vehicles.length,
  ]);
  const desktopFleetGridMaxHeight = desktopAllocFill ? 280 : 360;

  const aggregateDriverFoundByPhone =
    !!(state.driverPhoneName && state.driverPhone.trim());
  const aggregateDriverVehicleBothSet =
    state.supplySource === "aggregate" &&
    !state.assignLater &&
    state.driverPhone.trim().length > 0 &&
    state.aggregateVehicleText.trim().length > 0 &&
    (!aggregateDriverFoundByPhone || state.driverPhoneConfirmed);
  const assetDriverVehicleBothSet =
    supplyIsAsset &&
    !state.assignLater &&
    Boolean(state.driverId && state.vehicleId);
  const assignLaterSwitchDisabled =
    supplyIsAsset ? assetDriverVehicleBothSet : aggregateDriverVehicleBothSet;

  const allocationPriorSelections = useMemo((): WizardPriorSelectionItem[] => {
    if (
      !mobileAllocWizard ||
      !isWizardAllocationCard ||
      state.supplySource !== "aggregate" ||
      state.assignLater
    ) {
      return [];
    }
    const items: WizardPriorSelectionItem[] = [];
    const step = allocationSubStep;
    const summarySteps = new Set(["driverPhone", "driverName", "vehicle"]);
    if (!summarySteps.has(step ?? "")) return [];

    if (selectedClientRow) {
      items.push({
        id: "client",
        label: "Client",
        name: selectedClientRow.name?.trim() || "Client",
      });
    }

    const rateRaw = state.supplierRate.trim();
    if (rateRaw) {
      items.push({
        id: "rate",
        label: "Rate",
        name: `₹${Number(rateRaw).toLocaleString("en-IN")}`,
      });
    }

    if (
      (step === "driverName" || step === "vehicle") &&
      state.driverPhone.trim()
    ) {
      items.push({
        id: "phone",
        label: "Phone",
        name: state.driverPhone.trim(),
        onPress: () => onAllocationSubStepChange?.("driverPhone"),
      });
    }

    if (step === "vehicle" && state.aggregateDriverName.trim()) {
      items.push({
        id: "name",
        label: "Driver",
        name: state.aggregateDriverName.trim(),
        onPress: () => onAllocationSubStepChange?.("driverName"),
      });
    }

    return items;
  }, [
    mobileAllocWizard,
    isWizardAllocationCard,
    state.supplySource,
    state.assignLater,
    state.supplierRate,
    state.driverPhone,
    state.aggregateDriverName,
    allocationSubStep,
    onAllocationSubStepChange,
    selectedClientRow,
  ]);

  const allocationContextRow = useMemo(() => {
    if (!mobileAllocWizard || !isWizardAllocationCard || !selectedClientRow) {
      return null;
    }

    /**
     * Phone / name / vehicle: chrome is the compact prior strip only
     * (matches indent Deploy load).
     */
    if (
      state.supplySource === "aggregate" &&
      !state.assignLater &&
      (allocationSubStep === "driverPhone" ||
        allocationSubStep === "driverName" ||
        allocationSubStep === "vehicle")
    ) {
      return null;
    }

    const left = {
      label: "Client",
      name: selectedClientRow.name ?? "Client",
      subtitle: resolveWizardClientPhone(selectedClientRow.phone) || null,
      entityType: "client" as const,
      avatarUrl: selectedClientRow.avatar_url ?? null,
      avatarSeed: selectedClientRow.avatar_seed ?? null,
    };

    if (state.supplySource === "aggregate" && !state.assignLater) {
      const step = allocationSubStep;
      const partnerCell = selectedSupplierRow
        ? {
            label: "Partner",
            name:
              selectedSupplierRow.company_name?.trim() ||
              selectedSupplierRow.name?.trim() ||
              "—",
            subtitle: resolveWizardClientPhone(selectedSupplierRow.phone),
            entityType: "supplier" as const,
            avatarUrl:
              (selectedSupplierRow as { avatar_url?: string | null })
                .avatar_url ?? null,
            avatarSeed:
              (selectedSupplierRow as { avatar_seed?: string | null })
                .avatar_seed ?? null,
            onPress: openPartnerPicker,
          }
        : null;

      const partnerSteps = new Set(["supply", "rates"]);
      if (partnerSteps.has(step ?? "")) {
        return {
          left,
          right: partnerCell
            ? partnerCell
            : step === "supply"
              ? {
                  label: "Partner",
                  name: "Select partner",
                  entityType: "supplier" as const,
                  onPress: openPartnerPicker,
                }
              : null,
        };
      }
    }

    if (
      state.supplySource === "asset" &&
      !state.assignLater &&
      showAssetFleetOnSupply &&
      allocationSubStep === "supply"
    ) {
      return {
        left,
        right: selectedDriverRow
          ? {
              label: "Driver",
              name: selectedDriverRow.name ?? "Driver",
              subtitle: [selectedDriverRow.phone, selectedDriverRow.email]
                .filter(Boolean)
                .join(" · "),
              entityType: "driver" as const,
              avatarUrl:
                (selectedDriverRow as { avatar_url?: string | null })
                  .avatar_url ?? null,
              avatarSeed:
                (selectedDriverRow as { avatar_seed?: string | null })
                  .avatar_seed ?? null,
            }
          : {
              label: "Driver",
              name: "Select driver",
              entityType: "driver" as const,
            },
      };
    }

    return null;
  }, [
    mobileAllocWizard,
    isWizardAllocationCard,
    selectedClientRow,
    state.supplySource,
    state.assignLater,
    allocationSubStep,
    selectedSupplierRow,
    showAssetFleetOnSupply,
    selectedDriverRow,
    openPartnerPicker,
  ]);

  return (
    <View
      style={[
        styles.pageWrap,
        (wizardKeypadFill || desktopAllocFill) && styles.pageWrapFill,
        desktopWizardChrome && styles.pageWrapDesktopWizard,
      ]}
    >
      <WizardFormBody
        shellScroll={wizardShellScroll}
        contentContainerStyle={[
          styles.scrollContent,
          isDenseForm && !wizardShellScroll && styles.scrollContentDense,
          wizardShellScroll && styles.scrollContentWizard,
          (mobileWizardMode || desktopFormGrid) &&
            fullPageWizardStyles.wizardStepBody,
          mobileWizardMode && { paddingTop: 0 },
          desktopFormGrid && styles.scrollContentDesktop,
          wizardKeypadFill && styles.scrollContentFillBody,
          {
            paddingBottom: wizardKeypadFill
              ? 8
              : mobileAllocWizard && isWizardAllocationCard
                ? wizardFooterPad + insets.bottom
                : mobileWizardMode
                  ? 8
                  : wizardShellScroll
                    ? 8
                    : desktopFormGrid
                      ? 16
                      : Layout.sectionSpacing +
                        insets.bottom +
                        (desktopFormGrid ? 52 : isDenseForm ? 88 : isWide ? 68 : 108),
          },
        ]}
        scrollViewProps={{
          style: styles.scroll,
          scrollEnabled: wizardKeypadFill
            ? false
            : Platform.OS === "web"
              ? true
              : isCompactMobile
                ? true
                : !scrollBlocked,
          keyboardShouldPersistTaps: "handled",
          showsVerticalScrollIndicator: wizardKeypadFill
            ? false
            : Platform.OS === "web" || isCompactMobile
              ? true
              : !scrollBlocked,
        }}
      >
        <View
          style={[
            styles.contentMax,
            (wizardKeypadFill || desktopAllocFill || desktopWizardChrome) &&
              styles.contentMaxFill,
            {
              maxWidth: desktopWizardChrome
                ? undefined
                : desktopFormGrid
                  ? desktopFormMaxWidth
                  : isWide
                    ? 1000
                    : 960,
              width:
                desktopWizardChrome || desktopFormGrid ? "100%" : undefined,
              alignSelf:
                desktopWizardChrome || desktopFormGrid ? "stretch" : undefined,
              paddingHorizontal:
                desktopWizardChrome || desktopFormGrid
                  ? 0
                  : mobileWizardMode || isCompactMobile
                    ? 0
                    : isWide
                      ? 16
                      : Layout.screenPaddingHorizontal,
              paddingTop: mobileWizardMode ? 0 : undefined,
            },
          ]}
        >
          <View
            style={[
              styles.mainGrid,
              (wizardKeypadFill || desktopAllocFill) && styles.mainGridFill,
            ]}
          >
            <View
              style={[
                styles.formColumn,
                desktopFormGrid && styles.formColumnGridWeb,
                (wizardKeypadFill || desktopAllocFill || desktopWizardChrome) &&
                  styles.formColumnFill,
              ]}
            >
            <View
              style={
                desktopWizardChrome
                  ? createTripDesktopStyles.wizardWorkspace
                  : undefined
              }
            >
              <View
                style={
                  desktopWizardChrome
                    ? createTripDesktopStyles.wizardWorkspaceMain
                    : undefined
                }
              >
          {/* 01 Route */}
          {showRouteCard ? (
            desktopWizardChrome && isWizardRouteStep ? (
              <CreateTripDesktopRouteStep
                state={state}
                setters={setters}
                fieldInvalid={invalid}
                onPickupDropdownOpenChange={setPickupDropdownOpen}
                onDropDropdownOpenChange={setDropDropdownOpen}
                extraStops={sourceIndent ? undefined : state.extraStops}
                onExtraStopsChange={sourceIndent ? undefined : setters.setExtraStops}
              />
            ) : (
            <View
              style={[
                isWizardTypography ? fullPageWizardStyles.wizardStepContentFlat : styles.card,
                !isWizardTypography && isDenseForm && styles.cardDense,
                desktopFormGrid && styles.cardDesktopEnterprise,
                desktopFormGrid && styles.cardDesktopStretch,
                desktopFormGrid && styles.cardGridRouteWeb,
              ]}
            >
            {!hideWizardCardHead ? (
            <View
              style={[
                styles.cardHead,
                isDenseForm && styles.cardHeadDense,
                desktopFormGrid && styles.cardHeadDesktopEnterprise,
                isWizardRouteStep && styles.cardHeadWizard,
              ]}
            >
              <View style={styles.cardHeadTitleCluster}>
                <View
                  style={[
                    styles.stepBadge,
                    isDenseForm && styles.stepBadgeDense,
                    isWizardRouteStep && styles.stepBadgeWizard,
                  ]}
                >
                  <Text style={styles.stepBadgeText}>01</Text>
                </View>
                <Text
                  style={[
                    styles.cardTitle,
                    isDenseForm && styles.cardTitleDense,
                    desktopFormGrid && styles.cardTitleDesktopEnterprise,
                    isWizardRouteStep && styles.cardTitleWizard,
                  ]}
                >
                  Route Details
                </Text>
              </View>
            </View>
            ) : null}

            {isWizardRouteStep ? (
              <View style={styles.routeWizardBody}>
                <View style={styles.routeLocationsStack}>
                  <LocationSearchField
                    label="Pickup *"
                    placeholder="Search or pick pickup location"
                    value={state.pickupArea}
                    onChangeText={setters.setPickupArea}
                    onSelectPlace={(_name, coords) =>
                      setters.setPickupCoords(coords.lat, coords.lon)
                    }
                    leadingIcon={<MapPin size={13} color={Theme.iconMuted} />}
                    inputStyle={[...fieldInputStyle, outlineErr("pickup")]}
                    labelStyle={fieldLabelStyle}
                    compact
                    onDropdownOpenChange={setPickupDropdownOpen}
                  />
                  {sourceIndent ? null : (
                    <RouteExtraStopsEditor
                      stops={state.extraStops}
                      onChange={setters.setExtraStops}
                      compact
                      onDropdownOpenChange={setDropDropdownOpen}
                    />
                  )}
                  <LocationSearchField
                    label="Drop *"
                    placeholder="Search or pick drop location"
                    value={state.dropLocation}
                    onChangeText={setters.setDropLocation}
                    onSelectPlace={(_name, coords) =>
                      setters.setDropCoords(coords.lat, coords.lon)
                    }
                    leadingIcon={<Navigation size={13} color={Theme.iconMuted} />}
                    inputStyle={[...fieldInputStyle, outlineErr("drop")]}
                    labelStyle={fieldLabelStyle}
                    compact
                    onDropdownOpenChange={setDropDropdownOpen}
                  />
                </View>
                <View style={styles.routeDateSection}>
                  <Text style={[fieldLabelStyle, styles.routeDateLabel]}>
                    Trip start date
                  </Text>
                <View
                  style={[
                    styles.quickDateRow,
                    isDenseForm && styles.quickDateRowDense,
                    isWizardRouteStep && styles.quickDateRowWizard,
                  ]}
                >
                  {(
                    [
                      { label: "Today", get: getToday },
                      { label: "Tomorrow", get: getTomorrow },
                      { label: "Day after", get: getDayAfter },
                    ] as const
                  ).map(({ label, get }) => {
                    const iso = get();
                    const isActive = state.tripStartDate === iso;
                    return (
                      <Pressable
                        key={label}
                        style={({ pressed }) => [
                          styles.quickDateChip,
                          isDenseForm && styles.quickDateChipDense,
                          isWizardRouteStep && styles.quickDateChipWizard,
                          isActive && styles.quickDateChipActive,
                          pressed && styles.quickDateChipPressed,
                          Platform.OS === "web" &&
                            ({ cursor: "pointer" } as ViewStyle),
                        ]}
                        onPress={() => setters.setTripStartDate(iso)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                      >
                        <Text
                          style={[
                            styles.quickDateChipText,
                            isDenseForm && styles.quickDateChipTextDense,
                            isWizardRouteStep && styles.quickDateChipTextWizard,
                            isActive && styles.quickDateChipTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {Platform.OS === "web" ? (
                  <TextInput
                    style={[...fieldInputStyle, outlineErr("tripDate")]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Theme.placeholder}
                    value={state.tripStartDate}
                    onChangeText={setters.setTripStartDate}
                    autoCorrect={false}
                  />
                ) : (
                  <>
                    <TouchableOpacity
                      style={[
                        ...fieldInputStyle,
                        styles.dateTouchable,
                        outlineErr("tripDate"),
                      ]}
                      onPress={() => setShowStartDatePicker(true)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={
                          state.tripStartDate
                            ? [
                                styles.dateTouchableText,
                                isDenseForm && styles.dateTouchableTextDense,
                              ]
                            : [
                                styles.dateTouchablePlaceholder,
                                isDenseForm && styles.dateTouchablePlaceholderDense,
                              ]
                        }
                      >
                        {state.tripStartDate
                          ? new Date(
                              `${state.tripStartDate}T12:00:00`,
                            ).toLocaleDateString("en-IN", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "Tap to pick date"}
                      </Text>
                    </TouchableOpacity>
                    {showStartDatePicker &&
                      (Platform.OS === "android" ? (
                        <DateTimePicker
                          value={
                            state.tripStartDate
                              ? new Date(`${state.tripStartDate}T12:00:00`)
                              : new Date()
                          }
                          mode="date"
                          display="default"
                          minimumDate={new Date()}
                          onChange={(e, date) => {
                            setShowStartDatePicker(false);
                            if (e.type === "set" && date) {
                              setters.setTripStartDate(toISODate(date));
                            }
                          }}
                        />
                      ) : (
                        <Modal visible transparent animationType="slide">
                          <TouchableOpacity
                            style={styles.datePickerBackdrop}
                            activeOpacity={1}
                            onPress={() => setShowStartDatePicker(false)}
                          >
                            <View
                              style={styles.datePickerSheet}
                              onStartShouldSetResponder={() => true}
                            >
                              <View style={styles.datePickerHeader}>
                                <Text style={styles.datePickerTitle}>
                                  Pick date
                                </Text>
                                <TouchableOpacity
                                  onPress={() => setShowStartDatePicker(false)}
                                  hitSlop={12}
                                >
                                  <Text style={styles.datePickerDone}>Done</Text>
                                </TouchableOpacity>
                              </View>
                              <DateTimePicker
                                value={
                                  state.tripStartDate
                                    ? new Date(`${state.tripStartDate}T12:00:00`)
                                    : new Date()
                                }
                                mode="date"
                                display="spinner"
                                minimumDate={new Date()}
                                onChange={(_, date) =>
                                  date && setters.setTripStartDate(toISODate(date))
                                }
                              />
                            </View>
                          </TouchableOpacity>
                        </Modal>
                      ))}
                  </>
                )}
                </View>
                <View style={styles.routeInstructorBanner}>
                  <View style={styles.routeInstructorAnimationWrap}>
                    <LottieView
                      source={ROUTE_INSTRUCTOR_ANIMATION}
                      autoPlay
                      loop
                      speed={0.75}
                      resizeMode="contain"
                      style={styles.routeInstructorAnimation}
                    />
                  </View>
                  <View style={styles.routeInstructorCopy}>
                    <View style={styles.routeInstructorTitleRow}>
                      <Navigation size={12} color={Theme.brandBlueInk} />
                      <TypewriterText
                        text="Update your route details"
                        style={styles.routeInstructorTitle}
                        msPerChar={36}
                      />
                    </View>
                    <Text style={styles.routeInstructorBody}>
                      Add accurate pickup and drop points for better tracking and ETA.
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <>
                <View
                  style={[
                    styles.gridRow,
                    isDenseForm && styles.gridRowDense,
                    isWide && styles.gridRowWide,
                  ]}
                >
                  <View style={styles.gridCol}>
                    <LocationSearchField
                      label="Pickup *"
                      placeholder="Search or pick pickup location"
                      value={state.pickupArea}
                      onChangeText={setters.setPickupArea}
                      onSelectPlace={(_name, coords) =>
                        setters.setPickupCoords(coords.lat, coords.lon)
                      }
                      leadingIcon={<MapPin size={isDenseForm ? 13 : 14} color={Theme.iconMuted} />}
                      inputStyle={[...fieldInputStyle, outlineErr("pickup")]}
                      labelStyle={fieldLabelStyle}
                      compact={isDenseForm}
                      onDropdownOpenChange={setPickupDropdownOpen}
                    />
                  </View>
                  <View style={styles.gridCol}>
                    <LocationSearchField
                      label="Drop *"
                      placeholder="Search or pick drop location"
                      value={state.dropLocation}
                      onChangeText={setters.setDropLocation}
                      onSelectPlace={(_name, coords) =>
                        setters.setDropCoords(coords.lat, coords.lon)
                      }
                      leadingIcon={<Navigation size={isDenseForm ? 13 : 14} color={Theme.iconMuted} />}
                      inputStyle={[...fieldInputStyle, outlineErr("drop")]}
                      labelStyle={fieldLabelStyle}
                      compact={isDenseForm}
                      onDropdownOpenChange={setDropDropdownOpen}
                    />
                  </View>
                </View>
                <View
                  style={[
                    styles.gridRow,
                    isDenseForm && styles.gridRowDense,
                    (isWide || desktopFormGrid) && styles.gridRowWide,
                  ]}
                >
                  <View style={styles.gridCol}>
                    <Text style={fieldLabelStyle}>Trip start date</Text>
                    <View
                      style={[
                        styles.quickDateRow,
                        isDenseForm && styles.quickDateRowDense,
                      ]}
                    >
                      {(
                        [
                          { label: "Today", get: getToday },
                          { label: "Tomorrow", get: getTomorrow },
                          { label: "Day after", get: getDayAfter },
                        ] as const
                      ).map(({ label, get }) => {
                        const iso = get();
                        const isActive = state.tripStartDate === iso;
                        return (
                          <Pressable
                            key={label}
                            style={({ pressed }) => [
                              styles.quickDateChip,
                              isDenseForm && styles.quickDateChipDense,
                              isActive && styles.quickDateChipActive,
                              pressed && styles.quickDateChipPressed,
                              Platform.OS === "web" &&
                                ({ cursor: "pointer" } as ViewStyle),
                            ]}
                            onPress={() => setters.setTripStartDate(iso)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isActive }}
                          >
                            <Text
                              style={[
                                styles.quickDateChipText,
                                isDenseForm && styles.quickDateChipTextDense,
                                isActive && styles.quickDateChipTextActive,
                              ]}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {Platform.OS === "web" ? (
                      <TextInput
                        style={[...fieldInputStyle, outlineErr("tripDate")]}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={Theme.placeholder}
                        value={state.tripStartDate}
                        onChangeText={setters.setTripStartDate}
                        autoCorrect={false}
                      />
                    ) : (
                      <>
                        <TouchableOpacity
                          style={[
                            ...fieldInputStyle,
                            styles.dateTouchable,
                            outlineErr("tripDate"),
                          ]}
                          onPress={() => setShowStartDatePicker(true)}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={
                              state.tripStartDate
                                ? [
                                    styles.dateTouchableText,
                                    isDenseForm && styles.dateTouchableTextDense,
                                  ]
                                : [
                                    styles.dateTouchablePlaceholder,
                                    isDenseForm &&
                                      styles.dateTouchablePlaceholderDense,
                                  ]
                            }
                          >
                            {state.tripStartDate
                              ? new Date(
                                  `${state.tripStartDate}T12:00:00`,
                                ).toLocaleDateString("en-IN", {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "Tap to pick date"}
                          </Text>
                        </TouchableOpacity>
                        {showStartDatePicker &&
                          (Platform.OS === "android" ? (
                            <DateTimePicker
                              value={
                                state.tripStartDate
                                  ? new Date(`${state.tripStartDate}T12:00:00`)
                                  : new Date()
                              }
                              mode="date"
                              display="default"
                              minimumDate={new Date()}
                              onChange={(e, date) => {
                                setShowStartDatePicker(false);
                                if (e.type === "set" && date) {
                                  setters.setTripStartDate(toISODate(date));
                                }
                              }}
                            />
                          ) : (
                            <Modal visible transparent animationType="slide">
                              <TouchableOpacity
                                style={styles.datePickerBackdrop}
                                activeOpacity={1}
                                onPress={() => setShowStartDatePicker(false)}
                              >
                                <View
                                  style={styles.datePickerSheet}
                                  onStartShouldSetResponder={() => true}
                                >
                                  <View style={styles.datePickerHeader}>
                                    <Text style={styles.datePickerTitle}>
                                      Pick date
                                    </Text>
                                    <TouchableOpacity
                                      onPress={() => setShowStartDatePicker(false)}
                                      hitSlop={12}
                                    >
                                      <Text style={styles.datePickerDone}>Done</Text>
                                    </TouchableOpacity>
                                  </View>
                                  <DateTimePicker
                                    value={
                                      state.tripStartDate
                                        ? new Date(`${state.tripStartDate}T12:00:00`)
                                        : new Date()
                                    }
                                    mode="date"
                                    display="spinner"
                                    minimumDate={new Date()}
                                    onChange={(_, date) =>
                                      date && setters.setTripStartDate(toISODate(date))
                                    }
                                  />
                                </View>
                              </TouchableOpacity>
                            </Modal>
                          ))}
                      </>
                    )}
                  </View>
                  {!hideTonsOnRouteStep ? (
                    <View
                      style={[
                        styles.gridCol,
                        desktopFormGrid && styles.gridColTonsDesktop,
                      ]}
                    >
                      <Text style={fieldLabelStyle}>Tons</Text>
                      <TextInput
                        style={[
                          ...fieldInputStyle,
                          outlineErr("tons"),
                          isCompactMobile &&
                            Platform.OS === "web" &&
                            styles.mobileWebNoZoomInput,
                        ]}
                        placeholder="Enter load weight in tons"
                        placeholderTextColor={Theme.placeholder}
                        value={state.tons}
                        onChangeText={(t) => onPadValueChange(setters.setTons, t)}
                        keyboardType="decimal-pad"
                        inputMode="decimal"
                        autoCorrect={false}
                        inputAccessoryViewID={kbAccessoryId}
                        onFocus={() => {
                          focusPadField(
                            () => focusNextField(clientPriceInputRef),
                            state.tons,
                            "Next",
                          );
                        }}
                        blurOnSubmit={false}
                      />
                    </View>
                  ) : null}
                </View>
              </>
            )}

            {state.pickupArea.trim() && state.dropLocation.trim() ? (
              <View
                style={[
                  styles.routePreviewPanel,
                  desktopFormGrid && styles.routePreviewPanelDesktop,
                ]}
              >
                <View style={styles.routePreviewHero}>
                  <ArrowRight
                    size={16}
                    color={PULSE_TRIP.indigo}
                    strokeWidth={2}
                  />
                  <Text style={styles.routePreviewHeroText} numberOfLines={2}>
                    {routePreviewLine(state.pickupArea)} →{" "}
                    {routePreviewLine(state.dropLocation)}
                  </Text>
                </View>
                {state.routeLoading ||
                state.routeDistanceKm != null ||
                state.routeEtaLabel != null ? (
                  <View style={styles.routePreviewMetrics}>
                    <View style={styles.routePreviewMetricCol}>
                      <Text style={styles.routeMetricLab}>Distance</Text>
                      <Text style={styles.routeMetricVal}>
                        {state.routeLoading
                          ? "…"
                          : state.routeDistanceKm != null
                            ? `${state.routeDistanceKm} km`
                            : "—"}
                      </Text>
                    </View>
                    <View style={styles.routePreviewMetricDivider} />
                    <View style={styles.routePreviewMetricCol}>
                      <Text style={styles.routeMetricLab}>ETA</Text>
                      <Text style={styles.routeMetricVal}>
                        {state.routeLoading
                          ? "…"
                          : state.routeEtaLabel != null
                            ? state.routeEtaLabel
                            : "—"}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
            )
          ) : null}

          {showCommodityCard ? (
            <View
              style={[
                isWizardTypography ? fullPageWizardStyles.wizardStepContentFlat : styles.card,
                !isWizardTypography && isDenseForm && styles.cardDense,
                desktopFormGrid && styles.cardDesktopEnterprise,
                desktopFormGrid && styles.cardDesktopStretch,
                desktopFormGrid && styles.cardGridCommodityWeb,
              ]}
            >
              {!hideWizardCardHead ? (
              <View
                style={[
                  styles.cardHead,
                  isDenseForm && styles.cardHeadDense,
                  desktopFormGrid && styles.cardHeadDesktopEnterprise,
                  wizardSection === "commodity" && styles.cardHeadWizard,
                ]}
              >
                <View style={styles.cardHeadTitleCluster}>
                  <View
                    style={[
                      styles.stepBadge,
                      isDenseForm && styles.stepBadgeDense,
                      wizardSection === "commodity" && styles.stepBadgeWizard,
                    ]}
                  >
                    <Text style={styles.stepBadgeText}>02</Text>
                  </View>
                  <Text
                    style={[
                      styles.cardTitle,
                      isDenseForm && styles.cardTitleDense,
                      desktopFormGrid && styles.cardTitleDesktopEnterprise,
                      wizardSection === "commodity" && styles.cardTitleWizard,
                    ]}
                  >
                    Commodity
                  </Text>
                </View>
              </View>
              ) : null}
              <TripCommodityFields
                useVehicleCatalog
                vehicleType={state.vehicleType}
                loadType={state.loadType}
                tons={state.tons}
                onVehicleTypeChange={setters.setVehicleType}
                onLoadTypeChange={setters.setLoadType}
                onTonsChange={setters.setTons}
                vehicleTypeError={invalid("vehicleType")}
                loadTypeError={invalid("loadType")}
                tonsError={invalid("tons")}
                indentVehicleType={sourceIndent?.vehicle_type}
                indentLoadType={sourceIndent?.load_type}
                isWide={isWide && wizardSection == null}
                useFormChrome={!isDenseForm && wizardSection == null}
                preferWebSelect={Platform.OS === "web" && !isDenseForm}
                fieldLabelStyle={fieldLabelStyle}
                fieldInputStyle={fieldInputStyle}
              />
            </View>
          ) : null}

          {/* 02 Commodity & Client — indent-style merge (desktop col2 + mobile wizard step) */}
          {showCommodityClientCard ? (
            desktopWizardChrome ? (
              <CreateTripDesktopCommodityClientStep
                vehicleType={state.vehicleType}
                loadType={state.loadType}
                tons={state.tons}
                onVehicleTypeChange={setters.setVehicleType}
                onLoadTypeChange={setters.setLoadType}
                onTonsChange={setters.setTons}
                vehicleTypeError={invalid("vehicleType")}
                loadTypeError={invalid("loadType")}
                tonsError={invalid("tons")}
                indentVehicleType={sourceIndent?.vehicle_type}
                indentLoadType={sourceIndent?.load_type}
                clients={clients}
                clientsLoading={clientsLoading}
                clientId={state.clientId}
                clientListExpanded={clientListExpanded}
                onExpandClientList={() => setClientListExpanded(true)}
                onToggleClientList={() => setClientListExpanded((p) => !p)}
                onSelectClient={handleSelectClient}
                onAddClient={handleAddClientShortcut}
                clientError={invalid("client")}
                clientPrice={state.clientPrice}
                onClientPriceChange={(v) => setters.setClientPrice(v)}
                clientPriceError={invalid("clientPrice")}
                onClearClient={() => {
                  setters.setClientSelection(null, "");
                  setClientListExpanded(true);
                }}
              />
            ) : (
            <View style={desktopWizardChrome ? createTripDesktopStyles.nonRouteStepWrap : undefined}>
            <View
              style={[
                isWizardTypography ? fullPageWizardStyles.wizardStepContentFlat : styles.card,
                !isWizardTypography && isDenseForm && styles.cardDense,
                desktopFormGrid && styles.cardDesktopEnterprise,
                desktopFormGrid && styles.cardDesktopStretch,
                desktopFormGrid && styles.cardGridCommodityClientWeb,
                desktopWizardChrome && fullPageWizardStyles.wizardStepContentFlat,
              ]}
            >
              {!hideWizardCardHead ? (
                <View
                  style={[
                    styles.cardHead,
                    isDenseForm && styles.cardHeadDense,
                    desktopFormGrid && styles.cardHeadDesktopEnterprise,
                    (wizardSection === "client" || wizardSection === "commodity") && styles.cardHeadWizard,
                  ]}
                >
                  <View style={styles.cardHeadTitleCluster}>
                    <View
                      style={[
                        styles.stepBadge,
                        isDenseForm && styles.stepBadgeDense,
                        (wizardSection === "client" || wizardSection === "commodity") && styles.stepBadgeWizard,
                      ]}
                    >
                      <Text style={styles.stepBadgeText}>02</Text>
                    </View>
                    <Text
                      style={[
                        styles.cardTitle,
                        isDenseForm && styles.cardTitleDense,
                        desktopFormGrid && styles.cardTitleDesktopEnterprise,
                        (wizardSection === "client" || wizardSection === "commodity") && styles.cardTitleWizard,
                      ]}
                    >
                      Commodity & Client
                    </Text>
                  </View>
                </View>
              ) : null}
              <TripCommodityFields
                useVehicleCatalog
                vehicleType={state.vehicleType}
                loadType={state.loadType}
                tons={state.tons}
                onVehicleTypeChange={setters.setVehicleType}
                onLoadTypeChange={setters.setLoadType}
                onTonsChange={setters.setTons}
                vehicleTypeError={invalid("vehicleType")}
                loadTypeError={invalid("loadType")}
                tonsError={invalid("tons")}
                indentVehicleType={sourceIndent?.vehicle_type}
                indentLoadType={sourceIndent?.load_type}
                isWide={isWide && wizardSection == null}
                useFormChrome={!isDenseForm && wizardSection == null}
                preferWebSelect={Platform.OS === "web" && !isDenseForm}
                fieldLabelStyle={fieldLabelStyle}
                fieldInputStyle={fieldInputStyle}
              />
              <View style={{ marginTop: desktopFormGrid ? 16 : 12 }}>
                <TripClientPickerSection
                  clients={clients}
                  clientsLoading={clientsLoading}
                  clientId={state.clientId}
                  clientListExpanded={clientListExpanded}
                  setClientListExpanded={setClientListExpanded}
                  onSelectClient={handleSelectClient}
                  onAddClient={handleAddClientShortcut}
                  hasError={invalid("client")}
                  wizardMode={isWizardTypography}
                  fieldLabelStyle={fieldLabelStyle}
                  isDenseForm={isDenseForm}
                />
              </View>
            </View>
            </View>
            )
          ) : null}

          {/* 03 Client & Commercials (legacy narrow desktop — commodity separate) */}
          {showClientCard ? (
            isWizardSaleKeypad ? (
              <ClientSaleKeypadFlow
                clientPrice={state.clientPrice}
                onClientPriceChange={(v) => setters.setClientPrice(v)}
                partyPreview={
                  selectedClientRow
                    ? {
                        name: selectedClientRow.name ?? "Client",
                        subtitle: resolveWizardClientPhone(selectedClientRow.phone) ?? undefined,
                        entityType: "client",
                        avatarUrl: selectedClientRow.avatar_url ?? null,
                        avatarSeed: selectedClientRow.avatar_seed ?? null,
                      }
                    : undefined
                }
                errorMessage={
                  invalid("clientPrice") ? "Enter a sale price greater than 0" : undefined
                }
              />
            ) : (
            <View
              style={[
                isWizardTypography ? fullPageWizardStyles.wizardStepContentFlat : styles.card,
                !isWizardTypography && isDenseForm && styles.cardDense,
                desktopFormGrid && styles.cardDesktopEnterprise,
                ((wizardSection === "client" || wizardSection === "commodity")) &&
                  !isWizardTypography &&
                  styles.cardWizardStep,
                desktopFormGrid && styles.cardGridClientWeb,
              ]}
            >
            {!hideWizardCardHead ? (
            <View
              style={[
                styles.cardHead,
                isDenseForm && styles.cardHeadDense,
                desktopFormGrid && styles.cardHeadDesktopEnterprise,
                (wizardSection === "client" || wizardSection === "commodity") && styles.cardHeadWizard,
              ]}
            >
              <View style={styles.cardHeadTitleCluster}>
                <View
                  style={[
                    styles.stepBadge,
                    isDenseForm && styles.stepBadgeDense,
                    (wizardSection === "client" || wizardSection === "commodity") && styles.stepBadgeWizard,
                  ]}
                >
                  <Text style={styles.stepBadgeText}>03</Text>
                </View>
                <Text
                  style={[
                    styles.cardTitle,
                    isDenseForm && styles.cardTitleDense,
                    desktopFormGrid && styles.cardTitleDesktopEnterprise,
                    (wizardSection === "client" || wizardSection === "commodity") && styles.cardTitleWizard,
                  ]}
                >
                  Client & Commercials
                </Text>
              </View>
            </View>
            ) : null}

            <View
              style={[
                styles.gridRow,
                isDenseForm && styles.gridRowDense,
                isWide && styles.gridRowWide,
                desktopFormGrid && styles.gridRowWideDesktop,
                desktopFormGrid && styles.clientCommercialsRowDesktop,
                isWizardSingleCard && styles.gridRowWizard,
              ]}
            >
              {!showClientSaleOnly ? (
              <View
                style={[
                  styles.gridCol,
                  isWizardSingleCard && showClientPickerOnly && styles.gridColWizardFill,
                  invalid("client") && styles.fieldGroupRing,
                  desktopFormGrid && styles.clientCommercialsClientColDesktop,
                ]}
              >
                <TripClientPickerSection
                  clients={clients}
                  clientsLoading={clientsLoading}
                  clientId={state.clientId}
                  clientListExpanded={clientListExpanded}
                  setClientListExpanded={setClientListExpanded}
                  onSelectClient={handleSelectClient}
                  onAddClient={handleAddClientShortcut}
                  hasError={invalid("client")}
                  wizardMode={
                    Boolean(isWizardSingleCard && showClientPickerOnly && isWizardTypography)
                  }
                  fieldLabelStyle={fieldLabelStyle}
                  isDenseForm={isDenseForm}
                />
                {isWizardSingleCard && showClientPickerOnly && !invalid("client") ? (
                  <Text style={styles.wizardClientPickerHint}>
                    Select a client to continue
                  </Text>
                ) : null}
              </View>
              ) : null}

              {!showClientPickerOnly ? (
              <View
                style={[
                  styles.gridCol,
                  desktopFormGrid && styles.clientCommercialsPriceColDesktop,
                ]}
              >
                {showClientSaleOnly && selectedClientRow ? (
                  <View style={{ marginBottom: 12 }}>
                    <WizardClientSummaryCard
                      name={selectedClientRow.name ?? "Client"}
                      subtitle={resolveWizardClientPhone(selectedClientRow.phone)}
                      avatarUrl={selectedClientRow.avatar_url}
                      avatarSeed={selectedClientRow.avatar_seed}
                    />
                  </View>
                ) : null}
                <SmartInput
                  type="currency"
                  label="Client sale price"
                  value={state.clientPrice}
                  onChange={(raw) => setters.setClientPrice(raw)}
                  variant="field"
                  density={isDenseForm ? "compact" : "default"}
                  required
                  partyPreview={
                    wizardSection == null && selectedClientRow
                      ? {
                          name: selectedClientRow.name ?? "Client",
                          subtitle: resolveWizardClientPhone(selectedClientRow.phone) ?? undefined,
                          entityType: "client",
                          avatarUrl:
                            (selectedClientRow as { avatar_url?: string | null })
                              .avatar_url ?? null,
                          avatarSeed:
                            (selectedClientRow as { avatar_seed?: string | null })
                              .avatar_seed ?? null,
                        }
                      : undefined
                  }
                  errorMessage={invalid("clientPrice") ? "Enter a sale price" : undefined}
                />
                {!isWide ? (
                  <View style={[styles.infoCallout, isDenseForm && styles.infoCalloutDense]}>
                    <Info size={isDenseForm ? 14 : 16} color={Theme.iconPrimary} />
                    <Text
                      style={[styles.infoCalloutText, isDenseForm && styles.infoCalloutTextDense]}
                    >
                      Revenue should match what you bill this client for this
                      lane. Adjust if this trip differs.
                    </Text>
                  </View>
                ) : null}
              </View>
              ) : null}
            </View>
            {isWide ? (
              <View style={styles.infoCalloutWideSpan}>
                <Info size={16} color={Theme.iconPrimary} />
                <Text style={styles.infoCalloutText}>
                  Revenue should match what you bill this client for this lane.
                  Adjust if this trip differs.
                </Text>
              </View>
            ) : null}
          </View>
            )
          ) : null}

          {/* 03 Sale — indent-style full-width row (desktop enterprise grid) */}
          {showSaleCard ? (
            desktopWizardChrome ? (
              <CreateTripDesktopSaleStep
                clientPrice={state.clientPrice}
                onClientPriceChange={(v) => setters.setClientPrice(v)}
                selectedClient={selectedClientRow}
                priceError={invalid("clientPrice")}
              />
            ) : (
            <View style={desktopWizardChrome ? createTripDesktopStyles.nonRouteStepWrap : undefined}>
            {isWizardSaleKeypad ? (
              <ClientSaleKeypadFlow
                clientPrice={state.clientPrice}
                onClientPriceChange={(v) => setters.setClientPrice(v)}
                partyPreview={
                  selectedClientRow
                    ? {
                        name: selectedClientRow.name ?? "Client",
                        subtitle: resolveWizardClientPhone(selectedClientRow.phone) ?? undefined,
                        entityType: "client",
                        avatarUrl: selectedClientRow.avatar_url ?? null,
                        avatarSeed: selectedClientRow.avatar_seed ?? null,
                      }
                    : undefined
                }
                errorMessage={
                  invalid("clientPrice") ? "Enter a sale price greater than 0" : undefined
                }
              />
            ) : (
              <View
                style={[
                  styles.card,
                  isDenseForm && styles.cardDense,
                  desktopFormGrid && styles.cardDesktopEnterprise,
                  desktopFormGrid && styles.cardGridSaleWeb,
                ]}
              >
                <View style={[styles.cardHead, isDenseForm && styles.cardHeadDense, desktopFormGrid && styles.cardHeadDesktopEnterprise]}>
                  <View style={styles.cardHeadTitleCluster}>
                    <View style={[styles.stepBadge, isDenseForm && styles.stepBadgeDense]}>
                      <Text style={styles.stepBadgeText}>03</Text>
                    </View>
                    <Text style={[styles.cardTitle, isDenseForm && styles.cardTitleDense, desktopFormGrid && styles.cardTitleDesktopEnterprise]}>
                      Sale
                    </Text>
                  </View>
                </View>
                <SmartInput
                  type="currency"
                  label="Client sale price"
                  value={state.clientPrice}
                  onChange={(raw) => setters.setClientPrice(raw)}
                  variant="field"
                  density={isDenseForm ? "compact" : "default"}
                  required
                  partyPreview={
                    selectedClientRow
                      ? {
                          name: selectedClientRow.name ?? "Client",
                          subtitle: resolveWizardClientPhone(selectedClientRow.phone) ?? undefined,
                          entityType: "client",
                          avatarUrl: selectedClientRow.avatar_url ?? null,
                          avatarSeed: selectedClientRow.avatar_seed ?? null,
                        }
                      : undefined
                  }
                  errorMessage={invalid("clientPrice") ? "Enter a sale price" : undefined}
                />
                <View style={[styles.infoCallout, isDenseForm && styles.infoCalloutDense]}>
                  <Info size={isDenseForm ? 14 : 16} color={Theme.iconPrimary} />
                  <Text style={[styles.infoCalloutText, isDenseForm && styles.infoCalloutTextDense]}>
                    Revenue should match what you bill this client for this lane.
                  </Text>
                </View>
              </View>
            )
            }
            </View>
            )
          ) : null}

          {/* 04 Source / 05 Allocation */}
          {showAllocationCard ? (
            <>
            {isWizardSourceCard ? (
            <View style={fullPageWizardStyles.wizardStepContentFlat}>
              <SupplyAllocationModeBar
                mode={supplyIsAsset ? "asset" : "aggregate"}
                variant="wizard"
                compact={isCompactMobile}
                layout="stack"
                assignLater={state.assignLater}
                assignLaterDisabled={assignLaterSwitchDisabled}
                onModeChange={(mode) => setters.setSupplySource(mode)}
                onAssignLaterChange={setters.setAssignLater}
                showAssignLater={false}
                showModeToggle
              />
              {state.supplySource === "aggregate" ? (
                <TripPartnerPickerSection
                  suppliers={suppliers}
                  suppliersLoading={suppliersLoading}
                  supplierId={state.supplierId}
                  partnerListExpanded={partnerListExpanded}
                  setPartnerListExpanded={setPartnerListExpanded}
                  onSelectPartner={handleSelectPartner}
                  onClearPartner={handleClearPartner}
                  onAddPartner={handleAddSupplierShortcut}
                  hasError={invalid("partner")}
                  wizardMode
                  listMaxHeight={300}
                />
              ) : (
                <View style={styles.infoCallout}>
                  <Info size={16} color={Theme.iconPrimary} />
                  <Text style={styles.infoCalloutText}>
                    Next you can assign a driver and vehicle, or choose Assign later.
                  </Text>
                </View>
              )}
              {showPartnerRatesBlock ? (
                <CreateTripDesktopPartnerRatesSection
                  partnerRate={state.supplierRate}
                  onPartnerRateChange={(v) => setters.setSupplierRate(v)}
                  advancePaid={state.advancePaid}
                  onAdvancePaidChange={(v) => setters.setAdvancePaid(v)}
                  partyPreview={
                    selectedSupplierRow
                      ? supplierToNumericPartyPreview(selectedSupplierRow)
                      : undefined
                  }
                  suppressPartyPreview
                  rateError={invalid("partnerRate")}
                  advanceError={invalid("advancePaid")}
                />
              ) : null}
            </View>
            ) : mobileAllocWizard && isWizardAllocationCard ? (
            <AllocationMobileWizardShell
              progressSteps={allocationWizardProgressSteps}
              currentStepId={allocationSubStep ?? "supply"}
              fillBody={allocationShellFill}
              desktop={desktopWizardChrome}
            >
            <View
              style={
                allocationFillBody
                  ? styles.allocationKeypadBody
                  : desktopAllocFill
                    ? createTripDesktopStyles.allocationStepBody
                    : desktopWizardChrome
                      ? createTripDesktopStyles.stepBody
                      : showAssetFleetOnSupply
                        ? styles.allocationPickerBody
                        : styles.allocationStepBody
              }
            >
            {allocationContextRow || allocationPriorSelections.length > 0 ? (
              <View
                style={
                  allocationFillBody
                    ? fullPageWizardStyles.wizardKeypadChromePad
                    : undefined
                }
              >
                {allocationContextRow ? (
                  <WizardPartyContextRow
                    left={allocationContextRow.left}
                    right={allocationContextRow.right}
                    compact
                  />
                ) : null}

                {allocationPriorSelections.length > 0 ? (
                  <WizardPriorSelections
                    items={allocationPriorSelections}
                    compact
                  />
                ) : null}
              </View>
            ) : null}

            {showAlloc("supply") ? (
            <View style={desktopAllocFill ? createTripDesktopStyles.allocationToolbar : undefined}>
            <SupplyAllocationModeBar
              mode={supplyIsAsset ? "asset" : "aggregate"}
              variant="wizard"
              compact={isCompactMobile}
              layout={desktopAllocFill ? "inline" : "stack"}
              assignLater={state.assignLater}
              assignLaterDisabled={assignLaterSwitchDisabled}
              onModeChange={(mode) => setters.setSupplySource(mode)}
              onAssignLaterChange={setters.setAssignLater}
              allowedModes={allowedSupplyModes}
              showModeToggle={!hideModeOnAllocation}
              showAssignLater={!hideAssignLaterOnSource}
            />
            {assignLaterSwitchDisabled ? (
              <Text style={styles.assignLaterLockedHintBelow}>
                Remove driver or vehicle assignment to enable assign later.
              </Text>
            ) : null}
            {state.assignLater ? (
              <Text style={styles.warningText}>
                {supplyIsAsset
                  ? "Assign vehicle and driver on the trip screen before the trip starts."
                  : "Add vehicle number and driver phone on the trip screen before the trip starts."}
              </Text>
            ) : null}
            {showAggregatePartnerInline && state.supplySource === "aggregate" ? (
              <TripPartnerPickerSection
                suppliers={suppliers}
                suppliersLoading={suppliersLoading}
                supplierId={state.supplierId}
                partnerListExpanded={partnerListExpanded}
                setPartnerListExpanded={setPartnerListExpanded}
                onSelectPartner={handleSelectPartner}
                onClearPartner={handleClearPartner}
                onAddPartner={handleAddSupplierShortcut}
                hasError={invalid("partner")}
                wizardMode
                suppressCollapsedSummary={Boolean(allocationContextRow?.right)}
                listMaxHeight={300}
              />
            ) : null}
            </View>
            ) : null}

            {supplyIsAsset && showAssetFleetOnSupply ? (
              <View
                style={
                  desktopAllocFill
                    ? createTripDesktopStyles.allocationFleetPanel
                    : styles.allocationFleetStack
                }
              >
                {desktopAllocFill && assetFleetWarningLines.length > 0 ? (
                  <View style={createTripDesktopStyles.allocationWarnCompact}>
                    <AlertCircle size={13} color={Theme.warning} />
                    <Text style={createTripDesktopStyles.allocationWarnCompactText}>
                      {assetFleetWarningLines.join(" ")}
                    </Text>
                  </View>
                ) : null}
                {!desktopAllocFill && busyFleetHintAsset ? (
                  <View style={styles.warnBanner}>
                    <AlertCircle size={14} color={Theme.warning} />
                    <Text style={styles.warnBannerText}>
                      {drivers.length === 0
                        ? "No drivers yet. Add drivers from Drivers first."
                        : "Some drivers are currently on active trips. Select an available driver or use Assign later."}
                    </Text>
                  </View>
                ) : null}
                {!desktopAllocFill &&
                !state.assignLater &&
                busyFleetHintVehicle ? (
                  <View style={styles.warnBanner}>
                    <AlertCircle size={14} color={Theme.warning} />
                    <Text style={styles.warnBannerText}>
                      {vehicles.length === 0
                        ? "No vehicles yet. Add vehicles from Vehicles first."
                        : "Vehicles marked 'On trip' are currently busy. Choose an available vehicle or use Assign later."}
                    </Text>
                  </View>
                ) : null}
                {fleetLoading ? (
                  <ActivityIndicator color={Theme.iconPrimary} style={styles.allocationFleetLoading} />
                ) : desktopWizardChrome ? (
                  <View style={createTripDesktopStyles.allocationColumns}>
                    <View style={createTripDesktopStyles.allocationColumn}>
                      {showDriverFleetSummary && selectedDriverRow && !allocationContextRow?.right ? (
                        <View style={styles.allocationFleetSummary}>
                          <WizardEntitySummaryCard
                            label="Driver"
                            name={selectedDriverRow.name ?? "Driver"}
                            subtitle={[selectedDriverRow.phone, selectedDriverRow.email]
                              .filter(Boolean)
                              .join(" · ")}
                            entityType="driver"
                            avatarUrl={
                              (selectedDriverRow as { avatar_url?: string | null })
                                .avatar_url ?? null
                            }
                            avatarSeed={
                              (selectedDriverRow as { avatar_seed?: string | null })
                                .avatar_seed ?? null
                            }
                            onPress={() => setDriverListExpanded(true)}
                          />
                        </View>
                      ) : null}
                      {showDriverFleetList ? (
                        <AssignmentEntityAvatarGrid
                          title="Select Driver"
                          variant="wizard"
                          embedded
                          totalCount={driverOptions.length}
                          errorOutline={invalid("assetDriver")}
                          selectedId={state.driverId}
                          onSelect={(id) => {
                            const row = driverOptions.find((d) => d.id === id);
                            if (row?.isBusy) return;
                            const newId = state.driverId === id ? null : id;
                            const dr = newId ? drivers.find((d) => d.id === newId) : null;
                            setters.setDriver(newId, dr?.commission_percent ?? null, dr?.commission_per_km ?? null);
                            setDriverListExpanded(false);
                          }}
                          items={driverAvatarGridItems}
                          emptyMessage="No drivers added yet. Add a driver to continue."
                          emptyActionLabel="Add driver"
                          onEmptyAction={handleAddDriverShortcut}
                          headerActionLabel="Add driver"
                          onHeaderAction={handleAddDriverShortcut}
                          footerHint={
                            !state.driverId ? "Choose an available driver" : undefined
                          }
                          scrollMaxHeight={desktopFleetGridMaxHeight}
                        />
                      ) : null}
                    </View>
                    <View style={createTripDesktopStyles.allocationColumn}>
                      {showVehicleFleetSummary && selectedVehicleRow ? (
                        <View style={styles.allocationFleetSummary}>
                          <WizardEntitySummaryCard
                            label="Vehicle"
                            name={
                              formatIndianVehicleNumber(
                                selectedVehicleRow.vehicle_number || "",
                              ) || "—"
                            }
                            subtitle={[
                              selectedVehicleRow.vehicle_body_type ||
                                selectedVehicleRow.vehicle_type,
                              [
                                selectedVehicleRow.vehicle_size,
                                selectedVehicleRow.vehicle_axle,
                              ]
                                .filter(Boolean)
                                .join(" "),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            entityType="driver"
                            onPress={() => setVehicleListExpanded(true)}
                          />
                        </View>
                      ) : null}
                      {showVehicleFleetList ? (
                        <AssignmentEntityAvatarGrid
                          title="Select Vehicle"
                          variant="wizard"
                          embedded
                          totalCount={vehicleOptions.length}
                          errorOutline={invalid("assetVehicle")}
                          selectedId={state.vehicleId}
                          onSelect={(id) => {
                            const row = vehicleOptions.find((v) => v.id === id);
                            if (row?.isBusy) return;
                            setters.setVehicleId(state.vehicleId === id ? null : id);
                            setVehicleListExpanded(false);
                          }}
                          items={vehicleAvatarGridItems}
                          emptyMessage="No vehicles added yet. Add a vehicle to continue."
                          emptyActionLabel="Add vehicle"
                          onEmptyAction={handleAddVehicleShortcut}
                          headerActionLabel="Add vehicle"
                          onHeaderAction={handleAddVehicleShortcut}
                          footerHint={
                            !state.vehicleId ? "Choose an available vehicle" : undefined
                          }
                          scrollMaxHeight={desktopFleetGridMaxHeight}
                        />
                      ) : null}
                    </View>
                  </View>
                ) : (
                  <>
                    {showDriverFleetSummary && selectedDriverRow && !allocationContextRow?.right ? (
                      <View style={styles.allocationFleetSummary}>
                        <WizardEntitySummaryCard
                          label="Driver"
                          name={selectedDriverRow.name ?? "Driver"}
                          subtitle={[selectedDriverRow.phone, selectedDriverRow.email]
                            .filter(Boolean)
                            .join(" · ")}
                          entityType="driver"
                          avatarUrl={
                            (selectedDriverRow as { avatar_url?: string | null })
                              .avatar_url ?? null
                          }
                          avatarSeed={
                            (selectedDriverRow as { avatar_seed?: string | null })
                              .avatar_seed ?? null
                          }
                          onPress={() => setDriverListExpanded(true)}
                        />
                      </View>
                    ) : null}
                    {showDriverFleetList ? (
                      <AssignmentEntityAvatarGrid
                        title="Select Driver"
                        variant="wizard"
                        embedded
                        totalCount={driverOptions.length}
                        errorOutline={invalid("assetDriver")}
                        selectedId={state.driverId}
                        onSelect={(id) => {
                          const row = driverOptions.find((d) => d.id === id);
                          if (row?.isBusy) return;
                          const newId = state.driverId === id ? null : id;
                          const dr = newId ? drivers.find((d) => d.id === newId) : null;
                          setters.setDriver(newId, dr?.commission_percent ?? null, dr?.commission_per_km ?? null);
                          setDriverListExpanded(false);
                        }}
                        items={driverAvatarGridItems}
                        emptyMessage="No drivers added yet. Add a driver to continue."
                        emptyActionLabel="Add driver"
                        onEmptyAction={handleAddDriverShortcut}
                        headerActionLabel="Add driver"
                        onHeaderAction={handleAddDriverShortcut}
                        footerHint={
                          !state.driverId ? "Choose an available driver" : undefined
                        }
                        scrollMaxHeight={320}
                      />
                    ) : null}
                    {showVehicleFleetSummary && selectedVehicleRow ? (
                      <View style={styles.allocationFleetSummary}>
                        <WizardEntitySummaryCard
                          label="Vehicle"
                          name={
                            formatIndianVehicleNumber(
                              selectedVehicleRow.vehicle_number || "",
                            ) || "—"
                          }
                          subtitle={[
                            selectedVehicleRow.vehicle_body_type ||
                              selectedVehicleRow.vehicle_type,
                            [
                              selectedVehicleRow.vehicle_size,
                              selectedVehicleRow.vehicle_axle,
                            ]
                              .filter(Boolean)
                              .join(" "),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          entityType="driver"
                          onPress={() => setVehicleListExpanded(true)}
                        />
                      </View>
                    ) : null}
                    {showVehicleFleetList ? (
                      <AssignmentEntityAvatarGrid
                        title="Select Vehicle"
                        variant="wizard"
                        embedded
                        totalCount={vehicleOptions.length}
                        errorOutline={invalid("assetVehicle")}
                        selectedId={state.vehicleId}
                        onSelect={(id) => {
                          const row = vehicleOptions.find((v) => v.id === id);
                          if (row?.isBusy) return;
                          setters.setVehicleId(state.vehicleId === id ? null : id);
                          setVehicleListExpanded(false);
                        }}
                        items={vehicleAvatarGridItems}
                        emptyMessage="No vehicles added yet. Add a vehicle to continue."
                        emptyActionLabel="Add vehicle"
                        onEmptyAction={handleAddVehicleShortcut}
                        headerActionLabel="Add vehicle"
                        onHeaderAction={handleAddVehicleShortcut}
                        footerHint={
                          !state.vehicleId ? "Choose an available vehicle" : undefined
                        }
                        scrollMaxHeight={320}
                      />
                    ) : null}
                  </>
                )}
              </View>
            ) : null}

            {(showPartnerRatesBlock ||
              (desktopWizardChrome &&
                state.supplySource === "aggregate" &&
                Boolean(state.supplierId))) &&
            !(
              state.supplySource === "aggregate" &&
              !state.assignLater &&
              desktopWizardChrome &&
              isWizardAllocationCard &&
              Boolean(state.supplierId)
            ) &&
            !hideModeOnAllocation ? (
              desktopWizardChrome ? (
                <CreateTripDesktopPartnerRatesSection
                  partnerRate={state.supplierRate}
                  onPartnerRateChange={(v) => setters.setSupplierRate(v)}
                  advancePaid={state.advancePaid}
                  onAdvancePaidChange={(v) => setters.setAdvancePaid(v)}
                  partyPreview={
                    selectedSupplierRow
                      ? supplierToNumericPartyPreview(selectedSupplierRow)
                      : undefined
                  }
                  suppressPartyPreview={Boolean(allocationContextRow?.right)}
                  rateError={invalid("partnerRate")}
                  advanceError={invalid("advancePaid")}
                />
              ) : (
              <PartnerRatesKeypadFlow
                partnerRate={state.supplierRate}
                onPartnerRateChange={(v) => setters.setSupplierRate(v)}
                advancePaid={state.advancePaid}
                onAdvancePaidChange={(v) => setters.setAdvancePaid(v)}
                partyPreview={
                  selectedSupplierRow
                    ? supplierToNumericPartyPreview(selectedSupplierRow)
                    : undefined
                }
                suppressPartyPreview={Boolean(allocationContextRow?.right)}
                wizardShell
                compact
                saleValue={state.clientPrice}
              />
              )
            ) : null}

            {state.supplySource === "aggregate" &&
            !state.assignLater &&
            desktopWizardChrome &&
            isWizardAllocationCard &&
            Boolean(state.supplierId) ? (
              <CreateTripDesktopAggregateFields
                partnerRate={state.supplierRate}
                onPartnerRateChange={(v) => setters.setSupplierRate(v)}
                advancePaid={state.advancePaid}
                onAdvancePaidChange={(v) => setters.setAdvancePaid(v)}
                partyPreview={
                  selectedSupplierRow
                    ? supplierToNumericPartyPreview(selectedSupplierRow)
                    : undefined
                }
                suppressPartyPreview={Boolean(allocationContextRow?.right)}
                rateError={invalid("partnerRate")}
                advanceError={invalid("advancePaid")}
                driverCommissionPercent={state.aggregateDriverCommissionPercent}
                onDriverCommissionPercentChange={
                  setters.setAggregateDriverCommissionPercent
                }
                driverName={state.aggregateDriverName}
                onDriverNameChange={(t) =>
                  onPadValueChange(setters.setAggregateDriverName, t)
                }
                driverPhone={state.driverPhone}
                onDriverPhoneChange={(v) =>
                  setters.setDriverPhone(formatMobileNumber(v))
                }
                vehicleText={state.aggregateVehicleText}
                onVehicleTextChange={(v) => setters.setAggregateVehicleText(v)}
                invalid={invalid}
                driverPhoneMatches={enrichedDriverPhoneMatches}
                driverPhoneLookupLoading={driverPhoneLookupLoading}
                selectedDriverMatchId={selectedDriverMatchId}
                onSelectDriverMatch={applyDriverPhoneMatch}
                driverPhoneInTrip={state.driverPhoneTripConflict}
                fleetDrivers={drivers}
              />
            ) : aggregateTrackingStep ? (
              <AggregateTrackingMobileStep
                step={aggregateTrackingStep}
                driverName={state.aggregateDriverName}
                onDriverNameChange={(t) =>
                  onPadValueChange(setters.setAggregateDriverName, t)
                }
                driverPhone={state.driverPhone}
                onDriverPhoneChange={(v) =>
                  setters.setDriverPhone(formatMobileNumber(v))
                }
                vehicleText={state.aggregateVehicleText}
                onVehicleTextChange={(v) =>
                  setters.setAggregateVehicleText(v)
                }
                invalid={invalid}
                driverPhoneMatches={enrichedDriverPhoneMatches}
                driverPhoneLookupLoading={driverPhoneLookupLoading}
                selectedDriverMatchId={selectedDriverMatchId}
                onSelectDriverMatch={applyDriverPhoneMatch}
                driverPhoneInTrip={state.driverPhoneTripConflict}
                driverNameFromPlatform={state.driverPhoneName?.trim() || null}
                fleetDrivers={drivers}
              />
            ) : null}
            </View>
            </AllocationMobileWizardShell>
            ) : (
            <View
              style={[
                styles.card,
                isDenseForm && styles.cardDense,
                desktopFormGrid && styles.cardDesktopEnterprise,
                desktopFormGrid && styles.cardGridSupplyWeb,
              ]}
            >
            <View
              style={[
                styles.cardHead,
                styles.cardHeadWithTrailingAction,
                isDenseForm && styles.cardHeadDense,
                desktopFormGrid && styles.cardHeadDesktopEnterprise,
              ]}
            >
              <View style={styles.cardHeadTitleCluster}>
                <View style={[styles.stepBadge, isDenseForm && styles.stepBadgeDense]}>
                  <Text style={styles.stepBadgeText}>04</Text>
                </View>
                <Text
                  style={[styles.cardTitle, isDenseForm && styles.cardTitleDense, desktopFormGrid && styles.cardTitleDesktopEnterprise]}
                  numberOfLines={1}
                >
                  Supply & Allocation
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.notesQuickBtn,
                  invalid("notes") ? styles.notesQuickBtnInvalid : null,
                  Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
                ]}
                onPress={openNotesModal}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={
                  state.notes.trim().length > 0
                    ? "Edit trip notes"
                    : "Add trip notes"
                }
              >
                <FileText size={17} color={Theme.iconPrimary} />
                {state.notes.trim().length > 0 ? (
                  <View style={styles.notesQuickBtnDot} />
                ) : null}
              </TouchableOpacity>
            </View>

            {showAlloc("supply") ? (
            <>
            <SupplyAllocationModeBar
              mode={supplyIsAsset ? "asset" : "aggregate"}
              variant={desktopFormGrid || mobileAllocWizard ? "wizard" : "classic"}
              compact={isCompactMobile}
              layout={
                aggregateDesktopEnterprise || mobileAllocWizard ? "stack" : "inline"
              }
              assignLater={state.assignLater}
              assignLaterDisabled={assignLaterSwitchDisabled}
              onModeChange={(mode) => setters.setSupplySource(mode)}
              onAssignLaterChange={setters.setAssignLater}
              allowedModes={allowedSupplyModes}
              showModeToggle={!hideModeOnAllocation}
              showAssignLater={!hideAssignLaterOnSource}
            />
            <View style={{ marginBottom: assignLaterSwitchDisabled ? 12 : 0 }}>
              {assignLaterSwitchDisabled ? (
                <Text style={styles.assignLaterLockedHintBelow}>
                  Remove driver or vehicle assignment to enable assign later.
                </Text>
              ) : null}
            </View>
            {state.assignLater ? (
              <Text style={styles.warningText}>
                {supplyIsAsset
                  ? "Assign vehicle and driver on the trip screen before the trip starts."
                  : "Add vehicle number and driver phone on the trip screen before the trip starts."}
              </Text>
            ) : null}
            </>
            ) : null}

            {supplyIsAsset &&
            (!mobileAllocWizard ||
              showAlloc("fleetDriver") ||
              showAlloc("fleetVehicle")) ? (
              <>
                {busyFleetHintAsset ? (
                  <View style={styles.warnBanner}>
                    <AlertCircle size={14} color={Theme.warning} />
                    <Text style={styles.warnBannerText}>
                      {drivers.length === 0
                        ? "No drivers yet. Add drivers from Drivers first."
                        : "Some drivers are currently on active trips. Select an available driver or use Assign later."}
                    </Text>
                  </View>
                ) : null}
                {!state.assignLater &&
                availableVehicles.length === 0 &&
                !fleetLoading ? (
                  <View style={styles.warnBanner}>
                    <AlertCircle size={14} color={Theme.warning} />
                    <Text style={styles.warnBannerText}>
                      {vehicles.length === 0
                        ? "No vehicles yet. Add vehicles from Vehicles first."
                        : "Vehicles marked 'On trip' are currently busy. Choose an available vehicle or use Assign later."}
                    </Text>
                  </View>
                ) : null}

                {!state.assignLater &&
                (showAlloc("fleetDriver") || !mobileAllocWizard) ? (
                  <>
                  <View
                    style={[
                      assignmentShellStyles.assignSelectionGrid,
                      driverVehicleSideBySide &&
                        assignmentShellStyles.assignSelectionGridDesktop,
                    ]}
                  >
                    <View
                      style={
                        driverVehicleSideBySide
                          ? styles.fleetPickColumnWrap
                          : undefined
                      }
                    >
                      {fleetLoading ? (
                        <ActivityIndicator color={Theme.iconPrimary} />
                      ) : (
                        <>
                          {showDriverFleetSummary ? (
                            <TouchableOpacity
                              style={[
                                styles.clientCard,
                                isDenseForm && styles.clientCardDense,
                                styles.selectionSummaryCard,
                                { marginBottom: 10 },
                              ]}
                              onPress={() => setDriverListExpanded(true)}
                              activeOpacity={0.85}
                            >
                              <View style={styles.clientMain}>
                                <PartyAvatar
                                  name={selectedDriverRow!.name ?? "Driver"}
                                  avatarUrl={(selectedDriverRow as { avatar_url?: string | null }).avatar_url ?? null}
                                  avatarSeed={(selectedDriverRow as { avatar_seed?: string | null }).avatar_seed ?? null}
                                  entityType="driver"
                                  size={38}
                                  borderStyle={styles.clientAvatarOn}
                                />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={styles.selectionSummaryTitle} numberOfLines={1}>
                                    {selectedDriverRow!.name || "—"}
                                  </Text>
                                  <Text style={styles.selectionSummarySub} numberOfLines={1}>
                                    {[selectedDriverRow!.phone, selectedDriverRow!.email]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.selectionSummaryPill}>
                                <Text style={styles.selectionSummaryPillText}>Change</Text>
                              </View>
                            </TouchableOpacity>
                          ) : null}
                          {showDriverFleetList ? (
                            <AssignmentEntityAvatarGrid
                              title="Select Driver"
                              variant={isWizardAllocationCard ? "wizard" : "grid"}
                              embedded={isWizardAllocationCard}
                              totalCount={driverOptions.length}
                              errorOutline={invalid("assetDriver")}
                              selectedId={state.driverId}
                              onSelect={(id) => {
                                const row = driverOptions.find((d) => d.id === id);
                                if (row?.isBusy) return;
                                const newId = state.driverId === id ? null : id;
                                const dr = newId ? drivers.find((d) => d.id === newId) : null;
                                setters.setDriver(newId, dr?.commission_percent ?? null, dr?.commission_per_km ?? null);
                                setDriverListExpanded(false);
                              }}
                              items={driverAvatarGridItems}
                              emptyMessage="No drivers added yet. Add a driver to continue."
                              emptyActionLabel="Add driver"
                              onEmptyAction={handleAddDriverShortcut}
                              headerActionLabel="Add driver"
                              onHeaderAction={handleAddDriverShortcut}
                              footerHint={
                                !state.driverId
                                  ? "Choose an available driver"
                                  : undefined
                              }
                            />
                          ) : null}
                        </>
                      )}
                    </View>
                    {(showAlloc("fleetVehicle") || !mobileAllocWizard) ? (
                    <View
                      style={
                        driverVehicleSideBySide
                          ? styles.fleetPickColumnWrap
                          : undefined
                      }
                    >
                      {fleetLoading ? (
                        <ActivityIndicator color={Theme.iconPrimary} />
                      ) : (
                        <>
                          {showVehicleFleetSummary ? (
                            <TouchableOpacity
                              style={[
                                styles.clientCard,
                                isDenseForm && styles.clientCardDense,
                                styles.selectionSummaryCard,
                                { marginBottom: 10 },
                              ]}
                              onPress={() => setVehicleListExpanded(true)}
                              activeOpacity={0.85}
                            >
                              <View style={styles.clientMain}>
                                <View style={styles.vehicleCardIconSummary}>
                                  <Truck size={18} color={Theme.textOnDarkMuted} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={styles.selectionSummaryTitle} numberOfLines={1}>
                                    {formatIndianVehicleNumber(
                                      selectedVehicleRow!.vehicle_number || "",
                                    ) || "—"}
                                  </Text>
                                  <Text style={styles.selectionSummarySub} numberOfLines={1}>
                                    {[
                                      selectedVehicleRow!.vehicle_body_type ||
                                        selectedVehicleRow!.vehicle_type,
                                      [
                                        selectedVehicleRow!.vehicle_size,
                                        selectedVehicleRow!.vehicle_axle,
                                      ]
                                        .filter(Boolean)
                                        .join(" "),
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")
                                      .toUpperCase()}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.selectionSummaryPill}>
                                <Text style={styles.selectionSummaryPillText}>Change</Text>
                              </View>
                            </TouchableOpacity>
                          ) : null}
                          {showVehicleFleetList ? (
                            <AssignmentEntityAvatarGrid
                              title="Select Vehicle"
                              variant={isWizardAllocationCard ? "wizard" : "grid"}
                              embedded={isWizardAllocationCard}
                              totalCount={vehicleOptions.length}
                              errorOutline={invalid("assetVehicle")}
                              selectedId={state.vehicleId}
                              onSelect={(id) => {
                                const row = vehicleOptions.find((v) => v.id === id);
                                if (row?.isBusy) return;
                                setters.setVehicleId(state.vehicleId === id ? null : id);
                                setVehicleListExpanded(false);
                              }}
                              items={vehicleAvatarGridItems}
                              emptyMessage="No vehicles added yet. Add a vehicle to continue."
                              emptyActionLabel="Add vehicle"
                              onEmptyAction={handleAddVehicleShortcut}
                              headerActionLabel="Add vehicle"
                              onHeaderAction={handleAddVehicleShortcut}
                              footerHint={
                                !state.vehicleId
                                  ? "Choose an available vehicle"
                                  : undefined
                              }
                            />
                          ) : null}
                        </>
                      )}
                    </View>
                    ) : null}
                  </View>
                  <Text style={assignmentShellStyles.supplyFooterHint}>
                    Select a driver and a vehicle from your org to continue.
                  </Text>
                  </>
                ) : null}
              </>
            ) : (
                <View
                  style={[
                    styles.aggregateSplit,
                    allocationWideLayout &&
                      !aggregateDesktopEnterprise &&
                      styles.aggregateSplitWide,
                    aggregateDesktopEnterprise && styles.aggregateEnterpriseBody,
                    aggregateDesktopEnterprise && styles.aggregateSplitEnterprise,
                  ]}
                >
                  {aggregateDesktopEnterprise && showPartnerList ? (
                    <TripPartnerPickerSection
                      suppliers={suppliers}
                      suppliersLoading={suppliersLoading}
                      supplierId={state.supplierId}
                      partnerListExpanded={partnerListExpanded}
                      setPartnerListExpanded={setPartnerListExpanded}
                      onSelectPartner={handleSelectPartner}
                      onClearPartner={handleClearPartner}
                      onAddPartner={handleAddSupplierShortcut}
                      hasError={invalid("partner")}
                      fieldLabelStyle={fieldLabelStyle}
                      isDenseForm={isDenseForm}
                      listMaxHeight={320}
                    />
                  ) : null}
                  <View
                    style={[
                      aggregateDesktopEnterprise &&
                        !(showPartnerList && !state.supplierId) &&
                        styles.aggregateCommercialsRowDesktop,
                      aggregateDesktopEnterprise &&
                        showPartnerList &&
                        !state.supplierId &&
                        styles.aggregateCommercialsRowDesktopHidden,
                      aggregateDesktopEnterprise &&
                        showPartnerList &&
                        state.supplierId &&
                        styles.aggregateCommercialsRatesOnlyDesktop,
                    ]}
                  >
                  {(showAlloc("partner") ||
                    !mobileAllocWizard ||
                    showAggregatePartnerInline) &&
                  !(
                    aggregateDesktopEnterprise &&
                    showPartnerList &&
                    state.supplierId
                  ) ? (
                  <View
                    style={[
                      styles.aggregateLeftPane,
                      allocationWideLayout && styles.aggregateLeftPaneWide,
                      aggregateDesktopEnterprise && styles.aggregateCommercialsPartnerCol,
                    ]}
                  >
                    <TripPartnerPickerSection
                      suppliers={suppliers}
                      suppliersLoading={suppliersLoading}
                      supplierId={state.supplierId}
                      partnerListExpanded={partnerListExpanded}
                      setPartnerListExpanded={setPartnerListExpanded}
                      onSelectPartner={handleSelectPartner}
                      onClearPartner={handleClearPartner}
                      onAddPartner={handleAddSupplierShortcut}
                      hasError={invalid("partner")}
                      wizardMode={isWizardAllocationCard}
                      fieldLabelStyle={fieldLabelStyle}
                      isDenseForm={isDenseForm}
                      listMaxHeight={allocationWideLayout ? 280 : 260}
                    />
                  </View>
                  ) : null}
                  {(showPartnerRatesBlock ||
                    showAlloc("driverName") ||
                    showAlloc("driverPhone") ||
                    showAlloc("vehicle") ||
                    (!mobileAllocWizard && !hideModeOnAllocation)) ? (
                  <View
                    style={[
                      styles.aggregateRightPane,
                      allocationWideLayout && styles.aggregateRightPaneWide,
                      aggregateDesktopEnterprise && styles.aggregateCommercialsRatesCol,
                    ]}
                  >
                <View
                  style={[
                    allocationWideLayout
                      ? styles.aggregatePaneWideInner
                      : assignmentShellStyles.tripAssignSurfaceCard,
                    !allocationWideLayout && styles.aggregateSplitSurface,
                    allocationWideLayout && styles.aggregateAssignSurfaceWide,
                  ]}
                >
                {!mobileAllocWizard ? (
                  <View style={styles.aggregateFormBody}>
                    <View
                      style={[
                        styles.gridRow,
                        (allocationWideLayout || isWide) && styles.gridRowWide,
                        styles.aggregateFormRow,
                      ]}
                    >
                      <View style={styles.gridCol}>
                        {useWebCurrencyField ? (
                          <AddTripWebCurrencyField
                            label="Partner rate"
                            value={state.supplierRate}
                            onChange={setters.setSupplierRate}
                            required
                            dense={isDenseForm}
                            errorMessage={
                              invalid("partnerRate")
                                ? "Enter a partner rate"
                                : undefined
                            }
                          />
                        ) : (
                        <SmartInput
                          type="currency"
                          label="Partner rate"
                          value={state.supplierRate}
                          onChange={(raw) => setters.setSupplierRate(raw)}
                          variant="field"
                          density={aggregateFieldDensity}
                          required
                          partyPreview={
                            !allocationWideLayout && selectedSupplierRow
                              ? supplierToNumericPartyPreview(selectedSupplierRow)
                              : undefined
                          }
                          errorMessage={
                            invalid("partnerRate") ? "Enter a partner rate" : undefined
                          }
                        />
                        )}
                      </View>
                      <View style={styles.gridCol}>
                        {useWebCurrencyField ? (
                          <AddTripWebCurrencyField
                            label="Advance paid"
                            value={state.advancePaid}
                            onChange={setters.setAdvancePaid}
                            placeholder="Optional"
                            dense={isDenseForm}
                          />
                        ) : (
                        <SmartInput
                          type="currency"
                          label="Advance paid"
                          value={state.advancePaid}
                          onChange={(raw) => setters.setAdvancePaid(raw)}
                          variant="field"
                          density={aggregateFieldDensity}
                          placeholder="Optional"
                        />
                        )}
                      </View>
                    </View>

                {!state.assignLater &&
                (showDriverNameField ||
                  showDriverPhoneField ||
                  showVehicleField) ? (
                  <View style={styles.aggregateTrackingSection}>
                    {showDriverPhoneField ? (
                      <View style={styles.aggregateFormField}>
                        <Text style={[...fieldLabelStyle, styles.sectionLabelTight]}>
                          Driver phone (tracking) *
                        </Text>
                        <View
                          style={[
                            styles.inPhoneOuter,
                            isDenseForm && styles.inPhoneOuterDense,
                            styles.aggregatePhoneInput,
                            invalid("driverPhone") && styles.inputErrorOutline,
                          ]}
                        >
                          <Text
                            style={styles.inPhoneFlag}
                            accessibilityLabel="India"
                          >
                            🇮🇳
                          </Text>
                          <Text style={styles.inPhoneCc}>+91</Text>
                          <TextInput
                            style={[
                              styles.inPhoneInput,
                              isDenseForm && styles.inPhoneInputDense,
                              isCompactMobile &&
                                Platform.OS === "web" &&
                                styles.mobileWebNoZoomInput,
                            ]}
                            placeholder="98765 43210"
                            placeholderTextColor={Theme.placeholder}
                            value={state.driverPhone}
                            onChangeText={(v) => {
                              setters.setDriverPhone(formatMobileNumber(v));
                            }}
                            keyboardType="phone-pad"
                            inputMode="tel"
                            maxLength={10}
                            ref={driverPhoneInputRef}
                            inputAccessoryViewID={kbAccessoryId}
                            onFocus={() => {
                              focusPadField(
                                () => focusNextField(aggregateDriverNameInputRef),
                                state.driverPhone,
                              );
                            }}
                            blurOnSubmit={false}
                          />
                        </View>
                        {state.driverPhone.length > 0 &&
                        state.driverPhone.length < 10 ? (
                          <Text style={styles.phoneDigitHint}>
                            {state.driverPhone.length}/10 digits
                          </Text>
                        ) : null}
                        {state.driverPhone.trim() &&
                        validatePhone(state.driverPhone.trim()) ? (
                          <Text style={[styles.warningText, { marginTop: 4 }]}>
                            {validatePhone(state.driverPhone.trim())}
                          </Text>
                        ) : null}
                        {renderDriverPhoneRecommendations(
                          state.driverPhone.length >= 10,
                          "stack",
                        )}
                      </View>
                    ) : null}

                    {showDriverNameField || showVehicleField ? (
                      <View
                        style={[
                          styles.gridRow,
                          (allocationWideLayout || isWide) && styles.gridRowWide,
                          styles.aggregateFormRow,
                        ]}
                      >
                        {showDriverNameField ? (
                          <View
                            style={[
                              styles.gridCol,
                              mobileAllocWizard && styles.allocWizardFieldCol,
                            ]}
                          >
                            <Text style={[...fieldLabelStyle, styles.sectionLabelTight]}>
                              Driver name (tracking) *
                            </Text>
                            {state.driverPhoneName?.trim() ? (
                              <Text style={styles.phoneDigitHint}>
                                From platform: {state.driverPhoneName.trim()}
                              </Text>
                            ) : null}
                            <View
                              style={[
                                styles.iconField,
                                isDenseForm && styles.iconFieldDense,
                              ]}
                            >
                              <User
                                size={isDenseForm ? ADD_TRIP_FORM.moneyIconSize : 16}
                                color={Theme.iconMuted}
                                style={[
                                  styles.iconInField,
                                  isDenseForm && styles.iconInFieldDense,
                                ]}
                              />
                              <TextInput
                                style={[
                                  ...iconFieldInputStyle,
                                  outlineErr("driverName"),
                                  isCompactMobile &&
                                    Platform.OS === "web" &&
                                    styles.mobileWebNoZoomInput,
                                ]}
                                placeholder="e.g. Suresh Kumar"
                                placeholderTextColor={Theme.placeholder}
                                value={state.aggregateDriverName}
                                onChangeText={(t) =>
                                  onPadValueChange(setters.setAggregateDriverName, t)
                                }
                                ref={aggregateDriverNameInputRef}
                                autoCapitalize="words"
                                inputAccessoryViewID={kbAccessoryId}
                                onFocus={() => {
                                  focusPadField(
                                    () => focusNextField(aggregateVehicleInputRef),
                                    state.aggregateDriverName,
                                  );
                                }}
                                blurOnSubmit={false}
                              />
                            </View>
                          </View>
                        ) : null}
                        {showVehicleField ? (
                          <View
                            style={[
                              styles.gridCol,
                              mobileAllocWizard && styles.allocWizardFieldCol,
                            ]}
                          >
                            <Text style={[...fieldLabelStyle, styles.sectionLabelTight]}>
                              Vehicle number *
                            </Text>
                            <Text style={styles.phoneDigitHint}>
                              {getIndianVehicleFormatHint(
                                state.aggregateVehicleText,
                              )}
                            </Text>
                            <View
                              style={[
                                styles.iconField,
                                isDenseForm && styles.iconFieldDense,
                              ]}
                            >
                              <Truck
                                size={isDenseForm ? ADD_TRIP_FORM.moneyIconSize : 16}
                                color={Theme.iconMuted}
                                style={[
                                  styles.iconInField,
                                  isDenseForm && styles.iconInFieldDense,
                                ]}
                              />
                              <TextInput
                                style={[
                                  ...iconFieldInputStyle,
                                  outlineErr("vehicleNumber"),
                                  styles.iconInputVehicleMono,
                                  isCompactMobile &&
                                    Platform.OS === "web" &&
                                    styles.mobileWebNoZoomInput,
                                ]}
                                placeholder="e.g. TN 18 D 2522"
                                placeholderTextColor={Theme.placeholder}
                                value={state.aggregateVehicleText}
                                onChangeText={(v) => {
                                  setters.setAggregateVehicleText(
                                    applyIndianVehicleKeystroke(v),
                                  );
                                }}
                                keyboardType={
                                  Platform.OS === "web"
                                    ? "default"
                                    : getIndianVehicleTextInputKeyboardType(
                                        state.aggregateVehicleText,
                                      )
                                }
                                autoCapitalize="characters"
                                autoCorrect={false}
                                autoComplete="off"
                                inputMode="text"
                                ref={aggregateVehicleInputRef}
                                inputAccessoryViewID={kbAccessoryId}
                                onFocus={() => {
                                  focusPadField(
                                    finishPadFieldEntry,
                                    state.aggregateVehicleText,
                                    "Next",
                                  );
                                }}
                                blurOnSubmit={false}
                              />
                            </View>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : !state.assignLater ? (
                  <View style={[styles.assignLaterPartnerHint, { marginTop: 4 }]}>
                    <Info size={16} color={Theme.textMuted} />
                    <Text style={styles.assignLaterPartnerHintText}>
                      Driver phone and vehicle number are entered on the trip
                      screen.
                    </Text>
                  </View>
                ) : null}

                    {showDriverPhoneField && state.driverPhoneTripConflict ? (
                      <View
                        style={[
                          styles.driverConfirmCard,
                          styles.driverConfirmCardError,
                        ]}
                        accessibilityRole="alert"
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={[
                              styles.driverConfirmMain,
                              { color: Theme.destructive },
                            ]}
                            numberOfLines={2}
                          >
                            {state.driverPhoneName?.trim()
                              ? `${state.driverPhoneName.trim()} is already on a trip`
                              : "This driver is already on a trip"}
                          </Text>
                          <Text style={styles.driverConfirmSub}>
                            {state.driverPhoneTripConflictLabel
                              ? `Open trip: ${state.driverPhoneTripConflictLabel}. Ask them to complete it first, then assign them here.`
                              : "Ask them to complete their current trip first, then assign them here."}
                          </Text>
                        </View>
                        <AlertCircle
                          size={20}
                          color={Theme.destructive}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
                </View>
              </View>
            ) : null}
          </View>
        </View>
      )}
            </View>
            )}
            </>
          ) : null}

          {showInlineCta ? (
            <View
              style={[styles.ctaBlock, desktopFormGrid && styles.ctaGridSpanWeb]}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.primaryCta,
                  desktopFormGrid && styles.primaryCtaDesktop,
                  primaryCtaDisabled && styles.primaryCtaDis,
                  Platform.OS === "web" && !primaryCtaDisabled
                    ? ({ cursor: "pointer" } as ViewStyle)
                    : null,
                  pressed && !primaryCtaDisabled && { opacity: 0.92 },
                ]}
                onPress={primaryCtaDisabled ? undefined : onSubmit}
                disabled={primaryCtaDisabled}
                accessibilityRole="button"
                accessibilityLabel="Create Trip Now"
              >
                {submitting ? (
                  <ActivityIndicator color={Theme.textOnPrimary} />
                ) : (
                  <>
                    <CheckCircle2 size={18} color={Theme.textOnPrimary} />
                    <Text style={styles.primaryCtaText}>Create Trip Now</Text>
                  </>
                )}
              </Pressable>
              {!enablePrimaryWhenInvalid &&
              !canSubmit &&
              !submitting &&
              validationIssues.length === 0 ? (
                <Text style={styles.ctaHint}>
                  {validationMessage ??
                    "Please fill all mandatory fields to continue"}
                </Text>
              ) : null}
            </View>
          ) : null}
              </View>
              {desktopWizardChrome ? (
                <View style={createTripDesktopStyles.wizardWorkspaceAside}>
                  <CreateTripDesktopAsideArt
                    wizardStep={wizardSection ?? "route"}
                  />
                </View>
              ) : null}
            </View>
          </View>
        </View>
        </View>
      </WizardFormBody>

      <Modal
        visible={notesModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNotesModalOpen(false)}
      >
        <View style={styles.notesModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setNotesModalOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View style={styles.notesModalSheet}>
            <View style={styles.notesModalHeader}>
              <Text style={styles.notesModalTitle}>Trip notes</Text>
              <TouchableOpacity
                onPress={() => setNotesModalOpen(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.notesModalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.label, labelStyle, styles.notesModalHint]}>
              Instructions & cargo details (optional)
            </Text>
            <TextInput
              style={[
                styles.notesModalInput,
                inputStyle,
                outlineErr("notes"),
              ]}
              placeholder="Any specific delivery instructions or cargo details…"
              placeholderTextColor={Theme.placeholder}
              value={state.notes}
              onChangeText={setters.setNotes}
              ref={notesModalInputRef}
              multiline
              textAlignVertical="top"
            />
          </View>
        </View>
      </Modal>

      {!desktopWizardChrome ? (
        <>
          <View style={styles.blobA} pointerEvents="none" />
          <View style={styles.blobB} pointerEvents="none" />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pageWrap: {
    width: "100%",
    backgroundColor: Theme.screenBackground,
  },
  pageWrapFill: {
    flex: 1,
    minHeight: 0,
  },
  pageWrapDesktopWizard: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Theme.cardWhite,
  },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 12,
  },
  scrollContentDense: {
    paddingTop: 6,
  },
  scrollContentWizard: {
    paddingTop: 0,
    paddingBottom: 8,
    flexGrow: 0,
  },
  scrollContentFillBody: {
    flexGrow: 1,
  },
  allocationKeypadBody: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    gap: 8,
  },
  allocationStepBody: {
    width: "100%",
    minHeight: 0,
    gap: 12,
  },
  allocationPickerBody: {
    flexGrow: 1,
    width: "100%",
    minHeight: 0,
    gap: 16,
  },
  allocationFleetStack: {
    width: "100%",
    gap: 20,
  },
  allocationFleetSummary: {
    marginBottom: 2,
  },
  allocationFleetLoading: {
    alignSelf: "center",
    paddingVertical: 16,
  },
  contentMax: {
    width: "100%",
    maxWidth: 1680,
    alignSelf: "center",
  },
  contentMaxFill: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    alignSelf: "stretch",
  },
  mainGrid: {
    width: "100%",
  },
  mainGridFill: {
    flex: 1,
    minHeight: 0,
  },
  formColumn: {
    width: "100%",
    minWidth: 0,
  },
  formColumnFill: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    alignSelf: "stretch",
  },
  /** Desktop web: row1 route|commodity; row2 client; row3 supply; row4 CTA. */
  formColumnGridWeb: Platform.select<ViewStyle>({
    // CSS grid is not in ViewStyle — intentional RN-Web extension
    web: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
      gap: 16,
      alignItems: "stretch",
      gridAutoRows: "min-content",
    } as unknown as ViewStyle,
    default: {},
  }),
  ctaGridSpanWeb: Platform.select<ViewStyle>({
    web: { gridColumn: "1 / -1", gridRow: 4 } as unknown as ViewStyle,
    default: {},
  }),
  /** Desktop grid: route | commodity on row 1. */
  cardGridRouteWeb: Platform.select<ViewStyle>({
    web: { gridColumn: 1, gridRow: 1 } as unknown as ViewStyle,
    default: {},
  }),
  /** Desktop grid: route | commodity & client on row 1 (indent-style). */
  cardGridCommodityClientWeb: Platform.select<ViewStyle>({
    web: { gridColumn: 2, gridRow: 1 } as unknown as ViewStyle,
    default: {},
  }),
  cardGridCommodityWeb: Platform.select<ViewStyle>({
    web: { gridColumn: 2, gridRow: 1 } as unknown as ViewStyle,
    default: {},
  }),
  cardGridClientWeb: Platform.select<ViewStyle>({
    web: { gridColumn: "1 / -1", gridRow: 2 } as unknown as ViewStyle,
    default: {},
  }),
  /** Desktop grid: sale full-width row 2 (indent load-row pattern). */
  cardGridSaleWeb: Platform.select<ViewStyle>({
    web: { gridColumn: "1 / -1", gridRow: 2 } as unknown as ViewStyle,
    default: {},
  }),
  cardGridSupplyWeb: Platform.select<ViewStyle>({
    web: { gridColumn: "1 / -1", gridRow: 3 } as unknown as ViewStyle,
    default: {},
  }),
  scrollContentDesktop: {
    paddingTop: 4,
    width: "100%",
  },
  /** Enterprise desktop cards — matches Create Load. */
  cardDesktopEnterprise: Platform.select<ViewStyle>({
    web: {
      padding: 18,
      borderRadius: 12,
      marginBottom: 0,
      boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
    } as ViewStyle,
    default: {},
  }),
  cardDesktopGrid: {
    marginBottom: 8,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
      } as ViewStyle,
      default: {},
    }),
  },
  /** Equal-height route / commodity cards in desktop grid row. */
  cardDesktopStretch: Platform.select<ViewStyle>({
    web: {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
    } as unknown as ViewStyle,
    default: {},
  }),
  cardHeadDesktop: {
    paddingBottom: 6,
    marginBottom: 8,
  },
  cardHeadDesktopEnterprise: {
    paddingBottom: 10,
    marginBottom: 12,
  },
  cardTitleDesktopEnterprise: {
    fontSize: 11,
    letterSpacing: 0.6,
  },
  gridRowWideDesktop: {
    gap: 16,
  },
  clientCommercialsRowDesktop: Platform.select<ViewStyle>({
    web: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 300px)",
      gap: 20,
      alignItems: "start",
      width: "100%",
    } as unknown as ViewStyle,
    default: {},
  }),
  clientCommercialsClientColDesktop: Platform.select<ViewStyle>({
    web: { gridColumn: 1, minWidth: 0 } as unknown as ViewStyle,
    default: {},
  }),
  clientCommercialsPriceColDesktop: Platform.select<ViewStyle>({
    web: { gridColumn: 2, minWidth: 0 } as unknown as ViewStyle,
    default: {},
  }),
  cardHeadWithTrailingAction: {
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  cardHeadTitleCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  notesQuickBtn: {
    position: "relative",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceForm,
    justifyContent: "center",
    alignItems: "center",
  },
  notesQuickBtnInvalid: {
    borderColor: Theme.destructive,
    borderWidth: 2,
  },
  notesQuickBtnDot: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.iconPrimary,
  },
  notesModalBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
  notesModalSheet: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "82%",
    zIndex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingBottom: 16,
    paddingTop: 4,
    ...Platform.select<ViewStyle>({
      web: {
        boxShadow: "0 16px 48px rgba(15,23,42,0.22)",
      },
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: 12,
      },
    }),
  },
  notesModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    marginBottom: 10,
  },
  notesModalTitle: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 11,
    color: Theme.textPrimaryDark,
    letterSpacing: 0.35,
  },
  notesModalDone: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.iconPrimary,
  },
  notesModalHint: {
    marginBottom: 8,
  },
  notesModalInput: {
    width: "100%",
    minHeight: 120,
    maxHeight: 260,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 11,
    fontWeight: "400",
    fontStyle: "italic",
    ...Platform.select({
      web: {
        outlineStyle: "none",
        boxSizing: "border-box",
      } as object,
      default: {},
    }),
  },
  card: {
    backgroundColor: PULSE_TRIP.cardBg,
    borderRadius: PULSE_TRIP_RADIUS.card,
    borderWidth: 1,
    borderColor: PULSE_TRIP.border,
    padding: 18,
    marginBottom: ADD_TRIP_FORM.cardGap,
    ...Platform.select<ViewStyle>({
      web: {
        boxShadow: "0 4px 15px rgba(79, 70, 229, 0.05)",
      },
      default: {
        shadowColor: PULSE_TRIP.indigo,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
        elevation: 3,
      },
    }),
  },
  cardDense: {
    paddingHorizontal: ADD_TRIP_FORM.cardPad,
    paddingVertical: ADD_TRIP_FORM.cardPad,
    borderRadius: PULSE_TRIP_RADIUS.cardDense,
    marginBottom: ADD_TRIP_FORM.cardGap,
  },
  cardAllocWizardStep: {
    flex: 1,
    minHeight: 0,
    paddingBottom: 0,
    marginBottom: 0,
  },
  cardWizardStep: {
    marginBottom: 0,
    ...fullPageWizardStyles.wizardStepContentFlat,
  },
  cardHeadDense: {
    paddingBottom: 4,
    marginBottom: 6,
    gap: 5,
  },
  cardHeadWizard: {
    width: "100%",
    alignItems: "center",
    gap: 10,
    paddingBottom: 12,
    marginBottom: 14,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_TRIP.border,
    paddingBottom: 10,
    marginBottom: 12,
  },
  stepBadgeWizard: {
    width: 26,
    height: 26,
    borderRadius: 8,
  },
  cardTitleWizard: {
    fontSize: 11,
    lineHeight: 26,
    letterSpacing: 0.85,
    paddingTop: 0,
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: "center" },
      web: { whiteSpace: "nowrap" } as object,
      default: {},
    }),
  },
  routeWizardBody: {
    gap: 0,
    width: "100%",
    flex: 1,
  },
  routeLocationsStack: {
    gap: 12,
    width: "100%",
  },
  routeDateSection: {
    width: "100%",
    marginTop: 14,
    paddingTop: 0,
  },
  routeFieldCol: {
    width: "100%",
    minWidth: 0,
  },
  routeDateBlock: {
    width: "100%",
    marginTop: 2,
  },
  routeDateLabel: {
    marginBottom: 6,
  },
  routeInstructorBanner: {
    width: "100%",
    marginTop: "auto",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "nowrap",
  },
  routeInstructorAnimationWrap: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    flexShrink: 0,
  },
  routeInstructorAnimation: {
    width: 108,
    height: 108,
  },
  routeInstructorCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  routeInstructorTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  routeInstructorTitle: {
    color: Theme.textPrimaryDark,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.25,
    textTransform: "uppercase",
  },
  routeInstructorBody: {
    color: Theme.textSecondary,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "500",
  },
  labelWizard: {
    marginBottom: 4,
    letterSpacing: 0.55,
  },
  inputWizardDense: {
    marginBottom: 0,
  },
  stepBadgeDense: {
    width: 20,
    height: 20,
    borderRadius: 6,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: PULSE_TRIP_RADIUS.badge,
    backgroundColor: PULSE_TRIP.indigo,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#ffffff",
  },
  cardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    letterSpacing: 0.8,
    fontStyle: "normal",
    fontWeight: "900",
    textTransform: "uppercase",
    color: PULSE_TRIP.text,
  },
  cardTitleDense: {
    fontSize: 9,
    letterSpacing: 0.75,
  },
  gridRowDense: { gap: 6 },
  gridRowWizard: {
    flexDirection: "column",
    width: "100%",
    gap: 8,
  },
  wizardClientPickerBlock: {
    width: "100%",
    alignSelf: "stretch",
    gap: 12,
  },
  wizardClientPickerHint: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
  },
  errorText: {
    color: "#D0372B",
  },
  gridColWizardFill: {
    width: "100%",
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  gridRow: { gap: 10 },
  /** Extra gap when driver + vehicle stack vertically so sections don’t feel glued. */
  gridRowFleet: {
    gap: 12,
  },
  gridRowWide: { flexDirection: "row", alignItems: "stretch", gap: 12 },
  gridCol: { flex: 1, minWidth: 0 },
  gridColTonsDesktop: Platform.select<ViewStyle>({
    web: {
      flex: 0,
      flexBasis: 132,
      maxWidth: 148,
      minWidth: 120,
    },
    default: {},
  }),
  gridColFleetStack: {
    flexBasis: "auto",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  gridColFleetVehicle: {
    marginTop: 3,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  /** Driver / vehicle lists fill each grid column on desktop (avoid skinny centered rails). */
  fleetPickColumnWrap: Platform.select<ViewStyle>({
    web: {
      flex: 1,
      width: "100%",
      minWidth: 0,
      alignSelf: "stretch",
    },
    default: {
      width: "100%",
      minWidth: 0,
    },
  }),
  fleetPickColumnInner: {
    width: "100%",
    minWidth: 0,
  },
  aggregateSplit: {
    gap: 10,
  },
  aggregateEnterpriseBody: {
    width: "100%",
    gap: 16,
  },
  aggregateSplitEnterprise: {
    marginTop: 8,
  },
  aggregateCommercialsRowDesktop: Platform.select<ViewStyle>({
    web: {
      display: "grid",
      gridTemplateColumns: "minmax(260px, 300px) minmax(0, 1fr)",
      gap: 20,
      alignItems: "start",
      width: "100%",
    } as unknown as ViewStyle,
    default: {},
  }),
  aggregateCommercialsRowDesktopHidden: Platform.select<ViewStyle>({
    web: { display: "none" } as unknown as ViewStyle,
    default: {},
  }),
  aggregateCommercialsPartnerCol: Platform.select<ViewStyle>({
    web: { minWidth: 0, width: "100%" },
    default: {},
  }),
  aggregateCommercialsRatesOnlyDesktop: Platform.select<ViewStyle>({
    web: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr)",
      gap: 20,
      width: "100%",
    } as unknown as ViewStyle,
    default: {},
  }),
  aggregateCommercialsRatesCol: Platform.select<ViewStyle>({
    web: { minWidth: 0, width: "100%" },
    default: {},
  }),
  aggregateSplitMobileWizard: {
    flexDirection: "column",
    gap: 8,
  },
  allocWizardFieldCol: {
    flexBasis: "auto",
    width: "100%",
    maxWidth: "100%",
  },
  webAggregatePhoneRow: Platform.select<ViewStyle>({
    web: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 16,
      width: "100%",
      minWidth: 0,
    },
    default: {},
  }),
  webAggregatePhoneFieldCol: Platform.select<ViewStyle>({
    web: {
      flex: 0,
      flexBasis: 260,
      maxWidth: 300,
      minWidth: 220,
    },
    default: {},
  }),
  webAggregateRecsCol: Platform.select<ViewStyle>({
    web: {
      flex: 1,
      minWidth: 200,
      maxWidth: 420,
    },
    default: {},
  }),
  aggregateSplitWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  aggregateLeftPane: {
    minWidth: 0,
  },
  aggregateRightPane: {
    minWidth: 0,
  },
  aggregateLeftPaneWide: {
    flex: 0,
    flexBasis: 280,
    maxWidth: 300,
    minWidth: 240,
  },
  aggregateRightPaneWide: {
    flex: 1,
    minWidth: 360,
  },
  /** Only when partner + allocation sit in one row (wide); avoid flex:1 in a column or panes split viewport height. */
  aggregatePaneWide: {
    flex: 1,
  },
  aggregateTrackingFieldsGrid: {
    marginTop: 8,
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    gap: 10,
  },
  aggregateFormBody: {
    width: "100%",
    minWidth: 0,
    gap: 10,
  },
  aggregateFormRow: {
    width: "100%",
    minWidth: 0,
    gap: 12,
  },
  aggregateFormField: {
    width: "100%",
    minWidth: 0,
  },
  aggregateTrackingSection: {
    width: "100%",
    minWidth: 0,
    gap: 12,
    paddingTop: 14,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  aggregatePaneFieldLabel: {
    marginBottom: ADD_TRIP_FORM.labelSpacing,
  },
  aggregatePhoneInput: {
    marginBottom: 0,
  },
  aggregateNameVehicleRow: {
    width: "100%",
    minWidth: 0,
  },
  aggregateSplitSurface: {
    padding: 11,
    marginBottom: 0,
    borderRadius: 14,
    flexGrow: 1,
    alignSelf: "stretch",
    minWidth: 0,
    minHeight: 0,
  },
  /** Wide aggregate: same flush columns as card 02 (no nested assignment shell card). */
  aggregatePaneWideInner: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    alignSelf: "stretch",
    padding: 0,
    marginBottom: 0,
    backgroundColor: "transparent",
  },
  /** Rate row sits directly under label band (wide layout). */
  aggregateRateInputFlush: {
    marginTop: 0,
  },
  /** Wide aggregate: surfaces stretch with the taller pane so partner card can fill vertically. */
  aggregateAssignSurfaceWide: {
    flex: 1,
    minHeight: 0,
    alignSelf: "stretch",
  },
  aggregatePartnerName: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
  },
  aggregatePartnerNameOn: {
    color: Theme.darkGreen,
  },
  aggregatePartnerMeta: {
    fontSize: 10,
    fontWeight: "500",
    fontStyle: "normal",
    color: Theme.textMuted,
    marginTop: 2,
    lineHeight: 14,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  sectionLabelRowStack: {
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  /** Mobile / narrow: label on its own row, full-width add action — avoids overlap with cards. */
  sectionLabelRowFleetStack: {
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: 8,
    marginBottom: 10,
    width: "100%",
  },
  sectionLabelRowDense: {
    marginBottom: 4,
    gap: 6,
  },
  sectionLabelActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 8,
  },
  sectionLabelTight: {
    marginBottom: 0,
  },
  /** Wide desktop: same vertical band for Select client actions vs price label. */
  clientCommercialsHeaderBand: {
    justifyContent: "center",
    minHeight: 32,
    marginBottom: 6,
  },
  /** Inside header band; spacing comes from clientCommercialsHeaderBand. */
  sectionLabelRowFlush: {
    marginBottom: 0,
  },
  changeSelectionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  changeSelectionBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.iconPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  addClientBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  addClientBtnCompact: {
    marginTop: 2,
    alignSelf: "flex-start",
  },
  addClientBtnFleetFullWidth: {
    alignSelf: "stretch",
    width: "100%",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 0,
  },
  addClientBtnText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.iconPrimary,
  },
  changeSelectionPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.tripSelectionInsetBorder,
    backgroundColor: Theme.tripSelectionInsetBg,
  },
  changeSelectionPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: ADD_TRIP_FORM.labelSpacing,
    letterSpacing: 0.6,
    lineHeight: ADD_TRIP_FORM.labelLine,
    textTransform: "uppercase",
    color: PULSE_TRIP.textMuted,
  },
  labelDense: {
    fontSize: ADD_TRIP_FORM.labelSize,
    marginBottom: ADD_TRIP_FORM.labelSpacing,
    letterSpacing: 0.6,
    lineHeight: ADD_TRIP_FORM.labelLine,
    textTransform: "uppercase",
    color: PULSE_TRIP.textMuted,
  },
  input: {
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontSize: 10,
    fontWeight: "400",
    fontStyle: "italic",
    minHeight: 36,
    marginBottom: 6,
    ...Platform.select({ web: { outlineStyle: "none" } as object }),
  },
  inputDense: {
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    paddingHorizontal: ADD_TRIP_FORM.fieldPadH,
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    lineHeight: ADD_TRIP_FORM.fieldLineHeight,
    fontStyle: "normal",
    fontWeight: "500",
    minHeight: ADD_TRIP_FORM.fieldHeight,
    marginBottom: ADD_TRIP_FORM.fieldGap,
    borderWidth: 1,
    borderColor: PULSE_TRIP.border,
    backgroundColor: "#f8fafc",
  },
  /** Align with `clientCard` in aggregate partner pane (card 03). */
  inputMatchSelectionCardDense: {
    minHeight: ADD_TRIP_FORM.fieldHeight,
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    borderWidth: 1,
    paddingHorizontal: ADD_TRIP_FORM.fieldPadH,
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    fontStyle: "normal",
    fontWeight: "500",
  },
  inputMatchSelectionCard: {
    minHeight: 70,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: Theme.textPrimary,
    ...Platform.select({
      web: {
        width: "100%" as const,
        maxWidth: "100%" as const,
        boxSizing: "border-box" as const,
      } as object,
      default: {},
    }),
  },
  inputMatchSelectionCardSelected: {
    borderColor: Theme.darkGreen,
    backgroundColor: Theme.cardWhite,
  },
  mobileWebNoZoomInput: {
    fontSize: 16,
  },
  iconField: {
    position: "relative",
    marginBottom: 8,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select<ViewStyle>({
      web: { width: "100%" as const },
      default: {},
    }),
  },
  iconFieldDense: {
    marginBottom: ADD_TRIP_FORM.fieldGap,
  },
  iconInField: {
    position: "absolute",
    left: 9,
    top: 9,
    zIndex: 1,
  },
  iconInFieldDense: {
    left: 10,
    top: 11,
  },
  iconInputDense: {
    minHeight: ADD_TRIP_FORM.fieldHeight,
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    paddingLeft: 36,
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    lineHeight: ADD_TRIP_FORM.fieldLineHeight,
    fontStyle: "normal",
    fontWeight: "500",
    borderColor: PULSE_TRIP.border,
    backgroundColor: "#f8fafc",
  },
  iconInput: {
    borderRadius: 11,
    paddingLeft: 34,
    paddingRight: 9,
    paddingVertical: 7,
    fontSize: 10,
    fontWeight: "400",
    fontStyle: "normal",
    minHeight: 36,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surfaceForm,
    color: Theme.textPrimary,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
        width: "100%" as const,
        maxWidth: "100%" as const,
        boxSizing: "border-box" as const,
      } as object,
      default: {},
    }),
  },
  iconInputVehicleMono: {
    ...Platform.select<TextStyle>({
      ios: { fontFamily: "Menlo" },
      android: { fontFamily: "monospace" },
      web: {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      default: {},
    }),
  },
  inPhoneOuterDense: {
    minHeight: ADD_TRIP_FORM.fieldHeight,
    borderWidth: 1,
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    marginBottom: ADD_TRIP_FORM.fieldGap,
  },
  inPhoneInputDense: {
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    lineHeight: ADD_TRIP_FORM.fieldLineHeight,
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    fontStyle: "normal",
  },
  inPhoneOuter: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 11,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surfaceForm,
    minHeight: 36,
    paddingLeft: 9,
    paddingRight: 9,
    paddingVertical: 0,
    gap: 5,
    marginBottom: 8,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select<ViewStyle>({
      web: { width: "100%" as const, boxSizing: "border-box" as const },
      default: {},
    }),
  },
  inPhoneFlag: {
    fontSize: 14,
    lineHeight: 18,
  },
  inPhoneCc: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  inPhoneInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 7,
    paddingHorizontal: 2,
    fontSize: 10,
    fontWeight: "400",
    fontStyle: "normal",
    color: Theme.textPrimary,
    ...Platform.select({
      web: {
        outlineStyle: "none",
        width: "100%" as const,
        maxWidth: "100%" as const,
        boxSizing: "border-box" as const,
      } as object,
      default: {},
    }),
  },
  phoneDigitHint: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 4,
    marginBottom: 4,
  },
  fakeInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 2,
    minHeight: 46,
  },
  dateInputTrigger: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quickDateRowDense: {
    gap: 4,
    marginBottom: 4,
  },
  quickDateRowWizard: {
    gap: 8,
    marginTop: 4,
    marginBottom: 10,
  },
  quickDateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  quickDateChipDense: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  quickDateChip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  quickDateChipWizard: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  quickDateChipActive: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.textPrimaryDark,
  },
  quickDateChipPressed: {
    opacity: 0.82,
  },
  quickDateChipTextDense: {
    fontSize: 10,
    fontStyle: "normal",
    letterSpacing: 0.2,
  },
  quickDateChipText: {
    fontSize: 11,
    letterSpacing: 0.3,
    fontWeight: "600",
    color: Theme.textMuted,
    fontStyle: "normal",
  },
  quickDateChipTextWizard: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textRouteCard,
  },
  quickDateChipTextActive: {
    color: Theme.textOnPrimary,
    fontWeight: "700",
  },
  dateTouchable: {
    justifyContent: "center",
  },
  dateTouchableText: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  dateTouchableTextDense: {
    fontSize: 14,
    fontWeight: "500",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
  },
  dateTouchablePlaceholder: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 14,
    color: Theme.placeholder,
  },
  dateTouchablePlaceholderDense: {
    fontSize: 14,
    fontStyle: "normal",
    color: Theme.placeholder,
  },
  datePickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    justifyContent: "flex-end",
  },
  datePickerSheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderColor: Theme.borderLight,
  },
  datePickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  datePickerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  datePickerDone: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.iconPrimary,
  },
  routePreviewPanel: {
    marginTop: 6,
    marginBottom: 12,
    borderRadius: PULSE_TRIP_RADIUS.cardDense,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: PULSE_TRIP.border,
    backgroundColor: PULSE_TRIP.cardBg,
    ...Platform.select<ViewStyle>({
      web: {
        boxShadow: "0 4px 20px rgba(79, 70, 229, 0.06)",
      },
      default: {
        shadowColor: PULSE_TRIP.indigo,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
        elevation: 3,
      },
    }),
  },
  routePreviewPanelDesktop: Platform.select<ViewStyle>({
    web: {
      marginTop: "auto",
      marginBottom: 0,
    } as unknown as ViewStyle,
    default: {},
  }),
  routePreviewHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: PULSE_TRIP.indigoLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_TRIP.border,
  },
  routePreviewHeroText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    fontStyle: "normal",
    lineHeight: 18,
    letterSpacing: 0,
    color: Theme.textPrimaryDark,
  },
  routePreviewMetrics: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Theme.cardWhite,
    borderTopWidth: 0,
  },
  routePreviewMetricCol: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  routePreviewMetricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
  },
  routeMetricLab: {
    ...FinanceTxnTypography.fieldLabel,
    color: Theme.textMutedDemo,
    marginBottom: 3,
  },
  routeMetricVal: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 9,
    lineHeight: 13,
  },
  clientList: { maxHeight: 280 },
  clientListCompact: { maxHeight: undefined },
  mobileListWrap: {
    gap: 10,
    marginBottom: 4,
    width: "100%",
  },
  emptyListCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emptyListText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  clientCardDense: {
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
  },
  clientCardMobile: {
    marginBottom: 0,
  },
  clientCardDisabled: {
    opacity: 0.6,
  },
  busyPill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
    flexShrink: 0,
  },
  busyPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  clientCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 70,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    marginBottom: 10,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  /** Picker list: highlight chosen row (light card). */
  clientCardRowSelected: {
    borderColor: PULSE_TRIP.indigo,
    backgroundColor: PULSE_TRIP.indigoLight,
  },
  /** Minimized selected party — dark chip only after choice. */
  selectionSummaryCard: {
    backgroundColor: Theme.tripSelectionSurface,
    borderColor: Theme.darkGreen,
  },
  selectionSummaryTitle: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textOnDark,
  },
  selectionSummarySub: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
    marginTop: 2,
  },
  selectionSummaryPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.tripSelectionInsetBorder,
    backgroundColor: Theme.tripSelectionInsetBg,
  },
  selectionSummaryPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  clientMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 8,
  },
  /** Wide row beside price: stretch with sales-price shell; revenue hint sits full-width below. */
  clientCardWideBesidePrice: {
    marginBottom: 0,
    alignSelf: "stretch",
    flexGrow: 1,
    minHeight: 72,
  },
  clientName: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  clientNameDense: {
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    fontWeight: "600",
    fontStyle: "normal",
    letterSpacing: 0,
  },
  clientNameOn: { color: Theme.primary },
  clientAvatar: {
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
  },
  clientAvatarOn: {
    borderWidth: 2,
    borderColor: Theme.primary,
  },
  vehicleCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  vehicleCardIconSummary: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Theme.tripSelectionInsetBg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.tripSelectionInsetBorder,
  },
  clientMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  clientSub: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    flex: 1,
  },
  radioOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: Theme.surfaceForm,
  },
  radioOuterOn: {
    borderColor: Theme.darkGreen,
    backgroundColor: Theme.cardWhite,
  },
  /** Card 02: matches `clientCard` height & frame (selection row beside price). */
  priceWrapShellDense: {
    minHeight: ADD_TRIP_FORM.fieldHeight,
    paddingHorizontal: ADD_TRIP_FORM.fieldPadH,
    gap: 8,
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    borderWidth: 1,
    marginBottom: ADD_TRIP_FORM.fieldGap,
  },
  priceInputDense: {
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    lineHeight: ADD_TRIP_FORM.fieldLineHeight,
    fontWeight: "600",
    minHeight: 0,
  },
  priceWrapShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 70,
    paddingHorizontal: 14,
    gap: 10,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    marginBottom: 8,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select({
      web: {
        width: "100%" as const,
        maxWidth: "100%" as const,
        boxSizing: "border-box" as const,
      } as object,
      default: {},
    }),
  },
  /** Wide desktop: sales price grows with client column so bands align above full-width hint. */
  priceWrapShellWideColumn: {
    marginBottom: 0,
    flexGrow: 1,
    minHeight: 72,
  },
  priceWrapShellSelected: {
    borderColor: Theme.darkGreen,
    backgroundColor: Theme.cardWhite,
  },
  priceWrapShellError: {
    borderColor: Theme.destructive,
    borderWidth: 2,
  },
  priceRupeeIcon: {
    flexShrink: 0,
  },
  priceInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 0,
    fontSize: 16,
    fontWeight: "600",
    fontStyle: "normal",
    minHeight: 44,
    backgroundColor: "transparent",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    ...Platform.select({
      web: {
        outlineStyle: "none",
        width: "100%" as const,
        maxWidth: "100%" as const,
        boxSizing: "border-box" as const,
      } as object,
      default: {},
    }),
  },
  infoCalloutDense: {
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    marginTop: 2,
    gap: 6,
  },
  infoCalloutTextDense: {
    fontSize: 11,
    lineHeight: 15,
  },
  infoCallout: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: PULSE_TRIP_RADIUS.input,
    backgroundColor: PULSE_TRIP.indigoLight,
    borderWidth: 1,
    borderColor: "rgba(79, 70, 229, 0.15)",
    alignItems: "flex-start",
  },
  infoCalloutWideSpan: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0, 0, 0, 0.04)",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "flex-start",
    marginTop: 8,
    width: "100%",
    alignSelf: "stretch",
  },
  infoCalloutText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    lineHeight: 14,
  },
  assignLaterPartnerHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  assignLaterPartnerHintText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 17,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: "#07090C",
    borderRadius: 18,
    padding: 5,
    borderWidth: 1,
    borderColor: "#0F1318",
    gap: 5,
  },
  /** Asset | Aggregate pill + Assign later on one row (desktop). */
  supplyModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
    flexWrap: "nowrap",
  },
  supplyModeRowStack: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 12,
    flexWrap: "nowrap",
  },
  segmentWrap: {
    flexShrink: 0,
  },
  segmentWrapCentered: {
    alignSelf: "center",
  },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#131820",
    borderWidth: 1,
    borderColor: "#252C36",
  },
  segmentBtnOn: {
    backgroundColor: "#000000",
    borderColor: "rgba(255,255,255,0.34)",
    ...Platform.select<ViewStyle>({
      web: { boxShadow: "0 8px 20px rgba(0,0,0,0.38)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
        elevation: 3,
      },
    }),
  },
  segmentLab: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.85,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.72)",
  },
  segmentLabOn: { color: Theme.textOnPrimary },
  assignLaterCard: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    flex: 1,
    flexBasis: 0,
    minWidth: 160,
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceForm,
    ...Platform.select({
      web: {
        boxSizing: "border-box" as const,
      },
      default: {},
    }),
  },
  assignLaterCardStacked: {
    flex: 0,
    flexBasis: "auto",
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
  },
  assignLaterMergedWrap: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  assignLaterMergedText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimary,
    lineHeight: 18,
    ...Platform.select({
      web: {
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      } as TextStyle,
      default: {},
    }),
  },
  assignLaterMergedTextDense: {
    fontSize: 11,
    lineHeight: 15,
  },
  assignLaterTitleInline: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  assignLaterSubInline: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 18,
  },
  assignLaterSwitchWrap: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  assignLaterIconCircle: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  assignLaterLockedHintBelow: {
    marginTop: 8,
    paddingHorizontal: 10,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 15,
  },
  assignLaterCardDisabled: {
    opacity: 0.72,
  },
  warningText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.teslaRed,
    marginBottom: 6,
  },
  warnBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Theme.warningMuted,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 12,
  },
  warnBannerText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.warning,
    lineHeight: 16,
  },
  inputErrorOutline: {
    borderWidth: 1,
    borderColor: Theme.destructive,
  },
  fieldGroupRing: {
    borderWidth: 1,
    borderColor: Theme.destructive,
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    padding: 4,
  },
  validationChecklist: {
    width: "100%",
    maxWidth: 960,
    alignSelf: "stretch",
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: "rgba(232, 33, 39, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(232, 33, 39, 0.35)",
  },
  validationChecklistHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  validationChecklistTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  validationChecklistItem: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.destructive,
    lineHeight: 14,
    marginBottom: 3,
  },
  driverConfirmCardError: {
    borderColor: Theme.destructive,
    borderWidth: 2,
    backgroundColor: "rgba(232, 33, 39, 0.06)",
  },
  ctaBlock: {
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 14,
  },
  primaryCta: {
    width: "100%",
    maxWidth: 400,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: PULSE_TRIP.indigo,
    paddingVertical: 16,
    borderRadius: PULSE_TRIP_RADIUS.btn,
    minHeight: 52,
    ...Platform.select<ViewStyle>({
      web: { boxShadow: "0 10px 20px rgba(79, 70, 229, 0.2)" },
      default: {
        shadowColor: PULSE_TRIP.indigo,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
        elevation: 5,
      },
    }),
  },
  primaryCtaDesktop: {
    maxWidth: 320,
    minHeight: 44,
    paddingVertical: 11,
    borderRadius: 11,
    ...Platform.select<ViewStyle>({
      web: { boxShadow: "0 4px 12px rgba(79, 70, 229, 0.18)" },
      default: {},
    }),
  },
  primaryCtaDis: {
    opacity: 0.45,
  },
  primaryCtaText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  ctaHint: {
    marginTop: 12,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  // Decorative brand ambiance. Pinned to the true page corners with fixed
  // off-screen offsets (percentage offsets drifted into the middle of tall
  // phone screens and washed over the field labels / client card).
  blobA: {
    position: "absolute",
    top: -110,
    left: -120,
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: PULSE_TRIP.indigoMuted,
    opacity: 0.6,
    zIndex: -1,
  },
  blobB: {
    position: "absolute",
    bottom: -120,
    right: -120,
    width: 200,
    height: 200,
    borderRadius: 200,
    backgroundColor: "rgba(16, 185, 129, 0.06)",
    zIndex: -1,
  },
  mutedSmall: {
    fontSize: 10,
    color: Theme.textMuted,
    marginBottom: 6,
  },
  driverConfirmCard: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  driverConfirmCardConfirmed: {
    borderWidth: 0,
    borderColor: Theme.driverEmeraldDark,
    backgroundColor: Theme.driverEmeraldDark,
  },
  driverConfirmMain: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
  },
  driverConfirmMainOnDark: {
    color: Theme.textOnPrimary,
    fontWeight: "600",
  },
  driverConfirmSub: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 3,
    lineHeight: 14,
  },
  driverConfirmSubOnDark: {
    color: "rgba(255,255,255,0.88)",
    fontWeight: "500",
  },
});
