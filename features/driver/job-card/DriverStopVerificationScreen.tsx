import { useEffect, useState } from 'react';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import type { DriverTripStopOrder } from '@/features/driver/commerce-mission/driverTripStopOrders.types';
import type { DriverStopExecutionStop } from '@/features/driver/execution/driverStopExecution.types';
import {
  canSubmitDeliveryProof,
  emptyDeliveryProof,
  type DeliveryProofDraft,
} from '@/features/driver/job-card/deliveryProof';
import {
  formatStopPlace,
  isDeliveryStop,
  stopRoleLabel,
} from '@/features/driver/job-card/multiOrderStopCopy';
import { DeliveryCompletionSummary } from '@/features/driver/job-card/parts/DeliveryCompletionSummary';
import { DeliveryProofSection } from '@/features/driver/job-card/parts/DeliveryProofSection';
import { StopLocationCard } from '@/features/driver/job-card/parts/StopLocationCard';
import { StopDeliveryInfo } from '@/features/driver/job-card/parts/StopDeliveryInfo';
import { cardBackground, JOB_CARD_RADIUS, softElevation } from '@/features/driver/job-card/parts/jobCardSurface';
import { StopOrderList } from '@/features/driver/job-card/parts/StopOrderList';
import { StopVerificationActionBar } from '@/features/driver/job-card/parts/StopVerificationActionBar';
import { StopVerificationHeader } from '@/features/driver/job-card/parts/StopVerificationHeader';
import { stopVerificationTotals } from '@/features/driver/job-card/stopVerificationSummary';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  stop: DriverStopExecutionStop;
  orders: readonly DriverTripStopOrder[];
  stopIndex: number;
  stopTotal: number;
  ordersLoading: boolean;
  loadError: string | null;
  busy: boolean;
  confirmed: boolean;
  review?: boolean;
  nextStop: DriverStopExecutionStop | null;
  onBack: () => void;
  onConfirm: (proof: DeliveryProofDraft) => void;
  onViewNextStop: () => void;
  onPreviousStop?: (() => void) | null;
  onNextStop?: (() => void) | null;
  onRetryOrders?: (() => void) | null;
  retryingOrders?: boolean;
};

export function DriverStopVerificationScreen({
  stop,
  orders,
  stopIndex,
  stopTotal,
  ordersLoading,
  loadError,
  busy,
  confirmed,
  review = false,
  nextStop,
  onBack,
  onConfirm,
  onViewNextStop,
  onPreviousStop,
  onNextStop,
  onRetryOrders = null,
  retryingOrders = false,
}: Props) {
  const colors = useDriverThemeColors();
  const insets = useSafeAreaInsets();
  const delivery = isDeliveryStop(String(stop.stopType));
  const role = stopRoleLabel(String(stop.stopType));
  const totals = stopVerificationTotals(orders);
  const customer =
    orders.map((o) => o.customerName?.trim()).find((n) => n) ?? stop.contactName;
  const confirmCta = delivery ? 'Confirm delivery' : 'Confirm pickup';
  const footerPad =
    Math.max(insets.bottom, 10) + (Platform.OS === 'web' ? Layout.tabBarDockHeight + 8 : 8);
  const [proof, setProof] = useState(emptyDeliveryProof);
  useEffect(() => {
    setProof(emptyDeliveryProof());
  }, [stop.stopId]);
  const needsProof = !review && !confirmed && stop.podRequired;
  const proofReady = !needsProof || canSubmitDeliveryProof(proof);
  const ordersReady = !loadError && !(ordersLoading && orders.length === 0);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onBack}
    >
      <View
        testID="driver-stop-verification"
        style={[styles.page, { backgroundColor: colors.surface, paddingTop: insets.top }]}
      >
        <StopVerificationHeader
          colors={colors}
          role={role}
          stopIndex={stopIndex}
          stopTotal={stopTotal}
          review={review}
          onBack={onBack}
          onPrevious={onPreviousStop}
          onNext={onNextStop}
        />
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <StopLocationCard colors={colors} stop={stop} customerName={customer} orders={orders} />
          <StopDeliveryInfo colors={colors} orders={orders} delivery={delivery} />

          {loadError ? (
            <View style={[styles.card, styles.loadError, softElevation, { backgroundColor: cardBackground(colors) }]}>
              <Text style={[styles.error, { color: Theme.negative }]} accessibilityRole="alert">
                Could not load orders for this stop.
              </Text>
              <Text style={[styles.muted, { color: colors.textMuted }]}>
                {delivery ? 'Confirm delivery' : 'Confirm pickup'} is unavailable until the orders load.
              </Text>
              {onRetryOrders ? (
                <Pressable
                  onPress={onRetryOrders}
                  disabled={retryingOrders}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading orders"
                  accessibilityState={{ disabled: retryingOrders, busy: retryingOrders }}
                  hitSlop={Layout.touchTargetHitSlop}
                  style={({ pressed }) => [
                    styles.retry,
                    {
                      backgroundColor: colors.emeraldMuted,
                      opacity: retryingOrders ? 0.55 : pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.retryText, { color: colors.emerald }]}>
                    {retryingOrders ? 'Retrying…' : 'Retry'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {ordersLoading && orders.length === 0 ? (
            <Text style={[styles.muted, { color: colors.textMuted }]}>Loading orders…</Text>
          ) : null}

          <StopOrderList colors={colors} orders={orders} delivery={delivery} />
          <View style={[styles.card, softElevation, { backgroundColor: cardBackground(colors) }]}>
            <DeliveryProofSection
              colors={colors}
              kind={delivery ? 'delivery' : 'pickup'}
              draft={proof}
              readOnly={review || confirmed}
              required={stop.podRequired}
              onChange={setProof}
            />
          </View>
          <DeliveryCompletionSummary colors={colors} delivery={delivery} totals={totals} />

          {confirmed ? (
            <View
              style={[styles.card, styles.done, softElevation, { backgroundColor: cardBackground(colors) }]}
              testID="stop-verification-done"
            >
              <Text style={[styles.doneTitle, { color: colors.emerald }]}>Completed</Text>
              <Text style={[styles.muted, { color: colors.textMuted }]}>
                Stop {stopIndex} of {stopTotal}
              </Text>
              {nextStop ? (
                <>
                  <Text style={[styles.nextKicker, { color: colors.textMuted }]}>Next stop</Text>
                  <Text style={[styles.nextPlace, { color: colors.text }]} numberOfLines={1}>
                    {formatStopPlace(nextStop)}
                  </Text>
                  <Text style={[styles.muted, { color: colors.textMuted }]}>
                    {stopRoleLabel(String(nextStop.stopType))}
                  </Text>
                </>
              ) : (
                <Text style={[styles.muted, { color: colors.textMuted }]}>No further stops.</Text>
              )}
            </View>
          ) : null}
        </ScrollView>

        {review && !confirmed ? null : confirmed ? (
          <StopVerificationActionBar
            colors={colors}
            cta={nextStop && !review ? 'View next stop' : 'Back to route'}
            busy={false}
            bottomInset={footerPad}
            onPress={onViewNextStop}
          />
        ) : (
          <StopVerificationActionBar
            colors={colors}
            cta={confirmCta}
            busy={busy}
            disabled={!ordersReady || !proofReady}
            bottomInset={footerPad}
            onPress={() => onConfirm(proof)}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    width: '100%',
    ...(Platform.OS === 'web' ? { minHeight: '100vh' as unknown as number } : null),
  },
  scroll: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 14,
  },
  card: {
    borderRadius: JOB_CARD_RADIUS,
    padding: 16,
  },
  muted: {
    fontSize: 12,
    fontWeight: '500',
  },
  error: {
    fontSize: 12,
    fontWeight: '600',
  },
  loadError: { gap: 6 },
  retry: {
    alignSelf: 'flex-start',
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '800',
  },
  done: { gap: 2 },
  doneTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  nextKicker: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  nextPlace: {
    fontSize: 14,
    fontWeight: '700',
  },
});
