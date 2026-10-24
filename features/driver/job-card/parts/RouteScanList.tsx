import Layout from '@/constants/Layout';
import { getDriverThemeColors } from '@/contexts/DriverThemeContext';
import type { DriverStopExecutionStop } from '@/features/driver/execution/driverStopExecution.types';
import type { DriverTripStopOrderMission } from '@/features/driver/commerce-mission/driverTripStopOrders.types';
import { ordersOnStop } from '@/features/driver/job-card/attachOrdersToStop';
import { formatStopPlace, stopRoleLabel } from '@/features/driver/job-card/multiOrderStopCopy';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Colors = ReturnType<typeof getDriverThemeColors>;
type Tone = 'done' | 'current' | 'upcoming';

type Props = {
  colors: Colors;
  previous: readonly DriverStopExecutionStop[];
  current: DriverStopExecutionStop | null;
  next: DriverStopExecutionStop | null;
  later: readonly DriverStopExecutionStop[];
  mission: DriverTripStopOrderMission | null;
  onOpenStop?: (stop: DriverStopExecutionStop) => void;
};

function line(
  stop: DriverStopExecutionStop,
  mission: DriverTripStopOrderMission | null,
): string {
  const n = ordersOnStop(mission, stop.stopId).length;
  const role = stopRoleLabel(String(stop.stopType));
  return n > 0 ? `${role} · ${n} ${n === 1 ? 'order' : 'orders'}` : role;
}

function Card({
  colors,
  kicker,
  tone,
  stop,
  mission,
  onOpenStop,
}: {
  colors: Colors;
  kicker: string;
  tone: Tone;
  stop: DriverStopExecutionStop;
  mission: DriverTripStopOrderMission | null;
  onOpenStop?: (stop: DriverStopExecutionStop) => void;
}) {
  const place = formatStopPlace(stop);
  const current = tone === 'current';
  const done = tone === 'done';
  const content = (
    <>
      <Text
        style={[
          styles.kicker,
          { color: current ? colors.emerald : colors.textMuted },
        ]}
      >
        {kicker}
      </Text>
      <Text
        style={[styles.name, { color: done ? colors.textMuted : colors.text }]}
        numberOfLines={1}
      >
        {place}
      </Text>
      <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
        {line(stop, mission)}
      </Text>
    </>
  );
  const cardStyle = [
    styles.card,
    {
      backgroundColor: current ? colors.emeraldMuted : colors.surfaceElevated,
      borderColor: current ? colors.emeraldBorder : colors.border,
    },
  ];
  if (!onOpenStop) {
    return <View style={cardStyle}>{content}</View>;
  }
  return (
    <Pressable
      onPress={() => onOpenStop(stop)}
      accessibilityRole="button"
      accessibilityLabel={`View ${place} details`}
      hitSlop={Layout.touchTargetHitSlop}
      style={cardStyle}
    >
      {content}
    </Pressable>
  );
}

export function RouteScanList({
  colors,
  previous,
  current,
  next,
  later,
  mission,
  onOpenStop,
}: Props) {
  if (!current && !next && later.length === 0 && previous.length === 0) return null;

  return (
    <ScrollView
      testID="multi-order-route-scan"
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      {previous.map((stop) => (
        <Card
          key={stop.stopId}
          colors={colors}
          kicker="Done"
          tone="done"
          stop={stop}
          mission={mission}
          onOpenStop={onOpenStop}
        />
      ))}
      {current ? (
        <Card
          colors={colors}
          kicker="Current"
          tone="current"
          stop={current}
          mission={mission}
          onOpenStop={onOpenStop}
        />
      ) : null}
      {next ? (
        <Card
          colors={colors}
          kicker="Next"
          tone="upcoming"
          stop={next}
          mission={mission}
          onOpenStop={onOpenStop}
        />
      ) : null}
      {later.map((stop) => (
        <Card
          key={stop.stopId}
          colors={colors}
          kicker="Later"
          tone="upcoming"
          stop={stop}
          mission={mission}
          onOpenStop={onOpenStop}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: {
    gap: 6,
    paddingTop: 4,
    paddingBottom: 2,
    paddingRight: 4,
    alignItems: 'stretch',
  },
  card: {
    width: 132,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
    justifyContent: 'flex-start',
  },
  kicker: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  name: {
    alignSelf: 'stretch',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  meta: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
});
