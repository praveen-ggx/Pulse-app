import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MapPin, Package, Phone, Warehouse } from 'lucide-react-native';
import Layout from '@/constants/Layout';
import { getDriverThemeColors } from '@/contexts/DriverThemeContext';
import { formatStopAddress } from '@/features/driver/commerce-mission/driverCommerceMissionLabels';
import type { DriverTripStopOrder } from '@/features/driver/commerce-mission/driverTripStopOrders.types';
import type { DriverStopExecutionStop } from '@/features/driver/execution/driverStopExecution.types';
import {
  callActionLabel,
  formatStopPlace,
  isDeliveryStop,
} from '@/features/driver/job-card/multiOrderStopCopy';
import {
  cardBackground,
  JOB_CARD_RADIUS,
  softElevation,
  type StatusTone,
} from '@/features/driver/job-card/parts/jobCardSurface';
import { StatusPill } from '@/features/driver/job-card/parts/StatusPill';

type Colors = ReturnType<typeof getDriverThemeColors>;

type Props = {
  colors: Colors;
  stop: DriverStopExecutionStop;
  customerName: string | null;
  orders?: readonly DriverTripStopOrder[];
};

export function stopStatusPill(stop: DriverStopExecutionStop): { tone: StatusTone; label: string } {
  switch (stop.status) {
    case 'completed':
      return { tone: 'done', label: isDeliveryStop(String(stop.stopType)) ? 'Delivered' : 'Picked up' };
    case 'arrived':
      return { tone: 'active', label: 'Arrived' };
    case 'failed':
      return { tone: 'failed', label: 'Failed' };
    case 'skipped':
      return { tone: 'pending', label: 'Skipped' };
    default:
      return { tone: 'pending', label: 'Pending' };
  }
}

export function StopLocationCard({ colors, stop, customerName, orders = [] }: Props) {
  const address = formatStopAddress(stop) || stop.city;
  const delivery = isDeliveryStop(String(stop.stopType));
  const phone =
    stop.contactPhone?.trim()
    || orders.find((o) => o.customerPhone?.trim())?.customerPhone?.trim()
    || null;
  const orderNumbers = orders
    .map((o) => (o.orderNumber?.trim() ? `#${o.orderNumber.trim()}` : null))
    .filter(Boolean)
    .join(', ');
  const pill = stopStatusPill(stop);
  const Icon = delivery ? Package : Warehouse;
  const callLabel = callActionLabel(String(stop.stopType));

  return (
    <View
      testID="stop-verification-location"
      style={[styles.card, softElevation, { backgroundColor: cardBackground(colors) }]}
    >
      <View style={[styles.tile, { backgroundColor: colors.emeraldMuted }]}>
        <Icon size={18} color={colors.emerald} strokeWidth={2.1} />
      </View>
      <View style={styles.copy}>
        {orderNumbers ? (
          <Text style={[styles.orders, { color: colors.text }]} numberOfLines={1}>
            {orderNumbers}
          </Text>
        ) : null}
        <StatusPill colors={colors} tone={pill.tone} label={pill.label} />
        <Text style={[styles.place, { color: colors.text }]} numberOfLines={2}>
          {formatStopPlace(stop)}
        </Text>
        {customerName ? (
          <Text style={[styles.customer, { color: colors.text }]} numberOfLines={1}>
            {customerName}
          </Text>
        ) : null}
        {address ? (
          <View style={styles.addrRow}>
            <MapPin size={12} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.addr, { color: colors.textMuted }]} numberOfLines={3}>
              {address}
            </Text>
          </View>
        ) : null}
        {phone ? (
          <Text style={[styles.phone, { color: colors.textMuted }]} numberOfLines={1}>
            {phone}
          </Text>
        ) : null}
      </View>
      {phone ? (
        <Pressable
          onPress={() => void Linking.openURL(`tel:${phone}`)}
          accessibilityRole="button"
          accessibilityLabel={callLabel}
          hitSlop={Layout.touchTargetHitSlop}
          style={({ pressed }) => [
            styles.call,
            { backgroundColor: colors.emeraldMuted, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Phone size={18} color={colors.emerald} strokeWidth={2.3} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: JOB_CARD_RADIUS,
    padding: 12,
    gap: 10,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  orders: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  place: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 20,
    marginTop: 1,
  },
  customer: {
    fontSize: 12,
    fontWeight: '600',
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  addr: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  phone: {
    fontSize: 12,
    fontWeight: '600',
  },
  call: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
