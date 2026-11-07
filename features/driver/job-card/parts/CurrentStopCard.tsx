import type { ReactNode } from 'react';
import Layout from '@/constants/Layout';
import { getDriverThemeColors } from '@/contexts/DriverThemeContext';
import { formatStopAddress } from '@/features/driver/commerce-mission/driverCommerceMissionLabels';
import type { DriverTripStopOrder } from '@/features/driver/commerce-mission/driverTripStopOrders.types';
import type { DriverStopExecutionStop } from '@/features/driver/execution/driverStopExecution.types';
import {
  callActionLabel,
  formatStopKm,
  formatStopPlace,
  isDeliveryStop,
  stopRoleLabel,
} from '@/features/driver/job-card/multiOrderStopCopy';
import { orderExpectedQty } from '@/features/driver/job-card/stopVerificationSummary';
import { cardBackground, JOB_CARD_RADIUS, softElevation } from '@/features/driver/job-card/parts/jobCardSurface';
import { StatusPill } from '@/features/driver/job-card/parts/StatusPill';
import {
  Camera,
  ChevronRight,
  FileText,
  Navigation,
  Package,
  Phone,
  Receipt,
  Warehouse,
} from 'lucide-react-native';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

type Colors = ReturnType<typeof getDriverThemeColors>;

type Props = {
  colors: Colors;
  stop: DriverStopExecutionStop;
  orders: DriverTripStopOrder[];
  ordersLoading: boolean;
  distanceKm: number | null | undefined;
  onOpenDetails?: () => void;
  onNavigate?: (() => void) | null;
  onProof?: (() => void) | null;
  onExpense?: (() => void) | null;
  children?: ReactNode;
};

function ActionButton({
  colors,
  label,
  accessibilityLabel,
  icon,
  onPress,
}: {
  colors: Colors;
  label: string;
  accessibilityLabel?: string;
  icon: ReactNode;
  onPress: (() => void) | null | undefined;
}) {
  const disabled = !onPress;
  return (
    <Pressable
      onPress={onPress ?? undefined}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      hitSlop={Layout.touchTargetHitSlop}
      style={({ pressed }) => [styles.action, { opacity: disabled ? 0.38 : pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.actionIcon, { backgroundColor: colors.emeraldMuted }]}>{icon}</View>
      <Text style={[styles.actionLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function CurrentStopCard({
  colors,
  stop,
  orders,
  ordersLoading,
  distanceKm,
  onOpenDetails,
  onNavigate = null,
  onProof = null,
  onExpense = null,
  children,
}: Props) {
  const place = formatStopPlace(stop);
  const address = formatStopAddress(stop);
  const role = stopRoleLabel(String(stop.stopType));
  const delivery = isDeliveryStop(String(stop.stopType));
  const customers = [...new Set(orders.map((o) => o.customerName?.trim()).filter(Boolean))] as string[];
  const phone =
    stop.contactPhone?.trim()
    || orders.find((o) => o.customerPhone?.trim())?.customerPhone?.trim()
    || null;
  const km = formatStopKm(distanceKm ?? undefined);
  const arrived = stop.status === 'arrived';
  const orderNumbers = orders
    .map((o) => (o.orderNumber?.trim() ? `#${o.orderNumber.trim()}` : null))
    .filter(Boolean)
    .join(', ');
  const items = orders.reduce((sum, o) => sum + (orderExpectedQty(o) ?? 0), 0);
  const ordersLine = orders.length > 0
    ? `${orders.length} ${orders.length === 1 ? 'order' : 'orders'}${items > 0 ? ` · ${items} ${items === 1 ? 'item' : 'items'}` : ''}`
    : null;
  const StopIcon = delivery ? Package : Warehouse;
  const callLabel = callActionLabel(String(stop.stopType));

  return (
    <View
      testID="multi-order-current-stop"
      style={[styles.card, softElevation, { backgroundColor: cardBackground(colors) }]}
    >
      <View style={styles.summary}>
        <Pressable
          onPress={onOpenDetails}
          disabled={!onOpenDetails}
          accessibilityRole="button"
          accessibilityLabel={`${role} details, ${place}`}
          style={styles.summaryMain}
        >
          <View style={[styles.tile, { backgroundColor: colors.emeraldMuted }]}>
            <StopIcon size={16} color={colors.emerald} strokeWidth={2.2} />
          </View>
          <View style={styles.copy}>
            <View style={styles.metaRow}>
              <Text style={[styles.role, { color: colors.emerald }]}>{role}</Text>
              <StatusPill
                colors={colors}
                tone={arrived ? 'active' : 'next'}
                label={arrived ? 'Arrived' : delivery ? 'Out for delivery' : 'Heading to pickup'}
              />
              {onOpenDetails ? <ChevronRight size={14} color={colors.textMuted} strokeWidth={2.2} /> : null}
            </View>
            <Text style={[styles.place, { color: colors.text }]} numberOfLines={1}>
              {place}
            </Text>
            {customers[0] ? (
              <Text style={[styles.customer, { color: colors.text }]} numberOfLines={1}>
                {customers.length > 1 ? `${customers[0]} +${customers.length - 1}` : customers[0]}
              </Text>
            ) : null}
            {address || stop.city ? (
              <Text style={[styles.addr, { color: colors.textMuted }]} numberOfLines={2}>
                {address || stop.city}
              </Text>
            ) : null}
            {ordersLine || km || ordersLoading ? (
              <Text
                testID="multi-order-stop-orders"
                style={[styles.ordersLine, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {ordersLine ?? (ordersLoading ? 'Loading orders…' : '')}
                {orderNumbers ? ` ${orderNumbers}` : ''}
                {km ? ` · ${km}` : ''}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {onExpense ? (
          <Pressable
            onPress={onExpense}
            accessibilityRole="button"
            accessibilityLabel="Add trip expense"
            hitSlop={Layout.touchTargetHitSlop}
            style={[styles.expenseHit, { backgroundColor: colors.emeraldMuted }]}
          >
            <Receipt size={13} color={colors.emerald} strokeWidth={2.3} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actions}>
        <ActionButton
          colors={colors}
          label="Call"
          accessibilityLabel={phone ? callLabel : `${callLabel} unavailable`}
          icon={<Phone size={15} color={colors.emerald} strokeWidth={2.1} />}
          onPress={phone ? () => void Linking.openURL(`tel:${phone}`) : null}
        />
        <ActionButton
          colors={colors}
          label="Navigate"
          accessibilityLabel={`Navigate to ${place}`}
          icon={<Navigation size={15} color={colors.emerald} strokeWidth={2.1} />}
          onPress={onNavigate}
        />
        <ActionButton
          colors={colors}
          label="Proof"
          accessibilityLabel={delivery ? 'Proof of delivery' : 'Proof of pickup'}
          icon={<Camera size={15} color={colors.emerald} strokeWidth={2.1} />}
          onPress={onProof}
        />
        <ActionButton
          colors={colors}
          label="Details"
          accessibilityLabel={`${role} order details`}
          icon={<FileText size={15} color={colors.emerald} strokeWidth={2.1} />}
          onPress={onOpenDetails}
        />
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: JOB_CARD_RADIUS,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  summaryMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  expenseHit: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  tile: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  role: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  place: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  customer: {
    fontSize: 13,
    fontWeight: '600',
  },
  addr: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
  },
  ordersLine: {
    fontSize: 10,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  action: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    minHeight: Layout.minTouchTargetSize,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
});
