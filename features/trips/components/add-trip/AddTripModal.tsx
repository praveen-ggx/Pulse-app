/**
 * Add Trip — main modal: composes layout, form fields, and hooks.
 * Thin container; logic lives in useAddTripForm and useClientsForTrip.
 * Waits for onComplete (e.g. createTrip) to finish before closing so lists refetch with new data.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { WIZARD_FULL_PAGE_STEPPED } from "@/lib/wizardLayout.util";
import Layout from "@/constants/Layout";
import {
  Alert,
  Platform,
  View,
  useWindowDimensions,
} from "react-native";
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import { showAppAlert } from "@/lib/appAlert";
import {
  canUseAggregateSupply,
  canUseAssetSupply,
} from "@/lib/capabilities";
import { useCapabilities } from "@/lib/useCapabilities";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { AddTripFormFields } from "./AddTripFormFields";
import { AddTripModalLayout } from "./AddTripModalLayout";
import { CreateTripDesktopStepper } from "./CreateTripDesktopStepper";
import { CreateTripDesktopWizard } from "./CreateTripDesktopWizard";
import type {
  AddTripCompleteOptions,
  AddTripCompleteResult,
  AddTripFormState,
  AddTripModalProps,
  AddTripOtpScreenContext,
} from "./types";
import { buildAddTripPrefillFromIndent } from "./prefillFromIndent.util";
import {
  addTripWizardStepFields,
  addTripWizardStepLabel,
  addTripWizardStepShortLabel,
  addTripWizardStepSubtitle,
  computeClientStepIssues,
  inferredMarketFulfillment,
  isIndentShareStep,
  marketPartnerStepFields,
  resolveUnifiedCreateSteps,
  sourceStepFields,
  wizardStepAfter,
  wizardStepBefore,
  type AddTripWizardStep,
} from "./addTripWizardSteps";
import { buildIndentPayloadFromAddTripState } from "./buildIndentPayloadFromAddTrip";
import { computeCommodityStepIssues, useAddTripForm } from "./useAddTripForm";
import { useClientsForTrip } from "./useClientsForTrip";
import {
  allocationSubStepFields,
  allocationSubStepLabel,
  desktopAllocationStepFields,
  getAllocationSubSteps,
  type AllocationSubStep,
} from "./allocationWizardSteps";
import { regenerateTripOtp } from "@/features/trips/services/tripOtp.service";
import {
  acquireSubmitLock,
  releaseSubmitLock,
  shouldSkipLockedSubmit,
} from "@/features/indents/utils/indentShareSubmitGuard.util";
import { AddTripOtpSuccessBody } from "./AddTripOtpSuccessBody";
import { tonsOutsideVehicleRange } from "@/features/vehicles/utils/vehicleTypeCatalog.model";

const DRIVER_BUSY_ALERT_LOTTIE = require("@/assets/Animated folder/person-driving-car.json");
function buildOtpScreenContext(state: AddTripFormState): AddTripOtpScreenContext {
  const phoneResolved =
    state.driverPhoneConfirmed && state.driverPhoneName?.trim()
      ? state.driverPhoneName.trim()
      : "";
  const entered = state.aggregateDriverName.trim();
  const driverName = entered || phoneResolved || undefined;
  const routeLineParts: string[] = [];
  if (state.routeDistanceKm != null && Number.isFinite(state.routeDistanceKm)) {
    routeLineParts.push(`${state.routeDistanceKm} km`);
  }
  if (state.routeEtaLabel?.trim()) routeLineParts.push(state.routeEtaLabel.trim());
  const phoneDigits = state.driverPhone.replace(/\D/g, "").slice(-10);
  return {
    driverName,
    driverPhone: phoneDigits.length === 10 ? `+91 ${phoneDigits}` : undefined,
    vehicleNumber: state.aggregateVehicleText.trim() || undefined,
    pickupArea: state.pickupArea.trim(),
    dropLocation: state.dropLocation.trim(),
    clientName: state.clientName.trim() || undefined,
    tons: state.tons.trim() || undefined,
    supplierDisplayName: state.supplierDisplayName.trim() || undefined,
    routeLine: routeLineParts.length ? routeLineParts.join(" · ") : undefined,
  };
}

type WizardStep = AddTripWizardStep;

export function AddTripModal({
  organizationId,
  sourceIndent,
  onClose,
  onComplete,
  onShareIndent,
}: AddTripModalProps) {
  const { width: winW } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isDesktopWizard =
    isWeb && WIZARD_FULL_PAGE_STEPPED && winW >= Layout.wizardDesktopGridMinWidth;
  /** Desktop + mobile: shared enterprise step UI (CreateTripDesktopWizard). */
  const wizardEnabled = WIZARD_FULL_PAGE_STEPPED;
  const useEnterpriseSteps = wizardEnabled;
  /** Legacy tablet-only allocation sub-steps — superseded by full stepped wizard. */
  const webAllocSubSteps = false;
  const capabilities = useCapabilities();
  const { can: canSurface } = useMemberAccess();
  const canAsset =
    canUseAssetSupply(capabilities) && canSurface("tripops.trips.create_asset");
  const canAggregate =
    canUseAggregateSupply(capabilities) &&
    canSurface("tripops.trips.create_aggregate");
  const canCreateIndent = canSurface("tripops.indents.create");
  const allowedSupplyModes = useMemo(() => {
    const modes: ("asset" | "aggregate")[] = [];
    if (canAsset) modes.push("asset");
    if (canAggregate || canCreateIndent) modes.push("aggregate");
    return modes.length > 0 ? modes : (["asset", "aggregate"] as const);
  }, [canAsset, canAggregate, canCreateIndent]);
  const unifiedPermissions = useMemo(
    () => ({
      canAsset,
      canAggregate,
      canIndent: canCreateIndent && Boolean(onShareIndent),
    }),
    [canAsset, canAggregate, canCreateIndent, onShareIndent],
  );
  const initialSupplySource =
    canAsset && !(canAggregate || canCreateIndent)
      ? "asset"
      : !canAsset && (canAggregate || canCreateIndent)
        ? "aggregate"
        : "asset";
  const form = useAddTripForm({ initialSupplySource });
  const submitLockRef = useRef(false);
  const indentCreatedRef = useRef(false);
  const wizardSteps = useMemo(
    () => resolveUnifiedCreateSteps(form.state, unifiedPermissions),
    [
      form.state.supplySource,
      form.state.marketFulfillment,
      unifiedPermissions,
    ],
  );

  useEffect(() => {
    const inferred = inferredMarketFulfillment(
      unifiedPermissions,
      form.state.supplySource,
    );
    if (!inferred) return;
    if (form.state.marketFulfillment === inferred) return;
    form.setters.setMarketFulfillment(inferred);
  }, [
    unifiedPermissions,
    form.state.supplySource,
    form.state.marketFulfillment,
    form.setters,
  ]);

  const [wizardStep, setWizardStep] = useState<WizardStep>("client");
  const [allocationSubStep, setAllocationSubStep] =
    useState<AllocationSubStep>("supply");
  const [laneGateActive, setLaneGateActive] = useState(false);
  const [contractLaneLocked, setContractLaneLocked] = useState(false);
  const allocationFlowActive =
    (wizardEnabled && wizardStep === "allocation") || webAllocSubSteps;
  /** Hide field errors until the user tries to continue / create (avoids red UI on empty open). */
  const [validationAttempted, setValidationAttempted] = useState(false);
  /**
   * Each step gets its own clean slate: the flag is set by a continue/create
   * attempt, so without this a single attempt on any step leaves every later
   * step opening pre-reddened on fields the user has not reached yet.
   */
  useEffect(() => {
    setValidationAttempted(false);
  }, [wizardStep, allocationSubStep]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<AddTripCompleteResult | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [driverBusyAlertVisible, setDriverBusyAlertVisible] = useState(false);
  const {
    clients,
    loading: clientsLoading,
    refetch: refetchClients,
  } = useClientsForTrip(organizationId);

  useEffect(() => {
    if (!wizardEnabled) return;
    setWizardStep("client");
    setAllocationSubStep("supply");
    setLaneGateActive(false);
  }, [wizardEnabled, organizationId]);

  useEffect(() => {
    if (wizardSteps.includes(wizardStep)) return;
    setWizardStep(wizardSteps.includes("source") ? "source" : "client");
  }, [wizardSteps, wizardStep]);

  useEffect(() => {
    if (form.canSubmit) setSubmitError(null);
  }, [form.canSubmit]);

  useEffect(() => {
    if (!sourceIndent) return;
    form.setters.applyPrefill(buildAddTripPrefillFromIndent(sourceIndent));
  }, [sourceIndent?.id]);

  const allocationSteps = useMemo(
    () => getAllocationSubSteps(form.state),
    [form.state.supplySource, form.state.assignLater],
  );

  useEffect(() => {
    if (!allocationFlowActive) return;
    if (wizardEnabled && wizardStep !== "allocation") return;
    setAllocationSubStep((prev) =>
      allocationSteps.includes(prev) ? prev : allocationSteps[0] ?? "supply",
    );
  }, [allocationFlowActive, wizardEnabled, wizardStep, allocationSteps]);

  /** Mobile enterprise: allocation sub-steps match indent deploy (keypads / roster). */
  const mobileAllocationStepped =
    useEnterpriseSteps &&
    !isDesktopWizard &&
    wizardStep === "allocation" &&
    !form.state.assignLater;
  const mobileAggregateFleetKeypads =
    mobileAllocationStepped && form.state.supplySource === "aggregate";
  const mobileAssetFleetSteps =
    mobileAllocationStepped && form.state.supplySource === "asset";

  const stepFieldSet = useMemo(() => {
    if (wizardEnabled) {
      if (wizardStep === "source") {
        return sourceStepFields(form.state);
      }
      if (wizardStep === "market_partner") {
        return marketPartnerStepFields(form.state);
      }
      if (wizardStep === "allocation") {
        if (useEnterpriseSteps && mobileAggregateFleetKeypads) {
          return allocationSubStepFields(allocationSubStep, form.state);
        }
        if (useEnterpriseSteps && mobileAssetFleetSteps) {
          return allocationSubStepFields(allocationSubStep, form.state);
        }
        if (useEnterpriseSteps) {
          return desktopAllocationStepFields(form.state);
        }
        return allocationSubStepFields(allocationSubStep, form.state);
      }
      return addTripWizardStepFields(wizardStep);
    }
    if (webAllocSubSteps) {
      return allocationSubStepFields(allocationSubStep, form.state);
    }
    return null;
  }, [
    wizardEnabled,
    webAllocSubSteps,
    useEnterpriseSteps,
    mobileAggregateFleetKeypads,
    mobileAssetFleetSteps,
    wizardStep,
    allocationSubStep,
    form.state.supplySource,
    form.state.marketFulfillment,
    form.state.assignLater,
  ]);

  const stepIssues = useMemo(() => {
    if (!stepFieldSet) return form.validationIssues;
    if (wizardEnabled && wizardStep === "client") {
      return computeClientStepIssues(form.validationIssues);
    }
    if (wizardEnabled && wizardStep === "commodity") {
      return computeCommodityStepIssues(form.state);
    }
    if (wizardEnabled && wizardStep === "market_fulfillment") {
      if (form.state.marketFulfillment) return [];
      return [
        {
          field: "marketFulfillment" as const,
          message: "Choose existing supplier or share for bidding",
        },
      ];
    }
    return form.validationIssues.filter((i) => stepFieldSet.has(i.field));
  }, [wizardEnabled, stepFieldSet, wizardStep, form.state, form.validationIssues]);

  const visibleIssues = validationAttempted ? stepIssues : [];
  const visibleValidationMessage = validationAttempted
    ? (stepIssues[0]?.message ?? null)
    : null;

  const steppedFormActive = wizardEnabled || webAllocSubSteps;
  /**
   * Tons outside the catalog vehicle's passing-ton range: no Continue / Create.
   * Only where the tons field is on screen (commodity step, or the single-page form),
   * so a lane prefill can't hide Continue on a step that doesn't show why.
   */
  const tonsOutOfVehicleRange =
    tonsOutsideVehicleRange(form.state.vehicleType, form.state.tons) != null &&
    (!steppedFormActive || (wizardEnabled && wizardStep === "commodity"));
  const stepCanAdvance = steppedFormActive
    ? stepIssues.length === 0
    : form.canSubmit;

  const allocationStepIndex = allocationSteps.indexOf(allocationSubStep);
  const isLastAllocationStep =
    allocationFlowActive &&
    allocationStepIndex >= 0 &&
    allocationStepIndex === allocationSteps.length - 1;

  const wizardSubmitLabel = steppedFormActive
    ? wizardEnabled && wizardStep === "share_target"
      ? "Share"
      : wizardEnabled && wizardStep !== "allocation" && wizardStep !== "share_target"
      ? "Continue"
      : mobileAggregateFleetKeypads || mobileAssetFleetSteps
        ? isLastAllocationStep
          ? "Create Trip"
          : "Continue"
        : useEnterpriseSteps || isLastAllocationStep
          ? "Create Trip"
          : "Continue"
    : "Create Trip";

  const wizardStepMeta = useMemo(() => {
    if (!wizardEnabled) return null;
    const topSteps = wizardSteps.map((id) => ({
      id,
      label: isDesktopWizard
        ? addTripWizardStepLabel(id)
        : addTripWizardStepShortLabel(id),
    }));
    const topIndex = topSteps.findIndex((s) => s.id === wizardStep);
    if (wizardStep !== "allocation") {
      return {
        steps: topSteps,
        currentId: wizardStep,
        stepIndex: topIndex >= 0 ? topIndex + 1 : 1,
        stepTotal: topSteps.length,
        title: isIndentShareStep(wizardStep) ? "Share load" : "Create Trip",
        subtitle: addTripWizardStepSubtitle(wizardStep, {
          contractRouteLocked: contractLaneLocked,
        }),
      };
    }
    const allocationSubtitle =
      mobileAggregateFleetKeypads || mobileAssetFleetSteps
        ? allocationSubStepLabel(allocationSubStep)
        : useEnterpriseSteps
          ? form.state.supplySource === "asset"
            ? "Assign vehicle and driver, or choose Assign later"
            : form.state.assignLater
              ? "Fleet can be linked on trip detail"
              : "Enter partner driver phone and vehicle"
          : `Assign · ${allocationSubStepLabel(allocationSubStep)}`;
    return {
      steps: topSteps,
      currentId: "allocation",
      stepIndex: topIndex >= 0 ? topIndex + 1 : topSteps.length,
      stepTotal: topSteps.length,
      title: "Create Trip",
      subtitle: allocationSubtitle,
    };
  }, [
    wizardEnabled,
    wizardSteps,
    wizardStep,
    allocationSteps,
    allocationSubStep,
    isDesktopWizard,
    useEnterpriseSteps,
    mobileAggregateFleetKeypads,
    mobileAssetFleetSteps,
    form.state.supplySource,
    form.state.assignLater,
    contractLaneLocked,
  ]);

  const saleFillBody =
    useEnterpriseSteps &&
    !isDesktopWizard &&
    wizardStep === "client" &&
    Boolean(form.state.clientId) &&
    !laneGateActive;
  const partnerRateFillBody =
    useEnterpriseSteps &&
    !isDesktopWizard &&
    wizardStep === "market_partner" &&
    Boolean(form.state.supplierId);
  const shareTargetFillBody =
    useEnterpriseSteps &&
    !isDesktopWizard &&
    wizardStep === "share_target";
  const allocationKeypadFillBody =
    mobileAggregateFleetKeypads &&
    (allocationSubStep === "driverPhone" ||
      allocationSubStep === "driverName" ||
      allocationSubStep === "vehicle");
  const desktopAllocationFillBody =
    useEnterpriseSteps && wizardStep === "allocation" && isDesktopWizard;
  const wizardFillBody =
    saleFillBody ||
    partnerRateFillBody ||
    shareTargetFillBody ||
    allocationKeypadFillBody ||
    desktopAllocationFillBody;
  /** Final allocation step: Create Trip only (edit via summary chips / header back). */
  const hideFooterBack =
    (wizardStep === "allocation" && isLastAllocationStep) ||
    allocationKeypadFillBody;

  const runCreate = async (opts?: { skipDriverAssign?: boolean }) => {
    setDriverBusyAlertVisible(false);
    if (shouldSkipLockedSubmit(submitting, submitLockRef)) return;
    if (!acquireSubmitLock(submitLockRef)) return;
    setSubmitting(true);
    try {
      const options: AddTripCompleteOptions = {
        supplySource: form.state.supplySource,
        driverPhone: opts?.skipDriverAssign
          ? undefined
          : form.state.driverPhone.trim() || undefined,
        driverName: opts?.skipDriverAssign
          ? undefined
          : form.state.aggregateDriverName.trim() || undefined,
      };
      const result = await Promise.resolve(onComplete(form.buildPayload(), options));
      const typed = result as AddTripCompleteResult | undefined;
      if (typed?.trip && typed?.otp) {
        setCreatedResult({
          ...typed,
          otpScreenContext: buildOtpScreenContext(form.state),
        });
        return;
      }
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create trip.";
      setSubmitError(msg);
      showAppAlert("Could not create trip", msg);
    } finally {
      releaseSubmitLock(submitLockRef);
      setSubmitting(false);
    }
  };

  const runShareIndent = async () => {
    if (indentCreatedRef.current) return;
    if (!onShareIndent) {
      const msg = "You don't have permission to share for bidding.";
      setSubmitError(msg);
      showAppAlert("Cannot share", msg);
      return;
    }
    if (shouldSkipLockedSubmit(submitting, submitLockRef)) return;
    if (!acquireSubmitLock(submitLockRef)) return;
    setSubmitting(true);
    try {
      const payload = buildIndentPayloadFromAddTripState(form.state);
      await onShareIndent(payload);
      indentCreatedRef.current = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create indent.";
      setSubmitError(msg);
      showAppAlert("Could not create indent", msg);
    } finally {
      releaseSubmitLock(submitLockRef);
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setValidationAttempted(true);
    setSubmitError(null);
    if (submitting) return;
    if (!organizationId) {
      const msg =
        "Your workspace is still loading. Wait a moment and try again.";
      setSubmitError(msg);
      showAppAlert("Organization required", msg);
      return;
    }
    if (form.state.marketFulfillment === "bid") {
      if (!form.canSubmit) {
        const validationErr = form.getValidationError();
        const msg =
          validationErr ?? "Please fill all required fields before sharing.";
        setSubmitError(msg);
        showAppAlert("Missing details", msg);
        return;
      }
      await runShareIndent();
      return;
    }
    if (!form.canSubmit) {
      const validationErr = form.getValidationError();
      const msg =
        validationErr ?? "Please fill all required fields before creating the trip.";
      setSubmitError(msg);
      showAppAlert("Missing details", msg);
      return;
    }

    if (
      form.state.supplySource === "aggregate" &&
      form.state.driverPhoneTripConflict &&
      form.state.driverPhone.trim()
    ) {
      setDriverBusyAlertVisible(true);
      return;
    }

    await runCreate();
  };

  const goWizardBack = () => {
    if (wizardStep === "allocation") {
      if (
        !useEnterpriseSteps ||
        mobileAggregateFleetKeypads ||
        mobileAssetFleetSteps
      ) {
        const allocIdx = allocationSteps.indexOf(allocationSubStep);
        if (allocIdx > 0) {
          setAllocationSubStep(allocationSteps[allocIdx - 1]!);
          return true;
        }
      }
    }
    const prev = wizardStepBefore(wizardSteps, wizardStep);
    if (!prev) return false;
    setWizardStep(prev);
    return true;
  };

  const driverBusyWho = form.state.driverPhoneName?.trim() || "This driver";
  const driverBusyTripLabel =
    form.state.driverPhoneTripConflictLabel?.trim() || null;
  const driverBusyMessage = driverBusyTripLabel
    ? `${driverBusyWho} is already on ${driverBusyTripLabel}. Ask them to complete that trip first — then you can assign them to this one.`
    : `${driverBusyWho} is already on another trip. Ask them to complete it first — then you can assign them here.`;

  const advanceAllocationSubStep = () => {
    const allocIdx = allocationSteps.indexOf(allocationSubStep);
    if (allocIdx >= 0 && allocIdx < allocationSteps.length - 1) {
      setAllocationSubStep(allocationSteps[allocIdx + 1]!);
      return true;
    }
    return false;
  };

  const handleWizardPrimary = () => {
    setValidationAttempted(true);
    if (webAllocSubSteps && !wizardEnabled) {
      if (stepIssues.length > 0) {
        Alert.alert(
          "Missing details",
          stepIssues[0]?.message ?? "Fill required fields.",
        );
        return;
      }
      if (advanceAllocationSubStep()) return;
      void handleSubmit();
      return;
    }
    if (!wizardEnabled) {
      void handleSubmit();
      return;
    }
    if (wizardStep === "client" && laneGateActive) {
      Alert.alert(
        "Choose a lane",
        "Select a contract lane, or tap Adhoc / Continue as adhoc to enter sale manually.",
      );
      return;
    }
    if (stepIssues.length > 0) {
      const msg = stepIssues[0]?.message ?? "Fill required fields.";
      setSubmitError(msg);
      if (wizardStep === "client" || wizardStep === "commodity") {
        Alert.alert("Missing details", msg);
      } else {
        showAppAlert("Missing details", msg);
      }
      return;
    }
    if (
      wizardStep === "allocation" &&
      (mobileAggregateFleetKeypads || mobileAssetFleetSteps)
    ) {
      if (advanceAllocationSubStep()) return;
      void handleSubmit();
      return;
    }
    const next = wizardStepAfter(wizardSteps, wizardStep);
    if (next) {
      if (next === "allocation") {
        setAllocationSubStep(getAllocationSubSteps(form.state)[0] ?? "supply");
      }
      setWizardStep(next);
      return;
    }
    if (!useEnterpriseSteps && advanceAllocationSubStep()) return;
    void handleSubmit();
  };

  const handleWizardBack = () => {
    if (webAllocSubSteps && !wizardEnabled) {
      const allocIdx = allocationSteps.indexOf(allocationSubStep);
      if (allocIdx > 0) {
        setAllocationSubStep(allocationSteps[allocIdx - 1]!);
      }
      return;
    }
    if (!wizardEnabled) return;
    goWizardBack();
  };

  /** Jump back to a completed step (desktop + mobile enterprise wizard). */
  const handleWizardStepPress = (_stepId: string, index: number) => {
    if (!wizardEnabled || !useEnterpriseSteps) return;
    const currentIdx = wizardSteps.indexOf(wizardStep);
    if (index < 0 || index > currentIdx) return;
    const target = wizardSteps[index];
    if (!target || target === wizardStep) return;
    setWizardStep(target);
    if (target === "allocation") {
      setAllocationSubStep(getAllocationSubSteps(form.state)[0] ?? "supply");
    }
  };

  const handleWizardBackOrClose = () => {
    if (webAllocSubSteps && !wizardEnabled) {
      const allocIdx = allocationSteps.indexOf(allocationSubStep);
      if (allocIdx > 0) {
        setAllocationSubStep(allocationSteps[allocIdx - 1]!);
        return;
      }
      onClose();
      return;
    }
    if (!wizardEnabled) {
      onClose();
      return;
    }
    if (goWizardBack()) return;
    onClose();
  };

  const handleRegenerateOtp = async () => {
    if (!createdResult?.trip?.id || regenerating) return;
    setRegenerating(true);
    try {
      const { code, expires_at } = await regenerateTripOtp(createdResult.trip.id);
      if (code != null && expires_at != null)
        setCreatedResult({ ...createdResult, otp: { code, expires_at } });
    } finally {
      setRegenerating(false);
    }
  };

  const handleDone = () => {
    setCreatedResult(null);
    onClose();
  };

  if (createdResult?.trip && createdResult?.otp) {
    return (
      <AddTripModalLayout
        title="Trip created"
        subtitle="Share the code below — trip details stay on this screen for reference."
        submitLabel="Done"
        canSubmit={true}
        submitting={false}
        onClose={handleDone}
        onSubmit={handleDone}
      >
        <AddTripOtpSuccessBody
          createdResult={createdResult}
          regenerating={regenerating}
          onRegenerateOtp={handleRegenerateOtp}
        />
      </AddTripModalLayout>
    );
  }

  return (
    <>
    <AddTripModalLayout
      title={wizardStepMeta?.title ?? "Create Trip"}
      insightPreset="trip"
      subtitle={wizardStepMeta?.subtitle}
      stepIndex={undefined}
      stepTotal={undefined}
      submitLabel={wizardSubmitLabel}
      canSubmit={stepCanAdvance}
      hidePrimary={tonsOutOfVehicleRange}
      submitting={submitting}
      lockPrimaryUntilValid={steppedFormActive}
      validationMessage={visibleValidationMessage ?? submitError}
      onClose={handleWizardBackOrClose}
      onBack={
        wizardEnabled && wizardStep !== "client"
          ? handleWizardBack
          : undefined
      }
      onSubmit={handleWizardPrimary}
      fillBody={wizardFillBody}
      scrollBody={wizardEnabled && !wizardFillBody && !isDesktopWizard}
      steppedLayout={isDesktopWizard}
      hideFooterSecondary={hideFooterBack}
      progress={
        wizardEnabled && isDesktopWizard ? (
          <CreateTripDesktopStepper
            steps={wizardSteps.map((id, idx) => ({
              id,
              num: idx + 1,
              title: addTripWizardStepLabel(id),
            }))}
            currentStepId={wizardStep}
            onStepPress={handleWizardStepPress}
          />
        ) : null
      }
    >
      {/**
       * Shell ScrollView owns vertical scroll on mobile — avoid flex:1 wrappers that
       * expand the body past the viewport and push the Continue footer off-screen.
       */}
      <View style={wizardFillBody || isDesktopWizard ? { flex: 1, minHeight: 0 } : undefined}>
      {useEnterpriseSteps ? (
        <CreateTripDesktopWizard
          layout={isDesktopWizard ? "desktop" : "mobile"}
          wizardStep={wizardStep}
          state={form.state}
          setters={form.setters}
          clients={clients}
          clientsLoading={clientsLoading}
          organizationId={organizationId}
          validationIssues={visibleIssues}
          sourceIndent={sourceIndent ?? null}
          allocationSubStep={
            mobileAggregateFleetKeypads || mobileAssetFleetSteps
              ? allocationSubStep
              : undefined
          }
          onAllocationSubStepChange={
            mobileAggregateFleetKeypads || mobileAssetFleetSteps
              ? setAllocationSubStep
              : undefined
          }
          onLaneGateActiveChange={setLaneGateActive}
          onContractLaneLockedChange={setContractLaneLocked}
          onRequestChangeLane={() => setWizardStep("client")}
          allowedSupplyModes={allowedSupplyModes}
          canAggregateTrip={canAggregate}
          canShareIndent={unifiedPermissions.canIndent}
        />
      ) : (
      <AddTripFormFields
        state={form.state}
        setters={form.setters}
        clients={clients}
        clientsLoading={clientsLoading}
        organizationId={organizationId}
        refetchClients={refetchClients}
        onSubmit={handleWizardPrimary}
        canSubmit={stepCanAdvance}
        enablePrimaryWhenInvalid
        validationIssues={visibleIssues}
        validationMessage={visibleValidationMessage}
        wizardSection={wizardEnabled ? wizardStep : undefined}
        desktopWizardChrome={false}
        enterpriseFormGrid={false}
        mobileWizardMode={wizardEnabled}
        sourceIndent={sourceIndent ?? null}
        allocationSubStep={allocationFlowActive ? allocationSubStep : undefined}
        onAllocationSubStepChange={setAllocationSubStep}
        allowedSupplyModes={allowedSupplyModes}
        showInlineCta={false}
        submitting={submitting}
      />
      )}
      </View>
    </AddTripModalLayout>

    <ThemedAlertModal
      visible={driverBusyAlertVisible}
      variant="warning"
      okVariant="primary"
      title="Driver is on another trip"
      message={driverBusyMessage}
      okText="Got it"
      onOk={() => setDriverBusyAlertVisible(false)}
      onRequestClose={() => setDriverBusyAlertVisible(false)}
      secondaryText="Create without assigning"
      onSecondary={() => void runCreate({ skipDriverAssign: true })}
      lottieSource={DRIVER_BUSY_ALERT_LOTTIE}
      lottieLoop
      lottieSize={112}
    />
    </>
  );
}
