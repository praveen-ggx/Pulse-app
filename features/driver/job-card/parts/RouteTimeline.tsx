import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { getDriverThemeColors } from '@/contexts/DriverThemeContext';
import {
  cardBackground,
  JOB_CARD_RADIUS,
  softElevation,
  type StatusTone,
} from '@/features/driver/job-card/parts/jobCardSurface';
import { StatusPill } from '@/features/driver/job-card/parts/StatusPill';
import {
  StopOrderSummary,
  type StopOrderSummaryOrder,
} from '@/features/driver/job-card/parts/StopOrderSummary';

type Colors = ReturnType<typeof getDriverThemeColors>;

export type RouteTimelineProgress = 'done' | 'current' | 'upcoming' | 'failed';

export type RouteTimelineStop = {
  id: string;
  sequence: number;
  typeLabel: string;
  location: string;
  statusLabel: string;
  statusTone: StatusTone;
  progress: RouteTimelineProgress;
  /** Server-recorded arrival/completion time, already formatted. */
  timeLabel: string | null;
  isCurrent: boolean;
  orderCount: number;
  productCount: number;
  orders: readonly StopOrderSummaryOrder[];
};

type Props = {
  colors: Colors;
  stops: readonly RouteTimelineStop[];
  onOpenStop?: (stopId: string) => void;
  onViewAll?: () => void;
};

function countLine(orderCount: number, productCount: number): string {
  const orders = `${orderCount} ${orderCount === 1 ? 'order' : 'orders'}`;
  const products = `${productCount} ${productCount === 1 ? 'product' : 'products'}`;
  return `${orders} · ${products}`;
}

function orderBrief(orders: readonly StopOrderSummaryOrder[]): string {
  return orders
    .map((order) => (order.orderNumber?.trim() ? `#${order.orderNumber.trim()}` : order.id))
    .join(', ');
}

function Marker({ colors, progress }: { colors: Colors; progress: RouteTimelineProgress }) {
  if (progress === 'done') {
    return (
      <View
        testID="commerce-timeline-marker-done"
        style={[styles.marker, { backgroundColor: colors.emerald, borderColor: colors.emerald }]}
      >
        <Check size={10} color={colors.textOnPrimary} strokeWidth={3} />
      </View>
    );
  }
  if (progress === 'current') {
    return (
      <View
        testID="commerce-timeline-marker-current"
        style={[styles.marker, { borderColor: colors.emerald, backgroundColor: colors.surface }]}
      >
        <View style={[styles.markerDot, { backgroundColor: colors.emerald }]} />
      </View>
    );
  }
  return (
    <View
      testID={`commerce-timeline-marker-${progress}`}
      style={[
        styles.marker,
        {
          borderColor: progress === 'failed' ? Theme.negative : colors.borderLight,
          backgroundColor: colors.surface,
        },
      ]}
    />
  );
}

/**
 * Stop-first route. Expansion is local state over the already-loaded
 * Primitive A payload: toggling a stop or an order never reads the network.
 */
export function RouteTimeline({ colors, stops, onOpenStop, onViewAll }: Props) {
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  if (stops.length === 0) return null;

  return (
    <View
      testID="commerce-route-timeline"
      style={[styles.card, softElevation, { backgroundColor: cardBackground(colors) }]}
    >
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text }]}>Delivery progress</Text>
        {onViewAll ? (
          <Pressable
            onPress={onViewAll}
            accessibilityRole="button"
            accessibilityLabel="View all delivery details"
            hitSlop={Layout.touchTargetHitSlop}
            style={styles.viewAll}
          >
            <Text style={[styles.viewAllText, { color: colors.emerald }]}>View all</Text>
          </Pressable>
        ) : null}
      </View>

      {stops.map((stop, index) => {
        const current = stop.isCurrent;
        const expanded = toggled[stop.id] ?? current;
        const last = index === stops.length - 1;
        const hasOrders = stop.orders.length > 0;
        const Chevron = expanded ? ChevronUp : ChevronDown;
        const muted = stop.progress === 'upcoming';
        return (
          <View key={stop.id} testID={`commerce-timeline-stop-${stop.id}`} style={styles.row}>
            <View style={styles.rail}>
              <Marker colors={colors} progress={stop.progress} />
              {!last ? (
                <View
                  style={[
                    styles.connector,
                    { backgroundColor: stop.progress === 'done' ? colors.emerald : colors.border },
                  ]}
                />
              ) : null}
            </View>
            <View
              style={[
                styles.body,
                current ? styles.bodyCurrent : null,
                last ? null : styles.bodySpaced,
              ]}
            >
              <View style={styles.head}>
                <Pressable
                  testID={`commerce-timeline-toggle-${stop.id}`}
                  onPress={() => setToggled((prev) => ({ ...prev, [stop.id]: !expanded }))}
                  disabled={!hasOrders}
                  accessibilityRole="button"
                  accessibilityLabel={`Stop ${stop.sequence}, ${stop.location}`}
                  accessibilityState={{ expanded: hasOrders ? expanded : undefined }}
                  hitSlop={Layout.touchTargetHitSlop}
                  style={styles.headMain}
                >
                  <Text
                    style={[
                      styles.location,
                      current ? styles.locationCurrent : null,
                      { color: muted ? colors.textMuted : colors.text },
                    ]}
                    numberOfLines={2}
                  >
                    {stop.location}
                  </Text>
                  <Text style={[styles.role, { color: colors.textMuted }]} numberOfLines={1}>
                    {`${stop.sequence} · ${stop.typeLabel}`}
                  </Text>
                  <Text style={[styles.counts, { color: colors.textMuted }]}>
                    {countLine(stop.orderCount, stop.productCount)}
                  </Text>
                  {!expanded && hasOrders ? (
                    <Text
                      testID={`commerce-timeline-brief-${stop.id}`}
                      style={[styles.brief, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {orderBrief(stop.orders)}
                    </Text>
                  ) : null}
                </Pressable>
                <View style={styles.headSide}>
                  <StatusPill colors={colors} tone={stop.statusTone} label={stop.statusLabel} />
                  {stop.timeLabel ? (
                    <Text style={[styles.time, { color: colors.textMuted }]}>{stop.timeLabel}</Text>
                  ) : null}
                  <View style={styles.sideActions}>
                    {onOpenStop ? (
                      <Pressable
                        onPress={() => onOpenStop(stop.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${stop.location} details`}
                        hitSlop={Layout.touchTargetHitSlop}
                        style={styles.detailsLink}
                      >
                        <Text style={[styles.detailsText, { color: colors.emerald }]}>Details</Text>
                      </Pressable>
                    ) : null}
                    {hasOrders ? <Chevron size={16} color={colors.textMuted} strokeWidth={2.4} /> : null}
                  </View>
                </View>
              </View>
              {expanded && hasOrders ? (
                <View
                  testID={`commerce-timeline-orders-${stop.id}`}
                  style={[styles.orders, { borderTopColor: colors.border }]}
                >
                  {stop.orders.map((order) => (
                    <StopOrderSummary key={order.id} colors={colors} order={order} />
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const MARKER = 16;

const styles = StyleSheet.create({
  card: {
    borderRadius: JOB_CARD_RADIUS,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  viewAll: {
    minHeight: 28,
    justifyContent: 'center',
  },
  viewAllText: {
    fontSize: 11,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  rail: {
    width: MARKER,
    alignItems: 'center',
    paddingTop: 10,
  },
  marker: {
    width: MARKER,
    height: MARKER,
    borderRadius: MARKER / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connector: {
    flex: 1,
    width: 2,
    marginVertical: 2,
    borderRadius: 1,
  },
  body: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bodyCurrent: {
    paddingVertical: 4,
  },
  bodySpaced: {
    marginBottom: 4,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  headMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  headSide: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  sideActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  location: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  locationCurrent: {
    fontSize: 13,
    fontWeight: '700',
  },
  role: {
    fontSize: 10,
    fontWeight: '600',
  },
  counts: {
    fontSize: 10,
    fontWeight: '500',
  },
  brief: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  time: {
    fontSize: 10,
    fontWeight: '600',
  },
  detailsLink: {
    minHeight: 24,
    justifyContent: 'center',
  },
  detailsText: {
    fontSize: 11,
    fontWeight: '700',
  },
  orders: {
    marginTop: 8,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
