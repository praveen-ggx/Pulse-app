/**
 * Multi-order Job Card — route → current stop → orders → one action.
 * Primitive A runs only while this card is mounted. Mode is never decided here.
 */
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { TRIP_SHEET_BODY_PAD, TRIP_SHEET_TOP_RADIUS } from '@/components/driver/DriverTripSheetLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useDriverCommerceMission } from '@/features/driver/commerce-mission/useDriverCommerceMission';
import type { DriverTripFlowCardProps } from '@/features/driver/components/DriverTripFlowCard';
import type { DriverTripStopOrder } from '@/features/driver/commerce-mission/driverTripStopOrders.types';
import type { DriverStopExecutionStop } from '@/features/driver/execution/driverStopExecution.types';
import type { DriverStopExecutionController } from '@/features/driver/hooks/useDriverStopExecution';
import {
  canShowArriveAction,
  canShowCompleteAction,
} from '@/features/driver/execution/resolveDriverStopTransition';
import { ordersOnStop } from '@/features/driver/job-card/attachOrdersToStop';
import {
  buildCommerceTripExecution,
  summaryLabel,
  type CommerceProductLine,
} from '@/features/driver/job-card/commerceTripExecution';
import { buildDriverRoutePlanMap, routePlanKind } from '@/features/driver/job-card/driverRoutePlanMap';
import {
  formatStopKm,
  formatStopPlace,
  isDeliveryStop,
  multiOrderActionModel,
} from '@/features/driver/job-card/multiOrderStopCopy';
import {
  overlayCommerceStopsOnExecution,
  ROUTE_SETUP_PENDING_MESSAGE,
} from '@/features/driver/job-card/sesStopsFromCommerceMission';
import {
  persistStopDeliveryProof,
  type StopProofLedger,
} from '@/features/driver/job-card/persistStopDeliveryProof';
import type { DeliveryProofDraft } from '@/features/driver/job-card/deliveryProof';
import { DriverStopVerificationScreen } from '@/features/driver/job-card/DriverStopVerificationScreen';
import { DriverTripCompletionScreen } from '@/features/driver/job-card/DriverTripCompletionScreen';
import { CurrentStopCard } from '@/features/driver/job-card/parts/CurrentStopCard';
import { RouteProgressHeader } from '@/features/driver/job-card/parts/RouteProgressHeader';
import { TripPlanPage } from '@/features/driver/job-card/parts/TripPlanPage';
import {
  RouteTimeline,
  type RouteTimelineProgress,
  type RouteTimelineStop,
} from '@/features/driver/job-card/parts/RouteTimeline';
import type { StopOrderSummaryOrder } from '@/features/driver/job-card/parts/StopOrderSummary';
import type { StatusTone } from '@/features/driver/job-card/parts/jobCardSurface';
import type { RouteStopStats } from '@/features/driver/job-card/parts/RouteProgressHeader';
import { StopActionButton } from '@/features/driver/job-card/parts/StopActionButton';
import { completedStopCount } from '@/features/driver/job-card/attachOrdersToStop';
import { allStopsFinished } from '@/features/driver/job-card/tripCompletionSummary';
import {
  applyDriverCommandResult,
  executeDriverCommand,
  type DriverCommandResult,
} from '@/features/driver/services/driverExecution.service';
import { formatTime } from '@/lib/format';
import { openExternalNavigation } from '@/lib/mapsNavigation.util';
import { DeliveryDetailsPreview, type DeliveryPreviewStop } from '@/features/driver/job-card/parts/DeliveryDetailsPreview';
import { ChevronUp, Receipt } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = DriverTripFlowCardProps & {
  stopExecution: DriverStopExecutionController;
};

export function DriverMultiOrderJobCard({
  trip,
  stopExecution,
  collapsed = false,
  onToggleCollapse,
  edgeToEdge = false,
  variant = 'card',
  distanceToTargetKm,
  onRoutePlanMapChange,
  onTripCompleted,
  onTripUpdated,
  deliveryDetailsNonce = 0,
  onExpense,
}: Props) {
  const colors = useDriverThemeColors();
  const { profile } = useAuth();
  const { mutating, arrive, complete } = stopExecution;
  const sesReady = stopExecution.stops.length > 0;
  const missionState = useDriverCommerceMission(trip.id);
  const mission = missionState.status === 'error' ? null : missionState.mission;
  const execution = useMemo(
    () => overlayCommerceStopsOnExecution(stopExecution, mission, trip),
    [stopExecution, mission, trip],
  );
  const commerce = useMemo(
    () => buildCommerceTripExecution({
      trip,
      mission,
      sesStops: stopExecution.stops,
    }),
    [trip, mission, stopExecution.stops],
  );
  const { stops, currentStop, nextStop } = execution;
  const orderCount = commerce.summary.orderCount;
  const commerceSummary = commerce.stops.length > 0 ? summaryLabel(commerce.summary) : null;
  const done = sesReady ? completedStopCount(stops) : 0;
  const [actionError, setActionError] = useState<string | null>(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const seenDetailsNonce = useRef(deliveryDetailsNonce);
  const [completingTrip, setCompletingTrip] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [markedComplete, setMarkedComplete] = useState(false);
  const summaryOfferedRef = useRef(false);
  const proofLedgersRef = useRef(new Map<string, StopProofLedger>());
  const [verifySession, setVerifySession] = useState<{
    stop: DriverStopExecutionStop;
    orders: DriverTripStopOrder[];
    stopIndex: number;
    review: boolean;
  } | null>(null);

  const currentId = currentStop?.stopId ?? null;
  const routeFinished = sesReady && allStopsFinished(stops);
  const tripCompleted =
    markedComplete || String(trip.status ?? '').toLowerCase() === 'completed';
  const completionHandledRef = useRef(String(trip.status ?? '').toLowerCase() === 'completed');
  const orders = ordersOnStop(mission, currentId);
  const canArrive = sesReady && currentStop ? canShowArriveAction(currentStop, currentId) : false;
  const canComplete = sesReady && currentStop ? canShowCompleteAction(currentStop, currentId) : false;
  const rawModel = multiOrderActionModel(currentStop, orders.length);
  const actionModel = !sesReady
    ? {
        kind: 'idle' as const,
        stageLabel: 'Route setup pending',
        hint: ROUTE_SETUP_PENDING_MESSAGE,
        cta: null,
      }
    : (rawModel.kind === 'arrive' && !canArrive) || (rawModel.kind === 'complete' && !canComplete)
      ? { ...rawModel, kind: 'idle' as const, cta: null }
      : rawModel;

  const timelineStops = useMemo((): RouteTimelineStop[] => {
    const modelById = new Map(commerce.stops.map((stop) => [stop.id, stop]));
    const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
    return ordered.map((stop) => {
      const model = modelById.get(stop.stopId);
      const orders: StopOrderSummaryOrder[] = model
        ? model.orders.map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            productCount: order.productCount,
            lines: order.lines,
          }))
        : ordersOnStop(mission, stop.stopId).map((order) => ({
            id: order.salesOrderId,
            orderNumber: order.orderNumber,
            productCount: order.lines?.length ?? 0,
            lines: (order.lines ?? []).map((line): CommerceProductLine => ({
              productId: line.productId ?? null,
              name: line.productName ?? null,
              sku: line.productSku ?? null,
              quantity: line.quantity,
              unit: null,
            })),
          }));
      const productCount = orders.reduce((sum, order) => sum + order.productCount, 0);
      const status = stop.status;
      const isCurrent = stop.stopId === currentId;
      const statusLabel =
        status === 'completed'
          ? 'Done'
          : status === 'skipped'
            ? 'Skipped'
            : status === 'arrived'
              ? 'Arrived'
              : status === 'failed'
                ? 'Failed'
                : isCurrent
                  ? 'Next up'
                  : 'Pending';
      const progress: RouteTimelineProgress =
        status === 'completed' || status === 'skipped'
          ? 'done'
          : status === 'failed'
            ? 'failed'
            : isCurrent
              ? 'current'
              : 'upcoming';
      const statusTone: StatusTone =
        status === 'completed'
          ? 'done'
          : status === 'failed'
            ? 'failed'
            : status === 'arrived'
              ? 'active'
              : isCurrent
                ? 'next'
                : 'pending';
      const at = status === 'completed' ? stop.completedAt : status === 'arrived' ? stop.arrivedAt : null;
      return {
        id: stop.stopId,
        sequence: stop.sequence,
        typeLabel: isDeliveryStop(String(stop.stopType)) ? 'Delivery' : 'Pickup',
        location: formatStopPlace(stop),
        statusLabel,
        statusTone,
        timeLabel: at ? formatTime(at) : null,
        progress,
        isCurrent,
        orderCount: orders.length,
        productCount,
        orders,
      };
    });
  }, [commerce.stops, stops, mission, currentId]);

  const stopStats = useMemo((): RouteStopStats | null => {
    if (!sesReady) return null;
    const stats: RouteStopStats = { pending: 0, arrived: 0, completed: 0, failed: 0 };
    for (const stop of stops) {
      if (stop.status === 'completed' || stop.status === 'skipped') stats.completed += 1;
      else if (stop.status === 'arrived') stats.arrived += 1;
      else if (stop.status === 'failed') stats.failed += 1;
      else stats.pending += 1;
    }
    return stats;
  }, [sesReady, stops]);

  const focusKind = currentStop
    ? (routePlanKind(String(currentStop.stopType)) === 'drop' ? 'drop' : 'pickup')
    : 'pickup';

  useEffect(() => {
    if (!onRoutePlanMapChange) return;
    onRoutePlanMapChange(buildDriverRoutePlanMap(trip.id, stops, currentId, focusKind, currentId));
  }, [trip.id, stops, currentId, focusKind, onRoutePlanMapChange]);

  useEffect(() => {
    return () => onRoutePlanMapChange?.(null);
  }, [onRoutePlanMapChange]);

  useEffect(() => {
    if (!routeFinished || summaryOfferedRef.current) return;
    summaryOfferedRef.current = true;
    setSummaryOpen(true);
  }, [routeFinished]);

  // The server completes the trip when the final stop finishes; whichever path
  // reports it first (stop result, Mark completed, refreshed trip) ends the mission once.
  useEffect(() => {
    if (!tripCompleted || completionHandledRef.current) return;
    completionHandledRef.current = true;
    void AsyncStorage.removeItem('driver_accepted_trip_id');
    onTripCompleted?.();
  }, [tripCompleted, onTripCompleted]);

  const frameless = variant === 'page' || edgeToEdge;
  const inSheet = variant === 'page' || edgeToEdge;
  const remainingKmLabel = formatStopKm(distanceToTargetKm ?? undefined);
  const sheetStyle = [
    styles.sheet,
    { backgroundColor: inSheet ? colors.background : colors.surface },
    inSheet ? styles.page : null,
    frameless ? styles.edge : styles.inset,
    inSheet ? styles.sheetFlush : null,
  ];

  const previewStops = useMemo((): DeliveryPreviewStop[] => {
    const modelById = new Map(commerce.stops.map((stop) => [stop.id, stop]));
    const source = stops.length > 0 ? stops : [];
    let pickupN = 0;
    let dropN = 0;
    return source.map((stop) => {
      const model = modelById.get(stop.stopId);
      const kind = routePlanKind(String(stop.stopType));
      if (kind === 'pickup') pickupN += 1;
      else if (kind === 'drop') dropN += 1;
      const caption =
        kind === 'drop'
          ? `Drop ${dropN}`
          : kind === 'pickup'
            ? `Pickup ${pickupN}`
            : `Stop ${stop.sequence}`;
      const orders = model?.orders ?? [];
      return {
        id: stop.stopId,
        caption,
        place: formatStopPlace(stop),
        address: [stop.addressLine, stop.city, stop.state].filter((part) => part?.trim()).join(', ') || null,
        kind,
        isCurrent: stop.stopId === currentId,
        orders: orders.map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customer.name,
          lines: order.lines.map((line, index) => ({
            key: `${order.id}-${line.productId ?? line.sku ?? index}`,
            name: line.name?.trim() || line.sku?.trim() || `Product ${index + 1}`,
            sku: line.sku,
            quantity: line.quantity,
          })),
        })),
      };
    });
  }, [commerce.stops, stops, currentId]);

  useEffect(() => {
    if (deliveryDetailsNonce === seenDetailsNonce.current) return;
    seenDetailsNonce.current = deliveryDetailsNonce;
    if (deliveryDetailsNonce > 0) setDetailsOpen(true);
  }, [deliveryDetailsNonce]);

  const openStopDetails = (stop: DriverStopExecutionStop, review: boolean) => {
    const stopIndex = Math.max(1, stops.findIndex((s) => s.stopId === stop.stopId) + 1);
    setVerifySession({
      stop,
      orders: ordersOnStop(mission, stop.stopId),
      stopIndex,
      review,
    });
    setVerified(review && (stop.status === 'completed' || stop.status === 'skipped'));
    setVerificationOpen(true);
  };

  const stepVerification = (delta: -1 | 1) => {
    if (!verifySession) return;
    const index = stops.findIndex((item) => item.stopId === verifySession.stop.stopId);
    const target = stops[index + delta];
    if (!target) return;
    const confirmHere = sesReady && target.stopId === currentId && target.status === 'arrived';
    openStopDetails(target, !confirmHere);
  };

  const openTimelineStop = (stopId: string) => {
    const stop = stops.find((item) => item.stopId === stopId);
    if (!stop) return;
    const confirmHere = sesReady && stop.stopId === currentId && stop.status === 'arrived';
    openStopDetails(stop, !confirmHere);
  };

  const openVerification = () => {
    if (!sesReady || !currentStop) return;
    openStopDetails(currentStop, false);
  };

  const closeVerification = () => {
    setVerificationOpen(false);
    setVerified(false);
    setVerifySession(null);
  };

  const applyTripOutcome = (command: DriverCommandResult | undefined) => {
    if (!command?.ok || !command.trip_status) return;
    if (command.trip_status === String(trip.status ?? '').toLowerCase()) return;
    onTripUpdated?.(applyDriverCommandResult(trip, command));
    if (command.trip_status === 'completed') setMarkedComplete(true);
  };

  const markDeliveryCompleted = () => {
    void (async () => {
      setCompletingTrip(true);
      setCompleteError(null);
      const { error, result } = await executeDriverCommand(
        { tripId: trip.id, command: 'COMPLETE_TRIP' },
        trip,
      );
      setCompletingTrip(false);
      if (error || !result) {
        const message = error?.message ?? 'Could not complete this delivery';
        setCompleteError(message);
        setActionError(message);
        return;
      }
      onTripUpdated?.(applyDriverCommandResult(trip, result));
      setMarkedComplete(true);
    })();
  };

  const runArrive = () => {
    if (!sesReady) {
      setActionError(ROUTE_SETUP_PENDING_MESSAGE);
      return;
    }
    void arrive().then((result) => {
      if (result.ignored) return;
      setActionError(result.ok ? null : result.error?.message ?? 'Could not arrive at this stop');
      if (result.ok) applyTripOutcome(result.command);
    });
  };
  const runComplete = (proof: DeliveryProofDraft) => {
    if (!sesReady) {
      setActionError(ROUTE_SETUP_PENDING_MESSAGE);
      return;
    }
    const stop = verifySession?.stop;
    const uid = profile?.uid;
    void (async () => {
      setProofBusy(true);
      try {
        if (stop) {
          if (!uid) {
            setActionError('Sign in is required to save stop proof');
            return;
          }
          let ledger = proofLedgersRef.current.get(stop.stopId);
          if (!ledger) {
            ledger = new Map();
            proofLedgersRef.current.set(stop.stopId, ledger);
          }
          const saved = await persistStopDeliveryProof({
            tripId: trip.id,
            stopId: stop.stopId,
            uploadedBy: uid,
            draft: proof,
            kind: isDeliveryStop(String(stop.stopType)) ? 'delivery' : 'pickup',
            ledger,
          });
          if (!saved.ok) {
            setActionError(saved.error.message);
            return;
          }
        }
        const result = await complete();
        if (result.ignored) return;
        if (!result.ok) {
          setActionError(result.error?.message ?? 'Could not finish this stop');
          return;
        }
        setActionError(null);
        setVerified(true);
        applyTripOutcome(result.command);
      } finally {
        setProofBusy(false);
      }
    })();
  };

  if (collapsed && !verificationOpen) {
    const peekPlace = currentStop ? formatStopPlace(currentStop) : 'Route';
    const peekStage = actionModel.cta ?? actionModel.stageLabel;
    return (
      <>
        <Pressable
          testID="driver-multi-order-job-card"
          onPress={() => onToggleCollapse?.()}
          style={[styles.mapSummary, { backgroundColor: colors.background }]}
          accessibilityRole="button"
          accessibilityLabel="Open today's route"
        >
          <View style={styles.mapSummaryRow}>
            <View style={styles.mapSummaryCopy}>
              <Text style={[styles.mapSummaryKicker, { color: colors.emerald }]}>Commerce Delivery</Text>
              <Text style={[styles.mapSummaryPlace, { color: colors.text }]} numberOfLines={1}>
                {peekPlace}
                {peekStage ? ` · ${peekStage}` : ''}
              </Text>
            </View>
            <View style={[styles.mapSummaryCountPill, { backgroundColor: colors.emeraldMuted }]}>
              <Text style={[styles.mapSummaryCount, { color: colors.emerald }]}>
                {done}/{stops.length}
              </Text>
            </View>
            {onExpense ? (
              <Pressable
                onPress={onExpense}
                accessibilityRole="button"
                accessibilityLabel="Add trip expense"
                hitSlop={Layout.touchTargetHitSlop}
                style={[styles.peekExpense, { backgroundColor: colors.emeraldMuted }]}
              >
                <Receipt size={18} color={colors.emerald} strokeWidth={2.3} />
              </Pressable>
            ) : null}
            <ChevronUp size={18} color={colors.emerald} strokeWidth={2.6} />
          </View>
        </Pressable>
        <DeliveryDetailsPreview
          visible={detailsOpen}
          stops={previewStops}
          onClose={() => setDetailsOpen(false)}
        />
      </>
    );
  }

  const nextOnRoute = verified ? currentStop : nextStop;
  const verifyOverlay =
    verificationOpen && verifySession ? (
      <DriverStopVerificationScreen
        stop={verifySession.stop}
        orders={mission ? ordersOnStop(mission, verifySession.stop.stopId) : verifySession.orders}
        stopIndex={verifySession.stopIndex}
        stopTotal={stops.length}
        ordersLoading={missionState.status === 'loading'}
        loadError={missionState.status === 'error' ? missionState.error.message : null}
        onRetryOrders={missionState.status === 'error' ? missionState.retry ?? null : null}
        retryingOrders={missionState.status === 'error' && missionState.retrying === true}
        busy={mutating === 'complete' || proofBusy}
        confirmed={verified}
        review={verifySession.review}
        nextStop={
          nextOnRoute && nextOnRoute.stopId !== verifySession.stop.stopId ? nextOnRoute : null
        }
        onBack={closeVerification}
        onConfirm={runComplete}
        onViewNextStop={closeVerification}
        {...(stops.length > 1
          ? {
              onPreviousStop:
                verifySession.stopIndex > 1 ? () => stepVerification(-1) : null,
              onNextStop:
                verifySession.stopIndex < stops.length ? () => stepVerification(1) : null,
            }
          : {})}
      />
    ) : null;

  const stopAction = (
    <StopActionButton
      colors={colors}
      model={actionModel}
      nextPlace={sesReady && nextStop ? formatStopPlace(nextStop) : null}
      busy={mutating != null}
      mutating={mutating}
      onArrive={runArrive}
      onComplete={openVerification}
    />
  );

  const routeBody = (
    <>
      {currentStop && !routeFinished ? (
        <CurrentStopCard
          colors={colors}
          stop={currentStop}
          orders={ordersOnStop(mission, currentStop.stopId)}
          ordersLoading={missionState.status === 'loading'}
          distanceKm={distanceToTargetKm}
          onOpenDetails={() => openTimelineStop(currentStop.stopId)}
          onNavigate={
            currentStop.latitude != null && currentStop.longitude != null
              ? () => { void openExternalNavigation(Number(currentStop.latitude), Number(currentStop.longitude)); }
              : null
          }
          onProof={canComplete ? openVerification : null}
          onExpense={onExpense ?? null}
        >
          {stopAction}
        </CurrentStopCard>
      ) : (
        <View style={styles.doneBlock}>
          <Text style={[styles.doneHint, { color: colors.textMuted }]}>
            {tripCompleted ? 'Delivery completed.' : 'All stops on this route are done.'}
          </Text>
          <Pressable
            onPress={() => setSummaryOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={tripCompleted ? 'View delivery summary' : 'Review delivery summary'}
            style={[styles.summaryBtn, { borderColor: colors.emeraldBorder, backgroundColor: colors.emeraldMuted }]}
          >
            <Text style={[styles.summaryBtnText, { color: colors.emerald }]}>
              {tripCompleted ? 'View summary' : 'Review delivery summary'}
            </Text>
          </Pressable>
        </View>
      )}

      <RouteProgressHeader
        colors={colors}
        done={done}
        total={stops.length}
        orderCount={orderCount}
        remainingKmLabel={remainingKmLabel}
        onViewTripPlan={() => setPlanOpen(true)}
        kicker="Commerce Delivery"
        summary={commerceSummary}
        stats={stopStats}
      />
      <RouteTimeline
        colors={colors}
        stops={timelineStops}
        onOpenStop={openTimelineStop}
        onViewAll={() => setDetailsOpen(true)}
      />

      {actionError ? (
        <Text style={[styles.error, { color: Theme.negative }]} accessibilityRole="alert">
          {actionError}
        </Text>
      ) : null}
    </>
  );

  return (
    <View testID="driver-multi-order-job-card" style={sheetStyle}>
      {inSheet ? (
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={styles.pageBody}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {routeBody}
        </ScrollView>
      ) : (
        routeBody
      )}
      {verifyOverlay}
      <TripPlanPage
        visible={planOpen}
        colors={colors}
        stops={timelineStops}
        summary={commerceSummary}
        onClose={() => setPlanOpen(false)}
        onOpenStop={(stopId) => {
          setPlanOpen(false);
          openTimelineStop(stopId);
        }}
      />
      <DeliveryDetailsPreview
        visible={detailsOpen}
        stops={previewStops}
        onClose={() => setDetailsOpen(false)}
      />
      {summaryOpen ? (
        <DriverTripCompletionScreen
          stops={stops}
          mission={mission}
          tripCompleted={tripCompleted}
          busy={completingTrip}
          error={completeError}
          onBack={() => setSummaryOpen(false)}
          onMarkCompleted={markDeliveryCompleted}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: TRIP_SHEET_BODY_PAD.horizontal,
    paddingTop: TRIP_SHEET_BODY_PAD.top,
    paddingBottom: TRIP_SHEET_BODY_PAD.bottom,
    borderTopLeftRadius: TRIP_SHEET_TOP_RADIUS,
    borderTopRightRadius: TRIP_SHEET_TOP_RADIUS,
    gap: TRIP_SHEET_BODY_PAD.gap,
    overflow: 'hidden',
  },
  sheetFlush: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  page: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingBottom: 0,
    gap: 0,
  },
  pageScroll: {
    flex: 1,
  },
  pageBody: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 6,
    paddingBottom: 16,
    gap: 10,
  },
  actionDock: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  edge: { marginHorizontal: 0 },
  inset: { marginHorizontal: Layout.screenPaddingHorizontal },
  mapSummary: {
    minHeight: 72,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 10,
  },
  mapSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapSummaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  mapSummaryKicker: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  mapSummaryPlace: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  mapSummaryCountPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  mapSummaryCount: {
    fontSize: 11,
    fontWeight: '700',
  },
  peekExpense: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peekPlace: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  peekCta: {
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peekCtaText: {
    fontSize: 13,
    fontWeight: '700',
  },
  peekHint: {
    alignItems: 'center',
  },
  detailsBtn: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  doneHint: {
    fontSize: 12,
    fontWeight: '600',
  },
  doneBlock: { gap: 8 },
  summaryBtn: {
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  summaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  error: {
    fontSize: 12,
  },
});
