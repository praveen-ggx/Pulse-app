/**
 * Stepped assign / reassign-by-phone wizard — same allocation UX as Create Trip
 * and indent deploy (keypad flows, driver recommendations, review step).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
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
import { formatIndianVehicleNumber, formatMobileNumber } from "@/lib/format";
import { getTripDisplayNumber, type TripRow } from "@/features/trips/services/trips.service";

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

  const [driverAction, setDriverAction] = useState<AssignmentPanelAction>("EDIT");
  const [vehicleAction, setVehicleAction] = useState<AssignmentPanelAction>("EDIT");
  const [changeReason, setChangeReason] =
    useState<ChangeReasonCode>("AD_HOC_SUBSTITUTION");
  const [changeRemarks, setChangeRemarks] = useState("");
  const [workspaceToast, setWorkspaceToast] = useState<string | null>(null);

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

  const skipDriverSteps = isReassign && reassignFocus === "vehicle";

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
    enabled:
      visible &&
      !otpReveal &&
      !skipDriverSteps &&
      wizardStep !== "review",
  });

  const tripLabel = getTripDisplayNumber(trip);

  useEffect(() => {
    if (!visible) {
      setWizardStep("driverPhone");
      setReassignFocus("driver");
      setDriverNameManual(false);
      return;
    }
    if (isReassign) {
      // Pre-load current assignment so Edit works immediately.
      editCurrentDriver();
      setDriverAction("EDIT");
      setVehicleAction("EDIT");
    } else {
      setDriverAction("EDIT");
      setVehicleAction("EDIT");
    }
    // Only when opening; editCurrentDriver identity changes often.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isReassign]);

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
    const suggested = lookup.suggestedName;
    if (suggested && !driverName.trim()) {
      onDriverNameChange(suggested);
    }
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
      onDriverPhoneChange(formatMobileNumber(value));
    },
    [onDriverPhoneChange],
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
        Platform.OS === "web" ? "overFullScreen" : presentationStyle
      }
      transparent={Platform.OS === "web" && !fullPageFlow}
      onRequestClose={onClose}
    >
      <View
        style={[
          assignmentShellStyles.webModalBackdrop,
          (fullPageFlow || useAssignmentWorkspace) && {
            flex: 1,
            padding: 0,
            backgroundColor: Theme.assignmentPageBg,
          },
        ]}
      >
        <View
          style={[
            assignmentShellStyles.assignModalWrapSlate,
            (fullPageFlow || useAssignmentWorkspace) && {
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
            {
              flex:
                Platform.OS === "web" && !fullPageFlow && !useAssignmentWorkspace
                  ? 0
                  : 1,
            },
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
                    {isReassign ? "Driver updated" : "Driver assigned"}
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
                fulfillmentMode="MARKET"
                fulfillmentModeEditable={false}
                driverAction={driverAction}
                onDriverActionChange={(action) => {
                  setDriverAction(action);
                  setReassignFocus("driver");
                  if (action === "EDIT") editCurrentDriver();
                }}
                vehicleAction={vehicleAction}
                onVehicleActionChange={(action) => {
                  setVehicleAction(action);
                  setReassignFocus("vehicle");
                  if (action === "EDIT") editCurrentVehicle();
                }}
                driverPanelBody={
                  <View style={{ gap: 12, flex: 1 }}>
                    {windowWidth >= 720 ? (
                      <View style={aws.sectionHintRow}>
                        <Text style={aws.sectionHint}>Active driver record fields</Text>
                        <Text style={aws.kycHint}>KYC verified</Text>
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
                        <Text style={aws.fieldLabel}>Driver full name *</Text>
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
                            Mobile contact no. *
                          </Text>
                          {windowWidth < 720 ? (
                            <Text style={aws.kycHint}>KYC verified</Text>
                          ) : null}
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
                    {lookup.inTrip ? (
                      <Text style={styles.errorText}>
                        This driver is on {lookup.busyTripLabel ?? "another trip"}.
                      </Text>
                    ) : null}
                  </View>
                }
                vehiclePanelBody={
                  <View style={{ gap: 12, flex: 1 }}>
                    {windowWidth >= 720 ? (
                      <View style={aws.sectionHintRow}>
                        <Text style={aws.sectionHint}>Active vehicle record fields</Text>
                        <Text style={aws.kycHintVehicle}>Telemetry linked</Text>
                      </View>
                    ) : null}
                    <View
                      style={[
                        aws.fieldsGrid,
                        windowWidth < 720 && aws.fieldsGridPhone,
                      ]}
                    >
                      <View style={windowWidth < 720 ? aws.fieldPhone : aws.fieldFull}>
                        <View style={aws.sectionHintRow}>
                          <Text style={[aws.fieldLabel, { marginBottom: 0 }]}>
                            Registration no *
                          </Text>
                          {windowWidth < 720 ? (
                            <Text style={aws.kycHintVehicle}>Telemetry linked</Text>
                          ) : null}
                        </View>
                        <View style={{ marginTop: 6 }}>
                          <InputFormatPicker
                            options={INDIAN_VEHICLE_FORMATS}
                            value={plateFormat}
                            onChange={handlePlateFormatChange}
                            testID="trip-assign-plate-format"
                          />
                        </View>
                        <TextInput
                          style={[
                            aws.input,
                            { fontWeight: "800", letterSpacing: 0.6 },
                          ]}
                          value={vehiclePlate}
                          onChangeText={handleVehicleChange}
                          placeholder={
                            plateFormat === "noSeries" ? "e.g. KA 56 6088" : "e.g. TN 18 D 2522"
                          }
                          placeholderTextColor={Theme.textMuted}
                          autoCapitalize="characters"
                        />
                      </View>
                      <View style={windowWidth < 720 ? aws.fieldPhone : aws.fieldFull}>
                        <Text style={aws.fieldLabel}>Vehicle category</Text>
                        <TextInput
                          style={[aws.input, { opacity: 0.85 }]}
                          value=""
                          editable={false}
                          placeholder="From fleet / RC record"
                          placeholderTextColor={Theme.textMuted}
                        />
                      </View>
                    </View>
                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  </View>
                }
                changeReason={changeReason}
                onChangeReasonChange={setChangeReason}
                changeRemarks={changeRemarks}
                onChangeRemarksChange={setChangeRemarks}
                onConfirm={() => {
                  onSubmit();
                  setWorkspaceToast(
                    isReassign
                      ? "Manifest update requested — share OTP with the driver if shown."
                      : "Assignment requested — share OTP with the driver if shown.",
                  );
                  setTimeout(() => setWorkspaceToast(null), 3500);
                }}
                confirmDisabled={
                  !canSubmitAll || saving || lookup.inTrip || lookup.loading
                }
                confirmLoading={saving}
                confirmHint={submitBlockedHint}
                confirmLabel={
                  isReassign
                    ? "Confirm & update manifest"
                    : "Confirm & assign driver"
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
