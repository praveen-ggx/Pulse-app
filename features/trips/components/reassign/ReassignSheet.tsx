import Theme from '@/constants/Theme';
import { AddTripWizardProgress } from '@/features/trips/components/add-trip/AddTripWizardProgress';
import { AggregateTrackingMobileStep } from '@/features/trips/components/add-trip/AggregateTrackingMobileStep';
import {
  isTripPhoneWizardStepComplete,
  TRIP_PHONE_WIZARD_STEPS,
  tripPhoneWizardSubtitle,
} from '@/features/trips/components/allocation/tripPhoneAssignmentWizardSteps';
import { AssignmentFlowShell } from '@/features/trips/components/assignment/AssignmentFlowShell';
import { AssignmentFlowFooter } from '@/features/trips/components/assignment/assignmentFlowFooter';
import {
  TripAssignmentWorkspace,
  type AssignmentFulfillmentMode,
  type AssignmentPanelAction,
  type ChangeReasonCode,
} from '@/features/trips/components/assignment/TripAssignmentWorkspace';
import { assignmentShellStyles } from '@/features/trips/styles/assignmentShellShared';
import { useAggregateDriverPhoneLookup } from '@/features/trips/hooks/useAggregateDriverPhoneLookup';
import { useDriverMaster } from '@/features/trips/hooks/useDriverMaster';
import { useVehicleMaster } from '@/features/trips/hooks/useVehicleMaster';
import { useReassignTrip } from '@/features/trips/hooks/useReassignTrip';
import { useReassignMigrationGate } from '@/features/trips/hooks/useReassignMigrationGate';
import { getTripOtpForDisplay } from '@/features/trips/services/tripOtp.service';
import type { TripRow } from '@/features/trips/services/trips.service';
import type { ReassignCompletedMeta } from '@/features/trips/components/reassign/reassign.types';
import {
  hasReassignChanges,
  phoneLast10,
  shouldInviteDriverByPhone,
} from '@/features/trips/utils/reassignChangeDetection.util';
import {
  isTripReassignStaleError,
  tripReassignStaleUserMessage,
} from '@/features/trips/utils/tripReassignConflict.util';
import { applyIndianVehicleKeystroke, isIndianVehiclePlateComplete } from '@/lib/indianVehicleInput.util';
import { validatePhone } from '@/lib/phoneValidation';
import { formatIndianVehicleNumber, formatMobileNumber } from '@/lib/format';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ExistingDriverMatch } from '@/features/drivers/services/drivers.service';
import type { AddTripIssueField } from '@/features/trips/components/add-trip/useAddTripForm';
import {
  DriverReassignSection,
  type DriverReassignMode,
} from './DriverReassignSection';
import {
  VehicleReassignSection,
  type VehicleReassignMode,
} from './VehicleReassignSection';
import { reassignStyles as s } from './reassign.styles';

type Props = {
  visible: boolean;
  onClose: () => void;
  trip: TripRow;
  organizationId: string;
  isAggregate: boolean;
  canAssign: boolean;
  currentUserId: string | null;
  driverAssignOrgId: string | null;
  currentDriverName: string | null;
  /** Assigned driver mobile — used to prefill Edit details. */
  currentDriverPhone?: string | null;
  currentVehicleLabel: string | null;
  onCompleted: (meta?: ReassignCompletedMeta) => void | Promise<void>;
  onReloadTrip: () => void | Promise<void>;
  onVehicleDisplayChange?: (plate: string) => void;
};

type OtpSuccess = { code: string; expires_at: string | null };

type ReassignWizardStep =
  | 'driver'
  | 'driverPhone'
  | 'driverName'
  | 'vehicle'
  | 'review';

const REASSIGN_WIZARD_STEPS = [
  { id: 'driver', label: 'Driver' },
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'review', label: 'Confirm' },
] as const;

export function ReassignSheet({
  visible,
  onClose,
  trip,
  organizationId,
  isAggregate,
  canAssign,
  currentUserId,
  driverAssignOrgId,
  currentDriverName,
  currentDriverPhone: currentDriverPhoneProp = null,
  currentVehicleLabel,
  onCompleted,
  onReloadTrip,
  onVehicleDisplayChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const mobileFullPage = windowWidth < 768;
  const useMobileWizard = false;
  const { drivers, isLoading: driversLoading, refetch: refetchDrivers } =
    useDriverMaster(organizationId);
  const { vehicles, isLoading: vehiclesLoading, refetch: refetchVehicles } =
    useVehicleMaster(organizationId);

  const migrationGateEnabled = visible && isAggregate;
  const {
    migrationBlocked,
    migrationChecking,
    refreshMigrationCheck,
  } = useReassignMigrationGate(migrationGateEnabled);

  const [tripUpdatedAtSnapshot, setTripUpdatedAtSnapshot] = useState<string | null>(
    trip.updated_at ?? null,
  );
  const [driverMode, setDriverMode] = useState<DriverReassignMode>('existing');
  const [vehicleMode, setVehicleMode] = useState<VehicleReassignMode>('existing');
  const [driverAction, setDriverAction] = useState<AssignmentPanelAction>('PREVIEW');
  const [vehicleAction, setVehicleAction] = useState<AssignmentPanelAction>('PREVIEW');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(
    trip.driver_id ?? null,
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    trip.vehicle_id ?? null,
  );
  const [phone, setPhone] = useState('');
  const [driverNameInput, setDriverNameInput] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [adHocPlate, setAdHocPlate] = useState(
    formatIndianVehicleNumber(trip.vehicle_display_number ?? '').trim(),
  );
  const [busyDriverIds, setBusyDriverIds] = useState<Set<string>>(new Set());
  const [busyDriverTripLabels, setBusyDriverTripLabels] = useState<Record<string, string>>({});
  const [busyVehicleIds, setBusyVehicleIds] = useState<Set<string>>(new Set());
  const [staleConflict, setStaleConflict] = useState(false);

  const {
    saving,
    error,
    setError,
    reassignCombined,
    reassignByPhone,
    retryVehicleOnly,
    loadBusyDriverIds,
    loadBusyVehicleAssignments,
  } = useReassignTrip({
    trip,
    organizationId,
    currentUserId,
    isAggregate,
    driverAssignOrgId,
    expectedUpdatedAt: tripUpdatedAtSnapshot,
  });
  const [partialVehicleFailure, setPartialVehicleFailure] = useState<{
    vehicleError: string;
    pendingVehicleId: string | null;
  } | null>(null);
  const [otpSuccess, setOtpSuccess] = useState<OtpSuccess | null>(null);
  const [savedConfirm, setSavedConfirm] = useState<{
    driver: string;
    vehicle: string;
  } | null>(null);
  const [wizardStep, setWizardStep] = useState<ReassignWizardStep>(
    isAggregate ? 'driverPhone' : 'driver',
  );
  const [driverNameManual, setDriverNameManual] = useState(false);
  const otpDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [changeReason, setChangeReason] = useState<ChangeReasonCode>('AD_HOC_SUBSTITUTION');
  const [changeRemarks, setChangeRemarks] = useState('');
  const [workspaceToast, setWorkspaceToast] = useState<string | null>(null);

  const currentDriverPhone = useMemo(() => {
    const fromProp = (currentDriverPhoneProp ?? "").trim();
    if (fromProp) return fromProp;
    const d = drivers.find((x) => x.id === trip.driver_id);
    return d?.phone ?? null;
  }, [currentDriverPhoneProp, drivers, trip.driver_id]);

  const aggregatePhoneLookup = useAggregateDriverPhoneLookup({
    phone,
    tripId: trip.id,
    organizationId,
    driverAssignOrgId,
    currentDriverPhone,
    enabled: visible && driverMode === "phone",
  });

  const sheetOpenGenRef = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    return undefined;
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) return;

    const openGen = ++sheetOpenGenRef.current;
    setDriverMode(isAggregate ? 'phone' : 'existing');
    setVehicleMode('existing');
    setDriverAction('PREVIEW');
    setVehicleAction('PREVIEW');
    setSelectedDriverId(trip.driver_id ?? null);
    setSelectedVehicleId(trip.vehicle_id ?? null);
    const prefillPhone = (currentDriverPhoneProp ?? "").trim();
    setPhone(prefillPhone ? formatMobileNumber(prefillPhone) : '');
    setDriverNameInput((currentDriverName ?? '').trim());
    setPhoneBusy(false);
    setAdHocPlate(formatIndianVehicleNumber(trip.vehicle_display_number ?? '').trim());
    setError(null);
    setPartialVehicleFailure(null);
    setOtpSuccess(null);
    setWizardStep(isAggregate ? 'driverPhone' : 'driver');
    setDriverNameManual(false);
    setStaleConflict(false);
    setTripUpdatedAtSnapshot(trip.updated_at ?? null);

    void loadBusyDriverIds().then(({ busyDriverIds: ids, tripLabelByDriverId: labels }) => {
      if (sheetOpenGenRef.current === openGen) {
        setBusyDriverIds(ids);
        setBusyDriverTripLabels(labels);
      }
    });
    void loadBusyVehicleAssignments().then(({ busyVehicleIds: busy }) => {
      if (sheetOpenGenRef.current === openGen) setBusyVehicleIds(busy);
    });
    void refetchDrivers();
    void refetchVehicles();
    if (isAggregate) void refreshMigrationCheck(false);
  }, [visible, trip.id]);

  /** Once fleet roster loads, backfill phone if Edit details is still empty. */
  useEffect(() => {
    if (!visible) return;
    if (phone.trim()) return;
    const fromMaster = drivers.find((x) => x.id === trip.driver_id)?.phone?.trim();
    const fallback = (currentDriverPhoneProp ?? fromMaster ?? "").trim();
    if (!fallback) return;
    setPhone(formatMobileNumber(fallback));
  }, [visible, drivers, trip.driver_id, currentDriverPhoneProp, phone]);

  /** Keep the optimistic-lock snapshot. Do not reset the picker's selection
   *  when a background trip refetch updates `updated_at` / driver_id. */
  useEffect(() => {
    if (!visible) return;
    setTripUpdatedAtSnapshot(trip.updated_at ?? null);
  }, [visible, trip.id, trip.updated_at]);

  useEffect(() => {
    return () => {
      if (otpDismissTimerRef.current) clearTimeout(otpDismissTimerRef.current);
    };
  }, []);

  const handleSelectVehicleId = useCallback((id: string | null) => {
    setSelectedVehicleId(id);
    if (id) setAdHocPlate('');
  }, []);

  const driverModeIsPhone = driverMode === 'phone';

  const hasChanges = useMemo(
    () =>
      hasReassignChanges({
        trip,
        driverModeIsPhone,
        phone,
        currentDriverPhone,
        currentDriverName,
        driverNameInput,
        selectedDriverId,
        selectedVehicleId,
        adHocPlate,
        isAggregate,
      }),
    [
      trip,
      driverModeIsPhone,
      phone,
      currentDriverPhone,
      currentDriverName,
      driverNameInput,
      selectedDriverId,
      selectedVehicleId,
      adHocPlate,
      isAggregate,
    ],
  );

  const existingTripVehiclePlate = useMemo(
    () => formatIndianVehicleNumber(trip.vehicle_display_number ?? '').trim(),
    [trip.vehicle_display_number],
  );

  const aggregateVehicleRequired = useMemo(
    () =>
      !(
        trip.vehicle_id ||
        isIndianVehiclePlateComplete(existingTripVehiclePlate)
      ),
    [trip.vehicle_id, existingTripVehiclePlate],
  );

  const meetsValidation = useMemo(() => {
    if (driverModeIsPhone) {
      const trimmed = phone.trim();
      const nameTrimmed = driverNameInput.trim();
      if (!nameTrimmed || nameTrimmed.length < 2) return false;
      if (!trimmed || validatePhone(trimmed)) return false;
      if (isAggregate) {
        if (aggregatePhoneLookup.inTrip) return false;
        if (
          aggregatePhoneLookup.matches.length > 1 &&
          !aggregatePhoneLookup.selectedUserId
        ) {
          return false;
        }
        return isTripPhoneWizardStepComplete('vehicle', {
          driverPhone: phone,
          driverName: driverNameInput,
          vehiclePlate: adHocPlate,
          phoneComplete: aggregatePhoneLookup.phoneComplete,
          phoneLookupLoading: aggregatePhoneLookup.loading,
          phoneInTrip: aggregatePhoneLookup.inTrip,
          phoneMatches: aggregatePhoneLookup.matches,
          selectedMatchUserId: aggregatePhoneLookup.selectedUserId,
          vehicleRequired: aggregateVehicleRequired,
          existingVehiclePlate: existingTripVehiclePlate,
        });
      }
      return !!selectedVehicleId;
    }
    if (!selectedDriverId) return false;
    if (isAggregate) {
      return !!(selectedVehicleId || adHocPlate.trim());
    }
    return !!selectedVehicleId;
  }, [
    driverModeIsPhone,
    driverNameInput,
    phone,
    isAggregate,
    selectedVehicleId,
    adHocPlate,
    selectedDriverId,
    aggregatePhoneLookup.inTrip,
    aggregatePhoneLookup.matches,
    aggregatePhoneLookup.selectedUserId,
    aggregatePhoneLookup.phoneComplete,
    aggregatePhoneLookup.loading,
    aggregateVehicleRequired,
    existingTripVehiclePlate,
  ]);

  const canConfirm = useMemo(() => {
    const savingCurrentDriver =
      !shouldInviteDriverByPhone({
        phone,
        currentDriverPhone,
        rosterPhones: drivers.map((d) => d.phone),
      });
    const phoneBlocked = savingCurrentDriver
      ? false
      : isAggregate && driverModeIsPhone
        ? aggregatePhoneLookup.inTrip
        : phoneBusy;
    const lookupPending =
      isAggregate && driverModeIsPhone && aggregatePhoneLookup.loading;
    if (!canAssign || saving || phoneBlocked || lookupPending || otpSuccess) return false;
    if (isAggregate && migrationBlocked) return false;
    if (isAggregate && migrationChecking) return false;
    return (hasChanges || savingCurrentDriver) && meetsValidation;
  }, [
    canAssign,
    saving,
    phoneBusy,
    phone,
    currentDriverPhone,
    drivers,
    aggregatePhoneLookup.inTrip,
    aggregatePhoneLookup.loading,
    driverModeIsPhone,
    otpSuccess,
    isAggregate,
    migrationBlocked,
    migrationChecking,
    hasChanges,
    meetsValidation,
  ]);

  const buildCompletedMeta = useCallback((): ReassignCompletedMeta => {
    const driverIdChanged = driverModeIsPhone
      ? phone.trim().length > 0 &&
        phoneLast10(phone) !== phoneLast10(currentDriverPhone ?? '')
      : (selectedDriverId ?? null) !== (trip.driver_id ?? null);
    return { driverIdChanged };
  }, [
    driverModeIsPhone,
    phone,
    currentDriverPhone,
    selectedDriverId,
    trip.driver_id,
  ]);

  const handleReloadTrip = useCallback(async () => {
    setStaleConflict(false);
    setError(null);
    setPartialVehicleFailure(null);
    await onReloadTrip();
    setTripUpdatedAtSnapshot(trip.updated_at ?? null);
    setSelectedDriverId(trip.driver_id ?? null);
    setSelectedVehicleId(trip.vehicle_id ?? null);
    setAdHocPlate(formatIndianVehicleNumber(trip.vehicle_display_number ?? '').trim());
  }, [onReloadTrip, trip, setError]);

  const scheduleOtpDismiss = useCallback(() => {
    if (otpDismissTimerRef.current) clearTimeout(otpDismissTimerRef.current);
    otpDismissTimerRef.current = setTimeout(() => {
      otpDismissTimerRef.current = null;
      onClose();
    }, 3000);
  }, [onClose]);

  const summaryDriver = useMemo(() => {
    if (driverModeIsPhone) {
      const name = driverNameInput.trim();
      const ph = phone.trim();
      if (name && ph) return `${name} · ${ph}`;
      return name || ph || '—';
    }
    const d = drivers.find((x) => x.id === selectedDriverId);
    return d?.name ?? currentDriverName ?? '—';
  }, [
    driverModeIsPhone,
    driverNameInput,
    phone,
    drivers,
    selectedDriverId,
    currentDriverName,
  ]);

  const summaryVehicle = useMemo(() => {
    const v = vehicles.find((x) => x.id === selectedVehicleId);
    if (v) return formatIndianVehicleNumber(v.vehicle_number ?? '') || '—';
    const plate = formatIndianVehicleNumber(adHocPlate).trim();
    if (plate) return plate;
    return currentVehicleLabel ?? '—';
  }, [vehicles, selectedVehicleId, adHocPlate, currentVehicleLabel]);

  const finishWithOtpReveal = useCallback(
    async (showOtpForAggregatePhone: boolean) => {
      await onCompleted(buildCompletedMeta());
      if (showOtpForAggregatePhone && isAggregate && driverModeIsPhone) {
        const { code, expires_at, error: otpErr } = await getTripOtpForDisplay(trip.id);
        if (code && !otpErr) {
          setOtpSuccess({ code, expires_at });
          scheduleOtpDismiss();
          return;
        }
      }
      setSavedConfirm({
        driver: summaryDriver,
        vehicle: summaryVehicle,
      });
    },
    [
      onCompleted,
      isAggregate,
      driverModeIsPhone,
      trip.id,
      scheduleOtpDismiss,
      buildCompletedMeta,
      summaryDriver,
      summaryVehicle,
    ],
  );

  const handleConfirm = useCallback(async (): Promise<boolean> => {
    if (!canConfirm || saving) return false;
    setError(null);
    setPartialVehicleFailure(null);
    setStaleConflict(false);

    const plate = formatIndianVehicleNumber(adHocPlate).trim();
    const nextName = driverNameInput.trim();
    const rosterMatch = drivers.find(
      (d) => phoneLast10(d.phone ?? "") === phoneLast10(phone),
    );
    const reuseExistingDriver =
      driverModeIsPhone &&
      !shouldInviteDriverByPhone({
        phone,
        currentDriverPhone,
        rosterPhones: drivers.map((d) => d.phone),
      });

    if (driverModeIsPhone && !reuseExistingDriver) {
      const result = await reassignByPhone({
        phone: phone.trim(),
        driverName: nextName,
        vehicleId: selectedVehicleId,
        vehicleDisplayNumber: plate || null,
      });
      if (result.staleConflict) {
        setStaleConflict(true);
        return false;
      }
      if (result.driverUpdatedVehicleFailed) {
        await onCompleted(buildCompletedMeta());
        setPartialVehicleFailure({
          vehicleError: result.vehicleError ?? 'Vehicle update failed.',
          pendingVehicleId: selectedVehicleId,
        });
        return false;
      }
      if (!result.ok) {
        if (result.staleConflict) setStaleConflict(true);
        return false;
      }
      if (plate) onVehicleDisplayChange?.(plate);
      await finishWithOtpReveal(true);
      return true;
    }

    const driverId =
      (reuseExistingDriver
        ? rosterMatch?.id ?? trip.driver_id
        : selectedDriverId) ?? null;
    if (!driverId) return false;
    const { ok, staleConflict: stale } = await reassignCombined({
      driverId,
      vehicleId: selectedVehicleId,
      vehicleDisplayNumber:
        isAggregate && !selectedVehicleId ? plate || undefined : undefined,
      driverDisplayName: nextName || undefined,
    });
    if (stale) {
      setStaleConflict(true);
      return false;
    }
    if (!ok) return false;
    if (plate) onVehicleDisplayChange?.(plate);
    await finishWithOtpReveal(false);
    return true;
  }, [
    canConfirm,
    saving,
    driverModeIsPhone,
    driverNameInput,
    phone,
    adHocPlate,
    selectedVehicleId,
    selectedDriverId,
    drivers,
    currentDriverPhone,
    trip.driver_id,
    reassignByPhone,
    reassignCombined,
    isAggregate,
    onVehicleDisplayChange,
    onCompleted,
    finishWithOtpReveal,
    setError,
    buildCompletedMeta,
  ]);

  useEffect(() => {
    if (error && isTripReassignStaleError(error)) {
      setStaleConflict(true);
    }
  }, [error]);

  const handleRetryVehicle = useCallback(async () => {
    const vehicleId = partialVehicleFailure?.pendingVehicleId ?? selectedVehicleId;
    if (!vehicleId) return;
    setError(null);
    const { ok, staleConflict: stale } = await retryVehicleOnly(vehicleId);
    if (stale) {
      setStaleConflict(true);
      return;
    }
    if (!ok) return;
    setPartialVehicleFailure(null);
    await finishWithOtpReveal(isAggregate && driverModeIsPhone);
  }, [
    partialVehicleFailure,
    selectedVehicleId,
    retryVehicleOnly,
    finishWithOtpReveal,
    isAggregate,
    driverModeIsPhone,
    setError,
  ]);

  const aggregateStepState = useMemo(
    () => ({
      driverPhone: phone,
      driverName: driverNameInput,
      vehiclePlate: adHocPlate,
      phoneComplete: aggregatePhoneLookup.phoneComplete,
      phoneLookupLoading: aggregatePhoneLookup.loading,
      phoneInTrip: aggregatePhoneLookup.inTrip,
      phoneMatches: aggregatePhoneLookup.matches,
      selectedMatchUserId: aggregatePhoneLookup.selectedUserId,
      vehicleRequired: aggregateVehicleRequired,
      existingVehiclePlate: existingTripVehiclePlate,
    }),
    [
      phone,
      driverNameInput,
      adHocPlate,
      aggregatePhoneLookup.phoneComplete,
      aggregatePhoneLookup.loading,
      aggregatePhoneLookup.inTrip,
      aggregatePhoneLookup.matches,
      aggregatePhoneLookup.selectedUserId,
      aggregateVehicleRequired,
      existingTripVehiclePlate,
    ],
  );

  const canContinueDriver = useMemo(() => {
    if (isAggregate && driverModeIsPhone) {
      if (wizardStep === 'driverPhone') {
        return isTripPhoneWizardStepComplete('driverPhone', aggregateStepState);
      }
      if (wizardStep === 'driverName') {
        return isTripPhoneWizardStepComplete('driverName', aggregateStepState);
      }
      return false;
    }
    if (driverModeIsPhone) {
      const trimmed = phone.trim();
      const nameTrimmed = driverNameInput.trim();
      return (
        nameTrimmed.length >= 2 &&
        trimmed.length > 0 &&
        !validatePhone(trimmed) &&
        !phoneBusy
      );
    }
    return !!selectedDriverId;
  }, [
    isAggregate,
    driverModeIsPhone,
    wizardStep,
    aggregateStepState,
    driverNameInput,
    phone,
    phoneBusy,
    selectedDriverId,
  ]);

  const canContinueVehicle = useMemo(() => {
    if (isAggregate) {
      return isTripPhoneWizardStepComplete('vehicle', aggregateStepState);
    }
    return !!selectedVehicleId;
  }, [isAggregate, aggregateStepState, selectedVehicleId]);

  const wizardSubtitle = useMemo(() => {
    if (isAggregate && driverModeIsPhone) {
      if (wizardStep === 'driverPhone' || wizardStep === 'driverName' || wizardStep === 'vehicle' || wizardStep === 'review') {
        const stepIndex = TRIP_PHONE_WIZARD_STEPS.findIndex((step) => step.id === wizardStep);
        return tripPhoneWizardSubtitle(wizardStep, {
          isReassign: true,
          stepIndex: stepIndex >= 0 ? stepIndex + 1 : undefined,
          stepTotal: TRIP_PHONE_WIZARD_STEPS.length,
        });
      }
    }
    if (wizardStep === 'driver') return 'Step 1 · Choose how to assign the driver';
    if (wizardStep === 'vehicle') return 'Step 2 · Fleet vehicle or registration';
    return 'Step 3 · Review — trip stage stays the same';
  }, [wizardStep, isAggregate, driverModeIsPhone]);

  const handleWizardPrimary = useCallback(() => {
    if (isAggregate && driverModeIsPhone) {
      if (wizardStep === 'driverPhone' && canContinueDriver) {
        setWizardStep('driverName');
        return;
      }
      if (wizardStep === 'driverName' && canContinueDriver) {
        setWizardStep('vehicle');
        return;
      }
      if (wizardStep === 'vehicle' && canContinueVehicle) {
        setWizardStep('review');
        return;
      }
      if (wizardStep === 'review') {
        void handleConfirm();
      }
      return;
    }
    if (wizardStep === 'driver') {
      if (canContinueDriver) setWizardStep('vehicle');
      return;
    }
    if (wizardStep === 'vehicle') {
      if (canContinueVehicle) setWizardStep('review');
      return;
    }
    void handleConfirm();
  }, [isAggregate, driverModeIsPhone, wizardStep, canContinueDriver, canContinueVehicle, handleConfirm]);

  const handleWizardBack = useCallback(() => {
    if (isAggregate && driverModeIsPhone) {
      if (wizardStep === 'driverName') setWizardStep('driverPhone');
      else if (wizardStep === 'vehicle') setWizardStep('driverName');
      else if (wizardStep === 'review') setWizardStep('vehicle');
      else onClose();
      return;
    }
    if (wizardStep === 'vehicle') setWizardStep('driver');
    else if (wizardStep === 'review') setWizardStep('vehicle');
    else onClose();
  }, [isAggregate, driverModeIsPhone, wizardStep, onClose]);

  const wizardPrimaryDisabled = useMemo(() => {
    if (isAggregate && driverModeIsPhone) {
      if (wizardStep === 'driverPhone') {
        return !canContinueDriver || aggregatePhoneLookup.loading;
      }
      if (wizardStep === 'driverName') {
        return !canContinueDriver;
      }
      if (wizardStep === 'vehicle') return !canContinueVehicle;
      return !canConfirm;
    }
    if (wizardStep === 'driver') return !canContinueDriver;
    if (wizardStep === 'vehicle') return !canContinueVehicle;
    return !canConfirm;
  }, [
    isAggregate,
    driverModeIsPhone,
    wizardStep,
    canContinueDriver,
    canContinueVehicle,
    canConfirm,
    aggregatePhoneLookup.loading,
  ]);

  const reassignFooterHint = useMemo((): string | null => {
    if (aggregatePhoneLookup.loading && isAggregate && driverModeIsPhone) {
      return 'Checking driver availability…';
    }
    if (
      aggregatePhoneLookup.inTrip &&
      shouldInviteDriverByPhone({
        phone,
        currentDriverPhone,
        rosterPhones: drivers.map((d) => d.phone),
      })
    ) {
      return `This number is on ${aggregatePhoneLookup.busyTripLabel ?? 'another trip'}. Finish that trip or pick someone else.`;
    }
    if (aggregatePhoneLookup.lookupError) return aggregatePhoneLookup.lookupError;
    if (
      isAggregate &&
      driverModeIsPhone &&
      aggregatePhoneLookup.matches.length > 1 &&
      !aggregatePhoneLookup.selectedUserId
    ) {
      return 'Multiple driver profiles found — select one to continue.';
    }
    if (!hasChanges && meetsValidation && driverModeIsPhone === false) {
      return 'Change driver or vehicle to save.';
    }
    if (error) return error;
    return null;
  }, [
    aggregatePhoneLookup.loading,
    aggregatePhoneLookup.inTrip,
    aggregatePhoneLookup.busyTripLabel,
    aggregatePhoneLookup.lookupError,
    aggregatePhoneLookup.matches.length,
    aggregatePhoneLookup.selectedUserId,
    isAggregate,
    driverModeIsPhone,
    hasChanges,
    meetsValidation,
    error,
    phone,
    currentDriverPhone,
    drivers,
  ]);

  const wizardPrimaryLabel = useMemo(() => {
    if (wizardStep === 'review') {
      return isAggregate && driverModeIsPhone
        ? 'Reassign by phone'
        : driverModeIsPhone
          ? 'Assign by phone'
          : 'Confirm reassignment';
    }
    return 'Continue';
  }, [wizardStep, isAggregate, driverModeIsPhone]);

  const aggregateTrackingInvalid = useCallback(
    (field: AddTripIssueField) => {
      if (field === 'driverPhone') {
        return (
          wizardStep === 'driverPhone' &&
          !canContinueDriver &&
          aggregatePhoneLookup.phoneComplete
        );
      }
      if (field === 'driverName') {
        return (
          wizardStep === 'driverName' &&
          driverNameInput.trim().length > 0 &&
          driverNameInput.trim().length < 2
        );
      }
      if (field === 'vehicleNumber') {
        return wizardStep === 'vehicle' && !canContinueVehicle && !!adHocPlate.trim();
      }
      return false;
    },
    [
      wizardStep,
      canContinueDriver,
      canContinueVehicle,
      aggregatePhoneLookup.phoneComplete,
      driverNameInput,
      adHocPlate,
    ],
  );

  const handleAggregatePhoneChange = useCallback((value: string) => {
    const next = formatMobileNumber(value);
    const prevLast10 = phone.replace(/\D/g, "").slice(-10);
    const nextLast10 = next.replace(/\D/g, "").slice(-10);
    if (prevLast10 !== nextLast10) {
      setDriverNameManual(false);
    }
    setPhone(next);
  }, [phone]);

  useEffect(() => {
    if (driverNameManual) return;
    const suggested = aggregatePhoneLookup.suggestedName?.trim();
    if (!suggested) return;
    if (driverNameInput.trim() === suggested) return;
    setDriverNameInput(suggested);
  }, [
    aggregatePhoneLookup.suggestedName,
    driverNameInput,
    driverNameManual,
  ]);

  const handleAggregateDriverNameChange = useCallback((value: string) => {
    setDriverNameManual(true);
    setDriverNameInput(value);
  }, []);

  const handleSelectPhoneMatch = useCallback(
    (match: ExistingDriverMatch) => {
      aggregatePhoneLookup.applyMatch(match);
      if (match.full_name?.trim()) {
        setDriverNameManual(false);
        setDriverNameInput(match.full_name.trim());
      }
    },
    [aggregatePhoneLookup],
  );

  const bannerBlock = (
    <>
      {isAggregate && migrationChecking ? (
        <View style={s.warningBanner}>
          <ActivityIndicator color={Theme.primary} />
          <Text style={[s.warningBannerText, { marginTop: 8 }]}>
            Checking database migration for safe reassignment…
          </Text>
        </View>
      ) : null}

      {isAggregate && migrationBlocked ? (
        <View style={s.warningBanner}>
          <Text style={s.warningBannerText}>
            Reassignment is temporarily unavailable: database migration 20260805140000 is not
            applied. Ask your admin to run db push, then try again.
          </Text>
        </View>
      ) : null}

      {staleConflict ? (
        <View style={s.partialBanner}>
          <Text style={s.partialBannerText}>{tripReassignStaleUserMessage(error)}</Text>
          <TouchableOpacity
            style={s.retryBtn}
            onPress={() => void handleReloadTrip()}
            activeOpacity={0.9}
          >
            <Text style={s.retryBtnText}>Reload</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {partialVehicleFailure ? (
        <View style={s.partialBanner}>
          <Text style={s.partialBannerText}>
            Driver updated. Vehicle update failed — retry?
          </Text>
          {partialVehicleFailure.vehicleError ? (
            <Text style={s.inlineError}>{partialVehicleFailure.vehicleError}</Text>
          ) : null}
          <TouchableOpacity
            style={s.retryBtn}
            onPress={() => void handleRetryVehicle()}
            disabled={saving}
            activeOpacity={0.9}
          >
            {saving ? (
              <ActivityIndicator color={Theme.textOnPrimary} size="small" />
            ) : (
              <Text style={s.retryBtnText}>Retry vehicle assignment</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );

  const driverSection = (
    <View style={assignmentShellStyles.tripAssignSurfaceCard}>
      <DriverReassignSection
        organizationId={organizationId}
        driverAssignOrgId={driverAssignOrgId}
        tripId={trip.id}
        isAggregate={isAggregate}
        currentDriverId={trip.driver_id ?? null}
        currentDriverName={currentDriverName}
        drivers={drivers}
        driversLoading={driversLoading}
        busyDriverIds={busyDriverIds}
        tripLabelByDriverId={busyDriverTripLabels}
        mode={driverMode}
        onModeChange={setDriverMode}
        selectedDriverId={selectedDriverId}
        onSelectDriverId={setSelectedDriverId}
        phone={phone}
        onPhoneChange={handleAggregatePhoneChange}
        driverName={driverNameInput}
        onDriverNameChange={handleAggregateDriverNameChange}
        phoneBusy={phoneBusy}
        onPhoneBusyChange={setPhoneBusy}
        phoneLookup={{
          suggestedName: aggregatePhoneLookup.suggestedName,
          inTrip: aggregatePhoneLookup.inTrip,
          busyTripLabel: aggregatePhoneLookup.busyTripLabel,
          loading: aggregatePhoneLookup.loading,
        }}
      />
    </View>
  );

  const vehicleSection = (
    <View style={assignmentShellStyles.tripAssignSurfaceCard}>
      <VehicleReassignSection
        organizationId={organizationId}
        isAggregate={isAggregate}
        driverModeIsPhone={driverModeIsPhone}
        currentVehicleId={trip.vehicle_id ?? null}
        currentVehicleLabel={currentVehicleLabel}
        vehicles={vehicles}
        vehiclesLoading={vehiclesLoading}
        busyVehicleIds={busyVehicleIds}
        mode={vehicleMode}
        onModeChange={setVehicleMode}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicleId={handleSelectVehicleId}
        adHocPlate={adHocPlate}
        onAdHocPlateChange={setAdHocPlate}
      />
    </View>
  );

  const fulfillmentMode: AssignmentFulfillmentMode = isAggregate ? 'MARKET' : 'ASSET';

  const handleWorkspaceDriverAction = useCallback(
    (action: AssignmentPanelAction) => {
      setDriverAction(action);
      if (action === 'PREVIEW') return;
      if (action === 'SWAP') {
        setDriverMode(isAggregate ? 'phone' : 'existing');
      } else {
        setDriverMode('phone');
        const fallback = (currentDriverPhone ?? '').trim();
        if (fallback) setPhone(formatMobileNumber(fallback));
        const name = (currentDriverName ?? '').trim();
        if (name) setDriverNameInput(name);
      }
    },
    [isAggregate, currentDriverPhone, currentDriverName],
  );

  const handleWorkspaceVehicleAction = useCallback(
    (action: AssignmentPanelAction) => {
      setVehicleAction(action);
      if (action === 'PREVIEW') return;
      if (action === 'SWAP') {
        setVehicleMode(isAggregate ? 'add' : 'existing');
      } else {
        setVehicleMode(isAggregate ? 'add' : 'add');
      }
    },
    [isAggregate],
  );

  const workspaceDriverBody = (
    <DriverReassignSection
      organizationId={organizationId}
      driverAssignOrgId={driverAssignOrgId}
      tripId={trip.id}
      isAggregate={isAggregate}
      currentDriverId={trip.driver_id ?? null}
      currentDriverName={currentDriverName}
      drivers={drivers}
      driversLoading={driversLoading}
      busyDriverIds={busyDriverIds}
      tripLabelByDriverId={busyDriverTripLabels}
      mode={driverMode}
      onModeChange={setDriverMode}
      selectedDriverId={selectedDriverId}
      onSelectDriverId={setSelectedDriverId}
      phone={phone}
      onPhoneChange={handleAggregatePhoneChange}
      driverName={driverNameInput}
      onDriverNameChange={handleAggregateDriverNameChange}
      phoneBusy={phoneBusy}
      onPhoneBusyChange={setPhoneBusy}
      phoneLookup={{
        suggestedName: aggregatePhoneLookup.suggestedName,
        inTrip: aggregatePhoneLookup.inTrip,
        busyTripLabel: aggregatePhoneLookup.busyTripLabel,
        loading: aggregatePhoneLookup.loading,
      }}
      embedded
    />
  );

  const workspaceVehicleBody = (
    <VehicleReassignSection
      organizationId={organizationId}
      isAggregate={isAggregate}
      driverModeIsPhone={driverModeIsPhone}
      currentVehicleId={trip.vehicle_id ?? null}
      currentVehicleLabel={currentVehicleLabel}
      vehicles={vehicles}
      vehiclesLoading={vehiclesLoading}
      busyVehicleIds={busyVehicleIds}
      mode={vehicleMode}
      onModeChange={setVehicleMode}
      selectedVehicleId={selectedVehicleId}
      onSelectVehicleId={handleSelectVehicleId}
      adHocPlate={adHocPlate}
      onAdHocPlateChange={setAdHocPlate}
      embedded
    />
  );

  const reviewSection = (
    <View style={assignmentShellStyles.tripAssignSurfaceCard}>
      <Text style={assignmentShellStyles.stepLabel}>Review reassignment</Text>
      <View style={s.reviewRow}>
        <Text style={s.reviewLabel}>Driver</Text>
        <Text style={s.reviewValue} numberOfLines={2}>
          {summaryDriver}
        </Text>
      </View>
      <View style={s.reviewRow}>
        <Text style={s.reviewLabel}>Vehicle</Text>
        <Text style={s.reviewValue} numberOfLines={2}>
          {summaryVehicle}
        </Text>
      </View>
      {error ? <Text style={s.inlineError}>{error}</Text> : null}
      {!hasChanges && meetsValidation ? (
        <Text style={[s.rowSub, { marginTop: 8 }]}>
          Change driver, vehicle, or phone to confirm reassignment.
        </Text>
      ) : null}
    </View>
  );

  const aggregateAllocationStep =
    isAggregate && driverModeIsPhone && useMobileWizard ? (
      <AggregateTrackingMobileStep
        step={
          wizardStep === 'driverPhone' || wizardStep === 'driverName' || wizardStep === 'vehicle'
            ? wizardStep
            : 'driverPhone'
        }
        driverName={driverNameInput}
        onDriverNameChange={handleAggregateDriverNameChange}
        driverPhone={phone}
        onDriverPhoneChange={handleAggregatePhoneChange}
        vehicleText={adHocPlate}
        onVehicleTextChange={(value) =>
          setAdHocPlate(applyIndianVehicleKeystroke(value))
        }
        invalid={aggregateTrackingInvalid}
        driverPhoneMatches={aggregatePhoneLookup.matches}
        driverPhoneLookupLoading={aggregatePhoneLookup.loading}
        selectedDriverMatchId={aggregatePhoneLookup.selectedUserId}
        onSelectDriverMatch={handleSelectPhoneMatch}
        driverPhoneInTrip={aggregatePhoneLookup.inTrip}
        driverNameFromPlatform={aggregatePhoneLookup.suggestedName}
        testIDPrefix="reassign-aggregate"
      />
    ) : null;

  const wizardProgressSteps =
    isAggregate && driverModeIsPhone ? TRIP_PHONE_WIZARD_STEPS : REASSIGN_WIZARD_STEPS;

  const wizardFirstStep = isAggregate && driverModeIsPhone ? 'driverPhone' : 'driver';

  if (!canAssign) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
    >
      <View
        style={
          mobileFullPage
            ? assignmentShellStyles.webModalBackdropFullPage
            : assignmentShellStyles.webModalBackdrop
        }
      >
        {mobileFullPage ? null : (
        <Pressable
          style={assignmentShellStyles.webModalBackdropTap}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss change driver"
        />
        )}
        {savedConfirm ? (
          <View
            style={
              mobileFullPage
                ? assignmentShellStyles.assignModalWrapFullPage
                : assignmentShellStyles.assignModalWrapPopup
            }
          >
            <View style={{ padding: 24, alignItems: "center", gap: 10 }}>
              <FontAwesome
                name="check-circle"
                size={36}
                color={Theme.networkHubListCardOnlineDot}
              />
              <Text style={s.otpSuccessTitle}>Assignment updated</Text>
              <Text style={s.otpSuccessHint}>
                {savedConfirm.driver} · {savedConfirm.vehicle}
              </Text>
              <TouchableOpacity
                style={s.otpDismissBtn}
                onPress={onClose}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={s.otpDismissText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : otpSuccess ? (
          <View
            style={[
              assignmentShellStyles.assignModalWrapSlate,
              { paddingTop: insets.top, flex: Platform.OS === 'web' ? 0 : 1 },
            ]}
          >
            <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
              <View style={s.otpSuccessCard}>
                <FontAwesome name="check-circle" size={36} color={Theme.primary} />
                <Text style={s.otpSuccessTitle}>Driver reassigned</Text>
                <Text style={[s.otpSuccessHint, { marginBottom: 4 }]}>
                  Share this verification code with the driver:
                </Text>
                <Text style={s.otpSuccessCode}>{otpSuccess.code}</Text>
                {otpSuccess.expires_at ? (
                  <Text style={s.otpSuccessHint}>
                    Expires{' '}
                    {new Date(otpSuccess.expires_at).toLocaleString('en-IN')}
                  </Text>
                ) : null}
                <Text style={s.otpSuccessHint}>
                  The driver enters this code in the app to claim the trip.
                </Text>
                <TouchableOpacity
                  style={s.otpDismissBtn}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={s.otpDismissText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : !useMobileWizard ? (
          <View
            style={
              mobileFullPage
                ? assignmentShellStyles.assignModalWrapFullPage
                : assignmentShellStyles.assignModalWrapPopup
            }
          >
            <TripAssignmentWorkspace
              layout={mobileFullPage ? "page" : "popup"}
              trip={trip}
              organizationId={organizationId}
              driverDisplayName={summaryDriver}
              driverPhoneDisplay={
                phone.trim() || (currentDriverPhone ?? "").trim() || null
              }
              vehicleDisplayLabel={summaryVehicle}
              fulfillmentMode={fulfillmentMode}
              fulfillmentModeEditable={false}
              driverAction={driverAction}
              onDriverActionChange={handleWorkspaceDriverAction}
              vehicleAction={vehicleAction}
              onVehicleActionChange={handleWorkspaceVehicleAction}
              driverPanelBody={workspaceDriverBody}
              vehiclePanelBody={
                <>
                  {workspaceVehicleBody}
                  {error ? <Text style={s.inlineError}>{error}</Text> : null}
                  {!hasChanges && meetsValidation ? (
                    <Text style={[s.rowSub, { marginTop: 8 }]}>
                      Change driver, vehicle, or phone to confirm reassignment.
                    </Text>
                  ) : null}
                  {bannerBlock}
                </>
              }
              changeReason={changeReason}
              onChangeReasonChange={setChangeReason}
              changeRemarks={changeRemarks}
              onChangeRemarksChange={setChangeRemarks}
              onConfirm={() => {
                void handleConfirm();
              }}
              confirmDisabled={!canConfirm}
              confirmLoading={saving}
              confirmHint={reassignFooterHint}
              onClose={onClose}
              toastMessage={workspaceToast}
            />
          </View>
        ) : (
          <View
            style={[
              assignmentShellStyles.assignModalWrapSlate,
              { flex: Platform.OS === 'web' ? 0 : 1 },
            ]}
          >
            <AssignmentFlowShell
              variant={useMobileWizard ? 'pulse' : 'slate'}
              title="Reassign trip"
              subtitle={
                useMobileWizard
                  ? wizardSubtitle
                  : 'Pick driver and vehicle — trip stage stays the same.'
              }
              onClose={onClose}
              onBack={useMobileWizard ? handleWizardBack : undefined}
              showBack={useMobileWizard && wizardStep !== wizardFirstStep}
              submitting={saving}
              fillBody={useMobileWizard && isAggregate && driverModeIsPhone}
              insightPreset="allocation"
              progress={
                useMobileWizard ? (
                  <AddTripWizardProgress
                    steps={wizardProgressSteps}
                    currentStepId={wizardStep}
                  />
                ) : undefined
              }
              footer={
                <AssignmentFlowFooter
                  summary={
                    wizardStep === 'review' || !useMobileWizard
                      ? `${summaryDriver} · ${summaryVehicle}`
                      : undefined
                  }
                  primaryLabel={useMobileWizard ? wizardPrimaryLabel : wizardPrimaryLabel}
                  onPrimaryPress={useMobileWizard ? handleWizardPrimary : () => void handleConfirm()}
                  primaryDisabled={
                    useMobileWizard ? wizardPrimaryDisabled : !canConfirm
                  }
                  loading={saving}
                  hint={reassignFooterHint}
                />
              }
            >
              {bannerBlock}
              {useMobileWizard ? (
                <>
                  {isAggregate && driverModeIsPhone ? (
                    <>
                      {wizardStep === 'driverPhone' ||
                      wizardStep === 'driverName' ||
                      wizardStep === 'vehicle'
                        ? aggregateAllocationStep
                        : null}
                      {wizardStep === 'review' ? reviewSection : null}
                    </>
                  ) : (
                    <>
                      {wizardStep === 'driver' ? driverSection : null}
                      {wizardStep === 'vehicle' ? vehicleSection : null}
                      {wizardStep === 'review' ? reviewSection : null}
                    </>
                  )}
                </>
              ) : (
                <>
                  {isAggregate && driverModeIsPhone ? (
                    <>
                      <AggregateTrackingMobileStep
                        step="driverPhone"
                        driverName={driverNameInput}
                        onDriverNameChange={handleAggregateDriverNameChange}
                        driverPhone={phone}
                        onDriverPhoneChange={handleAggregatePhoneChange}
                        vehicleText={adHocPlate}
                        onVehicleTextChange={(value) =>
                          setAdHocPlate(applyIndianVehicleKeystroke(value))
                        }
                        invalid={aggregateTrackingInvalid}
                        driverPhoneMatches={aggregatePhoneLookup.matches}
                        driverPhoneLookupLoading={aggregatePhoneLookup.loading}
                        selectedDriverMatchId={aggregatePhoneLookup.selectedUserId}
                        onSelectDriverMatch={handleSelectPhoneMatch}
                        driverPhoneInTrip={aggregatePhoneLookup.inTrip}
                        driverNameFromPlatform={aggregatePhoneLookup.suggestedName}
                        testIDPrefix="reassign-aggregate"
                      />
                      <View style={{ height: 12 }} />
                      <AggregateTrackingMobileStep
                        step="driverName"
                        driverName={driverNameInput}
                        onDriverNameChange={handleAggregateDriverNameChange}
                        driverPhone={phone}
                        onDriverPhoneChange={handleAggregatePhoneChange}
                        vehicleText={adHocPlate}
                        onVehicleTextChange={(value) =>
                          setAdHocPlate(applyIndianVehicleKeystroke(value))
                        }
                        invalid={aggregateTrackingInvalid}
                        driverPhoneMatches={aggregatePhoneLookup.matches}
                        selectedDriverMatchId={aggregatePhoneLookup.selectedUserId}
                        onSelectDriverMatch={handleSelectPhoneMatch}
                        testIDPrefix="reassign-aggregate"
                      />
                      <View style={{ height: 12 }} />
                      <AggregateTrackingMobileStep
                        step="vehicle"
                        driverName={driverNameInput}
                        onDriverNameChange={handleAggregateDriverNameChange}
                        driverPhone={phone}
                        onDriverPhoneChange={handleAggregatePhoneChange}
                        vehicleText={adHocPlate}
                        onVehicleTextChange={(value) =>
                          setAdHocPlate(applyIndianVehicleKeystroke(value))
                        }
                        invalid={aggregateTrackingInvalid}
                        testIDPrefix="reassign-aggregate"
                      />
                    </>
                  ) : (
                    <>
                      {driverSection}
                      {vehicleSection}
                    </>
                  )}
                  {error ? <Text style={s.inlineError}>{error}</Text> : null}
                  {!hasChanges && meetsValidation ? (
                    <Text style={[s.rowSub, { marginTop: 8 }]}>
                      Change driver, vehicle, or phone to confirm reassignment.
                    </Text>
                  ) : null}
                </>
              )}
            </AssignmentFlowShell>
          </View>
        )}
      </View>
    </Modal>
  );
}
