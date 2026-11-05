/**
 * Stepped assign / reassign-by-phone wizard — same allocation UX as Create Trip
 * and indent deploy (keypad flows, driver recommendations, review step).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { ExistingDriverMatch } from "@/features/drivers/services/drivers.service";
import { Shield } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Layout from "@/constants/Layout";
import {
  isIndianVehiclePlateComplete,
  applyIndianVehicleKeystroke,
  detectIndianVehicleFormat,
  INDIAN_VEHICLE_FORMATS,
  type IndianVehicleFormat,
} from "@/lib/indianVehicleInput.util";
import { InputFormatPicker } from "@/components/indianVehicle/InputFormatPicker";
import { PulseAlertCard } from "@/components/PulseAlertCard";
import Theme from "@/constants/Theme";
import { AddTripWizardProgress } from "@/features/trips/components/add-trip/AddTripWizardProgress";
import { AggregateTrackingMobileStep } from "@/features/trips/components/add-trip/AggregateTrackingMobileStep";
import type { AddTripIssueField } from "@/features/trips/components/add-trip/useAddTripForm";
import { AssignmentFlowFooter } from "@/features/trips/components/assignment/assignmentFlowFooter";
import { AssignmentFlowShell } from "@/features/trips/components/assignment/AssignmentFlowShell";
import {
  TripAssignmentWorkspace,
  type AssignmentPanelAction,
  type ChangeReasonCode,
} from "@/features/trips/components/assignment/TripAssignmentWorkspace";
import { aws } from "@/features/trips/components/assignment/tripAssignmentWorkspace.styles";
import {
  getTripPhoneWizardSteps,
  isTripPhoneWizardStepComplete,
  type ReassignFocus,
  tripPhoneWizardSubtitle,
  type TripPhoneWizardStep,
} from "@/features/trips/components/allocation/tripPhoneAssignmentWizardSteps";
import { TripPhoneReassignContextRail } from "@/features/trips/components/allocation/TripPhoneReassignContextRail";
import { useAggregateDriverPhoneLookup } from "@/features/trips/hooks/useAggregateDriverPhoneLookup";
import { assignmentShellStyles } from "@/features/trips/styles/assignmentShellShared";
import {
  bootstrapAssignmentFleet,
  peekAssignmentFleet,
  type AssignmentFleetSnapshot,
} from "@/features/trips/utils/assignmentFleetBootstrap.util";
import { isSameDriverPhone } from "@/features/trips/utils/reassignChangeDetection.util";
import {
  formatIndianVehicleNumber,
  formatMobileNumber,
  normalizeVehicleNumberForMatch,
} from "@/lib/format";
import { getTripDisplayNumber, type TripRow } from "@/features/trips/services/trips.service";

const LIVE_TRIP_STATUSES = new Set([
  "picked_up",
  "pickup",
  "in_progress",
  "in_transit",
  "dispatched",
  "transit",
  "at_drop",
  "unloading",
  "arrived",
  "at_destination",
]);

function tripDriverIsActive(status: string | null | undefined): boolean {
  return LIVE_TRIP_STATUSES.has(String(status ?? "").toLowerCase());
}

function applyFleetSnapshot(
  snapshot: AssignmentFleetSnapshot | null,
  setters: {
    setFleetVehicleType: (value: string | null) => void;
    setFleetVehicleCapacity: (value: string | null) => void;
    setFleetVehicleMake: (value: string | null) => void;
    setVehicleDriverHint: (value: string | null) => void;
    setVehicleComplianceHint: (value: string | null) => void;
  },
  showVehicleHints: boolean,
) {
  setters.setFleetVehicleType(snapshot?.found ? snapshot.type : null);
  setters.setFleetVehicleCapacity(snapshot?.found ? snapshot.capacity : null);
  setters.setFleetVehicleMake(snapshot?.found ? snapshot.make : null);
  if (!showVehicleHints) return;
  if (!snapshot) {
    setters.setVehicleDriverHint(null);
    setters.setVehicleComplianceHint(null);
    return;
  }
  setters.setVehicleComplianceHint(snapshot.complianceNote);
  setters.setVehicleDriverHint(
    snapshot.linkedDriverName
      ? `This vehicle is already used by ${snapshot.linkedDriverName}${
          snapshot.linkedDriverPhone
            ? ` · ${formatMobileNumber(snapshot.linkedDriverPhone)}`
            : ""
        }.`
      : null,
  );
}

type AssignConfirmFact = { label: string; value: string };

type AssignConfirm = {
  title: string;
  facts: AssignConfirmFact[];
  notes: string[];
  confirmLabel: string;
  onConfirm: () => void;
  alternateLabel?: string;
  onAlternate?: () => void;
};

export type TripPhoneOtpReveal = {
  code: string;
  expires_at: string | null;
};

/** Shown after assign/reassign succeeds without an OTP handoff. */
export type TripPhoneAssignSuccess = {
  driverLabel: string;
  vehicleLabel: string;
};

export type TripPhoneAssignmentWizardProps = {
  visible: boolean;
  onClose: () => void;
  trip: TripRow;
  organizationId: string;
  driverAssignOrgId: string | null;
  isReassign: boolean;
  initialDriverName?: string;
  initialVehicle?: string;
  driverPhone: string;
  onDriverPhoneChange: (value: string) => void;
  driverName: string;
  onDriverNameChange: (value: string) => void;
  vehiclePlate: string;
  onVehiclePlateChange: (value: string) => void;
  /** Own-asset vs third-party choice for a supplier-linked (Aggregate) trip. Omit both to hide the toggle. */
  isOwnAsset?: boolean | null;
  onIsOwnAssetChange?: (value: boolean | null) => void;
  saving: boolean;
  error: string | null;
  onSubmit: () => void;
  otpReveal: TripPhoneOtpReveal | null;
  onOtpDismiss: () => void;
  /** Success panel after assign (no OTP) — Confirm & close. */
  assignSuccess?: TripPhoneAssignSuccess | null;
  onAssignSuccessDismiss?: () => void;
  fullPageFlow?: boolean;
  /** When false, vehicle step can be skipped (optional plate). Default true for aggregate. */
  vehicleRequired?: boolean;
  /** Current assigned driver phone (reassign vehicle-only keeps this). */
  activeDriverPhone?: string | null;
  /** Current assigned driver display name. */
  activeDriverName?: string | null;
  /** Current assigned vehicle plate. */
  activeVehiclePlate?: string | null;
  presentationStyle?: "pageSheet" | "fullScreen";
  /** Manifest Change: driver or vehicle only. */
  initialFocus?: "driver" | "vehicle";
};

export function TripPhoneAssignmentWizard({
  visible,
  onClose,
  trip,
  organizationId,
  driverAssignOrgId,
  isReassign,
  initialDriverName = "",
  initialVehicle = "",
  driverPhone,
  onDriverPhoneChange,
  driverName,
  onDriverNameChange,
  vehiclePlate,
  onVehiclePlateChange,
  isOwnAsset = null,
  onIsOwnAssetChange,
  saving,
  error,
  onSubmit,
  otpReveal,
  onOtpDismiss,
  assignSuccess = null,
  onAssignSuccessDismiss,
  fullPageFlow = false,
  vehicleRequired = true,
  presentationStyle = "pageSheet",
  activeDriverPhone = null,
  activeDriverName = null,
  activeVehiclePlate = null,
  initialFocus = "driver",
}: TripPhoneAssignmentWizardProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const useSteppedWizard =
    fullPageFlow ||
    isReassign ||
    Platform.OS !== "web" ||
    windowWidth < Layout.wizardSteppedMaxWidth;
  const showReassignRail = isReassign && useSteppedWizard;
  const reassignRailDesktop = showReassignRail && windowWidth >= 768;
  /**
   * Manifest workspace for assign + reassign (phone flows).
   * Mobile uses stacked panels via compact styles in TripAssignmentWorkspace.
   */
  const useAssignmentWorkspace = true;

  const [driverAction, setDriverAction] = useState<AssignmentPanelAction>("PREVIEW");
  const [vehicleAction, setVehicleAction] = useState<AssignmentPanelAction>("PREVIEW");
  const [changeReason, setChangeReason] =
    useState<ChangeReasonCode>("AD_HOC_SUBSTITUTION");
  const [changeRemarks, setChangeRemarks] = useState("");
  const [workspaceToast, setWorkspaceToast] = useState<string | null>(null);
  const [workspaceStep, setWorkspaceStep] = useState<"details" | "reason">(
    "details",
  );
  const [assignConfirm, setAssignConfirm] = useState<AssignConfirm | null>(null);
  const [vehicleDriverHint, setVehicleDriverHint] = useState<string | null>(null);
  const [vehicleComplianceHint, setVehicleComplianceHint] = useState<string | null>(null);
  const [fleetVehicleType, setFleetVehicleType] = useState<string | null>(null);
  const [fleetVehicleCapacity, setFleetVehicleCapacity] = useState<string | null>(null);
  const [fleetVehicleMake, setFleetVehicleMake] = useState<string | null>(null);

  const resolvedActiveDriverName = useMemo(
    () => (activeDriverName ?? initialDriverName ?? trip.driver_display_name ?? "").trim(),
    [activeDriverName, initialDriverName, trip.driver_display_name],
  );
  const resolvedActiveDriverPhone = useMemo(
    () => (activeDriverPhone ?? "").trim(),
    [activeDriverPhone],
  );
  const resolvedActiveVehiclePlate = useMemo(
    () =>
      formatIndianVehicleNumber(
        activeVehiclePlate ?? trip.vehicle_display_number ?? initialVehicle ?? "",
      ).trim(),
    [activeVehiclePlate, trip.vehicle_display_number, initialVehicle],
  );

  const existingVehiclePlate = useMemo(
    () =>
      formatIndianVehicleNumber(
        trip.vehicle_display_number ?? initialVehicle ?? "",
      ).trim(),
    [trip.vehicle_display_number, initialVehicle],
  );

  const effectiveVehicleRequired = useMemo(() => {
    if (!vehicleRequired) return false;
    if (
      isReassign &&
      (trip.vehicle_id || isIndianVehiclePlateComplete(existingVehiclePlate))
    ) {
      return false;
    }
    return true;
  }, [
    vehicleRequired,
    isReassign,
    trip.vehicle_id,
    existingVehiclePlate,
  ]);

  const [wizardStep, setWizardStep] = useState<TripPhoneWizardStep>("driverPhone");
  const [reassignFocus, setReassignFocus] = useState<ReassignFocus>("driver");
  const [driverNameManual, setDriverNameManual] = useState(false);
  const [plateFormat, setPlateFormat] = useState<IndianVehicleFormat>(
    () => detectIndianVehicleFormat(vehiclePlate) ?? "standard",
  );

  const skipDriverSteps =
    initialFocus === "vehicle" || (isReassign && reassignFocus === "vehicle");

  const wizardSteps = useMemo(
    () =>
      getTripPhoneWizardSteps({
        isReassign,
        reassignFocus,
        vehicleRequired: effectiveVehicleRequired,
      }),
    [isReassign, reassignFocus, effectiveVehicleRequired],
  );

  const applyCurrentDriverToForm = useCallback(() => {
    if (resolvedActiveDriverPhone) {
      onDriverPhoneChange(formatMobileNumber(resolvedActiveDriverPhone));
    }
    const name = resolvedActiveDriverName.trim();
    if (name && !/^driver$/i.test(name)) {
      setDriverNameManual(false);
      onDriverNameChange(name);
    } else {
      setDriverNameManual(true);
      onDriverNameChange("");
    }
  }, [
    resolvedActiveDriverPhone,
    resolvedActiveDriverName,
    onDriverPhoneChange,
    onDriverNameChange,
  ]);

  const editCurrentDriver = useCallback(() => {
    setReassignFocus("driver");
    setDriverNameManual(false);
    applyCurrentDriverToForm();
    const currentPlate =
      resolvedActiveVehiclePlate || formatIndianVehicleNumber(initialVehicle ?? "");
    setPlateFormat(detectIndianVehicleFormat(currentPlate) ?? "standard");
    onVehiclePlateChange(currentPlate);
    const hasPhone = !!resolvedActiveDriverPhone.trim();
    const nameMissing =
      !resolvedActiveDriverName.trim() ||
      /^driver$/i.test(resolvedActiveDriverName.trim());
    // Name missing but phone exists → jump to name step so they can fix it.
    if (hasPhone && nameMissing) {
      setWizardStep("driverName");
      return;
    }
    setWizardStep(hasPhone ? "driverPhone" : "driverPhone");
  }, [
    applyCurrentDriverToForm,
    resolvedActiveVehiclePlate,
    initialVehicle,
    onVehiclePlateChange,
    resolvedActiveDriverPhone,
    resolvedActiveDriverName,
  ]);

  const editCurrentVehicle = useCallback(() => {
    setReassignFocus("vehicle");
    setDriverNameManual(false);
    applyCurrentDriverToForm();
    const currentPlate =
      resolvedActiveVehiclePlate || formatIndianVehicleNumber(initialVehicle ?? "");
    setPlateFormat(detectIndianVehicleFormat(currentPlate) ?? "standard");
    onVehiclePlateChange(currentPlate);
    setWizardStep("vehicle");
  }, [
    applyCurrentDriverToForm,
    resolvedActiveVehiclePlate,
    initialVehicle,
    onVehiclePlateChange,
  ]);

  const handleReassignFocusChange = useCallback(
    (focus: ReassignFocus) => {
      if (focus === "vehicle") {
        editCurrentVehicle();
        return;
      }
      editCurrentDriver();
    },
    [editCurrentDriver, editCurrentVehicle],
  );

  const lookup = useAggregateDriverPhoneLookup({
    phone: driverPhone,
    tripId: trip.id,
    organizationId,
    driverAssignOrgId,
    currentDriverPhone: resolvedActiveDriverPhone,
    enabled:
      visible &&
      !otpReveal &&
      !skipDriverSteps &&
      wizardStep !== "review",
  });

  const tripLabel = getTripDisplayNumber(trip);
  const driverIsActive = tripDriverIsActive(trip.status);

  useEffect(() => {
    if (!visible) {
      setVehicleDriverHint(null);
      setVehicleComplianceHint(null);
      setFleetVehicleType(null);
      setFleetVehicleCapacity(null);
      setFleetVehicleMake(null);
      return;
    }
    const plate = (
      formatIndianVehicleNumber(vehiclePlate).trim() || resolvedActiveVehiclePlate
    ).trim();
    if (plate.length < 4) {
      setFleetVehicleType(null);
      setFleetVehicleCapacity(null);
      setFleetVehicleMake(null);
      if (initialFocus === "vehicle") {
        setVehicleDriverHint(null);
        setVehicleComplianceHint(null);
      }
      return;
    }
    const setters = {
      setFleetVehicleType,
      setFleetVehicleCapacity,
      setFleetVehicleMake,
      setVehicleDriverHint,
      setVehicleComplianceHint,
    };
    const cached = peekAssignmentFleet(organizationId, null, plate);
    if (cached) {
      applyFleetSnapshot(cached, setters, initialFocus === "vehicle");
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void bootstrapAssignmentFleet({ organizationId, plate }).then((snapshot) => {
        if (cancelled) return;
        applyFleetSnapshot(snapshot, setters, initialFocus === "vehicle");
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    visible,
    initialFocus,
    vehiclePlate,
    resolvedActiveVehiclePlate,
    organizationId,
  ]);

  useEffect(() => {
    if (!visible) {
      setWizardStep("driverPhone");
      setReassignFocus("driver");
      setDriverNameManual(false);
      setWorkspaceStep("details");
      return;
    }
    setReassignFocus(initialFocus);
    setWorkspaceStep("details");
    if (initialFocus === "vehicle") {
      editCurrentVehicle();
      setDriverAction("PREVIEW");
      setVehicleAction("EDIT");
    } else if (isReassign) {
      editCurrentDriver();
      setDriverAction("EDIT");
      setVehicleAction("PREVIEW");
    } else {
      setDriverAction("EDIT");
      setVehicleAction("PREVIEW");
    }
    // Only when opening; editCurrentDriver identity changes often.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isReassign, initialFocus]);

  /** If assigned phone arrives after open (async profile), backfill empty Edit field. */
  useEffect(() => {
    if (!visible || !isReassign) return;
    if (driverPhone.trim()) return;
    if (!resolvedActiveDriverPhone.trim()) return;
    onDriverPhoneChange(formatMobileNumber(resolvedActiveDriverPhone));
  }, [
    visible,
    isReassign,
    resolvedActiveDriverPhone,
    driverPhone,
    onDriverPhoneChange,
  ]);

  useEffect(() => {
    if (!visible || driverNameManual || wizardStep !== "driverName") return;
    const suggested = lookup.suggestedName?.trim();
    if (!suggested) return;
    if (driverName.trim() === suggested) return;
    onDriverNameChange(suggested);
  }, [
    visible,
    driverNameManual,
    wizardStep,
    lookup.suggestedName,
    driverName,
    onDriverNameChange,
  ]);

  const stepValidationState = useMemo(
    () => ({
      driverPhone: skipDriverSteps ? resolvedActiveDriverPhone : driverPhone,
      driverName: skipDriverSteps ? resolvedActiveDriverName : driverName,
      vehiclePlate,
      phoneComplete: skipDriverSteps ? true : lookup.phoneComplete,
      phoneLookupLoading: skipDriverSteps ? false : lookup.loading,
      phoneInTrip: skipDriverSteps ? false : lookup.inTrip,
      phoneMatches: skipDriverSteps ? [] : lookup.matches,
      selectedMatchUserId: skipDriverSteps ? null : lookup.selectedUserId,
      vehicleRequired: effectiveVehicleRequired,
      existingVehiclePlate,
      skipDriverSteps,
    }),
    [
      skipDriverSteps,
      resolvedActiveDriverPhone,
      resolvedActiveDriverName,
      driverPhone,
      driverName,
      vehiclePlate,
      lookup.phoneComplete,
      lookup.loading,
      lookup.inTrip,
      lookup.matches,
      lookup.selectedUserId,
      effectiveVehicleRequired,
      existingVehiclePlate,
    ],
  );

  const canContinue = isTripPhoneWizardStepComplete(wizardStep, stepValidationState);
  const canSubmitAll = isTripPhoneWizardStepComplete("review", stepValidationState);

  const handlePhoneChange = useCallback(
    (value: string) => {
      const next = formatMobileNumber(value);
      const prevLast10 = driverPhone.replace(/\D/g, "").slice(-10);
      const nextLast10 = next.replace(/\D/g, "").slice(-10);
      if (prevLast10 !== nextLast10) {
        setDriverNameManual(false);
      }
      onDriverPhoneChange(next);
    },
    [driverPhone, onDriverPhoneChange],
  );

  const handleVehicleChange = useCallback(
    (value: string) => {
      onVehiclePlateChange(applyIndianVehicleKeystroke(value, plateFormat));
    },
    [onVehiclePlateChange, plateFormat],
  );

  const handlePlateFormatChange = useCallback(
    (next: IndianVehicleFormat) => {
      setPlateFormat(next);
      onVehiclePlateChange(applyIndianVehicleKeystroke(vehiclePlate, next));
    },
    [onVehiclePlateChange, vehiclePlate],
  );

  const handleDriverNameChange = useCallback(
    (value: string) => {
      setDriverNameManual(true);
      onDriverNameChange(value);
    },
    [onDriverNameChange],
  );

  const handleSelectMatch = useCallback(
    (match: ExistingDriverMatch) => {
      lookup.applyMatch(match);
      if (match.full_name?.trim()) {
        setDriverNameManual(false);
        onDriverNameChange(match.full_name.trim());
      }
    },
    [lookup, onDriverNameChange],
  );

  const handleWizardPrimary = useCallback(() => {
    if (reassignFocus === "vehicle") {
      if (wizardStep === "vehicle" && canContinue) {
        setWizardStep("review");
        return;
      }
      if (wizardStep === "review" && canContinue) {
        onSubmit();
      }
      return;
    }

    if (wizardStep === "driverPhone" && canContinue) {
      setWizardStep("driverName");
      return;
    }
    if (wizardStep === "driverName" && canContinue) {
      setWizardStep(effectiveVehicleRequired ? "vehicle" : "review");
      return;
    }
    if (wizardStep === "vehicle" && canContinue) {
      setWizardStep("review");
      return;
    }
    if (wizardStep === "review" && canContinue) {
      onSubmit();
    }
  }, [reassignFocus, wizardStep, canContinue, effectiveVehicleRequired, onSubmit]);

  const handleWizardBack = useCallback(() => {
    if (reassignFocus === "vehicle") {
      if (wizardStep === "review") {
        setWizardStep("vehicle");
        return;
      }
      onClose();
      return;
    }

    if (wizardStep === "driverName") setWizardStep("driverPhone");
    else if (wizardStep === "vehicle") setWizardStep("driverName");
    else if (wizardStep === "review") {
      setWizardStep(effectiveVehicleRequired ? "vehicle" : "driverName");
    } else onClose();
  }, [reassignFocus, wizardStep, effectiveVehicleRequired, onClose]);

  const wizardPrimaryLabel = useMemo(() => {
    if (wizardStep === "review" || !useSteppedWizard) {
      return saving
        ? isReassign
          ? "Confirming…"
          : "Assigning…"
        : isReassign
          ? "Confirm reassign"
          : "Confirm assign";
    }
    return "Continue";
  }, [wizardStep, saving, isReassign, useSteppedWizard]);

  const footerSecondaryLabel = useMemo(() => {
    if (!useSteppedWizard) return "Close";
    if (wizardStep === wizardSteps[0]?.id) return "Close";
    return "Back";
  }, [useSteppedWizard, wizardStep, wizardSteps]);

  const handleFooterSecondary = useCallback(() => {
    if (!useSteppedWizard || wizardStep === wizardSteps[0]?.id) {
      onClose();
      return;
    }
    handleWizardBack();
  }, [useSteppedWizard, wizardStep, wizardSteps, onClose, handleWizardBack]);

  const summaryDriver = useMemo(() => {
    const name = driverName.trim();
    const ph = driverPhone.trim();
    if (name && ph) return `${name} · ${ph}`;
    return name || ph || "—";
  }, [driverName, driverPhone]);

  const summaryVehicle = useMemo(() => {
    const plate =
      formatIndianVehicleNumber(vehiclePlate).trim() || existingVehiclePlate;
    return plate || "—";
  }, [vehiclePlate, existingVehiclePlate]);

  const submitBlockedHint = useMemo((): string | null => {
    if (saving) return null;
    if (lookup.loading) return "Checking driver availability…";
    if (lookup.inTrip) {
      return `This driver is on ${lookup.busyTripLabel ?? "another active trip"} — use another number.`;
    }
    if (lookup.lookupError) return lookup.lookupError;
    if (
      lookup.phoneComplete &&
      lookup.matches.length > 1 &&
      !lookup.selectedUserId
    ) {
      return "Multiple driver profiles found — select one above to continue.";
    }
    if (!canSubmitAll && !useSteppedWizard) {
      if (!lookup.phoneComplete) return "Enter a complete 10-digit mobile number.";
      if (driverName.trim().length < 2) return "Enter the driver name (at least 2 characters).";
      if (effectiveVehicleRequired && !isIndianVehiclePlateComplete(vehiclePlate)) {
        return "Enter the full vehicle number (e.g. TN 18 D 2522 or TN 17 AS 2202).";
      }
    }
    if (useSteppedWizard && !canContinue) {
      if (wizardStep === "driverPhone" && lookup.loading) {
        return "Checking driver availability…";
      }
    }
    return error;
  }, [
    saving,
    lookup.loading,
    lookup.inTrip,
    lookup.busyTripLabel,
    lookup.lookupError,
    lookup.phoneComplete,
    lookup.matches.length,
    lookup.selectedUserId,
    canSubmitAll,
    useSteppedWizard,
    canContinue,
    wizardStep,
    driverName,
    effectiveVehicleRequired,
    vehiclePlate,
    error,
  ]);

  const wizardStepIndex = useMemo(() => {
    const idx = wizardSteps.findIndex((step) => step.id === wizardStep);
    return idx >= 0 ? idx + 1 : 1;
  }, [wizardSteps, wizardStep]);

  const wizardStepTotal = wizardSteps.length;

  const title = isReassign ? "Reassign driver by phone" : "Assign driver by phone";
  const subtitle = otpReveal
    ? `Share with driver for ${tripLabel}`
    : tripPhoneWizardSubtitle(wizardStep, {
        isReassign,
        reassignFocus,
        stepIndex: wizardStepIndex,
        stepTotal: wizardStepTotal,
      });

  const invalidField = useCallback(
    (field: AddTripIssueField) => {
      if (field === "driverPhone") {
        return wizardStep === "driverPhone" && !canContinue && lookup.phoneComplete;
      }
      if (field === "driverName") {
        const n = driverName.trim();
        return (
          wizardStep === "driverName" &&
          n.length > 0 &&
          (n.length < 2 || /^driver$/i.test(n))
        );
      }
      if (field === "vehicleNumber") {
        return (
          wizardStep === "vehicle" &&
          !!vehiclePlate.trim() &&
          !isTripPhoneWizardStepComplete("vehicle", stepValidationState)
        );
      }
      return false;
    },
    [wizardStep, canContinue, lookup.phoneComplete, driverName, vehiclePlate, stepValidationState],
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType={Platform.OS === "web" ? "fade" : "slide"}
      presentationStyle={
        useAssignmentWorkspace
          ? "overFullScreen"
          : Platform.OS === "web"
            ? "overFullScreen"
            : presentationStyle
      }
      transparent={Platform.OS === "web" || useAssignmentWorkspace}
      onRequestClose={onClose}
    >
      <View
        style={[
          assignmentShellStyles.webModalBackdrop,
          useAssignmentWorkspace
            ? {
                flex: 1,
                backgroundColor: Theme.overlayBackdrop,
                justifyContent: windowWidth >= 720 ? "center" : "flex-end",
                alignItems: "center",
                paddingTop: windowWidth >= 720 ? insets.top + 24 : insets.top + 28,
                paddingBottom: windowWidth >= 720 ? insets.bottom + 24 : 0,
                paddingHorizontal: windowWidth >= 720 ? 24 : 0,
              }
            : (fullPageFlow || useAssignmentWorkspace) && {
                flex: 1,
                padding: 0,
                backgroundColor: Theme.assignmentPageBg,
              },
        ]}
      >
        {useAssignmentWorkspace ? (
          <Pressable
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
            onPress={onClose}
            accessibilityLabel="Close"
          />
        ) : null}
        <View
          style={[
            assignmentShellStyles.assignModalWrapSlate,
            useAssignmentWorkspace
              ? {
                  width: "100%",
                  maxWidth: windowWidth >= 720 ? 560 : "100%",
                  maxHeight: "92%",
                  minHeight: 0,
                  flexBasis: "auto",
                  flexGrow: 0,
                  flexShrink: 0,
                  borderRadius: windowWidth >= 720 ? 24 : 0,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  overflow: "hidden",
                  padding: 0,
                  backgroundColor: Theme.assignmentPageBg,
                  ...Platform.select({
                    web: {
                      boxShadow: "0 24px 64px rgba(12, 16, 29, 0.28)",
                    } as object,
                    default: {},
                  }),
                }
              : (fullPageFlow || useAssignmentWorkspace) && {
              flex: 1,
              width: "100%",
              maxWidth: "100%",
              borderRadius: 0,
              maxHeight: "100%",
              padding: 0,
              overflow: "hidden",
              backgroundColor: Theme.assignmentPageBg,
            },
            reassignRailDesktop &&
              !fullPageFlow &&
              !useAssignmentWorkspace &&
              Platform.OS === "web" && { maxWidth: 1320, width: "92%", maxHeight: "92%" },
            !useAssignmentWorkspace
              ? {
                  flex:
                    Platform.OS === "web" && !fullPageFlow && !useAssignmentWorkspace
                      ? 0
                      : 1,
                }
              : null,
          ]}
        >
          {assignSuccess ? (
            <View style={{ flex: 1, paddingTop: insets.top }}>
              <AssignmentFlowShell
                title={isReassign ? "Reassignment complete" : "Assignment complete"}
                subtitle={`Updated ${tripLabel}`}
                onClose={onAssignSuccessDismiss ?? onClose}
                insightPreset="allocation"
                footer={
                  <AssignmentFlowFooter
                    summary={`${assignSuccess.driverLabel} · ${assignSuccess.vehicleLabel}`}
                    secondaryLabel="Close"
                    onSecondaryPress={onAssignSuccessDismiss ?? onClose}
                    primaryLabel="Confirm & close"
                    onPrimaryPress={onAssignSuccessDismiss ?? onClose}
                  />
                }
              >
                <View style={styles.otpCard}>
                  <FontAwesome name="check-circle" size={36} color={Theme.primary} />
                  <Text style={styles.otpTitle}>
                    {initialFocus === "vehicle"
                      ? "Vehicle updated"
                      : isReassign
                        ? "Driver updated"
                        : "Driver assigned"}
                  </Text>
                  <Text style={styles.otpHint}>
                    {assignSuccess.driverLabel}
                    {"\n"}
                    {assignSuccess.vehicleLabel}
                  </Text>
                  <Text style={styles.otpHint}>
                    Changes are saved. Confirm & close to return to the trip.
                  </Text>
                </View>
              </AssignmentFlowShell>
            </View>
          ) : otpReveal ? (
            <View style={{ flex: 1, paddingTop: insets.top }}>
              <AssignmentFlowShell
                title={isReassign ? "Reassignment complete" : "Assignment complete"}
                subtitle={`OTP ready for ${tripLabel} — share with the driver`}
                onClose={onOtpDismiss}
                insightPreset="allocation"
                footer={
                  <AssignmentFlowFooter
                    summary={`${summaryDriver} · ${summaryVehicle}`}
                    secondaryLabel="Close"
                    onSecondaryPress={onOtpDismiss}
                    primaryLabel="Confirm & close"
                    onPrimaryPress={onOtpDismiss}
                  />
                }
              >
                <View style={styles.otpCard}>
                  <FontAwesome name="check-circle" size={36} color={Theme.primary} />
                  <Text style={styles.otpTitle}>Verification code</Text>
                  <Text style={styles.otpCode}>{otpReveal.code}</Text>
                  {otpReveal.expires_at ? (
                    <Text style={styles.otpHint}>
                      Expires {new Date(otpReveal.expires_at).toLocaleString("en-IN")}
                    </Text>
                  ) : null}
                  <Text style={styles.otpHint}>
                    Ask the driver to enter this code in the driver app to claim the trip.
                    You can resend from trip details if needed.
                  </Text>
                </View>
              </AssignmentFlowShell>
            </View>
          ) : useAssignmentWorkspace ? (
              <TripAssignmentWorkspace
                trip={trip}
                organizationId={organizationId}
                driverDisplayName={
                  driverName.trim() || resolvedActiveDriverName || "Driver"
                }
                driverPhoneDisplay={
                  formatMobileNumber(driverPhone).trim() ||
                  resolvedActiveDriverPhone ||
                  null
                }
                vehicleDisplayLabel={
                  formatIndianVehicleNumber(vehiclePlate).trim() ||
                  resolvedActiveVehiclePlate ||
                  "Vehicle"
                }
                vehicleTypeLabel={fleetVehicleType}
                vehicleCapacityLabel={fleetVehicleCapacity}
                vehicleMakeLabel={fleetVehicleMake}
                fulfillmentMode="MARKET"
                fulfillmentModeEditable={false}
                driverAction={driverAction}
                onDriverActionChange={(action) => {
                  setDriverAction(action);
                  if (action !== "PREVIEW") setReassignFocus("driver");
                  if (action === "EDIT") editCurrentDriver();
                }}
                vehicleAction={vehicleAction}
                onVehicleActionChange={(action) => {
                  setVehicleAction(action);
                  if (action !== "PREVIEW") setReassignFocus("vehicle");
                  if (action === "EDIT" || action === "SWAP") editCurrentVehicle();
                }}
                driverPanelBody={
                  <View style={{ gap: 12, flex: 1 }}>
                    {windowWidth >= 720 ? (
                      <View style={aws.sectionHintRow}>
                        <Text style={aws.sectionHint}>Update name or phone</Text>
                      </View>
                    ) : null}
                    <View
                      style={[
                        aws.fieldsGrid,
                        windowWidth < 720 && aws.fieldsGridPhone,
                      ]}
                    >
                      <View
                        style={
                          windowWidth < 720 ? aws.fieldPhone : aws.fieldHalf
                        }
                      >
                        <Text style={aws.fieldLabel}>Name</Text>
                        <TextInput
                          style={aws.input}
                          value={driverName}
                          onChangeText={handleDriverNameChange}
                          placeholder="Enter full name"
                          placeholderTextColor={Theme.textMuted}
                          autoCapitalize="words"
                        />
                      </View>
                      <View
                        style={
                          windowWidth < 720 ? aws.fieldPhone : aws.fieldHalf
                        }
                      >
                        <View style={aws.sectionHintRow}>
                          <Text style={[aws.fieldLabel, { marginBottom: 0 }]}>
                            Phone
                          </Text>
                        </View>
                        <TextInput
                          style={[aws.input, { marginTop: 6 }]}
                          value={driverPhone}
                          onChangeText={handlePhoneChange}
                          placeholder="10-digit mobile number"
                          placeholderTextColor={Theme.textMuted}
                          keyboardType="phone-pad"
                          autoComplete="tel"
                          textContentType="telephoneNumber"
                        />
                      </View>
                    </View>
                    {lookup.matches.length > 1 ? (
                      <View style={{ gap: 8 }}>
                        <Text style={aws.fieldLabel}>Select matching profile</Text>
                        {lookup.matches.map((m: ExistingDriverMatch) => (
                          <TouchableOpacity
                            key={m.user_id}
                            style={[
                              aws.selectLike,
                              lookup.selectedUserId === m.user_id && {
                                borderColor: Theme.networkHubListCardConnectedText,
                              },
                            ]}
                            onPress={() => handleSelectMatch(m)}
                            activeOpacity={0.85}
                          >
                            <Text style={aws.selectLikeText}>
                              {m.full_name ?? "Driver"} · {m.phone ?? ""}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                    {lookup.suggestedName &&
                    lookup.suggestedName.trim().toLowerCase() !==
                      driverName.trim().toLowerCase() ? (
                      <TouchableOpacity
                        onPress={() => onDriverNameChange(lookup.suggestedName ?? "")}
                        accessibilityRole="button"
                        style={aws.dialogSuggest}
                      >
                        <Text style={aws.dialogSuggestText}>
                          This number is already in the app as {lookup.suggestedName}. Use this name.
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    {lookup.inTrip ? (
                      <Text style={styles.errorText}>
                        This driver is on {lookup.busyTripLabel ?? "another trip"}.
                      </Text>
                    ) : null}
                  </View>
                }
                vehiclePanelBody={
                  <View style={{ gap: 8 }}>
                    <Text style={aws.fieldLabel}>Plate</Text>
                    <InputFormatPicker
                      options={INDIAN_VEHICLE_FORMATS}
                      value={plateFormat}
                      onChange={handlePlateFormatChange}
                      testID="trip-assign-plate-format"
                    />
                    <TextInput
                      style={[aws.input, { fontWeight: "800", letterSpacing: 0.6 }]}
                      value={vehiclePlate}
                      onChangeText={handleVehicleChange}
                      placeholder={
                        plateFormat === "noSeries" ? "e.g. KA 56 6088" : "e.g. TN 18 D 2522"
                      }
                      placeholderTextColor={Theme.textMuted}
                      autoCapitalize="characters"
                    />
                    {vehicleDriverHint ? (
                      <Text style={aws.dialogSuggestText}>{vehicleDriverHint}</Text>
                    ) : null}
                    {vehicleComplianceHint ? (
                      <Text style={styles.errorText}>{vehicleComplianceHint}</Text>
                    ) : null}
                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  </View>
                }
                changeReason={changeReason}
                onChangeReasonChange={setChangeReason}
                changeRemarks={changeRemarks}
                onChangeRemarksChange={setChangeRemarks}
                panelScope={initialFocus}
                contained
                directSave
                wizardStep="details"
                onContinue={() => setWorkspaceStep("reason")}
                onWizardBack={() => setWorkspaceStep("details")}
                continueLabel="Continue"
                onConfirm={() => {
                  const runSave = () => {
                    setAssignConfirm(null);
                    onSubmit();
                    setWorkspaceToast(
                      isReassign
                        ? "Manifest update requested — share OTP with the driver if shown."
                        : "Assignment requested — share OTP with the driver if shown.",
                    );
                    setTimeout(() => setWorkspaceToast(null), 3500);
                  };
                  const workingPlate =
                    formatIndianVehicleNumber(vehiclePlate).trim() ||
                    resolvedActiveVehiclePlate ||
                    "the vehicle on this trip";
                  if (initialFocus === "vehicle") {
                    const plate = formatIndianVehicleNumber(vehiclePlate).trim();
                    const current = resolvedActiveVehiclePlate;
                    const plateChanged =
                      normalizeVehicleNumberForMatch(plate) !==
                      normalizeVehicleNumberForMatch(current);
                    const facts: AssignConfirmFact[] = [
                      { label: "On trip", value: current || "Not set" },
                      {
                        label: plateChanged ? "New plate" : "Plate",
                        value: plate || current || "Not set",
                      },
                    ];
                    const notes: string[] = [];
                    if (plateChanged && driverIsActive) {
                      notes.push(
                        "This driver is active. Changing the vehicle can interrupt the work they are doing now.",
                      );
                    }
                    const known = peekAssignmentFleet(organizationId, null, plate);
                    if (known?.found && known.linkedDriverName) {
                      facts.push({ label: "Driver", value: known.linkedDriverName });
                    }
                    if (known?.complianceNote) notes.push(known.complianceNote);
                    const title =
                      plateChanged && driverIsActive
                        ? "Vehicle change may interrupt this trip"
                        : "Change vehicle";
                    setAssignConfirm({
                      title,
                      facts,
                      notes,
                      confirmLabel: "Update vehicle",
                      onConfirm: runSave,
                    });
                    if (!known && plate) {
                      void bootstrapAssignmentFleet({
                        organizationId,
                        plate,
                      }).then((snapshot) => {
                        if (!snapshot) return;
                        setAssignConfirm((currentConfirm) => {
                          if (!currentConfirm || currentConfirm.title !== title) {
                            return currentConfirm;
                          }
                          const nextFacts = facts.filter((fact) => fact.label !== "Driver");
                          if (snapshot.linkedDriverName) {
                            nextFacts.push({
                              label: "Driver",
                              value: snapshot.linkedDriverName,
                            });
                          }
                          const nextNotes = notes.filter(
                            (note) => note !== snapshot.complianceNote,
                          );
                          if (snapshot.complianceNote) nextNotes.push(snapshot.complianceNote);
                          return { ...currentConfirm, facts: nextFacts, notes: nextNotes };
                        });
                      });
                    }
                    return;
                  }
                  const name = driverName.trim() || "This driver";
                  const phone = formatMobileNumber(driverPhone).trim();
                  const suggested = lookup.suggestedName?.trim() || "";
                  if (lookup.inTrip) {
                    const other = lookup.busyTripLabel ?? "another trip";
                    setAssignConfirm({
                      title: "Driver already on a trip",
                      facts: [
                        { label: "Vehicle", value: workingPlate },
                        { label: "Driver", value: name },
                        { label: "Still on", value: other },
                      ],
                      notes: [`${tripLabel} updates after that trip is changed.`],
                      confirmLabel: "OK",
                      onConfirm: () => setAssignConfirm(null),
                    });
                    return;
                  }
                  const alreadyOnThisTrip = isSameDriverPhone(
                    driverPhone,
                    resolvedActiveDriverPhone,
                  );
                  const currentName = resolvedActiveDriverName.trim();
                  const nameChanged =
                    name.toLowerCase() !== currentName.toLowerCase();
                  const nameOnly = alreadyOnThisTrip && nameChanged;
                  const facts: AssignConfirmFact[] = [
                    { label: "Vehicle", value: workingPlate },
                    { label: "Trip", value: tripLabel },
                    { label: "Name", value: name },
                  ];
                  if (phone) facts.push({ label: "Phone", value: phone });
                  const notes: string[] = [];
                  if (suggested && !alreadyOnThisTrip) {
                    notes.push(`This number is already in the app as ${suggested}.`);
                  }
                  if (nameOnly) {
                    notes.push(
                      "Only the name changes. This phone stays on the trip, so the person working it is not interrupted.",
                    );
                  } else if (alreadyOnThisTrip) {
                    notes.push(
                      "This phone already belongs to the driver on the trip. Operations stay with them. The vehicle stays.",
                    );
                  } else {
                    notes.push(
                      "A different phone moves this trip to another person. The vehicle stays.",
                    );
                    if (driverIsActive) {
                      notes.push(
                        "The driver working this trip now can be interrupted.",
                      );
                    }
                  }
                  const useSuggested =
                    suggested.length > 1 &&
                    suggested.toLowerCase() !== name.toLowerCase();
                  setAssignConfirm({
                    title: nameOnly
                      ? "Update the name"
                      : !alreadyOnThisTrip
                        ? "This phone assigns a different driver"
                        : "Update this driver",
                    facts,
                    notes,
                    confirmLabel: nameOnly
                      ? "Update name"
                      : alreadyOnThisTrip
                        ? "Update driver"
                        : "Change driver",
                    onConfirm: runSave,
                    alternateLabel: useSuggested ? `Use ${suggested}` : undefined,
                    onAlternate: useSuggested
                      ? () => {
                          onDriverNameChange(suggested);
                          runSave();
                        }
                      : undefined,
                  });
                }}
                confirmDisabled={
                  workspaceStep === "details"
                    ? initialFocus === "vehicle"
                      ? !isTripPhoneWizardStepComplete("vehicle", stepValidationState) ||
                        saving
                      : !isTripPhoneWizardStepComplete("driverPhone", {
                          ...stepValidationState,
                          phoneInTrip: false,
                        }) ||
                        !isTripPhoneWizardStepComplete("driverName", stepValidationState) ||
                        saving ||
                        (lookup.loading &&
                          !isSameDriverPhone(driverPhone, resolvedActiveDriverPhone))
                    : !canSubmitAll || saving || lookup.loading
                }
                confirmLoading={saving}
                confirmHint={
                  workspaceStep === "reason"
                    ? "Check the preview, pick a reason, then save."
                    : submitBlockedHint
                }
                confirmLabel={
                  initialFocus === "vehicle" ? "Change vehicle" : "Change driver"
                }
                onClose={onClose}
                toastMessage={workspaceToast}
              />
          ) : (
            <AssignmentFlowShell
              title={title}
              subtitle={subtitle}
              onClose={onClose}
              onBack={useSteppedWizard ? handleWizardBack : undefined}
              showBack={useSteppedWizard && wizardStep !== wizardSteps[0]?.id}
              submitting={saving}
              fillBody={useSteppedWizard}
              scrollBody={!useSteppedWizard}
              steppedLayout={useSteppedWizard}
              stepIndex={useSteppedWizard ? wizardStepIndex : undefined}
              stepTotal={useSteppedWizard ? wizardStepTotal : undefined}
              insightPreset="allocation"
              progress={
                useSteppedWizard ? (
                  <AddTripWizardProgress
                    steps={wizardSteps}
                    currentStepId={wizardStep}
                  />
                ) : undefined
              }
              footer={
                <AssignmentFlowFooter
                  summary={
                    wizardStep === "review" || !useSteppedWizard
                      ? `${summaryDriver} · ${summaryVehicle}`
                      : undefined
                  }
                  secondaryLabel={footerSecondaryLabel}
                  onSecondaryPress={handleFooterSecondary}
                  primaryLabel={wizardPrimaryLabel}
                  onPrimaryPress={
                    useSteppedWizard ? handleWizardPrimary : () => onSubmit()
                  }
                  primaryDisabled={
                    useSteppedWizard
                      ? !canContinue ||
                        saving ||
                        lookup.inTrip ||
                        (wizardStep !== "review" && lookup.loading)
                      : !canSubmitAll || saving || lookup.inTrip || lookup.loading
                  }
                  loading={saving}
                  hint={submitBlockedHint}
                />
              }
            >
              {useSteppedWizard ? (
                <View
                  style={
                    // `styles` is a plain object literal (not StyleSheet.create),
                    // so string-literal props widen to `string`; narrow to ViewStyle.
                    (reassignRailDesktop
                      ? styles.reassignDesktopRow
                      : styles.reassignMobileColumn) as ViewStyle
                  }
                >
                  {showReassignRail ? (
                    <View
                      style={
                        (reassignRailDesktop
                          ? styles.reassignRailColumn
                          : styles.reassignMobileRail) as ViewStyle
                      }
                    >
                      <TripPhoneReassignContextRail
                        tripLabel={tripLabel}
                        driverName={resolvedActiveDriverName}
                        driverPhone={resolvedActiveDriverPhone || null}
                        vehiclePlate={resolvedActiveVehiclePlate}
                        focus={reassignFocus}
                        onFocusChange={handleReassignFocusChange}
                        onEditCurrentDriver={editCurrentDriver}
                        onEditCurrentVehicle={editCurrentVehicle}
                        layout={reassignRailDesktop ? "rail" : "row"}
                        incomingDriverName={
                          skipDriverSteps ? resolvedActiveDriverName : driverName
                        }
                        incomingDriverPhone={
                          skipDriverSteps ? resolvedActiveDriverPhone : driverPhone
                        }
                        incomingVehiclePlate={
                          formatIndianVehicleNumber(vehiclePlate).trim() ||
                          resolvedActiveVehiclePlate
                        }
                      />
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.reassignStepMain,
                      !reassignRailDesktop && showReassignRail
                        ? styles.reassignStepMainMobile
                        : null,
                      reassignRailDesktop && styles.reassignStepMainDesktop,
                    ]}
                  >
                  {wizardStep === "driverPhone" ||
                  wizardStep === "driverName" ||
                  wizardStep === "vehicle" ? (
                    <AggregateTrackingMobileStep
                      step={wizardStep}
                      driverName={driverName}
                      onDriverNameChange={handleDriverNameChange}
                      driverPhone={driverPhone}
                      onDriverPhoneChange={handlePhoneChange}
                      vehicleText={vehiclePlate}
                      onVehicleTextChange={handleVehicleChange}
                      isOwnAsset={isOwnAsset}
                      onIsOwnAssetChange={onIsOwnAssetChange}
                      invalid={invalidField}
                      driverPhoneMatches={lookup.matches}
                      driverPhoneLookupLoading={lookup.loading}
                      selectedDriverMatchId={lookup.selectedUserId}
                      onSelectDriverMatch={handleSelectMatch}
                      driverPhoneInTrip={lookup.inTrip}
                      driverNameFromPlatform={lookup.suggestedName}
                      testIDPrefix="trip-phone-wizard"
                    />
                  ) : null}

                  {wizardStep === "review" ? (
                    <View style={styles.reviewStack}>
                      <Text style={styles.reviewSectionLabel}>Review assignment</Text>
                      <View
                        style={[
                          assignmentShellStyles.tripAssignSurfaceCard,
                          styles.reviewCard,
                        ]}
                      >
                        <View style={styles.reviewRow}>
                          <Text style={styles.reviewLabel}>Driver</Text>
                          <Text style={styles.reviewValue} numberOfLines={2}>
                            {summaryDriver}
                          </Text>
                        </View>
                        <View style={styles.reviewRow}>
                          <Text style={styles.reviewLabel}>Vehicle</Text>
                          <Text style={styles.reviewValue} numberOfLines={2}>
                            {summaryVehicle}
                          </Text>
                        </View>
                        <View style={styles.reviewRow}>
                          <Text style={styles.reviewLabel}>Trip</Text>
                          <Text style={styles.reviewValue}>{tripLabel}</Text>
                        </View>
                      </View>

                      <View style={styles.secureCard}>
                        <View style={styles.secureIcon}>
                          <Shield size={18} color={Theme.iconPrimary} />
                        </View>
                        <View style={styles.secureBody}>
                          <Text style={styles.secureTitle}>Secure assignment</Text>
                          <Text style={styles.secureText}>
                            Assigning by phone uses OTP verification. Share the code with
                            the driver after you {isReassign ? "reassign" : "assign"} them.
                          </Text>
                        </View>
                      </View>

                      {error ? <Text style={styles.errorText}>{error}</Text> : null}
                    </View>
                  ) : null}

                  {wizardStep !== "review" && error ? (
                    <Text style={styles.errorText}>{error}</Text>
                  ) : null}
                  </View>
                </View>
              ) : (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.desktopScroll}
                >
                  <AggregateTrackingMobileStep
                    step="driverPhone"
                    driverName={driverName || initialDriverName}
                    onDriverNameChange={handleDriverNameChange}
                    driverPhone={driverPhone}
                    onDriverPhoneChange={handlePhoneChange}
                    vehicleText={vehiclePlate || initialVehicle}
                    onVehicleTextChange={handleVehicleChange}
                    invalid={invalidField}
                    driverPhoneMatches={lookup.matches}
                    driverPhoneLookupLoading={lookup.loading}
                    selectedDriverMatchId={lookup.selectedUserId}
                    onSelectDriverMatch={handleSelectMatch}
                    driverPhoneInTrip={lookup.inTrip}
                    driverNameFromPlatform={lookup.suggestedName}
                    testIDPrefix="trip-phone-wizard"
                  />
                  <View style={{ height: 12 }} />
                  <AggregateTrackingMobileStep
                    step="driverName"
                    driverName={driverName || initialDriverName}
                    onDriverNameChange={handleDriverNameChange}
                    driverPhone={driverPhone}
                    onDriverPhoneChange={handlePhoneChange}
                    vehicleText={vehiclePlate || initialVehicle}
                    onVehicleTextChange={handleVehicleChange}
                    invalid={invalidField}
                    driverPhoneMatches={lookup.matches}
                    selectedDriverMatchId={lookup.selectedUserId}
                    onSelectDriverMatch={handleSelectMatch}
                    testIDPrefix="trip-phone-wizard"
                  />
                  <View style={{ height: 12 }} />
                  <AggregateTrackingMobileStep
                    step="vehicle"
                    driverName={driverName}
                    onDriverNameChange={handleDriverNameChange}
                    driverPhone={driverPhone}
                    onDriverPhoneChange={handlePhoneChange}
                    vehicleText={vehiclePlate || initialVehicle}
                    onVehicleTextChange={handleVehicleChange}
                    isOwnAsset={isOwnAsset}
                    onIsOwnAssetChange={onIsOwnAssetChange}
                    invalid={invalidField}
                    testIDPrefix="trip-phone-wizard"
                  />

                  <View style={styles.secureCard}>
                    <View style={styles.secureIcon}>
                      <Shield size={18} color={Theme.iconPrimary} />
                    </View>
                    <View style={styles.secureBody}>
                      <Text style={styles.secureTitle}>Secure assignment</Text>
                      <Text style={styles.secureText}>
                        Assigning by phone uses OTP verification. Share the code with the
                        driver after you {isReassign ? "reassign" : "assign"} them.
                      </Text>
                    </View>
                  </View>

                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                </ScrollView>
              )}
            </AssignmentFlowShell>
          )}
        </View>
        {assignConfirm ? (
          <View style={aws.dialogConfirmScrim}>
            <PulseAlertCard
              title={assignConfirm.title}
              tone={
                /interrupt|already|different/i.test(assignConfirm.title)
                  ? "warning"
                  : "neutral"
              }
              facts={assignConfirm.facts}
              notes={assignConfirm.notes}
              primaryLabel={assignConfirm.confirmLabel}
              onPrimary={assignConfirm.onConfirm}
              alternateLabel={assignConfirm.alternateLabel}
              onAlternate={assignConfirm.onAlternate}
              secondaryLabel={assignConfirm.confirmLabel === "OK" ? undefined : "Cancel"}
              onSecondary={
                assignConfirm.confirmLabel === "OK"
                  ? undefined
                  : () => setAssignConfirm(null)
              }
            />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = {
  reviewStack: {
    gap: 12,
    flex: 1,
    minHeight: 0,
  },
  reviewSectionLabel: {
    fontSize: 10,
    fontWeight: "800" as const,
    letterSpacing: 0.55,
    color: Theme.textMuted,
    textTransform: "uppercase" as const,
  },
  reviewCard: {
    marginBottom: 0,
  },
  reviewRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  reviewLabel: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: Theme.textMuted,
    flexShrink: 0,
  },
  reviewValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700" as const,
    color: Theme.textPrimaryDark,
    textAlign: "right" as const,
  },
  secureCard: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  secureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  secureBody: {
    flex: 1,
    minWidth: 0,
  },
  secureTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  secureText: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Theme.destructive,
    marginTop: 8,
  },
  desktopScroll: {
    paddingBottom: 16,
    gap: 4,
  },
  otpCard: {
    alignItems: "center" as const,
    padding: 24,
    gap: 8,
  },
  otpTitle: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: Theme.textPrimaryDark,
    marginTop: 8,
  },
  otpCode: {
    fontSize: 32,
    fontWeight: "800" as const,
    letterSpacing: 4,
    color: Theme.textPrimaryDark,
    marginVertical: 8,
  },
  otpHint: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: Theme.textSecondary,
    textAlign: "center" as const,
    lineHeight: 18,
  },
  otpDoneBtn: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: Theme.primary,
  },
  otpDoneText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Theme.textOnPrimary,
  },
  reassignDesktopRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row" as const,
    alignItems: "stretch",
    gap: 0,
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  reassignRailColumn: {
    width: 320,
    maxWidth: 360,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: Theme.borderLight,
    paddingRight: 24,
    marginRight: 24,
    paddingTop: 4,
    minHeight: 0,
  },
  reassignMobileColumn: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    gap: 8,
  },
  reassignMobileRail: {
    flexShrink: 0,
    width: "100%",
  },
  reassignStepMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    gap: 12,
  },
  reassignStepMainMobile: {
    gap: 6,
    flexGrow: 1,
    flexShrink: 1,
  },
  reassignStepMainDesktop: {
    paddingTop: 4,
    justifyContent: "flex-start" as const,
    alignSelf: "stretch" as const,
  },
};
