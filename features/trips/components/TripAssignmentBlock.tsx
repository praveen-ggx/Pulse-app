/**
 * Trip detail — assign or change driver and vehicle after trip creation.
 * Shows current assignment and, when user can assign, allows changing.
 * Private Book = assigned by current user; Shared Network = assigned by another user.
 */
import Theme from "@/constants/Theme";
import {
    getDriversByOrganization,
    searchExistingDriversByPhone,
    updateDriver,
    type DriverRow,
} from "@/features/drivers/services/drivers.service";
import {
    generateTripOtp,
    getTripOtpForDisplay,
    regenerateTripOtp,
} from "@/features/trips/services/tripOtp.service";
import {
    assignAggregateTripDriverByPhone,
    assignTripDriverByPhone,
    getActiveDriverIds,
    getDriverAvailabilityByPhone,
    getDriverAvailabilityByPhoneGlobal,
    getTripsByOrganization,
    getVehicleOngoingTrip,
    getTripDisplayNumber,
    humanizeTripIdInRpcError,
    isTripCompleted,
    updateTripAssignment,
    type TripRow,
} from "@/features/trips/services/trips.service";
import {
    getVehiclesByOrganization,
    type VehicleRow,
} from "@/features/vehicles/services/vehicles.service";
import { TripPhoneAssignmentWizard } from "@/features/trips/components/allocation/TripPhoneAssignmentWizard";
import { AssignmentFlowFooter } from "@/features/trips/components/assignment/assignmentFlowFooter";
import { FleetAssignWorkspace } from "@/features/trips/components/assignment/FleetAssignWorkspace";
import { assignmentShellStyles } from "@/features/trips/styles/assignmentShellShared";
import { PULSE_TRIP } from "@/features/trips/components/add-trip/addTripPulseTheme";
import {
    formatIndianVehicleNumber,
    formatMobileNumber,
} from "@/lib/format";
import { applyIndianVehicleKeystroke } from "@/lib/indianVehicleInput.util";
import { validatePhone } from "@/lib/phoneValidation";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Check, ChevronRight, Circle, Plus, Star } from "lucide-react-native";
import { useRouter } from "expo-router";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    Alert,
    Keyboard,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type AssignmentSource = "private" | "shared" | "unassigned";

export interface TripAssignmentBlockProps {
  trip: TripRow;
  organizationId: string;
  canAssign: boolean;
  onUpdated: () => void;
  /** Display name for current driver (avoids duplicate fetch) */
  driverName?: string | null;
  /** Display label for current vehicle (avoids duplicate fetch) */
  vehicleLabel?: string | null;
  /** For aggregate trips: partner/supplier display name (shown in Current Assignment). */
  partnerName?: string | null;
  /** Private Book (you assigned) vs Shared Network (other user assigned). When unassigned, badge can still show "Unassigned". */
  assignmentSource?: AssignmentSource;
  /** Current user id (auth.uid()). Pass to record who assigned when user saves — makes trip "Private" for this user. */
  currentUserId?: string | null;
  /** Resolved phone for the currently assigned driver (from trip detail / profile). */
  assignedDriverPhone?: string | null;
  /** When false, hide "By phone" / "Assign by phone" (e.g. asset trips). When true or undefined, show (e.g. aggregated trips). */
  showAssignByPhone?: boolean;
  /** When set (e.g. aggregated trip), called with the current vehicle input so parent can show it in Tracking block. */
  onVehicleDisplayChange?: (value: string) => void;
  /** After reassignment, show the previous driver name on the card. */
  previousDriverName?: string | null;
  /** One-line summary of latest reassignment (for inline log inside assignment card). */
  latestReassignmentSummary?: string | null;
  /** When true, show assignment as read-only (e.g. load creator / shipper can only monitor; no + Assign, Change, or Generate OTP). */
  viewOnly?: boolean;
  /** For assign-by-phone: org to create driver row in (must be assigner\'s org so RLS allows INSERT). When set (e.g. aggregate trip), use instead of organizationId for assignTripDriverByPhone. */
  driverAssignOrgId?: string | null;
  driverAvatarUri?: string | null;
  onRatingsLoaded?: (ratings: { rated_type: string; score: number }[]) => void;
  /** Request opening a specific picker modal from parent shell UI. */
  autoOpenPickerMode?: "driver" | "vehicle" | null;
  /** Bump this value to re-trigger auto-open for same mode. */
  autoOpenPickerNonce?: number;
  /** Full-page flow: open assign-by-phone wizard on mount (aggregate trips). */
  autoOpenPhoneWizard?: boolean;
  autoOpenPhoneWizardNonce?: number;
  /** After fleet driver save in full-page flow, parent opens vehicle step. */
  advanceToVehicleAfterDriverSave?: boolean;
  onFleetDriverSaved?: () => void;
  /** User closed wizard without finishing (full-page assignment route). */
  onFlowDismiss?: () => void;
  /** Assignment flow finished (vehicle saved or phone OTP dismissed). */
  onFlowComplete?: () => void;
  /** Optional extra content rendered inside this assignment card. */
  inlineSection?: ReactNode;
  /** Close parent overlays (e.g. trip “Current assignment” sheet on web) before opening add-driver / add-vehicle. */
  onBeforeRegisterNavigate?: () => void;
  /** When false, only picker modals render (used by full-page assignment flow). */
  showManifestCard?: boolean;
  /** Full-page trip assignment route — compact typography and full-screen pickers. */
  fullPageFlow?: boolean;
}

export function TripAssignmentBlock({
  trip,
  organizationId,
  canAssign,
  onUpdated,
  driverName: propsDriverName,
  vehicleLabel: propsVehicleLabel,
  partnerName,
  assignmentSource = "unassigned",
  currentUserId,
  assignedDriverPhone = null,
  showAssignByPhone = true,
  onVehicleDisplayChange,
  previousDriverName,
  latestReassignmentSummary,
  viewOnly = false,
  driverAssignOrgId,
  autoOpenPickerMode = null,
  autoOpenPickerNonce = 0,
  autoOpenPhoneWizard = false,
  autoOpenPhoneWizardNonce = 0,
  advanceToVehicleAfterDriverSave = false,
  onFleetDriverSaved,
  onFlowDismiss,
  onFlowComplete,
  inlineSection,
  onBeforeRegisterNavigate,
  showManifestCard = true,
  fullPageFlow = false,
}: TripAssignmentBlockProps) {
  /** No assign/reassign when trip is completed or when view-only (e.g. load creator monitoring). */
  const effectiveCanAssign = canAssign && !isTripCompleted(trip) && !viewOnly;

  const [_showPicker, setShowPicker] = useState(false);
  const [assignMode, setAssignMode] = useState<"driver" | "vehicle" | null>(
    null,
  );
  /** Selection preview before confirming assignment. */
  const [previewDriverId, setPreviewDriverId] = useState<string | null>(null);
  const [previewVehicleId, setPreviewVehicleId] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const router = useRouter();

  const closeAssignModal = useCallback(() => {
    setAssignMode(null);
    setPreviewDriverId(null);
    setPreviewVehicleId(null);
  }, []);

  const dismissAssignmentFlow = useCallback(() => {
    closeAssignModal();
    setShowPhoneModal(false);
    setPhoneAssignOtpReveal(null);
    if (fullPageFlow) onFlowDismiss?.();
  }, [closeAssignModal, fullPageFlow, onFlowDismiss]);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneDriverNameInput, setPhoneDriverNameInput] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneName, setPhoneName] = useState<string | null>(null);
  const [_phoneDriverBusy, setPhoneDriverBusy] = useState(false);
  const [_phoneBusyTripLabel, setPhoneBusyTripLabel] = useState<string | null>(
    null,
  );
  const [_pickPhoneVehicleId, _setPickPhoneVehicleId] = useState<string | null>(
    null,
  );
  const [phoneVehicleInput, setPhoneVehicleInput] = useState("");
  /** Own-asset vs third-party choice for the Aggregate phone-assignment flow (Issue B). null = not specified, preserves legacy AGGREGATE-default behavior. */
  const [phoneIsOwnAsset, setPhoneIsOwnAsset] = useState<boolean | null>(null);
  const [phoneModalVehicles, setPhoneModalVehicles] = useState<VehicleRow[]>(
    [],
  );
  const phoneLookupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [_otpCode, setOtpCode] = useState<string | null>(null);
  const [_otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [_otpLoading, setOtpLoading] = useState(false);
  const [otpRegenerating, setOtpRegenerating] = useState(false);
  const [_otpError, setOtpError] = useState<string | null>(null);

  const normalizeVehicleNumber = useCallback(
    (s: string) => (s || "").replace(/\s+/g, "").toUpperCase().trim(),
    [],
  );
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [activeDriverIds, setActiveDriverIds] = useState<Set<string>>(
    new Set(),
  );
  const [activeVehicleIds, setActiveVehicleIds] = useState<Set<string>>(new Set());
  const [activeDriverTripLabelById, setActiveDriverTripLabelById] = useState<Record<string, string>>({});
  const [activeVehicleTripLabelById, setActiveVehicleTripLabelById] = useState<Record<string, string>>({});
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [_pickDriverId, setPickDriverId] = useState<string | null>(
    trip.driver_id,
  );
  const [_pickVehicleId, setPickVehicleId] = useState<string | null>(
    trip.vehicle_id,
  );
  const [pickerVehicleInput, setPickerVehicleInput] = useState("");
  const [cardVehicleInput, setCardVehicleInput] = useState("");
  const [_cardVehicleSaving, setCardVehicleSaving] = useState(false);
  const [phoneModalIsReassign, setPhoneModalIsReassign] = useState(false);
  /** After aggregate assign-by-phone, show OTP before dismissing (same flow as inline OTP card). */
  const [phoneAssignOtpReveal, setPhoneAssignOtpReveal] = useState<{
    code: string;
    expires_at: string | null;
  } | null>(null);
  const [phoneAssignSuccess, setPhoneAssignSuccess] = useState<{
    driverLabel: string;
    vehicleLabel: string;
  } | null>(null);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && windowWidth >= 768;
  const isMobileAssignFlow = !isDesktop || fullPageFlow;
  const pickerPresentation =
    fullPageFlow && Platform.OS !== "web" ? "fullScreen" : "pageSheet";
  const hasDriverAssigned = !!trip.driver_id;
  const hasVehicleAssigned =
    !!trip.vehicle_id || !!String(trip.vehicle_display_number ?? "").trim();
  const canGenerateOtpNow = hasDriverAssigned && hasVehicleAssigned;
  const otpLockedByTripProgress = ["in_progress", "in_transit"].includes(
    String(trip.status ?? "").toLowerCase(),
  );

  /** When trip can no longer be edited (completed, view-only, etc.), drop focus and tear down pickers/modals. */
  useEffect(() => {
    if (!effectiveCanAssign) {
      Keyboard.dismiss();
      closeAssignModal();
      setShowPhoneModal(false);
      setPhoneAssignOtpReveal(null);
      setPhoneAssignSuccess(null);
      setShowPicker(false);
    }
  }, [effectiveCanAssign, closeAssignModal]);

  useEffect(() => {
    setPickDriverId(trip.driver_id);
    setPickVehicleId(trip.vehicle_id);
  }, [trip.driver_id, trip.vehicle_id]);

  useEffect(() => {
    if (!showAssignByPhone || !trip?.id || !canGenerateOtpNow) {
      setOtpCode(null);
      setOtpExpiresAt(null);
      setOtpError(null);
      return;
    }
    setOtpLoading(true);
    setOtpError(null);
    getTripOtpForDisplay(trip.id)
      .then(({ error, code, expires_at }) => {
        if (error) {
          setOtpError(error.message);
          setOtpCode(null);
          setOtpExpiresAt(null);
        } else {
          setOtpCode(code ?? null);
          setOtpExpiresAt(expires_at ?? null);
        }
      })
      .finally(() => setOtpLoading(false));
  }, [showAssignByPhone, trip?.id, canGenerateOtpNow]);

  useEffect(() => {
    if (showAssignByPhone && (propsVehicleLabel ?? "").trim() !== "") {
      const raw = (propsVehicleLabel ?? "").split("·")[0]?.trim() ?? "";
      setCardVehicleInput(raw ? formatIndianVehicleNumber(raw) : "");
    }
  }, [showAssignByPhone, propsVehicleLabel]);

  useEffect(() => {
    if (showAssignByPhone) {
      getVehiclesByOrganization(organizationId).then((r) =>
        setVehicles(r.error ? [] : (r.vehicles ?? [])),
      );
    }
  }, [showAssignByPhone, organizationId]);

  // "Latest callback" ref: callers (e.g. TripDetailScreen) pass inline arrow
  // functions for `onVehicleDisplayChange`, so the prop identity changes on
  // every parent render. Including it in the effect deps below would cause
  // the effect to run every render, call back to the parent's setState, and
  // produce an infinite "Maximum update depth exceeded" loop. The ref lets us
  // invoke the latest callback without making the effect re-run on identity
  // changes — the effect now only fires when `cardVehicleInput` or
  // `showAssignByPhone` actually change.
  const onVehicleDisplayChangeRef = useRef(onVehicleDisplayChange);
  useEffect(() => {
    onVehicleDisplayChangeRef.current = onVehicleDisplayChange;
  }, [onVehicleDisplayChange]);

  useEffect(() => {
    if (showAssignByPhone) {
      onVehicleDisplayChangeRef.current?.(cardVehicleInput);
    }
  }, [showAssignByPhone, cardVehicleInput]);

  const resolveVehicleIdFromInput = useCallback(
    (input: string, vehicleList: VehicleRow[]) => {
      const norm = normalizeVehicleNumber(input);
      if (!norm) return null;
      const match = vehicleList.find(
        (v) => normalizeVehicleNumber(v.vehicle_number) === norm,
      );
      return match?.id ?? null;
    },
    [normalizeVehicleNumber],
  );

  const _handleCardVehicleBlur = useCallback(async () => {
    if (!showAssignByPhone || !effectiveCanAssign) return;
    const trimmed = cardVehicleInput.trim();
    if (!trimmed) return;
    const vehicleId = resolveVehicleIdFromInput(trimmed, vehicles);
    if (vehicleId === (trip.vehicle_id ?? null)) return;
    setCardVehicleSaving(true);
    const { error } = await updateTripAssignment(
      trip.id,
      { vehicle_id: vehicleId },
      currentUserId != null
        ? {
            changedBy: currentUserId,
            driverIdPrev: trip.driver_id ?? null,
            vehicleIdPrev: trip.vehicle_id ?? null,
          }
        : undefined,
    );
    setCardVehicleSaving(false);
    if (error) return;
    onVehicleDisplayChange?.(trimmed);
    onUpdated();
  }, [
    showAssignByPhone,
    effectiveCanAssign,
    cardVehicleInput,
    vehicles,
    resolveVehicleIdFromInput,
    trip.id,
    trip.driver_id,
    trip.vehicle_id,
    currentUserId,
    onVehicleDisplayChange,
    onUpdated,
  ]);

  useEffect(() => {
    const trimmed = phoneInput.trim();
    if (!trimmed) {
      setPhoneName(null);
      setPhoneDriverBusy(false);
      setPhoneBusyTripLabel(null);
      return;
    }
    if (phoneLookupTimeoutRef.current)
      clearTimeout(phoneLookupTimeoutRef.current);
    phoneLookupTimeoutRef.current = setTimeout(() => {
      phoneLookupTimeoutRef.current = null;
      const normalized = trimmed.replace(/\s+/g, "");
      if (normalized.length < 10) {
        setPhoneName(null);
        setPhoneDriverBusy(false);
        setPhoneBusyTripLabel(null);
        return;
      }
      searchExistingDriversByPhone(normalized).then(async ({ matches }) => {
        setPhoneName(matches[0]?.full_name ?? null);
        const orgForDriver =
          (driverAssignOrgId ?? organizationId).trim() || organizationId;
        const { result } = driverAssignOrgId
          ? await getDriverAvailabilityByPhoneGlobal(normalized, {
              excludeTripId: trip.id,
              anyOpenTripBlocks: true,
              requireAuthoritativeRpc: true,
            })
          : await getDriverAvailabilityByPhone(orgForDriver, normalized, {
              excludeTripId: trip.id,
            });
        setPhoneDriverBusy(result.isBusy);
        setPhoneBusyTripLabel(result.ongoingTripLabel ?? null);
      });
    }, 400);
    return () => {
      if (phoneLookupTimeoutRef.current)
        clearTimeout(phoneLookupTimeoutRef.current);
    };
  }, [phoneInput, driverAssignOrgId, organizationId, trip.id]);

  const applyPhoneDriverDisplayName = useCallback(
    async (driverId: string | null | undefined, orgForDriver: string) => {
      const customName = phoneDriverNameInput.trim();
      if (!driverId || customName.length < 2 || /^driver$/i.test(customName)) {
        return;
      }
      // Always stamp — aggregate RPC may leave placeholder "Driver" even when the
      // dispatcher kept the phone-lookup suggestion (previously skipped as no-op).
      await updateDriver(orgForDriver, driverId, { name: customName });
    },
    [phoneDriverNameInput],
  );

  const assignByPhone = useCallback(async () => {
    const trimmed = phoneInput.trim();
    const driverNameTrimmed = phoneDriverNameInput.trim();
    if (!driverNameTrimmed || driverNameTrimmed.length < 2) {
      setPhoneError("Enter driver name (at least 2 characters).");
      return;
    }
    if (!trimmed) {
      setPhoneError("Enter driver phone number.");
      return;
    }
    const err = validatePhone(trimmed);
    if (err) {
      setPhoneError(err);
      return;
    }
    const orgForDriver =
      (driverAssignOrgId ?? organizationId).trim() || organizationId;
    const { error: availabilityError, result: availability } = driverAssignOrgId
      ? await getDriverAvailabilityByPhoneGlobal(trimmed, {
          excludeTripId: trip.id,
          anyOpenTripBlocks: true,
          requireAuthoritativeRpc: true,
        })
      : await getDriverAvailabilityByPhone(orgForDriver, trimmed, {
          excludeTripId: trip.id,
        });
    if (availabilityError) {
      setPhoneError(
        humanizeTripIdInRpcError(availabilityError.message, trip),
      );
      return;
    }
    if (availability.isBusy) {
      const conflictTripLabel =
        availability.ongoingTripLabel ?? "another ongoing trip";
      setPhoneDriverBusy(true);
      setPhoneBusyTripLabel(conflictTripLabel);
      setPhoneError(
        `Driver is currently on ${conflictTripLabel}. Contact the driver first; if they are offline or unreachable, assign a different driver for this trip.`,
      );
      return;
    }
    setPhoneError(null);
    setPhoneSaving(true);
    const auditOpts =
      currentUserId != null
        ? {
            changedBy: currentUserId,
            driverIdPrev: trip.driver_id ?? null,
            vehicleIdPrev: trip.vehicle_id ?? null,
          }
        : undefined;
    const assignOpts = {
      ...auditOpts,
      trackingOnly: !!(trip.supplier_id && String(trip.supplier_id).trim()),
      // For reassignment, always require OTP claim (do not show trip directly to any driver).
      forceOtpClaim: phoneModalIsReassign,
      driverName: driverNameTrimmed,
    };
    const existingVehicleDisplay = (
      trip.vehicle_display_number ??
      propsVehicleLabel ??
      ""
    )
      .trim()
      .split("·")[0]
      ?.trim();
    const effectiveVehicleInput =
      phoneVehicleInput.trim() ||
      (phoneModalIsReassign ? formatIndianVehicleNumber(existingVehicleDisplay) : "");
    const vehicleNumNormEffective = normalizeVehicleNumber(effectiveVehicleInput);
    const matchedVehicle = vehicleNumNormEffective
      ? phoneModalVehicles.find(
          (v) => normalizeVehicleNumber(v.vehicle_number) === vehicleNumNormEffective,
        )
      : null;
    if (matchedVehicle) {
      const { error: vehicleBusyErr, trip: vehicleBusyTrip } =
        await getVehicleOngoingTrip(matchedVehicle.id, trip.id);
      if (!vehicleBusyErr && vehicleBusyTrip) {
        const vehicleLabel = getTripDisplayNumber(vehicleBusyTrip);
        setPhoneSaving(false);
        if (availability.isBusy) {
          const driverLabel =
            availability.ongoingTripLabel ?? "another ongoing trip";
          setPhoneError(
            `Driver is already in ${driverLabel} and vehicle is already in ${vehicleLabel}.`,
          );
          return;
        }
        setPhoneError(`Vehicle is already assigned to ${vehicleLabel}.`);
        return;
      }
    }

    if (driverAssignOrgId) {
      // Pass the fleet vehicle ID directly to the RPC so driver + vehicle are assigned
      // atomically in one SECURITY DEFINER call.  The previous pattern of calling
      // assignAggregateTripDriverByPhone then updateTripAssignment separately failed
      // when the supplier record lacked linked_organization_id (RLS gap on direct update).
      const { error: rpcErr, trip: assignedTrip } = await assignAggregateTripDriverByPhone(
        trip.id,
        orgForDriver,
        trimmed,
        matchedVehicle ? null : effectiveVehicleInput.trim() || null,
        matchedVehicle?.id ?? null,    // ← pass vehicle_id to RPC directly
        trip.driver_id ?? null,        // previousDriverId
        driverNameTrimmed,             // persist typed name instead of 'Driver' placeholder
        phoneIsOwnAsset == null ? null : phoneIsOwnAsset ? "ASSET" : "AGGREGATE",
      );
      if (rpcErr) {
        setPhoneSaving(false);
        setPhoneError(humanizeTripIdInRpcError(rpcErr.message, trip));
        return;
      }
      await applyPhoneDriverDisplayName(assignedTrip?.driver_id, orgForDriver);
    } else {
      const { error, trip: assignedTrip } = await assignTripDriverByPhone(
        trip.id,
        orgForDriver,
        trimmed,
        assignOpts,
      );
      if (error) {
        setPhoneSaving(false);
        setPhoneError(humanizeTripIdInRpcError(error.message, trip));
        return;
      }
      await applyPhoneDriverDisplayName(assignedTrip?.driver_id, orgForDriver);
      if (matchedVehicle) {
        const { error: vehicleErr } = await updateTripAssignment(
          trip.id,
          { vehicle_id: matchedVehicle.id },
          auditOpts,
        );
        if (vehicleErr)
          setPhoneError(humanizeTripIdInRpcError(vehicleErr.message, trip));
      } else if (effectiveVehicleInput.trim()) {
        const { error: vehicleErr } = await updateTripAssignment(
          trip.id,
          {
            vehicle_id: null,
            vehicle_display_number: effectiveVehicleInput.trim(),
          },
          auditOpts,
        );
        if (vehicleErr)
          setPhoneError(humanizeTripIdInRpcError(vehicleErr.message, trip));
      }
    }
    const willHaveVehicleAssigned =
      !!matchedVehicle ||
      !!effectiveVehicleInput.trim() ||
      !!trip.vehicle_id ||
      !!String(trip.vehicle_display_number ?? "").trim();

    const isAggregateTripFlow = !!(
      trip.supplier_id && String(trip.supplier_id).trim()
    );

    let regenOtp: {
      error: Error | null;
      code: string | null;
      expires_at: string | null;
    } = { error: null, code: null, expires_at: null };

    // OTP is allowed only after both driver and vehicle are assigned.
    if (willHaveVehicleAssigned && !otpLockedByTripProgress) {
      regenOtp = await regenerateTripOtp(trip.id);
      if (!regenOtp.error && regenOtp.code != null) {
        setOtpCode(regenOtp.code);
        setOtpExpiresAt(regenOtp.expires_at ?? null);
      }
    }

    setPhoneSaving(false);

    // Prefer OTP reveal whenever a code was issued — Confirm & close dismisses the panel.
    if (
      willHaveVehicleAssigned &&
      !otpLockedByTripProgress &&
      regenOtp.code &&
      !regenOtp.error
    ) {
      setPhoneAssignOtpReveal({
        code: regenOtp.code,
        expires_at: regenOtp.expires_at ?? null,
      });
      onUpdated();
      return;
    }

    if (
      isAggregateTripFlow &&
      willHaveVehicleAssigned &&
      !otpLockedByTripProgress &&
      regenOtp.error
    ) {
      setPhoneError(humanizeTripIdInRpcError(regenOtp.error.message, trip));
      onUpdated();
      return;
    }

    const successDriver =
      phoneDriverNameInput.trim() || phoneName?.trim() || "Driver";
    const successVehicle =
      formatIndianVehicleNumber(
        effectiveVehicleInput.trim() ||
          trip.vehicle_display_number ||
          propsVehicleLabel ||
          "",
      ).trim() || "—";
    setPhoneAssignSuccess({
      driverLabel: successDriver,
      vehicleLabel: successVehicle,
    });
    onUpdated();
    // Keep modal open on success panel — Confirm & close dismisses.
  }, [
    trip.id,
    trip.driver_id,
    trip.vehicle_id,
    trip.supplier_id,
    organizationId,
    driverAssignOrgId,
    phoneInput,
    phoneDriverNameInput,
    phoneVehicleInput,
    phoneIsOwnAsset,
    applyPhoneDriverDisplayName,
    phoneModalVehicles,
    phoneModalIsReassign,
    currentUserId,
    propsVehicleLabel,
    trip.vehicle_display_number,
    phoneName,
    normalizeVehicleNumber,
    otpLockedByTripProgress,
    onUpdated,
  ]);

  const _handleRegenerateOtp = useCallback(async () => {
    if (!trip?.id || otpRegenerating || !canGenerateOtpNow || otpLockedByTripProgress) return;
    setOtpError(null);
    setOtpRegenerating(true);
    try {
      const { error, code, expires_at } = await regenerateTripOtp(trip.id);
      if (error) {
        setOtpError(error.message);
        return;
      }
      setOtpCode(code ?? null);
      setOtpExpiresAt(expires_at ?? null);
    } finally {
      setOtpRegenerating(false);
    }
  }, [trip?.id, otpRegenerating, canGenerateOtpNow, otpLockedByTripProgress]);

  const _handleGenerateOtp = useCallback(async () => {
    if (!trip?.id || otpRegenerating || !canGenerateOtpNow || otpLockedByTripProgress) return;
    setOtpError(null);
    setOtpRegenerating(true);
    try {
      const { error, code, expires_at } = await generateTripOtp(trip.id);
      if (error) {
        setOtpError(error.message);
        return;
      }
      setOtpCode(code ?? null);
      setOtpExpiresAt(expires_at ?? null);
    } finally {
      setOtpRegenerating(false);
    }
  }, [trip?.id, otpRegenerating, canGenerateOtpNow, otpLockedByTripProgress]);

  const openPhoneModal = useCallback(
    (isReassign?: boolean, initialVehicle?: string) => {
      setPhoneModalIsReassign(isReassign ?? false);
      setPhoneAssignOtpReveal(null);
      setPhoneAssignSuccess(null);
      setPhoneError(null);
      setPhoneName(null);
      const existingName = (
        propsDriverName ??
        trip.driver_display_name ??
        ""
      ).trim();
      setPhoneDriverNameInput(existingName);
      const existingPhone = (
        assignedDriverPhone ??
        drivers.find((d) => d.id === trip.driver_id)?.phone ??
        ""
      ).trim();
      // Prefill current mobile for reassign Edit details; blank for first-time assign.
      setPhoneInput(
        isReassign && existingPhone
          ? formatMobileNumber(existingPhone)
          : "",
      );
      const vehiclePrefill =
        initialVehicle != null && initialVehicle.trim() !== ""
          ? formatIndianVehicleNumber(
              initialVehicle.trim().split("·")[0]?.trim() ??
                initialVehicle.trim(),
            )
          : "";
      setPhoneVehicleInput(vehiclePrefill);
      setShowPhoneModal(true);
      if (!showAssignByPhone) {
        getVehiclesByOrganization(organizationId).then((r) =>
          setPhoneModalVehicles(r.error ? [] : (r.vehicles ?? [])),
        );
      } else {
        setPhoneModalVehicles([]);
      }
    },
    [
      organizationId,
      showAssignByPhone,
      propsDriverName,
      trip.driver_display_name,
      trip.driver_id,
      assignedDriverPhone,
      drivers,
    ],
  );

  const currentAssignedDriverPhone = useMemo(() => {
    const fromProp = (assignedDriverPhone ?? "").trim();
    if (fromProp) return fromProp;
    const row = drivers.find((d) => d.id === trip.driver_id);
    return row?.phone?.trim() ?? null;
  }, [assignedDriverPhone, drivers, trip.driver_id]);

  const pilotText =
    propsDriverName ??
    ((trip.driver_display_name ?? "").trim() || (trip.driver_id ? "—" : "—"));
  const rawVehicleText =
    (propsVehicleLabel ?? "").trim() ||
    (trip.vehicle_display_number?.trim()
      ? formatIndianVehicleNumber(trip.vehicle_display_number.trim())
      : "") ||
    "";
  // Display as "PLATE • TYPE" (bullet + uppercase type) to match design
  const vehicleText =
    rawVehicleText === ""
      ? "—"
      : rawVehicleText.includes("·")
        ? rawVehicleText
            .split("·")
            .map((s) => s.trim())
            .filter(Boolean)
            .join(" • ")
        : rawVehicleText;

  /** When assigned, show only "Private Book" (no "Shared Network" label). */
  const sourceLabel =
    assignmentSource === "private" || assignmentSource === "shared"
      ? "Private Book"
      : "Unassigned";
  const sourceBadgeStyle =
    assignmentSource === "private" || assignmentSource === "shared"
      ? styles.badgePrivate
      : styles.badgeUnassigned;
  const hasDriver = !!(
    trip.driver_id || (trip.driver_display_name ?? "").trim()
  );
  const hasVehicle = !!(
    trip.vehicle_id ||
    (trip.vehicle_display_number ?? "").trim() ||
    (propsVehicleLabel ?? "").trim()
  );
  const hasAssignment = hasDriver || hasVehicle;
  const showSourceBadge = hasAssignment && assignmentSource !== "unassigned";

  /**
   * Aggregate trips: keep driver row interactive so dispatcher can reassign by phone.
   * (Completed/view-only states are still blocked by `effectiveCanAssign`.)
   */
  const suppressAggregateDriverAssignTap = false;
  /**
   * Vehicle row stays locked once set in aggregate flow; vehicle changes should happen
   * through the same assign-by-phone modal used for driver assignment/reassignment.
   */
  const suppressAggregateVehicleAssignTap = showAssignByPhone && hasVehicle;

  const openDriverPicker = useCallback(() => {
    if (showAssignByPhone) {
      openPhoneModal(
        hasDriver || !!(previousDriverName ?? "").trim(),
        propsVehicleLabel ?? trip.vehicle_display_number ?? "",
      );
      return;
    }
    setAssignMode("driver");
    setAssignSearch("");
    setPickDriverId(trip.driver_id);
    setPreviewDriverId(trip.driver_id);
    setPreviewVehicleId(trip.vehicle_id);
    Promise.all([
      getDriversByOrganization(organizationId),
      getActiveDriverIds(organizationId),
      getTripsByOrganization(organizationId),
      getVehiclesByOrganization(organizationId),
    ]).then(([r, busyIds, tripsRes, vehiclesRes]) => {
      const list = r.error ? [] : (r.drivers ?? []);
      setDrivers(list.filter((d) => !d.left_at));
      setActiveDriverIds(busyIds);
      setVehicles(vehiclesRes.error ? [] : (vehiclesRes.vehicles ?? []));
      const activeTrips = (tripsRes.error ? [] : (tripsRes.trips ?? [])).filter((t) => {
        const s = String(t.status ?? "").toLowerCase();
        return !isTripCompleted(t) && s !== "cancelled";
      });
      const labels: Record<string, string> = {};
      const vehicleIds = new Set<string>();
      const vehicleLabels: Record<string, string> = {};
      for (const t of activeTrips) {
        if (t.id === trip.id) continue;
        if (t.driver_id) labels[t.driver_id] = getTripDisplayNumber(t);
        if (t.vehicle_id) {
          vehicleIds.add(t.vehicle_id);
          vehicleLabels[t.vehicle_id] = getTripDisplayNumber(t);
        }
      }
      setActiveDriverTripLabelById(labels);
      setActiveVehicleIds(vehicleIds);
      setActiveVehicleTripLabelById(vehicleLabels);
    });
  }, [
    organizationId,
    trip.driver_id,
    trip.vehicle_id,
    trip.id,
    showAssignByPhone,
    openPhoneModal,
    hasDriver,
    previousDriverName,
    propsVehicleLabel,
    trip.vehicle_display_number,
  ]);

  const openVehiclePicker = useCallback(() => {
    if (showAssignByPhone) {
      setAssignMode("vehicle");
      setAssignSearch("");
      setPickVehicleId(null);
      setPreviewVehicleId(null);
      setVehicles([]);
      if ((propsVehicleLabel ?? "").trim() !== "") {
        const raw = (propsVehicleLabel ?? "").split("·")[0]?.trim() ?? "";
        setPickerVehicleInput(raw ? formatIndianVehicleNumber(raw) : "");
      } else if (trip.vehicle_display_number?.trim()) {
        setPickerVehicleInput(
          formatIndianVehicleNumber(trip.vehicle_display_number.trim()),
        );
      } else {
        setPickerVehicleInput("");
      }
      return;
    }
    setAssignMode("vehicle");
    setAssignSearch("");
    setPickVehicleId(trip.vehicle_id);
    setPreviewVehicleId(trip.vehicle_id);
    setPreviewDriverId(trip.driver_id);
    if ((propsVehicleLabel ?? "").trim() !== "") {
      const raw = (propsVehicleLabel ?? "").split("·")[0]?.trim() ?? "";
      setPickerVehicleInput(raw ? formatIndianVehicleNumber(raw) : "");
    } else if (trip.vehicle_display_number?.trim()) {
      setPickerVehicleInput(
        formatIndianVehicleNumber(trip.vehicle_display_number.trim()),
      );
    } else {
      setPickerVehicleInput("");
    }
    Promise.all([
      getVehiclesByOrganization(organizationId),
      getTripsByOrganization(organizationId),
      getDriversByOrganization(organizationId),
      getActiveDriverIds(organizationId),
    ]).then(([vehiclesRes, tripsRes, driversRes, busyDriverIds]) => {
      setVehicles(vehiclesRes.error ? [] : (vehiclesRes.vehicles ?? []));
      const list = driversRes.error ? [] : (driversRes.drivers ?? []);
      setDrivers(list.filter((d) => !d.left_at));
      setActiveDriverIds(busyDriverIds);
      const activeTrips = (tripsRes.error ? [] : (tripsRes.trips ?? [])).filter((t) => {
        const s = String(t.status ?? "").toLowerCase();
        return !isTripCompleted(t) && s !== "cancelled";
      });
      const ids = new Set<string>();
      const labels: Record<string, string> = {};
      const driverLabels: Record<string, string> = {};
      for (const t of activeTrips) {
        if (t.id === trip.id) continue;
        if (t.vehicle_id) {
          ids.add(t.vehicle_id);
          labels[t.vehicle_id] = getTripDisplayNumber(t);
        }
        if (t.driver_id) driverLabels[t.driver_id] = getTripDisplayNumber(t);
      }
      setActiveVehicleIds(ids);
      setActiveVehicleTripLabelById(labels);
      setActiveDriverTripLabelById(driverLabels);
    });
  }, [
    organizationId,
    trip.vehicle_id,
    trip.driver_id,
    trip.vehicle_display_number,
    propsVehicleLabel,
    trip.id,
  ]);

  useEffect(() => {
    if (!effectiveCanAssign) return;
    if (autoOpenPhoneWizard && showAssignByPhone) {
      openPhoneModal(
        hasDriver || !!(previousDriverName ?? "").trim(),
        propsVehicleLabel ?? trip.vehicle_display_number ?? "",
      );
      return;
    }
    if (!autoOpenPickerMode) return;
    if (autoOpenPickerMode === "driver") {
      openDriverPicker();
      return;
    }
    openVehiclePicker();
  }, [
    autoOpenPhoneWizard,
    autoOpenPhoneWizardNonce,
    showAssignByPhone,
    autoOpenPickerMode,
    autoOpenPickerNonce,
    effectiveCanAssign,
    openDriverPicker,
    openVehiclePicker,
    openPhoneModal,
    hasDriver,
    previousDriverName,
    propsVehicleLabel,
    trip.vehicle_display_number,
  ]);

  const aggregateDriverUsesPhone =
    showAssignByPhone && assignMode === "driver";

  const saveDriverOnly = useCallback(
    async (driverId: string | null) => {
      if (driverId && driverId !== trip.driver_id && activeDriverIds.has(driverId)) {
        const label = activeDriverTripLabelById[driverId] ?? "another ongoing trip";
        Alert.alert("Driver already in trip", `Driver is already assigned to ${label}.`);
        return;
      }
      setSaving(true);
      try {
        const { error } = await updateTripAssignment(
          trip.id,
          { driver_id: driverId },
          currentUserId != null
            ? {
                changedBy: currentUserId,
                driverIdPrev: trip.driver_id ?? null,
                vehicleIdPrev: trip.vehicle_id ?? null,
              }
            : undefined,
        );
        if (error) {
          Alert.alert("Save failed", error.message, [{ text: "OK" }]);
          return;
        }
        closeAssignModal();
        onUpdated();
        if (fullPageFlow && advanceToVehicleAfterDriverSave) {
          onFleetDriverSaved?.();
        }
      } finally {
        setSaving(false);
      }
    },
    [
      trip.id,
      trip.driver_id,
      trip.vehicle_id,
      currentUserId,
      onUpdated,
      activeDriverIds,
      activeDriverTripLabelById,
      closeAssignModal,
      fullPageFlow,
      advanceToVehicleAfterDriverSave,
      onFleetDriverSaved,
    ],
  );

  const saveVehicleOnly = useCallback(
    async (
      vehicleId: string | null,
      vehicleDisplayNumber: string | null = null,
    ) => {
      if (vehicleId && vehicleId !== trip.vehicle_id && activeVehicleIds.has(vehicleId)) {
        const label = activeVehicleTripLabelById[vehicleId] ?? "another ongoing trip";
        Alert.alert("Vehicle already in trip", `Vehicle is already assigned to ${label}.`);
        return;
      }
      setSaving(true);
      try {
        const payload: Parameters<typeof updateTripAssignment>[1] = {
          vehicle_id: vehicleId,
        };
        if (vehicleDisplayNumber != null)
          payload.vehicle_display_number = vehicleDisplayNumber;
        const { error } = await updateTripAssignment(
          trip.id,
          payload,
          currentUserId != null
            ? {
                changedBy: currentUserId,
                driverIdPrev: trip.driver_id ?? null,
                vehicleIdPrev: trip.vehicle_id ?? null,
              }
            : undefined,
        );
        if (error) {
          Alert.alert("Save failed", error.message, [{ text: "OK" }]);
          return;
        }
        closeAssignModal();
        if (showAssignByPhone && vehicleDisplayNumber) {
          setCardVehicleInput(vehicleDisplayNumber);
          onVehicleDisplayChange?.(vehicleDisplayNumber);
        }
        onUpdated();
        if (fullPageFlow) onFlowComplete?.();
      } finally {
        setSaving(false);
      }
    },
    [
      trip.id,
      trip.driver_id,
      trip.vehicle_id,
      currentUserId,
      showAssignByPhone,
      onVehicleDisplayChange,
      onUpdated,
      activeVehicleIds,
      activeVehicleTripLabelById,
      closeAssignModal,
      fullPageFlow,
      onFlowComplete,
    ],
  );

  const filteredDrivers = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    const searched = q
      ? drivers.filter(
          (d) =>
            (d.name ?? "").toLowerCase().includes(q) ||
            (d.phone ?? "").replace(/\s+/g, "").includes(q.replace(/\s+/g, "")),
        )
      : drivers;
    const withoutCurrent = searched.filter((d) => d.id !== trip.driver_id);

    // Asset-based reassignment (no assign-by-phone): list available drivers first.
    if (!showAssignByPhone) {
      const availabilityRank = (d: DriverRow) => {
        const isOnTrip = activeDriverIds.has(d.id) && d.id !== trip.driver_id;
        if (d.left_at) return 2;
        if (isOnTrip) return 1;
        return 0; // available
      };
      return [...withoutCurrent].sort((a, b) => {
        const rankDiff = availabilityRank(a) - availabilityRank(b);
        if (rankDiff !== 0) return rankDiff;
        return (a.name ?? "").localeCompare(b.name ?? "");
      });
    }

    return withoutCurrent;
  }, [
    drivers,
    assignSearch,
    showAssignByPhone,
    activeDriverIds,
    trip.driver_id,
  ]);

  const filteredVehicles = useMemo(() => {
    const withoutCurrent = vehicles.filter((v) => v.id !== trip.vehicle_id);
    if (!assignSearch.trim()) return withoutCurrent;
    const q = assignSearch.trim().toLowerCase();
    return withoutCurrent.filter(
      (v) =>
        (v.vehicle_number ?? "").toLowerCase().includes(q) ||
        (v.vehicle_type ?? "").toLowerCase().includes(q),
    );
  }, [vehicles, assignSearch, trip.vehicle_id]);

  const getDriverRatingMeta = useCallback((driver: DriverRow) => {
    const data = driver as DriverRow & {
      rating?: number | string | null;
      rating_avg?: number | string | null;
      avg_rating?: number | string | null;
      rating_count?: number | string | null;
      ratings_count?: number | string | null;
      total_ratings?: number | string | null;
    };

    const rawRating = data.rating ?? data.rating_avg ?? data.avg_rating ?? null;
    const numericRating =
      rawRating == null
        ? NaN
        : typeof rawRating === "number"
          ? rawRating
          : Number(rawRating);
    if (!Number.isFinite(numericRating)) return null;

    const rawCount =
      data.rating_count ?? data.ratings_count ?? data.total_ratings ?? null;
    const numericCount =
      rawCount == null
        ? NaN
        : typeof rawCount === "number"
          ? rawCount
          : Number(rawCount);

    return {
      ratingLabel: numericRating.toFixed(1),
      countLabel:
        Number.isFinite(numericCount) && numericCount > 0
          ? `(${Math.round(numericCount)})`
          : null,
    };
  }, []);

  // Auto-preview for legacy list+sidebar picker only (phone / aggregate).
  // Fleet workspace owns its own selection — skip so effects cannot clobber taps.
  useEffect(() => {
    if (!showAssignByPhone) return;
    if (assignMode !== "driver") return;
    const list = filteredDrivers;
    if (!list.length) {
      setPreviewDriverId(null);
      return;
    }
    const driverBusyFn = (did: string) =>
      activeDriverIds.has(did) && did !== trip.driver_id;
    const firstFree = list.find((d) => {
      const onTrip = driverBusyFn(d.id);
      const available = !d.left_at && !onTrip;
      return available;
    });
    setPreviewDriverId((prev) => {
      if (prev && list.some((d) => d.id === prev)) {
        const d = list.find((x) => x.id === prev)!;
        const onTrip = driverBusyFn(d.id);
        const ok = !d.left_at && !onTrip;
        if (ok) return prev;
      }
      return firstFree?.id ?? list[0]?.id ?? null;
    });
  }, [showAssignByPhone, assignMode, filteredDrivers, activeDriverIds, trip.driver_id]);

  useEffect(() => {
    if (!showAssignByPhone) return;
    if (assignMode !== "vehicle") return;
    const list = filteredVehicles;
    if (!list.length) {
      setPreviewVehicleId(null);
      return;
    }
    const vehicleBusyFn = (vid: string) =>
      activeVehicleIds.has(vid) && vid !== trip.vehicle_id;
    const firstFree = list.find((v) => !vehicleBusyFn(v.id));
    setPreviewVehicleId((prev) => {
      if (prev && list.some((v) => v.id === prev)) {
        if (!vehicleBusyFn(prev)) return prev;
      }
      return firstFree?.id ?? list[0]?.id ?? null;
    });
  }, [showAssignByPhone, assignMode, filteredVehicles, activeVehicleIds, trip.vehicle_id]);

  const executePreviewAssignment = useCallback(async () => {
    if (assignMode === "driver") {
      if (!previewDriverId) return;
      await saveDriverOnly(previewDriverId);
      return;
    }
    if (assignMode === "vehicle") {
      if (!previewVehicleId) return;
      await saveVehicleOnly(previewVehicleId);
    }
  }, [
    assignMode,
    previewDriverId,
    previewVehicleId,
    saveDriverOnly,
    saveVehicleOnly,
  ]);

  const executeFleetWorkspaceAssignWithIds = useCallback(
    async (driverId: string, vehicleId: string) => {
      if (driverId !== trip.driver_id && activeDriverIds.has(driverId)) {
        const label =
          activeDriverTripLabelById[driverId] ?? "another ongoing trip";
        Alert.alert("Driver already in trip", `Driver is already assigned to ${label}.`);
        return;
      }
      if (vehicleId !== trip.vehicle_id && activeVehicleIds.has(vehicleId)) {
        const label =
          activeVehicleTripLabelById[vehicleId] ?? "another ongoing trip";
        Alert.alert("Vehicle already in trip", `Vehicle is already assigned to ${label}.`);
        return;
      }
      setSaving(true);
      try {
        const { error } = await updateTripAssignment(
          trip.id,
          { driver_id: driverId, vehicle_id: vehicleId },
          currentUserId != null
            ? {
                changedBy: currentUserId,
                driverIdPrev: trip.driver_id ?? null,
                vehicleIdPrev: trip.vehicle_id ?? null,
              }
            : undefined,
        );
        if (error) {
          Alert.alert("Save failed", error.message, [{ text: "OK" }]);
          return;
        }
        closeAssignModal();
        onUpdated();
        if (fullPageFlow) onFlowComplete?.();
      } finally {
        setSaving(false);
      }
    },
    [
      trip.id,
      trip.driver_id,
      trip.vehicle_id,
      activeDriverIds,
      activeVehicleIds,
      activeDriverTripLabelById,
      activeVehicleTripLabelById,
      currentUserId,
      closeAssignModal,
      onUpdated,
      fullPageFlow,
      onFlowComplete,
    ],
  );

  const pilotCodeFromName = (name: string) => {
    const p = name.trim().split(/\s+/).filter(Boolean);
    const a = (p[0]?.[0] ?? "?").toUpperCase();
    const b = (p[1]?.[0] ?? "").toUpperCase();
    return (a + b).slice(0, 2);
  };

  const vehicleTileCode = (v: VehicleRow) => {
    const plate = formatIndianVehicleNumber(v.vehicle_number).replace(/\s/g, "");
    return plate.slice(-3).toUpperCase() || "V";
  };

  const previewDriverRow =
    assignMode === "driver" && previewDriverId
      ? filteredDrivers.find((d) => d.id === previewDriverId)
      : null;
  const previewVehicleRow =
    assignMode === "vehicle" && previewVehicleId
      ? filteredVehicles.find((v) => v.id === previewVehicleId)
      : null;

  const previewDriverBusy =
    !!previewDriverRow &&
    activeDriverIds.has(previewDriverRow.id) &&
    previewDriverRow.id !== trip.driver_id;
  const previewVehicleBusy =
    !!previewVehicleRow &&
    activeVehicleIds.has(previewVehicleRow.id) &&
    previewVehicleRow.id !== trip.vehicle_id;

  const pilotEfficiencyPct = (d: DriverRow | null | undefined) => {
    const meta = d ? getDriverRatingMeta(d) : null;
    const r = meta ? Number(meta.ratingLabel) : NaN;
    if (Number.isFinite(r)) return Math.min(100, Math.round(r * 20));
    return 88;
  };

  const vehicleHealthPct = (v: VehicleRow | null | undefined) => {
    if (!v) return 95;
    const st = String(v.status ?? "").toLowerCase();
    if (st.includes("maint")) return 72;
    if (st.includes("avail") || st.includes("ready")) return 96;
    return 90;
  };

  const renderAllocationSidebar = () => {
    if (assignMode === "driver") {
      const d = previewDriverRow;
      if (!d) {
        return (
          <View style={styles.allocSidebarEmpty}>
            <Text style={styles.allocSidebarEmptyText}>Choose a driver</Text>
          </View>
        );
      }
      const meta = getDriverRatingMeta(d);
      const busy = previewDriverBusy;
      const eff = pilotEfficiencyPct(d);
      const eth = Math.min(
        100,
        Math.round((meta ? Number(meta.ratingLabel) : 4.5) * 20),
      );
      return (
        <View style={styles.allocSidebarInner}>
          <View style={styles.allocSidebarHero}>
            <View style={styles.allocSidebarAvatar}>
              <Text style={styles.allocSidebarAvatarText}>
                {pilotCodeFromName(d.name ?? "?")}
              </Text>
            </View>
          </View>
          <Text style={styles.allocSidebarName} numberOfLines={2}>
            {d.name ?? "—"}
          </Text>
          <View style={styles.allocSidebarChip}>
            <Text style={styles.allocSidebarChipText}>Your fleet</Text>
          </View>
          <View style={styles.allocMetricBlock}>
            <View style={styles.allocMetricHead}>
              <Text style={styles.allocMetricLabel}>Performance</Text>
              <Text style={styles.allocMetricPct}>{eff}%</Text>
            </View>
            <View style={styles.allocMetricTrack}>
              <View style={[styles.allocMetricFillDark, { width: `${eff}%` }]} />
            </View>
          </View>
          <View style={styles.allocMetricBlock}>
            <View style={styles.allocMetricHead}>
              <Text style={styles.allocMetricLabel}>Reliability</Text>
              <Text style={styles.allocMetricPct}>{eth}%</Text>
            </View>
            <View style={styles.allocMetricTrack}>
              <View style={[styles.allocMetricFillBlue, { width: `${eth}%` }]} />
            </View>
          </View>
          <View style={styles.allocMiniGrid}>
            <View style={styles.allocMiniCell}>
              <Text style={styles.allocMiniVal}>—</Text>
              <Text style={styles.allocMiniLbl}>Trips</Text>
            </View>
            <View style={styles.allocMiniCell}>
              <Text style={styles.allocMiniVal}>
                {meta ? `${meta.ratingLabel}★` : "—"}
              </Text>
              <Text style={styles.allocMiniLbl}>Rating</Text>
            </View>
          </View>
          {busy ? (
            <Text style={styles.allocSidebarWarn}>
              This driver is already on another trip. Choose someone else.
            </Text>
          ) : null}
          {isDesktop ? (
            <>
              <TouchableOpacity
                style={[
                  styles.allocExecuteBtn,
                  (busy || saving || !previewDriverId) && styles.allocExecuteBtnDis,
                ]}
                disabled={saving || busy || !previewDriverId}
                onPress={() => void executePreviewAssignment()}
                activeOpacity={0.9}
              >
                <Text style={styles.allocExecuteBtnText}>Save assignment</Text>
              </TouchableOpacity>
              <Text style={styles.allocVerifyHint}>Check details before saving.</Text>
            </>
          ) : null}
        </View>
      );
    }
    const v = previewVehicleRow;
    if (!v) {
      return (
        <View style={styles.allocSidebarEmpty}>
          <Text style={styles.allocSidebarEmptyText}>Choose a vehicle</Text>
        </View>
      );
    }
    const plate = formatIndianVehicleNumber(v.vehicle_number);
    const hp = vehicleHealthPct(v);
    const busy = previewVehicleBusy;
    return (
      <View style={styles.allocSidebarInner}>
        <View style={styles.allocSidebarHero}>
          <View style={styles.allocSidebarAvatar}>
            <Text style={styles.allocSidebarAvatarText}>{vehicleTileCode(v)}</Text>
          </View>
        </View>
        <Text style={styles.allocSidebarName} numberOfLines={2}>
          {plate}
        </Text>
        <View style={styles.allocSidebarChip}>
          <Text style={styles.allocSidebarChipText}>Fleet vehicle</Text>
        </View>
        <View style={styles.allocMetricBlock}>
          <View style={styles.allocMetricHead}>
            <Text style={styles.allocMetricLabel}>Condition</Text>
            <Text style={styles.allocMetricPct}>{hp}%</Text>
          </View>
          <View style={styles.allocMetricTrack}>
            <View style={[styles.allocMetricFillDark, { width: `${hp}%` }]} />
          </View>
        </View>
        <View style={styles.allocMetricBlock}>
          <View style={styles.allocMetricHead}>
            <Text style={styles.allocMetricLabel}>Status</Text>
            <Text style={styles.allocMetricPct}>Good</Text>
          </View>
          <View style={styles.allocMetricTrack}>
            <View style={[styles.allocMetricFillBlue, { width: "96%" }]} />
          </View>
        </View>
        <View style={styles.allocMiniGrid}>
          <View style={styles.allocMiniCell}>
            <Text style={styles.allocMiniVal}>{v.capacity ?? "—"}</Text>
            <Text style={styles.allocMiniLbl}>Capacity</Text>
          </View>
          <View style={styles.allocMiniCell}>
            <Text style={styles.allocMiniVal}>{hp}%</Text>
            <Text style={styles.allocMiniLbl}>Health</Text>
          </View>
        </View>
        {busy ? (
          <Text style={styles.allocSidebarWarn}>
            Vehicle is busy on another trip.
          </Text>
        ) : null}
        {isDesktop ? (
          <>
            <TouchableOpacity
              style={[
                styles.allocExecuteBtn,
                (busy || saving || !previewVehicleId) && styles.allocExecuteBtnDis,
              ]}
              disabled={saving || busy || !previewVehicleId}
              onPress={() => void executePreviewAssignment()}
              activeOpacity={0.9}
            >
              <Text style={styles.allocExecuteBtnText}>Save assignment</Text>
            </TouchableOpacity>
            <Text style={styles.allocVerifyHint}>Check details before saving.</Text>
          </>
        ) : null}
      </View>
    );
  };

  const mobileAssignPreviewSummary = useMemo(() => {
    if (assignMode === "driver") {
      return previewDriverRow?.name?.trim() || "Select a driver";
    }
    if (assignMode === "vehicle") {
      const v = previewVehicleRow;
      if (!v) return "Select a vehicle";
      return formatIndianVehicleNumber(v.vehicle_number ?? "") || "—";
    }
    return "";
  }, [assignMode, previewDriverRow, previewVehicleRow]);

  const mobileAssignSaveDisabled = useMemo(() => {
    if (assignMode === "driver") {
      return saving || previewDriverBusy || !previewDriverId;
    }
    if (assignMode === "vehicle") {
      return saving || previewVehicleBusy || !previewVehicleId;
    }
    return true;
  }, [
    assignMode,
    saving,
    previewDriverBusy,
    previewDriverId,
    previewVehicleBusy,
    previewVehicleId,
  ]);

  return (
    <View
      style={
        showManifestCard ? [styles.wrapper, styles.wrapperStretch] : styles.pickersOnlyRoot
      }
    >
      {showManifestCard ? (
      <View style={styles.manifestCard}>
        <View style={styles.manifestCardHeader}>
          <Text style={styles.manifestEyebrow}>Driver & vehicle</Text>
          {showSourceBadge ? (
            <View style={[styles.sourceBadge, sourceBadgeStyle]}>
              <Text
                style={[
                  styles.sourceBadgeText,
                  assignmentSource === "shared" && styles.sourceBadgeTextShared,
                  assignmentSource === "private" &&
                    styles.sourceBadgeTextPrivate,
                ]}
              >
                {sourceLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.manifestStack}>
          <TouchableOpacity
            style={[
              styles.manifestNodeShell,
              suppressAggregateDriverAssignTap &&
                styles.manifestNodeShellNonInteractive,
              Platform.OS === "web" && suppressAggregateDriverAssignTap
                ? ({ cursor: "auto" } as const)
                : null,
            ]}
            disabled={!effectiveCanAssign || suppressAggregateDriverAssignTap}
            activeOpacity={
              effectiveCanAssign && !suppressAggregateDriverAssignTap ? 0.88 : 1
            }
            onPress={() =>
              !!effectiveCanAssign &&
              !suppressAggregateDriverAssignTap &&
              (showAssignByPhone
                ? openPhoneModal(
                    hasDriver || !!(previousDriverName ?? "").trim(),
                    propsVehicleLabel ?? trip.vehicle_display_number ?? "",
                  )
                : openDriverPicker())
            }
          >
            <View style={styles.manifestNodeInner}>
              <View style={styles.manifestNodeCopy}>
                <Text style={styles.manifestNodeKicker}>Driver</Text>
                <Text
                  style={[
                    styles.manifestNodeTitle,
                    !hasDriver && styles.manifestNodeTitleMuted,
                  ]}
                  numberOfLines={1}
                >
                  {hasDriver ? pilotText : "Not assigned"}
                </Text>
                {hasDriver ? (
                  showAssignByPhone ? (
                    <Text style={styles.manifestNodeMetaText}>
                      Ad-hoc driver · OTP tracking
                    </Text>
                  ) : (
                    <View style={styles.manifestNodeMetaRow}>
                      <Star size={12} color="#f59e0b" fill="#f59e0b" />
                      <Text style={styles.manifestNodeMetaText}>
                        Rated · Verified in your fleet
                      </Text>
                    </View>
                  )
                ) : (
                  <Text style={styles.manifestActionCue}>
                    {showAssignByPhone
                      ? "Tap to enter name & phone"
                      : "Tap to assign a driver"}
                  </Text>
                )}
              </View>
              <View style={styles.manifestNodeFab}>
                <ChevronRight size={18} color="#ffffff" strokeWidth={3} />
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.manifestNodeShell,
              suppressAggregateVehicleAssignTap &&
                styles.manifestNodeShellNonInteractive,
              Platform.OS === "web" && suppressAggregateVehicleAssignTap
                ? ({ cursor: "auto" } as const)
                : null,
            ]}
            disabled={!effectiveCanAssign || suppressAggregateVehicleAssignTap}
            activeOpacity={
              effectiveCanAssign && !suppressAggregateVehicleAssignTap ? 0.88 : 1
            }
            onPress={() =>
              !!effectiveCanAssign &&
              !suppressAggregateVehicleAssignTap &&
              openVehiclePicker()
            }
          >
            <View style={styles.manifestNodeInner}>
              <View style={styles.manifestNodeCopy}>
                <Text style={styles.manifestNodeKicker}>Vehicle</Text>
                <Text
                  style={[
                    styles.manifestNodeTitle,
                    !hasVehicle && styles.manifestNodeTitleMuted,
                  ]}
                  numberOfLines={2}
                >
                  {hasVehicle ? vehicleText : "Not assigned"}
                </Text>
                {!hasVehicle ? (
                  <Text style={styles.manifestVehicleCue}>
                    Assign a vehicle for this trip
                  </Text>
                ) : null}
              </View>
              <View
                style={[
                  styles.manifestNodeFab,
                  !hasVehicle && styles.manifestNodeFabPulse,
                ]}
              >
                {hasVehicle ? (
                  <ChevronRight size={18} color="#ffffff" strokeWidth={3} />
                ) : (
                  <Plus size={18} color="#ffffff" strokeWidth={3} />
                )}
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {showAssignByPhone && (partnerName ?? "").trim() ? (
          <View style={styles.assignAggregateMeta}>
            <Text style={styles.assignAggregateMetaLabel}>Partner</Text>
            <Text style={styles.assignAggregateMetaValue} numberOfLines={1}>
              {partnerName?.trim() || "—"}
            </Text>
          </View>
        ) : null}

        {previousDriverName ? (
          <View style={styles.previousDriverRow}>
            <Text style={styles.label}>Previous driver</Text>
            <Text style={styles.value} numberOfLines={1}>
              {previousDriverName}
            </Text>
          </View>
        ) : null}
        {latestReassignmentSummary ? (
          <View style={styles.assignmentLogRow}>
            <Text style={styles.label}>Last change</Text>
            <Text style={styles.assignmentLogText}>
              {latestReassignmentSummary}
            </Text>
          </View>
        ) : null}
        {inlineSection ? (
          <View style={styles.inlineSectionWrap}>{inlineSection}</View>
        ) : null}
      </View>
      ) : null}

      {/* Driver / vehicle picker + summary */}
      <Modal
        visible={assignMode !== null}
        animationType={Platform.OS === "web" ? "fade" : "slide"}
        presentationStyle={
          Platform.OS === "web" ? "overFullScreen" : pickerPresentation
        }
        transparent={Platform.OS === "web" && !fullPageFlow}
        onRequestClose={dismissAssignmentFlow}
      >
        <View
          style={[
            assignmentShellStyles.webModalBackdrop,
            fullPageFlow && styles.fullPageBackdrop,
            !showAssignByPhone && {
              padding: 0,
              backgroundColor: Theme.assignmentPageBg,
            },
          ]}
        >
          {!showAssignByPhone ? (
            <View
              style={[
                assignmentShellStyles.assignModalWrapSlate,
                {
                  flex: 1,
                  width: "100%",
                  maxWidth: "100%",
                  borderRadius: 0,
                  maxHeight: "100%",
                  padding: 0,
                  overflow: "hidden",
                  backgroundColor: Theme.assignmentPageBg,
                },
              ]}
            >
              <FleetAssignWorkspace
                trip={trip}
                organizationId={organizationId}
                drivers={drivers}
                vehicles={vehicles}
                activeDriverIds={activeDriverIds}
                activeVehicleIds={activeVehicleIds}
                activeDriverTripLabelById={activeDriverTripLabelById}
                activeVehicleTripLabelById={activeVehicleTripLabelById}
                initialDriverId={previewDriverId ?? trip.driver_id}
                initialVehicleId={previewVehicleId ?? trip.vehicle_id}
                saving={saving}
                onConfirm={async (driverId, vehicleId) => {
                  setPreviewDriverId(driverId);
                  setPreviewVehicleId(vehicleId);
                  await executeFleetWorkspaceAssignWithIds(driverId, vehicleId);
                }}
                onClose={dismissAssignmentFlow}
                onBeforeRegisterNavigate={onBeforeRegisterNavigate}
                focus={assignMode === "vehicle" ? "vehicle" : "driver"}
              />
            </View>
          ) : (
          <View
            style={[
              assignmentShellStyles.assignModalWrapSlate,
              fullPageFlow ? styles.assignModalWrapFullPage : styles.assignModalWrapWide,
              { paddingTop: insets.top },
            ]}
          >
            <View
              style={[
                styles.allocModalHero,
                isMobileAssignFlow && styles.allocModalHeroPulse,
              ]}
            >
              <View style={styles.allocModalHeroText}>
                <Text
                  style={[
                    styles.allocModalTitle,
                    isMobileAssignFlow && styles.allocModalTitlePulse,
                    fullPageFlow && styles.allocModalTitleCompact,
                  ]}
                >
                  {assignMode === "driver"
                    ? showAssignByPhone
                      ? "Driver details"
                      : isMobileAssignFlow
                        ? "Assign driver"
                        : "Choose driver"
                    : showAssignByPhone
                      ? "Vehicle registration"
                      : isMobileAssignFlow
                        ? "Assign vehicle"
                        : "Choose vehicle"}
                </Text>
                <Text
                  style={[
                    styles.allocModalSubtitle,
                    isMobileAssignFlow && styles.allocModalSubtitlePulse,
                  ]}
                >
                  {showAssignByPhone
                    ? assignMode === "driver"
                      ? "Use name and mobile — not your fleet roster."
                      : "Enter the truck registration for this trip."
                    : isDesktop
                      ? "Select in the list, then confirm in the side panel."
                      : "Fleet registry · same flow as trip allocation"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismissAssignmentFlow}
                style={[
                  styles.allocModalCloseBtn,
                  isMobileAssignFlow && styles.allocModalCloseBtnPulse,
                ]}
                hitSlop={8}
                accessibilityLabel="Close"
              >
                <FontAwesome
                  name="times"
                  size={18}
                  color={isMobileAssignFlow ? "#e2e8f0" : Theme.textMuted}
                />
              </TouchableOpacity>
            </View>

            {!showAssignByPhone ? (
              <View style={styles.allocToolbar}>
                <View style={[styles.allocSearchBar, styles.allocSearchFlex]}>
                  <FontAwesome
                    name="search"
                    size={14}
                    color={Theme.textMuted}
                    style={styles.allocSearchIconInline}
                  />
                  <TextInput
                    style={styles.allocSearchInput}
                    value={assignSearch}
                    onChangeText={setAssignSearch}
                    placeholder={
                      assignMode === "driver"
                        ? "Search drivers…"
                        : "Search vehicles…"
                    }
                    placeholderTextColor={Theme.textMuted}
                  />
                </View>
              </View>
            ) : null}

            {!showAssignByPhone ? (
              <TouchableOpacity
                style={styles.allocRegisterRow}
                activeOpacity={0.85}
                onPress={() => {
                  closeAssignModal();
                  onBeforeRegisterNavigate?.();
                  if (assignMode === "driver") {
                    router.push("/(modals)/add-driver");
                  } else {
                    router.push("/(modals)/add-vehicle");
                  }
                }}
              >
                <View style={styles.allocRegisterLeft}>
                  <View style={styles.allocRegisterPlus}>
                    <Plus size={24} color={Theme.textMuted} strokeWidth={3} />
                  </View>
                  <View>
                    <Text style={styles.allocRegisterTitle}>
                      {assignMode === "driver"
                        ? "Add new driver"
                        : "Add new vehicle"}
                    </Text>
                    <Text style={styles.allocRegisterHint}>
                      Opens a short form; they appear in your fleet for next time.
                    </Text>
                  </View>
                </View>
                <View style={styles.allocRegisterProto}>
                  <Text style={styles.allocRegisterProtoText}>Add</Text>
                </View>
              </TouchableOpacity>
            ) : null}

            <View
              style={[
                styles.allocBodyRow,
                isDesktop ? styles.allocBodyRowDesktop : null,
              ]}
            >
              <ScrollView
                style={[
                  styles.assignModalScroll,
                  isDesktop ? styles.allocMainScrollDesktop : null,
                ]}
                contentContainerStyle={[
                  styles.assignModalScrollContent,
                  styles.allocScrollPad,
                  {
                    paddingBottom:
                      (isDesktop ? 16 : 120) + Math.max(24, insets.bottom),
                  },
                ]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {aggregateDriverUsesPhone ? (
                  <View style={styles.aggregateRedirectCard}>
                    <Text style={styles.aggregateRedirectTitle}>
                      Aggregate trips use ad-hoc drivers
                    </Text>
                    <Text style={styles.aggregateRedirectBody}>
                      Enter the driver&apos;s name and mobile number — not someone from
                      your fleet roster.
                    </Text>
                    <TouchableOpacity
                      style={styles.aggregateRedirectBtn}
                      onPress={() => {
                        closeAssignModal();
                        openPhoneModal(
                          hasDriver || !!(previousDriverName ?? "").trim(),
                          propsVehicleLabel ?? trip.vehicle_display_number ?? "",
                        );
                      }}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.aggregateRedirectBtnText}>
                        Enter name & phone
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : assignMode === "driver" ? (
                  filteredDrivers.length === 0 ? (
                    <Text style={styles.assignEmptyHint}>
                      No drivers in your list yet. Use “Add new driver” above.
                    </Text>
                  ) : (
                    <View style={styles.allocGrid}>
                      {filteredDrivers.map((d) => {
                        const isOnTrip =
                          activeDriverIds.has(d.id) && d.id !== trip.driver_id;
                        const isAvailable = !d.left_at && !isOnTrip;
                        const ratingMeta = getDriverRatingMeta(d);
                        const statusText = isOnTrip
                          ? `Already in ${activeDriverTripLabelById[d.id] ?? "another trip"}`
                          : isAvailable
                            ? "Ready"
                            : "On leave";
                        const sel = previewDriverId === d.id;
                        return (
                          <TouchableOpacity
                            key={d.id}
                            style={[
                              styles.assignFlowCard,
                              sel && styles.assignFlowCardSelected,
                              isOnTrip && styles.assignFlowCardBusy,
                            ]}
                            onPress={() =>
                              !isOnTrip && setPreviewDriverId(d.id)
                            }
                            disabled={isOnTrip}
                            activeOpacity={isOnTrip ? 1 : 0.92}
                          >
                            <View style={styles.assignFlowCardLeft}>
                              <View
                                style={[
                                  styles.assignFlowTile,
                                  sel && styles.assignFlowTileSelected,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.assignFlowTileText,
                                    sel && styles.assignFlowTileTextSel,
                                  ]}
                                >
                                  {pilotCodeFromName(d.name ?? "?")}
                                </Text>
                              </View>
                              <View style={styles.assignCardBody}>
                                <Text
                                  style={[
                                    styles.assignFlowCardTitle,
                                    sel && styles.assignFlowCardTitleSel,
                                    isOnTrip && styles.assignCardTitleMuted,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {d.name ?? "—"}
                                </Text>
                                <View style={styles.assignFlowMetaRow}>
                                  <View
                                    style={[
                                      styles.assignFlowStatusPill,
                                      isOnTrip && styles.assignFlowStatusPillBusy,
                                      sel && styles.assignFlowStatusPillSel,
                                    ]}
                                  >
                                    <Circle
                                      size={8}
                                      color={
                                        sel ? Theme.buttonPrimary : Theme.textMuted
                                      }
                                      fill={
                                        sel ? Theme.buttonPrimary : "transparent"
                                      }
                                    />
                                    <Text
                                      style={[
                                        styles.assignFlowStatusText,
                                        isOnTrip && styles.assignFlowStatusTextBusy,
                                        sel && styles.assignFlowStatusTextSel,
                                      ]}
                                    >
                                      {statusText}
                                    </Text>
                                  </View>
                                  {ratingMeta ? (
                                    <View style={styles.assignFlowStarRow}>
                                      <Star
                                        size={12}
                                        color={Theme.driverGold}
                                        fill={Theme.driverGold}
                                      />
                                      <Text
                                        style={[
                                          styles.assignFlowStarText,
                                          sel && styles.assignFlowStarTextSel,
                                        ]}
                                      >
                                        {ratingMeta.ratingLabel}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              </View>
                            </View>
                            {sel ? (
                              <View style={styles.assignFlowCheck}>
                                <Check
                                  size={26}
                                  color="#fff"
                                  strokeWidth={4}
                                />
                              </View>
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )
                ) : assignMode === "vehicle" ? (
                  <>
                    {showAssignByPhone ? (
                      <View style={styles.assignAdhocVehicleWrap}>
                        <Text style={styles.assignAdhocVehicleLabel}>
                          Vehicle registration (ad-hoc)
                        </Text>
                        <Text style={styles.assignAdhocVehicleHint}>
                          Partner vehicle not in your fleet — enter number to
                          save on trip.
                        </Text>
                        <TextInput
                          style={styles.assignAdhocVehicleInput}
                          value={pickerVehicleInput}
                          onChangeText={(t) =>
                            setPickerVehicleInput(applyIndianVehicleKeystroke(t))
                          }
                          placeholder="e.g. TN 18 D 2522"
                          placeholderTextColor={Theme.textMuted}
                        />
                        <TouchableOpacity
                          style={[
                            styles.assignAdhocVehicleBtn,
                            !pickerVehicleInput.trim() &&
                              styles.assignAdhocVehicleBtnDisabled,
                          ]}
                          onPress={() =>
                            saveVehicleOnly(
                              null,
                              pickerVehicleInput.trim() || null,
                            )
                          }
                          disabled={saving || !pickerVehicleInput.trim()}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.assignAdhocVehicleBtnText}>
                            {saving ? "Saving…" : "Save registration"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    {!showAssignByPhone && filteredVehicles.length === 0 ? (
                      <Text style={styles.assignEmptyHint}>
                        No vehicles in your list. Use “Add new vehicle” or enter a
                        one-off registration above.
                      </Text>
                    ) : !showAssignByPhone ? (
                      <View style={styles.allocGrid}>
                        {filteredVehicles.map((v) => {
                          const plate = formatIndianVehicleNumber(
                            v.vehicle_number,
                          );
                          const vehicleBusy =
                            activeVehicleIds.has(v.id) &&
                            v.id !== trip.vehicle_id;
                          const typeLabel = v.vehicle_type ?? "Vehicle";
                          const sel = previewVehicleId === v.id;
                          return (
                            <TouchableOpacity
                              key={v.id}
                              style={[
                                styles.assignFlowCard,
                                sel && styles.assignFlowCardSelected,
                                vehicleBusy && styles.assignFlowCardBusy,
                              ]}
                              onPress={() =>
                                !vehicleBusy && setPreviewVehicleId(v.id)
                              }
                              disabled={vehicleBusy}
                              activeOpacity={vehicleBusy ? 1 : 0.92}
                            >
                              <View style={styles.assignFlowCardLeft}>
                                <View
                                  style={[
                                    styles.assignFlowTile,
                                    sel && styles.assignFlowTileSelected,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.assignFlowTileText,
                                      sel && styles.assignFlowTileTextSel,
                                    ]}
                                  >
                                    {vehicleTileCode(v)}
                                  </Text>
                                </View>
                                <View style={styles.assignCardBody}>
                                  <Text
                                    style={[
                                      styles.assignFlowCardTitle,
                                      sel && styles.assignFlowCardTitleSel,
                                      vehicleBusy && styles.assignCardTitleMuted,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {plate}
                                  </Text>
                                  <View style={styles.assignFlowMetaRow}>
                                    <View
                                      style={[
                                        styles.assignFlowStatusPill,
                                        vehicleBusy && styles.assignFlowStatusPillBusy,
                                        sel && styles.assignFlowStatusPillSel,
                                      ]}
                                    >
                                      <Circle
                                        size={8}
                                        color={
                                          sel
                                            ? Theme.buttonPrimary
                                            : Theme.textMuted
                                        }
                                        fill={
                                          sel
                                            ? Theme.buttonPrimary
                                            : "transparent"
                                        }
                                      />
                                      <Text
                                        style={[
                                          styles.assignFlowStatusText,
                                          vehicleBusy &&
                                            styles.assignFlowStatusTextBusy,
                                          sel &&
                                            styles.assignFlowStatusTextSel,
                                        ]}
                                      >
                                        {vehicleBusy ? "Busy" : typeLabel}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              </View>
                              {sel ? (
                                <View style={styles.assignFlowCheck}>
                                  <Check
                                    size={26}
                                    color="#fff"
                                    strokeWidth={4}
                                  />
                                </View>
                              ) : null}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}
                  </>
                ) : null}

                {!isDesktop ? (
                  <View style={styles.allocSidebarMobile}>{renderAllocationSidebar()}</View>
                ) : null}
              </ScrollView>

              {isDesktop ? (
                <ScrollView
                  style={styles.allocSidebarDesktopScroll}
                  contentContainerStyle={
                    styles.allocSidebarDesktopScrollContent
                  }
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {renderAllocationSidebar()}
                </ScrollView>
              ) : null}
            </View>

            {!isDesktop ? (
              <View
                style={[
                  styles.allocMobileFooter,
                  { paddingBottom: Math.max(24, insets.bottom) },
                ]}
              >
                <AssignmentFlowFooter
                  summary={mobileAssignPreviewSummary}
                  primaryLabel="Save assignment"
                  onPrimaryPress={() => void executePreviewAssignment()}
                  primaryDisabled={mobileAssignSaveDisabled}
                  loading={saving}
                  secondaryLabel="Close"
                  onSecondaryPress={dismissAssignmentFlow}
                />
              </View>
            ) : (
              <View
                style={[
                  styles.allocDesktopFooterBar,
                  { paddingBottom: Math.max(16, insets.bottom) },
                ]}
              >
                <TouchableOpacity
                  style={styles.allocDesktopFooterClose}
                  onPress={dismissAssignmentFlow}
                  activeOpacity={0.9}
                >
                  <Text style={styles.allocDesktopFooterCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          )}
        </View>
      </Modal>

      <TripPhoneAssignmentWizard
        visible={showPhoneModal}
        onClose={() => {
          setShowPhoneModal(false);
          setPhoneAssignOtpReveal(null);
          setPhoneAssignSuccess(null);
          setPhoneIsOwnAsset(null);
          if (fullPageFlow) onFlowDismiss?.();
        }}
        trip={trip}
        organizationId={organizationId}
        driverAssignOrgId={driverAssignOrgId ?? null}
        isReassign={phoneModalIsReassign}
        initialDriverName={phoneDriverNameInput}
        initialVehicle={phoneVehicleInput}
        driverPhone={phoneInput}
        onDriverPhoneChange={setPhoneInput}
        driverName={phoneDriverNameInput}
        onDriverNameChange={setPhoneDriverNameInput}
        vehiclePlate={phoneVehicleInput}
        onVehiclePlateChange={setPhoneVehicleInput}
        // Own-asset toggle only makes sense for the Aggregate assignment flow
        // (a supplier is involved); omit both props otherwise to hide it.
        isOwnAsset={driverAssignOrgId ? phoneIsOwnAsset : undefined}
        onIsOwnAssetChange={driverAssignOrgId ? setPhoneIsOwnAsset : undefined}
        saving={phoneSaving}
        error={phoneError}
        onSubmit={assignByPhone}
        otpReveal={phoneAssignOtpReveal}
        onOtpDismiss={() => {
          setShowPhoneModal(false);
          setPhoneAssignOtpReveal(null);
          setPhoneAssignSuccess(null);
          setPhoneInput("");
          setPhoneDriverNameInput("");
          setPhoneName(null);
          setPhoneVehicleInput("");
          setPhoneModalIsReassign(false);
          if (fullPageFlow) onFlowComplete?.();
        }}
        assignSuccess={phoneAssignSuccess}
        onAssignSuccessDismiss={() => {
          setShowPhoneModal(false);
          setPhoneAssignOtpReveal(null);
          setPhoneAssignSuccess(null);
          setPhoneInput("");
          setPhoneDriverNameInput("");
          setPhoneName(null);
          setPhoneVehicleInput("");
          setPhoneModalIsReassign(false);
          if (fullPageFlow) onFlowComplete?.();
        }}
        fullPageFlow={fullPageFlow}
        activeDriverPhone={currentAssignedDriverPhone}
        activeDriverName={propsDriverName ?? trip.driver_display_name ?? null}
        activeVehiclePlate={
          trip.vehicle_display_number ?? propsVehicleLabel ?? null
        }
        vehicleRequired={
          !!showAssignByPhone &&
          !(
            phoneModalIsReassign &&
            (!!trip.vehicle_id ||
              !!String(trip.vehicle_display_number ?? "").trim())
          )
        }
        presentationStyle={pickerPresentation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 12 },
  wrapperStretch: { alignSelf: "stretch" as const },
  pickersOnlyRoot: {
    width: 0,
    height: 0,
    overflow: "hidden",
    opacity: 0,
    position: "absolute",
  },
  fullPageBackdrop: {
    flex: 1,
    padding: 0,
    backgroundColor: "#f8fafc",
    ...Platform.select({
      web: { justifyContent: "flex-start", alignItems: "stretch" } as object,
      default: {},
    }),
  },
  assignModalWrapFullPage: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    maxHeight: "100%",
    minHeight: 0,
  },
  aggregateRedirectCard: {
    padding: 14,
    backgroundColor: "#fff",
    gap: 8,
  },
  aggregateRedirectTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  aggregateRedirectBody: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 15,
  },
  aggregateRedirectBtn: {
    marginTop: 4,
    alignSelf: "flex-start",
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Theme.buttonPrimary,
    justifyContent: "center",
  },
  aggregateRedirectBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  card: {
    backgroundColor: Theme.screenBackground,
    padding: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  currentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  currentHeaderTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  currentHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  statusPillUnassigned: {
    backgroundColor: Theme.surfaceGray,
  },
  statusPillPartial: {
    backgroundColor: Theme.warningMuted ?? Theme.surfaceGray,
  },
  statusPillAssigned: {
    backgroundColor: Theme.positiveMuted,
  },
  statusPillTextUnassigned: { color: Theme.textMuted },
  statusPillTextPartial: {
    color: Theme.warning ?? Theme.textPrimaryDark,
  },
  statusPillTextAssigned: { color: Theme.darkGreen },

  assignRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  assignRowLast: { borderBottomWidth: 0 },
  assignRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  assignIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  assignIconInactive: {
    backgroundColor: Theme.surfaceGray,
  },
  assignIconDriverActive: {
    backgroundColor: Theme.surfaceGray,
  },
  assignIconVehicleActive: {
    backgroundColor: Theme.surfaceGray,
  },
  assignIconVehicleInactive: {
    backgroundColor: Theme.surfaceGray,
  },
  assignRowText: { flex: 1, minWidth: 0 },
  assignRowLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  assignRowValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  assignRowValueEmpty: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnPrimary: {
    backgroundColor: "#000",
  },
  actionBtnSecondary: {
    backgroundColor: Theme.surfaceGray,
  },
  actionBtnSecondaryAlt: {
    backgroundColor: Theme.surfaceGray,
  },
  actionBtnText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  actionBtnTextPrimary: { color: Theme.buttonPrimaryText },
  actionBtnTextSecondary: { color: Theme.textPrimaryDark },
  actionBtnTextSecondaryAlt: { color: Theme.textPrimaryDark },

  otpInline: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    gap: 6,
  },
  otpInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  otpInlineLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  otpInlineCode: {
    fontSize: 16,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 1.2,
  },
  otpInlineMuted: { fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  otpInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  otpInlineBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  otpInlineError: { fontSize: 9, fontWeight: "700", color: Theme.teslaRed },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
    flexWrap: "wrap",
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    flex: 1,
    minWidth: 120,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgePrivate: {
    backgroundColor: Theme.surfaceGray,
  },
  badgeShared: {
    backgroundColor: Theme.surfaceGray,
  },
  badgeUnassigned: {
    backgroundColor: Theme.surfaceLight,
  },
  sourceBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sourceBadgeTextShared: {
    color: Theme.textSection,
  },
  sourceBadgeTextPrivate: {
    color: Theme.textSection,
  },
  sourceBadgeTextUnassigned: {
    color: Theme.textPrimaryDark,
  },
  otpBlock: {
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  otpLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  otpCode: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 4,
    color: Theme.primary,
    marginBottom: 2,
  },
  otpExpiry: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginBottom: 4,
  },
  otpHint: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: 2,
  },
  otpErrorText: {
    fontSize: 11,
    color: Theme.negative,
    marginTop: 6,
  },
  otpRegenerateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  otpRegenerateText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
  twoCol: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 0,
  },
  previousDriverRow: {
    marginTop: 12,
  },
  assignmentLogRow: {
    marginTop: 8,
  },
  inlineSectionWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  assignmentLogText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 4,
    lineHeight: 16,
  },
  webAssignRow: {
    flex: 1,
    borderBottomWidth: 0,
    paddingVertical: 12,
  },
  assignAggregateMeta: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  assignAggregateMetaLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  assignAggregateMetaValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    flex: 1,
    textAlign: "right",
    minWidth: 0,
  },
  col: { flex: 1, minWidth: 0 },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  value: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginTop: 4,
  },
  input: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.surfaceForm ?? Theme.surfaceLight,
    marginTop: 2,
    marginBottom: 0,
  },
  assignBtnCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  assignBtnTextCompact: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
  },
  twoBtnRow: {
    flexDirection: "row",
    gap: 8,
    flexShrink: 0,
  },
  modalWrap: { flex: 1, backgroundColor: Theme.screenBackground },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  modalCancel: { fontSize: 16, color: Theme.textSecondary },
  modalTitle: { fontSize: 16, fontWeight: "700", color: Theme.textPrimaryDark },
  modalSave: { fontSize: 16, fontWeight: "700", color: Theme.buttonPrimary },
  modalSaveDisabled: { color: Theme.textMuted },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: 16, paddingBottom: 32 },
  modalSection: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  optionRowActive: {
    backgroundColor: Theme.surfaceLight,
  },
  optionText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    flex: 1,
  },
  emptyHint: {
    fontSize: 13,
    color: Theme.textMuted,
    fontStyle: "italic",
    marginBottom: 8,
  },
  // Premium assignment picker modal (shell: assignmentShellStyles.assignModalWrapSlate)
  assignModalWrapWide: Platform.select({
    web: {
      maxWidth: 1120,
      width: "100%",
      height: "85vh",
      maxHeight: "85vh",
      minHeight: 520,
    } as object,
    default: {},
  }),
  assignModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  assignModalHeaderText: { flex: 1, minWidth: 0 },
  assignModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  assignModalSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 2,
  },
  assignModalCloseBtn: {
    width: 32,
    height: 32,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  assignModalScroll: { flex: 1 },
  assignModalScrollContent: {
    padding: 14,
    paddingBottom: 18,
  },
  assignStepLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 8,
    marginLeft: 4,
  },
  assignStepLabelSecond: { marginTop: 18 },
  assignEmptyHint: {
    fontSize: 13,
    color: Theme.textMuted,
    fontStyle: "italic",
    marginBottom: 8,
  },
  assignAdhocVehicleWrap: {
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
  },
  assignAdhocVehicleLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  assignAdhocVehicleHint: {
    fontSize: 10,
    color: Theme.textMuted,
    marginBottom: 10,
  },
  assignAdhocVehicleInput: {
    fontSize: 13,
    color: "#0f172a",
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: "#f8fafc",
    marginBottom: 10,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  assignAdhocVehicleBtn: {
    alignSelf: "flex-start",
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  assignAdhocVehicleBtnDisabled: {
    opacity: 0.5,
  },
  assignAdhocVehicleBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  assignCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
    backgroundColor: Theme.screenBackground,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  assignCardSelected: {
    backgroundColor: Theme.fiscalTabActiveBg,
  },
  assignDriverAvatar: {
    width: 34,
    height: 34,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  assignDriverAvatarSelected: {
    backgroundColor: Theme.buttonPrimary,
  },
  assignDriverInitial: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  assignDriverInitialSelected: {
    color: Theme.textOnPrimary,
  },
  assignCardBody: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
  },
  assignCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  assignCardSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  assignStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  assignStatusDot: {
    width: 6,
    height: 6,
  },
  assignStatusDotAvailable: { backgroundColor: Theme.darkGreen },
  assignStatusDotLeave: { backgroundColor: Theme.driverGold },
  assignStatusText: { fontSize: 10, fontWeight: "600" },
  assignStatusTextAvailable: { color: Theme.darkGreen },
  assignStatusTextLeave: { color: "#B45309" },
  assignCheckWrap: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  assignCheckWrapSelected: {
    backgroundColor: Theme.buttonPrimary,
  },
  assignVehicleIconWrap: {
    width: 34,
    height: 34,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  assignVehicleIconWrapSelected: {
    backgroundColor: Theme.buttonPrimary,
  },
  assignVehicleInput: {
    paddingVertical: 9,
    paddingHorizontal: 10,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.screenBackground,
    marginBottom: 10,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  assignModalFooter: {
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: "#020617",
    borderTopWidth: 1,
    borderTopColor: "#111827",
  },
  assignSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    marginVertical: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Theme.screenBackground,
  },
  assignSearchIcon: {
    position: "absolute",
    left: 28,
  },
  assignSearchInput: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingLeft: 28,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  assignRegistryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
    backgroundColor: Theme.screenBackground,
  },
  assignRegistryCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  assignDriverAvatarRegistry: {
    width: 30,
    height: 30,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  assignDriverAvatarImage: {
    width: 30,
    height: 30,
  },
  assignDriverInitialRegistry: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  assignSyncBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "transparent",
  },
  assignSyncBadgeText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.darkGreen,
    textTransform: "uppercase",
  },
  assignRegistryCardBusy: {
    opacity: 0.75,
    backgroundColor: Theme.screenBackground,
  },
  assignDriverAvatarBusy: {
    backgroundColor: Theme.surfaceGray,
  },
  assignDriverInitialBusy: {
    color: Theme.textMuted,
  },
  assignCardTitleMuted: {
    color: Theme.textMuted,
  },
  assignRegistrySubtextBusy: {
    color: Theme.warning ?? "#B45309",
  },
  assignBusyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "transparent",
  },
  assignBusyBadgeText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.warning ?? "#B45309",
    textTransform: "uppercase",
  },
  assignVehicleIconWrapRegistry: {
    width: 30,
    height: 30,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  assignUpdateLinkBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: "transparent",
  },
  assignUpdateLinkBadgeText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  assignRegistrySubtext: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 2,
  },
  assignRatingRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  assignRatingText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  assignCancelBtn: {
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  assignCancelBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: "rgba(255,255,255,0.8)",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  assignConfirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    paddingVertical: 10,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  assignConfirmBtnDisabled: { opacity: 0.7 },
  assignConfirmBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  phoneModalInput: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
    backgroundColor: "#ffffff",
    marginBottom: 10,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  phoneModalFoundWrap: { marginBottom: 10 },
  phoneModalFound: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  phoneModalHint: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 4,
  },
  phoneProtocolCard: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 12,
    flexDirection: "row",
    gap: 8,
  },
  phoneProtocolIconWrap: {
    width: 30,
    height: 30,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  phoneProtocolBody: {
    flex: 1,
  },
  phoneProtocolTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 2,
  },
  phoneProtocolText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
    color: "#64748b",
  },
  phoneOtpRevealCard: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: "rgba(79, 70, 229, 0.08)",
  },
  phoneOtpRevealIconWrap: {
    width: 48,
    height: 48,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  phoneOtpRevealTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  phoneOtpRevealCode: {
    fontSize: 36,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 8,
    marginBottom: 8,
  },
  phoneOtpRevealExpiry: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 14,
    textAlign: "center",
  },
  phoneOtpRevealHint: {
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
  },
  phoneModalError: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.negative,
    marginBottom: 10,
  },
  phoneModalInTrip: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.warning ?? "#B45309",
    marginBottom: 4,
  },
  phoneModalBusyWrap: {
    marginBottom: 8,
  },
  phoneModalBusyHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 16,
  },
  phoneInput: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.surfaceForm ?? Theme.surfaceLight,
    marginBottom: 8,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  phoneFound: {
    fontSize: 13,
    color: Theme.textMuted,
    marginBottom: 8,
  },
  phoneError: {
    fontSize: 13,
    color: Theme.negative,
    marginBottom: 8,
  },

  // Driver & vehicle summary card
  manifestCard: {
    backgroundColor: "#ffffff",
    padding: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
  },
  manifestCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  manifestEyebrow: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
  },
  manifestStack: { gap: 14 },
  manifestNodeShell: {
    backgroundColor: "#f8fafc",
    overflow: "hidden",
  },
  manifestNodeShellNonInteractive: {
    opacity: 0.92,
  },
  manifestNodeInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 18,
    gap: 12,
  },
  manifestNodeCopy: { flex: 1, minWidth: 0 },
  manifestNodeKicker: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 6,
  },
  manifestNodeTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  manifestNodeTitleMuted: {
    color: "#94a3b8",
  },
  manifestNodeMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  manifestNodeMetaText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 1,
  },
  manifestActionCue: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 8,
  },
  manifestVehicleCue: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.buttonPrimary,
    marginTop: 8,
  },
  manifestNodeFab: {
    width: 44,
    height: 44,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  manifestNodeFabPulse: {
    backgroundColor: Theme.buttonPrimary,
  },

  // Driver / vehicle picker modal
  allocModalHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    gap: 12,
  },
  allocModalHeroText: { flex: 1, minWidth: 0 },
  allocModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  allocModalSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 6,
    lineHeight: 16,
  },
  allocModalCloseBtn: {
    width: 36,
    height: 36,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  allocModalHeroPulse: {
    backgroundColor: PULSE_TRIP.headerNavy,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  allocModalTitlePulse: {
    fontSize: 17,
    color: "#f8fafc",
  },
  allocModalTitleCompact: {
    fontSize: 15,
  },
  allocModalSubtitlePulse: {
    color: "rgba(226,232,240,0.88)",
    marginTop: 3,
  },
  allocModalCloseBtnPulse: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  allocToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 4,
    backgroundColor: "#ffffff",
  },
  allocSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f1f5f9",
    gap: 10,
  },
  allocSearchIconInline: {
    marginTop: 1,
  },
  allocSearchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    paddingVertical: 4,
    minWidth: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  allocSearchFlex: {
    flex: 1,
    marginHorizontal: 0,
    marginVertical: 0,
  },
  allocRegisterRow: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderStyle: "dashed",
    backgroundColor: "rgba(248,250,252,0.9)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  allocRegisterLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  allocRegisterPlus: {
    width: 48,
    height: 48,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  allocRegisterTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#334155",
  },
  allocRegisterHint: {
    fontSize: 11,
    fontWeight: "500",
    color: "#94a3b8",
    marginTop: 4,
    lineHeight: 15,
  },
  allocRegisterProto: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f1f5f9",
  },
  allocRegisterProtoText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  allocBodyRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  allocBodyRowDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 0,
    paddingHorizontal: 0,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  allocMainScrollDesktop: {
    ...Platform.select({
      web: {
        flex: 1,
        minWidth: 0,
        minHeight: 0,
      } as object,
      default: {},
    }),
  },
  allocSidebarDesktopScroll: {
    width: 300,
    flexShrink: 0,
    flexGrow: 0,
    backgroundColor: "#ffffff",
    borderLeftWidth: 1,
    borderLeftColor: "#e2e8f0",
    ...Platform.select({
      web: {
        minHeight: 0,
        maxHeight: "100%",
      } as object,
      default: {},
    }),
  },
  allocSidebarDesktopScrollContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  allocScrollPad: {
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  allocGrid: {
    gap: 10,
  },
  assignFlowCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 18,
    backgroundColor: "#ffffff",
    marginBottom: 4,
  },
  assignFlowCardSelected: {
    backgroundColor: "#0f172a",
  },
  assignFlowCardBusy: {
    opacity: 0.55,
  },
  assignFlowCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  assignFlowTile: {
    width: 72,
    height: 60,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  assignFlowTileSelected: {
    backgroundColor: Theme.buttonPrimary,
  },
  assignFlowTileText: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
  },
  assignFlowTileTextSel: {
    color: Theme.buttonPrimaryText,
  },
  assignFlowCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  assignFlowCardTitleSel: {
    color: "#ffffff",
  },
  assignFlowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    flexWrap: "wrap",
  },
  assignFlowStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#f8fafc",
  },
  assignFlowStatusPillSel: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  assignFlowStatusPillBusy: {
    backgroundColor: "#fef3c7",
  },
  assignFlowStatusText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  assignFlowStatusTextSel: {
    color: "#93c5fd",
  },
  assignFlowStatusTextBusy: {
    color: "#92400e",
    fontWeight: "700",
  },
  assignFlowStarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  assignFlowStarText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0f172a",
  },
  assignFlowStarTextSel: {
    color: "#fde68a",
  },
  assignFlowCheck: {
    width: 48,
    height: 48,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    shadowColor: Theme.buttonPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
  },
  allocSidebarMobile: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  allocSidebarInner: {
    padding: 20,
    gap: 12,
  },
  allocSidebarEmpty: {
    padding: 24,
    alignItems: "center",
  },
  allocSidebarEmptyText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    textAlign: "center",
  },
  allocSidebarHero: {
    alignItems: "center",
    marginBottom: 8,
  },
  allocSidebarAvatar: {
    width: 120,
    height: 100,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  allocSidebarAvatarText: {
    fontSize: 36,
    fontWeight: "900",
    color: "#ffffff",
  },
  allocSidebarName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  allocSidebarChip: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "#f1f5f9",
  },
  allocSidebarChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  allocMetricBlock: { marginTop: 4 },
  allocMetricHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  allocMetricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  allocMetricPct: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.buttonPrimary,
  },
  allocMetricTrack: {
    height: 6,
    backgroundColor: "#f1f5f9",
    overflow: "hidden",
  },
  allocMetricFillDark: {
    height: 6,
    backgroundColor: "#0f172a",
  },
  allocMetricFillBlue: {
    height: 6,
    backgroundColor: Theme.buttonPrimary,
  },
  allocMiniGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  allocMiniCell: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  allocMiniVal: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  allocMiniLbl: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 4,
  },
  allocSidebarWarn: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.negative,
    textAlign: "center",
    marginTop: 4,
  },
  allocExecuteBtn: {
    marginTop: 12,
    paddingVertical: 18,
    borderRadius: 22,
    backgroundColor: "#0f172a",
    alignItems: "center",
  },
  allocExecuteBtnDis: {
    opacity: 0.45,
  },
  allocExecuteBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.buttonDarkText,
    letterSpacing: 0.2,
  },
  allocVerifyHint: {
    fontSize: 11,
    fontWeight: "500",
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 8,
  },
  allocMobileFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  allocMobileFooterClose: {
    alignItems: "center",
    paddingVertical: 12,
  },
  allocMobileFooterCloseText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textMuted,
  },
  allocDesktopFooterBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    alignItems: "flex-end",
  },
  allocDesktopFooterClose: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  allocDesktopFooterCloseText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
});
