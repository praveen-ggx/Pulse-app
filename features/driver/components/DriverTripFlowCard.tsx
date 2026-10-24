import { releaseStoragePreviewUrl } from '@/features/trips/utils/storagePreviewObjectUrl.util';
import Theme from '@/constants/Theme';
import { LoadingIndicator } from "@/components/LoadingIndicator";
import {
  FLOW_EMERALD,
  FLOW_EMERALD_DARK,
  sheetStyles,
  TRIP_SHEET_BODY_PAD,
  TRIP_SHEET_BTN_HEIGHT,
  TRIP_SHEET_TOP_RADIUS,
} from '@/components/driver/DriverTripSheetLayout';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useInvalidateDriverHomeDashboard } from '@/lib/queries/useInvalidateDriverHomeDashboard';
import { driverUiTripsQueryKey } from '@/lib/queries/useDriverUiTripsQuery';
import { useDriverChat } from '@/features/chat/contexts/DriverChatContext';
import {
  sendDocumentShareMessage,
  softDeleteTripChatByStoragePath,
} from '@/features/chat/services/chat.service';
import { invalidateChatDocumentUrlCaches } from '@/features/chat/utils/resolveChatDocumentUrl.util';
import { useDriverReferralForTripQuery } from '@/lib/queries/useReachCampaignsQuery';
import type { JobCardAssignerPayload } from '@/features/trips/utils/driverAssignerDisplay.util';
import type { DriverRoutePlanMap } from '@/features/driver/job-card/driverRoutePlanMap';
import type { DriverFlowStepId as StepId } from '@/features/driver/utils/driverTripStatusNotes.util';
import {
  appendDriverStatusNote,
  deriveDriverFlowStepFromTrip,
} from '@/features/driver/utils/driverTripStatusNotes.util';
import {
  computeJourneyMetrics,
  computeTripStageMetrics,
  evaluateOperationalAlerts,
  getStageMetadata,
  getTripStageTarget,
  getTripStopCoordinate,
  type TripStageMetrics,
} from '@/features/trips/domain';
import { getDriverAlertGuidance } from '@/features/driver/utils/driverAlertGuidance.util';
import { useTripTimelineQuery } from '@/lib/queries/useTripTimelineQuery';
import { useTripCheckpointDistanceQuery } from '@/lib/queries/useTripCheckpointDistanceQuery';
import { useTripDriverPresenceQuery } from '@/lib/queries/useTripDriverPresenceQuery';
import { openExternalNavigation } from '@/lib/mapsNavigation.util';
import { DriverMissionStopsList } from '@/features/driver/components/DriverMissionStopsList';
import { MissionCardLayout } from '@/features/driver/components/MissionCardLayout';
import { planStopsFromLabeled } from '@/features/driver/components/missionPlanRows';
import { useRouteExtraStopRowsFor } from '@/features/trips/hooks/useRouteExtraStopsQuery';
import { useDriverStopExecution } from '@/features/driver/hooks/useDriverStopExecution';
import { shouldShowDriverMultiStop } from '@/features/driver/execution/normalizeDriverStopExecution';
import { DriverShipperFeedbackModal } from '@/features/chat/components/driver/DriverShipperFeedbackModal';
import { findLatestMissionDebriefMessage } from '@/features/chat/utils/missionDebrief.util';
import { DriverPodCompletionPage } from '@/features/driver/components/DriverPodCompletionPage';
import { LoadingComplianceNotice } from '@/features/tripCompliance/components/LoadingComplianceNotice';
import { missionStagePeekCopy } from '@/features/driver/utils/missionStagePeekLabel.util';
import {
  clearLrPhase,
  hasEnteredLrPhase,
  markLrPhaseEntered,
} from '@/features/drivers/services/tripControlProgress.storage';
import {
  DRIVER_PAY_NA_AMOUNT,
  DRIVER_PAY_NA_LABEL,
  isAggregateTrip,
} from '@/features/drivers/utils/driverUtils.util';
import { formatINR } from '@/lib/format';
import { formatEstimatedDuration } from '@/lib/formatEstimatedDuration';
import * as tripDocumentsService from '@/features/trips/services/tripDocuments.service';
import { findOrgDuplicateLrNumberForTrip } from '@/features/trips/services/orgLrDuplicate.service';
import { ORG_LR_DUPLICATE_MESSAGE } from '@/features/trips/services/orgLrNumber.util';
import * as tripsService from '@/features/trips/services/trips.service';
import { previousStageTarget } from '@/features/driver/utils/driverStageRevoke.util';
import {
  applyDriverCommandResult,
  executeDriverCommand,
} from '@/features/driver/services/driverExecution.service';
import { useDriverOperatingModeQuery } from '@/lib/queries/useDriverOperatingModeQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import {
  ownerVehicleSubtitle,
  ownerVehicleTitle,
  setTripOwnerVehicle,
} from '@/features/driver/services/ownerVehicles.service';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Modal,
    Platform,
    Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  compressLocalImageForUpload,
  PROOF_IMAGE_JPEG_QUALITY,
  PROOF_IMAGE_PICKER_QUALITY,
} from '@/lib/media/compressLocalImage.util';
import { ChevronUp } from 'lucide-react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Secondary row (Call / Chat / Camera, Navigate) and the stage CTA below it. */
const ACTION_BTN_HEIGHT = 52;
const PRIMARY_BTN_HEIGHT = 58;

const REVOKE_REASON_CHIPS = [
  'Marked by mistake',
  'Not at this stop yet',
  'Need to correct this stage',
] as const;

const DRIVER_ACCEPTED_TRIP_ID_KEY = 'driver_accepted_trip_id';
const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_POD_IMAGE_BYTES = 5 * 1024 * 1024;

/** RN Alert.alert is unreliable on web; use window.confirm so POD delete always prompts. */
function confirmRemovePod(): Promise<boolean> {
  const message =
    'Delete this file? You can upload again before completing delivery.';
  if (Platform.OS === 'web') {
    const w = typeof globalThis !== 'undefined' ? (globalThis as { confirm?: (msg: string) => boolean }).confirm : undefined;
    return Promise.resolve(typeof w === 'function' && w(`Remove POD\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert('Remove POD', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

function progressForStep(step: StepId): number {
  if (step === 'completed') return 100;
  if (step === 'reached') return 80;
  if (step === 'transit') return 60;
  if (step === 'lr') return 50;
  if (step === 'pickup') return 40;
  if (step === 'accepted') return 20;
  return 0;
}

function formatDurationShort(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Only the two stages where the driver is stationary awaiting an action. */
function dwellLabelForStep(step: StepId, metrics: TripStageMetrics): string | null {
  if ((step === 'pickup' || step === 'lr') && metrics.pickupDwellDuration?.isRunning) {
    return `At pickup for ${formatDurationShort(metrics.pickupDwellDuration.ms)}`;
  }
  if (step === 'reached' && metrics.dropDwellDuration?.isRunning) {
    return `At drop for ${formatDurationShort(metrics.dropDwellDuration.ms)}`;
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function normalizeImageFileName(fileName: string | null | undefined): string {
  const base = (fileName ?? '').trim();
  if (!base) return `img-${Date.now()}.jpg`;
  const noExt = base.replace(/\.[^/.]+$/, '');
  return `${noExt || `img-${Date.now()}`}.jpg`;
}

async function optimizeImageForUpload(
  uri: string,
  quality: number = PROOF_IMAGE_JPEG_QUALITY,
): Promise<{ arrayBuffer: ArrayBuffer; mimeType: string }> {
  const compressed = await compressLocalImageForUpload(uri, { quality });
  return {
    arrayBuffer: compressed.arrayBuffer,
    mimeType: compressed.mimeType,
  };
}

function promptAttachmentImageSource(): Promise<'camera' | 'library' | null> {
  if (Platform.OS === 'web') {
    // Nested Alert is unreliable on web; prefer camera when confirm, else library.
    const w =
      typeof globalThis !== 'undefined'
        ? (globalThis as { confirm?: (msg: string) => boolean }).confirm
        : undefined;
    if (typeof w === 'function') {
      const useCamera = w('Use camera for a live photo?\n\nCancel = Photo library');
      return Promise.resolve(useCamera ? 'camera' : 'library');
    }
    return Promise.resolve('library');
  }
  return new Promise((resolve) => {
    Alert.alert('Add photo', 'Capture with camera or choose from library', [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      { text: 'Photo library', onPress: () => resolve('library') },
      { text: 'Camera', onPress: () => resolve('camera') },
    ]);
  });
}

async function pickAttachmentImageAsset(
  source: 'camera' | 'library',
): Promise<{ uri: string; fileName: string | null } | null> {
  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Camera permission is required');
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: PROOF_IMAGE_PICKER_QUALITY,
      exif: false,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    return {
      uri: result.assets[0].uri,
      fileName: result.assets[0].fileName ?? null,
    };
  }

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Permission to access photos is required');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: PROOF_IMAGE_PICKER_QUALITY,
    exif: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return {
    uri: result.assets[0].uri,
    fileName: result.assets[0].fileName ?? null,
  };
}

/**
 * Thin adapter over getStageMetadata() — was its own third wording set,
 * alongside getTripStageGuidance()'s CTA copy and getStageMetadata()'s badge
 * titles. `step` is already the canonical stage (deriveDriverFlowStepFromTrip
 * -> deriveTripStage), so this is presentation-only, not a duplicate
 * derivation. 'lr' is a local-only sub-step of 'pickup' — no server column
 * represents it, so there's no shared-engine title to defer to here.
 */
function titleForStep(step: StepId): string {
  if (step === 'lr') return 'Attach pickup proof';
  return getStageMetadata(step).title;
}

export interface DriverTripFlowCardProps {
  trip: tripsService.TripRow;
  /** Precomputed commission for non-aggregate trips (to match existing dashboard calc). */
  commissionAmount?: number;
  /** Road distance in km from driver's current position to the active target (pickup or drop). */
  distanceToTargetKm?: number | null;
  /** Live driver GPS (e.g. map / truck position) — pairs with driverLocationLabel. */
  driverLatitude?: number | null;
  driverLongitude?: number | null;
  /** Reverse-geocoded place for current GPS (no raw lat/long in UI). */
  driverLocationLabel?: string | null;
  /** Called after a server write that needs a parent list refetch (status / completion). Prefer `onTripUpdated` for in-mission patches. */
  onRefresh?: () => void;
  /** Optimistic patch so parent trip list (guidance header) updates before refetch. */
  onTripUpdated?: (trip: tripsService.TripRow) => void;
  /** Optional: collapse/expand toggle (UI only). */
  onToggleCollapse?: () => void;
  /** Optional: whether the card is currently collapsed (for chevron state + disabling actions). */
  collapsed?: boolean;
  /** Called when user finishes and returns to waiting state. */
  onBackToDashboard?: () => void;
  /** Called when trip is completed (after server confirms). */
  onTripCompleted?: () => void;
  /** When true, remove horizontal margins so the card fits inside edge-to-edge bottom sheet. */
  edgeToEdge?: boolean;
  /** Structured assigner (matches JobRequestCard hero). */
  assignedBy?: JobCardAssignerPayload | null;
  /**
   * Visual mode.
   * - "card": default rounded card frame (used elsewhere)
   * - "page": frameless page inside the existing bottom sheet container
   */
  variant?: 'card' | 'page';
  /**
   * When true, this card is the legacy Pickup → Drop path only.
   * Skip SES hydrate here — the Job Card wrapper already used SES to choose mode.
   */
  skipStopExecution?: boolean;
  /** Multi-order SES stops for the map. Legacy card never publishes this. */
  onRoutePlanMapChange?: (plan: DriverRoutePlanMap | null) => void;
  /** Peek the sheet and frame pickup/drop plan markers. Optional stopId focuses one pin. */
  onShowRouteOnMap?: (stopId?: string | null) => void;
  /** Incremented by the map "View details" control to open the order sheet. */
  deliveryDetailsNonce?: number;
}

function fmtKm(km: number): string {
  if (km >= 100) return `${Math.round(km)} km`;
  if (km >= 10) return `${km.toFixed(1)} km`;
  return `${km.toFixed(1)} km`;
}

function PodDocumentRow({
  doc,
  index,
  colors,
  podDeletingId,
  canDelete = true,
  docFallbackLabel = 'POD',
  onView,
  onDelete,
}: {
  doc: tripDocumentsService.TripDocumentRow;
  index: number;
  colors: { emerald: string; emeraldMuted?: string };
  podDeletingId: string | null;
  docFallbackLabel?: string;
  /** After delivery is completed, list stays view-only. */
  canDelete?: boolean;
  onView: (d: tripDocumentsService.TripDocumentRow) => void;
  onDelete: (d: tripDocumentsService.TripDocumentRow) => void | Promise<void>;
}) {
  return (
    <View
      style={[
        styles.podListItem,
        { borderColor: Theme.border },
        index === 0 && styles.podListItemFirst,
      ]}
    >
      <Text style={[styles.podListFileName, { color: Theme.textPrimaryDark }]} numberOfLines={1}>
        {doc.file_name || doc.storage_path.split('/').pop() || docFallbackLabel}
      </Text>
      <View style={styles.podListActions}>
        <TouchableOpacity
          style={[
            styles.podViewIconBtn,
            {
              backgroundColor: colors.emeraldMuted ?? Theme.surfaceLight,
              borderColor: colors.emerald,
            },
          ]}
          onPress={() => onView(doc)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`View ${doc.file_name || 'POD'}`}
        >
          <FontAwesome name="eye" size={14} color={colors.emerald} />
        </TouchableOpacity>
        {canDelete ? (
          <TouchableOpacity
            style={[
              styles.podDeleteIconBtn,
              { backgroundColor: Theme.negativeMuted, borderColor: Theme.negative },
            ]}
            onPress={() => void onDelete(doc)}
            disabled={podDeletingId === doc.id}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${doc.file_name || 'POD'}`}
          >
            {podDeletingId === doc.id ? (
              <LoadingIndicator size="small" color={Theme.negative} />
            ) : (
              <FontAwesome name="trash-o" size={14} color={Theme.negative} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export function DriverTripFlowCard({
  trip,
  commissionAmount,
  distanceToTargetKm,
  driverLatitude: _driverLatitude = null,
  driverLongitude: _driverLongitude = null,
  driverLocationLabel: _driverLocationLabel = null,
  onRefresh,
  onTripUpdated,
  onToggleCollapse,
  collapsed = false,
  onBackToDashboard,
  onTripCompleted,
  edgeToEdge = false,
  assignedBy = null,
  variant = 'card',
  skipStopExecution = false,
}: DriverTripFlowCardProps) {
  const colors = useDriverThemeColors();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const invalidateDriverHomeDashboard = useInvalidateDriverHomeDashboard();
  const router = useRouter();
  const { conversations, ensureDriverTripConversation } = useDriverChat();

  const [localTrip, setLocalTrip] = useState<tripsService.TripRow>(trip);
  const {
    stops: executionStops,
    currentStop,
    mutating: stopMutating,
    arrive: arriveCurrentStop,
    complete: completeCurrentStop,
  } = useDriverStopExecution(skipStopExecution ? null : trip.id);
  const showMultiStop = !skipStopExecution && shouldShowDriverMultiStop(executionStops);
  const ftlExtraStops = useRouteExtraStopRowsFor('trip', trip.id);
  const [step, setStep] = useState<StepId>(() => deriveDriverFlowStepFromTrip(trip));
  const [stepLoading, setStepLoading] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const insets = useSafeAreaInsets();

  // Owner Vehicle Link — DCO explicit vehicle selection for this trip.
  // Never auto-selected, including when the DCO has exactly one vehicle.
  const { canManageOwnerVehicles } = useDriverOperatingModeQuery(profile?.uid);
  const { vehicles: ownerVehicles, isLoading: ownerVehiclesLoading } =
    useOwnerVehiclesQuery(profile?.uid);
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [vehiclePickerSelectedId, setVehiclePickerSelectedId] = useState<string | null>(null);
  const [vehiclePickerBusy, setVehiclePickerBusy] = useState(false);
  const [vehiclePickerError, setVehiclePickerError] = useState<string | null>(null);
  const [shipperFeedbackOpen, setShipperFeedbackOpen] = useState(false);

  const openVehiclePicker = useCallback(() => {
    setVehiclePickerSelectedId(localTrip.owner_vehicle_id ?? null);
    setVehiclePickerError(null);
    setVehiclePickerOpen(true);
  }, [localTrip.owner_vehicle_id]);

  // Takes an explicit id (defaulting to the current selection state) rather
  // than always reading vehiclePickerSelectedId — the Clear action needs to
  // pass null directly, since setVehiclePickerSelectedId(null) followed by
  // calling this in the same handler would otherwise still see the
  // pre-update state value (React state updates aren't applied synchronously
  // within the same event handler).
  const confirmVehicleSelection = useCallback(
    async (idToSet: string | null = vehiclePickerSelectedId) => {
      const id = localTrip?.id;
      if (!id || vehiclePickerBusy) return;
      setVehiclePickerBusy(true);
      setVehiclePickerError(null);
      const { error, ownerVehicleId } = await setTripOwnerVehicle(id, idToSet);
      setVehiclePickerBusy(false);
      if (error) {
        setVehiclePickerError(error.message);
        return;
      }
      const updated = { ...localTrip, owner_vehicle_id: ownerVehicleId };
      setLocalTrip(updated);
      onTripUpdated?.(updated);
      setVehiclePickerOpen(false);
    },
    [localTrip, onTripUpdated, vehiclePickerBusy, vehiclePickerSelectedId],
  );

  const selectedOwnerVehicle = useMemo(
    () => ownerVehicles.find((v) => v.id === localTrip.owner_vehicle_id) ?? null,
    [ownerVehicles, localTrip.owner_vehicle_id],
  );
  /** Completion write in flight — keeps the hold button disabled so it cannot double-submit. */
  const [completing, setCompleting] = useState(false);

  const [podDocuments, setPodDocuments] = useState<tripDocumentsService.TripDocumentRow[]>([]);
  const [podLoading, setPodLoading] = useState(false);
  const [podUploading, setPodUploading] = useState(false);
  const [podSkipped, setPodSkipped] = useState(false);
  const [podViewUrls, setPodViewUrls] = useState<Record<string, string>>({});
  const podViewUrlsRequestedRef = useRef<Set<string>>(new Set());
  const lastPodTripIdRef = useRef<string | null>(null);
  const [viewingPodUrl, setViewingPodUrl] = useState<string | null>(null);
  const [viewingPodDocId, setViewingPodDocId] = useState<string | null>(null);
  const [viewingPodLoading, setViewingPodLoading] = useState(false);
  const [viewingPodError, setViewingPodError] = useState(false);
  const [podDeletingId, setPodDeletingId] = useState<string | null>(null);
  const podUploadCancelledRef = useRef(false);
  /** Full-page POD finish flow — auto-opens when entering AT DROP. */
  const [podPageVisible, setPodPageVisible] = useState(
    () => deriveDriverFlowStepFromTrip(trip) === 'reached',
  );
  const prevStepForPodPageRef = useRef<StepId>(deriveDriverFlowStepFromTrip(trip));
  /** Full-page LR / pickup-proof flow — auto-opens after Package collected. */
  const [lrPageVisible, setLrPageVisible] = useState(false);
  const prevStepForLrPageRef = useRef<StepId>(deriveDriverFlowStepFromTrip(trip));
  const revokeHoldRef = useRef<StepId | null>(null);

  const [lrDocuments, setLrDocuments] = useState<tripDocumentsService.TripDocumentRow[]>([]);
  const [lrNumber, setLrNumber] = useState('');
  const [lrLoading, setLrLoading] = useState(false);
  const [lrUploading, setLrUploading] = useState(false);
  const [lrSkipped, setLrSkipped] = useState(false);
  const [lrViewUrls, setLrViewUrls] = useState<Record<string, string>>({});
  const heldDocPreviewUrls = useRef<Map<string, string>>(new Map());
  useEffect(() => () => {
    for (const url of heldDocPreviewUrls.current.values()) releaseStoragePreviewUrl(url);
    heldDocPreviewUrls.current.clear();
  }, []);
  const retainDocPreview = (docId: string, url: string | null) => {
    const previous = heldDocPreviewUrls.current.get(docId);
    if (previous) {
      releaseStoragePreviewUrl(previous);
      heldDocPreviewUrls.current.delete(docId);
    }
    if (url) heldDocPreviewUrls.current.set(docId, url);
    return url;
  };
  useEffect(() => {
    const live = new Set([
      ...lrDocuments.map((doc) => doc.id),
      ...podDocuments.map((doc) => doc.id),
    ]);
    for (const [id, url] of heldDocPreviewUrls.current) {
      if (live.has(id)) continue;
      releaseStoragePreviewUrl(url);
      heldDocPreviewUrls.current.delete(id);
    }
  }, [lrDocuments, podDocuments]);
  const lrViewUrlsRequestedRef = useRef<Set<string>>(new Set());
  const lastLrTripIdRef = useRef<string | null>(null);
  const [lrDeletingId, setLrDeletingId] = useState<string | null>(null);
  const lrUploadCancelledRef = useRef(false);
  const [_lrHoldProgress, setLrHoldProgress] = useState(0);
  const [_isLrHolding, setIsLrHolding] = useState(false);
  const lrHoldTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [_holdProgress, setHoldProgress] = useState(0);
  const [_isHolding, setIsHolding] = useState(false);

  // Quick update panel state
  const [stagePhotoUploading, setStagePhotoUploading] = useState(false);

  // Sync from parent on identity/status changes only — not every new object
  // reference from dashboard invalidate / GPS-driven parent re-renders.
  const tripSyncKey = `${trip.id}|${trip.status}|${trip.updated_at ?? ''}|${trip.started_at ?? ''}|${trip.completed_at ?? ''}|${trip.distance ?? ''}|${trip.estimated_duration ?? ''}`;
  useEffect(() => {
    setLocalTrip(trip);
    const derived = deriveDriverFlowStepFromTrip(trip);
    setStep((prev) => {
      const hold = revokeHoldRef.current;
      if (hold) {
        const holdSatisfied = derived === hold || (hold === 'lr' && derived === 'pickup');
        if (holdSatisfied) revokeHoldRef.current = null;
        else return hold;
      }
      // Keep LR sub-step while still on pickup status.
      if (prev === 'lr' && derived === 'pickup') return prev;
      // Don't regress past a locally confirmed advance when parent still has stale status.
      const rank: Record<StepId, number> = {
        accepted: 0,
        pickup: 1,
        lr: 2,
        transit: 3,
        reached: 4,
        completed: 5,
      };
      if ((rank[prev] ?? 0) > (rank[derived] ?? 0)) return prev;
      return derived;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tripSyncKey gates identity
  }, [tripSyncKey]);

  // Auto-open full POD page whenever the driver enters AT DROP (`reached`).
  useEffect(() => {
    const prev = prevStepForPodPageRef.current;
    if (step === 'reached' && prev !== 'reached') {
      setPodPageVisible(true);
      if (collapsed) onToggleCollapse?.();
    }
    if (step !== 'reached') {
      setPodPageVisible(false);
    }
    prevStepForPodPageRef.current = step;
  }, [step, collapsed, onToggleCollapse]);

  // Auto-open full LR / pickup-proof page when entering the local LR stage.
  useEffect(() => {
    const prev = prevStepForLrPageRef.current;
    if (step === 'lr' && prev !== 'lr') {
      setLrPageVisible(true);
      if (collapsed) onToggleCollapse?.();
    }
    if (step !== 'lr') {
      setLrPageVisible(false);
    }
    prevStepForLrPageRef.current = step;
  }, [step, collapsed, onToggleCollapse]);

  // Restore the local-only "LR" sub-step across full reloads / remounts.
  // The LR phase ("Package collected" → upload Lorry Receipt) is NOT encoded in
  // server trip status (status stays `in_progress`, which derives to "pickup"),
  // so a hard reload — e.g. the stale-chunk deploy-recovery `location.replace`
  // in lib/webDeployRecovery.ts, or any remount from a dashboard refetch —
  // would otherwise reseed `step` to "pickup" and dump the driver back on the
  // "Package collected" screen. The per-trip marker lives in AsyncStorage, which
  // survives a page reload, so we can put them back on the LR upload step.
  useEffect(() => {
    const id = trip?.id;
    if (!id) return;
    let cancelled = false;
    void hasEnteredLrPhase(id).then((entered) => {
      if (cancelled || !entered) return;
      const derived = deriveDriverFlowStepFromTrip(trip);
      if (derived === 'pickup') {
        // Server still at pickup, but the driver already collected the package.
        setStep((prev) => (prev === 'pickup' ? 'lr' : prev));
      } else if (derived !== 'accepted') {
        // Trip genuinely advanced past LR (transit+) — drop the stale marker.
        void clearLrPhase(id);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore keyed by trip id
  }, [trip?.id]);

  const tripIsAggregate = useMemo(() => isAggregateTrip(localTrip), [localTrip]);

  const tripChatUnread = useMemo(() => {
    const id = String(localTrip?.id ?? '');
    if (!id) return 0;
    const conv = conversations.find((c) => String(c.trip_id) === id);
    return Math.max(0, conv?.unread_dispatcher_count ?? 0);
  }, [conversations, localTrip?.id]);

  // Presentation-only: this trip may have started life as a Reach
  // recommendation. Read-only lookup against reach_referrals — no new
  // reward logic, just surfacing the existing referral state on the card.
  const referralQ = useDriverReferralForTripQuery(localTrip?.id ?? null);
  const referralBadge = useMemo(() => {
    const referral = referralQ.data;
    if (!referral) return null;
    if (referral.status === 'rewarded') {
      return { label: `Reward ${formatINR(referral.reward_amount)} credited`, tone: 'rewarded' as const };
    }
    if (referral.status === 'bid_submitted' || referral.status === 'approved') {
      return { label: 'Recommended by you · reward pending', tone: 'pending' as const };
    }
    return null;
  }, [referralQ.data]);

  const shareTripDocumentInChat = useCallback(
    async (
      doc: { storage_path: string; file_name: string; mime_type: string | null },
      documentTypeLabel: string,
    ) => {
      const tripId = localTrip.id;
      const orgId = localTrip.organization_id;
      const driverId = localTrip.driver_id;
      const uid = profile?.uid;
      if (!tripId || !orgId || !driverId || !uid) return;
      const conversation = await ensureDriverTripConversation(tripId);
      if (!conversation) return;
      const convId = conversation.convId;
      const senderName =
        (profile as { full_name?: string; displayName?: string })?.full_name ||
        (profile as { displayName?: string })?.displayName ||
        'Driver';
      try {
        await sendDocumentShareMessage({
          conversationId: convId,
          organizationId: orgId,
          senderRole: 'driver',
          senderName,
          senderUserId: uid,
          metadata: {
            document_type: documentTypeLabel,
            storage_path: doc.storage_path,
            document_name: doc.file_name,
            mime_type: doc.mime_type ?? null,
            entity_type: 'driver',
            entity_id: driverId,
          },
        });
        // INSERT hits trip_messages realtime → DriverChatContext debounced refresh; skip duplicate full refetch here.
      } catch {
        // Upload already succeeded; chat share is best-effort.
      }
    },
    [ensureDriverTripConversation, localTrip.driver_id, localTrip.id, localTrip.organization_id, profile],
  );

  const resolvePodPreviewUrl = useCallback(
    async (doc: tripDocumentsService.TripDocumentRow): Promise<string | null> => {
      const cached = podViewUrls[doc.id];
      if (cached) return cached;
      const url = retainDocPreview(
        doc.id,
        await tripDocumentsService.tryGetDocumentViewUrl(doc.storage_path),
      );
      if (url) {
        setPodViewUrls((prev) => ({ ...prev, [doc.id]: url }));
      }
      return url;
    },
    [podViewUrls],
  );

  const openPodPreview = useCallback(
    async (doc: tripDocumentsService.TripDocumentRow) => {
      setViewingPodError(false);
      setViewingPodLoading(true);
      setViewingPodUrl(null);
      setViewingPodDocId(doc.id);
      try {
        const url = await resolvePodPreviewUrl(doc);
        if (url) {
          setViewingPodUrl(url);
        } else {
          setViewingPodError(true);
        }
      } catch {
        setViewingPodError(true);
      } finally {
        setViewingPodLoading(false);
      }
    },
    [resolvePodPreviewUrl],
  );

  const resolveLrPreviewUrl = useCallback(
    async (doc: tripDocumentsService.TripDocumentRow): Promise<string | null> => {
      const cached = lrViewUrls[doc.id];
      if (cached) return cached;
      const url = retainDocPreview(
        doc.id,
        await tripDocumentsService.tryGetDocumentViewUrl(doc.storage_path),
      );
      if (url) {
        setLrViewUrls((prev) => ({ ...prev, [doc.id]: url }));
      }
      return url;
    },
    [lrViewUrls],
  );

  const cancelPodUpload = useCallback(() => {
    podUploadCancelledRef.current = true;
    setPodUploading(false);
  }, []);

  const revokeSharedTripDocumentInChat = useCallback(
    async (storagePath: string) => {
      const tripId = String(localTrip.id ?? '').trim();
      const path = String(storagePath ?? '').trim();
      if (!tripId || !path) return;
      invalidateChatDocumentUrlCaches(path);
      const { error } = await softDeleteTripChatByStoragePath({
        tripId,
        storagePath: path,
      });
      if (error && __DEV__) {
        console.warn('[trip-flow] softDeleteTripChatByStoragePath:', error.message);
      }
    },
    [localTrip.id],
  );

  /**
   * Status writes already call `onTripUpdated` (optimistic + confirmed).
   * Skip full-home `onRefresh` when that patch path exists — dashboard
   * invalidate remounts the sheet and flashes the map under POD/LR.
   */
  const syncAfterStatusWrite = useCallback(() => {
    if (onTripUpdated) return;
    onRefresh?.();
  }, [onTripUpdated, onRefresh]);

  const confirmDeletePod = useCallback(
    async (doc: tripDocumentsService.TripDocumentRow) => {
      const ok = await confirmRemovePod();
      if (!ok) return;
      setPodDeletingId(doc.id);
      setStepError(null);
      const { error } = await tripDocumentsService.deleteTripDocument(doc);
      setPodDeletingId(null);
      if (error) {
        setStepError(error.message);
        return;
      }
      setPodDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setPodViewUrls((prev) => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
      for (const key of podViewUrlsRequestedRef.current) {
        if (key === doc.id || key.startsWith(`${doc.id}:`)) podViewUrlsRequestedRef.current.delete(key);
      }
      const heldPodUrl = heldDocPreviewUrls.current.get(doc.id);
      if (heldPodUrl) {
        releaseStoragePreviewUrl(heldPodUrl);
        heldDocPreviewUrls.current.delete(doc.id);
      }
      void revokeSharedTripDocumentInChat(doc.storage_path);
      // Local list already updated — do not onRefresh (closes sheet / flashes map).
    },
    [revokeSharedTripDocumentInChat],
  );

  const { earnings, earningsLabel } = useMemo(() => {
    // Aggregate / supplier-mediated: shipper commercial ₹ is not driver pay.
    // Driver-cum-Owner earnings are not defined yet for this path.
    if (tripIsAggregate) {
      return {
        earnings: DRIVER_PAY_NA_AMOUNT,
        earningsLabel: DRIVER_PAY_NA_LABEL,
      };
    }
    const n = Math.max(0, Number(commissionAmount ?? 0) || 0);
    if (n > 0) {
      return { earnings: formatINR(n), earningsLabel: 'EST. EARNINGS' };
    }
    return {
      earnings: DRIVER_PAY_NA_AMOUNT,
      earningsLabel: DRIVER_PAY_NA_LABEL,
    };
  }, [tripIsAggregate, commissionAmount]);

  const _progressPct = useMemo(() => progressForStep(step), [step]);
  const title = useMemo(() => titleForStep(step), [step]);

  const showHeroAssigner = useMemo(() => {
    if (!assignedBy) return false;
    return Boolean(
      assignedBy.linePrimary.trim() || assignedBy.lineSecondary.trim(),
    );
  }, [assignedBy]);

  const tripDistanceLabel = useMemo(() => {
    const d = localTrip.distance;
    if (d != null && Number(d) > 0) return fmtKm(Number(d));
    return '—';
  }, [localTrip.distance]);

  const tripEtaLabel = useMemo(() => {
    const e = localTrip.estimated_duration;
    if (e != null && String(e).trim() !== '' && !String(e).includes('00:00:00')) {
      return formatEstimatedDuration(e);
    }
    return '—';
  }, [localTrip.estimated_duration]);

  const detailsStatLeft = useMemo(() => {
    if (
      (step === 'accepted' || step === 'pickup' || step === 'transit') &&
      distanceToTargetKm != null
    ) {
      const suffix =
        step === 'accepted' || step === 'pickup' ? ' to pickup' : ' to drop';
      return `${fmtKm(distanceToTargetKm)}${suffix}`;
    }
    return tripDistanceLabel;
  }, [step, distanceToTargetKm, tripDistanceLabel]);

  const pickupLabel = localTrip.pickup_area?.trim() || '—';
  const dropLabel =
    (localTrip.drop_location || (localTrip as { drop_area?: string }).drop_area)?.trim() ||
    '—';
  const missionPlan = useMemo(() => {
    if (executionStops.length < 2) {
      if (ftlExtraStops.length === 0) return null;
      const atPickup = step === 'accepted' || step === 'pickup';
      return planStopsFromLabeled([
        { id: 'pickup', sequence: 0, type: 'pickup', place: pickupLabel, isCurrent: atPickup },
        ...ftlExtraStops.map((stop) => ({
          id: stop.id,
          sequence: stop.sequence,
          type: 'drop',
          place: stop.location,
        })),
        {
          id: 'drop',
          sequence: ftlExtraStops.length + 1,
          type: 'drop',
          place: dropLabel,
          isCurrent: !atPickup,
        },
      ]);
    }
    return planStopsFromLabeled(
      executionStops.map((stop) => ({
        id: stop.stopId,
        sequence: stop.sequence,
        type: String(stop.stopType),
        place:
          stop.displayName?.trim() ||
          stop.city?.trim() ||
          stop.addressLine?.trim() ||
          `Stop ${stop.sequence}`,
        isCurrent: stop.stopId === currentStop?.stopId,
      })),
    );
  }, [executionStops, currentStop?.stopId, ftlExtraStops, step, pickupLabel, dropLabel]);
  const tripDateLabel = useMemo(() => {
    const raw = String(localTrip.pickup_date ?? localTrip.created_at ?? "").trim();
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, [localTrip.pickup_date, localTrip.created_at]);

  // Same platform services the business Operations Control Panel consumes
  // (see docs/TRIP_OPERATIONS_PLATFORM.md) — reused here, not reimplemented.
  const { events: timelineEvents } = useTripTimelineQuery(trip.id ?? null, localTrip.created_at ?? null);
  const { distanceCoveredM } = useTripCheckpointDistanceQuery(trip.id ?? null);
  const { presence } = useTripDriverPresenceQuery(trip.id ?? null);
  const stageMetrics = useMemo(
    () => computeTripStageMetrics(localTrip, timelineEvents),
    [localTrip, timelineEvents],
  );
  const journeyMetrics = useMemo(
    () => computeJourneyMetrics(localTrip, distanceCoveredM, stageMetrics),
    [localTrip, distanceCoveredM, stageMetrics],
  );
  const dwellLabel = useMemo(() => dwellLabelForStep(step, stageMetrics), [step, stageMetrics]);
  const operationalAlerts = useMemo(
    () => evaluateOperationalAlerts({ metrics: stageMetrics, events: timelineEvents, presence, journeyMetrics }),
    [stageMetrics, timelineEvents, presence, journeyMetrics],
  );
  // Translated to plain, action-oriented copy — drivers never see alert
  // titles or health tiers directly (that's dispatch language).
  const guidanceMessage = useMemo(() => getDriverAlertGuidance(operationalAlerts), [operationalAlerts]);

  const stageTarget = useMemo(
    () => (step === 'completed' ? null : getTripStageTarget(step)),
    [step],
  );
  const navigateCoordinate = useMemo(
    () => (stageTarget ? getTripStopCoordinate(localTrip, stageTarget) : null),
    [stageTarget, localTrip],
  );
  const onNavigate = useMemo(() => {
    if (navigateCoordinate) {
      return () => {
        void openExternalNavigation(
          navigateCoordinate.latitude,
          navigateCoordinate.longitude,
        );
      };
    }
    const place =
      stageTarget === 'pickup'
        ? pickupLabel
        : dropLabel;
    const q = (place ?? '').trim();
    if (!q || q === '—') return null;
    return () => {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
      void Linking.openURL(url);
    };
  }, [navigateCoordinate, stageTarget, pickupLabel, dropLabel]);
  const routeTotalKm = useMemo(() => {
    const d = Number(localTrip.distance);
    return Number.isFinite(d) && d > 0 ? d : null;
  }, [localTrip.distance]);

  const loadPodDocuments = useCallback(
    (opts?: { silent?: boolean }) => {
      const id = localTrip?.id;
      if (!id) return;
      if (!opts?.silent) setPodLoading(true);
      tripDocumentsService.getDocumentsByTripId(id).then(({ documents, error }) => {
        setPodLoading(false);
        if (!error) {
          setPodDocuments(documents.filter((d) => d.document_type === 'pod'));
          lastPodTripIdRef.current = id;
        }
      });
    },
    [localTrip?.id],
  );

  useEffect(() => {
    if (step !== 'reached' && step !== 'completed') {
      setPodSkipped(false);
      return;
    }
    const id = localTrip?.id;
    if (!id) return;
    if (id !== lastPodTripIdRef.current) setPodDocuments([]);
    const hasCache = lastPodTripIdRef.current === id;
    loadPodDocuments(hasCache ? { silent: true } : undefined);
  }, [step, localTrip?.id, loadPodDocuments]);

  const loadLrDocuments = useCallback(
    (opts?: { silent?: boolean }) => {
      const id = localTrip?.id;
      if (!id) return;
      if (!opts?.silent) setLrLoading(true);
      tripDocumentsService.getDocumentsByTripId(id).then(({ documents, error }) => {
        setLrLoading(false);
        if (!error) {
          setLrDocuments(documents.filter((d) => d.document_type === 'lr'));
          lastLrTripIdRef.current = id;
        }
      });
    },
    [localTrip?.id],
  );

  useEffect(() => {
    if (step !== 'lr') {
      setLrSkipped(false);
      if (lrHoldTimerRef.current) {
        clearInterval(lrHoldTimerRef.current);
        lrHoldTimerRef.current = null;
      }
      setLrHoldProgress(0);
      setIsLrHolding(false);
      return;
    }
    const id = localTrip?.id;
    if (!id) return;
    if (id !== lastLrTripIdRef.current) setLrDocuments([]);
    const hasCache = lastLrTripIdRef.current === id;
    loadLrDocuments(hasCache ? { silent: true } : undefined);
  }, [step, localTrip?.id, loadLrDocuments]);

  useEffect(() => {
    if (lrDocuments.length === 0) return;
    let cancelled = false;
    lrDocuments.forEach((doc) => {
      const requestKey = `${doc.id}:${doc.storage_path}`;
      if (lrViewUrlsRequestedRef.current.has(requestKey)) return;
      lrViewUrlsRequestedRef.current.add(requestKey);
      tripDocumentsService.tryGetDocumentViewUrl(doc.storage_path).then((url) => {
        if (cancelled) {
          lrViewUrlsRequestedRef.current.delete(requestKey);
          releaseStoragePreviewUrl(url);
          return;
        }
        retainDocPreview(doc.id, url);
        if (!url) return;
        setLrViewUrls((prev) => ({ ...prev, [doc.id]: url }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [lrDocuments]);

  useEffect(() => {
    if (podDocuments.length === 0) return;
    let cancelled = false;
    podDocuments.forEach((doc) => {
      const requestKey = `${doc.id}:${doc.storage_path}`;
      if (podViewUrlsRequestedRef.current.has(requestKey)) return;
      podViewUrlsRequestedRef.current.add(requestKey);
      tripDocumentsService.tryGetDocumentViewUrl(doc.storage_path).then((url) => {
        if (cancelled) {
          podViewUrlsRequestedRef.current.delete(requestKey);
          releaseStoragePreviewUrl(url);
          return;
        }
        retainDocPreview(doc.id, url);
        if (!url) return;
        setPodViewUrls((prev) => ({ ...prev, [doc.id]: url }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [podDocuments]);

  const confirmArrival = async () => {
    const id = localTrip?.id;
    if (!id || stepLoading) return;
    const now = new Date().toISOString();
    setStepError(null);
    setStepLoading(true);
    setStep('pickup');
    const optimistic = {
      ...localTrip,
      status: 'in_progress',
      started_at: localTrip?.started_at ?? now,
      updated_at: now,
    };
    setLocalTrip(optimistic);
    onTripUpdated?.(optimistic);
    const { error, result } = await executeDriverCommand(
      { tripId: id, command: 'START_TRIP', expectedStatus: localTrip?.status ?? null },
      localTrip,
    );
    setStepLoading(false);
    if (error || !result) {
      setStepError(error?.message ?? 'Could not start the trip.');
      setStep('accepted');
      const reverted = { ...localTrip, status: 'assigned' };
      setLocalTrip(reverted);
      onTripUpdated?.(reverted);
      return;
    }
    const updated = applyDriverCommandResult(localTrip, result);
    setLocalTrip(updated);
    onTripUpdated?.(updated);
    syncAfterStatusWrite();
  };

  // Explicit driver action ("Package collected"). Enters the local-only LR
  // sub-step and persists that entry so a full reload / remount restores "lr"
  // instead of regressing to the "Package collected" (pickup) screen. No server
  // write — LR upload must not change trip status.
  const handlePackageCollected = useCallback(() => {
    setStep('lr');
    const id = localTrip?.id;
    if (id) void markLrPhaseEntered(id);
  }, [localTrip?.id]);

  const engageTransit = async () => {
    const id = localTrip?.id;
    if (!id || stepLoading) return;
    setStepError(null);
    setStepLoading(true);
    const now = new Date().toISOString();
    setStep('transit');
    const optimistic = { ...localTrip, status: 'in_transit', updated_at: now };
    setLocalTrip(optimistic);
    onTripUpdated?.(optimistic);
    const { error, result } = await executeDriverCommand(
      { tripId: id, command: 'DEPART_PICKUP', expectedStatus: localTrip?.status ?? null },
      localTrip,
    );
    setStepLoading(false);
    if (error || !result) {
      setStepError(error?.message ?? 'Could not update the trip.');
      setStep('lr');
      const reverted = { ...localTrip, status: 'in_progress', updated_at: localTrip.updated_at };
      setLocalTrip(reverted);
      onTripUpdated?.(reverted);
      return;
    }
    // Left the LR phase for good — drop the persisted marker so it can't
    // restore a stale sub-step after a future reload.
    void clearLrPhase(id);
    const updated = applyDriverCommandResult(localTrip, result);
    setLocalTrip(updated);
    onTripUpdated?.(updated);
    syncAfterStatusWrite();
  };

  const revokeTarget = previousStageTarget(step);

  const confirmRevokeStage = async () => {
    const id = localTrip?.id;
    const target = previousStageTarget(step);
    const reason = revokeReason.trim();
    if (!id || !target || stepLoading || reason.length === 0) return;
    setStepError(null);
    setStepLoading(true);
    if (target.status) {
      const { error, result } = await executeDriverCommand(
        { tripId: id, command: 'UNDO_STEP', expectedStatus: localTrip?.status ?? null },
        localTrip,
      );
      if (error || !result) {
        setStepLoading(false);
        setStepError(error?.message ?? 'Could not go back a stage.');
        return;
      }
      const nextTrip = applyDriverCommandResult(localTrip, result);
      setLocalTrip(nextTrip);
      onTripUpdated?.(nextTrip);
    }
    if (target.lr === 'clear') void clearLrPhase(id);
    if (target.lr === 'enter') void markLrPhaseEntered(id);
    revokeHoldRef.current = target.step;
    setStep(target.step);
    setRevokeOpen(false);
    setRevokeReason('');
    setStepLoading(false);
    const noted = await appendDriverStatusNote(id, target.step, `Stage revoked — ${reason}`);
    if (noted.error) setStepError(noted.error);
    syncAfterStatusWrite();
  };

  const confirmReached = async () => {
    const id = localTrip?.id;
    if (!id || stepLoading) return;
    setStepError(null);
    setStepLoading(true);
    const now = new Date().toISOString();
    const optimistic = { ...localTrip, status: 'at_drop', updated_at: now };
    setStep('reached');
    setLocalTrip(optimistic);
    onTripUpdated?.(optimistic);
    const { error, result } = await executeDriverCommand(
      { tripId: id, command: 'ARRIVE_DROP', expectedStatus: localTrip?.status ?? null },
      localTrip,
    );
    setStepLoading(false);
    if (error || !result) {
      setStep('transit');
      const reverted = { ...localTrip, status: 'in_transit', updated_at: localTrip.updated_at };
      setLocalTrip(reverted);
      onTripUpdated?.(reverted);
      setStepError(error?.message ?? 'Could not update the trip.');
      return;
    }
    const updated = applyDriverCommandResult(localTrip, result);
    setLocalTrip(updated);
    onTripUpdated?.(updated);
    syncAfterStatusWrite();
  };

  const uploadStagePhoto = async () => {
    const id = localTrip?.id;
    if (!id || !profile?.uid || stagePhotoUploading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setStepError('Permission to access photos is required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: PROOF_IMAGE_PICKER_QUALITY,
      exif: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setStepError(null);
    setStagePhotoUploading(true);
    const uri = result.assets[0].uri;
    const fileName = `stage-${step}-${Date.now()}.jpg`;
    try {
      const { arrayBuffer, mimeType } = await optimizeImageForUpload(uri);
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        setStepError('Could not read image file');
        setStagePhotoUploading(false);
        return;
      }
      if (arrayBuffer.byteLength > MAX_CHAT_IMAGE_BYTES) {
        setStepError(
          `Image too large (${formatBytes(arrayBuffer.byteLength)}). Max allowed is ${formatBytes(MAX_CHAT_IMAGE_BYTES)}.`,
        );
        setStagePhotoUploading(false);
        return;
      }
      const stageLabel =
        step === 'accepted'
          ? 'Trip photo (pickup)'
          : step === 'transit'
            ? 'Trip photo (en route)'
            : step === 'reached'
              ? 'Trip photo (drop-off)'
              : 'Trip photo';
      const { result: chatUpload, error: chatUploadError } =
        await tripDocumentsService.uploadTripChatImage(id, {
          arrayBuffer,
          fileName,
          mimeType,
        });
      if (chatUploadError) {
        setStepError(chatUploadError.message);
      } else if (chatUpload) {
        await shareTripDocumentInChat(
          {
            storage_path: chatUpload.storagePath,
            file_name: chatUpload.fileName,
            mime_type: chatUpload.mimeType,
          },
          stageLabel,
        );
        // Chat realtime handles badge — skip dashboard refresh (avoids sheet/map flash).
      }
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setStagePhotoUploading(false);
    }
  };

  const uploadPod = async (source?: 'camera' | 'library') => {
    const id = localTrip?.id;
    if (!id || !profile?.uid || podUploading) return;
    let pickedSource = source;
    if (!pickedSource) {
      pickedSource = (await promptAttachmentImageSource()) ?? undefined;
    }
    if (!pickedSource) return;

    let asset: { uri: string; fileName: string | null } | null = null;
    try {
      asset = await pickAttachmentImageAsset(pickedSource);
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'Could not open camera or photos');
      return;
    }
    if (!asset) return;

    setStepError(null);
    podUploadCancelledRef.current = false;
    setPodUploading(true);
    const uri = asset.uri;
    const fileName = normalizeImageFileName(asset.fileName ?? `pod-${Date.now()}`);
    try {
      const { arrayBuffer, mimeType } = await optimizeImageForUpload(uri);

      if (podUploadCancelledRef.current) {
        return;
      }

      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        setStepError('Could not read image file');
        return;
      }
      if (arrayBuffer.byteLength > MAX_POD_IMAGE_BYTES) {
        setStepError(
          `Image too large (${formatBytes(arrayBuffer.byteLength)}). Max allowed is ${formatBytes(MAX_POD_IMAGE_BYTES)}.`,
        );
        return;
      }

      if (podUploadCancelledRef.current) {
        return;
      }

      const { doc, error } = await tripDocumentsService.uploadTripDocument(id, profile.uid, {
        arrayBuffer,
        fileName,
        mimeType,
      }, 'pod');
      if (error) {
        setStepError(error.message);
        return;
      }
      if (doc && podUploadCancelledRef.current) {
        await tripDocumentsService.deleteTripDocument(doc);
        return;
      }
      if (doc) {
        setPodDocuments((prev) => [doc, ...prev]);
        await shareTripDocumentInChat(doc, 'Proof of delivery');
      }
      // Local POD list + chat share update UI — do not onRefresh (sheet remount / map flash).
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      podUploadCancelledRef.current = false;
      setPodUploading(false);
    }
  };

  const uploadLr = async (source?: 'camera' | 'library') => {
    const id = localTrip?.id;
    if (!id || !profile?.uid || lrUploading) return;
    let pickedSource = source;
    if (!pickedSource) {
      pickedSource = (await promptAttachmentImageSource()) ?? undefined;
    }
    if (!pickedSource) return;

    let asset: { uri: string; fileName: string | null } | null = null;
    try {
      asset = await pickAttachmentImageAsset(pickedSource);
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'Could not open camera or photos');
      return;
    }
    if (!asset) return;

    setStepError(null);
    lrUploadCancelledRef.current = false;
    setLrUploading(true);
    const uri = asset.uri;
    const fileName = normalizeImageFileName(asset.fileName ?? `lr-${Date.now()}`);
    try {
      const { arrayBuffer, mimeType } = await optimizeImageForUpload(uri);

      if (lrUploadCancelledRef.current) {
        return;
      }

      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        setStepError('Could not read image file');
        return;
      }
      if (arrayBuffer.byteLength > MAX_POD_IMAGE_BYTES) {
        setStepError(
          `Image too large (${formatBytes(arrayBuffer.byteLength)}). Max allowed is ${formatBytes(MAX_POD_IMAGE_BYTES)}.`,
        );
        return;
      }

      if (lrUploadCancelledRef.current) {
        return;
      }

      const typedLr = lrNumber.trim();
      if (typedLr) {
        const duplicate = await findOrgDuplicateLrNumberForTrip({
          tripId: id,
          lrNumber: typedLr,
        });
        if (duplicate) {
          setStepError(ORG_LR_DUPLICATE_MESSAGE);
          return;
        }
      }

      const { doc, error } = await tripDocumentsService.uploadTripDocument(id, profile.uid, {
        arrayBuffer,
        fileName,
        mimeType,
      }, 'lr', lrNumber);
      if (error) {
        setStepError(error.message);
        return;
      }
      if (doc && lrUploadCancelledRef.current) {
        await tripDocumentsService.deleteTripDocument(doc);
        return;
      }
      if (doc) {
        setLrDocuments((prev) => [doc, ...prev]);
        setLrNumber('');
        await shareTripDocumentInChat(doc, 'LR / pickup proof');
      }
      // NOTE: intentionally NOT calling onRefresh?.() here. LR upload does not
      // change trip status and the dashboard does not render LR docs, so a full
      // driver-home invalidation is pure churn — it forces a refetch + trip
      // re-sync (and any lazy re-render) that was resetting this card back to
      // the "Package collected" step and could trip the stale-chunk reload.
      // The uploaded doc is already in local state; chat share drives the badge.
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      lrUploadCancelledRef.current = false;
      setLrUploading(false);
    }
  };

  const cancelLrUpload = useCallback(() => {
    lrUploadCancelledRef.current = true;
    setLrUploading(false);
  }, []);

  const confirmDeleteLr = useCallback(
    async (doc: tripDocumentsService.TripDocumentRow) => {
      const ok = await confirmRemovePod();
      if (!ok) return;
      setLrDeletingId(doc.id);
      setStepError(null);
      const { error } = await tripDocumentsService.deleteTripDocument(doc);
      setLrDeletingId(null);
      if (error) {
        setStepError(error.message);
        return;
      }
      setLrDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setLrViewUrls((prev) => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
      for (const key of lrViewUrlsRequestedRef.current) {
        if (key === doc.id || key.startsWith(`${doc.id}:`)) lrViewUrlsRequestedRef.current.delete(key);
      }
      const heldLrUrl = heldDocPreviewUrls.current.get(doc.id);
      if (heldLrUrl) {
        releaseStoragePreviewUrl(heldLrUrl);
        heldDocPreviewUrls.current.delete(doc.id);
      }
      void revokeSharedTripDocumentInChat(doc.storage_path);
      // Local LR list already updated — do not onRefresh.
    },
    [revokeSharedTripDocumentInChat],
  );

  const completeTrip = async () => {
    const id = localTrip?.id;
    if (!id) return;
    const now = new Date().toISOString();
    setHoldProgress(0);
    setIsHolding(false);
    // Deliberately NOT optimistic. The server routinely rejects completion (POD
    // required, missing supplier link), and flipping to step 'completed' first
    // unmounted the stepError banner — which lives inside the `step !== 'completed'`
    // branch — so the driver saw the panel snap back to POD with no reason given,
    // indistinguishable from a reload. Stay on this step until the write is confirmed.
    setCompleting(true);
    setStepError(null);
    const { error, result } = await executeDriverCommand(
      { tripId: id, command: 'COMPLETE_TRIP', expectedStatus: localTrip?.status ?? null },
      localTrip,
    );
    setCompleting(false);
    if (error || !result) {
      setStepError(error?.message ?? 'Could not complete the trip.');
      return;
    }
    setStep('completed');
    const next = applyDriverCommandResult(
      { ...localTrip, completed_at: localTrip?.completed_at ?? now },
      result,
    );
    setLocalTrip(next);
    onTripUpdated?.(next);
    await AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
    // Neither cache was invalidated on completion before -- the Dashboard's
    // availability gate and DriverTripOpsContext's own "current active job"
    // query could both keep showing this trip as active until something
    // unrelated happened to refresh them. is_driver_available() remains the
    // sole backend authority; this only catches the client's cache up to it.
    if (profile?.uid) {
      void invalidateDriverHomeDashboard(profile.uid);
      void queryClient.invalidateQueries({ queryKey: driverUiTripsQueryKey(profile.uid) });
    }
    onTripCompleted?.();
    setShipperFeedbackOpen(true);
  };

  const peekCopy = missionStagePeekCopy(step, pickupLabel, dropLabel);
  const peekBounce = useSharedValue(0);

  useEffect(() => {
    if (!collapsed) {
      peekBounce.value = 0;
      return;
    }
    peekBounce.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 650, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 650, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [collapsed, peekBounce]);

  const peekChevronStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: peekBounce.value }],
  }));

  if (collapsed) {
    return (
      <>
        <Pressable
          onPress={() => onToggleCollapse?.()}
          style={[
            styles.sheet,
            variant === 'page' || edgeToEdge ? styles.sheetEdgeToEdge : styles.sheetInset,
            styles.collapsedPeek,
          ]}
          accessibilityRole="button"
          accessibilityLabel={peekCopy.label}
          accessibilityHint="Opens full trip card"
        >
          <View style={styles.collapsedPeekInner}>
            <View style={[styles.collapsedPeekDot, { backgroundColor: FLOW_EMERALD }]} />
            <View style={styles.collapsedPeekTextCol}>
              {peekCopy.kicker ? (
                <Text style={styles.collapsedPeekKicker} numberOfLines={1}>
                  {peekCopy.kicker}
                </Text>
              ) : null}
              <Text style={styles.collapsedPeekPlace} numberOfLines={1}>
                {peekCopy.place}
              </Text>
            </View>
            <Animated.View style={[styles.collapsedPeekHintWrap, peekChevronStyle]}>
              <ChevronUp size={16} color={FLOW_EMERALD} strokeWidth={2.6} />
              <Text style={styles.collapsedPeekHint}>Drag up</Text>
            </Animated.View>
          </View>
        </Pressable>
        {step === 'lr' ? (
          <DriverPodCompletionPage
            visible={lrPageVisible}
            variant="lr"
            onCloseToMap={() => setLrPageVisible(false)}
            placeLabel={pickupLabel}
            earnings={earnings}
            earningsLabel={earningsLabel}
            documents={lrDocuments}
            viewUrls={lrViewUrls}
            docsLoading={lrLoading}
            uploading={lrUploading}
            skipped={lrSkipped}
            deletingId={lrDeletingId}
            actionBusy={stepLoading}
            stepError={stepError}
            onUpload={uploadLr}
            onCancelUpload={cancelLrUpload}
            onSkip={() => setLrSkipped(true)}
            lrNumber={lrNumber}
            onChangeLrNumber={setLrNumber}
            tripId={localTrip?.id}
            onResolvePreview={resolveLrPreviewUrl}
            onDelete={confirmDeleteLr}
            onConfirmAction={() => { void engageTransit(); }}
            complianceNotice={<LoadingComplianceNotice complianceVerifiedAt={localTrip?.compliance_verified_at ?? null} />}
          />
        ) : null}
        {step === 'reached' ? (
          <DriverPodCompletionPage
            visible={podPageVisible}
            variant="pod"
            onCloseToMap={() => setPodPageVisible(false)}
            placeLabel={dropLabel}
            earnings={earnings}
            earningsLabel={earningsLabel}
            documents={podDocuments}
            viewUrls={podViewUrls}
            docsLoading={podLoading}
            uploading={podUploading}
            skipped={podSkipped}
            deletingId={podDeletingId}
            actionBusy={completing}
            stepError={stepError}
            onUpload={uploadPod}
            onCancelUpload={cancelPodUpload}
            onSkip={() => setPodSkipped(true)}
            onResolvePreview={resolvePodPreviewUrl}
            onDelete={confirmDeletePod}
            onConfirmAction={() => { void completeTrip(); }}
          />
        ) : null}
      </>
    );
  }

  const revokeButton = revokeTarget ? (
    <TouchableOpacity
      style={[
        styles.revokeBtn,
        { backgroundColor: Theme.surface, borderColor: Theme.border },
        stepLoading && styles.btnDisabled,
      ]}
      onPress={() => {
        setRevokeReason('');
        setRevokeOpen(true);
      }}
      disabled={stepLoading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Go back to ${revokeTarget.label}`}
    >
      <FontAwesome name="undo" size={14} color={Theme.textPrimaryDark} />
      <Text style={[styles.revokeBtnText, { color: Theme.textPrimaryDark }]}>Back</Text>
    </TouchableOpacity>
  ) : null;

  const viewingPodIndex = viewingPodDocId
    ? podDocuments.findIndex((d) => d.id === viewingPodDocId)
    : -1;
  const viewingPodPrevDoc = viewingPodIndex > 0 ? podDocuments[viewingPodIndex - 1] : null;
  const viewingPodNextDoc =
    viewingPodIndex >= 0 && viewingPodIndex < podDocuments.length - 1
      ? podDocuments[viewingPodIndex + 1]
      : null;

  return (
    <View
      style={[
        styles.sheet,
        variant === 'page' || edgeToEdge ? styles.sheetEdgeToEdge : styles.sheetInset,
        variant !== 'page' ? styles.shadow : null,
      ]}
    >
      {variant === 'card' && !edgeToEdge ? (
        <View style={styles.handleWrap}>
          <View style={[styles.handleBar, { backgroundColor: Theme.border }]} />
        </View>
      ) : null}

      {referralBadge ? (
        <View
          style={[
            styles.referralBadgeRow,
            referralBadge.tone === 'rewarded'
              ? { backgroundColor: Theme.positiveMuted }
              : { backgroundColor: Theme.accentGoldMuted },
          ]}
        >
          <FontAwesome
            name={referralBadge.tone === 'rewarded' ? 'gift' : 'clock-o'}
            size={11}
            color={referralBadge.tone === 'rewarded' ? Theme.positive : Theme.accentGold}
          />
          <Text
            style={[
              styles.referralBadgeText,
              { color: referralBadge.tone === 'rewarded' ? Theme.positive : Theme.accentGoldPressed },
            ]}
            numberOfLines={1}
          >
            {referralBadge.label}
          </Text>
        </View>
      ) : null}

      {step !== 'completed' ? (
        <MissionCardLayout
          title={title}
          earnings={earnings}
          earningsLabel={earningsLabel}
          assignedBy={assignedBy}
          showHeroAssigner={showHeroAssigner}
          target={stageTarget}
          pickupLabel={pickupLabel}
          dropLabel={dropLabel}
          planStops={missionPlan && missionPlan.length > 1 ? missionPlan : null}
          tripIdLabel={tripsService.resolveDriverFacingTripLabel(localTrip)}
          tripDateLabel={tripDateLabel}
          remainingKm={step === 'accepted' || step === 'pickup' || step === 'transit' ? distanceToTargetKm ?? null : null}
          routeTotalKm={routeTotalKm}
          distanceLabel={detailsStatLeft}
          etaLabel={tripEtaLabel}
          vehicleNumber={localTrip.vehicle_display_number}
          dwellLabel={dwellLabel}
          guidanceMessage={guidanceMessage}
          onNavigate={onNavigate}
        />
      ) : null}

      {showMultiStop && step !== 'completed' ? (
        <DriverMissionStopsList
          stops={executionStops}
          currentStopId={currentStop?.stopId ?? null}
          actionBusy={stopMutating != null}
          onArrive={() => {
            void arriveCurrentStop().then((result) => {
              if (result.ignored) return;
              if (!result.ok && result.error) setStepError(result.error.message);
              else setStepError(null);
            });
          }}
          onComplete={() => {
            void completeCurrentStop().then((result) => {
              if (result.ignored) return;
              if (!result.ok && result.error) setStepError(result.error.message);
              else setStepError(null);
            });
          }}
        />
      ) : null}

      {canManageOwnerVehicles && step !== 'completed' ? (
        <Pressable
          onPress={openVehiclePicker}
          style={({ pressed }) => [
            ownerVehicleRowStyles.row,
            { borderColor: colors.borderSubtle, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            selectedOwnerVehicle ? 'Change vehicle for this trip' : 'Select vehicle for this trip'
          }
        >
          <FontAwesome name="truck" size={14} color={colors.textMuted} />
          <Text style={[ownerVehicleRowStyles.label, { color: colors.text }]} numberOfLines={1}>
            {selectedOwnerVehicle
              ? ownerVehicleTitle(selectedOwnerVehicle)
              : 'Select vehicle for this trip'}
          </Text>
          <Text style={[ownerVehicleRowStyles.action, { color: FLOW_EMERALD }]}>
            {selectedOwnerVehicle ? 'Change' : 'Select'}
          </Text>
        </Pressable>
      ) : null}

      <Modal
        visible={vehiclePickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setVehiclePickerOpen(false)}
      >
        <View style={ownerVehicleRowStyles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setVehiclePickerOpen(false)}
          />
          <View style={[ownerVehicleRowStyles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[ownerVehicleRowStyles.modalTitle, { color: colors.text }]}>
              Select vehicle
            </Text>
            {ownerVehiclesLoading ? (
              <ActivityIndicator color={FLOW_EMERALD} style={{ marginVertical: 20 }} />
            ) : ownerVehicles.length === 0 ? (
              <Text style={[ownerVehicleRowStyles.emptyText, { color: colors.textMuted }]}>
                You have no vehicles registered in My Fleet yet. Add one there first.
              </Text>
            ) : (
              <View style={ownerVehicleRowStyles.chipList}>
                {ownerVehicles.map((v) => {
                  const on = v.id === vehiclePickerSelectedId;
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => setVehiclePickerSelectedId(v.id)}
                      style={[
                        ownerVehicleRowStyles.chip,
                        {
                          borderColor: on ? FLOW_EMERALD : colors.borderSubtle,
                          backgroundColor: on ? FLOW_EMERALD_DARK + '22' : 'transparent',
                        },
                      ]}
                    >
                      <Text style={[ownerVehicleRowStyles.chipTitle, { color: colors.text }]}>
                        {ownerVehicleTitle(v)}
                      </Text>
                      <Text style={[ownerVehicleRowStyles.chipSub, { color: colors.textMuted }]}>
                        {ownerVehicleSubtitle(v)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {vehiclePickerError ? (
              <Text style={ownerVehicleRowStyles.errorText}>{vehiclePickerError}</Text>
            ) : null}
            <View style={ownerVehicleRowStyles.modalActions}>
              {localTrip.owner_vehicle_id ? (
                <Pressable
                  onPress={() => {
                    setVehiclePickerSelectedId(null);
                    void confirmVehicleSelection(null);
                  }}
                  disabled={vehiclePickerBusy}
                  style={ownerVehicleRowStyles.clearBtn}
                >
                  <Text style={ownerVehicleRowStyles.clearBtnText}>Clear</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setVehiclePickerOpen(false)}
                disabled={vehiclePickerBusy}
                style={ownerVehicleRowStyles.cancelBtn}
              >
                <Text style={[ownerVehicleRowStyles.cancelBtnText, { color: colors.textMuted }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmVehicleSelection()}
                disabled={vehiclePickerBusy || !vehiclePickerSelectedId}
                style={[
                  ownerVehicleRowStyles.confirmBtn,
                  { opacity: vehiclePickerBusy || !vehiclePickerSelectedId ? 0.6 : 1 },
                ]}
              >
                {vehiclePickerBusy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={ownerVehicleRowStyles.confirmBtnText}>Confirm</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {step !== 'completed' ? (
        <View
          style={[
            styles.flowBody,
            edgeToEdge || variant === 'page' ? styles.flowBodyFlushBottom : null,
          ]}
        >
          {stepError ? (
            <View style={[styles.errorWrap, { backgroundColor: Theme.negativeMuted, borderColor: Theme.negative }]}>
              <FontAwesome name="exclamation-circle" size={12} color={Theme.negative} />
              <Text style={[styles.errorText, { color: Theme.negative }]} numberOfLines={3}>
                {stepError}
              </Text>
            </View>
          ) : null}

          <View style={styles.actionIconsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnDisabled, { backgroundColor: Theme.surface, borderColor: Theme.border }]}
              activeOpacity={0.8}
              disabled
              accessibilityLabel="Call (not available)"
            >
              <FontAwesome name="phone" size={15} color={Theme.textPrimaryDark} />
              <Text style={[styles.actionBtnText, { color: Theme.textPrimaryDark }]}>Call</Text>
            </TouchableOpacity>

            <View style={styles.actionBtnWrap}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: Theme.surface, borderColor: Theme.border }]}
                activeOpacity={0.8}
                onPress={() => router.push(`/(driver)/chat?tripId=${encodeURIComponent(localTrip.id)}`)}
                accessibilityLabel="Open trip messages"
              >
                <FontAwesome name="comment-o" size={15} color={Theme.textPrimaryDark} />
                <Text style={[styles.actionBtnText, { color: Theme.textPrimaryDark }]}>Chat</Text>
              </TouchableOpacity>
              {tripChatUnread > 0 ? (
                <View style={[styles.messageBadge, { backgroundColor: colors.emerald }]}>
                  <Text style={styles.messageBadgeText}>{tripChatUnread > 99 ? '99+' : String(tripChatUnread)}</Text>
                </View>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: Theme.surface, borderColor: Theme.border }]}
              activeOpacity={0.8}
              onPress={step === 'reached' ? () => { void uploadPod(); } : () => { void uploadStagePhoto(); }}
              disabled={stagePhotoUploading || podUploading}
              accessibilityLabel={step === 'reached' ? 'Upload proof of delivery' : 'Send photo to trip chat'}
            >
              {stagePhotoUploading || podUploading ? (
                <LoadingIndicator size="small" color={Theme.textPrimaryDark} />
              ) : (
                <FontAwesome name="camera" size={15} color={Theme.textPrimaryDark} />
              )}
              <Text style={[styles.actionBtnText, { color: Theme.textPrimaryDark }]}>Camera</Text>
            </TouchableOpacity>
          </View>

          {step === 'accepted' ? (
            <TouchableOpacity
              style={[styles.primaryBtnWrap, stepLoading && styles.btnDisabled]}
              onPress={confirmArrival}
              disabled={stepLoading}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={[FLOW_EMERALD, FLOW_EMERALD_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryGradient}
              >
                <FontAwesome name="check-circle" size={17} color="#fff" />
                <Text style={styles.primaryBtnText}>{stepLoading ? 'Updating…' : 'Arrived at pickup'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : null}

          {step === 'pickup' || step === 'transit' ? (
            <View style={styles.stageActionRow}>
              <View style={styles.stageActionMain}>
                {step === 'pickup' ? (
                  <TouchableOpacity
                    style={[styles.primaryBtnWrap, stepLoading && styles.btnDisabled]}
                    onPress={handlePackageCollected}
                    disabled={stepLoading}
                    activeOpacity={0.88}
                  >
                    <LinearGradient
                      colors={[FLOW_EMERALD, FLOW_EMERALD_DARK]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.primaryGradient}
                    >
                      <FontAwesome name="archive" size={17} color="#fff" />
                      <Text style={styles.primaryBtnText}>{stepLoading ? 'Updating…' : 'Package collected'}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.primaryBtnWrap, stepLoading && styles.btnDisabled]}
                    onPress={confirmReached}
                    disabled={stepLoading}
                    activeOpacity={0.88}
                  >
                    <LinearGradient
                      colors={[FLOW_EMERALD, FLOW_EMERALD_DARK]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.primaryGradient}
                    >
                      <FontAwesome name="map-marker" size={17} color="#fff" />
                      <Text style={styles.primaryBtnText}>{stepLoading ? 'Updating…' : 'Arrived at drop-off'}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
              {revokeButton}
            </View>
          ) : null}
        </View>
      ) : null}

      {step === 'lr' ? (
        <View style={styles.reachedBlock}>
          <View style={styles.stageActionRow}>
            <View style={styles.stageActionMain}>
              {!lrPageVisible ? (
                <TouchableOpacity
                  style={styles.primaryBtnWrap}
                  onPress={() => setLrPageVisible(true)}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Open pickup proof attachment page"
                >
                  <LinearGradient
                    colors={[FLOW_EMERALD, FLOW_EMERALD_DARK]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryGradient}
                  >
                    <FontAwesome name="file-text-o" size={16} color="#fff" />
                    <Text style={styles.primaryBtnText}>
                      {lrDocuments.length >= 1 || lrSkipped
                        ? 'Continue to start transit'
                        : 'Upload LR / pickup proof'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.podRequired, { color: Theme.textMuted }]}>
                  Finish attachments on the pickup proof page…
                </Text>
              )}
            </View>
            {revokeButton}
          </View>
        </View>
      ) : null}

      {step === 'lr' ? (
      <DriverPodCompletionPage
        visible={lrPageVisible}
        variant="lr"
        onCloseToMap={() => setLrPageVisible(false)}
        placeLabel={pickupLabel}
        earnings={earnings}
        earningsLabel={earningsLabel}
        documents={lrDocuments}
        viewUrls={lrViewUrls}
        docsLoading={lrLoading}
        uploading={lrUploading}
        skipped={lrSkipped}
        deletingId={lrDeletingId}
        actionBusy={stepLoading}
        stepError={stepError}
        onUpload={uploadLr}
        onCancelUpload={cancelLrUpload}
        onSkip={() => setLrSkipped(true)}
        lrNumber={lrNumber}
        onChangeLrNumber={setLrNumber}
        tripId={localTrip?.id}
        onResolvePreview={resolveLrPreviewUrl}
        onDelete={confirmDeleteLr}
        onConfirmAction={() => { void engageTransit(); }}
        complianceNotice={<LoadingComplianceNotice complianceVerifiedAt={localTrip?.compliance_verified_at ?? null} />}
      />
      ) : null}

      {step === 'reached' ? (
        <View style={styles.reachedBlock}>
          <View style={styles.stageActionRow}>
            <View style={styles.stageActionMain}>
              {!podPageVisible ? (
                <TouchableOpacity
                  style={styles.primaryBtnWrap}
                  onPress={() => setPodPageVisible(true)}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Open proof of delivery page"
                >
                  <LinearGradient
                    colors={[FLOW_EMERALD, FLOW_EMERALD_DARK]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryGradient}
                  >
                    <FontAwesome name="file-text-o" size={16} color="#fff" />
                    <Text style={styles.primaryBtnText}>
                      {podDocuments.length >= 1 || podSkipped
                        ? 'Continue to complete delivery'
                        : 'Upload POD (preferred) & complete'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.podRequired, { color: Theme.textMuted }]}>
                  Finish on the proof of delivery page…
                </Text>
              )}
            </View>
            {revokeButton}
          </View>
        </View>
      ) : null}

      {step === 'reached' ? (
        <DriverPodCompletionPage
          visible={podPageVisible}
          variant="pod"
          onCloseToMap={() => setPodPageVisible(false)}
          placeLabel={dropLabel}
          earnings={earnings}
          earningsLabel={earningsLabel}
          documents={podDocuments}
          viewUrls={podViewUrls}
          docsLoading={podLoading}
          uploading={podUploading}
          skipped={podSkipped}
          deletingId={podDeletingId}
          actionBusy={completing}
          stepError={stepError}
          onUpload={uploadPod}
          onCancelUpload={cancelPodUpload}
          onSkip={() => setPodSkipped(true)}
          onResolvePreview={resolvePodPreviewUrl}
          onDelete={confirmDeletePod}
          onConfirmAction={() => { void completeTrip(); }}
        />
      ) : null}

      {step === 'completed' ? (
        <View style={styles.completedBlock}>
          <View style={[styles.earningsCard, { borderColor: Theme.border, backgroundColor: Theme.screenBackground }]}>
            <FontAwesome name="check-circle" size={46} color={colors.emerald} />
            <Text style={[styles.completedTitle, { color: Theme.textPrimaryDark }]}>Delivery Complete!</Text>
            <Text style={[styles.completedSubtitle, { color: Theme.textMuted }]}>Earnings for this trip</Text>
            <View style={[styles.earningsPill, { backgroundColor: Theme.surfaceLight, borderColor: Theme.border }]}>
              <Text style={[styles.earningsLabel, { color: Theme.textMuted }]}>Your earnings</Text>
              <Text style={[styles.earningsValue, { color: colors.emerald }]}>{earnings}</Text>
            </View>
          </View>

          <View style={styles.podSectionHeader}>
            <Text style={[sheetStyles.sectionLabel, { color: Theme.textMuted }]}>
              PROOF OF DELIVERY
            </Text>
            {podLoading ? (
              <LoadingIndicator size="small" color={colors.emerald} />
            ) : (
              <Text style={[sheetStyles.bodyMetaText, { color: Theme.textMuted }]}>
                {podDocuments.length} file{podDocuments.length === 1 ? '' : 's'}
              </Text>
            )}
          </View>
          <View style={[sheetStyles.insetCard, styles.podCard, { marginTop: 0 }]}>
            {podDocuments.length >= 1 ? (
              <View style={[styles.podListWrap, { borderColor: Theme.border }]}>
                {podDocuments.map((doc, index) => (
                  <PodDocumentRow
                    key={doc.id}
                    doc={doc}
                    index={index}
                    colors={colors}
                    podDeletingId={podDeletingId}
                    canDelete={false}
                    onView={openPodPreview}
                    onDelete={confirmDeletePod}
                  />
                ))}
              </View>
            ) : !podLoading ? (
              <Text style={[styles.podRequired, { color: Theme.textMuted, marginTop: 4 }]}>
                No POD files on record for this trip.
              </Text>
            ) : null}
          </View>

          <View style={styles.stageActionRow}>
            <View style={styles.stageActionMain}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: Theme.textPrimaryDark, marginTop: 0 }]}
                onPress={onBackToDashboard}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
            {revokeButton}
          </View>
        </View>
      ) : null}

      <Modal
        visible={revokeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!stepLoading) setRevokeOpen(false);
        }}
      >
        <View style={styles.revokeBackdrop}>
          <View
            style={[
              styles.revokeSheet,
              {
                backgroundColor: Theme.surface,
                borderColor: Theme.border,
                marginBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <Text style={[styles.revokeTitle, { color: Theme.textPrimaryDark }]}>
              Go back to {revokeTarget?.label ?? 'the previous stage'}?
            </Text>
            <Text style={[styles.revokeHint, { color: Theme.textMuted }]}>
              This revokes the current stage. A reason is required.
            </Text>
            <View style={styles.revokeChips}>
              {REVOKE_REASON_CHIPS.map((chip) => {
                const selected = revokeReason === chip;
                return (
                  <TouchableOpacity
                    key={chip}
                    onPress={() => setRevokeReason(chip)}
                    style={[
                      styles.revokeChip,
                      {
                        borderColor: selected ? colors.emerald : Theme.border,
                        backgroundColor: selected ? colors.emeraldMuted : Theme.surface,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.revokeChipText,
                        { color: selected ? colors.emerald : Theme.textPrimaryDark },
                      ]}
                    >
                      {chip}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              value={revokeReason}
              onChangeText={setRevokeReason}
              placeholder="Reason for going back"
              placeholderTextColor={Theme.textMuted}
              style={[
                styles.revokeInput,
                { color: Theme.textPrimaryDark, borderColor: Theme.border, backgroundColor: Theme.screenBackground },
              ]}
              multiline
              maxLength={240}
              accessibilityLabel="Reason for going back"
            />
            <View style={styles.revokeActions}>
              <TouchableOpacity
                onPress={() => setRevokeOpen(false)}
                disabled={stepLoading}
                style={[styles.revokeCancel, { borderColor: Theme.border }]}
                accessibilityRole="button"
                accessibilityLabel="Cancel going back"
              >
                <Text style={[styles.revokeCancelText, { color: Theme.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { void confirmRevokeStage(); }}
                disabled={stepLoading || revokeReason.trim().length === 0}
                style={[
                  styles.revokeConfirm,
                  { backgroundColor: colors.emerald },
                  (stepLoading || revokeReason.trim().length === 0) && styles.btnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Revoke stage and go back"
              >
                <Text style={styles.revokeConfirmText}>
                  {stepLoading ? 'Updating…' : 'Revoke stage'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!(viewingPodUrl || viewingPodLoading)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setViewingPodUrl(null);
          setViewingPodDocId(null);
          setViewingPodLoading(false);
          setViewingPodError(false);
        }}
      >
        <Pressable
          style={styles.podModalBackdrop}
          onPress={() => {
            setViewingPodUrl(null);
            setViewingPodDocId(null);
            setViewingPodLoading(false);
            setViewingPodError(false);
          }}
        >
          <Pressable style={styles.podModalContent} onPress={() => {}}>
            <View style={styles.podModalTopBar}>
              <TouchableOpacity
                style={[
                  styles.podModalNavBtn,
                  (!viewingPodPrevDoc || viewingPodLoading) && styles.podModalNavBtnDisabled,
                ]}
                onPress={() => {
                  if (!viewingPodPrevDoc || viewingPodLoading) return;
                  void openPodPreview(viewingPodPrevDoc);
                }}
                disabled={!viewingPodPrevDoc || viewingPodLoading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Previous POD image"
              >
                <FontAwesome name="chevron-left" size={16} color={Theme.textPrimaryDark} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.podModalClose,
                  {
                    marginBottom: 0,
                    backgroundColor: Theme.screenBackground,
                    borderColor: Theme.border,
                  },
                ]}
                onPress={() => {
                  setViewingPodUrl(null);
                  setViewingPodDocId(null);
                  setViewingPodLoading(false);
                  setViewingPodError(false);
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Close POD preview"
              >
                <FontAwesome name="times" size={18} color={Theme.textPrimaryDark} />
                <Text style={[styles.podModalCloseText, { color: Theme.textPrimaryDark }]}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.podModalNavBtn,
                  (!viewingPodNextDoc || viewingPodLoading) && styles.podModalNavBtnDisabled,
                ]}
                onPress={() => {
                  if (!viewingPodNextDoc || viewingPodLoading) return;
                  void openPodPreview(viewingPodNextDoc);
                }}
                disabled={!viewingPodNextDoc || viewingPodLoading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Next POD image"
              >
                <FontAwesome name="chevron-right" size={16} color={Theme.textPrimaryDark} />
              </TouchableOpacity>
            </View>

            {podDocuments.length > 1 && viewingPodIndex >= 0 ? (
              <Text style={styles.podModalCounterText}>
                {viewingPodIndex + 1}/{podDocuments.length}
              </Text>
            ) : null}
            {viewingPodLoading ? (
              <View style={styles.podModalImage}>
                <LoadingIndicator size="large" color={colors.emerald} />
                <Text style={[styles.podModalLoadingText, { color: Theme.textMuted }]}>Loading...</Text>
              </View>
            ) : viewingPodUrl ? (
              <>
                <Image
                  source={{ uri: viewingPodUrl }}
                  style={styles.podModalImage}
                  resizeMode="contain"
                  onError={() => setViewingPodError(true)}
                  onLoad={() => setViewingPodError(false)}
                />
                {viewingPodError ? (
                  <View style={[styles.podModalFallback, { backgroundColor: Theme.screenBackground, borderColor: Theme.border }]}>
                    <Text style={[styles.podModalFallbackText, { color: Theme.textMuted }]}>
                      Preview not available. Open in browser to view.
                    </Text>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: colors.emerald, marginTop: 12 }]}
                      onPress={() => viewingPodUrl && Linking.openURL(viewingPodUrl)}
                      activeOpacity={0.8}
                    >
                      <FontAwesome name="external-link" size={16} color={Theme.textOnPrimary} />
                      <Text style={styles.primaryBtnText}>Open in browser</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
      <DriverShipperFeedbackModal
        visible={shipperFeedbackOpen}
        onClose={() => setShipperFeedbackOpen(false)}
        tripId={localTrip.id}
        message={
          findLatestMissionDebriefMessage(
            conversations.find((c) => c.trip_id === localTrip.id)?.messages,
          ) ?? null
        }
        targetName={
          (localTrip.client_name?.trim() && localTrip.client_name.trim() !== '—'
            ? localTrip.client_name.trim()
            : null) ||
          localTrip.supplier_name?.trim() ||
          assignedBy?.orgName?.trim() ||
          'this shipper'
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: TRIP_SHEET_TOP_RADIUS,
    borderTopRightRadius: TRIP_SHEET_TOP_RADIUS,
    overflow: 'hidden',
    backgroundColor: Theme.surface,
  },
  sheetInset: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  sheetEdgeToEdge: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  /** Legacy — sheet chrome now lives on `sheet` for page/map mode too. */
  page: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
  },
  referralBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: TRIP_SHEET_BODY_PAD.horizontal,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  referralBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  handleWrap: { alignItems: 'center', paddingBottom: 8 },
  handleBar: { width: 36, height: 4, borderRadius: 999, opacity: 0.5 },
  flowBody: {
    paddingHorizontal: TRIP_SHEET_BODY_PAD.horizontal,
    paddingTop: 10,
    paddingBottom: TRIP_SHEET_BODY_PAD.bottom,
    gap: 8,
    backgroundColor: Theme.surface,
  },
  /** Keep CTA above the floating dock; 0 sat Arrived/Collect on the tab bar. */
  flowBodyFlushBottom: {
    paddingBottom: 16,
  },
  collapsedPeek: {
    overflow: 'hidden',
    backgroundColor: Theme.surface,
    borderTopLeftRadius: TRIP_SHEET_TOP_RADIUS,
    borderTopRightRadius: TRIP_SHEET_TOP_RADIUS,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  collapsedPeekInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    minHeight: 56,
  },
  collapsedPeekDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  collapsedPeekTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  collapsedPeekKicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: Theme.textMuted,
    textTransform: 'uppercase',
  },
  collapsedPeekPlace: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: Theme.textPrimaryDark,
  },
  collapsedPeekHintWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    flexShrink: 0,
    minWidth: 52,
  },
  collapsedPeekHint: {
    fontSize: 10,
    fontWeight: '700',
    color: FLOW_EMERALD,
    letterSpacing: 0.2,
  },
  actionIconsRow: { flexDirection: 'row', gap: 10 },
  navigateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    height: ACTION_BTN_HEIGHT,
    paddingHorizontal: 16,
  },
  navigateBarText: { fontSize: 14, fontWeight: '800' },
  navigateChevron: { marginLeft: 'auto' },
  actionBtnWrap: { flex: 1, position: 'relative' },
  messageBadge: {
    position: 'absolute',
    top: -4,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBadgeText: { fontSize: 9, fontWeight: '900', color: '#fff' },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    height: ACTION_BTN_HEIGHT,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnText: { fontSize: 14, fontWeight: '700', letterSpacing: -0.1 },
  actionBtnDisabled: { opacity: 0.45 },
  primaryBtnWrap: {
    marginTop: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  stageActionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  stageActionMain: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  revokeBtn: {
    marginTop: 2,
    width: 64,
    minHeight: PRIMARY_BTN_HEIGHT,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  revokeBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  revokeBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Theme.overlayBackdrop,
    paddingHorizontal: 16,
  },
  revokeSheet: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 10,
  },
  revokeTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  revokeHint: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  revokeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  revokeChip: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revokeChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  revokeInput: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
    textAlignVertical: 'top',
  },
  revokeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  revokeCancel: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revokeCancelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  revokeConfirm: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  revokeConfirmText: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textOnPrimary,
  },
  primaryGradient: {
    minHeight: PRIMARY_BTN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, color: Theme.buttonDarkText },
  primaryBtn: {
    marginTop: 6,
    minHeight: TRIP_SHEET_BTN_HEIGHT,
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnDisabled: { opacity: 0.7 },

  reachedBlock: {
    paddingTop: 0,
    paddingHorizontal: TRIP_SHEET_BODY_PAD.horizontal,
    paddingBottom: 16,
    gap: TRIP_SHEET_BODY_PAD.gap,
    backgroundColor: Theme.surface,
  },
  podSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  podCard: {
    gap: 8,
  },
  podActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  podUploadBtn: {
    minHeight: TRIP_SHEET_BTN_HEIGHT,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  podUploadBtnCompact: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 9,
    gap: 6,
  },
  podUploadText: { ...sheetStyles.bodyBtnText, color: Theme.textOnPrimary },
  podUploadTextCompact: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
    color: Theme.textOnPrimary,
  },
  podSkipBtn: {
    flexShrink: 0,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  podSkipBtnText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  skipLink: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  skipLinkText: { ...sheetStyles.bodyLinkText, fontWeight: '800' },
  podCancelLink: { alignSelf: 'center', paddingTop: 2, paddingBottom: 0 },
  podCancelLinkText: { ...sheetStyles.bodyLinkText, fontWeight: '700' },
  podListWrap: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, overflow: 'hidden', marginTop: 4 },
  podListItem: {
    minHeight: 46,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  podListItemFirst: { borderTopWidth: 0 },
  podListFileName: { flex: 1, ...sheetStyles.bodyLinkText, minWidth: 0 },
  podListActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  podViewIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podDeleteIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 16, 28, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  podModalContent: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  podModalTopBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 16,
  },
  podModalNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podModalNavBtnDisabled: {
    opacity: 0.4,
  },
  podModalCounterText: {
    width: '100%',
    marginTop: -8,
    marginBottom: 12,
    textAlign: 'center',
    color: Theme.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  podModalClose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  podModalCloseText: {
    fontSize: 12,
    fontWeight: '800',
  },
  podModalImage: {
    width: '100%',
    height: 400,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.screenBackground,
  },
  podModalLoadingText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  podModalFallback: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  podModalFallbackText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  podRequired: { ...sheetStyles.bodyMetaText, textAlign: 'center' },

  holdBtnWrap: {
    minHeight: PRIMARY_BTN_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  holdContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 12 },
  holdText: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  errorWrap: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  errorText: { fontSize: 12, fontWeight: '700', flex: 1 },
  completedBlock: {
    paddingTop: TRIP_SHEET_BODY_PAD.top,
    paddingHorizontal: TRIP_SHEET_BODY_PAD.horizontal,
    paddingBottom: TRIP_SHEET_BODY_PAD.bottom,
    gap: TRIP_SHEET_BODY_PAD.gap,
    backgroundColor: Theme.surface,
  },
  earningsCard: {
    ...sheetStyles.insetCard,
    alignItems: 'center',
    paddingVertical: 14,
  },
  completedTitle: { marginTop: 8, fontSize: 18, fontWeight: '900' },
  completedSubtitle: { marginTop: 4, ...sheetStyles.bodyMetaText },
  earningsPill: { marginTop: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, width: '100%', alignItems: 'center' },
  earningsLabel: { ...sheetStyles.sectionLabel, color: Theme.textMuted },
  earningsValue: { marginTop: 4, fontSize: 22, fontWeight: '900' },
});

/** Owner Vehicle Link (3B.4/3C follow-up) — explicit select/change/clear row + picker sheet. */
const ownerVehicleRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  label: { flex: 1, fontSize: 13, fontWeight: '600' },
  action: { fontSize: 12, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '80%' },
  modalTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  emptyText: { fontSize: 13, marginVertical: 16 },
  chipList: { gap: 8 },
  chip: { borderWidth: 1.5, borderRadius: 10, padding: 10 },
  chipTitle: { fontSize: 13, fontWeight: '700' },
  chipSub: { fontSize: 12, marginTop: 2 },
  errorText: { color: Theme.negative, fontSize: 12, marginTop: 10 },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  clearBtn: { paddingVertical: 10, paddingHorizontal: 12 },
  clearBtnText: { color: Theme.negative, fontSize: 13, fontWeight: '700' },
  cancelBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  cancelBtnText: { fontSize: 13, fontWeight: '700' },
  confirmBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: FLOW_EMERALD,
  },
  confirmBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});

