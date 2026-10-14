import Theme from '@/constants/Theme';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  kind: 'pickup' | 'drop' | 'other';
  index: number;
  caption?: string;
  /** "+N next · Drop 2" hint for stacked stops. Not drawn yet. */
  nextLabel?: string | null;
  /** Pickup/drop numbers stacked under this pin. Not drawn yet. */
  badges?: ReadonlyArray<{ kind: 'pickup' | 'drop' | 'other'; index: number }>;
  emphasized?: boolean;
};

export function RoutePlanMapPin({ kind, index, caption, emphasized }: Props) {
  const drop = kind === 'drop';
  const n = Number.isFinite(index) && index > 0 ? Math.min(99, Math.floor(index)) : 1;
  const label = caption ?? (drop ? `Drop ${n}` : kind === 'pickup' ? `Pickup ${n}` : `Stop ${n}`);

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View
        style={[
          styles.chip,
          drop ? styles.chipDrop : styles.chipPickup,
          emphasized ? (drop ? styles.chipDropActive : styles.chipPickupActive) : null,
        ]}
      >
        <Text
          style={[styles.chipText, drop ? styles.chipTextDrop : styles.chipTextPickup]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <View style={styles.pin}>
        <View
          style={[
            styles.head,
            { backgroundColor: drop ? Theme.driverGold : Theme.driverEmerald },
            emphasized && styles.headActive,
          ]}
        >
          <Text style={styles.num}>{n}</Text>
        </View>
        <View
          style={[
            styles.tail,
            { borderTopColor: drop ? Theme.driverGold : Theme.driverEmerald },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 4,
  },
  chip: {
    maxWidth: 108,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: Theme.surfaceLight,
  },
  chipPickup: {
    borderColor: Theme.driverEmeraldBorder,
  },
  chipDrop: {
    borderColor: Theme.driverGold,
  },
  chipPickupActive: {
    borderColor: Theme.driverEmerald,
  },
  chipDropActive: {
    borderColor: Theme.driverGold,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  chipTextPickup: {
    color: Theme.driverEmerald,
  },
  chipTextDrop: {
    color: Theme.driverGold,
  },
  pin: {
    alignItems: 'center',
  },
  head: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headActive: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  num: {
    color: Theme.screenBackground,
    fontSize: 12,
    fontWeight: '800',
  },
  tail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
